"use client";

import { useEffect, useState } from "react";
import { Field, Input, Select } from "@/components/ui/Field";
import {
  callingCodes,
  joinPhone,
  phoneWarning,
  splitPhone,
} from "@/lib/admin/phone";

/**
 * Staff phone entry (Brief 04 §1).
 *
 * The common case — a Nicaraguan 8-digit number — is the whole focus: the code
 * sits to the side pre-selected to 505 and visually secondary, and the person
 * just types 8 digits without thinking about a prefix. The occasional foreign
 * customer can change the code, but the interface never makes the common case
 * pay for that rare one.
 *
 * The value it reads and writes is the full international number as stored
 * (digits only, e.g. 50588887777); it keeps the code + national split in local
 * state so typing a partial number is never re-parsed underneath the cursor.
 */
export function PhoneField({
  id,
  value,
  onChange,
  label = "Teléfono",
  optional = true,
}: {
  id: string;
  /** Full stored phone (digits) or "" for none. */
  value: string;
  onChange: (fullDigits: string) => void;
  label?: string;
  optional?: boolean;
}) {
  const [cc, setCc] = useState(() => splitPhone(value).cc);
  const [national, setNational] = useState(() => splitPhone(value).national);

  // Re-sync only when the value is changed from OUTSIDE (picking a search hit,
  // opening the sheet on another record) — never while the user is typing, so
  // the parse doesn't fight the cursor.
  useEffect(() => {
    const external = (value ?? "").replace(/\D/g, "");
    if (external !== joinPhone(cc, national)) {
      const parts = splitPhone(value);
      setCc(parts.cc);
      setNational(parts.national);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const warning = phoneWarning(cc, national);
  const codes = callingCodes(cc);

  function update(nextCc: string, nextNational: string) {
    setCc(nextCc);
    setNational(nextNational);
    onChange(joinPhone(nextCc, nextNational));
  }

  return (
    <Field
      label={label}
      htmlFor={id}
      optional={optional}
      hint={warning ?? undefined}
    >
      <div className="flex gap-2">
        <Select
          aria-label="Código de país"
          value={cc}
          onChange={(e) => update(e.target.value, national)}
          className="w-32 shrink-0 text-stone-text"
        >
          {codes.map((c) => (
            <option key={c.cc} value={c.cc}>
              {c.label}
            </option>
          ))}
        </Select>
        <Input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="off"
          value={national}
          placeholder="8888 7777"
          onChange={(e) =>
            update(cc, e.target.value.replace(/\D/g, "").slice(0, 15))
          }
          className="flex-1"
          aria-invalid={Boolean(warning)}
        />
      </div>
    </Field>
  );
}
