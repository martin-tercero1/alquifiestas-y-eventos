-- Regression fix. confirm_order/revise_order_lines/update_order_details set
-- availability_overridden = true when reserving the stock over-books it, but the
-- orders.override_needs_reason CHECK requires a reason whenever that flag is on.
-- With no reason supplied, the flag update failed and BLOCKED the action — the
-- opposite of the intended "warn, don't block". Fix: when flagging an override,
-- default the reason if the order has none; when there is no shortage, clear the
-- flag (which needs no reason).

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

  if jsonb_array_length(v_shortages) > 0 then
    update orders
       set availability_overridden = true,
           override_reason = coalesce(override_reason,
                                      'Confirmado por encima de la disponibilidad')
     where id = p_order_id;
  else
    update orders set availability_overridden = false where id = p_order_id;
  end if;

  return jsonb_build_object('ok', true, 'shortages', v_shortages);
end;
$function$;

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

  -- A quote holds no stock, so it is never "over": leave its flag off. A
  -- confirmed/pending order that over-books is flagged, with a default reason so
  -- the override_needs_reason check is satisfied (warn, don't block).
  if v_status <> 'quote' and jsonb_array_length(v_shortages) > 0 then
    update orders
       set availability_overridden = true,
           override_reason = coalesce(override_reason,
                                      'Editado por encima de la disponibilidad')
     where id = p_order_id;
  else
    update orders set availability_overridden = false where id = p_order_id;
  end if;

  return jsonb_build_object('ok', true, 'shortages', v_shortages, 'prices_saved', v_saved);
end;
$function$;

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

  -- Nights, not inclusive days: a same-day return is still 1 día.
  v_days := greatest(1, p_return_date - p_pickup_date);

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

  if v_status <> 'quote' and jsonb_array_length(v_shortages) > 0 then
    update orders
       set availability_overridden = true,
           override_reason = coalesce(override_reason,
                                      'Editado por encima de la disponibilidad')
     where id = p_order_id;
  else
    update orders set availability_overridden = false where id = p_order_id;
  end if;

  return jsonb_build_object('ok', true, 'billed_days', v_days);
end;
$function$;
