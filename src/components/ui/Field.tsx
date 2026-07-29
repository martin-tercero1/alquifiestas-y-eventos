import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ChevronIcon } from "./icons";

/**
 * Form primitives.
 *
 * Sizing is deliberately generous — these same primitives get inherited by the
 * admin panel, which is used daily on a phone, in a warehouse, sometimes in a
 * hurry, by two people in their sixties. 52px controls and 17px text now is
 * cheaper than overriding a cramped default later.
 */

const CONTROL = cn(
  "w-full min-h-13 rounded-md border border-rule bg-paper-warm px-4 py-3",
  "text-base text-ink placeholder:text-stone-text/70",
  "transition-[border-color,box-shadow] duration-fast ease-out",
  "hover:border-rule-strong",
  "focus:border-green focus:outline-none focus:ring-2 focus:ring-green/25",
  "disabled:cursor-not-allowed disabled:bg-limewash disabled:text-stone-text",
);

type FieldProps = {
  label: string;
  htmlFor: string;
  /** Shown under the label. Explains, never sells. */
  hint?: string;
  /** What went wrong and how to fix it. Never vague, never apologetic. */
  error?: string;
  optional?: boolean;
  children: ReactNode;
  className?: string;
};

export function Field({
  label,
  htmlFor,
  hint,
  error,
  optional,
  children,
  className,
}: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={htmlFor} className="flex items-baseline gap-2">
        <span className="text-base font-semibold text-ink">{label}</span>
        {optional && (
          <span className="type-label text-stone-text">Opcional</span>
        )}
      </label>
      {hint && <p className="-mt-1 text-sm text-stone-text">{hint}</p>}
      {children}
      {error && (
        <p
          id={`${htmlFor}-error`}
          role="alert"
          className="text-sm font-medium text-mamey-text"
        >
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(CONTROL, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      rows={4}
      className={cn(CONTROL, "resize-y leading-relaxed", className)}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        className={cn(CONTROL, "cursor-pointer appearance-none pr-11", className)}
        {...props}
      >
        {children}
      </select>
      <ChevronIcon className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-stone-text" />
    </div>
  );
}

/**
 * A choice between a small number of visible options — pickup vs delivery,
 * cash vs transfer. Radio inputs styled as cards, because on a phone a tap
 * target you can read beats a 20px dot you have to aim at.
 */
type OptionCardProps = {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  title: string;
  detail: string;
  /** Extra context that only matters once this option is chosen. */
  note?: string;
};

export function OptionCard({
  name,
  value,
  checked,
  onChange,
  title,
  detail,
  note,
}: OptionCardProps) {
  return (
    <label
      className={cn(
        "flex cursor-pointer gap-3 rounded-lg border p-4",
        "transition-[border-color,background-color] duration-fast ease-out",
        "has-focus-visible:outline has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-mamey",
        checked
          ? "border-green bg-green-tint"
          : "border-rule bg-paper hover:border-rule-strong",
      )}
    >
      {/* The visible label carries a title, a detail and sometimes a note, so
          the control gets its name explicitly rather than inheriting all of it. */}
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        aria-label={title}
        aria-describedby={`${name}-${value}-detail`}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2",
          checked ? "border-green" : "border-rule-strong",
        )}
      >
        {checked && <span className="size-2.5 rounded-full bg-green" />}
      </span>
      <span className="flex flex-col gap-1">
        <span className="text-base font-semibold text-ink">{title}</span>
        <span id={`${name}-${value}-detail`} className="text-sm text-stone-text">
          {detail}
        </span>
        {checked && note && (
          <span className="mt-1 text-sm font-medium text-green-dark">
            {note}
          </span>
        )}
      </span>
    </label>
  );
}
