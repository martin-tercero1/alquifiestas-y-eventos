"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ChevronIcon } from "@/components/ui/icons";

/**
 * A collapsible section — a big, forgiving header that opens and closes a panel
 * beneath it. Several can be open at once; each keeps its own state.
 *
 * Used to break the long catalog into categories on both Inventario and Nueva,
 * so the parents can glance at what exists and open only the shelf they want.
 * The header clears the 48px tap target with room to spare — this is a thumb on
 * a phone, not a cursor.
 *
 * Height animates via the grid `0fr → 1fr` trick, which needs no measured pixel
 * height and so never fights variable-length content. The reduced-motion rule in
 * globals.css collapses the transition to nothing for anyone who asks for it.
 */
export function Collapsible({
  title,
  count,
  defaultOpen = false,
  forceOpen = false,
  children,
  className,
}: {
  title: ReactNode;
  /** A small tally shown next to the title, e.g. how many items are inside. */
  count?: number;
  defaultOpen?: boolean;
  /** Show open regardless of internal state — e.g. while a search is filtering
   *  the list, so matches are never hidden inside a collapsed section. */
  forceOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = forceOpen || internalOpen;
  const panelId = useId();

  return (
    <section className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setInternalOpen((v) => !v)}
        className={cn(
          "flex w-full min-h-14 items-center justify-between gap-3 rounded-lg border px-4 text-left",
          "transition-colors duration-fast ease-out",
          open
            ? "border-rule-strong bg-paper"
            : "border-rule bg-paper hover:border-rule-strong",
        )}
      >
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="type-display truncate text-lg text-ink">{title}</span>
          {count !== undefined && (
            <span className="type-mono shrink-0 text-sm text-stone-text">
              {count}
            </span>
          )}
        </span>
        <ChevronIcon
          className={cn(
            "size-5 shrink-0 text-stone-text transition-transform duration-mid ease-out",
            open ? "rotate-0" : "-rotate-90",
          )}
        />
      </button>

      <div
        id={panelId}
        className="grid transition-[grid-template-rows] duration-mid ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        {/* overflow-hidden is what lets the 0fr row clip its contents; `inert`
            keeps a collapsed shelf's buttons out of tab order and off screen
            readers, since the grid trick leaves them in the DOM. */}
        <div className="overflow-hidden" inert={!open}>
          <div className="pt-2">{children}</div>
        </div>
      </div>
    </section>
  );
}
