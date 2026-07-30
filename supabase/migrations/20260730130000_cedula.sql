-- ---------------------------------------------------------------------------
-- Cédula (national ID) — capture, and the retained-card obligation (Brief 04 §2)
--
-- The mother asks every customer for their cédula and physically HOLDS it until
-- the rented items come back. That obligation was missing from the model. Two
-- pieces:
--
--   * customers.cedula — free-form text. Nicaragua introduced a new format in
--     Feb 2026 and both formats will coexist for years, so the shape is only
--     validated (and warned on) in the UI, never rejected here. A tourist or a
--     company with only a RUC must never be blocked.
--   * orders.cedula_retained — true from pickup until full return, so the system
--     can remind staff to hand the physical card back and not create an angry
--     customer.
-- ---------------------------------------------------------------------------

alter table customers add column cedula text;
comment on column customers.cedula is
  'National ID (cédula). Free-form: pre-2026 and 2026+ formats coexist. Shape '
  'is validated in the UI only — never rejected here.';

alter table orders add column cedula_retained boolean not null default false;
comment on column orders.cedula_retained is
  'True while the customer''s physical cédula is held for this rental — set at '
  'pickup, cleared at full return.';

-- ---------------------------------------------------------------------------
-- Pickup captures the cédula and starts holding the card
-- ---------------------------------------------------------------------------
-- The physical card changes hands at pickup, so this is the moment the cédula
-- is required (enforced in the UI). Passing it here writes it onto the customer
-- if we did not already have it; the card is then marked retained.

drop function if exists mark_picked_up(uuid);

create or replace function mark_picked_up(p_order_id uuid, p_cedula text default null)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_status      order_status;
  v_customer_id uuid;
begin
  select status, customer_id into v_status, v_customer_id
    from orders where id = p_order_id;
  if v_status is null then
    return jsonb_build_object('ok', false, 'error', 'no_encontrado');
  end if;
  if v_status <> 'confirmed' then
    return jsonb_build_object('ok', false, 'error', 'no_confirmado');
  end if;

  -- Store the cédula if one was given and we did not already hold it.
  if nullif(trim(coalesce(p_cedula, '')), '') is not null then
    update customers
       set cedula = coalesce(cedula, trim(p_cedula))
     where id = v_customer_id;
  end if;

  update orders o
     set status = 'picked_up',
         cedula_retained = exists (
           select 1 from customers c
           where c.id = o.customer_id and c.cedula is not null
         )
   where o.id = p_order_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function mark_picked_up(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- A full return hands the card back — remind, and stop holding it
-- ---------------------------------------------------------------------------
-- Same logic as before; the only additions are: when the order becomes fully
-- returned and we were holding a cédula, clear the flag and tell the caller to
-- remind staff to give the physical card back.

create or replace function record_return(
  p_order_id    uuid,
  p_lines       jsonb,
  p_returned_on date default current_date,
  p_notes       text default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_status    order_status;
  line        jsonb;
  v_line_id   uuid;
  v_qty       int;
  v_accounted int;
  v_ret int; v_mis int; v_dam int;
  v_incomplete int := 0;
  v_was_retained boolean := false;
  v_customer_name text;
  v_remind boolean := false;
begin
  select status into v_status from orders where id = p_order_id;
  if v_status is null then
    return jsonb_build_object('ok', false, 'error', 'no_encontrado');
  end if;
  if v_status not in ('picked_up', 'partially_returned') then
    return jsonb_build_object('ok', false, 'error', 'no_esta_afuera');
  end if;

  for line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_line_id := (line->>'order_line_id')::uuid;
    v_ret := greatest(0, coalesce((line->>'returned')::int, 0));
    v_mis := greatest(0, coalesce((line->>'missing')::int, 0));
    v_dam := greatest(0, coalesce((line->>'damaged')::int, 0));

    if v_ret + v_mis + v_dam = 0 then
      continue;
    end if;

    select quantity into v_qty from order_lines
      where id = v_line_id and order_id = p_order_id;
    if v_qty is null then
      return jsonb_build_object('ok', false, 'error', 'linea_invalida');
    end if;

    select coalesce(sum(quantity_returned + quantity_missing + quantity_damaged), 0)
      into v_accounted
      from return_events where order_line_id = v_line_id;

    if v_accounted + v_ret + v_mis + v_dam > v_qty then
      return jsonb_build_object(
        'ok', false, 'error', 'excede',
        'order_line_id', v_line_id,
        'remaining', v_qty - v_accounted
      );
    end if;

    insert into return_events (order_line_id, returned_on,
                              quantity_returned, quantity_missing, quantity_damaged, notes)
    values (v_line_id, p_returned_on, v_ret, v_mis, v_dam,
            nullif(trim(p_notes), ''));
  end loop;

  select count(*) into v_incomplete
    from order_lines ol
    left join lateral (
      select coalesce(sum(quantity_returned + quantity_missing + quantity_damaged), 0) as done
      from return_events re where re.order_line_id = ol.id
    ) acc on true
   where ol.order_id = p_order_id
     and acc.done < ol.quantity;

  if v_incomplete = 0 then
    -- Everything accounted for. Close the occupancy, and if we were holding the
    -- customer's cédula, stop holding it and remind staff to hand it back.
    select o.cedula_retained, c.name
      into v_was_retained, v_customer_name
      from orders o join customers c on c.id = o.customer_id
     where o.id = p_order_id;

    update orders
       set actual_return_date = greatest(p_returned_on, pickup_date),
           status = 'returned',
           cedula_retained = false
     where id = p_order_id;

    v_remind := coalesce(v_was_retained, false);
  else
    if v_status = 'picked_up' then
      update orders set status = 'partially_returned' where id = p_order_id;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'complete', v_incomplete = 0,
    'return_cedula', v_remind,
    'customer_name', case when v_remind then v_customer_name else null end
  );
end;
$$;

grant execute on function record_return(uuid, jsonb, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Staff order creation stores a cédula on a brand-new customer
-- ---------------------------------------------------------------------------

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
$$;

grant execute on function create_staff_order(jsonb) to authenticated;
