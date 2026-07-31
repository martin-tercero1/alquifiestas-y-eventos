import { panelClient } from "@/lib/supabase/panel";
import { getAvailability, type Availability } from "@/lib/availability";

/**
 * The proforma model: the draft she is typing, the money maths, and the two
 * calls that back the screen.
 *
 * MONEY IS IN CENTAVOS. Every total is summed as integers and only divided at
 * the moment it is displayed. Córdoba prices here are small (C$4 to C$925) but
 * an order is 150 chairs plus a percentage discount, and 0.1 + 0.2 !== 0.3 in
 * a language with one number type. A proforma that disagrees with the paper
 * one by a centavo is a proforma she stops trusting.
 */

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export const toCents = (amount: number) => Math.round(amount * 100);
export const fromCents = (cents: number) => cents / 100;

export type DiscountType = "amount" | "percent";

/** Rounds half-up, in cents, so a percentage never leaks a fraction. */
function applyDiscount(
  baseCents: number,
  type: DiscountType | null,
  value: number | null,
): number {
  if (!type || value === null || value <= 0) return baseCents;
  if (type === "amount") return Math.max(0, baseCents - toCents(value));
  return Math.max(0, baseCents - Math.round((baseCents * value) / 100));
}

// ---------------------------------------------------------------------------
// The draft
// ---------------------------------------------------------------------------

export type DraftLine = {
  /** Stable local key. Two lines can hold the same variant. */
  key: string;
  variantId: string;
  productName: string;
  variantLabel: string | null;
  categoryName: string;
  quantity: number;
  /** null until she types one. An item with no price is not an error. */
  unitPrice: number | null;
  /** Was the catalog missing a price when she added it? Drives the offer. */
  priceWasMissing: boolean;
  savePriceToCatalog: boolean;
  discountType: DiscountType | null;
  discountValue: number | null;
  /** For an item sold in one pool but many looks (Mantel Cuadrado's colours):
   *  the option's name and the choices, and which one was picked for this line. */
  optionName: string | null;
  optionValues: string[] | null;
  optionChoice: string | null;
};

export type Draft = {
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  customerCedula: string;
  pickupDate: string;
  returnDate: string;
  /** Agreed clock times, "HH:MM". Coordination only — see §4. Required in this
   *  form's own UI, but empty is a valid intermediate state while typing. */
  pickupTime: string;
  returnTime: string;
  lines: DraftLine[];
  fulfilment: "pickup" | "delivery";
  deliveryAddress: string;
  paymentMethod: "cash" | "transfer";
  securityDeposit: string;
  discountType: DiscountType | null;
  discountValue: string;
  physicalInvoiceNumber: string;
  notes: string;
  overrideReason: string;
};

export function todayISO(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Inclusive: picking up and returning the same day is one billed day. */
export function daysBetween(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 1;
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

export function emptyDraft(): Draft {
  // Same-day pickup rarely makes sense — the parents agree a slot ahead of
  // time — so default to tomorrow. Same-day is still allowed, just not the
  // default (§4).
  const pickup = addDays(todayISO(), 1);
  return {
    customerId: null,
    customerName: "",
    customerPhone: "",
    customerCedula: "",
    // The common case is one day. Return defaults to the pickup day.
    pickupDate: pickup,
    returnDate: pickup,
    pickupTime: "",
    returnTime: "",
    lines: [],
    fulfilment: "pickup",
    deliveryAddress: "",
    paymentMethod: "cash",
    securityDeposit: "",
    discountType: null,
    discountValue: "",
    physicalInvoiceNumber: "",
    notes: "",
    overrideReason: "",
  };
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

export type Totals = {
  billedDays: number;
  /** Lines with a price, after their own discounts. */
  linesCents: number;
  orderDiscountCents: number;
  totalCents: number;
  depositCents: number;
  /** Lines still waiting for a price. They are excluded from the total. */
  unpricedLines: number;
};

export function lineCents(line: DraftLine, billedDays: number): number {
  if (line.unitPrice === null) return 0;
  const base = toCents(line.unitPrice) * line.quantity * billedDays;
  return applyDiscount(base, line.discountType, line.discountValue);
}

export function totals(draft: Draft): Totals {
  const billedDays = daysBetween(draft.pickupDate, draft.returnDate);

  const linesCents = draft.lines.reduce(
    (sum, line) => sum + lineCents(line, billedDays),
    0,
  );

  const discountValue = Number(draft.discountValue);
  const afterOrderDiscount = applyDiscount(
    linesCents,
    draft.discountType,
    Number.isFinite(discountValue) ? discountValue : null,
  );

  return {
    billedDays,
    linesCents,
    orderDiscountCents: linesCents - afterOrderDiscount,
    totalCents: afterOrderDiscount,
    depositCents: toCents(Number(draft.securityDeposit) || 0),
    unpricedLines: draft.lines.filter((l) => l.unitPrice === null).length,
  };
}

// ---------------------------------------------------------------------------
// Never lose typed work
// ---------------------------------------------------------------------------
// A failed save with a customer waiting is the moment she goes back to paper.
// The draft is written to localStorage on every keystroke, so a dropped
// connection, an accidental back, or a phone call cannot destroy it.

const DRAFT_KEY = "alquifiestas.proforma.v1";

export function saveDraft(draft: Draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // A full or disabled localStorage must not break the screen she is using.
  }
}

export function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Draft;
    return parsed?.lines ? { ...emptyDraft(), ...parsed } : null;
  } catch {
    return null;
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* nothing to clean up */
  }
}

