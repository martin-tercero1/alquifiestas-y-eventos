"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { WhatsAppIcon, PhoneIcon } from "@/components/ui/icons";
import { money, shortDate } from "@/lib/format";
import { STATUS_LABEL, type OrderStatus } from "@/lib/admin/order";
import { customerWhatsappLink } from "@/lib/admin/share";
import { formatPhone } from "@/lib/admin/phone";
import type { CustomerDetail } from "@/lib/admin/loadCustomers";
import { ClienteFormSheet } from "../ClienteFormSheet";

/**
 * One contact: how to reach them, what they owe, and everything they've rented.
 * The two things staff open this for — a phone number and an outstanding
 * balance — are the first things on the screen.
 */

const ACTIVE: OrderStatus[] = ["confirmed", "picked_up", "partially_returned"];

export function ClienteDetalle({ initial }: { initial: CustomerDetail }) {
  const [customer, setCustomer] = useState(initial);
  const [editing, setEditing] = useState(false);

  const wa = customerWhatsappLink(
    customer.phone,
    `Hola ${customer.name}, le escribimos de Alquifiestas y Eventos.`,
  );

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8">
      <Link
        href="/panel/clientes"
        className="type-label text-stone-text hover:text-ink"
      >
        ← Clientes
      </Link>

      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="type-display text-3xl text-ink">{customer.name}</h1>
          <p className="type-mono mt-1 text-base text-stone-text">
            {formatPhone(customer.phone) ?? "Sin teléfono"}
          </p>
          {customer.cedula && (
            <p className="type-mono mt-0.5 text-sm text-stone-text">
              Cédula: {customer.cedula}
            </p>
          )}
        </div>
        <Button variant="quiet" size="sm" onClick={() => setEditing(true)}>
          Editar
        </Button>
      </div>

      {customer.owed > 0 && (
        <div className="mt-5 rounded-lg border border-mamey/25 bg-mamey-tint p-4">
          <p className="type-label text-mamey-text">Saldo pendiente</p>
          <p className="type-mono mt-1 text-2xl font-semibold text-mamey-text tabular-nums">
            {money(customer.owed)}
          </p>
        </div>
      )}

      {(wa || customer.phone) && (
        <div className="mt-5 flex gap-3">
          {wa && (
            <Button variant="brand" full href={wa}>
              <WhatsAppIcon className="size-5" />
              WhatsApp
            </Button>
          )}
          {customer.phone && (
            <Button variant="quiet" full href={`tel:+${customer.phone}`}>
              <PhoneIcon className="size-5" />
              Llamar
            </Button>
          )}
        </div>
      )}

      <section className="mt-8">
        <h2 className="type-display text-xl text-ink">Pedidos</h2>
        {customer.orders.length === 0 ? (
          <p className="mt-3 text-base text-stone-text">
            Todavía no ha alquilado nada.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {customer.orders.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/panel/pedidos/${o.id}`}
                  className="flex items-center gap-3 rounded-lg border border-rule bg-paper p-4 transition-colors hover:border-rule-strong"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-base font-semibold text-ink">
                      <span className="type-mono">#{o.number}</span>
                      <Badge
                        variant={ACTIVE.includes(o.status) ? "brand" : "neutral"}
                      >
                        {STATUS_LABEL[o.status]}
                      </Badge>
                    </p>
                    <p className="type-mono mt-0.5 text-sm text-stone-text">
                      {shortDate(o.pickupDate)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="type-mono block text-base text-ink tabular-nums">
                      {money(o.total)}
                    </span>
                    {o.balance > 0 && (
                      <span className="type-label block text-mamey-text">
                        debe {money(o.balance)}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ClienteFormSheet
        open={editing}
        mode="edit"
        initial={{
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          cedula: customer.cedula,
        }}
        onClose={() => setEditing(false)}
        onSaved={(patch) => setCustomer((c) => ({ ...c, ...patch }))}
      />
    </main>
  );
}
