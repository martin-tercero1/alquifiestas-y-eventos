import { serverClient } from "@/lib/supabase/server";
import type { OrderStatus } from "./order";

/**
 * Clientes — the contact book.
 *
 * Deliberately thin: a name and a phone are all most entries have, and about a
 * quarter have no phone at all, which is fine. What makes it worth a screen of
 * its own is the two things staff actually look a person up FOR — what they've
 * rented before, and whether they still owe anything.
 *
 * Balances come from order_totals, which PostgREST cannot embed from orders
 * (lateral joins), so orders and their totals are read in two queries and
 * stitched by id — the same shape the Hoy board and Pedidos list use.
 */

export type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  ordersCount: number;
  /** Sum of positive balances across their orders. */
  owed: number;
};

async function balancesByOrder(
  supabase: Awaited<ReturnType<typeof serverClient>>,
  orderIds: string[],
): Promise<Map<string, { total: number; balance: number }>> {
  const map = new Map<string, { total: number; balance: number }>();
  if (orderIds.length === 0) return map;

  const { data } = await supabase
    .from("order_totals")
    .select("order_id, total_charged, balance")
    .in("order_id", orderIds);

  for (const t of (data ?? []) as {
    order_id: string;
    total_charged: number | string | null;
    balance: number | string | null;
  }[]) {
    map.set(t.order_id, {
      total: Number(t.total_charged ?? 0),
      balance: Number(t.balance ?? 0),
    });
  }
  return map;
}

export async function loadCustomers(): Promise<CustomerRow[]> {
  const supabase = await serverClient();

  const [{ data: customers }, { data: orders }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, phone")
      .order("name", { ascending: true }),
    supabase.from("orders").select("id, customer_id"),
  ]);

  const orderRows = (orders ?? []) as { id: string; customer_id: string }[];
  const balances = await balancesByOrder(
    supabase,
    orderRows.map((o) => o.id),
  );

  // Fold orders down to per-customer count + amount owed.
  const stats = new Map<string, { count: number; owed: number }>();
  for (const o of orderRows) {
    const s = stats.get(o.customer_id) ?? { count: 0, owed: 0 };
    s.count += 1;
    const bal = balances.get(o.id)?.balance ?? 0;
    if (bal > 0) s.owed += bal;
    stats.set(o.customer_id, s);
  }

  return ((customers ?? []) as { id: string; name: string; phone: string | null }[]).map(
    (c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      ordersCount: stats.get(c.id)?.count ?? 0,
      owed: stats.get(c.id)?.owed ?? 0,
    }),
  );
}

export type CustomerOrder = {
  id: string;
  number: number;
  status: OrderStatus;
  pickupDate: string;
  total: number;
  balance: number;
};

export type CustomerDetail = {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  orders: CustomerOrder[];
  owed: number;
};

export async function loadCustomer(id: string): Promise<CustomerDetail | null> {
  const supabase = await serverClient();

  const { data: customer } = await supabase
    .from("customers")
    .select("id, name, phone, notes")
    .eq("id", id)
    .maybeSingle();

  if (!customer) return null;

  const { data: orderData } = await supabase
    .from("orders")
    .select("id, number, status, pickup_date")
    .eq("customer_id", id)
    .order("created_at", { ascending: false });

  const rows = (orderData ?? []) as {
    id: string;
    number: number;
    status: OrderStatus;
    pickup_date: string;
  }[];

  const balances = await balancesByOrder(
    supabase,
    rows.map((o) => o.id),
  );

  let owed = 0;
  const orders: CustomerOrder[] = rows.map((o) => {
    const t = balances.get(o.id) ?? { total: 0, balance: 0 };
    if (t.balance > 0) owed += t.balance;
    return {
      id: o.id,
      number: o.number,
      status: o.status,
      pickupDate: o.pickup_date,
      total: t.total,
      balance: t.balance,
    };
  });

  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    notes: customer.notes,
    orders,
    owed,
  };
}
