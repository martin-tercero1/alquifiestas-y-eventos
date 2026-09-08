/**
 * One-off: copy Aro Metálico's per-variant (shape) images off the old Odoo site
 * into Supabase Storage, recorded in variant_photos so the public product page
 * swaps the picture when a customer picks a shape (Cuadrado / Ovalado / Redonda).
 *
 *   node scripts/import/import-aro-metalico-variants.mjs
 *
 * Like Camino de Mesa, these are genuine variants (each a product.product in
 * Odoo). Ids from get_combination_info's display_name ("Aro Metálico (Ovalado)"),
 * the authoritative source. RUN EARLY — Odoo is being shut down. Idempotent;
 * ?v= busts the CDN.
 */

import sharp from "sharp";
import { createAdminClient } from "../lib/admin-client.mjs";

const BUCKET = "catalog";
const ODOO = "https://alquifiestas.odoo.com/web/image/product.product";

// our variant id -> { storage slug, Odoo product.product id }
const VARIANTS = [
  { id: "fb1332a0-6a9b-4322-bc79-5e54802abf6a", slug: "cuadrado", odooId: 223 },
  { id: "7020bf18-b6e5-45af-b523-d2ee3e798def", slug: "ovalado", odooId: 225 },
  { id: "2e51d8ac-5307-40d5-b4a7-f6503ceb8319", slug: "redonda", odooId: 224 },
];

const CROPS = [
  { name: "square", width: 1000, height: 1000 },
  { name: "portrait", width: 1000, height: 1250 },
];

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

  for (const v of VARIANTS) {
    const { buffer, error } = await fetchImage(`${ODOO}/${v.odooId}/image_1920`);
    if (error) {
      failures.push(`${v.slug}: ${error}`);
      continue;
    }

    let meta;
    try {
      meta = await sharp(buffer).metadata();
    } catch {
      failures.push(`${v.slug}: not a decodable image`);
      continue;
    }

    const dir = `aro-metalico/variants/${v.slug}`;
    const rows = [];

    const originalPath = `${dir}/original.jpg`;
    await upload(
      originalPath,
      await sharp(buffer).jpeg({ quality: 90 }).toBuffer(),
      "image/jpeg",
    );
    rows.push({
      variant_id: v.id,
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
        variant_id: v.id,
        crop: crop.name,
        storage_path: `${path}?v=${stamp}`,
        width: crop.width,
        height: crop.height,
      });
    }

    const { error: dbError } = await supabase
      .from("variant_photos")
      .upsert(rows, { onConflict: "variant_id,crop" });
    if (dbError) {
      failures.push(`${v.slug}: db ${dbError.message}`);
      continue;
    }

    ok += 1;
    console.log(`✓ ${v.slug} (odoo ${v.odooId})`);
  }

  console.log(`\nDone: ${ok}/${VARIANTS.length} variants stored.`);
  if (failures.length) {
    console.log("Failures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
