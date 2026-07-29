"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { money, lineCount as formatLines, compactDate } from "@/lib/format";
import { business, whatsappLink, whatsappMessages } from "@/lib/business";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { ChevronIcon, SheetIcon, WhatsAppIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { useHoja } from "./HojaProvider";
import { HojaTable } from "./HojaTable";
import { DateControls } from "./DateControls";

/**
 * The pinned sheet: collapsed to a bar at the bottom of every page, expanding
 * into the full ruled form.
 *
 * It stays hidden until there is something on it — an empty bar would cost
 * 64px of a 360px screen and say nothing. The request page shows the sheet
 * inline, so the bar stands down there too.
 */

export function LaHoja() {
  const pathname = usePathname();
  const { resolved, lineCount, total, eventDate, ready } = useHoja();
  const [open, setOpen] = useState(false);
  const [entered, setEntered] = useState(false);

  const hasLines = resolved.length > 0;
  const hiddenOnRoute = pathname?.startsWith("/solicitar") ?? false;
  const showBar = ready && hasLines && !hiddenOnRoute;

  // Slide the bar up the first time it has something to say.
  useEffect(() => {
    if (!showBar) {
      setEntered(false);
      return;
    }
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [showBar]);

  useEffect(() => {
    if (!showBar) setOpen(false);
  }, [showBar]);

  if (!showBar) return null;

  const summary = resolved
    .map((l) => `${l.quantity} × ${l.name}`)
    .join("\n");

  return (
    <>
      {/* Keeps the last of the page content clear of the bar. */}
      <div aria-hidden="true" className="h-20" />

      <div
        className={cn(
          "on-ink fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-ink",
          "transition-transform duration-sheet ease-sheet",
          entered ? "translate-y-0" : "translate-y-full",
        )}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          className={cn(
            "mx-auto flex w-full max-w-(--container-max) cursor-pointer items-center gap-3",
            "px-4 py-3 text-left transition-colors duration-fast ease-out",
            "hover:bg-ink-soft sm:px-6",
          )}
        >
          <SheetIcon className="size-5 shrink-0 text-ink-muted" />

          <span className="min-w-0 flex-1">
            {/* Clipped rather than wrapped: the bar must stay one row tall on
                a 360px screen no matter how long the sheet gets. */}
            <span className="type-label block truncate text-ink-muted">
              La hoja · {formatLines(lineCount)}
              {eventDate ? ` · ${compactDate(eventDate)}` : ""}
            </span>
            <span className="type-display block text-xl tabular-nums text-white">
              {money(total)}
            </span>
          </span>

          <span className="type-label hidden text-ink-muted sm:block">
            Ver la hoja
          </span>
          <ChevronIcon className="size-4 shrink-0 rotate-180 text-white" />
        </button>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title="La hoja">
        <div className="flex items-baseline justify-between gap-4 px-5 pb-4 sm:px-6">
          <div>
            <h2 className="type-display text-2xl text-ink">La hoja</h2>
            <p className="mt-1 text-sm text-stone-text">
              Lo que llevás hasta ahora. Todavía no es una reserva.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="type-label shrink-0 rounded-md px-2 py-2 text-stone-text hover:text-ink"
          >
            Cerrar
          </button>
        </div>

        {/* Lines and total first: opening the sheet has to answer "what am I
            taking and what does it cost" without a scroll. The dates follow. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6">
          <HojaTable />
          <DateControls className="mt-8 border-t border-rule pt-6 pb-2" />
        </div>

        <div className="shrink-0 border-t border-rule bg-paper px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
          <div className="flex flex-col gap-3">
            <Button href="/solicitar" size="lg" full onClick={() => setOpen(false)}>
              Solicitar reserva
            </Button>
            <Button
              href={whatsappLink(whatsappMessages.quote(summary))}
              variant="secondary"
              full
            >
              <WhatsAppIcon className="size-5" />
              Mandarlo por WhatsApp
            </Button>
          </div>
          <p className="mt-3 text-center text-xs text-stone-text">
            También podés llamarnos al {business.phone.display}.
          </p>
        </div>
      </Sheet>
    </>
  );
}
