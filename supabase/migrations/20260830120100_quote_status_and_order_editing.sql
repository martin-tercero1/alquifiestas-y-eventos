-- =============================================================================
-- Cotización (quote) status + editable confirmed orders
-- =============================================================================
-- A quote does not reserve inventory, so every occupancy computation must ignore
-- it exactly as it ignores a cancelled order. Confirming a quote turns it into a
-- reserving order; editing is opened up to quotes and confirmed orders so the
-- common "already paid, now needs changes" case can be handled in place.

-- ---------------------------------------------------------------------------
-- 1. Availability engine — quotes never occupy stock
-- ---------------------------------------------------------------------------
create or replace function public.availability_for_variants(
  p_variant_ids uuid[], p_start date, p_end date
)
returns table(variant_id uuid, total_quantity integer, peak_occupied integer,
              available integer, is_unknown boolean)
language sql
stable security definer
set search_path to 'public'
as $function$
  with days as (
    select d::date as day
    from generate_series(p_start, p_end, interval '1 day') d
  ),
  relevant_lines as (
    select
      ol.id,
      ol.variant_id,
      ol.quantity,
      o.pickup_date,
      greatest(
        o.pickup_date,
        order_occupancy_end(o.actual_return_date, o.agreed_return_date) - 1
      ) as ends_on
    from order_lines ol
    join orders o on o.id = ol.order_id
    where ol.variant_id = any(p_variant_ids)
      and o.status not in ('cancelled', 'quote')
      and o.pickup_date <= p_end
      and greatest(
            o.pickup_date,
            order_occupancy_end(o.actual_return_date, o.agreed_return_date) - 1
          ) >= p_start
  ),
  daily as (
    select
      rl.variant_id,
      d.day,
      sum(greatest(rl.quantity - coalesce(released.units, 0), 0)) as occupied
    from relevant_lines rl
    cross join days d
    left join lateral (
      select sum(
               re.quantity_returned
               - re.quantity_missing
               - re.quantity_damaged
               + re.quantity_written_off
             ) as units
      from return_events re
      where re.order_line_id = rl.id
        and re.returned_on <= d.day
    ) released on true
    where d.day between rl.pickup_date and rl.ends_on
    group by rl.variant_id, d.day
  ),
  peak as (
    select daily.variant_id, max(daily.occupied)::int as peak_occupied
    from daily group by daily.variant_id
  )
  select
    v.id,
    v.total_quantity,
    coalesce(peak.peak_occupied, 0),
    case when v.total_quantity is null
         then null
         else greatest(v.total_quantity - coalesce(peak.peak_occupied, 0), 0)
    end,
    v.total_quantity is null
  from variants v
  left join peak on peak.variant_id = v.id
  where v.id = any(p_variant_ids);
$function$;

create or replace function public.availability_conflicts(
  p_variant_id uuid, p_start date, p_end date
)
returns table(order_id uuid, order_number bigint, customer_name text,
              status order_status, pickup_date date, occupancy_ends date,
              quantity integer, is_overdue boolean)
language sql
stable
as $function$
  select
    o.id,
    o.number,
    c.name,
    o.status,
    o.pickup_date,
    order_occupancy_end(o.actual_return_date, o.agreed_return_date),
    ol.quantity,
    o.actual_return_date is null and o.agreed_return_date < current_date
  from order_lines ol
  join orders o    on o.id = ol.order_id
  join customers c on c.id = o.customer_id
  where ol.variant_id = p_variant_id
    and o.status not in ('cancelled', 'quote')
    and o.pickup_date <= p_end
    and order_occupancy_end(o.actual_return_date, o.agreed_return_date) >= p_start
  order by o.pickup_date;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Status transitions — a quote becomes confirmed or is cancelled
-- ---------------------------------------------------------------------------
create or replace function public.validate_status_transition()
returns trigger
language plpgsql
as $function$
declare
  allowed order_status[];
begin
  if new.status = old.status then
    return new;
  end if;

  allowed := case old.status
    when 'quote'              then array['confirmed', 'cancelled']::order_status[]
    when 'pending_request'    then array['confirmed', 'cancelled']::order_status[]
    when 'confirmed'          then array['picked_up', 'cancelled']::order_status[]
    when 'picked_up'          then array['partially_returned', 'returned']::order_status[]
    when 'partially_returned' then array['returned']::order_status[]
    when 'returned'           then array['closed']::order_status[]
    else array[]::order_status[]
  end;

  if not (new.status = any(allowed)) then
    raise exception 'El pedido % no puede pasar de % a %.', old.number, old.status, new.status
      using errcode = 'check_violation';
  end if;

  insert into order_status_history (order_id, from_status, to_status, changed_by, note)
  values (
    new.id,
    old.status,
    new.status,
    auth.uid(),
    nullif(current_setting('app.status_note', true), '')
  );

  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Confirm — now also promotes a quote, and reports (never blocks on) any
