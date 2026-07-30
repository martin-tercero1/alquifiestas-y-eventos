"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Field, Input } from "@/components/ui/Field";
import { PhoneField } from "@/components/panel/PhoneField";
import { CedulaField } from "@/components/ui/CedulaField";
import { formatPhone } from "@/lib/admin/phone";
import { searchCustomers, type CustomerHit } from "@/lib/admin/proforma";

/**
 * Customer, step one.
 *
 * Search by name or phone with results as she types, or just type a new name —
 * there is no "create customer" mode, no modal and no navigation away from the
 * order. An unrecognised name simply becomes a new customer when she saves.
 *
 * A quarter of imported contacts have no phone. That is not broken data and
 * nothing here asks for one.
 */

type Props = {
  customerId: string | null;
  name: string;
  phone: string;
  cedula: string;
  onChange: (patch: {
    customerId?: string | null;
    customerName?: string;
    customerPhone?: string;
    customerCedula?: string;
  }) => void;
};

export function ClienteSection({
  customerId,
  name,
  phone,
  cedula,
  onChange,
}: Props) {
  const [hits, setHits] = useState<CustomerHit[]>([]);
  const [touched, setTouched] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    // Once she has picked somebody, stop suggesting alternatives.
    if (customerId || !touched || name.trim().length < 2) {
      setHits([]);
      return;
    }

    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      try {
        const results = await searchCustomers(name.trim());
        if (id === requestId.current) setHits(results);
      } catch {
        if (id === requestId.current) setHits([]);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [name, customerId, touched]);

  return (
    <section className="flex flex-col gap-4">
      <h2 className="type-label text-stone-text">Cliente</h2>

      <Field label="Nombre" htmlFor="cliente-nombre">
        <Input
          id="cliente-nombre"
          value={name}
          autoComplete="off"
          placeholder="Buscá o escribí un nombre nuevo"
          onChange={(e) => {
            setTouched(true);
            // Editing the name detaches from the matched customer, otherwise
            // she would silently rename somebody else's record.
            onChange({ customerName: e.target.value, customerId: null });
          }}
        />
      </Field>

      {hits.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {hits.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                onClick={() => {
                  onChange({
                    customerId: hit.id,
                    customerName: hit.name,
                    customerPhone: hit.phone ?? "",
                  });
                  setHits([]);
                }}
                className={cn(
                  "flex w-full min-h-14 items-center justify-between gap-3 rounded-md",
                  "border border-rule bg-paper px-4 py-2.5 text-left",
                  "transition-colors duration-fast ease-out hover:border-rule-strong",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-base font-semibold text-ink">
                    {hit.name}
                  </span>
                  <span className="type-mono text-sm text-stone-text">
                    {formatPhone(hit.phone) ?? "Sin teléfono"}
                    {hit.ordersCount > 0 &&
                      ` · ${hit.ordersCount} ${
                        hit.ordersCount === 1 ? "pedido" : "pedidos"
                      }`}
                  </span>
                </span>
                <span aria-hidden className="shrink-0 text-lg text-green">
                  →
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <PhoneField
        id="cliente-telefono"
        value={phone}
        onChange={(fullDigits) => onChange({ customerPhone: fullDigits })}
      />

      <CedulaField
        id="cliente-cedula"
        value={cedula}
        onChange={(formatted) => onChange({ customerCedula: formatted })}
      />

      {customerId && (
        <p className="text-sm font-medium text-green">
          Cliente ya registrado. Se le suma este pedido.
        </p>
      )}
    </section>
  );
}
