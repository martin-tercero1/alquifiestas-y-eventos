-- Slice 3 (Inventario): let staff edit the catalog from their phone, and make a
-- staff edit permanent against future imports.
--
-- The tables already carry price_source / quantity_source / label_overridden /
-- name_overridden columns and the import guards already refuse to touch a row
-- whose source is 'staff'. What was missing was the act of CLAIMING a field as
-- 'staff' the moment a person changes it. These triggers do exactly that, and
-- only for an interactive session: an import script runs with no auth.uid() and
-- keeps whatever source it sets, exactly like the existing set_updated_by trigger.

-- Variants: a hand-typed price or quantity is the truth from now on.
create or replace function stamp_variant_source()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null then
    if new.price_per_day is distinct from old.price_per_day then
      new.price_source := 'staff';
    end if;
    if new.total_quantity is distinct from old.total_quantity then
      new.quantity_source := 'staff';
    end if;
    if new.label is distinct from old.label then
      new.label_overridden := true;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists stamp_variant_source on variants;
create trigger stamp_variant_source before update on variants
for each row execute function stamp_variant_source();

-- Products: a renamed product keeps its staff name through re-imports.
create or replace function stamp_product_name()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and new.name is distinct from old.name then
    new.name_overridden := true;
  end if;
  return new;
end $$;

drop trigger if exists stamp_product_name on products;
create trigger stamp_product_name before update on products
for each row execute function stamp_product_name();

-- Photos: once a product actually has a usable photo, it is no longer
-- 'unavailable'. Keeps the missing-photo queue and the public site honest
-- without staff having to touch photo_status by hand.
create or replace function sync_photo_status()
returns trigger language plpgsql as $$
begin
  update products p
     set photo_status = 'imported'
   where p.id = new.product_id
     and p.photo_status is distinct from 'imported'
     and exists (
       select 1 from product_photos ph
       where ph.product_id = new.product_id
         and ph.crop in ('square', 'portrait')
     );
  return new;
end $$;

drop trigger if exists sync_photo_status on product_photos;
create trigger sync_photo_status after insert or update on product_photos
for each row execute function sync_photo_status();

-- Storage: let an authenticated staff phone upload (and replace) photos in the
-- public `catalog` bucket. Reads are already public; these cover writes only.
drop policy if exists "staff upload catalog" on storage.objects;
create policy "staff upload catalog"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'catalog');

drop policy if exists "staff replace catalog" on storage.objects;
create policy "staff replace catalog"
  on storage.objects for update to authenticated
  using (bucket_id = 'catalog')
  with check (bucket_id = 'catalog');
