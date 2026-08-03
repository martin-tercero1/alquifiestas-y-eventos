"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { money, longDate, shortDate, shortTime } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { WhatsAppIcon } from "@/components/ui/icons";
import {
  closeOrder,
  deleteOrder,
  isOverdue,
  CHARGE_LABEL,
  PAYMENT_KIND_LABEL,
  STATUS_LABEL,
  type OrderDetail,
  type OrderStatus,
} from "@/lib/admin/order";
import { EliminarSheet } from "@/components/ui/EliminarSheet";
import { ComprobanteBoton } from "./ComprobanteBoton";
import { customerWhatsappLink, proformaSummary } from "@/lib/admin/share";
import {
  CancelarSheet,
  CargoSheet,
  ConfirmarSheet,
  EntregaSheet,
  PagoSheet,
  RetiroSheet,
  RetornoSheet,
} from "./AccionesSheets";

/**
 * Detalle de pedido — where an order lives its whole life.
 *
 * The order's status decides which actions exist; an action that does not
 * apply is never shown. The single most important action for the current
 * status is pinned to a sticky bar so it never needs scrolling to; the rest
 * sit inline. Every action refreshes the server-rendered page rather than
 * patching state locally, so the screen and the database never disagree.
 */

type SheetName =
  | "pago"
  | "retiro"
  | "retorno"
  | "cargo"
  | "confirmar"
  | "entrega"
  | "cancelar"
  | "eliminar"
  | null;

const STATUS_VARIANT: Record<
  OrderStatus,
  "neutral" | "scarce" | "brand"
> = {
  pending_request: "scarce",
  confirmed: "brand",
  picked_up: "brand",
  partially_returned: "scarce",
  returned: "neutral",
  closed: "neutral",
  cancelled: "neutral",
};

