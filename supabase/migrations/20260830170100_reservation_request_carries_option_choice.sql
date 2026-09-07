-- The public reservation now carries the chosen option value (e.g. a mantel
-- colour) per line, so a website request records the same option the panel does.
-- Only the order_lines insert changed; everything else is the prior version.
create or replace function public.submit_reservation_request(
  p_customer_name text, p_customer_phone text, p_pickup_date date, p_days integer,
  p_fulfilment fulfilment_method, p_payment_method payment_method, p_lines jsonb,
  p_delivery_address text default null, p_notes text default null,
  p_cedula text default null, p_pickup_time time without time zone default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  insert into order_lines (order_id, variant_id, quantity, unit_price, option_choice)
  select
    v_order_id,
    (l->>'variant_id')::uuid,
    (l->>'quantity')::int,
    v.price_per_day,
    nullif(trim(l->>'option_choice'), '')
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
