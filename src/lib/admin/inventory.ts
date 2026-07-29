import { panelClient } from "@/lib/supabase/panel";
import type { Database } from "@/lib/supabase/types";

type VariantUpdate = Database["public"]["Tables"]["variants"]["Update"];
type ProductUpdate = Database["public"]["Tables"]["products"]["Update"];
type PhotoInsert = Database["public"]["Tables"]["product_photos"]["Insert"];

/**
 * The catalog edits, from the phone.
 *
 * These are plain table writes, not RPCs: the tables carry staff RLS and the
 * database stamps the consequences of an edit itself (see the
 * inventory_editing migration) — a changed price becomes price_source='staff',
 * a renamed product becomes name_overridden — so the panel cannot forget to
 * protect a hand-typed value from the next import. This module only has to say
 * WHAT changed.
 *
 * Every call returns a plain ok/error so the caller can keep the person's typed
 * value on screen if the network drops, the same promise the proforma makes.
 */

export type EditResult = { ok: true } | { ok: false; message: string };

const OFFLINE =
  "No se pudo guardar: parece que no hay conexión. Probá otra vez en un momento.";
const FAILED = "No se pudo guardar. Probá otra vez.";

function fail(error: { message?: string } | null): { ok: false; message: string } {
  const offline = /fetch|network|failed to fetch/i.test(error?.message ?? "");
  return { ok: false, message: offline ? OFFLINE : FAILED };
}

// ---------------------------------------------------------------------------
// Variant fields
// ---------------------------------------------------------------------------

/**
 * Saves whichever variant fields changed. Price and quantity are sent as-is:
 * null is a real, kept value ("we don't know / don't count this"), distinct
 * from 0. The database claims changed money/counts as 'staff'.
 */
export async function saveVariant(
  variantId: string,
  fields: {
    label?: string | null;
    pricePerDay?: number | null;
    totalQuantity?: number | null;
    published?: boolean;
  },
): Promise<EditResult> {
  const patch: VariantUpdate = {};
  if ("label" in fields) patch.label = fields.label;
  if ("pricePerDay" in fields) patch.price_per_day = fields.pricePerDay;
  if ("totalQuantity" in fields) patch.total_quantity = fields.totalQuantity;
  if ("published" in fields) patch.published = fields.published;

  const { error } = await panelClient()
    .from("variants")
    .update(patch)
    .eq("id", variantId);

  return error ? fail(error) : { ok: true };
}

// ---------------------------------------------------------------------------
// Product fields
// ---------------------------------------------------------------------------

export async function saveProduct(
  productId: string,
  fields: { name?: string; categoryId?: string; internalNote?: string | null },
): Promise<EditResult> {
  const patch: ProductUpdate = {};
  if (fields.name !== undefined) patch.name = fields.name;
  if (fields.categoryId !== undefined) patch.category_id = fields.categoryId;
  if ("internalNote" in fields) patch.internal_note = fields.internalNote;

  const { error } = await panelClient()
    .from("products")
    .update(patch)
    .eq("id", productId);

  return error ? fail(error) : { ok: true };
}

// ---------------------------------------------------------------------------
// Photo
// ---------------------------------------------------------------------------

/** Reads a picked image's real pixel size — product_photos needs both. */
function imageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("no se pudo leer la imagen"));
    };
    img.src = url;
  });
}

/**
 * Uploads one phone photo and points the product at it.
 *
 * The public site asks for two crops — a square for cards, a portrait for the
 * detail page — and the scrape pipeline produced real, differently-cropped
 * files for each. A phone upload has one image, so both crops point at it and
 * PhotoFrame's object-cover does the cropping in the browser. It is not as
 * considered as a hand-cropped photo, but it turns "Foto pendiente" into the
 * owners' actual product, which is the whole point.
 *
 * The file is written under a fresh, unguessable path every time, so a replaced
 * photo can never be served from a stale cache. The row is upserted (one per
 * crop), so nothing is deleted — the pointer just moves.
 */
export type UploadResult =
  | { ok: true; path: string }
  | { ok: false; message: string };

export async function uploadProductPhoto(
  productId: string,
  slug: string,
  file: File,
): Promise<UploadResult> {
  const client = panelClient();

  let size: { width: number; height: number };
  try {
    size = await imageSize(file);
  } catch {
    return { ok: false, message: "No se pudo leer la foto. Probá con otra." };
  }

  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  const stamp = Date.now().toString(36);
  const path = `products/${slug}/staff-${stamp}.${ext && ext.length <= 5 ? ext : "jpg"}`;

  const upload = await client.storage
    .from("catalog")
    .upload(path, file, { cacheControl: "31536000", upsert: false });

  if (upload.error) return fail(upload.error);

  const rows: PhotoInsert[] = (["square", "portrait", "original"] as const).map(
    (crop) => ({
      product_id: productId,
      crop,
      storage_path: path,
      width: size.width,
      height: size.height,
      focal_x: 0.5,
      focal_y: 0.5,
      source_url: null,
    }),
  );

  const { error } = await client
    .from("product_photos")
    .upsert(rows, { onConflict: "product_id,crop" });

  return error ? fail(error) : { ok: true, path };
}
