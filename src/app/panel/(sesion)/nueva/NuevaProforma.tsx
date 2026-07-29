"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { Field, Input, Textarea } from "@/components/ui/Field";
import type { Availability } from "@/lib/availability";
import {
  addDays,
  availabilityFor,
  clearDraft,
  daysBetween,
  draftHasContent,
  emptyDraft,
  fromCents,
  loadDraft,
  saveDraft,
  saveProforma,
  totals as computeTotals,
  type CatalogHit,
  type DiscountType,
  type Draft,
  type DraftLine,
} from "@/lib/admin/proforma";
import { ClienteSection } from "./ClienteSection";
import { BuscadorArticulos } from "./BuscadorArticulos";
import { LineaArticulo } from "./LineaArticulo";
import { BarraTotal } from "./BarraTotal";

/**
 * Nueva proforma — the screen the project lives or dies on.
 *
 * One scrolling screen, not a wizard: she can see the whole order and jump
 * back to any part of it, the way she can with a sheet of paper. The benchmark
 * is that taking an order here beats writing it by hand.
 *
 * Nothing here blocks. Missing prices are typed inline, shortages warn and are
 * walked past, and the draft is written to localStorage on every change so a
 * dropped connection cannot cost her the order.
 */

export function NuevaProforma() {
  const router = useRouter();

  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [restored, setRestored] = useState(false);
  const [availability, setAvailability] = useState<Map<string, Availability>>(
    new Map(),
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showOptional, setShowOptional] = useState(false);

  // ---- Draft persistence -------------------------------------------------

  useEffect(() => {
    const stored = loadDraft();
    if (stored && draftHasContent(stored)) {
      setDraft(stored);
      setRestored(true);
    }
  }, []);

  const update = useCallback((patch: Partial<Draft>) => {
    setDraft((current) => {
      const next = { ...current, ...patch };
      saveDraft(next);
      return next;
    });
    setRestored(false);
  }, []);

  // ---- Availability ------------------------------------------------------
  // Recomputed whenever the lines or the dates change. Batched into one query
  // for every line at once — never one call per row.

  const variantIds = useMemo(
    () => draft.lines.map((l) => l.variantId),
    [draft.lines],
  );
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
          draft.pickupDate,
          draft.returnDate,
        );
        if (id === requestId.current) setAvailability(result);
      } catch {
        // Availability is advisory. If it cannot be fetched the order still
        // works — she simply gets no warning, which is what paper gives her.
      }
    }, 250);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variantKey, draft.pickupDate, draft.returnDate]);

  // ---- Lines -------------------------------------------------------------

  const addedVariantIds = useMemo(
    () => new Set(draft.lines.map((l) => l.variantId)),
    [draft.lines],
  );

  function addItem(hit: CatalogHit) {
    const existing = draft.lines.find((l) => l.variantId === hit.variantId);

    // Tapping the same item again means "one more", not a duplicate row.
    if (existing) {
      update({
        lines: draft.lines.map((l) =>
          l.key === existing.key ? { ...l, quantity: l.quantity + 1 } : l,
        ),
      });
      return;
    }

    const line: DraftLine = {
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
    };

    update({ lines: [...draft.lines, line] });
  }

  const totals = computeTotals(draft);
  const canSave = draft.lines.length > 0 && draft.customerName.trim() !== "";

  async function onSave() {
    setSaving(true);
    setSaveError(null);

    const result = await saveProforma(draft);

    if (!result.ok) {
      setSaveError(result.message);
      setSaving(false);
      return;
    }

    // Only now is it safe to drop the local copy.
    clearDraft();
    router.push(`/panel/pedidos/${result.orderId}`);
  }

  // ---- Render ------------------------------------------------------------

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-6 pb-44">
      <h1 className="type-display text-3xl text-ink">Nueva proforma</h1>

      {restored && (
        <div className="mt-4 flex items-center gap-3 rounded-md border border-green/30 bg-green/[0.07] px-4 py-3">
          <p className="flex-1 text-sm font-medium text-green">
            Recuperamos lo que estabas escribiendo.
          </p>
          <button
            type="button"
            onClick={() => {
              clearDraft();
              setDraft(emptyDraft());
              setRestored(false);
            }}
            className="min-h-11 shrink-0 text-sm font-semibold text-green underline"
          >
            Empezar de cero
          </button>
        </div>
      )}

      <div className="mt-8 flex flex-col gap-10">
        <ClienteSection
          customerId={draft.customerId}
          name={draft.customerName}
          phone={draft.customerPhone}
          onChange={update}
        />

        {/* ---- Dates ---- */}
        <section className="flex flex-col gap-4">
          <h2 className="type-label text-stone-text">Fechas</h2>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Sale" htmlFor="fecha-salida">
              <Input
                id="fecha-salida"
                type="date"
                value={draft.pickupDate}
                onChange={(e) => {
                  const pickupDate = e.target.value;
                  update({
                    pickupDate,
                    // Keep the rental the same length rather than letting the
                    // return date fall behind the pickup date.
                    returnDate:
                      draft.returnDate < pickupDate
                        ? pickupDate
                        : draft.returnDate,
                  });
                }}
              />
            </Field>

            <Field label="Regresa" htmlFor="fecha-regreso">
              <Input
                id="fecha-regreso"
                type="date"
                min={draft.pickupDate}
                value={draft.returnDate}
                onChange={(e) => update({ returnDate: e.target.value })}
              />
            </Field>
          </div>

          <div className="flex flex-wrap gap-2">
            {[1, 2, 3].map((days) => {
              const active =
                daysBetween(draft.pickupDate, draft.returnDate) === days;
              return (
                <button
                  key={days}
                  type="button"
                  onClick={() =>
                    update({
                      returnDate: addDays(draft.pickupDate, days - 1),
                    })
                  }
                  className={cn(
                    "min-h-12 rounded-full border px-5 text-base font-semibold",
                    "transition-colors duration-fast ease-out",
                    active
                      ? "border-green bg-green/10 text-green"
                      : "border-rule text-stone-text",
                  )}
                >
                  {days === 1 ? "1 día" : `${days} días`}
                </button>
              );
            })}
          </div>
        </section>

        {/* ---- Items ---- */}
        <section className="flex flex-col gap-4">
          <h2 className="type-label text-stone-text">Artículos</h2>

          <BuscadorArticulos
            onAdd={addItem}
            addedVariantIds={addedVariantIds}
            hasLines={draft.lines.length > 0}
          />

          {draft.lines.length > 0 && (
            <ul className="mt-2 flex flex-col gap-3">
              {draft.lines.map((line) => (
                <LineaArticulo
                  key={line.key}
                  line={line}
                  billedDays={totals.billedDays}
                  availability={availability.get(line.variantId)}
                  onChange={(patch) =>
                    update({
                      lines: draft.lines.map((l) =>
                        l.key === line.key ? { ...l, ...patch } : l,
                      ),
                    })
                  }
                  onRemove={() =>
                    update({
                      lines: draft.lines.filter((l) => l.key !== line.key),
                    })
                  }
                />
              ))}
            </ul>
          )}
        </section>

        {/* ---- Optional, collapsed ---- */}
        <section className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => setShowOptional((v) => !v)}
            aria-expanded={showOptional}
            className="flex min-h-13 items-center justify-between rounded-md border border-rule bg-paper px-4 text-base font-semibold text-ink"
          >
            Entrega, depósito, descuento y notas
            <span aria-hidden className="text-stone-text">
              {showOptional ? "−" : "+"}
            </span>
          </button>

          {showOptional && (
            <div className="flex flex-col gap-5">
              <div className="flex gap-2">
                {(
                  [
                    ["pickup", "Retira en el local"],
                    ["delivery", "Entrega a domicilio"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => update({ fulfilment: value })}
                    className={cn(
                      "min-h-13 flex-1 rounded-md border px-3 text-sm font-semibold",
                      "transition-colors duration-fast ease-out",
                      draft.fulfilment === value
                        ? "border-green bg-green/10 text-green"
                        : "border-rule text-stone-text",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {draft.fulfilment === "delivery" && (
                <Field
                  label="Dirección"
                  htmlFor="direccion"
                  hint="El costo del envío se cotiza aparte, a mano."
                >
                  <Textarea
                    id="direccion"
                    rows={2}
                    value={draft.deliveryAddress}
                    onChange={(e) =>
                      update({ deliveryAddress: e.target.value })
                    }
                  />
                </Field>
              )}

              <Field label="Depósito de garantía" htmlFor="deposito" optional>
                <Input
                  id="deposito"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={draft.securityDeposit}
                  onChange={(e) =>
                    update({ securityDeposit: e.target.value })
                  }
                />
              </Field>

              <Field
                label="Descuento en el total"
                htmlFor="descuento"
                optional
                hint="Siempre a mano. El sistema nunca lo calcula solo."
              >
                <div className="flex gap-2">
                  <Input
                    id="descuento"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={draft.discountValue}
                    onChange={(e) =>
                      update({
                        discountValue: e.target.value,
                        discountType: draft.discountType ?? "amount",
                      })
                    }
                  />
                  {(["amount", "percent"] as DiscountType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => update({ discountType: type })}
                      className={cn(
                        "min-h-13 min-w-14 rounded-md border px-3 text-base font-semibold",
                        draft.discountType === type
                          ? "border-green bg-green/10 text-green"
                          : "border-rule text-stone-text",
                      )}
                    >
                      {type === "amount" ? "C$" : "%"}
                    </button>
                  ))}
                </div>
              </Field>

              <Field
                label="Número de factura membretada"
                htmlFor="factura"
                optional
                hint="Para enlazar esta proforma con la factura de papel."
              >
                <Input
                  id="factura"
                  value={draft.physicalInvoiceNumber}
                  onChange={(e) =>
                    update({ physicalInvoiceNumber: e.target.value })
                  }
                />
              </Field>

              <Field label="Notas" htmlFor="notas" optional>
                <Textarea
                  id="notas"
                  rows={3}
                  value={draft.notes}
                  onChange={(e) => update({ notes: e.target.value })}
                />
              </Field>
            </div>
          )}
        </section>

        {/* ---- Breakdown ---- */}
        {draft.lines.length > 0 && (
          <dl className="flex flex-col gap-2 border-t border-rule pt-5 text-base">
            <div className="flex justify-between">
              <dt className="text-stone-text">Artículos</dt>
              <dd className="type-mono text-ink tabular-nums">
                {money(fromCents(totals.linesCents))}
              </dd>
            </div>
            {totals.orderDiscountCents > 0 && (
              <div className="flex justify-between">
                <dt className="text-stone-text">Descuento</dt>
                <dd className="type-mono text-mamey-text tabular-nums">
                  −{money(fromCents(totals.orderDiscountCents))}
                </dd>
              </div>
            )}
            {totals.depositCents > 0 && (
              <div className="flex justify-between">
                <dt className="text-stone-text">
                  Depósito (se devuelve)
                </dt>
                <dd className="type-mono text-ink tabular-nums">
                  {money(fromCents(totals.depositCents))}
                </dd>
              </div>
            )}
          </dl>
        )}

        {saveError && (
          <p
            role="alert"
            className="rounded-md border border-mamey/30 bg-mamey/[0.06] px-4 py-3 text-base font-medium text-mamey-text"
          >
            {saveError}
          </p>
        )}
      </div>

      <BarraTotal
        totals={totals}
        saving={saving}
        canSave={canSave}
        onSave={onSave}
      />
    </div>
  );
}
