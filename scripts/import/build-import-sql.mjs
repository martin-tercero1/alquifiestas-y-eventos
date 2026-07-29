/**
 * Builds the catalog + contacts import as idempotent SQL.
 *
 *   node scripts/import/build-import-sql.mjs
 *   -> supabase/seed/import.sql
 *
 * This is a REPEATABLE IMPORT, not a one-off seed. The source CSVs will be
 * corrected and loaded again, so re-running must never duplicate a row and
 * must never overwrite what staff have entered by hand:
 *
 *   - price_per_day and total_quantity are NEVER written, on insert or update.
 *     They are absent from the export entirely, and they are the fields staff
 *     fill in from the admin panel. The import has no business touching them.
 *   - names and labels are only refreshed when the corresponding *_overridden
 *     flag is false, so an edit made in the admin panel survives a re-import.
 *   - identity is the CSV's `unidad_alquilable` for variants (source_key) and
 *     the Odoo database id for products and customers.
 *
 * Emitting SQL rather than writing directly keeps the whole import reviewable
 * before it touches the database, and lets it be applied through the same
 * migration path as everything else.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { correctName, slugify } from "./name-corrections.mjs";
import { parseCsv } from "../lib/csv.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SEED = join(ROOT, "src", "data", "seed");
const OUT_DIR = join(ROOT, "supabase", "seed");

// ---------------------------------------------------------------------------
// Rows deliberately not imported
// ---------------------------------------------------------------------------

const EXCLUDED = {
  // "Transporte" is the delivery service, not a rentable item — it is filed
  // under Mesas in Odoo only because everything needed a category. Delivery is
  // always quoted by hand with a transporter and there is no delivery pricing
  // anywhere in this system, so importing it as a catalog line would invite
  // exactly the mistake the spec rules out.
  147: "Transporte: a service, not rentable inventory",

  // "Cortinas": the cleaning script split a two-attribute variant label on its
  // internal comma, leaving four corrupt fragments — "(Blanco", "(Rojo",
  // "Grande)", "Normal)". The real variants cannot be reconstructed without
  // inventing stock, and the owner confirms it is not a product they rent
  // often, so it stays out. Add it by hand from the admin panel if that
  // changes; it is not worth carrying corrupt source data for.
  102: "Cortinas: corrupt source labels, and a product the business rarely rents",
};

// Top-level category order for the public site.
const CATEGORY_ORDER = [
  "Sillas",
  "Mesas",
  "Mantelería",
  "Cristalería",
  "Decoración",
  "Caballo Bayo",
  "Utensilios",
];

// ---------------------------------------------------------------------------
// SQL helpers
// ---------------------------------------------------------------------------

const q = (value) => {
  if (value === null || value === undefined || value === "") return "null";
  return `'${String(value).replace(/'/g, "''")}'`;
};

const categoryRef = (slug) => `(select id from categories where slug = ${q(slug)})`;
const productRef = (odooId) => `(select id from products where odoo_id = ${odooId})`;

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

const catalogRows = parseCsv(readFileSync(join(SEED, "catalogo-limpio.csv"), "utf8"));
const contactRows = parseCsv(readFileSync(join(SEED, "contactos-limpio.csv"), "utf8"));

const skipped = [];
const rows = catalogRows.filter((r) => {
  const reason = EXCLUDED[Number(r.db_id)];
  if (reason) {
    skipped.push({ unit: r.unidad_alquilable, reason });
    return false;
  }
  return true;
});

// ---- Categories -----------------------------------------------------------
const parents = new Map(); // slug -> { name, order }
const children = new Map(); // slug -> { name, parentSlug, order }

for (const r of rows) {
  const mainName = r.categoria_principal.trim();
  if (!mainName) continue;

  const mainSlug = slugify(mainName);
  if (!parents.has(mainSlug)) {
    const order = CATEGORY_ORDER.indexOf(mainName);
    parents.set(mainSlug, {
      name: mainName,
      order: order === -1 ? CATEGORY_ORDER.length : order,
    });
  }

  const subName = r.subcategoria.trim();
  if (!subName) continue;

  const subSlug = `${mainSlug}-${slugify(subName)}`;
  if (!children.has(subSlug)) {
    children.set(subSlug, { name: subName, parentSlug: mainSlug, order: children.size });
  }
}

/** A product sits in its subcategory when it has one, otherwise in the parent. */
function categorySlugFor(row) {
  const mainSlug = slugify(row.categoria_principal.trim());
  const sub = row.subcategoria.trim();
  return sub ? `${mainSlug}-${slugify(sub)}` : mainSlug;
}

