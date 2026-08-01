-- Hand-creating catalog entries — technical-admin only.
--
-- The parents never needed this: the catalog arrived from an import and they
-- only edit it. But the developer needs to add a genuinely new item (or the
-- odd new category) without a re-import. Both are gated on is_tech_admin() and
-- generate their own unique slug, so a hand-made row is indistinguishable from
-- an imported one except that no importer will ever overwrite it.

-- Accent-folding slugify for Spanish names. Not perfect Unicode, just the
-- letters that actually appear in this catalog.
create or replace function public.catalog_slugify(p_text text)
returns text
language sql
immutable
as $$
  select trim(both '-' from
    regexp_replace(
      lower(translate(
        coalesce(p_text, ''),
        'áéíóúüñÁÉÍÓÚÜÑ',
        'aeiouunaeiouun'
      )),
      '[^a-z0-9]+', '-', 'g'
    )
  );
$$;

-- A slug for p_text on p_table that no existing row holds, appending -2, -3…
-- until it is free. p_table is one of 'products' | 'categories'.
create or replace function public.catalog_unique_slug(p_table text, p_text text)
returns text
language plpgsql
as $$
declare
  v_base text := public.catalog_slugify(p_text);
  v_slug text;
  v_n    int := 1;
  v_used boolean;
begin
  if v_base = '' then v_base := 'item'; end if;
  loop
    v_slug := case when v_n = 1 then v_base else v_base || '-' || v_n end;
    if p_table = 'products' then
      select exists(select 1 from products where slug = v_slug) into v_used;
    else
      select exists(select 1 from categories where slug = v_slug) into v_used;
    end if;
    exit when not v_used;
    v_n := v_n + 1;
  end loop;
  return v_slug;
end;
$$;

-- Create a category (technical-admin only). parent_id null makes a top-level
-- category; otherwise it is a leaf under that parent. display_order lands it at
-- the end of its siblings.
create or replace function public.create_category(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name   text := trim(coalesce(p->>'name', ''));
  v_parent uuid := nullif(p->>'parent_id', '')::uuid;
  v_order  int;
  v_id     uuid;
  v_top    text;
begin
  if not public.is_tech_admin() then
    return jsonb_build_object('ok', false, 'error', 'no_autorizado');
  end if;
  if v_name = '' then
    return jsonb_build_object('ok', false, 'error', 'falta_nombre');
  end if;
  if v_parent is not null and not exists (select 1 from categories where id = v_parent) then
    return jsonb_build_object('ok', false, 'error', 'madre_invalida');
  end if;

  select coalesce(max(display_order), 0) + 1 into v_order
  from categories
  where parent_id is not distinct from v_parent;

  insert into categories (name, slug, parent_id, display_order)
  values (v_name, public.catalog_unique_slug('categories', v_name), v_parent, v_order)
  returning id into v_id;

  select case when v_parent is null then v_name
              else (select name from categories where id = v_parent) end
  into v_top;

  return jsonb_build_object(
    'ok', true, 'id', v_id, 'name', v_name,
    'parent_id', v_parent, 'top_name', v_top
  );
end;
$$;

-- Create a product with one or more variants and an optional shared option
-- (Color/Estilo/…), technical-admin only. Everything hand-set is marked as such
-- (name_overridden, price_source/quantity_source = 'staff') so a future import
-- leaves it alone. Returns the new ids so the panel can show it without a reload.
create or replace function public.create_product(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name    text := trim(coalesce(p->>'name', ''));
  v_cat     uuid := nullif(p->>'category_id', '')::uuid;
  v_opt_name text := nullif(trim(coalesce(p->>'option_name', '')), '');
  v_opt_vals text[];
  v_pub     boolean := coalesce((p->>'published')::boolean, false);
  v_variants jsonb := coalesce(p->'variants', '[]'::jsonb);
  v_prod_id uuid;
  v_slug    text;
  v_var     jsonb;
  v_var_ids jsonb := '[]'::jsonb;
  v_var_id  uuid;
  v_price   numeric;
  v_qty     int;
begin
  if not public.is_tech_admin() then
    return jsonb_build_object('ok', false, 'error', 'no_autorizado');
  end if;
  if v_name = '' then
    return jsonb_build_object('ok', false, 'error', 'falta_nombre');
  end if;
  if v_cat is null or not exists (select 1 from categories where id = v_cat) then
    return jsonb_build_object('ok', false, 'error', 'categoria_invalida');
  end if;
  if jsonb_array_length(v_variants) = 0 then
    return jsonb_build_object('ok', false, 'error', 'sin_variantes');
  end if;

  -- Option values: only keep non-empty, only when an option name is given.
  if v_opt_name is not null then
    select array_agg(trim(x)) into v_opt_vals
    from jsonb_array_elements_text(coalesce(p->'option_values', '[]'::jsonb)) x
    where trim(x) <> '';
    if v_opt_vals is null or array_length(v_opt_vals, 1) is null then
      -- An option name with no values is meaningless — drop the option.
      v_opt_name := null;
    end if;
  end if;

  v_slug := public.catalog_unique_slug('products', v_name);

  insert into products (name, slug, category_id, option_name, option_values,
                        photo_status, name_overridden)
  values (v_name, v_slug, v_cat, v_opt_name,
          case when v_opt_name is null then null else v_opt_vals end,
          'pending', true)
  returning id into v_prod_id;

  for v_var in select * from jsonb_array_elements(v_variants)
  loop
    v_price := nullif(v_var->>'price_per_day', '')::numeric;
    v_qty   := nullif(v_var->>'total_quantity', '')::int;

    insert into variants (product_id, label, price_per_day, total_quantity,
                          published, price_source, quantity_source,
                          label_overridden, updated_by)
    values (
      v_prod_id,
      nullif(trim(coalesce(v_var->>'label', '')), ''),
      v_price,
      v_qty,
      v_pub,
      case when v_price is not null then 'staff' end,
      case when v_qty is not null then 'staff' end,
      true,
      auth.uid()
    )
    returning id into v_var_id;

    v_var_ids := v_var_ids || jsonb_build_object(
      'variant_id', v_var_id,
      'label', nullif(trim(coalesce(v_var->>'label', '')), '')
    );
  end loop;

  return jsonb_build_object(
    'ok', true,
    'product_id', v_prod_id,
    'slug', v_slug,
    'variants', v_var_ids
  );
end;
$$;

grant execute on function public.create_category(jsonb) to authenticated;
grant execute on function public.create_product(jsonb) to authenticated;
