/**
 * One-off: copy Mantel Redondo 10 personas' per-colour images off the old Odoo
 * site into Supabase Storage, recorded in product_option_photos so the public
 * product page swaps the picture when a customer picks a value of the
 * "Patrón/Color" option.
 *
 *   node scripts/import/import-mantel-redondo-colors.mjs
 *
 * Only the FIVE values that have a distinct image in Odoo are here: Azul, Verde
 * and Rojo returned the template fallback (same bytes as Blanco Liso), i.e. no
 * dedicated photo, so they are omitted and fall back to the product default on
 * the site rather than being given a wrong colour's image. Ids come from
 * get_combination_info's display_name ("... (Rosa Vieja)"), the authoritative
 * source. RUN EARLY — Odoo is being shut down. Idempotent; ?v= busts the CDN.
 */

import sharp from "sharp";
import { createAdminClient } from "../lib/admin-client.mjs";

const BUCKET = "catalog";
const PRODUCT_ID = "87a0c972-0786-4234-a3c7-604af288321e"; // Mantel Redondo 10 personas
const ODOO = "https://alquifiestas.odoo.com/web/image/product.product";

// colour name (exactly as in products.option_values) -> Odoo product.product id.
// Only the values with a real, distinct image.
const COLORS = {
  "Blanco Liso": 203,
  "Negro Liso": 204,
  "Crema Brocado": 206,
  "Blanco Brocado": 207,
  "Rosa Vieja": 205,
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
  const stamp = Date.now().toString(36);

  for (const [color, odooId] of Object.entries(COLORS)) {
    const { buffer, error } = await fetchImage(`${ODOO}/${odooId}/image_1920`);
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

    const dir = `mantel-redondo-10-personas/colors/${slug(color)}`;
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
