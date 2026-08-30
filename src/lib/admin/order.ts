import { panelClient } from "@/lib/supabase/panel";
import type { Database } from "@/lib/supabase/types";

/**
 * The order model for Detalle de pedido, plus the calls that move an order
 * through its life. Every mutation is one of the SECURITY INVOKER RPCs from
 * the order_lifecycle_actions migration — the transactional, warn-don't-block
 * logic lives in Postgres, and this is a thin, typed wrapper over it.
 *
 * Amounts arrive from the database already in córdobas and are authoritative;
 * they are formatted for display, never recomputed here.
 */

export type OrderStatus = Database["public"]["Enums"]["order_status"];
export type ChargeKind = Database["public"]["Enums"]["charge_kind"];
export type PaymentMethod = Database["public"]["Enums"]["payment_method"];
export type PaymentKind = Database["public"]["Enums"]["payment_kind"];

export type OrderLine = {
  id: string;
  productName: string;
  variantLabel: string | null;
  /** The colour/size/style chosen for this line, when the item has options. */
  optionChoice: string | null;
  quantity: number;
  unitPrice: number;
  discountType: "amount" | "percent" | null;
  discountValue: number | null;
  /** Units already accounted for on return events: returned + missing + damaged. */
  accounted: number;
  returned: number;
  missing: number;
  damaged: number;
};

export type Payment = {
  id: string;
  amount: number;
  method: PaymentMethod;
  kind: PaymentKind;
  reference: string | null;
  paidOn: string;
};

export type Charge = {
  id: string;
  kind: ChargeKind;
  amount: number;
  description: string | null;
};

export type StatusEvent = {
  toStatus: OrderStatus;
  fromStatus: OrderStatus | null;
  changedAt: string;
  note: string | null;
};

export type OrderDetail = {
  id: string;
  number: number;
  status: OrderStatus;
  source: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  customerCedula: string | null;
  cedulaRetained: boolean;
  /** Set by intake when a website request's cédula and phone disagree. */
  reviewReason: string | null;
  pickupDate: string;
  agreedReturnDate: string;
  /** Agreed clock times, "HH:MM:SS" from Postgres, or null. Coordination only. */
  pickupTime: string | null;
  agreedReturnTime: string | null;
  actualReturnDate: string | null;
  billedDays: number;
  fulfilment: "pickup" | "delivery";
  deliveryAddress: string | null;
  deliveryCost: number | null;
  paymentMethod: PaymentMethod;
  securityDeposit: number | null;
  physicalInvoiceNumber: string | null;
  availabilityOverridden: boolean;
  overrideReason: string | null;
  notes: string | null;
  lines: OrderLine[];
  payments: Payment[];
  charges: Charge[];
  history: StatusEvent[];
  totals: {
    linesTotal: number;
    linesAfterDiscount: number;
    chargesTotal: number;
    totalCharged: number;
    totalPaid: number;
    balance: number;
    depositHeld: number;
  };
};

// ---------------------------------------------------------------------------
// Labels — Spanish, plain, Nicaraguan
// ---------------------------------------------------------------------------

export const STATUS_LABEL: Record<OrderStatus, string> = {
  quote: "Cotización",
  pending_request: "Solicitud",
  confirmed: "Confirmado",
  picked_up: "Retirado",
  partially_returned: "Regresó en parte",
  returned: "Regresado",
  closed: "Cerrado",
  cancelled: "Cancelado",
};

export const CHARGE_LABEL: Record<ChargeKind, string> = {
  late_fee: "Mora",
  damage: "Daño",
  missing_item: "Faltante",
  delivery: "Envío",
  other: "Otro",
};

export const PAYMENT_KIND_LABEL: Record<PaymentKind, string> = {
  advance: "Anticipo",
  balance: "Abono",
  deposit: "Depósito",
  refund: "Devolución",
};

/** Overdue = out past the agreed return date with no receipt recorded. */
export function isOverdue(order: OrderDetail, todayIso: string): boolean {
  return (
    (order.status === "picked_up" || order.status === "partially_returned") &&
    order.actualReturnDate === null &&
    order.agreedReturnDate < todayIso
  );
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

const ERROR_ES: Record<string, string> = {
  no_encontrado: "No se encontró el pedido.",
  no_es_solicitud: "Este pedido ya no es una solicitud pendiente.",
  no_editable: "Este pedido ya no se puede editar.",
  fechas_invalidas: "Revisá las fechas: el regreso no puede ser antes de la salida.",
  no_autorizado: "Tenés que iniciar sesión de nuevo.",
  sin_articulos: "Dejá al menos un artículo en el pedido.",
  no_confirmado: "El pedido tiene que estar confirmado primero.",
  no_esta_afuera: "El pedido no está retirado, no hay nada que regresar.",
  no_cancelable: "Este pedido ya no se puede cancelar.",
  no_retornado: "El pedido todavía no ha regresado completo.",
  monto_invalido: "Escribí un monto mayor que cero.",
  falta_motivo: "Escribí el motivo de la cancelación.",
  linea_invalida: "Una de las líneas no pertenece a este pedido.",
  excede: "Estás regresando más de lo que salió en esa línea.",
  tiene_historial:
    "Este pedido ya tiene pagos registrados. Cancelalo en vez de borrarlo, o forzá el borrado si es una prueba.",
  tiene_pedidos: "Todavía tiene pedidos asociados. No se puede borrar.",
};

export type MutationResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; message: string };

async function callRpc<
  F extends keyof Database["public"]["Functions"],
