/**
 * One-off: copy Camino de Mesa's per-variant (fabric) images off the old Odoo
 * site into Supabase Storage, recorded in variant_photos so the public product
 * page swaps the picture when a customer picks a fabric.
 *
 *   node scripts/import/import-camino-variants.mjs
 *
 * Unlike Mantel Cuadrado (one variant + a Colour option), Camino de Mesa is four
 * genuine variants with their own prices and images. In Odoo each is a
 * product.product; the ids below were read off get_combination_info's
 * display_name ("Camino de Mesa (Yute)") on the live shop, the authoritative
 * source. RUN EARLY — the Odoo instance is being shut down.
 *
 * Idempotent: re-running overwrites the objects and rows; the stored path gets a
 * ?v= stamp so a corrected image bypasses the CDN cache.
 */

import sharp from "sharp";
import { createAdminClient } from "../lib/admin-client.mjs";

const BUCKET = "catalog";
const ODOO = "https://alquifiestas.odoo.com/web/image/product.product";

// our variant id -> { label, storage slug, Odoo product.product id }
const VARIANTS = [
  {
    id: "8829ae40-bfd6-4c1d-bd7e-52ec2044f049",
    slug: "satin-dorado",
    odooId: 227,
  },
  {
    id: "2c4d0c64-3458-48e7-90e4-57f22b24e045",
    slug: "yacar-brocado-rojo",
    odooId: 229,
  },
  {
    id: "79fad44f-fa7b-448c-b843-47b8a3693684",
    slug: "yacar-brocado-azul",
    odooId: 230,
  },
  { id: "906d02b0-b5e6-4572-af05-1ccee99898a6", slug: "yute", odooId: 110 },
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
    const url = `${ODOO}/${v.odooId}/image_1920`;
    const { buffer, error } = await fetchImage(url);
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

    const dir = `camino-de-mesa/variants/${v.slug}`;
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
