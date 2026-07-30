-- §3 — cédula-ahead-of-phone matching for public requests.
--
-- A cédula is a stronger identity than a phone (phones get reused across family
-- members and change over time). So a public request now matches on cédula
-- FIRST, then falls back to phone. When the two point at DIFFERENT customers we
-- never merge them: the request is attached to the cédula match and flagged for
-- staff to look at by hand.

-- A place to record "a human should check this". Null is the normal case.
alter table orders add column if not exists review_reason text;

-- The signature gains p_cedula, so this is a NEW function rather than a replace
-- of the old 9-arg one. Drop the old overload to keep the call unambiguous.
drop function if exists public.submit_reservation_request(
  text, text, date, integer, fulfilment_method, payment_method, jsonb, text, text
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
  p_cedula text default null
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
    fulfilment, delivery_address, payment_method, notes, source, review_reason
  ) values (
    v_customer_id, 'pending_request', p_pickup_date, v_return_date, p_days,
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

-- Staff can now find a customer by the cédula number too (digits only, so the
-- dashes and the trailing letter don't have to be typed).
create or replace function public.search_customers(q text default '', limit_n integer default 15)
 RETURNS TABLE(id uuid, name text, phone text, phone_alt text, orders_count bigint, last_order_at timestamp with time zone, score real)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  with needle as (
    select search_normalize(coalesce(q, '')) as n,
           -- Phones and cédulas are matched on digits alone.
           regexp_replace(coalesce(q, ''), '\D', '', 'g') as digits
  )
  select
    cu.id, cu.name, cu.phone, cu.phone_alt,
    count(o.id) as orders_count,
    max(o.created_at) as last_order_at,
    extensions.word_similarity((select n from needle), search_normalize(cu.name))::real as score
  from customers cu
  left join orders o on o.customer_id = cu.id
  where
    (select n from needle) = ''
    or search_normalize(cu.name) like '%' || (select n from needle) || '%'
    or extensions.word_similarity((select n from needle), search_normalize(cu.name)) >= 0.4
    or (
      length((select digits from needle)) >= 4
      and regexp_replace(coalesce(cu.phone, '') || coalesce(cu.phone_alt, ''), '\D', '', 'g')
          like '%' || (select digits from needle) || '%'
    )
    or (
      length((select digits from needle)) >= 4
      and regexp_replace(coalesce(cu.cedula, ''), '\D', '', 'g')
          like '%' || (select digits from needle) || '%'
    )
  group by cu.id, cu.name, cu.phone, cu.phone_alt
  order by score desc, max(o.created_at) desc nulls last, cu.name
  limit greatest(1, least(limit_n, 50));
$function$;
