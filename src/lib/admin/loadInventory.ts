import { serverClient } from "@/lib/supabase/server";

/**
 * The catalog as staff see it — everything, including variants with no price,
 * no quantity, or not published. It is the same `staff_catalog` view the
 * search box already trusts, read whole and grouped into products.
 *
 * One query backs the entire Inventario screen: the browsable list, the
 * per-variant editors, AND the "what's still missing" counts. A gap is just a
 * null in a row we already have, so there is nothing separate to fetch and
 * nothing that can disagree with the list.
 *
 * Ordering is the business's own: the top categories that get rented most —
 * Sillas, Mesas, Mantelería — come first, by their display_order, so the work
 * that matters is at the top of the screen and of every missing-data queue.
 */

export type InvVariant = {
  variantId: string;
  label: string | null;
  pricePerDay: number | null;
  priceSource: string | null;
  totalQuantity: number | null;
  quantitySource: string | null;
  published: boolean;
};

export type InvProduct = {
  productId: string;
  slug: string;
  name: string;
  categoryId: string;
  categoryName: string;
  topCategoryName: string;
  /** Set on the first product of each top category, for section headers. */
  photoSquare: string | null;
  internalNote: string | null;
  /** The shared rental-time choice (Color/Estilo) and its values, if any. */
  optionName: string | null;
  optionValues: string[] | null;
  variants: InvVariant[];
};

type Row = {
  variant_id: string;
  product_id: string;
  product_slug: string;
  product_name: string;
  variant_label: string | null;
  price_per_day: number | string | null;
  price_source: string | null;
  total_quantity: number | null;
  quantity_source: string | null;
  published: boolean;
  category_id: string;
  category_name: string;
  top_category_name: string;
  photo_square: string | null;
  internal_note: string | null;
  option_name: string | null;
  option_values: string[] | null;
};

export async function loadInventory(): Promise<InvProduct[]> {
  const supabase = await serverClient();

  const { data, error } = await supabase
    .from("staff_catalog")
    .select("*")
    .order("top_category_display_order", { ascending: true })
    .order("category_display_order", { ascending: true })
    .order("product_name", { ascending: true })
    .order("variant_label", { ascending: true, nullsFirst: true });

  if (error) {
    console.error("staff_catalog read failed:", error.message);
    return [];
  }

  const rows = (data ?? []) as unknown as Row[];
  const byProduct = new Map<string, InvProduct>();

  for (const r of rows) {
    let product = byProduct.get(r.product_id);
    if (!product) {
      product = {
        productId: r.product_id,
        slug: r.product_slug,
        name: r.product_name,
        categoryId: r.category_id,
        categoryName: r.category_name,
        topCategoryName: r.top_category_name,
        photoSquare: r.photo_square,
        internalNote: r.internal_note,
        optionName: r.option_name,
        optionValues: r.option_values,
        variants: [],
      };
      byProduct.set(r.product_id, product);
    }

    product.variants.push({
      variantId: r.variant_id,
      label: r.variant_label,
      pricePerDay: r.price_per_day === null ? null : Number(r.price_per_day),
      priceSource: r.price_source,
      totalQuantity: r.total_quantity,
      quantitySource: r.quantity_source,
      published: r.published,
    });
  }

  return [...byProduct.values()];
}

// ---------------------------------------------------------------------------
// Browsable catalog — the same staff_catalog rows, shaped as CatalogHit and
// grouped by top category, for the "browse by category" accordion on Nueva.
// Eager-loaded there so the parents can glance at the whole shelf without
// typing a search. The catalog is small (~130 products), so one query is cheap.
// ---------------------------------------------------------------------------

/** One CatalogHit-shaped row for the browse accordion. Mirrors searchCatalog's
 *  output so a browsed item and a searched one add to the proforma identically. */
export type BrowseHit = {
  variantId: string;
  productId: string;
  productName: string;
  variantLabel: string | null;
  categoryName: string;
  pricePerDay: number | null;
  priceSource: string | null;
  totalQuantity: number | null;
  published: boolean;
  photoSquare: string | null;
  optionName: string | null;
  optionValues: string[] | null;
};

export type CatalogGroup = { topCategoryName: string; items: BrowseHit[] };

type BrowseRow = Row & {
  option_name: string | null;
  option_values: string[] | null;
};

export async function loadBrowseCatalog(): Promise<CatalogGroup[]> {
  const supabase = await serverClient();

  const { data, error } = await supabase
    .from("staff_catalog")
    .select("*")
    .order("top_category_display_order", { ascending: true })
    .order("category_display_order", { ascending: true })
    .order("product_name", { ascending: true })
    .order("variant_label", { ascending: true, nullsFirst: true });

  if (error) {
    console.error("staff_catalog browse read failed:", error.message);
    return [];
  }

  const rows = (data ?? []) as unknown as BrowseRow[];
  const groups: CatalogGroup[] = [];
  const index = new Map<string, number>();

  for (const r of rows) {
    let at = index.get(r.top_category_name);
    if (at === undefined) {
      at = groups.length;
      index.set(r.top_category_name, at);
      groups.push({ topCategoryName: r.top_category_name, items: [] });
    }
    groups[at].items.push({
      variantId: r.variant_id,
      productId: r.product_id,
      productName: r.product_name,
      variantLabel: r.variant_label,
      categoryName: r.category_name,
      pricePerDay: r.price_per_day === null ? null : Number(r.price_per_day),
      priceSource: r.price_source,
      totalQuantity: r.total_quantity,
      published: r.published,
      photoSquare: r.photo_square,
      optionName: r.option_name,
      optionValues: r.option_values,
    });
  }

  return groups;
}

/** Top-level categories, for the "parent" picker when creating a new category. */
export type TopCategory = { id: string; name: string };

export async function loadTopCategories(): Promise<TopCategory[]> {
  const supabase = await serverClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, parent_id, display_order")
    .is("parent_id", null)
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  if (error || !data) return [];
  return data.map((c) => ({ id: c.id, name: c.name }));
}

/** The categories for the "mover" picker, in the business's display order. */
export type InvCategory = { id: string; name: string; topName: string };

export async function loadCategories(): Promise<InvCategory[]> {
  const supabase = await serverClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, parent_id, display_order")
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  if (error || !data) return [];

  const byId = new Map(data.map((c) => [c.id, c]));
  // Only leaf categories hold products; a product's category is always a leaf.
  const parents = new Set(data.map((c) => c.parent_id).filter(Boolean));

  return data
    .filter((c) => !parents.has(c.id))
    .map((c) => ({
      id: c.id,
      name: c.name,
      topName: c.parent_id ? (byId.get(c.parent_id)?.name ?? c.name) : c.name,
    }));
}
