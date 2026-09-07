-- Expose a product's rental-time option (name + values) on the public catalog so
-- the client product page can offer the same choice the panel does (e.g. Mantel
-- Cuadrado's Color). Appended at the end to preserve existing column order (a
-- replaced view cannot reorder columns). Products without an option have nulls.
create or replace view public.public_catalog as
select
  v.id            as variant_id,
  p.id            as product_id,
  p.slug          as product_slug,
  p.name          as product_name,
  p.description,
  v.label         as variant_label,
  v.price_per_day,
  v.total_quantity,
  c.slug          as category_slug,
  c.name          as category_name,
  parent.slug     as parent_category_slug,
  parent.name     as parent_category_name,
  c.display_order as category_display_order,
  sq.storage_path as photo_square,
  po.storage_path as photo_portrait,
  p.option_name,
  p.option_values
from variants v
  join products p   on p.id = v.product_id
  join categories c on c.id = p.category_id
  left join categories parent on parent.id = c.parent_id
  left join product_photos sq on sq.product_id = p.id and sq.crop = 'square'
  left join product_photos po on po.product_id = p.id and po.crop = 'portrait'
where v.published and v.price_per_day is not null;
