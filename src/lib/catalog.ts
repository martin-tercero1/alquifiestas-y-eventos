import { supabase } from "./supabase/client";

/**
 * Catalog reads for the public site.
 *
 * Everything goes through the `public_catalog` view, which exposes only
 * variants that are PUBLISHED and PRICED. A variant with no price is real
 * inventory staff can quote by hand — it simply cannot be booked online, and
 * it is not reachable from here at all.
 *
 * The rentable unit is the VARIANT. A product with no real variants has one
 * implicit variant whose label is null, so nothing in this file or above it
 * ever branches on "does this product have variants".
 */

export type CatalogVariant = {
  variantId: string;
  productId: string;
  productSlug: string;
  productName: string;
  description: string | null;
  /** null for the implicit single variant of a product with no variants. */
  variantLabel: string | null;
  pricePerDay: number;
  totalQuantity: number | null;
  categorySlug: string;
  categoryName: string;
  parentCategorySlug: string | null;
  parentCategoryName: string | null;
  categoryDisplayOrder: number;
  photoSquare: string | null;
  photoPortrait: string | null;
};

/** A product as the catalogue shows it: one card, one or more bookable variants. */
export type CatalogProduct = {
  productId: string;
  slug: string;
  name: string;
  description: string | null;
  categorySlug: string;
  categoryName: string;
  photoSquare: string | null;
  photoPortrait: string | null;
  variants: CatalogVariant[];
  /** Cheapest bookable variant, for the "desde C$…" figure on a card. */
  fromPrice: number;
  hasRealVariants: boolean;
};

export type CatalogCategory = {
  slug: string;
  name: string;
  displayOrder: number;
  parentSlug: string | null;
  productCount: number;
};

const SELECT = "*";

function toVariant(row: Record<string, unknown>): CatalogVariant {
  return {
    variantId: row.variant_id as string,
    productId: row.product_id as string,
    productSlug: row.product_slug as string,
    productName: row.product_name as string,
    description: (row.description as string | null) ?? null,
    variantLabel: (row.variant_label as string | null) ?? null,
    pricePerDay: Number(row.price_per_day),
    totalQuantity:
      row.total_quantity === null ? null : Number(row.total_quantity),
    categorySlug: row.category_slug as string,
    categoryName: row.category_name as string,
    parentCategorySlug: (row.parent_category_slug as string | null) ?? null,
    parentCategoryName: (row.parent_category_name as string | null) ?? null,
    categoryDisplayOrder: Number(row.category_display_order ?? 0),
    photoSquare: (row.photo_square as string | null) ?? null,
    photoPortrait: (row.photo_portrait as string | null) ?? null,
  };
}

/** Groups variant rows into products, preserving the catalogue's ordering. */
function groupIntoProducts(variants: CatalogVariant[]): CatalogProduct[] {
  const byProduct = new Map<string, CatalogProduct>();

  for (const v of variants) {
    let product = byProduct.get(v.productId);

    if (!product) {
      product = {
        productId: v.productId,
        slug: v.productSlug,
        name: v.productName,
        description: v.description,
        categorySlug: v.categorySlug,
        categoryName: v.categoryName,
        photoSquare: v.photoSquare,
        photoPortrait: v.photoPortrait,
        variants: [],
        fromPrice: v.pricePerDay,
        hasRealVariants: false,
      };
      byProduct.set(v.productId, product);
    }

    product.variants.push(v);
    product.fromPrice = Math.min(product.fromPrice, v.pricePerDay);
    if (v.variantLabel !== null) product.hasRealVariants = true;
  }

  return [...byProduct.values()];
}

/** Every publicly bookable variant, ordered the way the site groups them. */
export async function getPublicVariants(): Promise<CatalogVariant[]> {
  const { data, error } = await supabase
    .from("public_catalog")
    .select(SELECT)
    .order("category_display_order", { ascending: true })
    .order("product_name", { ascending: true })
    .order("variant_label", { ascending: true, nullsFirst: true });

  if (error) {
    console.error("public_catalog read failed:", error.message);
    return [];
  }

  return (data ?? []).map(toVariant);
}

export async function getProducts(): Promise<CatalogProduct[]> {
  return groupIntoProducts(await getPublicVariants());
}

export async function getProductsByCategory(
  categorySlug: string,
): Promise<CatalogProduct[]> {
  const { data, error } = await supabase
    .from("public_catalog")
    .select(SELECT)
    .or(`category_slug.eq.${categorySlug},parent_category_slug.eq.${categorySlug}`)
    .order("product_name", { ascending: true })
    .order("variant_label", { ascending: true, nullsFirst: true });

  if (error) {
    console.error("category read failed:", error.message);
    return [];
  }

  return groupIntoProducts((data ?? []).map(toVariant));
}

export async function getProduct(slug: string): Promise<CatalogProduct | null> {
  const { data, error } = await supabase
    .from("public_catalog")
    .select(SELECT)
    .eq("product_slug", slug)
    .order("variant_label", { ascending: true, nullsFirst: true });

  if (error || !data || data.length === 0) return null;
  return groupIntoProducts(data.map(toVariant))[0] ?? null;
}

/**
 * Categories that actually have something bookable in them.
 *
 * Derived from the public catalog rather than from the categories table, so a
 * category whose every variant is still missing a price simply does not appear
 * — no empty shelves on the public site.
 */
export async function getCategories(): Promise<CatalogCategory[]> {
  const variants = await getPublicVariants();
  const byCategory = new Map<string, CatalogCategory>();

  for (const v of variants) {
    // Roll subcategories up to their parent for the top-level navigation.
    const slug = v.parentCategorySlug ?? v.categorySlug;
    const name = v.parentCategoryName ?? v.categoryName;

    const existing = byCategory.get(slug);
    if (existing) {
      existing.productCount += 1;
      continue;
    }

    byCategory.set(slug, {
      slug,
      name,
      displayOrder: v.categoryDisplayOrder,
      parentSlug: null,
      productCount: 1,
    });
  }

  return [...byCategory.values()].sort((a, b) => a.displayOrder - b.displayOrder);
}

/** Cheapest bookable price in a category, for the "desde C$…" figure. */
export function fromPriceOf(products: CatalogProduct[]): number | null {
  if (products.length === 0) return null;
  return Math.min(...products.map((p) => p.fromPrice));
}

/**
 * Public URL for a stored photo.
 *
 * Returns null when the product has no photo yet — a very common state, since
 * many of the old Odoo images are not publicly reachable. Callers render the
 * design system's placeholder rather than a broken image.
 */
export function photoUrl(storagePath: string | null): string | null {
  if (!storagePath) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/catalog/${storagePath}`;
}

/** How a variant is named to a customer: "Comal — Grande", or just "Comal". */
export function variantName(
  productName: string,
  variantLabel: string | null,
): string {
  return variantLabel ? `${productName} — ${variantLabel}` : productName;
}
