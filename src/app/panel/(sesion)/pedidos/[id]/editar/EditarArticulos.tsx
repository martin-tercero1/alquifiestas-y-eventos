"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { money, shortDate } from "@/lib/format";
import type { Availability } from "@/lib/availability";
import {
  availabilityFor,
  fromCents,
  lineCents,
  type CatalogHit,
  type DraftLine,
} from "@/lib/admin/proforma";
import { reviseOrderLines, type RevisedLine } from "@/lib/admin/order";
import type { RequestForEdit } from "@/lib/admin/loadOrder";
import { BuscadorArticulos } from "../../../nueva/BuscadorArticulos";
import { LineaArticulo } from "../../../nueva/LineaArticulo";

/**
 * Editing the articles on an online request before it is confirmed.
 *
 * It reuses the exact pieces of Nueva proforma — the same forgiving search, the
 * same line with its inline missing-price and warn-don't-block availability —
 * so there is one way to build an order's lines, whether it starts blank or
 * starts from what a customer asked for. The only thing it does NOT touch is
 * the customer, the dates, or the money terms: those belong to confirmation.
 */

export function EditarArticulos({ request }: { request: RequestForEdit }) {
  const router = useRouter();
  const detailHref = `/panel/pedidos/${request.id}`;

  const [lines, setLines] = useState<DraftLine[]>(request.lines);
  const [availability, setAvailability] = useState<Map<string, Availability>>(
    new Map(),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const billedDays = request.billedDays;

  // Availability for the request's dates, batched into one query, recomputed as
  // the lines change. Advisory only, exactly as in Nueva.
  const variantIds = useMemo(() => lines.map((l) => l.variantId), [lines]);
  const variantKey = variantIds.join(",");
  const requestId = useRef(0);

  useEffect(() => {
    if (variantIds.length === 0) {
      setAvailability(new Map());
      return;
    }
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      try {
        const result = await availabilityFor(
          variantIds,
          request.pickupDate,
          request.returnDate,
        );
        if (id === requestId.current) setAvailability(result);
      } catch {
        // No warning is fine; the order still works.
      }
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variantKey, request.pickupDate, request.returnDate]);

  const addedVariantIds = useMemo(
    () => new Set(lines.map((l) => l.variantId)),
    [lines],
  );

  function addItem(hit: CatalogHit) {
    const existing = lines.find((l) => l.variantId === hit.variantId);
    if (existing) {
      setLines((ls) =>
        ls.map((l) =>
          l.key === existing.key ? { ...l, quantity: l.quantity + 1 } : l,
        ),
      );
      return;
    }
    setLines((ls) => [
      ...ls,
      {
        key: `${hit.variantId}-${Date.now()}`,
        variantId: hit.variantId,
        productName: hit.productName,
        variantLabel: hit.variantLabel,
        categoryName: hit.categoryName,
        quantity: 1,
        unitPrice: hit.pricePerDay,
        priceWasMissing: hit.pricePerDay === null,
        savePriceToCatalog: false,
        discountType: null,
        discountValue: null,
        optionName: hit.optionName,
        optionValues: hit.optionValues,
        optionChoice: null,
      },
    ]);
  }

  const subtotalCents = lines.reduce((s, l) => s + lineCents(l, billedDays), 0);
  const unpriced = lines.filter((l) => l.unitPrice === null).length;

  async function onSave() {
    setSaving(true);
    setError(null);

    const payload: RevisedLine[] = lines.map((l) => ({
      variant_id: l.variantId,
      quantity: l.quantity,
      unit_price: l.unitPrice ?? 0,
      discount_type: l.discountType,
      discount_value: l.discountValue,
      save_price_to_catalog: l.savePriceToCatalog && l.unitPrice !== null,
      option_choice: l.optionChoice,
    }));

    const result = await reviseOrderLines(request.id, payload);
    if (!result.ok) {
      setError(result.message);
      setSaving(false);
      return;
    }
    router.push(detailHref);
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-6 pb-40">
      <Link href={detailHref} className="type-label text-stone-text hover:text-ink">
        ← Pedido #{request.number}
      </Link>
      <h1 className="type-display mt-2 text-3xl text-ink">Editar artículos</h1>
      <p className="mt-1 text-base text-stone-text">
        {request.customerName} · sale {shortDate(request.pickupDate)}
        {billedDays > 1 && ` · ${billedDays} días`}
      </p>

      <div className="mt-8 flex flex-col gap-4">
        <BuscadorArticulos
          onAdd={addItem}
          addedVariantIds={addedVariantIds}
          hasLines={lines.length > 0}
        />

        {lines.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-3">
            {lines.map((line) => (
              <LineaArticulo
                key={line.key}
                line={line}
                billedDays={billedDays}
                availability={availability.get(line.variantId)}
                onChange={(patch) =>
                  setLines((ls) =>
                    ls.map((l) => (l.key === line.key ? { ...l, ...patch } : l)),
                  )
                }
                onRemove={() =>
                  setLines((ls) => ls.filter((l) => l.key !== line.key))
                }
              />
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-mamey/40 bg-mamey/[0.06] px-4 py-3 text-base font-medium text-mamey-text">
            No queda ningún artículo. Agregá al menos uno o volvé sin guardar.
          </p>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="mt-6 rounded-md border border-mamey/30 bg-mamey/[0.06] px-4 py-3 text-base font-medium text-mamey-text"
        >
          {error}
        </p>
      )}

      {/* Sticky bar, above the panel's own bottom nav. */}
      <div className="fixed inset-x-0 bottom-20 z-30 border-t border-rule bg-paper/97 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-5 py-3">
          <div className="min-w-0 flex-1">
            <p className="type-label text-stone-text">Artículos</p>
            <p className="type-mono text-lg font-semibold text-ink tabular-nums">
              {money(fromCents(subtotalCents))}
              {unpriced > 0 && (
                <span className="type-label ml-2 text-mamey-text">
                  {unpriced === 1 ? "1 sin precio" : `${unpriced} sin precio`}
                </span>
              )}
            </p>
          </div>
          <Link
            href={detailHref}
            className="grid min-h-14 shrink-0 place-items-center rounded-md border border-rule px-5 text-base font-semibold text-ink"
          >
            Cancelar
          </Link>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || lines.length === 0}
            className="min-h-14 shrink-0 rounded-md bg-mamey px-6 text-lg font-semibold text-white transition-[background-color,transform] duration-fast ease-out active:scale-[0.98] disabled:opacity-45"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