--    shortage created by reserving the stock the quote had left free.
-- ---------------------------------------------------------------------------
create or replace function public.confirm_order(
  p_order_id uuid,
  p_delivery_cost numeric default null,
  p_security_deposit numeric default null,
  p_physical_invoice_number text default null
)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v_status    order_status;
  v_pickup    date;
  v_return    date;
  v_shortages jsonb := '[]'::jsonb;
  rec         record;
begin
  select status, pickup_date, agreed_return_date
    into v_status, v_pickup, v_return
    from orders where id = p_order_id;

  if v_status is null then
    return jsonb_build_object('ok', false, 'error', 'no_encontrado');
  end if;
  if v_status not in ('pending_request', 'quote') then
    return jsonb_build_object('ok', false, 'error', 'no_es_solicitud');
  end if;

  update orders
     set delivery_cost           = coalesce(p_delivery_cost, delivery_cost),
         security_deposit        = coalesce(p_security_deposit, security_deposit),
         physical_invoice_number =
           coalesce(nullif(trim(p_physical_invoice_number), ''), physical_invoice_number),
         status                  = 'confirmed'
   where id = p_order_id;

  -- Reserving the stock may now over-book it — report it, mark the order, but
  -- let the confirmation stand (warn, don't block).
  for rec in
    select
      ol.variant_id,
      ol.quantity as requested,
      a.total_quantity,
      a.peak_occupied,
      a.peak_occupied - a.total_quantity as over_by,
      pr.name as product_name,
      v.label as variant_label
    from order_lines ol
    join variants v on v.id = ol.variant_id
    join products pr on pr.id = v.product_id
    left join lateral availability_for_variant(ol.variant_id, v_pickup, v_return) a on true
    where ol.order_id = p_order_id
      and a.total_quantity is not null
      and a.peak_occupied > a.total_quantity
  loop
    v_shortages := v_shortages || jsonb_build_object(
      'variant_id',     rec.variant_id,
      'product_name',   rec.product_name,
      'variant_label',  rec.variant_label,
      'requested',      rec.requested,
      'total_quantity', rec.total_quantity,
      'peak_occupied',  rec.peak_occupied,
      'over_by',        rec.over_by
    );
  end loop;

  update orders
     set availability_overridden = (jsonb_array_length(v_shortages) > 0)
   where id = p_order_id;

  return jsonb_build_object('ok', true, 'shortages', v_shortages);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Revise lines — allowed while the order is still a quote, a pending
--    request, or confirmed (before it goes out of the warehouse).
-- ---------------------------------------------------------------------------
create or replace function public.revise_order_lines(p_order_id uuid, p_lines jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_status    order_status;
  v_pickup    date;
  v_return    date;
  v_shortages jsonb := '[]'::jsonb;
  v_saved     jsonb := '[]'::jsonb;
  v_updated   uuid;
  line        jsonb;
  rec         record;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'no_autorizado');
  end if;

  select status, pickup_date, agreed_return_date
    into v_status, v_pickup, v_return
    from orders where id = p_order_id;

  if v_status is null then
    return jsonb_build_object('ok', false, 'error', 'no_encontrado');
  end if;
  if v_status not in ('quote', 'pending_request', 'confirmed') then
    return jsonb_build_object('ok', false, 'error', 'no_editable');
  end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    return jsonb_build_object('ok', false, 'error', 'sin_articulos');
  end if;

  delete from order_lines where order_id = p_order_id;

  for line in select * from jsonb_array_elements(p_lines) loop
    insert into order_lines (order_id, variant_id, quantity, unit_price,
                             discount_type, discount_value, option_choice)
    values (
      p_order_id,
      (line->>'variant_id')::uuid,
      greatest(1, (line->>'quantity')::int),
      coalesce((line->>'unit_price')::numeric, 0),
      (line->>'discount_type')::discount_type,
      (line->>'discount_value')::numeric,
      nullif(trim(coalesce(line->>'option_choice', '')), '')
    );

    if coalesce((line->>'save_price_to_catalog')::boolean, false) then
      update variants
         set price_per_day = (line->>'unit_price')::numeric,
             price_source  = 'staff'
       where id = (line->>'variant_id')::uuid
         and (price_per_day is null or price_source in ('recovered', 'estimated'))
      returning id into v_updated;

      if v_updated is not null then
        v_saved := v_saved || to_jsonb(v_updated);
        v_updated := null;
      end if;
    end if;
  end loop;

  -- A quote holds no stock, so its lines can never be "over" anything; the
  -- shortage report only means something once it reserves. Compute it either
  -- way — it is harmless for a quote and correct for a confirmed order.
  for rec in
    select
      ol.variant_id,
      ol.quantity as requested,
      a.total_quantity,
      a.peak_occupied,
      a.peak_occupied - a.total_quantity as over_by,
      pr.name as product_name,
      v.label as variant_label
    from order_lines ol
    join variants v on v.id = ol.variant_id
    join products pr on pr.id = v.product_id
    left join lateral availability_for_variant(ol.variant_id, v_pickup, v_return) a on true
    where ol.order_id = p_order_id
      and a.total_quantity is not null
      and a.peak_occupied > a.total_quantity
  loop
    v_shortages := v_shortages || jsonb_build_object(
      'variant_id',     rec.variant_id,
      'product_name',   rec.product_name,
      'variant_label',  rec.variant_label,
      'requested',      rec.requested,
      'total_quantity', rec.total_quantity,
      'peak_occupied',  rec.peak_occupied,
      'over_by',        rec.over_by
    );
  end loop;

  update orders
     set availability_overridden =
           (v_status <> 'quote' and jsonb_array_length(v_shortages) > 0)
   where id = p_order_id;

  return jsonb_build_object('ok', true, 'shortages', v_shortages, 'prices_saved', v_saved);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Edit an order's dates, times and money terms — same open window as the
--    line editor. Recomputes billed days and the shortage flag from the new
--    dates. Never touches status, so the transition trigger stays out of it.
-- ---------------------------------------------------------------------------
create or replace function public.update_order_details(
  p_order_id uuid,
  p_pickup_date date,
  p_return_date date,
  p_pickup_time time default null,
  p_return_time time default null,
  p_security_deposit numeric default null,
  p_notes text default null,
  p_physical_invoice_number text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_status    order_status;
  v_days      int;
  v_shortages jsonb := '[]'::jsonb;
  rec         record;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'no_autorizado');
  end if;

  select status into v_status from orders where id = p_order_id;
  if v_status is null then
    return jsonb_build_object('ok', false, 'error', 'no_encontrado');
  end if;
  if v_status not in ('quote', 'pending_request', 'confirmed') then
    return jsonb_build_object('ok', false, 'error', 'no_editable');
  end if;
  if p_pickup_date is null or p_return_date is null or p_return_date < p_pickup_date then
    return jsonb_build_object('ok', false, 'error', 'fechas_invalidas');
  end if;

  v_days := greatest(1, (p_return_date - p_pickup_date) + 1);

  update orders
     set pickup_date             = p_pickup_date,
         agreed_return_date      = p_return_date,
         pickup_time             = p_pickup_time,
         agreed_return_time      = p_return_time,
         billed_days             = v_days,
         security_deposit        = p_security_deposit,
         notes                   = nullif(trim(coalesce(p_notes, '')), ''),
         physical_invoice_number =
           nullif(trim(coalesce(p_physical_invoice_number, '')), '')
   where id = p_order_id;

  for rec in
    select ol.variant_id, a.total_quantity, a.peak_occupied
    from order_lines ol
    left join lateral availability_for_variant(ol.variant_id, p_pickup_date, p_return_date) a on true
    where ol.order_id = p_order_id
      and a.total_quantity is not null
      and a.peak_occupied > a.total_quantity
  loop
    v_shortages := v_shortages || jsonb_build_object('variant_id', rec.variant_id);
  end loop;

  update orders
     set availability_overridden =
           (v_status <> 'quote' and jsonb_array_length(v_shortages) > 0)
   where id = p_order_id;

  return jsonb_build_object('ok', true, 'billed_days', v_days);
end;
$function$;

grant execute on function public.update_order_details(
  uuid, date, date, time, time, numeric, text, text
) to authenticated;
