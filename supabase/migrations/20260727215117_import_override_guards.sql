-- ============================================================================
-- Guards so a re-run of the import can never overwrite staff work.
--
-- The import is re-runnable by design: the source CSVs will be corrected and
-- loaded again. Price and quantity are never at risk because the export does
-- not contain them and the import never writes them at all.
--
-- Names are different — they come only from the import, so staff editing one
-- needs a way to say "leave this alone". The admin panel sets these flags when
-- somebody edits a name, and the import respects them.
-- ============================================================================

alter table products add column name_overridden boolean not null default false;
alter table variants add column label_overridden boolean not null default false;

comment on column products.name_overridden is
  'Set by the admin panel when staff edit the product name. The import will not overwrite it.';
comment on column variants.label_overridden is
  'Set by the admin panel when staff edit the variant label. The import will not overwrite it.';