// ---- Products -------------------------------------------------------------
const products = new Map(); // odoo_id -> product

for (const r of rows) {
  const odooId = Number(r.db_id);
  const existing = products.get(odooId);

  // Internal notes arrive per row; in practice every variant of a product
  // carries the same one. Collect the distinct set so nothing is dropped.
  const note = r.nota_interna.trim();

  if (existing) {
    if (note && !existing.notes.includes(note)) existing.notes.push(note);
    continue;
  }

  const name = correctName(r.producto);
  products.set(odooId, {
    odooId,
    name,
    sourceName: r.producto.trim(),
    slug: slugify(name),
    categorySlug: categorySlugFor(r),
    notes: note ? [note] : [],
    imageUrl: r.url_imagen.trim(),
  });
}

// ---- Variants -------------------------------------------------------------
const variants = rows.map((r) => {
  const rawLabel = r.variante.trim();
  return {
    sourceKey: r.unidad_alquilable.trim(),
    odooId: Number(r.db_id),
    // NULL label = the implicit single variant of a product with no variants.
    // Every product has at least one, so nothing downstream needs to branch.
    label: rawLabel ? correctName(rawLabel) : null,
    sourceLabel: rawLabel || null,
    published: r.publicado.trim().toLowerCase() === "si",
  };
});

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

// One bulk statement per table rather than one statement per row: it keeps the
// generated file reviewable, applies in a fraction of the time, and lets each
// table be applied on its own.

const header = `-- Generated by scripts/import/build-import-sql.mjs — do not edit by hand.
-- Source: src/data/seed/catalogo-limpio.csv, src/data/seed/contactos-limpio.csv
--
-- Idempotent: safe to run repeatedly. Never writes price_per_day or
-- total_quantity, and never overwrites a name or label staff have overridden.
--
-- Products:  ${products.size}
-- Variants:  ${variants.length}
-- Customers: ${contactRows.length}
-- Skipped:   ${skipped.length} rows (see EXCLUDED in the build script)
`;

const parentValues = [...parents]
  .sort((a, b) => a[1].order - b[1].order)
  .map(([slug, c]) => `  (${q(slug)}, ${q(c.name)}, ${c.order})`)
  .join(",\n");

const childValues = [...children]
  .map(([slug, c]) => `  (${q(slug)}, ${q(c.name)}, ${q(c.parentSlug)}, ${c.order})`)
  .join(",\n");

const categoriesSql = `-- ---- Categories ------------------------------------------------------
-- Top-level first, then subcategories, which resolve their parent by slug.

insert into categories (slug, name, parent_id, display_order)
select v.slug::text, v.name::text, null, v.display_order::int
from (values
${parentValues}
) as v(slug, name, display_order)
on conflict (slug) do update set
  name = excluded.name,
  parent_id = excluded.parent_id,
  display_order = excluded.display_order;

insert into categories (slug, name, parent_id, display_order)
select v.slug::text, v.name::text, p.id, v.display_order::int
from (values
${childValues}
) as v(slug, name, parent_slug, display_order)
join categories p on p.slug = v.parent_slug::text
on conflict (slug) do update set
  name = excluded.name,
  parent_id = excluded.parent_id,
  display_order = excluded.display_order;
`;

const productValues = [...products.values()]
  .map(
    (p) =>
      `  (${p.odooId}, ${q(p.slug)}, ${q(p.name)}, ${q(p.sourceName)}, ${q(p.categorySlug)}, ${q(p.notes.join(" · ") || null)})`,
  )
  .join(",\n");

const productsSql = `-- ---- Products --------------------------------------------------------
-- internal_note carries staff notes migrated from Odoo ("Stock desactualizado",
-- "Los 3 valen 500"). It is never exposed publicly — it is absent from the
-- public_catalog view and anon has no table access.

insert into products (odoo_id, slug, name, source_name, category_id, internal_note)
select v.odoo_id::int, v.slug::text, v.name::text, v.source_name::text, c.id, v.internal_note::text
from (values
${productValues}
) as v(odoo_id, slug, name, source_name, category_slug, internal_note)
join categories c on c.slug = v.category_slug::text
on conflict (odoo_id) do update set
  slug = excluded.slug,
  name = case when products.name_overridden then products.name else excluded.name end,
  source_name = excluded.source_name,
  category_id = excluded.category_id,
  internal_note = excluded.internal_note;
`;

