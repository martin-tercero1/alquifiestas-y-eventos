-- The actions an order moves through on the Detalle screen.
--
-- The lifecycle itself was already enforced in brief 02 by
-- validate_status_transition. Two gaps had to be closed before the screen
-- could sit on top of it:
--
--   1. The trigger logged every transition but dropped changed_by, so a
--      confirm / pickup / return answered "who did this?" with a blank. The
--      brief requires every write to record its author. Fixed centrally here,
--      rather than in six callers.
--   2. A cancellation has a reason, and the auto-logged history row had
--      nowhere to put it. The trigger now reads a transaction-local note.
--
-- Everything below is SECURITY INVOKER: it runs as the signed-in staff member,
-- so RLS applies and auth.uid() is real. And none of it blocks — the owner
-- overrides the system, never the other way round.

-- ---------------------------------------------------------------------------
-- Attribution + reason on transitions
-- ---------------------------------------------------------------------------

create or replace function validate_status_transition()
returns trigger
language plpgsql
as $$
declare
  allowed order_status[];
begin
  if new.status = old.status then
    return new;
  end if;

  allowed := case old.status
    when 'pending_request'    then array['confirmed', 'cancelled']::order_status[]
    when 'confirmed'          then array['picked_up', 'cancelled']::order_status[]
    when 'picked_up'          then array['partially_returned', 'returned']::order_status[]
    when 'partially_returned' then array['returned']::order_status[]
    when 'returned'           then array['closed']::order_status[]
    else array[]::order_status[]
  end;

  if not (new.status = any(allowed)) then
    raise exception 'El pedido % no puede pasar de % a %.', old.number, old.status, new.status
      using errcode = 'check_violation';
  end if;

  insert into order_status_history (order_id, from_status, to_status, changed_by, note)
  values (
    new.id,
    old.status,
    new.status,
    auth.uid(),
    nullif(current_setting('app.status_note', true), '')
  );

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Confirm an online request into a proforma
-- ---------------------------------------------------------------------------
-- Only reachable on a pending_request. Delivery is quoted by hand and lands
-- here; there is no delivery pricing logic anywhere in the system.

