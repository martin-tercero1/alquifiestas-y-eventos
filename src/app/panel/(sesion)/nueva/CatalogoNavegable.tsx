"use client";

import { Collapsible } from "@/components/ui/Collapsible";
import { ArticuloBoton } from "./ArticuloBoton";
import type { CatalogGroup } from "@/lib/admin/loadInventory";
import type { CatalogHit } from "@/lib/admin/proforma";

/**
 * Browse the whole catalog by category — the alternative to typing a search.
 *
 * Every top category is a collapsed shelf; tapping one opens it to its items,
 * and several can be open at once. This is the answer to "I can't see everything
 * we rent": the eager-loaded catalog is all here, one tap from view, without
 * pushing the order's own lines off the screen the way a flat list would.
 */
export function CatalogoNavegable({
  groups,
  addedVariantIds,
  onAdd,
}: {
  groups: CatalogGroup[];
  addedVariantIds: Set<string>;
  onAdd: (hit: CatalogHit) => void;
}) {
  if (groups.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="type-label text-stone-text">O mirá por categoría</p>
      {groups.map((group) => (
        <Collapsible
          key={group.topCategoryName}
          title={group.topCategoryName}
          count={group.items.length}
        >
          <ul className="flex flex-col gap-1.5 pb-2">
            {group.items.map((hit) => (
              <li key={hit.variantId}>
                <ArticuloBoton
                  hit={hit}
                  added={addedVariantIds.has(hit.variantId)}
                  onAdd={() => onAdd(hit)}
                />
              </li>
            ))}
          </ul>
        </Collapsible>
      ))}
    </div>
  );
}
