// Server-only by construction: serverClient reads request cookies through
// next/headers, which cannot run in a client component.
import { serverClient } from "@/lib/supabase/server";
import type { OrderDetail } from "./order";
import type { DraftLine } from "./proforma";

/**
 * Loads one order with everything the Detalle screen shows, server-side.
 *
 * Row-level security lets any signed-in staff member read all of this; the
 * page still checks the session first, and the layout already redirected an
 * unauthenticated request. The totals come from `order_totals`, the one place
 * that computes lines × billed days, discounts, charges and balance — never
 * recomputed in TypeScript.
 */

const n = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

// The hand-maintained generated types carry empty Relationships arrays, so the
// PostgREST client cannot type embedded selects. The embeds are correct at
// runtime; this is the shape they actually return, mapped explicitly below.
type LineRow = {
  id: string;
  quantity: number;
  unit_price: number | string;
  discount_type: "amount" | "percent" | null;
  discount_value: number | string | null;
  option_choice: string | null;
  variant: { label: string | null; product: { name: string } | null } | null;
  return_events: {
    quantity_returned: number;
    quantity_missing: number;
    quantity_damaged: number;
  }[];
};

type RawOrder = {
  id: string;
  number: number;
  status: OrderDetail["status"];
  source: string;
  customer_id: string;
  pickup_date: string;
  agreed_return_date: string;
  actual_return_date: string | null;
  billed_days: number;
  fulfilment: "pickup" | "delivery";
  delivery_address: string | null;
  delivery_cost: number | string | null;
  payment_method: OrderDetail["paymentMethod"];
  security_deposit: number | string | null;
  physical_invoice_number: string | null;
  availability_overridden: boolean;
  override_reason: string | null;
  notes: string | null;
  customer: { name: string; phone: string | null } | null;
  order_lines: LineRow[];
  payments: Record<string, unknown>[];
  charges: Record<string, unknown>[];
  order_status_history: Record<string, unknown>[];
};

/**
 * The lines of a pending request, shaped as editable proforma DraftLines.
 *
 * Returns null unless the order exists AND is still a pending_request — line
 * editing is an intake step, so the editor page bounces anything already
 * confirmed straight back to the detail view. `priceWasMissing` is read from
 * the catalog now, so an item the customer picked that still has no catalog
 * price offers to save the one staff type here, exactly like a fresh proforma.
 */
export type RequestForEdit = {
  id: string;
  number: number;
  customerName: string;
  pickupDate: string;
  returnDate: string;
  billedDays: number;
  lines: DraftLine[];
};

type EditLineRow = {
  id: string;
  variant_id: string;
  quantity: number;
  unit_price: number | string | null;
  discount_type: "amount" | "percent" | null;
  discount_value: number | string | null;
  option_choice: string | null;
  variant: {
    label: string | null;
    price_per_day: number | string | null;
    product: {
      name: string;
      option_name: string | null;
      option_values: string[] | null;
      category: { name: string } | null;
    } | null;
  } | null;
};

