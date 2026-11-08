-- Manteles move from "one item + a Colour option" (one shared stock) to one
-- VARIANT per colour (stock per colour), like Lazos Satín. Each colour starts at
-- 30 with quantity_source = 'estimated' — "pendiente de conteo", the same flag
-- the catalog import used, so they show up in Inventario's "Falta cantidad"
-- until someone counts them.
--
-- The existing variant becomes the first colour (keeps its id and history); one
-- new variant per remaining colour copies its price. Order lines move to the
-- variant matching their option_choice (which is then cleared), and the
-- per-colour photos move from product_option_photos to variant_photos. Finally
-- the product's option list is cleared so it is a plain variant product.
do $$
declare
  p      record;
  v_old  uuid;
  val    text;
  i      int;
  new_id uuid;
begin
  for p in
    select id, option_values
      from products
     where slug in ('mantel-cuadrado', 'mantel-redondo-10-personas')
       and option_values is not null
  loop
    select id into v_old from variants where product_id = p.id order by created_at limit 1;

    for i in 1 .. array_length(p.option_values, 1) loop
      val := p.option_values[i];

      if i = 1 then
        update variants
           set label = val, label_overridden = true,
               total_quantity = 30, quantity_source = 'estimated', published = true
         where id = v_old;
        new_id := v_old;
      else
        insert into variants
          (product_id, label, label_overridden, price_per_day, price_source,
           total_quantity, quantity_source, published)
        select p.id, val, true, price_per_day, price_source, 30, 'estimated', true
          from variants where id = v_old
        returning id into new_id;
      end if;

      update order_lines
         set variant_id = new_id, option_choice = null
       where variant_id = v_old and option_choice = val;

      insert into variant_photos (variant_id, crop, storage_path, width, height)
      select new_id, crop, storage_path, width, height
        from product_option_photos
       where product_id = p.id and option_value = val
      on conflict (variant_id, crop) do update
        set storage_path = excluded.storage_path,
            width = excluded.width, height = excluded.height;
    end loop;

    delete from product_option_photos where product_id = p.id;
    update products set option_name = null, option_values = null where id = p.id;
  end loop;
end $$;
