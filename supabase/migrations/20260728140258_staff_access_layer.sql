-- The admin panel's data layer.
--
-- Until now every table had RLS on and NO policies at all: the public site
-- reads through one view and writes through one SECURITY DEFINER function, so
-- nothing else needed access. A logged-in staff user could not read a row.
--
-- The model here is deliberately flat. There is no self-registration and the
-- developer creates the two or three accounts by hand, so *any authenticated
-- user is staff*. Roles and per-row ownership would be machinery protecting
-- against a situation that cannot arise, and machinery is what killed Odoo.
--
-- The one rule that IS enforced structurally: nothing is ever deleted. DELETE
-- is never granted and no delete policy exists, so "cancel, don't delete"
-- stops being a convention someone has to remember and becomes something the
-- database will not do.

-- ---------------------------------------------------------------------------
-- Forgiving search
-- ---------------------------------------------------------------------------

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- unaccent() is stable, not immutable, because a dictionary can be reloaded.
-- The two-argument form pins the dictionary and so is safe to treat as
-- immutable, which is what lets this be used in indexes later.
create or replace function search_normalize(input text)
returns text
language sql immutable strict parallel safe
set search_path = extensions, public
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, input))
$$;

comment on function search_normalize is
  'Accent- and case-folded form used on both sides of every search comparison, so "manteleria" matches "Mantelería".';

-- ---------------------------------------------------------------------------
-- Who is using the panel
-- ---------------------------------------------------------------------------

create table if not exists staff (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

comment on table staff is
  'One row per person with a login. Populated automatically when the developer creates an account, so a new account works without a second manual step.';

-- Accounts are created in the Supabase dashboard, not by this application.
-- Without this trigger a new account would have a login but no name, and
-- "who took this order?" would answer with a UUID.
create or replace function handle_new_staff_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.staff (user_id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_staff_user();

-- Backfill anyone who already has an account.
insert into staff (user_id, display_name)
select id, split_part(email, '@', 1) from auth.users
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- Attribution
-- ---------------------------------------------------------------------------
-- Not for policing. For answering "who took this order?" when a customer
-- disputes something, which is a question paper answers by handwriting.

alter table orders            add column if not exists created_by uuid references auth.users(id) default auth.uid();
alter table orders            add column if not exists updated_by uuid references auth.users(id);
alter table order_lines       add column if not exists created_by uuid references auth.users(id) default auth.uid();
alter table payments          add column if not exists created_by uuid references auth.users(id) default auth.uid();
alter table charges           add column if not exists created_by uuid references auth.users(id) default auth.uid();
alter table return_events     add column if not exists created_by uuid references auth.users(id) default auth.uid();
alter table customers         add column if not exists created_by uuid references auth.users(id) default auth.uid();
alter table variants          add column if not exists updated_by uuid references auth.users(id);

create or replace function touch_updated_by()
returns trigger language plpgsql as $$
begin
  -- Left alone for import scripts, which run without a session.
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists set_updated_by on orders;
create trigger set_updated_by before update on orders
  for each row execute function touch_updated_by();

drop trigger if exists set_updated_by on variants;
create trigger set_updated_by before update on variants
  for each row execute function touch_updated_by();

-- ---------------------------------------------------------------------------
-- Grants and policies
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
  business_tables text[] := array[
    'categories', 'products', 'variants', 'product_photos', 'customers',
    'orders', 'order_lines', 'payments', 'charges', 'return_events',
    'stock_adjustments', 'order_status_history', 'documents', 'staff'
  ];
begin
  foreach t in array business_tables loop
    -- SELECT, INSERT, UPDATE. Never DELETE.
    execute format('grant select, insert, update on public.%I to authenticated', t);

    execute format('drop policy if exists staff_select on public.%I', t);
    execute format(
      'create policy staff_select on public.%I for select to authenticated using (true)', t);

    execute format('drop policy if exists staff_insert on public.%I', t);
    execute format(
      'create policy staff_insert on public.%I for insert to authenticated with check (true)', t);

    execute format('drop policy if exists staff_update on public.%I', t);
    execute format(
      'create policy staff_update on public.%I for update to authenticated using (true) with check (true)', t);
  end loop;
end;
$$;

-- Belt and braces: whatever else happens above, staff cannot delete.
revoke delete on all tables in schema public from authenticated;

-- The views had every privilege granted, including DELETE and TRUNCATE, from
-- an earlier default-privileges pass. Staff need to read them, nothing more.
do $$
declare v text;
begin
  foreach v in array array[
    'public_catalog', 'order_totals', 'catalog_gaps_summary',
    'category_rental_rank', 'variants_missing_price',
    'variants_missing_quantity', 'products_missing_photo', 'estimated_values'
  ] loop
    execute format('revoke all on public.%I from authenticated', v);
    execute format('grant select on public.%I to authenticated', v);
  end loop;
end;
$$;

-- availability_conflicts names customers, so it stays staff-only — but staff
-- genuinely need it to answer "committed where?" on a shortage.
grant execute on function availability_conflicts(uuid, date, date) to authenticated;
