"use client";

import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import type { CatalogHit } from "@/lib/admin/proforma";

/**
 * One tappable catalog row — name, category, price, and an add affordance that
 * flips to a check once the item is on the order. Shared by the search results
 * and the browse-by-category accordion so a searched item and a browsed one look
 * and behave the same.
 */
export function ArticuloBoton({
  hit,
  added,
  onAdd,
}: {
  hit: CatalogHit;
  added: boolean;
  onAdd: () => void;
}) {
  const name = hit.variantLabel
    ? `${hit.productName} — ${hit.variantLabel}`
    : hit.productName;

  return (
    <button
      type="button"
      onClick={onAdd}
      className={cn(
        "flex w-full min-h-14 items-center gap-3 rounded-md border px-4 py-2.5 text-left",
        "transition-[background-color,border-color] duration-fast ease-out",
        added
          ? "border-green/40 bg-green/[0.07]"
          : "border-rule bg-paper hover:border-rule-strong",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-semibold text-ink">
          {name}
        </span>
        <span className="type-label text-stone-text">
          {hit.categoryName}
          {!hit.published && " · no publicado"}
        </span>
      </span>

      <span className="type-mono shrink-0 text-right text-base tabular-nums">
        {hit.pricePerDay === null ? (
          <span className="text-mamey-text">Sin precio</span>
        ) : (
          <span className="text-ink">{money(hit.pricePerDay)}</span>
        )}
      </span>

      <span
        aria-hidden
        className={cn(
          "grid h-8 w-8 shrink-0 place-items-center rounded-full text-lg font-bold",
          added ? "bg-green text-white" : "bg-limewash text-green",
        )}
      >
        {added ? "✓" : "+"}
      </span>
    </button>
  );
}
