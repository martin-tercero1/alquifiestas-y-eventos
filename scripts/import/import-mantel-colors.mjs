/**
 * One-off: copy Mantel Cuadrado's per-colour images off the old Odoo site into
 * Supabase Storage, and record them in product_option_photos so the public
 * product page can swap the picture when a customer picks a colour.
 *
 *   node scripts/import/import-mantel-colors.mjs
 *
 * RUN EARLY — the Odoo instance is being shut down and these per-variant images
 * disappear with it. In Odoo each colour is a product.product variant with its
 * own image_1920; the ids below were read off the live shop page's
 * get_combination_info responses. "Navideño" has no variant image (product_id
 * false), so it is intentionally absent and falls back to the product's default
 * image on the site.
 *
 * Idempotent: re-running overwrites the stored objects and rows.
 */

import sharp from "sharp";
import { createAdminClient } from "../lib/admin-client.mjs";

const BUCKET = "catalog";
const PRODUCT_ID = "8c854a89-937e-44a5-82ca-438cfbeca92f"; // Mantel Cuadrado
const ODOO = "https://alquifiestas.odoo.com/web/image/product.product";

// colour name (exactly as stored in products.option_values) -> Odoo product.product id.
// The ids are the REAL colour of each variant, taken from get_combination_info's
// display_name ("Mantel Cuadrado (Lila)") — NOT the swatch's attribute-value id,
// which is permuted relative to the labels and caused mismatched images.
const COLORS = {
  Celeste: 19,
  Plateado: 20,
  Rosado: 21,
  "Verde Oscuro": 22,
  Lila: 23,
  Morado: 24,
  Azul: 25,
  Fuscia: 26,
  "Azul Satinado": 27,
  Amarillo: 28,
  Rojo: 8,
  "Rojo Vino": 9,
  Aqua: 10,
  Negro: 11,
  Naranja: 12,
  Blanco: 13,
  "Verde Claro": 14,
  Dorado: 15,
};

const CROPS = [
  { name: "square", width: 1000, height: 1000 },
  { name: "portrait", width: 1000, height: 1250 },
];

const slug = (s) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-");

const supabase = createAdminClient();

async function fetchImage(url) {
  const res = await fetch(url);
  if (!res.ok) return { error: `HTTP ${res.status}` };
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength < 1024) return { error: "empty/placeholder" };
  return { buffer };
}

async function upload(path, body, contentType) {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, body, { contentType, upsert: true });
  if (error) throw error;
  return path;
}

async function run() {
  let ok = 0;
  const failures = [];
  // Cache-buster kept only in the stored path (never in the object key), so a
  // re-import with corrected images is served fresh instead of a stale CDN copy.
  const stamp = Date.now().toString(36);

  for (const [color, odooId] of Object.entries(COLORS)) {
    const url = `${ODOO}/${odooId}/image_1920`;
    const { buffer, error } = await fetchImage(url);
    if (error) {
      failures.push(`${color}: ${error}`);
      continue;
    }

    let meta;
    try {
      meta = await sharp(buffer).metadata();
    } catch {
      failures.push(`${color}: not a decodable image`);
      continue;
    }

    const dir = `mantel-cuadrado/colors/${slug(color)}`;
    const rows = [];

    const originalPath = `${dir}/original.jpg`;
    await upload(
      originalPath,
      await sharp(buffer).jpeg({ quality: 90 }).toBuffer(),
      "image/jpeg",
    );
    rows.push({
      product_id: PRODUCT_ID,
      option_value: color,
      crop: "original",
      storage_path: `${originalPath}?v=${stamp}`,
      width: meta.width ?? 0,
      height: meta.height ?? 0,
    });

    for (const crop of CROPS) {
      const path = `${dir}/${crop.name}.jpg`;
      const out = await sharp(buffer)
        .resize(crop.width, crop.height, {
          fit: "cover",
          position: sharp.strategy.attention,
        })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();
      await upload(path, out, "image/jpeg");
      rows.push({
        product_id: PRODUCT_ID,
        option_value: color,
        crop: crop.name,
        storage_path: `${path}?v=${stamp}`,
        width: crop.width,
        height: crop.height,
      });
    }

    const { error: dbError } = await supabase
      .from("product_option_photos")
      .upsert(rows, { onConflict: "product_id,option_value,crop" });
    if (dbError) {
      failures.push(`${color}: db ${dbError.message}`);
      continue;
    }

    ok += 1;
    console.log(`✓ ${color} (odoo ${odooId})`);
  }

  console.log(`\nDone: ${ok}/${Object.keys(COLORS).length} colours stored.`);
  if (failures.length) {
    console.log("Failures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
