"use client";

import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { fromCents, type Totals } from "@/lib/admin/proforma";

/**
 * The running total, pinned above the bottom bar.
 *
 * The brief asks for it to be visible without scrolling and to update
 * "instantly and without animation" — so there is no transition on the number
 * at all. A total that counts up is a total she has to wait for, and the
 * tabular figures mean the row does not reflow as digits change.
 */

type Props = {
  totals: Totals;
  saving: boolean;
  canSave: boolean;
  onSave: () => void;
};

export function BarraTotal({ totals, saving, canSave, onSave }: Props) {
  return (
    <div className="fixed inset-x-0 bottom-20 z-30 border-t border-rule bg-paper/97 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-2xl items-center gap-4 px-5 py-3">
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

        <button
          type="button"
          onClick={onSave}
          disabled={!canSave || saving}
          className={cn(
            "min-h-14 shrink-0 rounded-md border border-transparent px-7 text-lg font-semibold",
            "bg-mamey text-white transition-[background-color,transform] duration-fast ease-out",
            "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45",
          )}
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </div>
  );
}
