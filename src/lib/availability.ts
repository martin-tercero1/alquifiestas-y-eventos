import { supabase } from "./supabase/client";

/**
 * The availability engine's TypeScript face.
 *
 * There is exactly one implementation, and it lives in Postgres
 * (availability_for_variants). This module is a typed wrapper — it must never
 * grow a second calculation of its own.
 *
 * THREE STATES, and conflating any two of them is a bug:
 *
 *   "available"  a known quantity, and enough of it
 *   "short"      a known quantity, and not enough
 *   "unknown"    total_quantity is null — the business has not counted this
 *                item yet. NOT zero. Bookable, with staff confirming by hand.
 *
 * It warns, it does not block. Nothing here throws on a shortage: a shortage is
 * data. The public site uses it to stop a customer submitting a combination
 * that cannot work; the admin panel (next brief) will use the same result to
 * show an overridable warning, because the owner sometimes borrows stock from
 * another business or knows an order is coming back early.
 */

export type AvailabilityStatus = "available" | "short" | "unknown";

export type Availability = {
  variantId: string;
  /** null means the business has not counted this item yet. */
  totalQuantity: number | null;
  /** The worst day in the range — one blocked day blocks the whole booking. */
  peakOccupied: number;
  /** null when the total is unknown. Never use `?? 0`. */
  available: number | null;
  isUnknown: boolean;
};

export type AvailabilityCheck = Availability & {
  requested: number;
  status: AvailabilityStatus;
  /** How many more are needed. Always 0 unless status is "short". */
  shortBy: number;
};

/**
 * Availability for many variants over one range, in a single query.
 *
 * This is the primary entry point, and the catalogue listing depends on it.
 * Do NOT solve a listing by calling this once per item in a loop.
 */
export async function getAvailability(
  variantIds: string[],
  start: string,
  end: string,
  /**
   * The panel passes its own signed-in client. Everything else about the
   * calculation is identical — there is one availability engine, in Postgres,
   * and this is the only wrapper around it.
   */
  client: Pick<typeof supabase, "rpc"> = supabase,
): Promise<Map<string, Availability>> {
  const result = new Map<string, Availability>();
  if (variantIds.length === 0) return result;

  const { data, error } = await client.rpc("availability_for_variants", {
    p_variant_ids: variantIds,
    p_start: start,
    p_end: end,
  });

  if (error) {
    // Availability is advisory on a listing page. If the engine is unreachable
    // the catalogue still renders — it just shows no availability badge, which
    // is the same thing it does before the visitor picks a date. Never invent
    // a number and never blank the page.
    console.error("availability_for_variants failed:", error.message);
    return result;
  }

  for (const row of data ?? []) {
    result.set(row.variant_id, {
      variantId: row.variant_id,
      totalQuantity: row.total_quantity,
      peakOccupied: row.peak_occupied,
      available: row.available,
      isUnknown: row.is_unknown,
    });
  }

  return result;
}

/** The single-item case, expressed in terms of the batch one. */
export async function getAvailabilityFor(
  variantId: string,
  start: string,
  end: string,
): Promise<Availability | null> {
  const map = await getAvailability([variantId], start, end);
  return map.get(variantId) ?? null;
}

/** Turns raw availability plus a requested quantity into a decision. */
export function check(
  availability: Availability | undefined,
  requested: number,
): AvailabilityCheck {
  if (!availability) {
    return {
      variantId: "",
      totalQuantity: null,
      peakOccupied: 0,
      available: null,
      isUnknown: true,
      requested,
      status: "unknown",
      shortBy: 0,
    };
  }

  // Unknown is bookable. The alternative — refusing to quote an item because
  // nobody has counted it yet — is worse for a business going live with gaps
  // on purpose.
  if (availability.available === null) {
    return { ...availability, requested, status: "unknown", shortBy: 0 };
  }

  const shortBy = Math.max(requested - availability.available, 0);
  return {
    ...availability,
    requested,
    status: shortBy > 0 ? "short" : "available",
    shortBy,
  };
}

/**
 * The return date for a rental of N days (nights) starting on `pickup`: the day
 * the item is due back. Pricing is linear — the 24-hour price times the number
 * of days — and a one-day rental is due back the next day.
 */
export function occupancyEnd(pickup: string, days: number): string {
  const [y, m, d] = pickup.split("-").map(Number);
  const end = new Date(Date.UTC(y, m - 1, d + Math.max(days, 1)));
  return end.toISOString().slice(0, 10);
}

/** Explains a shortage to a customer, in Spanish. Never blames them. */
export function shortageMessage(
  productName: string,
  result: AvailabilityCheck,
): string {
  if (result.status !== "short") return "";

  if (result.available === 0) {
    return `No nos queda ningún ${productName} libre para esas fechas. Escribinos por WhatsApp y vemos qué podemos hacer.`;
  }

  return `Para esas fechas solo tenemos ${result.available} de ${productName}, y pediste ${result.requested}. Podés bajar la cantidad o escribirnos por WhatsApp.`;
}