/** True when there is anything worth restoring. */
export function draftHasContent(draft: Draft): boolean {
  return (
    draft.lines.length > 0 ||
    draft.customerName.trim() !== "" ||
    draft.notes.trim() !== ""
  );
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

export type CatalogHit = {
  variantId: string;
  productId: string;
  productName: string;
  variantLabel: string | null;
  categoryName: string;
  pricePerDay: number | null;
  priceSource: string | null;
  totalQuantity: number | null;
  published: boolean;
  photoSquare: string | null;
  optionName: string | null;
  optionValues: string[] | null;
};

export async function searchCatalog(query: string): Promise<CatalogHit[]> {
  const { data, error } = await panelClient().rpc("search_variants", {
    q: query,
    limit_n: 30,
  });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    variantId: row.variant_id,
    productId: row.product_id,
    productName: row.product_name,
    variantLabel: row.variant_label,
    categoryName: row.category_name,
    pricePerDay: row.price_per_day === null ? null : Number(row.price_per_day),
    priceSource: row.price_source,
    totalQuantity: row.total_quantity,
    published: row.published,
    photoSquare: row.photo_square,
    optionName: row.option_name,
    optionValues: row.option_values,
  }));
}

export type CustomerHit = {
  id: string;
  name: string;
  phone: string | null;
  ordersCount: number;
};

export async function searchCustomers(query: string): Promise<CustomerHit[]> {
  const { data, error } = await panelClient().rpc("search_customers", {
    q: query,
    limit_n: 12,
  });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    ordersCount: Number(row.orders_count ?? 0),
  }));
}

export async function availabilityFor(
  variantIds: string[],
  start: string,
  end: string,
): Promise<Map<string, Availability>> {
  return getAvailability(variantIds, start, end, panelClient());
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

export type SaveResult =
  | { ok: true; orderId: string; orderNumber: number; shortages: unknown[] }
  | { ok: false; message: string };

/** Errors the database can return, said the way she would say them. */
const SAVE_ERRORS: Record<string, string> = {
  sin_articulos: "Agregá al menos un artículo antes de guardar.",
  fechas_invalidas:
    "Revisá las fechas: la de regreso no puede ser antes de la de salida.",
};

export async function saveProforma(draft: Draft): Promise<SaveResult> {
  const billedDays = daysBetween(draft.pickupDate, draft.returnDate);

  const payload = {
    customer: {
      id: draft.customerId,
      name: draft.customerName.trim(),
      phone: draft.customerPhone.trim(),
      cedula: draft.customerCedula.trim(),
    },
    pickup_date: draft.pickupDate,
    agreed_return_date: draft.returnDate,
    pickup_time: draft.pickupTime || null,
    agreed_return_time: draft.returnTime || null,
    billed_days: billedDays,
    fulfilment: draft.fulfilment,
    delivery_address: draft.deliveryAddress.trim() || null,
    payment_method: draft.paymentMethod,
    security_deposit: Number(draft.securityDeposit) || null,
    discount_type: draft.discountType,
    discount_value: Number(draft.discountValue) || null,
    physical_invoice_number: draft.physicalInvoiceNumber.trim() || null,
    notes: draft.notes.trim() || null,
    override_reason: draft.overrideReason.trim() || null,
    lines: draft.lines.map((line) => ({
      variant_id: line.variantId,
      quantity: line.quantity,
      unit_price: line.unitPrice ?? 0,
      discount_type: line.discountType,
      discount_value: line.discountValue,
      save_price_to_catalog: line.savePriceToCatalog && line.unitPrice !== null,
      option_choice: line.optionChoice,
    })),
  };

  const { data, error } = await panelClient().rpc("create_staff_order", {
    p: payload,
  });

  if (error) {
    const offline =
      /fetch|network|failed to fetch/i.test(error.message ?? "") ||
      error.message === "";
    return {
      ok: false,
      message: offline
        ? "No se pudo guardar: parece que no hay conexión. Lo que escribiste sigue acá — probá otra vez."
        : "No se pudo guardar. Lo que escribiste sigue acá — probá otra vez en un momento.",
    };
  }

  const result = data as {
    ok: boolean;
    error?: string;
    order_id?: string;
    order_number?: number;
    shortages?: unknown[];
  };

  if (!result?.ok) {
    return {
      ok: false,
      message:
        SAVE_ERRORS[result?.error ?? ""] ??
        "No se pudo guardar. Revisá los datos y probá otra vez.",
    };
  }

  return {
    ok: true,
    orderId: result.order_id!,
    orderNumber: result.order_number!,
    shortages: result.shortages ?? [],
  };
}
