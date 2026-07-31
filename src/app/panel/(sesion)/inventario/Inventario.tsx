"use client";

import { useMemo, useState } from "react";
import { PhotoFrame } from "@/components/ui/PhotoFrame";
import { Badge } from "@/components/ui/Badge";
import { money } from "@/lib/format";
import { photoUrl } from "@/lib/catalog";
import { cn } from "@/lib/cn";
import type { InvProduct, InvVariant, InvCategory } from "@/lib/admin/loadInventory";
import { VariantEditorSheet } from "./VariantEditorSheet";
import { ProductEditorSheet } from "./ProductEditorSheet";

/**
 * Inventario — the catalog as a working document.
 *
 * Everything is on one screen: a search, three counters of what is still
 * missing, and the whole catalog grouped the way the business ranks it. The
 * counters double as filters — tap "Faltan precios" and the list narrows to
 * exactly that work. There is no separate "queue"; the gap is just a blank in a
 * row that is already here.
 *
 * All edits are optimistic: the list holds the catalog in state and patches
 * itself the instant a save succeeds, so on a warehouse connection the number
 * changes under her thumb instead of after a reload.
 */

type Filter = "all" | "price" | "quantity" | "photo";

function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function productMatches(p: InvProduct, needle: string): boolean {
  if (needle === "") return true;
  const hay = fold(
    `${p.name} ${p.categoryName} ${p.topCategoryName} ${p.variants
      .map((v) => v.label ?? "")
      .join(" ")}`,
  );
  return needle.split(/\s+/).every((t) => hay.includes(t));
}

function hasGap(p: InvProduct, filter: Filter): boolean {
  switch (filter) {
    case "price":
      return p.variants.some((v) => v.pricePerDay === null);
    case "quantity":
      return p.variants.some((v) => v.totalQuantity === null);
    case "photo":
      return p.photoSquare === null;
    default:
      return true;
  }
}

