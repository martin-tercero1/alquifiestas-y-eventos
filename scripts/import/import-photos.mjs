/**
 * Copies product photos off the old Odoo site into Supabase Storage.
 *
 *   node scripts/import/import-photos.mjs           # only products still pending
 *   node scripts/import/import-photos.mjs --all     # re-fetch everything
 *   node scripts/import/import-photos.mjs --limit 10
 *
 * RUN THIS EARLY. The Odoo instance is being shut down when its subscription
 * lapses, and whatever has not been copied by then is gone for good. Nothing
 * hotlinks the old site — a hotlinked image would die with it.
 *
 * Runnable on its own, separate from the data import, so it can be re-run to
 * pick up images that become available later.
 *
 * MANY FETCHES WILL FAIL, AND THAT IS EXPECTED. The unpublished products very
 * likely do not expose their images publicly, and some products never had one.
 * A failure marks the product as pending a photo and moves on: the run never
 * retries in a loop, never aborts, and never fails a record over an image.
 *
 * Each successful fetch produces THREE stored objects:
 *   original  — kept so crops can be regenerated after Odoo is gone
 *   square    — 1:1, for grids
 *   portrait  — 4:5, for the item detail page
 *
 * Those two ratios are the only ones the design system allows, and cropping
 * happens here rather than in the browser: a badly framed WhatsApp photo
 * cropped by CSS is exactly the failure the matting system exists to prevent.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { createAdminClient } from "../lib/admin-client.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BUCKET = "catalog";

const CROPS = [
  { name: "square", width: 1000, height: 1000 },
  { name: "portrait", width: 1000, height: 1250 },
];

/**
 * Odoo does NOT 404 for a product with no image. It serves its own grey
 * "no image" placeholder with a 200, so a naive fetch reports success for
 * every single product and the catalog quietly fills with identical grey
 * squares. On this shop's data that was 40 of 103.
 *
 * Rather than hardcode a hash that would rot the first time Odoo changes its
 * placeholder, the run calibrates itself: it asks for the image of a product
 * id that cannot exist, and whatever comes back IS the placeholder.
 */
const PLACEHOLDER_PROBE_URL =
  "https://www.alquifiestasyeventos.com/web/image/product.template/99999999/image_1920";

const placeholderHashes = new Set();

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function calibratePlaceholder() {
  const { buffer } = await fetchImage(PLACEHOLDER_PROBE_URL);
  if (buffer) {
    placeholderHashes.add(sha256(buffer));
    console.log(
      `Calibrated: Odoo's "no image" placeholder is ${buffer.byteLength} bytes.\n`,
    );
  } else {
    console.log(
      "Could not calibrate the placeholder — every 200 will be treated as a real photo.\n",
    );
  }
}

const args = process.argv.slice(2);
const refetchAll = args.includes("--all");
const limitArg = args.indexOf("--limit");
const limit = limitArg !== -1 ? Number(args[limitArg + 1]) : Infinity;

const supabase = createAdminClient();

// ---------------------------------------------------------------------------

async function ensureBucket() {
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (data) return;

  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  });
  if (error && !/already exists/i.test(error.message)) throw error;
}

/** Fetches with a timeout, so one dead URL cannot stall the whole run. */
async function fetchImage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return { error: `HTTP ${response.status}` };

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength < 1024) return { error: "empty or placeholder image" };

    return { buffer };
  } catch (error) {
    return { error: error.name === "AbortError" ? "timeout" : error.message };
  } finally {
    clearTimeout(timer);
  }
}

/** Removes any stored crops for a product, in storage and in the database. */
async function clearPhotos(product) {
  const { data: row } = await supabase
    .from("products")
    .select("id")
    .eq("odoo_id", product.odooId)
    .single();
  if (!row) return;

  await supabase.storage
    .from(BUCKET)
    .remove([
      `${product.slug}/original.jpg`,
      `${product.slug}/square.jpg`,
      `${product.slug}/portrait.jpg`,
    ]);
  await supabase.from("product_photos").delete().eq("product_id", row.id);
}

async function upload(path, body, contentType) {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, body, { contentType, upsert: true });
  if (error) throw error;
  return path;
}

