import type { Metadata } from "next";
import { serverClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/Button";
import { PedidosLista, type OrderRow } from "./PedidosLista";
import type { OrderStatus } from "@/lib/admin/order";

export const metadata: Metadata = { title: "Pedidos" };
export const dynamic = "force-dynamic";

/**
 * The orders list. Loads recent orders once, server-side, and lets the client
 * search and segment them without another round trip — the volume here is a
 * family rental business's, not a marketplace's, so this stays fast and works
 * on a bad connection.
 */

type RawRow = {
  id: string;
  number: number;
  status: OrderStatus;
  source: string;
  pickup_date: string;
  customer: { name: string } | null;
};

export default async function PedidosPage() {
  const supabase = await serverClient();

  const { data } = await supabase
    .from("orders")
    // order_totals is a view PostgREST cannot embed from orders; its balance is
    // fetched separately below and joined in.
    .select("id, number, status, source, pickup_date, customer:customers ( name )")
    .order("created_at", { ascending: false })
    .limit(200);

  const raw = (data ?? []) as unknown as RawRow[];

  const balances = new Map<string, number>();
  if (raw.length > 0) {
    const { data: totals } = await supabase
      .from("order_totals")
      .select("order_id, balance")
      .in(
        "order_id",
        raw.map((r) => r.id),
      );
    for (const t of (totals ?? []) as {
      order_id: string;
      balance: number | string | null;
    }[]) {
      balances.set(t.order_id, Number(t.balance ?? 0));
    }
  }

  const orders: OrderRow[] = raw.map((r) => ({
    id: r.id,
    number: r.number,
    status: r.status,
    source: r.source,
    pickupDate: r.pickup_date,
    customerName: r.customer?.name ?? "Cliente",
    balance: balances.get(r.id) ?? 0,
  }));

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="type-display text-3xl text-ink">Pedidos</h1>
        <Button href="/panel/nueva" size="sm">
          Nueva
        </Button>
      </div>

      {orders.length === 0 ? (
        <p className="mt-8 rounded-lg border border-rule bg-paper p-6 text-base text-stone-text">
          Todavía no hay pedidos. Empezá con una nueva proforma.
        </p>
      ) : (
        <PedidosLista orders={orders} />
      )}
    </main>
  );
}
