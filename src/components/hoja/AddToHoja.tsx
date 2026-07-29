"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { QuantityStepper } from "@/components/ui/QuantityStepper";
import { CheckIcon, PlusIcon } from "@/components/ui/icons";
import type { CatalogVariant } from "@/lib/catalog";
import { variantName } from "@/lib/catalog";
import { useHoja, type HojaLine } from "./HojaProvider";

/** Everything the sheet needs to render a line without a round-trip. */
function toLine(variant: CatalogVariant): Omit<HojaLine, "quantity"> {
  return {
    variantId: variant.variantId,
    name: variantName(variant.productName, variant.variantLabel),
    productSlug: variant.productSlug,
    categorySlug: variant.parentCategorySlug ?? variant.categorySlug,
    pricePerDay: variant.pricePerDay,
  };
}

/**
 * Adds a variant to la hoja.
 *
 * On a card the control starts as an invitation and becomes a stepper once the
 * item is on the sheet — the container keeps its height through the swap so the
 * grid never jumps under the visitor's thumb.
 */
export function AddToHoja({ variant }: { variant: CatalogVariant }) {
  const { quantityOf, add, setQuantity } = useHoja();
  const quantity = quantityOf(variant.variantId);
  const name = variantName(variant.productName, variant.variantLabel);

  if (quantity === 0) {
    return (
      <Button
        variant="quiet"
        full
        onClick={() => add(toLine(variant), 1)}
        aria-label={`Agregar a la hoja: ${name}`}
      >
        <PlusIcon className="size-4" />
        Agregar
      </Button>
    );
  }

  return (
    <QuantityStepper
      value={quantity}
      onChange={(q) => setQuantity(variant.variantId, q)}
      label={name}
      min={0}
      className="justify-between"
    />
  );
}

/**
 * The detail-page version: pick a quantity first, then commit.
 *
 * The stepper takes a typed number, not only +/- taps — renting 150 chairs is
 * an ordinary order here, and nobody is tapping "+" 150 times.
 */
export function AddToHojaDetail({ variant }: { variant: CatalogVariant }) {
  const { quantityOf, add, setQuantity } = useHoja();
  const onSheet = quantityOf(variant.variantId);
  const name = variantName(variant.productName, variant.variantLabel);
  const [draft, setDraft] = useState(variant.pricePerDay > 200 ? 1 : 10);
  const [justAdded, setJustAdded] = useState(false);

  function commit() {
    if (draft < 1) return;
    add(toLine(variant), draft);
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 2400);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <span className="type-label text-stone-text">Cantidad</span>
        <QuantityStepper
          value={draft}
          onChange={setDraft}
          label={name}
          min={1}
          // No max: total_quantity is often unknown, and capping at a number
          // the business has not counted would refuse real orders.
          max={9999}
        />
      </div>

      <Button size="lg" full onClick={commit}>
        {justAdded ? (
          <>
            <CheckIcon className="size-5" />
            Agregado a la hoja
          </>
        ) : (
          <>
            <PlusIcon className="size-4" />
            Agregar a la hoja
          </>
        )}
      </Button>

      {onSheet > 0 && (
        <p className="text-center text-sm text-stone-text">
          Ya tenés{" "}
          <span className="type-mono font-medium text-ink">{onSheet}</span> en la
          hoja.{" "}
          <button
            type="button"
            onClick={() => setQuantity(variant.variantId, 0)}
            className="font-semibold text-mamey-text underline underline-offset-4 hover:text-mamey-dark"
          >
            Quitarlos
          </button>
        </p>
      )}
    </div>
  );
}