export function Inventario({
  initial,
  categories,
  canDelete = false,
}: {
  initial: InvProduct[];
  categories: InvCategory[];
  /** Technical admin only; passed to the editor for its delete control. */
  canDelete?: boolean;
}) {
  const [products, setProducts] = useState(initial);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editingProduct, setEditingProduct] = useState<InvProduct | null>(null);
  const [editingVariant, setEditingVariant] = useState<{
    variant: InvVariant;
    product: InvProduct;
  } | null>(null);

  const counts = useMemo(() => {
    let price = 0;
    let quantity = 0;
    let photo = 0;
    for (const p of products) {
      if (p.photoSquare === null) photo += 1;
      for (const v of p.variants) {
        if (v.pricePerDay === null) price += 1;
        if (v.totalQuantity === null) quantity += 1;
      }
    }
    return { price, quantity, photo };
  }, [products]);

  const needle = fold(query.trim());

  // Group the visible products by top category, keeping the load order (which
  // is already the business's ranking: Sillas, Mesas, Mantelería first).
  const sections = useMemo(() => {
    const groups: { name: string; items: InvProduct[] }[] = [];
    const index = new Map<string, number>();
    for (const p of products) {
      if (!productMatches(p, needle) || !hasGap(p, filter)) continue;
      let at = index.get(p.topCategoryName);
      if (at === undefined) {
        at = groups.length;
        index.set(p.topCategoryName, at);
        groups.push({ name: p.topCategoryName, items: [] });
      }
      groups[at].items.push(p);
    }
    return groups;
  }, [products, needle, filter]);

  function patchVariant(variantId: string, patch: Partial<InvVariant>) {
    setProducts((prev) =>
      prev.map((p) => ({
        ...p,
        variants: p.variants.map((v) =>
          v.variantId === variantId ? { ...v, ...patch } : v,
        ),
      })),
    );
  }

  function patchProduct(productId: string, patch: Partial<InvProduct>) {
    setProducts((prev) =>
      prev.map((p) => (p.productId === productId ? { ...p, ...patch } : p)),
    );
  }

  function removeProduct(productId: string) {
    setProducts((prev) => prev.filter((p) => p.productId !== productId));
  }

  const visibleCount = sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8">
      <h1 className="type-display text-3xl text-ink">Inventario</h1>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar artículo…"
        aria-label="Buscar artículo"
        className={cn(
          "mt-5 w-full min-h-13 rounded-md border border-rule bg-paper-warm px-4 py-3",
          "text-base text-ink placeholder:text-stone-text/70",
          "focus:border-green focus:outline-none focus:ring-2 focus:ring-green/25",
        )}
      />

      {/* The counters are also the filters. */}
      <div className="mt-4 flex flex-wrap gap-2">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          Todo
        </FilterChip>
        <FilterChip
          active={filter === "price"}
          onClick={() => setFilter(filter === "price" ? "all" : "price")}
          count={counts.price}
        >
          Faltan precios
        </FilterChip>
        <FilterChip
          active={filter === "quantity"}
          onClick={() => setFilter(filter === "quantity" ? "all" : "quantity")}
          count={counts.quantity}
        >
          Falta cantidad
        </FilterChip>
        <FilterChip
          active={filter === "photo"}
          onClick={() => setFilter(filter === "photo" ? "all" : "photo")}
          count={counts.photo}
        >
          Sin foto
        </FilterChip>
      </div>

      {visibleCount === 0 ? (
        <p className="mt-10 rounded-lg border border-rule bg-paper p-6 text-center text-base text-stone-text">
          {filter === "all"
            ? "No hay artículos que coincidan."
            : "Nada pendiente acá. Todo al día."}
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-8">
          {sections.map((section) => (
            <section key={section.name}>
              <h2 className="type-label sticky top-0 z-10 -mx-1 bg-limewash/95 px-1 py-1.5 text-stone-text backdrop-blur-sm">
                {section.name}
              </h2>
              <ul className="mt-2 flex flex-col gap-3">
                {section.items.map((product) => (
                  <ProductCard
                    key={product.productId}
                    product={product}
                    filter={filter}
                    onEditProduct={() => setEditingProduct(product)}
                    onEditVariant={(variant) =>
                      setEditingVariant({ variant, product })
                    }
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <ProductEditorSheet
        product={editingProduct}
        categories={categories}
        canDelete={canDelete}
        onClose={() => setEditingProduct(null)}
        onSaved={patchProduct}
        onDeleted={removeProduct}
      />
      <VariantEditorSheet
        variant={editingVariant?.variant ?? null}
        productName={editingVariant?.product.name ?? ""}
        hasSiblings={(editingVariant?.product.variants.length ?? 0) > 1}
        onClose={() => setEditingVariant(null)}
        onSaved={patchVariant}
      />
    </main>
  );
}

function FilterChip({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count?: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold",
        "transition-colors duration-fast ease-out",
        active
          ? "border-green bg-green-tint text-green-dark"
          : "border-rule bg-paper text-stone-text hover:border-rule-strong",
      )}
    >
      {children}
      {count !== undefined && count > 0 && (
        <span
          className={cn(
            "type-mono rounded-full px-1.5 text-xs tabular-nums",
            active ? "bg-green/15 text-green-dark" : "bg-mamey-tint text-mamey-text",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function ProductCard({
  product,
  filter,
  onEditProduct,
  onEditVariant,
}: {
  product: InvProduct;
  filter: Filter;
  onEditProduct: () => void;
  onEditVariant: (variant: InvVariant) => void;
}) {
  return (
    <li className="overflow-hidden rounded-lg border border-rule bg-paper">
      <button
        type="button"
        onClick={onEditProduct}
        className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-paper-warm"
      >
        <div className="w-14 shrink-0">
          <PhotoFrame
            src={photoUrl(product.photoSquare)}
            alt={product.name}
            ratio="square"
            mat={false}
            compact
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-ink">
            {product.name}
          </p>
          <p className="type-label truncate text-stone-text">
            {product.categoryName}
          </p>
        </div>
        {product.photoSquare === null && (
          <Badge variant="scarce">Sin foto</Badge>
        )}
      </button>

      <ul className="divide-y divide-rule border-t border-rule">
        {product.variants.map((variant) => (
          <li key={variant.variantId}>
            <button
              type="button"
              onClick={() => onEditVariant(variant)}
              className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-paper-warm"
            >
              <div className="min-w-0 flex-1">
                <span className="block truncate text-base text-ink">
                  {variant.label ?? "Precio y cantidad"}
                </span>
                <span className="type-mono block text-sm text-stone-text">
                  {variant.totalQuantity === null
                    ? "sin contar"
                    : `${variant.totalQuantity} en total`}
                  {!variant.published && " · oculto"}
                </span>
              </div>

              {variant.pricePerDay === null ? (
                <span className="type-label shrink-0 text-mamey-text">
                  Sin precio
                </span>
              ) : (
                <span className="shrink-0 text-right">
                  <span className="type-mono text-base font-semibold text-ink tabular-nums">
                    {money(variant.pricePerDay)}
                  </span>
                  {(variant.priceSource === "estimated" ||
                    variant.priceSource === "recovered") && (
                    <span className="type-label block text-stone-text">
                      {variant.priceSource === "estimated"
                        ? "estimado"
                        : "por confirmar"}
                    </span>
                  )}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {filter === "quantity" &&
        product.variants.some((v) => v.totalQuantity === null) && (
          <p className="border-t border-rule px-3 py-2 text-sm text-stone-text">
            Tocá una línea para poner cuántas hay.
          </p>
        )}
    </li>
  );
}
