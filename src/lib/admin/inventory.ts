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
// Creating catalog entries — technical-admin only, gated again server-side.
// ---------------------------------------------------------------------------

const CREATE_ERROR_ES: Record<string, string> = {
  no_autorizado: "Solo el administrador técnico puede crear artículos.",
  falta_nombre: "Escribí un nombre.",
  categoria_invalida: "Elegí una categoría.",
  sin_variantes: "Agregá al menos una variante con su precio.",
  madre_invalida: "La categoría madre ya no existe.",
  producto_invalido: "Ese artículo ya no existe.",
};

type CreateResult<T> = { ok: true; data: T } | { ok: false; message: string };

function createFail<T>(error: string | null): CreateResult<T> {
  return { ok: false, message: CREATE_ERROR_ES[error ?? ""] ?? FAILED };
}

export type NewVariantInput = {
  /** Blank for a single-variant product. */
  label: string;
  pricePerDay: string;
  totalQuantity: string;
};

export type NewProductInput = {
  name: string;
  categoryId: string;
  /** A shared choice picked at rental time (Color/Estilo/…). Blank = none. */
  optionName: string;
  optionValues: string[];
  /** Whether the variants go live on the public site immediately. */
  published: boolean;
  variants: NewVariantInput[];
};

export type CreatedProduct = {
  productId: string;
  slug: string;
  variants: { variantId: string; label: string | null }[];
};

export async function createProduct(
  input: NewProductInput,
): Promise<CreateResult<CreatedProduct>> {
  const { data, error } = await panelClient().rpc("create_product", {
    p: {
      name: input.name.trim(),
      category_id: input.categoryId,
      option_name: input.optionName.trim() || null,
      option_values: input.optionValues,
      published: input.published,
      variants: input.variants.map((v) => ({
        label: v.label.trim() || null,
        price_per_day: v.pricePerDay.trim() || null,
        total_quantity: v.totalQuantity.trim() || null,
      })),
    },
  });

  if (error) return fail(error) as CreateResult<CreatedProduct>;

  const result = (data ?? {}) as {
    ok?: boolean;
    error?: string;
    product_id?: string;
    slug?: string;
    variants?: { variant_id: string; label: string | null }[];
  };
  if (!result.ok) return createFail(result.error ?? null);

  return {
    ok: true,
    data: {
      productId: result.product_id!,
      slug: result.slug!,
      variants: (result.variants ?? []).map((v) => ({
        variantId: v.variant_id,
        label: v.label,
      })),
    },
  };
}

/**
 * Appends a variant to an existing product — technical-admin only, gated again
 * in `add_variant`. Blank price or quantity stays null (unknown), exactly like
 * the create flow; the new variant is stamped 'staff' so an import won't touch
 * it.
 */
export type AddedVariant = { variantId: string; label: string | null };

export async function addVariant(
  productId: string,
  input: { label: string; pricePerDay: string; totalQuantity: string; published: boolean },
): Promise<CreateResult<AddedVariant>> {
  const { data, error } = await panelClient().rpc("add_variant", {
    p_product_id: productId,
    p: {
      label: input.label.trim() || null,
      price_per_day: input.pricePerDay.trim() || null,
      total_quantity: input.totalQuantity.trim() || null,
      published: input.published,
    },
  });

  if (error) return fail(error) as CreateResult<AddedVariant>;

  const result = (data ?? {}) as {
    ok?: boolean;
    error?: string;
    variant_id?: string;
    label?: string | null;
  };
  if (!result.ok) return createFail(result.error ?? null);

  return {
    ok: true,
    data: { variantId: result.variant_id!, label: result.label ?? null },
  };
}

/**
 * Sets (or clears) a product's shared rental-time option — technical-admin only.
 * An option name with no values clears the option entirely, matching the create
 * flow. Returns the cleaned values so the panel shows exactly what was stored.
 */
export type SavedOption = {
  optionName: string | null;
  optionValues: string[] | null;
};

