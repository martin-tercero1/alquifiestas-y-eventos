"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { PhoneField } from "@/components/panel/PhoneField";
import { CedulaField } from "@/components/ui/CedulaField";
import { createCustomer, updateCustomer } from "@/lib/admin/customers";
import { formatCedula } from "@/lib/cedula";

/**
 * The one form Clientes needs, for both a new contact and an edit. A name is
 * required; a phone is not — a quarter of the book has none and the form never
 * nags for it.
 */

export function ClienteFormSheet({
  open,
  mode,
  initial,
  onClose,
  onCreated,
  onSaved,
}: {
  open: boolean;
  mode: "create" | "edit";
  initial?: {
    id: string;
    name: string;
    phone: string | null;
    cedula: string | null;
  };
  onClose: () => void;
  onCreated?: (id: string) => void;
  onSaved?: (patch: {
    name: string;
    phone: string | null;
    cedula: string | null;
  }) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [cedula, setCedula] = useState(formatCedula(initial?.cedula ?? ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setPhone(initial?.phone ?? "");
      setCedula(formatCedula(initial?.cedula ?? ""));
      setError(null);
    }
  }, [open, initial?.name, initial?.phone, initial?.cedula]);

  async function save() {
    const trimmed = name.trim();
    if (trimmed === "") {
      setError("Escribí un nombre.");
      return;
    }

    setSaving(true);
    setError(null);

    if (mode === "create") {
      const result = await createCustomer(trimmed, phone, cedula);
      setSaving(false);
      if (!result.ok) return setError(result.message);
      onCreated?.(result.id);
      return;
    }

    const result = await updateCustomer(initial!.id, {
      name: trimmed,
      phone,
      cedula,
    });
    setSaving(false);
    if (!result.ok) return setError(result.message);
    onSaved?.({
      name: trimmed,
      phone: phone.trim() || null,
      cedula: cedula.trim() || null,
    });
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={mode === "create" ? "Nuevo cliente" : "Editar cliente"}
    >
      <div className="flex flex-col gap-5 overflow-y-auto px-5 pb-8">
        <h2 className="type-display text-2xl text-ink">
          {mode === "create" ? "Nuevo cliente" : "Editar cliente"}
        </h2>

        <Field label="Nombre" htmlFor="c-name" error={error ?? undefined}>
          <Input
            id="c-name"
            autoFocus={mode === "create"}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre y apellido"
          />
        </Field>

        <PhoneField id="c-phone" value={phone} onChange={setPhone} />

        <CedulaField id="c-cedula" value={cedula} onChange={setCedula} />

        <div className="flex gap-3 pt-1">
          <Button variant="quiet" full onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button full onClick={save} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
