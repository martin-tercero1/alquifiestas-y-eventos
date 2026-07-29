"use client";

import { shortDate, todayISO } from "@/lib/format";
import { Field, Input } from "@/components/ui/Field";
import { QuantityStepper } from "@/components/ui/QuantityStepper";
import { useHoja, returnDate } from "./HojaProvider";
import { cn } from "@/lib/cn";

/**
 * Event date and length of rental.
 *
 * Expressed as "pickup date + number of days" rather than two date pickers,
 * because that is how the business prices it — the unit is 24 hours and the
 * total is linear. The return date is shown as a consequence, so nobody has to
 * work out what "3 días" means on a calendar.
 */

export function DateControls({
  layout = "stacked",
  className,
}: {
  layout?: "stacked" | "row";
  className?: string;
}) {
  const { eventDate, days, setEventDate, setDays } = useHoja();

  return (
    <div
      className={cn(
        "gap-4",
        layout === "row" ? "grid sm:grid-cols-2" : "flex flex-col",
        className,
      )}
    >
      <Field
        label="Fecha del evento"
        htmlFor="hoja-fecha"
        hint="El día que retirás los artículos."
      >
        <Input
          id="hoja-fecha"
          type="date"
          min={todayISO()}
          value={eventDate ?? ""}
          onChange={(e) => setEventDate(e.target.value || null)}
        />
      </Field>

      <Field
        label="¿Cuántos días?"
        htmlFor="hoja-dias"
        hint="El precio es por cada 24 horas."
      >
        <div className="flex flex-wrap items-center gap-3">
          <QuantityStepper
            value={days}
            onChange={setDays}
            label="días de alquiler"
            min={1}
            max={60}
          />
          {eventDate && (
            <p className="text-sm text-stone-text">
              Devolvés el{" "}
              <span className="type-mono font-medium text-ink">
                {shortDate(returnDate(eventDate, days))}
              </span>
            </p>
          )}
        </div>
      </Field>
    </div>
  );
}
