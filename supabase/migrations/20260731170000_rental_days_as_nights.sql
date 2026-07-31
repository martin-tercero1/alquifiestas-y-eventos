-- Rental days measured as nights; the return date is the day it's due back.
--
-- The business rents in 24-hour periods. A "1 día" rental picked up on Aug 1 is
-- due back the morning of Aug 2 — so the AGREED RETURN DATE is now the day the
-- item comes back (Aug 2), not the last day it is out (Aug 1). Occupancy is the
-- nights the item is gone: [pickup_date, return_date - 1], floored at the pickup
-- day so a same-day return still occupies that one day. Billing is the number of
-- nights (minimum 1).
--
-- This frees an item on its return date for a different customer, which matches
-- reality (it's back that morning) and keeps every rental's footprint the same
-- number of calendar days as before — only the return date now reads correctly.
--
-- The "not returned = never available" rule is untouched: order_occupancy_end
-- still yields 'infinity' for an overdue, un-received order, and infinity minus
-- one night is still infinity, so it blocks until receipt is recorded.

-- ── Availability engine: occupy the nights, not the return day ───────────────
create or replace function public.availability_for_variants(
  p_variant_ids uuid[], p_start date, p_end date
)
returns table(variant_id uuid, total_quantity integer, peak_occupied integer,
              available integer, is_unknown boolean)
language sql stable security definer set search_path to 'public'
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
      -- Last night the item is out: the day before it's due back, but never
      -- earlier than the pickup day (a same-day rental occupies that one day).
      greatest(
        o.pickup_date,
        order_occupancy_end(o.actual_return_date, o.agreed_return_date) - 1
      ) as ends_on
    from order_lines ol
    join orders o on o.id = ol.order_id
    where ol.variant_id = any(p_variant_ids)
      and o.status <> 'cancelled'
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

-- ── Staff order creation: nights billing + occupancy window ──────────────────
create or replace function public.create_staff_order(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_customer_id uuid;
  v_order_id    uuid;
  v_order_no    bigint;
  v_pickup      date := (p->>'pickup_date')::date;
  v_return      date := (p->>'agreed_return_date')::date;
  v_occ_end     date;
  v_shortages   jsonb := '[]'::jsonb;
  v_saved       jsonb := '[]'::jsonb;
  rec           record;
  line          jsonb;
  v_updated     uuid;
begin
  if p->'lines' is null or jsonb_array_length(p->'lines') = 0 then
    return jsonb_build_object('ok', false, 'error', 'sin_articulos');
  end if;

  if v_pickup is null or v_return is null or v_return < v_pickup then
    return jsonb_build_object('ok', false, 'error', 'fechas_invalidas');
  end if;

  -- Last night out, for the shortage check below.
  v_occ_end := greatest(v_pickup, v_return - 1);

  v_customer_id := nullif(p->'customer'->>'id', '')::uuid;

  if v_customer_id is null then
    insert into customers (name, phone, cedula)
    values (
      trim(p->'customer'->>'name'),
      nullif(trim(coalesce(p->'customer'->>'phone', '')), ''),
      nullif(trim(coalesce(p->'customer'->>'cedula', '')), '')
    )
    returning id into v_customer_id;
  end if;

  insert into orders (
    customer_id, status, pickup_date, agreed_return_date, billed_days,
    pickup_time, agreed_return_time,
    fulfilment, delivery_address, delivery_cost, payment_method,
    security_deposit, discount_type, discount_value,
    physical_invoice_number, notes, source, override_reason
  ) values (
    v_customer_id,
    coalesce((p->>'status')::order_status, 'confirmed'),
    v_pickup,
    v_return,
    -- Billed nights: the client sends this; the fallback matches (min 1).
    greatest(1, coalesce((p->>'billed_days')::int, (v_return - v_pickup))),
    (p->>'pickup_time')::time,
    (p->>'agreed_return_time')::time,
    coalesce((p->>'fulfilment')::fulfilment_method, 'pickup'),
    nullif(trim(coalesce(p->>'delivery_address', '')), ''),
    (p->>'delivery_cost')::numeric,
    coalesce((p->>'payment_method')::payment_method, 'cash'),
    (p->>'security_deposit')::numeric,
    (p->>'discount_type')::discount_type,
    (p->>'discount_value')::numeric,
    nullif(trim(coalesce(p->>'physical_invoice_number', '')), ''),
    nullif(trim(coalesce(p->>'notes', '')), ''),
    'admin',
    nullif(trim(coalesce(p->>'override_reason', '')), '')
  )
  returning id, number into v_order_id, v_order_no;

  for line in select * from jsonb_array_elements(p->'lines') loop
    insert into order_lines (order_id, variant_id, quantity, unit_price,
                             discount_type, discount_value, option_choice)
    values (
      v_order_id,
      (line->>'variant_id')::uuid,
      greatest(1, (line->>'quantity')::int),
      (line->>'unit_price')::numeric,
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

  for rec in
    select
      ol.variant_id,
      ol.quantity as requested,
      a.total_quantity,
      a.peak_occupied,
      a.peak_occupied - a.total_quantity as over_by,
      pr.name  as product_name,
      v.label  as variant_label
    from order_lines ol
    join variants v on v.id = ol.variant_id
    join products pr on pr.id = v.product_id
    left join lateral availability_for_variant(ol.variant_id, v_pickup, v_occ_end) a on true
    where ol.order_id = v_order_id
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

  if jsonb_array_length(v_shortages) > 0 then
    update orders set availability_overridden = true where id = v_order_id;
  end if;

  insert into order_status_history (order_id, to_status, changed_by, note)
  values (
    v_order_id,
    coalesce((p->>'status')::order_status, 'confirmed'),
    auth.uid(),
    'Proforma creada en el panel'
  );

  return jsonb_build_object(
    'ok', true,
    'order_id', v_order_id,
    'order_number', v_order_no,
    'shortages', v_shortages,
    'prices_saved', v_saved
  );
end;
$function$;

-- ── Public request: N días means the item is due back N days later ───────────
create or replace function public.submit_reservation_request(
  p_customer_name text,
  p_customer_phone text,
  p_pickup_date date,
  p_days integer,
  p_fulfilment fulfilment_method,
  p_payment_method payment_method,
  p_lines jsonb,
  p_delivery_address text default null,
  p_notes text default null,
  p_cedula text default null,
  p_pickup_time time default null
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_return_date date;
  v_occ_end     date;
  v_customer_id uuid;
  v_by_cedula   uuid;
  v_by_phone    uuid;
  v_review      text;
  v_cedula      text := nullif(trim(p_cedula), '');
  v_phone       text := nullif(trim(p_customer_phone), '');
  v_order_id    uuid;
  v_order_no    bigint;
  v_ids         uuid[];
  v_shortages   jsonb := '[]'::jsonb;
  rec           record;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    return jsonb_build_object('ok', false, 'error', 'empty_request');
  end if;

  if p_days < 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid_days');
  end if;

  if p_pickup_date < current_date then
    return jsonb_build_object('ok', false, 'error', 'pickup_in_past');
  end if;

  if p_fulfilment = 'delivery'
     and (p_delivery_address is null or length(trim(p_delivery_address)) < 6) then
    return jsonb_build_object('ok', false, 'error', 'delivery_needs_address');
  end if;

  -- N días = N nights out. Due back N days after pickup; occupies the nights in
  -- between, [pickup, return - 1].
  v_return_date := p_pickup_date + p_days;
  v_occ_end     := greatest(p_pickup_date, v_return_date - 1);

  select array_agg((l->>'variant_id')::uuid)
    into v_ids
    from jsonb_array_elements(p_lines) l;

  perform 1 from variants where id = any(v_ids) order by id for update;

  for rec in
    select
      req.variant_id,
      req.quantity as requested,
      a.available,
      a.is_unknown,
      p.name as product_name,
      v.label as variant_label
    from (
      select (l->>'variant_id')::uuid as variant_id,
             (l->>'quantity')::int    as quantity
      from jsonb_array_elements(p_lines) l
    ) req
    join variants v on v.id = req.variant_id
    join products p on p.id = v.product_id
    left join lateral availability_for_variant(req.variant_id, p_pickup_date, v_occ_end) a
      on true
    where not v.published
       or v.price_per_day is null
       or (a.available is not null and a.available < req.quantity)
       or req.quantity < 1
  loop
    v_shortages := v_shortages || jsonb_build_object(
      'variant_id',   rec.variant_id,
      'product_name', rec.product_name,
      'variant_label', rec.variant_label,
      'requested',    rec.requested,
      'available',    rec.available,
      'is_unknown',   coalesce(rec.is_unknown, true)
    );
  end loop;

  if jsonb_array_length(v_shortages) > 0 then
    return jsonb_build_object('ok', false, 'error', 'unavailable',
                              'shortages', v_shortages);
  end if;

  if v_cedula is not null then
    select id into v_by_cedula from customers where cedula = v_cedula limit 1;
  end if;
  if v_phone is not null then
    select id into v_by_phone from customers where phone = v_phone limit 1;
  end if;

  if v_by_cedula is not null and v_by_phone is not null
     and v_by_cedula <> v_by_phone then
    v_customer_id := v_by_cedula;
    v_review := 'La cédula y el teléfono coinciden con clientes distintos. Revisar a mano.';
  elsif v_by_cedula is not null then
    v_customer_id := v_by_cedula;
  elsif v_by_phone is not null then
    v_customer_id := v_by_phone;
  end if;

  if v_customer_id is null then
    insert into customers (name, phone, cedula)
    values (trim(p_customer_name), v_phone, v_cedula)
    returning id into v_customer_id;
  else
    update customers
       set cedula = coalesce(cedula, v_cedula),
           phone  = coalesce(phone,  v_phone)
     where id = v_customer_id
       and (cedula is null and v_cedula is not null
         or phone  is null and v_phone  is not null);
  end if;

  insert into orders (
    customer_id, status, pickup_date, agreed_return_date, billed_days,
    pickup_time,
    fulfilment, delivery_address, payment_method, notes, source, review_reason
  ) values (
    v_customer_id, 'pending_request', p_pickup_date, v_return_date, p_days,
    p_pickup_time,
    p_fulfilment, nullif(trim(p_delivery_address), ''), p_payment_method,
    nullif(trim(p_notes), ''), 'website', v_review
  )
  returning id, number into v_order_id, v_order_no;

  insert into order_lines (order_id, variant_id, quantity, unit_price)
  select
    v_order_id,
    (l->>'variant_id')::uuid,
    (l->>'quantity')::int,
    v.price_per_day
  from jsonb_array_elements(p_lines) l
  join variants v on v.id = (l->>'variant_id')::uuid;

  insert into order_status_history (order_id, to_status, note)
  values (v_order_id, 'pending_request', 'Solicitud recibida desde el sitio web');

  return jsonb_build_object(
    'ok', true,
    'order_id', v_order_id,
    'order_number', v_order_no,
    'pickup_date', p_pickup_date,
    'return_date', v_return_date,
    'needs_review', v_review is not null
  );
end;
$function$;
