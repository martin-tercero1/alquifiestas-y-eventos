import { money } from "@/lib/format";
import { longDate } from "@/lib/format";
import type { OrderDetail } from "./order";

/**
 * The WhatsApp share.
 *
 * This is what she already does by hand — sends the customer a summary of the
 * proforma to confirm — so it is worth having on day one. It opens WhatsApp
 * from her own phone with a plain wa.me link and a pre-written message; there
 * is no API and no automated notification (that is a later brief).
 */

/**
 * Builds a wa.me link to the CUSTOMER's number.
 *
 * Nicaraguan mobiles are 8 digits and wa.me needs a country code, so a bare
 * local number is prefixed 505. A number that already carries its code is left
 * alone. Returns null when there is no phone — a quarter of contacts have none,
 * and the button simply does not show rather than opening a broken chat.
 */
export function customerWhatsappLink(
  phone: string | null,
  message: string,
): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return null;

  const withCode = digits.length === 8 ? `505${digits}` : digits;
  return `https://wa.me/${withCode}?text=${encodeURIComponent(message)}`;
}

/** The proforma, written the way she would type it into a chat. */
export function proformaSummary(order: OrderDetail): string {
  const lines = order.lines.map((line) => {
    const detail = [line.variantLabel, line.optionChoice]
      .filter(Boolean)
      .join(", ");
    const name = detail ? `${line.productName} (${detail})` : line.productName;
    return `• ${line.quantity} ${name} — ${money(line.unitPrice)} c/u`;
  });

  const parts = [
    `*Alquifiestas y Eventos*`,
    `Proforma #${order.number}`,
    ``,
    `Cliente: ${order.customerName}`,
    `Sale: ${longDate(order.pickupDate)}`,
    `Regresa: ${longDate(order.agreedReturnDate)}`,
    order.billedDays > 1 ? `Días: ${order.billedDays}` : null,
    ``,
    ...lines,
    ``,
    `Total: ${money(order.totals.totalCharged)}`,
  ];

  if (order.totals.totalPaid > 0) {
    parts.push(`Pagado: ${money(order.totals.totalPaid)}`);
    parts.push(`Saldo: ${money(order.totals.balance)}`);
  }
  if (order.totals.depositHeld > 0) {
    parts.push(`Depósito: ${money(order.totals.depositHeld)} (se devuelve)`);
  }

  parts.push(``, `Gracias 🎉`);

  return parts.filter((p) => p !== null).join("\n");
}
