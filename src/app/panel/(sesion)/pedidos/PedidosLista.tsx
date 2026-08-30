"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { money, shortDate } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Field";
import { STATUS_LABEL, type OrderStatus } from "@/lib/admin/order";

/**
 * The orders list.
 *
 * Search and segmenting happen over a list already loaded from the server, so
 * typing filters instantly and does not depend on the network — the brief's
 * "assume the network is bad" applied to the one screen she scrolls most.
 *
 * Online requests are their own segment with a live count, because a new
 * request from the website is work waiting, and it must not be buried in the
 * middle of a long list.
 */

export type OrderRow = {
  id: string;
  number: number;
  status: OrderStatus;
  source: string;
  pickupDate: string;
  customerName: string;
  balance: number;
};

const VARIANT: Record<OrderStatus, "neutral" | "scarce" | "brand" | "quote"> = {
  quote: "quote",
  pending_request: "scarce",
  confirmed: "brand",
  picked_up: "brand",
  partially_returned: "scarce",
  returned: "neutral",
  closed: "neutral",
  cancelled: "neutral",
};

type Segment = "activos" | "solicitudes" | "historial" | "todos";

const IN_SEGMENT: Record<Segment, (s: OrderStatus) => boolean> = {
  // Quotes live here with website requests: both are orders awaiting a decision
  // to confirm, and neither reserves any stock yet.
  solicitudes: (s) => s === "pending_request" || s === "quote",
  activos: (s) =>
    s === "confirmed" ||
    s === "picked_up" ||
    s === "partially_returned" ||
    s === "returned",
  historial: (s) => s === "closed" || s === "cancelled",
  todos: () => true,
};

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function PedidosLista({ orders }: { orders: OrderRow[] }) {
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState<Segment>("activos");

  const requestCount = useMemo(
    () => orders.filter((o) => o.status === "pending_request").length,
    [orders],
  );

  const rows = useMemo(() => {
    const q = fold(query.trim());
    const digits = query.replace(/\D/g, "");

    return orders.filter((o) => {
      if (!IN_SEGMENT[segment](o.status)) return false;
      if (q === "") return true;
      return (
        fold(o.customerName).includes(q) ||
        (digits !== "" && String(o.number).includes(digits))
      );
    });
  }, [orders, query, segment]);

  const segments: { key: Segment; label: string; count?: number }[] = [
    { key: "activos", label: "Activos" },
    { key: "solicitudes", label: "Solicitudes", count: requestCount },
    { key: "historial", label: "Historial" },
    { key: "todos", label: "Todos" },
  ];

  return (
    <div className="mt-6 flex flex-col gap-4">
      <Input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar por cliente o número"
        aria-label="Buscar pedidos"
        autoCapitalize="none"
      />

      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
        {segments.map(({ key, label, count }) => (
          <button
            key={key}
            type="button"
            onClick={() => setSegment(key)}
            className={cn(
              "flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-base font-semibold",
              "transition-colors duration-fast ease-out",
              segment === key
                ? "border-green bg-green/10 text-green"
                : "border-rule text-stone-text",
            )}
          >
            {label}
            {count !== undefined && count > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-mamey px-1 text-xs font-bold text-white">
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-rule bg-paper p-6 text-base text-stone-text">
          {query.trim()
            ? `Nada con “${query.trim()}”.`
            : "No hay pedidos en esta lista."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((order) => (
            <li key={order.id}>
              <Link
                href={`/panel/pedidos/${order.id}`}
                className="flex items-center gap-3 rounded-lg border border-rule bg-paper p-4 transition-colors duration-fast ease-out hover:border-rule-strong"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-ink">
                    {order.customerName}
                  </p>
                  <p className="type-mono text-sm text-stone-text">
                    #{order.number} · {shortDate(order.pickupDate)}
                    {order.source === "website" && " · web"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge variant={VARIANT[order.status]}>
                    {STATUS_LABEL[order.status]}
                  </Badge>
                  {order.balance > 0 && (
                    <span className="type-mono text-sm text-mamey-text tabular-nums">
                      debe {money(order.balance)}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
