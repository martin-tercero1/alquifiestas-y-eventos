/**
 * One-off: copy Bandeja Antideslizante's per-shape images off the old Odoo site
 * into Supabase Storage, recorded in product_option_photos so the public product
 * page swaps the picture when a customer picks a value of the "Forma" option
 * (Redonda / Cuadrado).
 *
 *   node scripts/import/import-bandeja-antideslizante.mjs
 *
 * Option-based (one variant + a Forma option), like the manteles. Ids from
 * get_combination_info display_name ("Bandeja Antideslizante (Cuadrado)"). RUN
 * EARLY — Odoo is being shut down. Idempotent; ?v= busts the CDN.
 */

import sharp from "sharp";
import { createAdminClient } from "../lib/admin-client.mjs";

const BUCKET = "catalog";
const PRODUCT_ID = "b52953a5-b5f9-4094-a9b9-5e2a7f977ddd"; // Bandeja Antideslizante
const ODOO = "https://alquifiestas.odoo.com/web/image/product.product";

// value name (exactly as in products.option_values) -> Odoo product.product id
const VALUES = {
  Redonda: 193,
  Cuadrado: 194,
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

  for (const [value, odooId] of Object.entries(VALUES)) {
    const { buffer, error } = await fetchImage(`${ODOO}/${odooId}/image_1920`);
    if (error) {
      failures.push(`${value}: ${error}`);
      continue;
    }

    let meta;
    try {
      meta = await sharp(buffer).metadata();
    } catch {
      failures.push(`${value}: not a decodable image`);
      continue;
    }

    const dir = `bandeja-antideslizante/colors/${slug(value)}`;
    const rows = [];

    const originalPath = `${dir}/original.jpg`;
    await upload(
      originalPath,
      await sharp(buffer).jpeg({ quality: 90 }).toBuffer(),
      "image/jpeg",
    );
    rows.push({
      product_id: PRODUCT_ID,
      option_value: value,
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
        option_value: value,
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
      failures.push(`${value}: db ${dbError.message}`);
      continue;
    }

    ok += 1;
    console.log(`✓ ${value} (odoo ${odooId})`);
  }

  console.log(`\nDone: ${ok}/${Object.keys(VALUES).length} values stored.`);
  if (failures.length) {
    console.log("Failures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
