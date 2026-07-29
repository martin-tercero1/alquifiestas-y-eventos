-- ============================================================================
-- The gap queues.
--
-- The catalog is going live with missing prices, missing quantities and
-- missing photos. That is a deliberate decision — entering this data through
-- the new system is faster than any manual alternative — so the gaps are
-- exposed as a WORKING QUEUE, not as a report. This is how the catalog
-- actually gets finished.
--
-- Ordered so the most-rented categories come first, because those are the rows
-- that cost the business money while they stay blank. Rental volume ranks them
-- once there is history; until then they fall back to the display order the
-- public site already uses.
--
-- Staff only. Not granted to anon.
-- ============================================================================

create or replace view category_rental_rank as
select
  c.id as category_id,
  count(ol.id) as times_rented
from categories c
left join products p    on p.category_id = c.id
left join variants v    on v.product_id = p.id
left join order_lines ol on ol.variant_id = v.id
group by c.id;

-- ---------------------------------------------------------------------------
-- Which variants are missing a price.
-- A priceless variant cannot be booked online, so this queue is the one that
-- directly gates revenue.
-- ---------------------------------------------------------------------------
create or replace view variants_missing_price as
select
  v.id as variant_id,
  p.id as product_id,
  p.name as product_name,
  v.label as variant_label,
  c.name as category_name,
  c.slug as category_slug,
  v.published,
  v.total_quantity,
  p.internal_note,
  r.times_rented
from variants v
join products p   on p.id = v.product_id
join categories c on c.id = p.category_id
join category_rental_rank r on r.category_id = c.id
where v.price_per_day is null
order by r.times_rented desc, c.display_order, p.name, v.label nulls first;

-- ---------------------------------------------------------------------------
-- Which variants are missing a quantity.
-- NULL means unknown, not zero — these still appear publicly if priced, and
-- the availability engine reports them as unknown rather than unavailable.
-- ---------------------------------------------------------------------------
create or replace view variants_missing_quantity as
select
  v.id as variant_id,
  p.id as product_id,
  p.name as product_name,
  v.label as variant_label,
  c.name as category_name,
  c.slug as category_slug,
  v.published,
  v.price_per_day,
  p.internal_note,
  r.times_rented
from variants v
join products p   on p.id = v.product_id
join categories c on c.id = p.category_id
join category_rental_rank r on r.category_id = c.id
where v.total_quantity is null
order by r.times_rented desc, c.display_order, p.name, v.label nulls first;

-- ---------------------------------------------------------------------------
-- Which products still need a photo.
--
-- Expected to be a long list: the Odoo instance very likely does not expose
-- images for its 52 unpublished units, and some products never had one. A
-- missing photo is a queue entry, never an import failure.
-- ---------------------------------------------------------------------------
create or replace view products_missing_photo as
select
  p.id as product_id,
  p.name as product_name,
  p.slug as product_slug,
  c.name as category_name,
  c.slug as category_slug,
  p.photo_status,
  count(v.id) filter (where v.published) as published_variants,
  r.times_rented
from products p
join categories c on c.id = p.category_id
join category_rental_rank r on r.category_id = c.id
left join variants v on v.product_id = p.id
where not exists (
  select 1 from product_photos ph
  where ph.product_id = p.id and ph.crop in ('square', 'portrait')
)
group by p.id, p.name, p.slug, c.name, c.slug, c.display_order, p.photo_status, r.times_rented
order by r.times_rented desc, c.display_order, p.name;

-- ---------------------------------------------------------------------------
-- One roll-up, so the admin panel's home screen can show how much is left
-- without running four queries.
-- ---------------------------------------------------------------------------
create or replace view catalog_gaps_summary as
select
  (select count(*) from variants_missing_price)    as variants_missing_price,
  (select count(*) from variants_missing_quantity) as variants_missing_quantity,
  (select count(*) from products_missing_photo)    as products_missing_photo,
  (select count(*) from products where needs_review) as products_needing_review,
  (select count(*) from variants)                  as total_variants,
  (select count(*) from products)                  as total_products;
