"use client";

import { useEffect, useId, useState } from "react";
import { cn } from "@/lib/cn";
import { MinusIcon, PlusIcon } from "./icons";

/**
 * Quantity control.
 *
 * The number is a real text input, not a display. Somebody renting 150 chairs
 * is not going to tap "+" 150 times, and that is the normal order size here.
 */

type Props = {
  value: number;
  onChange: (value: number) => void;
  label: string;
  min?: number;
  max?: number;
  size?: "sm" | "md";
  className?: string;
};

export function QuantityStepper({
  value,
  onChange,
  label,
  min = 0,
  max = 9999,
  size = "md",
  className,
}: Props) {
  const id = useId();
  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  // While the field is focused it holds raw text so the visitor can clear it
  // and retype — "" and mid-edit values are allowed. The clamped number only
  // travels back up to the parent on blur, or when the +/- buttons are used.
  const [draft, setDraft] = useState<string | null>(null);
  // Keep the draft in sync if the value changes from outside while editing
  // (e.g. the +/- buttons), so what's shown never lags the real value.
  useEffect(() => {
    if (draft !== null) setDraft(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const button = cn(
    "grid place-items-center shrink-0 rounded-md border border-rule bg-paper-warm text-ink",
    "transition-[background-color,border-color,transform] duration-press ease-out",
    "hover:border-rule-strong active:scale-[0.94]",
    "disabled:pointer-events-none disabled:text-stone disabled:bg-limewash",
    size === "md" ? "size-12" : "size-11",
  );

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        disabled={value <= min}
        className={button}
        aria-label={`Quitar uno: ${label}`}
      >
        <MinusIcon className="size-4" />
      </button>

      <input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={draft ?? String(value)}
        aria-label={`Cantidad: ${label}`}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "");
          setDraft(digits);
          // An empty or intermediate field isn't pushed up until blur, but any
          // real number is clamped and applied live so the rest of the UI keeps
          // reacting as they type.
          if (digits !== "") onChange(clamp(Number(digits)));
        }}
        onFocus={(e) => {
          setDraft(String(value));
          e.target.select();
        }}
        onBlur={() => {
          onChange(draft === null || draft === "" ? min : clamp(Number(draft)));
          setDraft(null);
        }}
        className={cn(
          "type-mono w-16 rounded-md border border-rule bg-paper-warm text-center",
          "text-lg font-medium text-ink",
          "transition-[border-color] duration-fast ease-out",
          "focus:border-green focus:outline-none focus:ring-2 focus:ring-green/25",
          size === "md" ? "h-12" : "h-11",
        )}
      />

      <button
        type="button"
        onClick={() => onChange(clamp(value + 1))}
        disabled={value >= max}
        className={button}
        aria-label={`Agregar uno: ${label}`}
      >
        <PlusIcon className="size-4" />
      </button>
    </div>
  );
}