async function processProduct(product) {
  const { buffer, error } = await fetchImage(product.imageUrl);

  if (error) {
    await supabase
      .from("products")
      .update({ photo_status: "unavailable" })
      .eq("odoo_id", product.odooId);
    return { status: "unavailable", reason: error };
  }

  // A 200 carrying Odoo's placeholder means "this product has no photo".
  if (placeholderHashes.has(sha256(buffer))) {
    await supabase
      .from("products")
      .update({ photo_status: "unavailable" })
      .eq("odoo_id", product.odooId);
    // Clear anything a previous run stored for this product, so a placeholder
    // imported before this check existed does not linger in the catalog.
    await clearPhotos(product);
    return { status: "unavailable", reason: "Odoo has no photo for this product" };
  }

  let meta;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    await supabase
      .from("products")
      .update({ photo_status: "unavailable" })
      .eq("odoo_id", product.odooId);
    return { status: "unavailable", reason: "not a decodable image" };
  }

  const { data: row } = await supabase
    .from("products")
    .select("id")
    .eq("odoo_id", product.odooId)
    .single();

  if (!row) return { status: "skipped", reason: "product not in database" };

  const rows = [];

  // The original, so crops can be redone once Odoo is gone.
  const originalPath = `${product.slug}/original.jpg`;
  const originalJpeg = await sharp(buffer).jpeg({ quality: 90 }).toBuffer();
  await upload(originalPath, originalJpeg, "image/jpeg");
  rows.push({
    product_id: row.id,
    crop: "original",
    storage_path: originalPath,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    source_url: product.imageUrl,
  });

  // The two ratios the design system allows. `attention` picks the crop window
  // by visual salience rather than dead centre, which matters when the subject
  // is off to one side — as it usually is in these photos.
  for (const crop of CROPS) {
    const path = `${product.slug}/${crop.name}.jpg`;
    const output = await sharp(buffer)
      .resize(crop.width, crop.height, {
        fit: "cover",
        position: sharp.strategy.attention,
      })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();

    await upload(path, output, "image/jpeg");
    rows.push({
      product_id: row.id,
      crop: crop.name,
      storage_path: path,
      width: crop.width,
      height: crop.height,
      source_url: product.imageUrl,
    });
  }

  const { error: upsertError } = await supabase
    .from("product_photos")
    .upsert(rows, { onConflict: "product_id,crop" });
  if (upsertError) throw upsertError;

  await supabase
    .from("products")
    .update({ photo_status: "imported" })
    .eq("odoo_id", product.odooId);

  return { status: "imported" };
}

// ---------------------------------------------------------------------------

await ensureBucket();
await calibratePlaceholder();

const sources = JSON.parse(
  readFileSync(join(ROOT, "supabase", "seed", "photo-sources.json"), "utf8"),
);

// Only products that still need one, unless --all. Staff-uploaded photos are
// never overwritten by a re-run.
let pending = sources;
if (!refetchAll) {
  const { data } = await supabase
    .from("products")
    .select("odoo_id")
    .in("photo_status", ["pending", "unavailable"]);
  const wanted = new Set((data ?? []).map((p) => p.odoo_id));
  pending = sources.filter((s) => wanted.has(s.odooId));
}

pending = pending.filter((p) => p.imageUrl).slice(0, limit);

console.log(`Fetching ${pending.length} product photos from the Odoo site...\n`);

const tally = { imported: 0, unavailable: 0, skipped: 0 };
const failures = [];

for (const product of pending) {
  let result;
  try {
    result = await processProduct(product);
  } catch (error) {
    result = { status: "skipped", reason: error.message };
  }

  tally[result.status] = (tally[result.status] ?? 0) + 1;
  if (result.status !== "imported") {
    failures.push(`${product.name} — ${result.reason}`);
  }

  process.stdout.write(result.status === "imported" ? "." : "x");
}

console.log("\n");
console.log(`  imported    : ${tally.imported}`);
console.log(`  unavailable : ${tally.unavailable}`);
console.log(`  skipped     : ${tally.skipped}`);

if (failures.length > 0) {
  console.log(
    `\n${failures.length} products have no photo yet. This is expected, not an error —`,
  );
  console.log("they are queued in the products_missing_photo view for staff to upload:\n");
  for (const failure of failures.slice(0, 20)) console.log(`  - ${failure}`);
  if (failures.length > 20) console.log(`  ... and ${failures.length - 20} more`);
}
