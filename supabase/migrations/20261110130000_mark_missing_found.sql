-- A unit recorded as missing turns up after all. Move it from missing to
-- returned on the line's return events and, if it had been written off the
-- inventory, put it back. Works in any status, including closed orders.
create or replace function public.mark_missing_found(p_order_line_id uuid, p_quantity int default 1)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v_left int := greatest(coalesce(p_quantity, 1), 1);
  v_total_missing int;
  v_variant uuid;
  v_number bigint;
  v_restore int := 0;
  ev record;
  v_take int;
  v_unwrite int;
begin
  select ol.variant_id, o.number into v_variant, v_number
    from order_lines ol join orders o on o.id = ol.order_id
   where ol.id = p_order_line_id;
  if v_variant is null then
    return jsonb_build_object('ok', false, 'error', 'linea_invalida');
  end if;

  select coalesce(sum(quantity_missing), 0) into v_total_missing
    from return_events where order_line_id = p_order_line_id;
  if v_total_missing < v_left then
    return jsonb_build_object('ok', false, 'error', 'excede', 'remaining', v_total_missing);
  end if;

  for ev in
    select * from return_events
     where order_line_id = p_order_line_id and quantity_missing > 0
     order by created_at desc
     for update
  loop
    exit when v_left = 0;
    v_take := least(v_left, ev.quantity_missing);
    -- Written-off units now exceeding the remaining losses come back to stock.
    v_unwrite := greatest(ev.quantity_written_off - (ev.quantity_missing - v_take + ev.quantity_damaged), 0);
    update return_events
       set quantity_missing = quantity_missing - v_take,
           quantity_returned = quantity_returned + v_take,
           quantity_written_off = quantity_written_off - v_unwrite
     where id = ev.id;
    v_restore := v_restore + v_unwrite;
    v_left := v_left - v_take;
  end loop;

  if v_restore > 0 then
    insert into stock_adjustments (variant_id, delta, reason)
    values (v_variant, v_restore,
            'Pedido #' || v_number || ': ' || v_restore || ' faltante(s) regresaron');
  end if;

  return jsonb_build_object('ok', true, 'restored', v_restore);
end;
$function$;

grant execute on function public.mark_missing_found(uuid, int) to authenticated;
