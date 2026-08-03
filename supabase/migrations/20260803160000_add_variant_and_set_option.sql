-- Append a variant to an existing product, and edit a product's shared option
-- after creation. Both technical-admin only (like create_product), because they
-- change the catalog's structure — the parents still edit prices, quantities,
-- labels and visibility on existing variants without any gate.
--
-- A hand-added variant is stamped exactly like one from create_product
-- (price_source/quantity_source = 'staff', label_overridden) so a future import
-- leaves it alone.

create or replace function public.add_variant(p_product_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text := nullif(trim(coalesce(p->>'label', '')), '');
  v_price numeric := nullif(p->>'price_per_day', '')::numeric;
  v_qty   int := nullif(p->>'total_quantity', '')::int;
  v_pub   boolean := coalesce((p->>'published')::boolean, false);
  v_var_id uuid;
begin
  if not public.is_tech_admin() then
    return jsonb_build_object('ok', false, 'error', 'no_autorizado');
  end if;
  if not exists (select 1 from products where id = p_product_id) then
    return jsonb_build_object('ok', false, 'error', 'producto_invalido');
  end if;

  insert into variants (product_id, label, price_per_day, total_quantity,
                        published, price_source, quantity_source,
                        label_overridden, updated_by)
  values (
    p_product_id, v_label, v_price, v_qty, v_pub,
    case when v_price is not null then 'staff' end,
    case when v_qty is not null then 'staff' end,
    true, auth.uid()
  )
  returning id into v_var_id;

  return jsonb_build_object('ok', true, 'variant_id', v_var_id, 'label', v_label);
end;
$$;

-- Set (or clear) a product's shared rental-time option — the Color/Estilo choice
-- and its values. Same cleaning as create_product: an option name with no values
-- is meaningless, so it clears both. Historical order_lines keep their own
-- option_choice text (it's snapshotted), so changing the values here never
-- rewrites the past.
create or replace function public.set_product_option(p_product_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opt_name text := nullif(trim(coalesce(p->>'option_name', '')), '');
  v_opt_vals text[];
begin
  if not public.is_tech_admin() then
    return jsonb_build_object('ok', false, 'error', 'no_autorizado');
  end if;
  if not exists (select 1 from products where id = p_product_id) then
    return jsonb_build_object('ok', false, 'error', 'producto_invalido');
  end if;

  if v_opt_name is not null then
    select array_agg(trim(x)) into v_opt_vals
    from jsonb_array_elements_text(coalesce(p->'option_values', '[]'::jsonb)) x
    where trim(x) <> '';
    if v_opt_vals is null or array_length(v_opt_vals, 1) is null then
      v_opt_name := null;
    end if;
  end if;

  update products
     set option_name = v_opt_name,
         option_values = case when v_opt_name is null then null else v_opt_vals end
   where id = p_product_id;

  return jsonb_build_object(
    'ok', true,
    'option_name', v_opt_name,
    'option_values',
      case when v_opt_name is null then null else to_jsonb(v_opt_vals) end
  );
end;
$$;

grant execute on function public.add_variant(uuid, jsonb) to authenticated;
grant execute on function public.set_product_option(uuid, jsonb) to authenticated;
