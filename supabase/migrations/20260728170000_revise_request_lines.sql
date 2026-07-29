-- Editing the LINES of an online request before it is confirmed.
--
-- Guest orders arrive rough — a customer picks items and quantities from the
-- public site, and staff routinely need to correct them against reality
-- (fix a quantity, price an item that had none, swap or drop something) before
-- turning the request into a real order. Everywhere else lines are only ever
-- inserted; this is the single place a line can be REMOVED, and only while the
-- order is still a pending_request — a proposal the customer has not yet had
-- confirmed. Once confirmed, this path refuses, and the order's lines are the
-- record.
--
-- SECURITY DEFINER because order_lines is deliberately never granted DELETE to
-- staff; the delete is confined to this one narrow, guarded operation. It still
-- requires a real signed-in staff session (auth.uid()), and RLS elsewhere is
-- untouched.
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

  -- Replace the lines wholesale. Simpler and less error-prone than diffing,
  -- and safe here because a pending request has no payments or returns hanging
  -- off its lines yet.
  delete from order_lines where order_id = p_order_id;

  for line in select * from jsonb_array_elements(p_lines) loop
    insert into order_lines (order_id, variant_id, quantity, unit_price,
                             discount_type, discount_value)
    values (
      p_order_id,
      (line->>'variant_id')::uuid,
      greatest(1, (line->>'quantity')::int),
      coalesce((line->>'unit_price')::numeric, 0),
      (line->>'discount_type')::discount_type,
      (line->>'discount_value')::numeric
    );

    -- Same self-filling-catalog side effect as create_staff_order: a price she
    -- types for an item that had none is written back and claimed as 'staff'.
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

  -- Availability recheck over the revised lines, identical in shape to
  -- create_staff_order: a report, never a gate.
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

revoke all on function revise_order_lines(uuid, jsonb) from public;
revoke all on function revise_order_lines(uuid, jsonb) from anon;
grant execute on function revise_order_lines(uuid, jsonb) to authenticated;
