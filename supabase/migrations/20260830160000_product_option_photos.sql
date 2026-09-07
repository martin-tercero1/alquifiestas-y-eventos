-- Per-option-value product images: one photo per (product, option value, crop).
-- Products that use an option (e.g. Mantel Cuadrado's "Color") can now carry a
-- distinct image per value, so the public product page swaps the picture when a
-- customer picks a colour. Products without options are unaffected; their single
-- image stays in product_photos.
create table if not exists public.product_option_photos (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products(id) on delete cascade,
  option_value text not null,
  crop         text not null check (crop in ('square', 'portrait', 'original')),
  storage_path text not null,
  width        int  not null,
  height       int  not null,
  created_at   timestamptz not null default now(),
  unique (product_id, option_value, crop)
);

alter table public.product_option_photos enable row level security;

-- Public catalog is world-readable, like the rest of the published catalog.
create policy "option photos readable by anyone"
  on public.product_option_photos for select
  using (true);

-- Writes are service-role only (import scripts / future panel upload); no
-- insert/update/delete policy means RLS blocks anon and authenticated by default.
grant select on public.product_option_photos to anon, authenticated;