export async function saveProductOption(
  productId: string,
  input: { optionName: string; optionValues: string[] },
): Promise<CreateResult<SavedOption>> {
  const { data, error } = await panelClient().rpc("set_product_option", {
    p_product_id: productId,
    p: {
      option_name: input.optionName.trim() || null,
      option_values: input.optionValues,
    },
  });

  if (error) return fail(error) as CreateResult<SavedOption>;

  const result = (data ?? {}) as {
    ok?: boolean;
    error?: string;
    option_name?: string | null;
    option_values?: string[] | null;
  };
  if (!result.ok) return createFail(result.error ?? null);

  return {
    ok: true,
    data: {
      optionName: result.option_name ?? null,
      optionValues: result.option_values ?? null,
    },
  };
}

export type CreatedCategory = {
  id: string;
  name: string;
  parentId: string | null;
  topName: string;
};

export async function createCategory(input: {
  name: string;
  parentId: string | null;
}): Promise<CreateResult<CreatedCategory>> {
  const { data, error } = await panelClient().rpc("create_category", {
    p: { name: input.name.trim(), parent_id: input.parentId },
  });

  if (error) return fail(error) as CreateResult<CreatedCategory>;

  const result = (data ?? {}) as {
    ok?: boolean;
    error?: string;
    id?: string;
    name?: string;
    parent_id?: string | null;
    top_name?: string;
  };
  if (!result.ok) return createFail(result.error ?? null);

  return {
    ok: true,
    data: {
      id: result.id!,
      name: result.name!,
      parentId: result.parent_id ?? null,
      topName: result.top_name!,
    },
  };
}

// ---------------------------------------------------------------------------
// Photo
// ---------------------------------------------------------------------------

/** The long side we cap phone photos at before upload. A card is never shown
 *  larger than this, so anything bigger is bytes paid for and never seen. */
const MAX_EDGE = 1600;

type Compressed = { blob: Blob; width: number; height: number };

/**
 * Shrink a phone photo and re-encode it as WebP in the browser, before a single
 * byte is uploaded (Brief 04 §8). A modern phone camera is 12 MP / several MB;
 * this brings a catalog card down to tens of KB, which is what keeps the free
 * tier's 1 GB from filling and what keeps the upload quick on warehouse data.
 *
 * `createImageBitmap(..., { imageOrientation: "from-image" })` bakes in the
 * EXIF rotation, so a photo taken sideways on the phone is stored upright rather
 * than relying on every viewer to honour the orientation flag.
 */
async function compressToWebp(file: File): Promise<Compressed> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("sin canvas");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.82),
  );
  if (!blob) throw new Error("no se pudo comprimir");

  return { blob, width, height };
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
 * The object is written to ONE deterministic path per product and overwritten
 * in place (upsert), so a re-upload replaces the file instead of leaving the old
 * one behind — the pattern that would otherwise grow storage without bound
 * (Brief 04 §8). Overwriting means the CDN could serve the old bytes from cache,
 * so the stored `storage_path` carries a `?v=` stamp that changes on every
 * upload; `photoUrl` passes it straight through, busting the cache while the
 * object key itself stays stable.
 */
export type UploadResult =
  | { ok: true; path: string }
  | { ok: false; message: string };

export async function uploadProductPhoto(
  productId: string,
  file: File,
): Promise<UploadResult> {
  const client = panelClient();

  let image: Compressed;
  try {
    image = await compressToWebp(file);
  } catch {
    return { ok: false, message: "No se pudo leer la foto. Probá con otra." };
  }

  // Deterministic, keyed on the id (not the slug, which can change on a rename).
  const key = `products/${productId}/principal.webp`;
  const stamp = Date.now().toString(36);

  const upload = await client.storage
    .from("catalog")
    .upload(key, image.blob, {
      cacheControl: "31536000",
      upsert: true,
      contentType: "image/webp",
    });

  if (upload.error) return fail(upload.error);

  // Cache-busting version lives only in the URL, never in the object key.
  const path = `${key}?v=${stamp}`;

  const rows: PhotoInsert[] = (["square", "portrait", "original"] as const).map(
    (crop) => ({
      product_id: productId,
      crop,
      storage_path: path,
      width: image.width,
      height: image.height,
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
