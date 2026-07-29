"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { Input } from "@/components/ui/Field";
import { searchCatalog, type CatalogHit } from "@/lib/admin/proforma";

/**
 * Item search.
 *
 * Results appear as she types — no submit button, no "buscar". The forgiving
 * matching lives in Postgres (`search_variants`), so `tifany` finds Silla
 * Tiffany and `mesa 10` finds Mesa Redonda para 10 personas.
 *
 * Variants are separate results rather than a second step: tapping "Comal —
 * Grande" is one interaction, which is the brief's rule that variants must not
 * slow her down.
 */

type Props = {
  onAdd: (hit: CatalogHit) => void;
  addedVariantIds: Set<string>;
  /** Once the order has lines, a blank box must not bury them under results. */
  hasLines: boolean;
};

export function BuscadorArticulos({
  onAdd,
  addedVariantIds,
  hasLines,
}: Props) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CatalogHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  // Guards against a slow early request landing after a fast later one and
  // overwriting the results she is actually looking at.
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const results = await searchCatalog(query.trim());
        if (id === requestId.current) {
          setHits(results);
          setFailed(false);
        }
      } catch {
        if (id === requestId.current) setFailed(true);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="flex flex-col gap-3">
      <Input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar: silla, mantel, copa…"
        aria-label="Buscar artículos"
        autoCapitalize="none"
        autoCorrect="off"
      />

      {failed && (
        <p className="text-sm font-medium text-mamey-text">
          No se pudo buscar. Revisá la conexión.
        </p>
      )}

      {/*
        A blank box shows the catalog as a starting point — but only until she
        has added something. After that the results would push her own lines
        off the screen, and the lines are the order.
      */}
      <ul className="flex flex-col gap-1.5">
        {(query.trim() === "" && hasLines ? [] : hits).map((hit) => {
          const added = addedVariantIds.has(hit.variantId);
          const name = hit.variantLabel
            ? `${hit.productName} — ${hit.variantLabel}`
            : hit.productName;

          return (
            <li key={hit.variantId}>
              <button
                type="button"
                onClick={() => {
                  onAdd(hit);
                  // Clearing the box collapses the results, so the line she
                  // just added is what she sees next rather than the same
                  // product listed twice — once as a result, once as a line.
                  setQuery("");
                }}
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
            </li>
          );
        })}
      </ul>

      {!loading && !failed && hits.length === 0 && query.trim() !== "" && (
        <p className="text-base text-stone-text">
          No encontramos nada con “{query.trim()}”. Probá con otra palabra.
        </p>
      )}
    </div>
  );
}
