"use client";

import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { fromCents, type NewOrderStatus, type Totals } from "@/lib/admin/proforma";

/**
 * The running total, pinned above the bottom bar.
 *
 * The brief asks for it to be visible without scrolling and to update
 * "instantly and without animation" — so there is no transition on the number
 * at all. A total that counts up is a total she has to wait for, and the
 * tabular figures mean the row does not reflow as digits change.
 *
 * Two explicit save actions, not one: confirming reserves the stock, saving a
 * quote does not. The consequence is too important to hide behind a single
 * button, so each intent gets its own — the primary "Confirmar", and the quieter
 * "Cotización" beside it.
 */

type Props = {
  totals: Totals;
  saving: boolean;
  canSave: boolean;
  onSave: (status: NewOrderStatus) => void;
};

export function BarraTotal({ totals, saving, canSave, onSave }: Props) {
  return (
    <div className="fixed inset-x-0 bottom-20 z-30 border-t border-rule bg-paper/97 backdrop-blur-sm">
      <div className="mx-auto w-full max-w-2xl px-5 py-3">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="type-label text-stone-text">
              Total
              {totals.billedDays > 1 && ` · ${totals.billedDays} días`}
            </p>
            <p className="type-display text-2xl text-ink tabular-nums">
              {money(fromCents(totals.totalCents))}
            </p>
            {totals.unpricedLines > 0 && (
              <p className="text-xs font-medium text-mamey-text">
                {totals.unpricedLines === 1
                  ? "1 artículo sin precio"
                  : `${totals.unpricedLines} artículos sin precio`}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => onSave("quote")}
              disabled={!canSave || saving}
              className={cn(
                "min-h-14 rounded-md border border-rule px-4 text-base font-semibold text-ink",
                "transition-colors duration-fast ease-out hover:border-rule-strong",
                "disabled:pointer-events-none disabled:opacity-45",
              )}
            >
              Cotización
            </button>
            <button
              type="button"
              onClick={() => onSave("confirmed")}
              disabled={!canSave || saving}
              className={cn(
                "min-h-14 rounded-md border border-transparent px-5 text-lg font-semibold",
                "bg-mamey text-white transition-[background-color,transform] duration-fast ease-out",
                "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45",
              )}
            >
              {saving ? "Guardando…" : "Confirmar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
