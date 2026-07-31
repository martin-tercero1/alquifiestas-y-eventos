"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/Field";
import { searchCatalog, type CatalogHit } from "@/lib/admin/proforma";
import { ArticuloBoton } from "./ArticuloBoton";

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
};

export function BuscadorArticulos({ onAdd, addedVariantIds }: Props) {
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
        Results only when she is actually searching. A blank box shows nothing —
        browsing the whole catalog is the category accordion's job now, and two
        full lists stacked on top of each other only compete.
      */}
      {query.trim() !== "" && (
        <ul className="flex flex-col gap-1.5">
          {hits.map((hit) => (
            <li key={hit.variantId}>
              <ArticuloBoton
                hit={hit}
                added={addedVariantIds.has(hit.variantId)}
                onAdd={() => {
                  onAdd(hit);
                  // Clearing the box collapses the results, so the line she just
                  // added is what she sees next rather than the same product
                  // listed twice — once as a result, once as a line.
                  setQuery("");
                }}
              />
            </li>
          ))}
        </ul>
      )}

      {!loading && !failed && hits.length === 0 && query.trim() !== "" && (
        <p className="text-base text-stone-text">
          No encontramos nada con “{query.trim()}”. Probá con otra palabra.
        </p>
      )}
    </div>
  );
}