const variantValues = variants
  .map(
    (v) =>
      `  (${q(v.sourceKey)}, ${v.odooId}, ${q(v.label)}, ${q(v.sourceLabel)}, ${v.published})`,
  )
  .join(",\n");

const variantsSql = `-- ---- Variants (the rentable unit) ------------------------------------
-- A NULL label is the implicit single variant of a product that has no real
-- variants, so nothing downstream ever branches on "does this have variants".
--
-- price_per_day and total_quantity are absent on purpose, from BOTH the insert
-- and the update. They are staff-entered, and the import must never touch them.

insert into variants (source_key, product_id, label, source_label, published)
select v.source_key::text, p.id, v.label::text, v.source_label::text, v.published::boolean
from (values
${variantValues}
) as v(source_key, odoo_id, label, source_label, published)
join products p on p.odoo_id = v.odoo_id::int
on conflict (source_key) do update set
  product_id = excluded.product_id,
  label = case when variants.label_overridden then variants.label else excluded.label end,
  source_label = excluded.source_label,
  published = excluded.published;
`;

const customerValues = contactRows
  .filter((c) => Number.isFinite(Number(c.db_id)) && c.nombre.trim())
  .map(
    (c) =>
      `  (${Number(c.db_id)}, ${q(c.nombre)}, ${q(c.telefono)}, ${q(c.telefono_alt)}, ${q(c.email)}, ${q(c.ciudad)}, ${q(c.ruc)})`,
  )
  .join(",\n");

const customersSql = `-- ---- Customers -------------------------------------------------------
-- Roughly a quarter have no phone at all. They are historical names the owner
-- recognises, and they import anyway — nothing may assume a phone is present.
-- On re-import an existing value is kept when the source has none, so a blank
-- column in a corrected export never erases a number somebody typed in.

insert into customers (odoo_id, name, phone, phone_alt, email, city, ruc)
select v.odoo_id::int, v.name::text, v.phone::text, v.phone_alt::text,
       v.email::text, v.city::text, v.ruc::text
from (values
${customerValues}
) as v(odoo_id, name, phone, phone_alt, email, city, ruc)
on conflict (odoo_id) do update set
  name = excluded.name,
  phone = coalesce(excluded.phone, customers.phone),
  phone_alt = coalesce(excluded.phone_alt, customers.phone_alt),
  email = coalesce(excluded.email, customers.email),
  city = coalesce(excluded.city, customers.city),
  ruc = coalesce(excluded.ruc, customers.ruc);
`;

mkdirSync(OUT_DIR, { recursive: true });

const parts = [
  ["01-categories.sql", categoriesSql],
  ["02-products.sql", productsSql],
  ["03-variants.sql", variantsSql],
  ["04-customers.sql", customersSql],
];

for (const [filename, body] of parts) {
  writeFileSync(join(OUT_DIR, filename), `${header}\n${body}`);
}

writeFileSync(
  join(OUT_DIR, "import.sql"),
  `${header}\nbegin;\n\n${parts.map(([, body]) => body).join("\n")}\ncommit;\n`,
);

// Also record the image URLs, so the photo import can run standalone without
// re-parsing the CSV.
writeFileSync(
  join(OUT_DIR, "photo-sources.json"),
  JSON.stringify(
    [...products.values()].map((p) => ({
      odooId: p.odooId,
      slug: p.slug,
      name: p.name,
      imageUrl: p.imageUrl,
    })),
    null,
    2,
  ),
);

console.log(`Wrote supabase/seed/import.sql`);
console.log(`  categories : ${parents.size} top-level, ${children.size} sub`);
console.log(`  products   : ${products.size}`);
console.log(`  variants   : ${variants.length}`);
console.log(`  customers  : ${contactRows.length}`);
console.log(`  skipped    : ${skipped.length}`);
for (const s of skipped) console.log(`      - ${s.unit}  (${s.reason})`);
