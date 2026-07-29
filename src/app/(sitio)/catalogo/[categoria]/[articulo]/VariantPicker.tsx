"use client";

import { useState } from "react";
import type { CatalogVariant } from "@/lib/catalog";
import { Price } from "@/components/ui/Price";
import { Badge } from "@/components/ui/Badge";
import { AddToHojaDetail } from "@/components/hoja/AddToHoja";
import { cn } from "@/lib/cn";

/**
 * Chooses which variant to book.
 *
 * Only shown for products that genuinely have variants — a product with a
 * single implicit variant gets no selector at all, because "choose one of one"
 * is a question nobody should be asked.
 *
 * Every option here is bookable by construction: the public catalog only
 * contains published, priced variants, so the picker can never offer something
 * the customer cannot actually reserve.
 */
export function VariantPicker({ variants }: { variants: CatalogVariant[] }) {
  const [selectedId, setSelectedId] = useState(variants[0].variantId);
  const selected =
    variants.find((v) => v.variantId === selectedId) ?? variants[0];

  const hasChoice = variants.length > 1;

  return (
    <div>
      {hasChoice && (
        <fieldset className="mb-7">
          <legend className="type-label mb-3 text-stone-text">
            Elegí cuál ocupás
          </legend>
          <div className="flex flex-wrap gap-2">
            {variants.map((variant) => {
              const active = variant.variantId === selected.variantId;
              return (
                <label
                  key={variant.variantId}
                  className={cn(
                    "min-h-13 cursor-pointer rounded-md border px-4 py-3",
                    "flex items-center gap-3 text-base font-medium",
                    "transition-[border-color,background-color] duration-fast ease-out",
                    "has-focus-visible:outline has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-mamey",
                    active
                      ? "border-green bg-green-tint text-ink"
                      : "border-rule bg-paper text-stone-text hover:border-rule-strong",
                  )}
                >
                  <input
                    type="radio"
                    name="variant"
                    value={variant.variantId}
                    checked={active}
                    onChange={() => setSelectedId(variant.variantId)}
                    aria-label={variant.variantLabel ?? "Opción única"}
                    className="sr-only"
                  />
                  {variant.variantLabel}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="border-y border-ink/15 py-6">
        <Price amount={selected.pricePerDay} size="lg" />
        <p className="mt-3 max-w-sm text-sm text-stone-text">
          El precio es por cada 24 horas. Si lo ocupás más días, se multiplica
          por la cantidad de días.
        </p>
      </div>

      <div className="mt-7">
        <AddToHojaDetail variant={selected} />
      </div>

      <dl className="mt-9 divide-y divide-rule border-t border-rule">
        {selected.variantLabel && (
          <Row term="Opción" detail={selected.variantLabel} />
        )}
        <Row term="Categoría" detail={selected.categoryName} />
        {/* An unknown quantity is not zero and is not hidden — the business is
            live with counting gaps on purpose, and staff confirm by hand. */}
        <Row
          term="En bodega"
          detail={
            selected.totalQuantity === null
              ? "Consultanos"
              : String(selected.totalQuantity)
          }
        />
      </dl>

      {selected.totalQuantity !== null && selected.totalQuantity <= 4 && (
        <p className="mt-5">
          <Badge variant="scarce">
            Solo {selected.totalQuantity} — conviene apartarlo temprano
          </Badge>
        </p>
      )}
    </div>
  );
}

function Row({ term, detail }: { term: string; detail: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-3">
      <dt className="type-label text-stone-text">{term}</dt>
      <dd className="type-mono text-right text-base text-ink">{detail}</dd>
    </div>
  );
}
