-- Brief-04 §5: technical-admin role + real (hard) deletion.
--
-- The parents never delete — that rule stands, and their UI carries no delete
-- controls at all. The developer needs a way to remove genuine junk (test
-- orders, duplicates) so the database doesn't accumulate noise. This adds a
-- role flag on the existing auth (no separate system) and a small set of
-- SECURITY DEFINER hard-delete RPCs gated on that flag. Deletion still refuses
-- where real history exists, preferring the existing void/cancel, unless the
-- caller explicitly forces it for clear test data.

alter table staff
  add column if not exists is_tech_admin boolean not null default false;

-- The one developer/owner account. The parents' accounts stay false.
update staff set is_tech_admin = true where display_name = 'titomon10';

-- True only for an active staff member flagged as technical admin. Used by
-- every delete RPC below as the single authorization gate.
create or replace function public.is_tech_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from staff
    where user_id = auth.uid() and is_tech_admin and active
  );
$$;

-- Hard-delete an order and everything hanging off it (lines, payments, charges,
-- status history, documents cascade/removed here). Refuses an order that
-- carries money unless forced — for those the parents' cancel/void is the right
-- tool, and forcing is reserved for clearly-junk test rows.
create or replace function public.admin_delete_order(
  p_order_id uuid,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order orders%rowtype;
  v_paid  integer;
begin
  if not public.is_tech_admin() then
    return jsonb_build_object('ok', false, 'error', 'no_autorizado');
  end if;

  select * into v_order from orders where id = p_order_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_encontrado');
  end if;

  select count(*) into v_paid from payments where order_id = p_order_id;
  if v_paid > 0 and not p_force then
    return jsonb_build_object('ok', false, 'error', 'tiene_historial');
  end if;

  -- documents FK is ON DELETE RESTRICT; clear them first so the order can go.
  delete from documents where order_id = p_order_id;
  delete from orders where id = p_order_id;

  return jsonb_build_object('ok', true, 'number', v_order.number);
end;
$$;

-- Hard-delete a customer. Refused while they have any orders — an order's FK is
-- ON DELETE RESTRICT and, more importantly, a customer with history is not junk.
create or replace function public.admin_delete_customer(p_customer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name  text;
  v_count integer;
begin
  if not public.is_tech_admin() then
    return jsonb_build_object('ok', false, 'error', 'no_autorizado');
  end if;

  select name into v_name from customers where id = p_customer_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_encontrado');
  end if;

  select count(*) into v_count from orders where customer_id = p_customer_id;
  if v_count > 0 then
    return jsonb_build_object('ok', false, 'error', 'tiene_pedidos');
  end if;

  delete from customers where id = p_customer_id;
  return jsonb_build_object('ok', true, 'name', v_name);
end;
$$;

-- Hard-delete a product and its variants/photos (both cascade). Refused while
-- any of its variants appears on an order line — order_lines' FK is RESTRICT and
-- a product with sales history is not junk.
create or replace function public.admin_delete_product(p_product_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name  text;
  v_count integer;
begin
  if not public.is_tech_admin() then
    return jsonb_build_object('ok', false, 'error', 'no_autorizado');
  end if;

  select name into v_name from products where id = p_product_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_encontrado');
  end if;

  select count(*) into v_count
  from order_lines ol
  join variants v on v.id = ol.variant_id
  where v.product_id = p_product_id;
  if v_count > 0 then
    return jsonb_build_object('ok', false, 'error', 'tiene_pedidos');
  end if;

  delete from products where id = p_product_id;
  return jsonb_build_object('ok', true, 'name', v_name);
end;
$$;

grant execute on function public.is_tech_admin() to authenticated;
grant execute on function public.admin_delete_order(uuid, boolean) to authenticated;
grant execute on function public.admin_delete_customer(uuid) to authenticated;
grant execute on function public.admin_delete_product(uuid) to authenticated;
