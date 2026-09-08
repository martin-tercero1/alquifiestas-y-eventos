-- Per-variant product images: one photo per (variant, crop). For products whose
-- variants are genuinely different things with their own look (e.g. Camino de
-- Mesa's fabrics: Satín Dorado, Yacar Rojo, Yacar Azul, Yute), so the public
-- product page can swap the picture when a customer picks a variant. Distinct
-- from product_option_photos (keyed by a product-level option value like a
-- mantel colour) and from product_photos (the single default image).
create table if not exists public.variant_photos (
  id           uuid primary key default gen_random_uuid(),
  variant_id   uuid not null references public.variants(id) on delete cascade,
  crop         text not null check (crop in ('square', 'portrait', 'original')),
  storage_path text not null,
  width        int  not null,
  height       int  not null,
  created_at   timestamptz not null default now(),
  unique (variant_id, crop)
);

alter table public.variant_photos enable row level security;

create policy "variant photos readable by anyone"
  on public.variant_photos for select
  using (true);

grant select on public.variant_photos to anon, authenticated;
