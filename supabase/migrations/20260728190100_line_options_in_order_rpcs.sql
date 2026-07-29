-- Both order-writing paths now carry the chosen option onto the line.
-- (Full bodies reproduced so the file is self-contained; the only change from
-- their previous definitions is `option_choice` on the order_lines insert.)
create or replace function create_staff_order(p jsonb)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v_customer_id uuid;
  v_order_id    uuid;
  v_order_no    bigint;
  v_pickup      date := (p->>'pickup_date')::date;
  v_return      date := (p->>'agreed_return_date')::date;
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

  v_customer_id := nullif(p->'customer'->>'id', '')::uuid;

  if v_customer_id is null then
    insert into customers (name, phone)
    values (
      trim(p->'customer'->>'name'),
      nullif(trim(coalesce(p->'customer'->>'phone', '')), '')
    )
    returning id into v_customer_id;
  end if;

  insert into orders (
    customer_id, status, pickup_date, agreed_return_date, billed_days,
    fulfilment, delivery_address, delivery_cost, payment_method,
    security_deposit, discount_type, discount_value,
    physical_invoice_number, notes, source, override_reason
  ) values (
    v_customer_id,
    coalesce((p->>'status')::order_status, 'confirmed'),
    v_pickup,
    v_return,
    greatest(1, coalesce((p->>'billed_days')::int, (v_return - v_pickup) + 1)),
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
    left join lateral availability_for_variant(ol.variant_id, v_pickup, v_return) a on true
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

create or replace function revise_order_lines(p_order_id uuid, p_lines jsonb)
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
  if v_status <> 'pending_request' then
    return jsonb_build_object('ok', false, 'error', 'no_es_solicitud');
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

  update orders
     set availability_overridden = (jsonb_array_length(v_shortages) > 0)
   where id = p_order_id;

  return jsonb_build_object('ok', true, 'shortages', v_shortages, 'prices_saved', v_saved);
end;
$function$;
