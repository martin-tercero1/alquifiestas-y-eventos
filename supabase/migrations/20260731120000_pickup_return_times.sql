-- §4 — agreed pickup and return times.
--
-- The parents agree a specific time with each customer, for pickup and for
-- return, because they are usually busy with other things. These are
-- COORDINATION information, not calculation: availability stays day-based (see
-- the one availability engine). The times only let the Hoy screen sort the day
-- and tell the parents who to expect at 8 and who at 3.
--
-- Nullable on purpose: a website request or an old pending order legitimately
-- has no agreed time yet. The staff order form requires them in its own UI, but
-- the column must still accept the timeless rows the public path creates.

alter table orders add column if not exists pickup_time        time;
alter table orders add column if not exists agreed_return_time time;

-- Staff order creation carries the two agreed times through.
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
    greatest(1, coalesce((p->>'billed_days')::int, (v_return - v_pickup) + 1)),
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

-- The public request can suggest a pickup time (optional). No return time
-- online: an online requester is not agreeing a return slot yet. Adding a param
-- changes the signature, so drop the previous overload to keep the call
-- unambiguous.
drop function if exists public.submit_reservation_request(
  text, text, date, integer, fulfilment_method, payment_method, jsonb, text, text, text
);

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
  ----------------------------------------------------------------- validation
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

  -- The rental is priced linearly: 24-hour price x number of days. The last
  -- day is the return day, so N days of rental spans N days of occupancy.
  v_return_date := p_pickup_date + (p_days - 1);

  select array_agg((l->>'variant_id')::uuid)
    into v_ids
    from jsonb_array_elements(p_lines) l;

  -- Serialise concurrent bookings of the same stock.
  perform 1 from variants where id = any(v_ids) order by id for update;

  ------------------------------------------------------------ availability
  -- Unknown quantity is bookable: the business is live with quantity gaps on
  -- purpose, and staff confirm by hand. Only a KNOWN shortage stops a request.
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
    left join lateral availability_for_variant(req.variant_id, p_pickup_date, v_return_date) a
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

  -------------------------------------------------------------------- customer
  -- Cédula first, then phone. A cédula is a person; a phone is a handset.
  if v_cedula is not null then
    select id into v_by_cedula from customers where cedula = v_cedula limit 1;
  end if;
  if v_phone is not null then
    select id into v_by_phone from customers where phone = v_phone limit 1;
  end if;

  if v_by_cedula is not null and v_by_phone is not null
     and v_by_cedula <> v_by_phone then
    -- The cédula and the phone belong to two different records. Do NOT merge
    -- strangers automatically. Trust the cédula, and leave a note for staff.
    v_customer_id := v_by_cedula;
    v_review := 'La cédula y el teléfono coinciden con clientes distintos. Revisar a mano.';
  elsif v_by_cedula is not null then
    v_customer_id := v_by_cedula;
  elsif v_by_phone is not null then
    v_customer_id := v_by_phone;
  end if;

  if v_customer_id is null then
    -- Nobody matched: a new customer. A missing phone is normal here and never
    -- collapses onto someone else.
    insert into customers (name, phone, cedula)
    values (trim(p_customer_name), v_phone, v_cedula)
    returning id into v_customer_id;
  else
    -- Matched an existing customer. Gently backfill an identifier they were
    -- missing — this enriches one record, it never overwrites nor merges.
    update customers
       set cedula = coalesce(cedula, v_cedula),
           phone  = coalesce(phone,  v_phone)
     where id = v_customer_id
       and (cedula is null and v_cedula is not null
         or phone  is null and v_phone  is not null);
  end if;

  ----------------------------------------------------------------------- order
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

  -- Prices are SNAPSHOTTED from the catalog now. A later price correction must
  -- never silently rewrite what this customer was quoted.
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
