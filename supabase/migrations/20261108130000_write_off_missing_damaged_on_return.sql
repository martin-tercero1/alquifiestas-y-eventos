-- Items lost or damaged on a rental now come off the inventory when the return
-- is recorded. The plumbing existed from day one (stock_adjustments + its trigger
-- lowers variants.total_quantity and marks the units written off on the return
-- event, which also releases them from availability) but nothing called it, so a
-- paid-for missing fork stayed in stock forever.
--
-- 1) stamp_variant_source: a stock adjustment is not a COUNT. It must not flip
--    quantity_source to 'staff' and clear "pendiente de conteo". The adjustment
--    trigger flags itself with a transaction-local setting the stamp honours.
create or replace function public.stamp_variant_source()
returns trigger
language plpgsql
as $function$
begin
  if auth.uid() is not null then
    if new.price_per_day is distinct from old.price_per_day then
      new.price_source := 'staff';
    end if;
    if new.total_quantity is distinct from old.total_quantity
       and coalesce(current_setting('app.stock_adjustment', true), '') <> 'on' then
      new.quantity_source := 'staff';
    end if;
    if new.label is distinct from old.label then
      new.label_overridden := true;
    end if;
  end if;
  return new;
end $function$;

create or replace function public.apply_stock_adjustment()
returns trigger
language plpgsql
as $function$
declare
  current_total int;
begin
  select total_quantity into current_total from variants where id = new.variant_id for update;

  new.previous_total := current_total;

  -- A NULL total means UNKNOWN. An adjustment against an unknown total is
  -- still recorded — it just cannot compute a new number.
  if current_total is not null then
    new.new_total := greatest(current_total + new.delta, 0);
    perform set_config('app.stock_adjustment', 'on', true);
    update variants set total_quantity = new.new_total where id = new.variant_id;
    perform set_config('app.stock_adjustment', '', true);
  end if;

  -- Writing units off releases them from the line's occupancy, so the loss is
  -- counted once (as a smaller total) rather than twice.
  if new.return_event_id is not null and new.delta < 0 then
    update return_events
       set quantity_written_off = least(
             quantity_written_off + abs(new.delta),
             quantity_missing + quantity_damaged
           )
     where id = new.return_event_id;
  end if;

  return new;
end;
$function$;

-- 2) record_return writes off missing + damaged units unless told not to
--    (p_write_off = false, e.g. something damaged that will be repaired).
drop function if exists public.record_return(uuid, jsonb, date, text);

create function public.record_return(
  p_order_id uuid,
  p_lines jsonb,
  p_returned_on date default current_date,
  p_notes text default null,
  p_write_off boolean default true
)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v_status    order_status;
  v_number    bigint;
  line        jsonb;
  v_line_id   uuid;
  v_variant   uuid;
  v_qty       int;
  v_accounted int;
  v_ret int; v_mis int; v_dam int;
  v_event_id  uuid;
  v_written   int := 0;
  v_incomplete int := 0;
  v_was_retained boolean := false;
  v_customer_name text;
  v_remind boolean := false;
begin
  select status, number into v_status, v_number from orders where id = p_order_id;
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

    select quantity, variant_id into v_qty, v_variant from order_lines
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
            nullif(trim(p_notes), ''))
    returning id into v_event_id;

    if p_write_off and v_mis + v_dam > 0 then
      insert into stock_adjustments (variant_id, delta, reason, return_event_id)
      values (
        v_variant,
        -(v_mis + v_dam),
        'Pedido #' || v_number || ': '
          || concat_ws(', ',
               case when v_mis > 0 then v_mis || ' faltante' || case when v_mis > 1 then 's' else '' end end,
               case when v_dam > 0 then v_dam || ' dañado'   || case when v_dam > 1 then 's' else '' end end),
        v_event_id
      );
      v_written := v_written + v_mis + v_dam;
    end if;
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
    'written_off', v_written,
    'return_cedula', v_remind,
    'customer_name', case when v_remind then v_customer_name else null end
  );
end;
$function$;

grant execute on function public.record_return(uuid, jsonb, date, text, boolean) to authenticated;