export async function loadRequestForEdit(
  id: string,
): Promise<RequestForEdit | null> {
  const supabase = await serverClient();

  const { data, error } = await supabase
    .from("orders")
    .select(
      `
      id, number, status, pickup_date, agreed_return_date, billed_days,
      customer:customers ( name ),
      order_lines (
        id, variant_id, quantity, unit_price, discount_type, discount_value, option_choice,
        variant:variants (
          label, price_per_day,
          product:products (
            name, option_name, option_values,
            category:categories ( name )
          )
        )
      )
      `,
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  const order = data as unknown as {
    id: string;
    number: number;
    status: OrderDetail["status"];
    pickup_date: string;
    agreed_return_date: string;
    billed_days: number;
    customer: { name: string } | null;
    order_lines: EditLineRow[];
  };

  if (order.status !== "pending_request") return null;

  const lines: DraftLine[] = (order.order_lines ?? []).map((l) => ({
    key: l.id,
    variantId: l.variant_id,
    productName: l.variant?.product?.name ?? "Artículo",
    variantLabel: l.variant?.label ?? null,
    categoryName: l.variant?.product?.category?.name ?? "",
    quantity: l.quantity,
    unitPrice: l.unit_price === null ? null : n(l.unit_price),
    priceWasMissing: l.variant?.price_per_day == null,
    savePriceToCatalog: false,
    discountType: l.discount_type,
    discountValue: l.discount_value === null ? null : n(l.discount_value),
    optionName: l.variant?.product?.option_name ?? null,
    optionValues: l.variant?.product?.option_values ?? null,
    optionChoice: l.option_choice ?? null,
  }));

  return {
    id: order.id,
    number: order.number,
    customerName: order.customer?.name ?? "Cliente",
    pickupDate: order.pickup_date,
    returnDate: order.agreed_return_date,
    billedDays: order.billed_days,
    lines,
  };
}

export async function loadOrder(id: string): Promise<OrderDetail | null> {
  const supabase = await serverClient();

  const { data, error } = await supabase
    .from("orders")
    .select(
      `
      *,
      customer:customers ( name, phone ),
      order_lines (
        id, quantity, unit_price, discount_type, discount_value, option_choice,
        variant:variants ( label, product:products ( name ) ),
        return_events ( quantity_returned, quantity_missing, quantity_damaged )
      ),
      payments ( id, amount, method, kind, reference, paid_on ),
      charges ( id, kind, amount, description ),
      order_status_history ( from_status, to_status, changed_at, note )
      `,
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  const order = data as unknown as RawOrder;

  const { data: totalsRow } = await supabase
    .from("order_totals")
    .select("*")
    .eq("order_id", id)
    .maybeSingle();
  const totals = totalsRow as Record<string, unknown> | null;

  const lines = (order.order_lines ?? []).map((line) => {
    const returned = line.return_events.reduce((s, r) => s + r.quantity_returned, 0);
    const missing = line.return_events.reduce((s, r) => s + r.quantity_missing, 0);
    const damaged = line.return_events.reduce((s, r) => s + r.quantity_damaged, 0);
    return {
      id: line.id,
      productName: line.variant?.product?.name ?? "Artículo",
      variantLabel: line.variant?.label ?? null,
      optionChoice: line.option_choice ?? null,
      quantity: line.quantity,
      unitPrice: n(line.unit_price),
      discountType: line.discount_type,
      discountValue: line.discount_value === null ? null : n(line.discount_value),
      returned,
      missing,
      damaged,
      accounted: returned + missing + damaged,
    };
  });

  const customer = order.customer;

  return {
    id: order.id,
    number: order.number,
    status: order.status,
    source: order.source,
    customerId: order.customer_id,
    customerName: customer?.name ?? "Cliente",
    customerPhone: customer?.phone ?? null,
    pickupDate: order.pickup_date,
    agreedReturnDate: order.agreed_return_date,
    actualReturnDate: order.actual_return_date,
    billedDays: order.billed_days,
    fulfilment: order.fulfilment,
    deliveryAddress: order.delivery_address,
    deliveryCost: order.delivery_cost === null ? null : n(order.delivery_cost),
    paymentMethod: order.payment_method,
    securityDeposit: order.security_deposit === null ? null : n(order.security_deposit),
    physicalInvoiceNumber: order.physical_invoice_number,
    availabilityOverridden: order.availability_overridden,
    overrideReason: order.override_reason,
    notes: order.notes,
    lines: lines.sort((a, b) => a.productName.localeCompare(b.productName)),
    payments: ((order.payments ?? []) as Record<string, unknown>[])
      .map((p) => ({
        id: p.id as string,
        amount: n(p.amount),
        method: p.method as OrderDetail["payments"][number]["method"],
        kind: p.kind as OrderDetail["payments"][number]["kind"],
        reference: (p.reference as string | null) ?? null,
        paidOn: p.paid_on as string,
      }))
      .sort((a, b) => a.paidOn.localeCompare(b.paidOn)),
    charges: ((order.charges ?? []) as Record<string, unknown>[]).map((c) => ({
      id: c.id as string,
      kind: c.kind as OrderDetail["charges"][number]["kind"],
      amount: n(c.amount),
      description: (c.description as string | null) ?? null,
    })),
    history: ((order.order_status_history ?? []) as Record<string, unknown>[])
      .map((h) => ({
        toStatus: h.to_status as OrderDetail["status"],
        fromStatus: (h.from_status as OrderDetail["status"] | null) ?? null,
        changedAt: h.changed_at as string,
        note: (h.note as string | null) ?? null,
      }))
      .sort((a, b) => a.changedAt.localeCompare(b.changedAt)),
    totals: {
      linesAfterDiscount: n(totals?.lines_after_discount),
      chargesTotal: n(totals?.charges_total),
      totalCharged: n(totals?.total_charged),
      totalPaid: n(totals?.total_paid),
      balance: n(totals?.balance),
      depositHeld: n(totals?.deposit_held),
    },
  };
}
