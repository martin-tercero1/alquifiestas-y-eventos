"use client";

import Link from "next/link";
import { money, dayCount } from "@/lib/format";
import { cn } from "@/lib/cn";
import { QuantityStepper } from "@/components/ui/QuantityStepper";
import { CloseIcon } from "@/components/ui/icons";
import { useHoja, type ResolvedLine } from "./HojaProvider";

/**
 * The sheet itself: ruled rows, monospaced counts, a total at the foot.
 *
 * The rules here are the one place in the design where hairlines are allowed,
 * because they encode a real form the business already fills in by hand rather
 * than decorating a page.
 */

export function HojaTable({
  editable = true,
  className,
}: {
  editable?: boolean;
  className?: string;
}) {
  const { resolved, subtotalPerDay, total, days, setQuantity, remove } =
    useHoja();

  if (resolved.length === 0) {
    return (
      <div className={cn("py-10 text-center", className)}>
        <p className="type-label text-stone-text">La hoja está vacía</p>
        <p className="mx-auto mt-3 max-w-xs text-base text-stone-text">
          Andá al catálogo y agregá lo que necesitás. Acá se te va sumando el
          total mientras elegís.
        </p>
        <Link
          href="/catalogo"
          className="mt-4 inline-block font-semibold text-mamey-text underline underline-offset-4 hover:text-mamey-dark"
        >
          Ver el catálogo
        </Link>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between border-b border-ink/20 pb-2">
        <span className="type-label text-stone-text">Cant · Artículo</span>
        <span className="type-label text-stone-text">Importe</span>
      </div>

      <ul>
        {resolved.map((line) => (
          <HojaRow
            key={line.variantId}
            line={line}
            editable={editable}
            onQuantity={(q) => setQuantity(line.variantId, q)}
            onRemove={() => remove(line.variantId)}
          />
        ))}
      </ul>

      <dl className="mt-1 border-t border-ink/20 pt-3">
        <Total label="Subtotal por 24 horas" value={money(subtotalPerDay)} />
        <Total label="Días de alquiler" value={dayCount(days)} />
        <div className="mt-2 flex items-baseline justify-between border-t-2 border-ink pt-3">
          <dt className="type-label text-ink">Total</dt>
          <dd className="type-display text-2xl tabular-nums text-ink">
            {money(total)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function HojaRow({
  line,
  editable,
  onQuantity,
  onRemove,
}: {
  line: ResolvedLine;
  editable: boolean;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
}) {
  const { name, quantity, perDay, pricePerDay, categorySlug, productSlug } = line;

  return (
    <li className="border-b border-rule py-3">
      <div className="flex items-baseline justify-between gap-3">
        <Link
          href={`/catalogo/${categorySlug}/${productSlug}`}
          className="text-base font-semibold text-ink hover:text-mamey-text"
        >
          {name}
        </Link>
        <span className="type-mono shrink-0 text-base font-medium text-ink">
          {money(perDay)}
        </span>
      </div>

      <div className="mt-1 flex items-center justify-between gap-3">
        <p className="type-mono text-xs text-stone-text">
          {money(pricePerDay)} c/u
        </p>

        {editable ? (
          <div className="flex items-center gap-1">
            <QuantityStepper
              value={quantity}
              onChange={onQuantity}
              label={name}
              min={1}
              size="sm"
            />
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Quitar de la hoja: ${name}`}
              className={cn(
                "grid size-11 shrink-0 place-items-center rounded-md text-stone-text",
                "transition-colors duration-fast ease-out",
                "hover:bg-mamey-tint hover:text-mamey-text",
              )}
            >
              <CloseIcon className="size-4" />
            </button>
          </div>
        ) : (
          <span className="type-mono text-base text-ink">×{quantity}</span>
        )}
      </div>
    </li>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-1">
      <dt className="text-sm text-stone-text">{label}</dt>
      <dd className="type-mono text-base text-ink">{value}</dd>
    </div>
  );
}
