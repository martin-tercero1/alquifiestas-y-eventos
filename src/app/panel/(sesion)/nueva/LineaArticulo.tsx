"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { QuantityStepper } from "@/components/ui/QuantityStepper";
import { Input, Select } from "@/components/ui/Field";
import { CloseIcon } from "@/components/ui/icons";
import { check, type Availability } from "@/lib/availability";
import {
  fromCents,
  lineCents,
  type DraftLine,
  type DiscountType,
} from "@/lib/admin/proforma";

/**
 * One line of the proforma.
 *
 * Three things happen here that the brief calls out specifically:
 *
 *   - A missing price is typed on the line and the order continues. Much of
 *     the catalog has no price; refusing to quote would send her back to
 *     paper. The checkbox writes it back to the catalog, so the catalog fills
 *     itself in as a side effect of real work.
 *   - Availability WARNS. The shortage is stated in plain Spanish and the line
 *     stays usable. She knows things the database does not.
 *   - Unknown quantity says unknown, never zero.
 */

type Props = {
  line: DraftLine;
  billedDays: number;
  availability: Availability | undefined;
  onChange: (patch: Partial<DraftLine>) => void;
  onRemove: () => void;
};

export function LineaArticulo({
  line,
  billedDays,
  availability,
  onChange,
  onRemove,
}: Props) {
  const [showDiscount, setShowDiscount] = useState(
    line.discountType !== null,
  );

  const result = check(availability, line.quantity);
  const needsPrice = line.unitPrice === null;

  const name = line.variantLabel
    ? `${line.productName} — ${line.variantLabel}`
    : line.productName;

  return (
    <li
      className={cn(
        "rounded-lg border bg-paper p-4",
        needsPrice ? "border-mamey/40" : "border-rule",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold text-ink">{name}</p>
          <p className="type-label mt-0.5 text-stone-text">
            {line.categoryName}
          </p>
        </div>

        <button
          type="button"
          onClick={onRemove}
          aria-label={`Quitar ${name}`}
          className="-m-2 grid h-11 w-11 shrink-0 place-items-center rounded-md text-stone-text transition-colors duration-fast ease-out hover:bg-ink/[0.05] hover:text-ink"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <QuantityStepper
          value={line.quantity}
          onChange={(quantity) => onChange({ quantity })}
          label={`Cantidad de ${name}`}
          min={1}
        />

        {needsPrice ? (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="type-mono shrink-0 text-base text-stone-text">
              C$
            </span>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              placeholder="Precio"
              aria-label={`Precio por 24 horas de ${name}`}
              className="min-h-12 max-w-32 py-2"
              onChange={(e) => {
                const value = e.target.value.trim();
                onChange({
                  unitPrice: value === "" ? null : Number(value),
                  savePriceToCatalog: value !== "",
                });
              }}
            />
          </div>
        ) : (
          <p className="type-mono ml-auto text-right text-lg font-medium text-ink tabular-nums">
            {money(fromCents(lineCents(line, billedDays)))}
          </p>
        )}
      </div>

      {!needsPrice && (
        <p className="type-mono mt-2 text-sm text-stone-text">
          {money(line.unitPrice!)} × {line.quantity}
          {billedDays > 1 && ` × ${billedDays} días`}
        </p>
      )}

      {/* One pool, many looks: pick the colour/size/style for this line. It is
          the customer's choice, never inventory — the stock stays one count. */}
      {line.optionValues && line.optionValues.length > 0 && (
        <label className="mt-3 block">
          <span className="type-label text-stone-text">
            {line.optionName ?? "Opción"}
          </span>
          <Select
            className="mt-1"
            aria-label={`${line.optionName ?? "Opción"} de ${name}`}
            value={line.optionChoice ?? ""}
            onChange={(e) =>
              onChange({ optionChoice: e.target.value || null })
            }
          >
            <option value="">Sin elegir</option>
            {line.optionValues.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </Select>
        </label>
      )}

      {/* The price she just typed goes into the catalog unless she says no. */}
      {line.priceWasMissing && line.unitPrice !== null && (
        <label className="mt-3 flex items-start gap-3 rounded-md bg-limewash px-3 py-2.5">
          <input
            type="checkbox"
            checked={line.savePriceToCatalog}
            onChange={(e) =>
              onChange({ savePriceToCatalog: e.target.checked })
            }
            className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-green)]"
          />
          <span className="text-sm text-ink">
            Guardar {money(line.unitPrice)} como el precio de este artículo en
            el catálogo
          </span>
        </label>
      )}

      {/* Availability: a warning she can walk straight past. */}
      {result.status === "short" && (
        <p className="mt-3 rounded-md border border-mamey/30 bg-mamey/[0.06] px-3 py-2.5 text-sm font-medium text-mamey-text">
          {result.available === 0
            ? "No hay ninguno libre para esas fechas."
            : `Solo hay ${result.available} libres para esas fechas y pediste ${result.requested}.`}{" "}
          Podés seguir igual si sabés que se puede.
        </p>
      )}

      {result.status === "unknown" && (
        <p className="mt-3 text-sm text-stone-text">
          Sin cantidad registrada — confirmá en bodega.
        </p>
      )}

      {/* Discounts are manual, never automatic. Off the main path. */}
      {showDiscount ? (
        <div className="mt-3 flex items-center gap-2">
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            placeholder="0"
            aria-label={`Descuento en ${name}`}
            className="min-h-12 max-w-24 py-2"
            value={line.discountValue ?? ""}
            onChange={(e) =>
              onChange({
                discountValue:
                  e.target.value === "" ? null : Number(e.target.value),
                discountType: line.discountType ?? "amount",
              })
            }
          />
          <div className="flex gap-1">
            {(["amount", "percent"] as DiscountType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => onChange({ discountType: type })}
                className={cn(
                  "min-h-12 min-w-12 rounded-md border px-3 text-base font-semibold",
                  "transition-colors duration-fast ease-out",
                  line.discountType === type
                    ? "border-green bg-green/10 text-green"
                    : "border-rule text-stone-text",
                )}
              >
                {type === "amount" ? "C$" : "%"}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setShowDiscount(false);
              onChange({ discountType: null, discountValue: null });
            }}
            className="ml-auto min-h-12 px-2 text-sm font-semibold text-stone-text underline"
          >
            Quitar
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowDiscount(true)}
          className="mt-3 min-h-11 text-sm font-semibold text-green underline"
        >
          Descuento en esta línea
        </button>
      )}
    </li>
  );
}
