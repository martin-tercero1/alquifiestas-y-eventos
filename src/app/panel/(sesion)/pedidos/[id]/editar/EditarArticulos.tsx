"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { money } from "@/lib/format";
import { Field, Input, Textarea } from "@/components/ui/Field";
import type { Availability } from "@/lib/availability";
import {
  availabilityFor,
  daysBetween,
  fromCents,
  lineCents,
  type CatalogHit,
  type DraftLine,
} from "@/lib/admin/proforma";
import {
  reviseOrderLines,
  updateOrderDetails,
  type RevisedLine,
} from "@/lib/admin/order";
import type { RequestForEdit } from "@/lib/admin/loadOrder";
import { BuscadorArticulos } from "../../../nueva/BuscadorArticulos";
import { LineaArticulo } from "../../../nueva/LineaArticulo";

/**
 * Editing an order in place — its articles, its dates and its money terms.
 *
 * It reuses the exact pieces of Nueva proforma — the same forgiving search, the
 * same line with its inline missing-price and warn-don't-block availability —
 * so there is one way to build an order's lines, whether it starts blank or
 * from what already exists. The open window is a quote, a website request, or a
 * confirmed order: the common "already agreed, now needs changes" case is
 * handled here rather than by cancelling and starting over.
 */

export function EditarArticulos({ request }: { request: RequestForEdit }) {
  const router = useRouter();
  const detailHref = `/panel/pedidos/${request.id}`;

  const [lines, setLines] = useState<DraftLine[]>(request.lines);
  const [pickupDate, setPickupDate] = useState(request.pickupDate);
  const [returnDate, setReturnDate] = useState(request.returnDate);
  const [pickupTime, setPickupTime] = useState(request.pickupTime ?? "");
  const [returnTime, setReturnTime] = useState(request.returnTime ?? "");
  const [securityDeposit, setSecurityDeposit] = useState(
    request.securityDeposit != null ? String(request.securityDeposit) : "",
  );
  const [notes, setNotes] = useState(request.notes ?? "");
  const [availability, setAvailability] = useState<Map<string, Availability>>(
    new Map(),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const badDates = !pickupDate || !returnDate || returnDate < pickupDate;
  const billedDays = badDates ? request.billedDays : daysBetween(pickupDate, returnDate);

  // Availability for the (possibly edited) dates, batched into one query,
  // recomputed as the lines or dates change. Advisory only, exactly as in Nueva.
  const variantIds = useMemo(() => lines.map((l) => l.variantId), [lines]);
  const variantKey = variantIds.join(",");
  const requestId = useRef(0);

  useEffect(() => {
    if (variantIds.length === 0 || badDates) {
      setAvailability(new Map());
      return;
    }
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      try {
        const result = await availabilityFor(variantIds, pickupDate, returnDate);
        if (id === requestId.current) setAvailability(result);
      } catch {
        // No warning is fine; the order still works.
      }
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variantKey, pickupDate, returnDate, badDates]);

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
    if (badDates) {
      setError("Revisá las fechas: el regreso no puede ser antes de la salida.");
      return;
    }
    setSaving(true);
    setError(null);

    // Dates/terms first so the shortage recompute inside revise_order_lines
    // reads the new window, then the lines.
    const details = await updateOrderDetails(request.id, {
      pickupDate,
      returnDate,
      pickupTime: pickupTime || null,
      returnTime: returnTime || null,
      securityDeposit: Number(securityDeposit) || null,
      notes: notes.trim() || null,
      physicalInvoiceNumber: request.physicalInvoiceNumber,
    });
    if (!details.ok) {
      setError(details.message);
      setSaving(false);
      return;
    }

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
      <h1 className="type-display mt-2 text-3xl text-ink">Editar pedido</h1>
      <p className="mt-1 text-base text-stone-text">
        {request.customerName}
        {billedDays > 1 && ` · ${billedDays} días`}
      </p>

      {/* ---- Fechas y términos ---- */}
      <section className="mt-8 grid grid-cols-2 gap-3">
        <Field label="Sale" htmlFor="edit-salida">
          <Input
            id="edit-salida"
            type="date"
            value={pickupDate}
            onChange={(e) => setPickupDate(e.target.value)}
          />
        </Field>
        <Field label="Regresa" htmlFor="edit-regreso">
          <Input
            id="edit-regreso"
            type="date"
            min={pickupDate}
            value={returnDate}
            onChange={(e) => setReturnDate(e.target.value)}
          />
        </Field>
        <Field label="Hora de salida" htmlFor="edit-hora-salida">
          <Input
            id="edit-hora-salida"
            type="time"
            value={pickupTime}
            onChange={(e) => setPickupTime(e.target.value)}
          />
        </Field>
        <Field label="Hora de regreso" htmlFor="edit-hora-regreso">
          <Input
            id="edit-hora-regreso"
            type="time"
            value={returnTime}
            onChange={(e) => setReturnTime(e.target.value)}
          />
        </Field>
        <Field label="Depósito de garantía" htmlFor="edit-deposito" optional>
          <Input
            id="edit-deposito"
            type="number"
            inputMode="decimal"
            min={0}
            value={securityDeposit}
            onChange={(e) => setSecurityDeposit(e.target.value)}
          />
        </Field>
        <div className="col-span-2">
          <Field label="Notas" htmlFor="edit-notas" optional>
            <Textarea
              id="edit-notas"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </div>
      </section>

      {/* ---- Artículos ---- */}
      <div className="mt-8 flex flex-col gap-4">
        <h2 className="type-label text-stone-text">Artículos</h2>
        <BuscadorArticulos onAdd={addItem} addedVariantIds={addedVariantIds} />

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