create or replace function confirm_order(
  p_order_id                uuid,
  p_delivery_cost           numeric default null,
  p_security_deposit        numeric default null,
  p_physical_invoice_number text    default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare v_status order_status;
begin
  select status into v_status from orders where id = p_order_id;
  if v_status is null then
    return jsonb_build_object('ok', false, 'error', 'no_encontrado');
  end if;
  if v_status <> 'pending_request' then
    return jsonb_build_object('ok', false, 'error', 'no_es_solicitud');
  end if;

  update orders
     set delivery_cost           = coalesce(p_delivery_cost, delivery_cost),
         security_deposit        = coalesce(p_security_deposit, security_deposit),
         physical_invoice_number =
           coalesce(nullif(trim(p_physical_invoice_number), ''), physical_invoice_number),
         status                  = 'confirmed'
   where id = p_order_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Record a payment
-- ---------------------------------------------------------------------------
-- Partial payments are the norm and a ~50% anticipo is common, so this appends
-- rather than replaces. A refund is a negative-signed payment (kind 'refund').

create or replace function record_payment(
  p_order_id  uuid,
  p_amount    numeric,
  p_method    payment_method default 'cash',
  p_kind      payment_kind   default 'advance',
  p_reference text           default null,
  p_notes     text           default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare v_balance numeric;
begin
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok', false, 'error', 'monto_invalido');
  end if;
  if not exists (select 1 from orders where id = p_order_id) then
    return jsonb_build_object('ok', false, 'error', 'no_encontrado');
  end if;

  insert into payments (order_id, amount, method, kind, reference, notes)
  values (p_order_id, p_amount, p_method, p_kind,
          nullif(trim(p_reference), ''), nullif(trim(p_notes), ''));

  select balance into v_balance from order_totals where order_id = p_order_id;
  return jsonb_build_object('ok', true, 'balance', v_balance);
end;
$$;

-- ---------------------------------------------------------------------------
-- Mark picked up
-- ---------------------------------------------------------------------------

create or replace function mark_picked_up(p_order_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare v_status order_status;
begin
  select status into v_status from orders where id = p_order_id;
  if v_status is null then
    return jsonb_build_object('ok', false, 'error', 'no_encontrado');
  end if;
  if v_status <> 'confirmed' then
    return jsonb_build_object('ok', false, 'error', 'no_confirmado');
  end if;

  update orders set status = 'picked_up' where id = p_order_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Record a return, including partial returns
-- ---------------------------------------------------------------------------
-- p_lines: [{order_line_id, returned, missing, damaged}, ...]
--
-- Availability releases only on the USABLE units received — the engine already
-- does that from return_events. What this adds is the order-level bookkeeping:
-- whether every line is now accounted for (returned + missing + damaged >=
-- quantity), and if so, closing the occupancy by setting actual_return_date.
-- Missing and damaged units keep occupying until they are written off the
-- variant total — a separate, deliberate staff decision, not this screen's.

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
      continue;  -- nothing recorded for this line this time
    end if;

    select quantity into v_qty from order_lines
      where id = v_line_id and order_id = p_order_id;
    if v_qty is null then
      return jsonb_build_object('ok', false, 'error', 'linea_invalida');
    end if;

    -- Units already accounted for on earlier return events for this line.
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

  -- Is anything on the order still outstanding?
  select count(*) into v_incomplete
    from order_lines ol
    left join lateral (
      select coalesce(sum(quantity_returned + quantity_missing + quantity_damaged), 0) as done
      from return_events re where re.order_line_id = ol.id
    ) acc on true
   where ol.order_id = p_order_id
     and acc.done < ol.quantity;

  if v_incomplete = 0 then
    -- Everything accounted for. Close the occupancy on the receipt date.
    update orders
       set actual_return_date = greatest(p_returned_on, pickup_date),
           status = 'returned'
     where id = p_order_id;
  else
    if v_status = 'picked_up' then
      update orders set status = 'partially_returned' where id = p_order_id;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'complete', v_incomplete = 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- Add a charge
-- ---------------------------------------------------------------------------
-- Late fees are ALWAYS typed by staff. The system flags an order as overdue
-- and says nothing about how much to charge — so this takes an amount and
-- never computes one.

create or replace function add_order_charge(
  p_order_id    uuid,
  p_kind        charge_kind,
  p_amount      numeric,
  p_description text default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
begin
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok', false, 'error', 'monto_invalido');
  end if;
  if not exists (select 1 from orders where id = p_order_id) then
    return jsonb_build_object('ok', false, 'error', 'no_encontrado');
  end if;

  insert into charges (order_id, kind, amount, description)
  values (p_order_id, p_kind, p_amount, nullif(trim(p_description), ''));

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Cancel — void, never delete
-- ---------------------------------------------------------------------------
-- A cancelled order stays visible with its reason. The reason rides through
-- the status trigger as a transaction-local note so it lands on the history
-- row the trigger writes.

create or replace function cancel_order(p_order_id uuid, p_reason text)
returns jsonb
language plpgsql
set search_path = public
as $$
declare v_status order_status;
begin
  select status into v_status from orders where id = p_order_id;
  if v_status is null then
    return jsonb_build_object('ok', false, 'error', 'no_encontrado');
  end if;
  if v_status not in ('pending_request', 'confirmed') then
    return jsonb_build_object('ok', false, 'error', 'no_cancelable');
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'falta_motivo');
  end if;

  perform set_config('app.status_note', trim(p_reason), true);
  update orders
     set status = 'cancelled',
         override_reason = trim(p_reason)
   where id = p_order_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Close a fully-returned order
-- ---------------------------------------------------------------------------

create or replace function close_order(p_order_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare v_status order_status;
begin
  select status into v_status from orders where id = p_order_id;
  if v_status <> 'returned' then
    return jsonb_build_object('ok', false, 'error', 'no_retornado');
  end if;
  update orders set status = 'closed' where id = p_order_id;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function confirm_order(uuid, numeric, numeric, text)      to authenticated;
grant execute on function record_payment(uuid, numeric, payment_method, payment_kind, text, text) to authenticated;
grant execute on function mark_picked_up(uuid)                             to authenticated;
grant execute on function record_return(uuid, jsonb, date, text)           to authenticated;
grant execute on function add_order_charge(uuid, charge_kind, numeric, text) to authenticated;
grant execute on function cancel_order(uuid, text)                         to authenticated;
grant execute on function close_order(uuid)                                to authenticated;
