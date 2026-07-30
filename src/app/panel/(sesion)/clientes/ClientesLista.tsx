"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { money } from "@/lib/format";
import { cn } from "@/lib/cn";
import { formatPhone } from "@/lib/admin/phone";
import type { CustomerRow } from "@/lib/admin/loadCustomers";
import { ClienteFormSheet } from "./ClienteFormSheet";

/**
 * The contact book. All contacts load once and filter in the browser — 150-odd
 * names is nothing to search locally, and it keeps working when the connection
 * doesn't. Whoever is owed money floats to mind first, so a "debe" badge rides
 * on the right of their row.
 */

function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function ClientesLista({ customers }: { customers: CustomerRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const needle = fold(query.trim());
  const shown = useMemo(() => {
    if (needle === "") return customers;
    return customers.filter((c) => {
      const hay = fold(`${c.name} ${c.phone ?? ""}`);
      return needle.split(/\s+/).every((t) => hay.includes(t));
    });
  }, [customers, needle]);

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="type-display text-3xl text-ink">Clientes</h1>
        <Button size="sm" onClick={() => setCreating(true)}>
          Nuevo
        </Button>
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar por nombre o teléfono…"
        aria-label="Buscar cliente"
        className={cn(
          "mt-5 w-full min-h-13 rounded-md border border-rule bg-paper-warm px-4 py-3",
          "text-base text-ink placeholder:text-stone-text/70",
          "focus:border-green focus:outline-none focus:ring-2 focus:ring-green/25",
        )}
      />

      {shown.length === 0 ? (
        <p className="mt-10 rounded-lg border border-rule bg-paper p-6 text-center text-base text-stone-text">
          {query.trim()
            ? "Nadie con ese nombre. Podés crearlo con “Nuevo”."
            : "Todavía no hay clientes."}
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {shown.map((c) => (
            <li key={c.id}>
              <Link
                href={`/panel/clientes/${c.id}`}
                className="flex items-center gap-3 rounded-lg border border-rule bg-paper p-4 transition-colors hover:border-rule-strong"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-ink">
                    {c.name}
                  </p>
                  <p className="type-mono mt-0.5 truncate text-sm text-stone-text">
                    {formatPhone(c.phone) ?? "Sin teléfono"}
                  </p>
                </div>
                {c.owed > 0 && (
                  <span className="type-mono shrink-0 text-sm text-mamey-text tabular-nums">
                    debe {money(c.owed)}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <ClienteFormSheet
        open={creating}
        mode="create"
        onClose={() => setCreating(false)}
        onCreated={(id) => router.push(`/panel/clientes/${id}`)}
      />
    </main>
  );
}