function todayISO(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

export function DetallePedido({
  order,
  canDelete = false,
  canIssueComprobante = false,
}: {
  order: OrderDetail;
  /** Only a technical admin gets the hard-delete control; absent otherwise. */
  canDelete?: boolean;
  /** Only a technical admin can generate the comprobante PDF (Brief 04 §9). */
  canIssueComprobante?: boolean;
}) {
  const router = useRouter();
  const [sheet, setSheet] = useState<SheetName>(null);
  const [busy, setBusy] = useState(false);
  // Set after a full return that handed a held cédula back, so staff get a
  // clear "give the card back" reminder — the thing most likely to be forgotten.
  const [cedulaReminder, setCedulaReminder] = useState<string | null>(null);

  const onSaved = () => router.refresh();
  const overdue = isOverdue(order, todayISO());

  async function direct(fn: () => Promise<unknown>) {
    setBusy(true);
    await fn();
    setBusy(false);
    router.refresh();
  }

  const waLink = customerWhatsappLink(
    order.customerPhone,
    proformaSummary(order),
  );

  // Which action is the primary one right now.
  const primary = (() => {
    switch (order.status) {
      case "pending_request":
        return { label: "Confirmar pedido", run: () => setSheet("confirmar") };
      case "confirmed":
        return { label: "Marcar retirado", run: () => setSheet("retiro") };
      case "picked_up":
      case "partially_returned":
        return { label: "Registrar regreso", run: () => setSheet("retorno") };
      case "returned":
        return order.totals.balance > 0
          ? { label: "Registrar pago", run: () => setSheet("pago") }
          : { label: "Cerrar pedido", run: () => direct(() => closeOrder(order.id)) };
      default:
        return null;
    }
  })();

  const live = order.status !== "cancelled" && order.status !== "closed";
  const outForReturn =
    order.status === "picked_up" || order.status === "partially_returned";

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-6 pb-40">
      {/* ---- Header ---- */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="type-label text-stone-text">
            Pedido #{order.number}
            {order.source === "website" && " · del sitio web"}
          </p>
          <h1 className="type-display mt-1 text-3xl text-ink">
            {order.customerName}
          </h1>
          {order.customerPhone && (
            <p className="type-mono mt-1 text-base text-stone-text">
              {order.customerPhone}
            </p>
          )}
        </div>
        <Badge variant={STATUS_VARIANT[order.status]}>
          {STATUS_LABEL[order.status]}
        </Badge>
      </div>

      {overdue && (
        <p className="mt-4 rounded-md border border-mamey/30 bg-mamey/[0.06] px-4 py-3 text-base font-medium text-mamey-text">
          Atrasado: debía regresar el {shortDate(order.agreedReturnDate)} y
          todavía no se ha recibido.
        </p>
      )}

      {/* The card is physically in the drawer — say so while it's held, and
          say it loudly the moment the rental closes and it must go back. */}
      {cedulaReminder ? (
        <div
          role="alert"
          className="mt-4 flex items-start justify-between gap-3 rounded-md border border-green/40 bg-green/[0.08] px-4 py-3"
        >
          <p className="text-base font-semibold text-green-dark">
            Devolvé la cédula física a {cedulaReminder}. La teníamos guardada
            hasta este regreso.
          </p>
          <button
            type="button"
            onClick={() => setCedulaReminder(null)}
            className="type-label shrink-0 text-green-dark underline"
          >
            Entendido
          </button>
        </div>
      ) : (
        order.cedulaRetained && (
          <p className="mt-4 rounded-md border border-rule bg-paper px-4 py-3 text-sm font-medium text-stone-text">
            Tenés la cédula de {order.customerName} guardada. Devolvésela cuando
            regrese todo.
          </p>
        )
      )}

      {order.status === "cancelled" && order.overrideReason && (
        <p className="mt-4 rounded-md border border-rule bg-paper px-4 py-3 text-base text-stone-text">
          Cancelado: {order.overrideReason}
        </p>
      )}

      {order.reviewReason && (
        <p className="mt-4 rounded-md border border-mamey/40 bg-mamey-tint px-4 py-3 text-sm font-medium text-mamey-text">
          Revisá este cliente: {order.reviewReason}
        </p>
      )}

      {order.availabilityOverridden && live && (
        <p className="mt-4 rounded-md border border-mamey/30 bg-mamey/[0.06] px-4 py-3 text-sm font-medium text-mamey-text">
          Este pedido se tomó por encima de la disponibilidad.
          {order.overrideReason && ` Motivo: ${order.overrideReason}`}
        </p>
      )}

      {/* ---- Dates ---- */}
      <dl className="mt-6 grid grid-cols-2 gap-3 rounded-lg border border-rule bg-paper p-4">
        <div>
          <dt className="type-label text-stone-text">Sale</dt>
          <dd className="text-base font-semibold text-ink">
            {shortDate(order.pickupDate)}
            {order.pickupTime && (
              <span className="block type-mono text-sm font-normal text-stone-text">
                {shortTime(order.pickupTime)}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="type-label text-stone-text">Regresa</dt>
          <dd className="text-base font-semibold text-ink">
            {shortDate(order.agreedReturnDate)}
            {order.agreedReturnTime && (
              <span className="block type-mono text-sm font-normal text-stone-text">
                {shortTime(order.agreedReturnTime)}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="type-label text-stone-text">Días facturados</dt>
          <dd className="text-base text-ink">{order.billedDays}</dd>
        </div>
        <div>
          <dt className="type-label text-stone-text">Entrega</dt>
          <dd className="text-base text-ink">
            {order.fulfilment === "delivery" ? "A domicilio" : "Retira en local"}
          </dd>
        </div>
        {order.fulfilment === "delivery" && order.deliveryAddress && (
          <div className="col-span-2">
            <dt className="type-label text-stone-text">Dirección</dt>
            <dd className="text-base text-ink">{order.deliveryAddress}</dd>
          </div>
        )}
      </dl>

      {/* ---- WhatsApp ---- */}
      {waLink && live && (
        <a
          href={waLink}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex min-h-13 items-center justify-center gap-2 rounded-md border border-green/40 bg-green/[0.07] px-4 text-base font-semibold text-green"
        >
          <WhatsAppIcon className="h-5 w-5" />
          Enviar proforma por WhatsApp
        </a>
      )}

      {/* ---- Comprobante (technical admin only, Brief 04 §9) ---- */}
      {canIssueComprobante &&
        order.lines.length > 0 &&
        order.status !== "cancelled" && (
          <div className="mt-3">
            <ComprobanteBoton
              orderId={order.id}
              customerName={order.customerName}
            />
          </div>
        )}

      {/* ---- Lines ---- */}
      <section className="mt-8">
        <h2 className="type-label text-stone-text">Artículos</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {order.lines.map((line) => {
            const name = line.variantLabel
              ? `${line.productName} — ${line.variantLabel}`
              : line.productName;
            const returnedNote =
              line.accounted > 0
                ? [
                    line.returned > 0 && `${line.returned} buenas`,
                    line.missing > 0 && `${line.missing} faltan`,
                    line.damaged > 0 && `${line.damaged} dañadas`,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : null;
            return (
              <li
                key={line.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-rule bg-paper p-4"
              >
                <div className="min-w-0">
                  <p className="text-base font-semibold text-ink">{name}</p>
                  {line.optionChoice && (
                    <p className="type-label mt-0.5 text-green-dark">
                      {line.optionChoice}
                    </p>
                  )}
                  <p className="type-mono mt-0.5 text-sm text-stone-text">
                    {line.quantity} × {money(line.unitPrice)}
                    {order.billedDays > 1 && ` × ${order.billedDays} días`}
                  </p>
                  {returnedNote && (
                    <p className="mt-1 text-sm text-green">Regresó: {returnedNote}</p>
                  )}
                </div>
                <p className="type-mono shrink-0 text-right text-base font-medium text-ink tabular-nums">
                  {money(line.unitPrice * line.quantity * order.billedDays)}
                </p>
              </li>
            );
          })}
        </ul>

        {order.status === "pending_request" && (
          <Link
            href={`/panel/pedidos/${order.id}/editar`}
            className="mt-3 flex min-h-13 items-center justify-center rounded-md border border-rule bg-paper px-4 text-base font-semibold text-ink transition-colors duration-fast ease-out hover:border-rule-strong"
          >
            Editar artículos
          </Link>
        )}
      </section>

      {/* ---- Money ---- */}
      <section className="mt-8 rounded-lg border border-rule bg-paper p-5">
        <dl className="flex flex-col gap-2 text-base">
          <Row label="Artículos" value={money(order.totals.linesAfterDiscount)} />
          {order.deliveryCost !== null && order.deliveryCost > 0 && (
            <Row label="Envío" value={money(order.deliveryCost)} />
          )}
          {order.totals.chargesTotal > 0 && (
            <Row label="Cargos" value={money(order.totals.chargesTotal)} />
          )}
          <Row
            label="Total"
            value={money(order.totals.totalCharged)}
            strong
          />
          {order.totals.totalPaid > 0 && (
            <Row label="Pagado" value={`− ${money(order.totals.totalPaid)}`} />
          )}
        </dl>

        <div className="mt-4 flex items-center justify-between border-t border-rule pt-4">
          <span className="type-label text-stone-text">Saldo</span>
          <span
            className={cn(
              "type-display text-3xl tabular-nums",
              order.totals.balance > 0 ? "text-mamey-text" : "text-green",
            )}
          >
            {money(order.totals.balance)}
          </span>
        </div>

        {order.totals.depositHeld > 0 && (
          <p className="mt-3 text-sm text-stone-text">
            Más {money(order.totals.depositHeld)} de depósito, que se devuelve al
            regresar todo.
          </p>
        )}
      </section>

      {/* ---- Payments & charges ---- */}
      {(order.payments.length > 0 || order.charges.length > 0) && (
        <section className="mt-6 flex flex-col gap-2">
          {order.payments.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-md border border-rule bg-paper px-4 py-2.5 text-sm"
            >
              <span className="text-stone-text">
                {PAYMENT_KIND_LABEL[p.kind]} · {shortDate(p.paidOn)}
                {p.method === "transfer" ? " · transferencia" : " · efectivo"}
              </span>
              <span className="type-mono text-green tabular-nums">
                {money(p.amount)}
              </span>
            </div>
          ))}
          {order.charges.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between rounded-md border border-rule bg-paper px-4 py-2.5 text-sm"
            >
              <span className="text-stone-text">
                {CHARGE_LABEL[c.kind]}
                {c.description && ` · ${c.description}`}
              </span>
              <span className="type-mono text-ink tabular-nums">
                {money(c.amount)}
              </span>
            </div>
          ))}
        </section>
      )}

      {order.physicalInvoiceNumber && (
        <p className="mt-6 text-sm text-stone-text">
          Factura membretada: {order.physicalInvoiceNumber}
        </p>
      )}

      {order.notes && (
        <p className="mt-2 rounded-md bg-limewash px-4 py-3 text-sm text-ink">
          {order.notes}
        </p>
      )}

      {/* ---- Secondary actions ---- */}
      {live && (
        <div className="mt-8 flex flex-wrap gap-2">
          {order.status !== "pending_request" && (
            <SecondaryButton onClick={() => setSheet("entrega")}>
              {order.fulfilment === "delivery" ? "Editar entrega" : "Cobrar envío"}
            </SecondaryButton>
          )}
          {(order.status === "confirmed" ||
            outForReturn ||
            order.status === "returned") &&
            order.totals.balance > 0 &&
            primary?.label !== "Registrar pago" && (
              <SecondaryButton onClick={() => setSheet("pago")}>
                Registrar pago
              </SecondaryButton>
            )}
          {(outForReturn || order.status === "returned") && (
            <SecondaryButton onClick={() => setSheet("cargo")}>
              Agregar cargo
            </SecondaryButton>
          )}
          {(order.status === "pending_request" ||
            order.status === "confirmed") && (
            <SecondaryButton onClick={() => setSheet("cancelar")} tone="danger">
              Cancelar
            </SecondaryButton>
          )}
        </div>
      )}

      {/* ---- Danger zone (technical admin only) ---- */}
      {canDelete && (
        <div className="mt-10 rounded-lg border border-mamey/25 bg-mamey/[0.04] p-4">
          <p className="type-label text-mamey-text">Zona técnica</p>
          <p className="mt-1 text-sm text-stone-text">
            Borrado permanente, solo para limpiar basura de prueba. Para un
            pedido real, usá Cancelar.
          </p>
          <button
            type="button"
            onClick={() => setSheet("eliminar")}
            className="mt-3 min-h-12 rounded-md border border-mamey/40 px-4 text-base font-semibold text-mamey-text transition-colors duration-fast ease-out hover:bg-mamey/[0.08]"
          >
            Eliminar pedido
          </button>
        </div>
      )}

      {/* ---- Primary sticky ---- */}
      {primary && (
        <div className="fixed inset-x-0 bottom-20 z-30 border-t border-rule bg-paper/97 backdrop-blur-sm">
          <div className="mx-auto w-full max-w-2xl px-5 py-3">
            <button
              type="button"
              onClick={primary.run}
              disabled={busy}
              className="min-h-14 w-full rounded-md bg-mamey px-6 text-lg font-semibold text-white transition-[background-color,transform] duration-fast ease-out active:scale-[0.98] disabled:opacity-45"
            >
              {busy ? "Un momento…" : primary.label}
            </button>
          </div>
        </div>
      )}

      {/* ---- Sheets ---- */}
      <PagoSheet order={order} open={sheet === "pago"} onClose={() => setSheet(null)} onSaved={onSaved} />
      <RetiroSheet order={order} open={sheet === "retiro"} onClose={() => setSheet(null)} onSaved={onSaved} />
      <RetornoSheet
        order={order}
        open={sheet === "retorno"}
        onClose={() => setSheet(null)}
        onSaved={onSaved}
        onCedulaReminder={(name) => setCedulaReminder(name ?? order.customerName)}
      />
      <CargoSheet order={order} open={sheet === "cargo"} onClose={() => setSheet(null)} onSaved={onSaved} />
      <ConfirmarSheet order={order} open={sheet === "confirmar"} onClose={() => setSheet(null)} onSaved={onSaved} />
      <EntregaSheet order={order} open={sheet === "entrega"} onClose={() => setSheet(null)} onSaved={onSaved} />
      <CancelarSheet order={order} open={sheet === "cancelar"} onClose={() => setSheet(null)} onSaved={onSaved} />
      {canDelete && (
        <EliminarSheet
          open={sheet === "eliminar"}
          onClose={() => setSheet(null)}
          onDeleted={() => router.replace("/panel/pedidos")}
          title="Eliminar pedido"
          what={`el pedido #${order.number} de ${order.customerName}`}
          warning={
            order.payments.length > 0
              ? "Este pedido ya tiene pagos registrados. Se borrarán junto con él. Si es un pedido real, cancelalo en vez de borrarlo."
              : undefined
          }
          run={() => deleteOrder(order.id, order.payments.length > 0)}
        />
      )}
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <dt className={cn("text-stone-text", strong && "font-semibold text-ink")}>
        {label}
      </dt>
      <dd
        className={cn(
          "type-mono tabular-nums text-ink",
          strong && "font-semibold",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function SecondaryButton({
  children,
  onClick,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-12 rounded-md border px-5 text-base font-semibold transition-colors duration-fast ease-out",
        tone === "danger"
          ? "border-mamey/40 text-mamey-text hover:bg-mamey/[0.06]"
          : "border-rule text-ink hover:border-rule-strong",
      )}
    >
      {children}
    </button>
  );
}
