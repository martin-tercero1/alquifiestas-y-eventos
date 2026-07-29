import { serverClient } from "@/lib/supabase/server";
import { managuaToday } from "./dates";
import type { OrderStatus } from "./order";

/**
 * The Hoy board: three date-driven buckets, loaded server-side.
 *
 * Sale hoy    — confirmed orders going out today.
 * Regresa hoy — orders due back today and not yet received.
 * Atrasados   — out past their agreed return date, ordered by how late.
 *
 * Server-only: serverClient reads request cookies through next/headers.
 */

export type BoardCard = {
  id: string;
  number: number;
  status: OrderStatus;
  customerName: string;
  fulfilment: "pickup" | "delivery";
  pickupDate: string;
  agreedReturnDate: string;
  itemSummary: string;
  balance: number;
};

export type Board = {
  today: string;
  saleToday: BoardCard[];
  returnToday: BoardCard[];
  overdue: BoardCard[];
};

type RawCard = {
  id: string;
  number: number;
  status: OrderStatus;
  fulfilment: "pickup" | "delivery";
  pickup_date: string;
  agreed_return_date: string;
  customer: { name: string } | null;
  order_lines: {
    quantity: number;
    variant: { label: string | null; product: { name: string } | null } | null;
  }[];
};

// order_totals is a view with lateral joins that PostgREST cannot resolve as an
// embedded relationship — trying to embed it errors the whole query and every
// bucket comes back empty. Balances are fetched in one separate keyed query and
// stitched in below.
const SELECT = `
  id, number, status, fulfilment, pickup_date, agreed_return_date,
  customer:customers ( name ),
  order_lines ( quantity, variant:variants ( label, product:products ( name ) ) )
`;

/** "50 Silla Plástica · 2 más" — enough to recognise the order at a glance. */
function summarize(lines: RawCard["order_lines"]): string {
  if (lines.length === 0) return "Sin artículos";
  const first = lines[0];
  const name = first.variant?.product?.name ?? "Artículo";
  const head = `${first.quantity} ${name}`;
  return lines.length > 1 ? `${head} · ${lines.length - 1} más` : head;
}

function toCard(row: RawCard, balances: Map<string, number>): BoardCard {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    customerName: row.customer?.name ?? "Cliente",
    fulfilment: row.fulfilment,
    pickupDate: row.pickup_date,
    agreedReturnDate: row.agreed_return_date,
    itemSummary: summarize(row.order_lines),
    balance: balances.get(row.id) ?? 0,
  };
}

export async function loadBoard(): Promise<Board> {
  const supabase = await serverClient();
  const today = managuaToday();

  const [sale, ret, late] = await Promise.all([
    supabase
      .from("orders")
      .select(SELECT)
      .eq("status", "confirmed")
      .eq("pickup_date", today)
      .order("number", { ascending: true }),
    supabase
      .from("orders")
      .select(SELECT)
      .in("status", ["picked_up", "partially_returned"])
      .eq("agreed_return_date", today)
      .is("actual_return_date", null)
      .order("number", { ascending: true }),
    supabase
      .from("orders")
      .select(SELECT)
      .in("status", ["picked_up", "partially_returned"])
      .lt("agreed_return_date", today)
      .is("actual_return_date", null)
      .order("agreed_return_date", { ascending: true }),
  ]);

  const rows = [sale, ret, late].flatMap(
    (r) => (r.data ?? []) as unknown as RawCard[],
  );

  const balances = new Map<string, number>();
  if (rows.length > 0) {
    const { data: totals } = await supabase
      .from("order_totals")
      .select("order_id, balance")
      .in(
        "order_id",
        rows.map((r) => r.id),
      );
    for (const t of (totals ?? []) as { order_id: string; balance: number | string | null }[]) {
      balances.set(t.order_id, Number(t.balance ?? 0));
    }
  }

  const map = (data: unknown): BoardCard[] =>
    ((data ?? []) as unknown as RawCard[]).map((row) => toCard(row, balances));

  return {
    today,
    saleToday: map(sale.data),
    returnToday: map(ret.data),
    overdue: map(late.data),
  };
}
