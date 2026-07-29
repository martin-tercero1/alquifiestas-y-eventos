-- Where a price or a quantity came from.
--
-- Until now a value was either present or null, which was enough while every
-- value was going to be typed in by a person. It stops being enough the moment
-- the database holds three different kinds of number:
--
--   'recovered' — read off the business's own Odoo shop before it lapsed.
--                 Real, but a snapshot of a system that is being retired.
--   'estimated' — generated so the site can be tested end to end. NOT REAL.
--                 Must be removable in one statement, and it is: see
--                 scripts/import/clear-estimates.mjs.
--   'staff'     — entered by a person who knows the business. Authoritative,
--                 and never overwritten by any import.
--
-- A non-null value with a NULL source is treated as staff-entered, so anything
-- already in the table when this migration runs is protected by default.

alter table variants
  add column if not exists price_source text
    check (price_source in ('recovered', 'estimated', 'staff')),
  add column if not exists quantity_source text
    check (quantity_source in ('recovered', 'estimated', 'staff'));

comment on column variants.price_source is
  'Provenance of price_per_day: recovered (Odoo scrape) | estimated (test data, not real) | staff (authoritative). NULL alongside a non-null price means staff-entered.';

comment on column variants.quantity_source is
  'Provenance of total_quantity: recovered (Odoo scrape) | estimated (test data, not real) | staff (authoritative). NULL alongside a non-null quantity means staff-entered.';

-- Finding the fabricated rows must never require remembering how they were
-- made. This is the view the admin panel will use to nag, and the one to check
-- before going live.
create or replace view estimated_values as
select
  v.id                as variant_id,
  p.name              as product_name,
  v.label             as variant_label,
  v.source_key,
  v.price_per_day,
  v.price_source,
  v.total_quantity,
  v.quantity_source
from variants v
join products p on p.id = v.product_id
where v.price_source = 'estimated'
   or v.quantity_source = 'estimated'
order by p.name, v.label;

comment on view estimated_values is
  'Every variant still carrying invented test data. This must be empty before the site serves real customers.';

revoke all on estimated_values from anon, authenticated;
