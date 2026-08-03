/**
 * The frozen shape of a comprobante (Brief 04 §9).
 *
 * This mirrors, field for field, the `snapshot` jsonb that `issue_comprobante`
 * writes into the `documents` row. Once issued, a document is never rewritten —
 * so this is a photograph of the order at issue time, and the PDF renders from
 * it alone, never from the live order. Money is in whole córdobas at the source;
 * percentage discounts can introduce halves, which the layout rounds so the
 * printed document always foots (see ComprobanteDoc).
 */

export type ComprobanteChargeKind =
  | "late_fee"
  | "damage"
  | "missing_item"
  | "delivery"
  | "other";

export type ComprobanteLine = {
  productName: string;
  variantLabel: string | null;
  optionChoice: string | null;
  quantity: number;
  unitPrice: number;
  /** True when this line carried its own discount, so its amount is net of it. */
  discounted: boolean;
  /** Quantity × unit × billed days, net of this line's own discount. */
  lineTotal: number;
};

export type ComprobanteCharge = {
  kind: ComprobanteChargeKind;
  description: string | null;
  amount: number;
};

export type ComprobanteSnapshot = {
  order: {
    number: number;
    source: string;
    pickupDate: string;
    agreedReturnDate: string;
    pickupTime: string | null;
    agreedReturnTime: string | null;
    billedDays: number;
    fulfilment: "pickup" | "delivery";
    deliveryAddress: string | null;
    physicalInvoiceNumber: string | null;
  };
  customer: {
    name: string;
    cedula: string | null;
    ruc: string | null;
    phone: string | null;
  };
  lines: ComprobanteLine[];
  charges: ComprobanteCharge[];
  totals: {
    linesTotal: number;
    orderDiscount: number;
    linesAfterDiscount: number;
    deliveryCost: number;
    chargesTotal: number;
    totalCharged: number;
    totalPaid: number;
    balance: number;
    depositHeld: number;
  };
};

/** A whole issued comprobante: its consecutive number, when, and the snapshot. */
export type Comprobante = {
  number: number;
  issuedAt: string;
  snapshot: ComprobanteSnapshot;
};

/** Pure Spanish labels for charge kinds — kept here so the PDF (server-rendered)
 *  never has to import the browser-client order module just for a label map. */
export const COMPROBANTE_CHARGE_LABEL: Record<ComprobanteChargeKind, string> = {
  late_fee: "Mora",
  damage: "Daño",
  missing_item: "Faltante",
  delivery: "Envío",
  other: "Otro",
};

/** Maps the raw snapshot jsonb (snake_case) into the typed camelCase shape. */
export function parseSnapshot(raw: unknown): ComprobanteSnapshot {
  const s = raw as Record<string, // deliberately loose: the jsonb is trusted,
    Record<string, unknown>>;
  const order = s.order ?? {};
  const customer = s.customer ?? {};
  const totals = s.totals ?? {};
  const num = (v: unknown): number => (v == null ? 0 : Number(v));

  return {
    order: {
      number: num(order.number),
      source: String(order.source ?? ""),
      pickupDate: String(order.pickup_date ?? ""),
      agreedReturnDate: String(order.agreed_return_date ?? ""),
      pickupTime: (order.pickup_time as string | null) ?? null,
      agreedReturnTime: (order.agreed_return_time as string | null) ?? null,
      billedDays: num(order.billed_days),
      fulfilment: (order.fulfilment as "pickup" | "delivery") ?? "pickup",
      deliveryAddress: (order.delivery_address as string | null) ?? null,
      physicalInvoiceNumber:
        (order.physical_invoice_number as string | null) ?? null,
    },
    customer: {
      name: String(customer.name ?? "Cliente"),
      cedula: (customer.cedula as string | null) ?? null,
      ruc: (customer.ruc as string | null) ?? null,
      phone: (customer.phone as string | null) ?? null,
    },
    lines: (Array.isArray(s.lines) ? s.lines : []).map((l) => {
      const line = l as Record<string, unknown>;
      return {
        productName: String(line.product_name ?? "Artículo"),
        variantLabel: (line.variant_label as string | null) ?? null,
        optionChoice: (line.option_choice as string | null) ?? null,
        quantity: num(line.quantity),
        unitPrice: num(line.unit_price),
        discounted: Boolean(line.discounted),
        lineTotal: num(line.line_total),
      };
    }),
    charges: (Array.isArray(s.charges) ? s.charges : []).map((c) => {
      const charge = c as Record<string, unknown>;
      return {
        kind: charge.kind as ComprobanteChargeKind,
        description: (charge.description as string | null) ?? null,
        amount: num(charge.amount),
      };
    }),
    totals: {
      linesTotal: num(totals.lines_total),
      orderDiscount: num(totals.order_discount),
      linesAfterDiscount: num(totals.lines_after_discount),
      deliveryCost: num(totals.delivery_cost),
      chargesTotal: num(totals.charges_total),
      totalCharged: num(totals.total_charged),
      totalPaid: num(totals.total_paid),
      balance: num(totals.balance),
      depositHeld: num(totals.deposit_held),
    },
  };
}