>(fn: F, args: Database["public"]["Functions"][F]["Args"]): Promise<MutationResult> {
  const { data, error } = await panelClient().rpc(fn, args as never);

  if (error) {
    const offline = /fetch|network|failed to fetch/i.test(error.message ?? "");
    return {
      ok: false,
      message: offline
        ? "No hay conexión. Probá otra vez en un momento."
        : "No se pudo guardar. Probá otra vez.",
    };
  }

  const result = (data ?? {}) as unknown as {
    ok?: boolean;
    error?: string;
  } & Record<string, unknown>;

  if (!result.ok) {
    return {
      ok: false,
      message:
        ERROR_ES[result.error ?? ""] ?? "No se pudo completar la acción.",
    };
  }

  return { ok: true, data: result };
}

export const confirmOrder = (
  orderId: string,
  args: {
    deliveryCost?: number | null;
    securityDeposit?: number | null;
    physicalInvoiceNumber?: string | null;
  },
) =>
  callRpc("confirm_order", {
    p_order_id: orderId,
    p_delivery_cost: args.deliveryCost ?? null,
    p_security_deposit: args.securityDeposit ?? null,
    p_physical_invoice_number: args.physicalInvoiceNumber ?? null,
  });

export const recordPayment = (
  orderId: string,
  amount: number,
  method: PaymentMethod,
  kind: PaymentKind,
  reference: string | null,
) =>
  callRpc("record_payment", {
    p_order_id: orderId,
    p_amount: amount,
    p_method: method,
    p_kind: kind,
    p_reference: reference,
  });

export const markPickedUp = (orderId: string, cedula?: string | null) =>
  callRpc("mark_picked_up", {
    p_order_id: orderId,
    p_cedula: cedula?.trim() ? cedula.trim() : null,
  });

export const recordReturn = (
  orderId: string,
  lines: { order_line_id: string; returned: number; missing: number; damaged: number }[],
  returnedOn: string,
) =>
  callRpc("record_return", {
    p_order_id: orderId,
    p_lines: lines,
    p_returned_on: returnedOn,
  });

export const addCharge = (
  orderId: string,
  kind: ChargeKind,
  amount: number,
  description: string | null,
) =>
  callRpc("add_order_charge", {
    p_order_id: orderId,
    p_kind: kind,
    p_amount: amount,
    p_description: description,
  });

export type Fulfilment = "pickup" | "delivery";

/**
 * Sets how the order is fulfilled and what the transport costs — the one place
 * delivery is edited, at confirmation or any time after. Choosing pickup clears
 * the address and the freight, so a total can never carry a delivery charge for
 * an order the customer is coming to collect. A plain column update: it never
 * touches status, so the status-transition trigger stays out of it.
 */
export async function setDelivery(
  orderId: string,
  input: { fulfilment: Fulfilment; address: string | null; cost: number | null },
): Promise<MutationResult> {
  const patch: Database["public"]["Tables"]["orders"]["Update"] =
    input.fulfilment === "pickup"
      ? { fulfilment: "pickup", delivery_address: null, delivery_cost: null }
      : {
          fulfilment: "delivery",
          delivery_address: input.address?.trim() || null,
          delivery_cost: input.cost,
        };

  const { error } = await panelClient()
    .from("orders")
    .update(patch)
    .eq("id", orderId);

  if (error) {
    const offline = /fetch|network|failed to fetch/i.test(error.message ?? "");
    return {
      ok: false,
      message: offline
        ? "No hay conexión. Probá otra vez en un momento."
        : "No se pudo guardar. Probá otra vez.",
    };
  }
  return { ok: true, data: {} };
}

/** One line as revise_order_lines expects it. */
export type RevisedLine = {
  variant_id: string;
  quantity: number;
  unit_price: number;
  discount_type: "amount" | "percent" | null;
  discount_value: number | null;
  save_price_to_catalog: boolean;
  option_choice: string | null;
};

/**
 * Replaces an order's lines. Allowed while it is a quote, a pending request, or
 * confirmed — refused once it has gone out of the warehouse.
 */
export const reviseOrderLines = (orderId: string, lines: RevisedLine[]) =>
  callRpc("revise_order_lines", {
    p_order_id: orderId,
    p_lines: lines as unknown as Database["public"]["Functions"]["revise_order_lines"]["Args"]["p_lines"],
  });

/**
 * Edits an order's dates, times and money terms. Same open window as the line
 * editor (quote / pending / confirmed). Recomputes billed days from the dates.
 */
export const updateOrderDetails = (
  orderId: string,
  input: {
    pickupDate: string;
    returnDate: string;
    pickupTime: string | null;
    returnTime: string | null;
    securityDeposit: number | null;
    notes: string | null;
    physicalInvoiceNumber: string | null;
  },
) =>
  callRpc("update_order_details", {
    p_order_id: orderId,
    p_pickup_date: input.pickupDate,
    p_return_date: input.returnDate,
    p_pickup_time: input.pickupTime,
    p_return_time: input.returnTime,
    p_security_deposit: input.securityDeposit,
    p_notes: input.notes,
    p_physical_invoice_number: input.physicalInvoiceNumber,
  });

export const cancelOrder = (orderId: string, reason: string) =>
  callRpc("cancel_order", { p_order_id: orderId, p_reason: reason });

export const closeOrder = (orderId: string) =>
  callRpc("close_order", { p_order_id: orderId });

/**
 * Hard-delete — technical-admin only, gated again server-side. For genuine junk
 * (test orders, duplicates), not for volume. An order that already carries
 * payments is refused unless `force` is set, so the parents' cancel/void stays
 * the normal path and forcing is a deliberate choice for clear test data.
 */
export const deleteOrder = (orderId: string, force = false) =>
  callRpc("admin_delete_order", { p_order_id: orderId, p_force: force });

export const deleteCustomer = (customerId: string) =>
  callRpc("admin_delete_customer", { p_customer_id: customerId });

export const deleteProduct = (productId: string) =>
  callRpc("admin_delete_product", { p_product_id: productId });
