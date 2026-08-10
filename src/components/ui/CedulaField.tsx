"use client";

import { Field, Input } from "./Field";
import {
  CEDULA_PLACEHOLDER,
  cedulaWarning,
  formatCedula,
} from "@/lib/cedula";

/**
 * Cédula entry (Brief 04 §2).
 *
 * Staff type it off a physical card, so the dashes are inserted automatically
 * and the expected shape is shown as a placeholder and a hint. Validation warns
 * but never blocks — the 2026 format transition means two shapes coexist, and a
 * tourist or a company with only a RUC must still be storable.
 *
 * Shared by the public form and the panel; it carries no heavy dependency.
 */
export function CedulaField({
  id,
  value,
  onChange,
  label = "Cédula",
  optional = true,
  required = false,
  hint = "El número de la cédula. La tenemos en físico hasta que regresen los artículos.",
  disabled = false,
}: {
  id: string;
  value: string;
  onChange: (formatted: string) => void;
  label?: string;
  optional?: boolean;
  /** Marks the field visually required (e.g. at pickup). Never hard-blocks. */
  required?: boolean;
  hint?: string;
  disabled?: boolean;
}) {
  const warning = disabled ? null : cedulaWarning(value);

  return (
    <Field
      label={label}
      htmlFor={id}
      optional={optional && !required}
      hint={hint}
      error={warning ?? undefined}
    >
      <Input
        id={id}
        inputMode="text"
        autoComplete="off"
        value={value}
        placeholder={CEDULA_PLACEHOLDER}
        onChange={(e) => onChange(formatCedula(e.target.value))}
        aria-invalid={Boolean(warning)}
        aria-required={required}
        disabled={disabled}
      />
    </Field>
  );
}
