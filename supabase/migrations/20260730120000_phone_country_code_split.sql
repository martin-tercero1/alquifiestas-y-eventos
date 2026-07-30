-- ---------------------------------------------------------------------------
-- Phone: country calling code + national number, stored separately
-- (Brief 04 §1)
--
-- The imported contacts carry a mix of "+505XXXXXXXX", bare 8-digit locals,
-- and a couple of genuinely foreign numbers. Neither customers nor staff will
-- ever type a country code, and the future WhatsApp API integration needs the
-- code stored, not guessed. So:
--
--   * `phone` stays the single source of truth, but is normalised to DIGITS
--     ONLY with a country code always present (a bare 8-digit local becomes
--     505XXXXXXXX). A trigger enforces this on every write, so the RPCs and the
--     import scripts need no changes.
--   * `phone_cc` and `phone_national` are GENERATED from the normalised phone:
--     the national number is the last 8 digits, the calling code is whatever
--     precedes it. For Nicaragua that is always 505; for the handful of foreign
--     numbers it is their real code (506 Costa Rica, 55 Brazil, …). Nothing is
--     guessed — the split is exact given the normalised form.
--
-- This is a reshaping, not a deletion: every digit that was present is still
-- present, now split into queryable parts.
-- ---------------------------------------------------------------------------

-- 1. Normalise existing data --------------------------------------------------
-- Strip anything that is not a digit; a bare 8-digit local gains its 505 code.
update customers
set phone = case
  when nullif(regexp_replace(phone, '\D', '', 'g'), '') is null then null
  when length(regexp_replace(phone, '\D', '', 'g')) = 8
    then '505' || regexp_replace(phone, '\D', '', 'g')
  else regexp_replace(phone, '\D', '', 'g')
end
where phone is not null;

update customers
set phone_alt = case
  when nullif(regexp_replace(phone_alt, '\D', '', 'g'), '') is null then null
  when length(regexp_replace(phone_alt, '\D', '', 'g')) = 8
    then '505' || regexp_replace(phone_alt, '\D', '', 'g')
  else regexp_replace(phone_alt, '\D', '', 'g')
end
where phone_alt is not null;

-- 2. Keep it normalised on every future write --------------------------------
create or replace function normalize_customer_phone()
returns trigger
language plpgsql
as $$
begin
  if new.phone is not null then
    new.phone := nullif(regexp_replace(new.phone, '\D', '', 'g'), '');
    if new.phone is not null and length(new.phone) = 8 then
      new.phone := '505' || new.phone;
    end if;
  end if;

  if new.phone_alt is not null then
    new.phone_alt := nullif(regexp_replace(new.phone_alt, '\D', '', 'g'), '');
    if new.phone_alt is not null and length(new.phone_alt) = 8 then
      new.phone_alt := '505' || new.phone_alt;
    end if;
  end if;

  return new;
end;
$$;

create trigger customers_normalize_phone
  before insert or update of phone, phone_alt on customers
  for each row execute function normalize_customer_phone();

-- 3. The separated view the UI and WhatsApp API read -------------------------
alter table customers
  add column phone_cc text generated always as (
    case
      when phone is null or length(phone) <= 8 then null
      else left(phone, length(phone) - 8)
    end
  ) stored,
  add column phone_national text generated always as (
    case when phone is null then null else right(phone, 8) end
  ) stored;

comment on column customers.phone is
  'Full international number, digits only (e.g. 50588887777). Source of truth; '
  'a bare 8-digit local is stored with its 505 code. phone_cc / phone_national '
  'are generated from it.';
comment on column customers.phone_cc is
  'Country calling code, split from phone (505 for Nicaragua).';
comment on column customers.phone_national is
  'National number: the last 8 digits of phone.';
