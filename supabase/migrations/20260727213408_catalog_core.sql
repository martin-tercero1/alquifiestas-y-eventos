-- ============================================================================
-- Catalog: categories, products, variants.
--
-- The single most important structural fact: the VARIANT is the rentable unit.
-- It carries price, quantity and availability. An order line references a
-- variant, never a product.
--
-- Every product has at least one variant. A product with no real variants gets
-- one implicit variant (label IS NULL) so that nothing downstream — the
-- availability engine, order lines, the UI — ever needs an
-- "if the product has variants" branch.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Categories. Two levels: the source data has Cristalería / Copas.
-- ---------------------------------------------------------------------------
create table categories (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  name         text not null,
  parent_id    uuid references categories(id) on delete restrict,
  display_order int  not null default 0,
  created_at   timestamptz not null default now(),

  -- Two levels only, never three.
  constraint category_max_depth check (parent_id is null or id <> parent_id)
);

create index categories_parent_idx on categories(parent_id);

-- ---------------------------------------------------------------------------
-- Products. The thing with a name, a description, a photo and a category.
-- ---------------------------------------------------------------------------
create table products (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  name         text not null,

  -- The name exactly as it came out of the Odoo export, before accent repair.
  -- Kept so the import stays auditable and re-runnable.
  source_name  text,

  description  text,
  category_id  uuid not null references categories(id) on delete restrict,

  -- Odoo product.template id. Shared by all variants of a product, so it is
  -- NOT unique here... except it is: one row per product. Kept for re-import
  -- matching and for building the legacy image URL.
  odoo_id      int unique,

  -- Staff notes migrated from Odoo ("Stock desactualizado", "Los 3 valen 500").
  -- NEVER exposed publicly — see the RLS migration.
  internal_note text,

  -- Photos live in product_photos. This flag makes "which products still need
  -- a photo" a cheap indexed query rather than a NOT EXISTS scan.
  photo_status text not null default 'pending'
    check (photo_status in ('pending', 'imported', 'uploaded', 'unavailable')),

  -- Set when the source data was corrupt or ambiguous and a human needs to
  -- look at the record before it is trusted (e.g. the Cortinas variants).
  needs_review        boolean not null default false,
  needs_review_reason text,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index products_category_idx on products(category_id);
create index products_photo_status_idx on products(photo_status) where photo_status = 'pending';
create index products_needs_review_idx on products(needs_review) where needs_review;

-- ---------------------------------------------------------------------------
-- Variants: the rentable unit.
--
-- price_per_day and total_quantity are BOTH NULLABLE and that is a legitimate
-- state, not a validation failure. The catalog is going live with gaps and the
-- business fills them in from the admin panel as it goes.
--
--   price_per_day IS NULL  -> exists, searchable, quotable by staff who know
--                             the price by heart, but never publicly bookable.
--   total_quantity IS NULL -> UNKNOWN, which is not zero. The availability
--                             engine returns 'unknown' for these, never 0.
-- ---------------------------------------------------------------------------
create table variants (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references products(id) on delete cascade,

  -- NULL for the implicit variant of a product that has no real variants.
  label        text,
  source_label text,

  -- The import's idempotency key: the CSV's `unidad_alquilable`.
  -- Re-running the import matches on this and never duplicates.
  source_key   text unique,

  -- Money is numeric, never float. Córdobas.
  price_per_day  numeric(12,2) check (price_per_day is null or price_per_day >= 0),
  total_quantity int           check (total_quantity is null or total_quantity >= 0),

  -- Odoo's published flag. 82 of 134 units are published; the other 52 are
  -- real inventory that staff need and customers never see.
  published    boolean not null default false,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- One implicit variant per product at most; real variants must be distinct.
  constraint variant_label_unique unique (product_id, label)
);

create index variants_product_idx on variants(product_id);

-- The public catalog predicate, as an index. A variant is publicly bookable
-- only when it is published AND priced — everything else exists internally.
create index variants_public_idx on variants(product_id)
  where published and price_per_day is not null;

-- The gap queues, indexed so the admin panel can ask cheaply.
create index variants_missing_price_idx on variants(product_id) where price_per_day is null;
create index variants_missing_quantity_idx on variants(product_id) where total_quantity is null;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger products_touch before update on products
  for each row execute function touch_updated_at();

create trigger variants_touch before update on variants
  for each row execute function touch_updated_at();
