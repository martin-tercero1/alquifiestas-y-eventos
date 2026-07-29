-- The shortage report never fired.
--
-- create_staff_order looked for `available < 0` after writing the order, on
-- the assumption that an oversold variant would come back negative. It cannot:
-- availability_for_variants clamps with greatest(total - occupied, 0), which is
-- correct — there is no such thing as offering a customer -48 chairs — but it
-- means the oversell signal is erased before this function sees it.
--
-- Booking 150 Silla Tiffany against 102 in stock therefore saved silently with
-- `availability_overridden = false`. The screen warned her correctly; the
-- record did not, so nothing survived to explain the decision later. That is
-- precisely the audit trail the override fields exist for.
--
-- `peak_occupied` is NOT clamped, so the real test is peak > total. The
-- engine is untouched: it has 21 assertions behind it and there is one
-- availability calculation in this system.

create or replace function create_staff_order(p jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
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

  ------------------------------------------------------------------- customer
  v_customer_id := nullif(p->'customer'->>'id', '')::uuid;

  if v_customer_id is null then
    insert into customers (name, phone)
    values (
      trim(p->'customer'->>'name'),
      nullif(trim(coalesce(p->'customer'->>'phone', '')), '')
    )
    returning id into v_customer_id;
  end if;

  ---------------------------------------------------------------------- order
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

  ---------------------------------------------------------------------- lines
  for line in select * from jsonb_array_elements(p->'lines') loop
    insert into order_lines (order_id, variant_id, quantity, unit_price,
                             discount_type, discount_value)
    values (
      v_order_id,
      (line->>'variant_id')::uuid,
      greatest(1, (line->>'quantity')::int),
      (line->>'unit_price')::numeric,
      (line->>'discount_type')::discount_type,
      (line->>'discount_value')::numeric
    );

    -- The catalog fills itself in as a side effect of real work: she types a
    -- price for an item that had none, and it is in the catalog. Marked
    -- 'staff' because she is the authority — that is what stops a later
    -- import run overwriting it.
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

  ------------------------------------------------------------- availability
  -- Computed AFTER the write, on purpose: the order exists either way, and
  -- this is a report on it rather than a gate in front of it. Because the
  -- order is already counted, peak_occupied > total_quantity means precisely
  -- "this order oversold it".
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
      and a.total_quantity is not null          -- unknown is not a shortage
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
$$;

grant execute on function create_staff_order(jsonb) to authenticated;
