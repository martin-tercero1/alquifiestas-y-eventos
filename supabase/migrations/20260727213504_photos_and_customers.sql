-- ============================================================================
-- Photos and customers.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Product photos.
--
-- The design system allows exactly two aspect ratios: 1:1 for grids, 4:5 for
-- detail. That is a constraint on the IMAGE PIPELINE, not just on CSS — the
-- import produces both crops and stores them, because a badly framed WhatsApp
-- photo cropped by the browser is precisely the failure the matting system
-- exists to prevent.
--
-- The original is kept too. The Odoo instance is being shut down, so once it
-- lapses there is no way to re-crop from source unless we hold the original
-- ourselves. Only the two crops are ever served publicly.
--
-- Photos are per PRODUCT, not per variant.
-- ---------------------------------------------------------------------------
create table product_photos (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references products(id) on delete cascade,

  crop         text not null check (crop in ('original', 'square', 'portrait')),

  -- Path within the Supabase Storage bucket.
  storage_path text not null,

  -- Intrinsic dimensions, so layout is reserved before the image loads and
  -- nothing shifts on a slow connection.
  width        int not null check (width > 0),
  height       int not null check (height > 0),

  -- Where the subject actually is, 0..1 in each axis. Centre by default;
  -- staff can move it from the admin panel when a centre crop is clearly
  -- wrong, and the crops get regenerated from the stored original.
  focal_x      numeric(4,3) not null default 0.5 check (focal_x between 0 and 1),
  focal_y      numeric(4,3) not null default 0.5 check (focal_y between 0 and 1),

  -- Where it came from, for auditing the import.
  source_url   text,

  created_at   timestamptz not null default now(),

  constraint product_photo_crop_unique unique (product_id, crop)
);

create index product_photos_product_idx on product_photos(product_id);

-- ---------------------------------------------------------------------------
-- Customers.
--
-- Name is the only genuinely required field. Roughly a quarter of the seeded
-- contacts have NO PHONE — they are historical names the owner recognises, and
-- they import anyway. Nothing may assume a phone is present.
-- ---------------------------------------------------------------------------
create table customers (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(trim(name)) > 0),

  -- Normalised to +505XXXXXXXX by the cleaning script. Nullable on purpose.
  -- Used for WhatsApp later.
  phone        text,
  phone_alt    text,

  email        text,
  city         text,
  address      text,

  -- For the day the business registers for fiscal invoicing. Unused for now.
  ruc          text,

  notes        text,

  -- Odoo res.partner id, for idempotent re-import.
  odoo_id      int unique,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Phone is the practical lookup key at the counter, but it is not unique:
-- families share numbers, and a quarter of records have none at all.
create index customers_phone_idx on customers(phone) where phone is not null;
create index customers_name_idx on customers using gin (to_tsvector('spanish', name));

create trigger customers_touch before update on customers
  for each row execute function touch_updated_at();
