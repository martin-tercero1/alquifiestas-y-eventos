"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { CedulaField } from "@/components/ui/CedulaField";
import {
  addCharge,
  cancelOrder,
  confirmOrder,
  markPickedUp,
  recordPayment,
  recordReturn,
  setDelivery,
  CHARGE_LABEL,
  type ChargeKind,
  type Fulfilment,
  type MutationResult,
  type OrderDetail,
  type PaymentKind,
  type PaymentMethod,
} from "@/lib/admin/order";

/**
 * The sheets behind each action on Detalle de pedido.
 *
 * Every one follows the same shape: local form state, one RPC call, an error
 * shown in plain Spanish that keeps the sheet open so nothing typed is lost,
 * and `onSaved()` on success so the parent can reload the server data.
 */

function todayISO(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

type SheetProps = { order: OrderDetail; open: boolean; onClose: () => void; onSaved: () => void };

/** Shared submit wiring: run the mutation, surface the error, or close on success. */
function useAction(onSaved: () => void, onClose: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(
    fn: () => Promise<MutationResult>,
    onSuccess?: (data: Record<string, unknown>) => void,
  ) {
    setBusy(true);
    setError(null);
    const result = await fn();
    if (result.ok) {
      onSuccess?.(result.data);
      onSaved();
      onClose();
    } else {
      setError(result.message);
    }
    setBusy(false);
  }

  return { busy, error, run, setError };
}

function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-mamey/30 bg-mamey/[0.06] px-4 py-3 text-base font-medium text-mamey-text"
    >
      {message}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Entrega — shared between confirmation and later editing
// ---------------------------------------------------------------------------

type EntregaState = {
  fulfilment: Fulfilment;
  address: string;
  cost: string;
};

function entregaFromOrder(order: OrderDetail): EntregaState {
  return {
    fulfilment: order.fulfilment,
    address: order.deliveryAddress ?? "",
    cost: order.deliveryCost ? String(order.deliveryCost) : "",
  };
}

/**
 * The entrega form state. It re-syncs from the order every time the sheet
 * opens, not just at mount — the sheet component stays mounted behind the
 * scenes, so without this a delivery edited once would show stale on the next
 * open (and the toggle would default to whatever it was at page load).
 */
function useEntrega(
  order: OrderDetail,
  open: boolean,
): [EntregaState, (patch: Partial<EntregaState>) => void] {
  const [state, setState] = useState<EntregaState>(() => entregaFromOrder(order));
  useEffect(() => {
    if (open) setState(entregaFromOrder(order));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return [state, (patch) => setState((s) => ({ ...s, ...patch }))];
}

/** The choice of pickup vs delivery, and — only when delivery — the address and
 *  the hand-quoted freight. Used verbatim inside the confirm sheet and on its
 *  own after the fact, so there is one way to say how an order gets there. */
function EntregaFields({
  state,
  set,
  addressError,
}: {
  state: EntregaState;
  set: (patch: Partial<EntregaState>) => void;
  /** Shown inline under the address when a delivery is missing one. */
  addressError?: string | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {(
          [
            ["pickup", "Retira en el local"],
            ["delivery", "Entrega a domicilio"],
          ] as [Fulfilment, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => set({ fulfilment: value })}
            className={cn(
              "min-h-13 flex-1 rounded-md border px-3 text-sm font-semibold",
              "transition-colors duration-fast ease-out",
              state.fulfilment === value
                ? "border-green bg-green/10 text-green"
                : "border-rule text-stone-text",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {state.fulfilment === "delivery" && (
        <>
          <Field
            label="Dirección"
            htmlFor="ent-dir"
            hint="Dónde lo llevamos, con alguna referencia."
            error={addressError ?? undefined}
          >
            <Textarea
              id="ent-dir"
              rows={2}
              value={state.address}
              onChange={(e) => set({ address: e.target.value })}
              aria-invalid={Boolean(addressError)}
              aria-describedby={addressError ? "ent-dir-error" : undefined}
            />
          </Field>
          <Field
            label="Costo de envío"
            htmlFor="ent-costo"
            optional
            hint="Se cotiza a mano y se suma al total. Dejalo vacío si todavía no lo sabés."
          >
            <Input
              id="ent-costo"
              type="number"
              inputMode="decimal"
              min={0}
              value={state.cost}
              onChange={(e) => set({ cost: e.target.value })}
            />
          </Field>
        </>
      )}
    </div>
  );
}

/** Delivery has to go somewhere. The orders table requires a delivery_address
 *  for a delivery, so guard it in the form — a NOT NULL constraint must never
 *  reach the user as a raw Postgres error. Returns a plain-Spanish message, or
 *  null when the entrega is fine to save. */
function entregaAddressError(state: EntregaState): string | null {
  if (state.fulfilment !== "delivery") return null;
  if (state.address.trim().length < 6) {
    return "Para una entrega a domicilio necesitamos la dirección, con alguna referencia.";
  }
  return null;
}

/** Turns the entrega form into the shape setDelivery expects. */
function entregaInput(state: EntregaState) {
  return {
    fulfilment: state.fulfilment,
    address: state.fulfilment === "delivery" ? state.address : null,
    cost:
      state.fulfilment === "delivery" && state.cost.trim() !== ""
        ? Number(state.cost)
        : null,
  };
}

export function EntregaSheet({ order, open, onClose, onSaved }: SheetProps) {
  const [state, set] = useEntrega(order, open);
  const [attempted, setAttempted] = useState(false);
  const { busy, error, run } = useAction(onSaved, onClose);

  // Recomputed live once they've tried to save, so the message clears the
  // moment the address is filled in — no stale error hanging around.
  const addressError = attempted ? entregaAddressError(state) : null;

  return (
    <Sheet open={open} onClose={onClose} title="Editar entrega">
      <div className="flex flex-col gap-5 overflow-y-auto px-5 pb-8">
        <EntregaFields state={state} set={set} addressError={addressError} />
        <ErrorNote message={error} />
        <Button
          size="lg"
          full
          disabled={busy}
          onClick={() => {
            setAttempted(true);
            if (entregaAddressError(state)) return;
            run(() => setDelivery(order.id, entregaInput(state)));
          }}
        >
          {busy ? "Guardando…" : "Guardar entrega"}
        </Button>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Pago
// ---------------------------------------------------------------------------

export function PagoSheet({ order, open, onClose, onSaved }: SheetProps) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>(order.paymentMethod);
  const [kind, setKind] = useState<PaymentKind>("advance");
  const [reference, setReference] = useState("");
  const { busy, error, run } = useAction(onSaved, onClose);

  const balance = order.totals.balance;

  return (
    <Sheet open={open} onClose={onClose} title="Registrar pago">
      <div className="flex flex-col gap-5 overflow-y-auto px-5 pb-8">
        <div className="rounded-md bg-limewash px-4 py-3">
          <p className="type-label text-stone-text">Saldo pendiente</p>
          <p className="type-display text-2xl text-ink tabular-nums">
            {money(balance)}
          </p>
        </div>

        <Field label="Monto" htmlFor="pago-monto">
          <Input
            id="pago-monto"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
          />
        </Field>

        {balance > 0 && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAmount(String(Math.round(balance / 2)))}
              className="min-h-12 flex-1 rounded-md border border-rule text-base font-semibold text-green"
            >
              Mitad ({money(balance / 2)})
            </button>
            <button
              type="button"
              onClick={() => setAmount(String(balance))}
              className="min-h-12 flex-1 rounded-md border border-rule text-base font-semibold text-green"
            >
              Todo ({money(balance)})
            </button>
          </div>
        )}

        <Field label="Forma" htmlFor="pago-forma">
          <div className="flex gap-2">
            {(
              [
                ["cash", "Efectivo"],
                ["transfer", "Transferencia"],
              ] as [PaymentMethod, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMethod(value)}
                className={cn(
                  "min-h-13 flex-1 rounded-md border text-base font-semibold",
                  method === value
                    ? "border-green bg-green/10 text-green"
                    : "border-rule text-stone-text",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Tipo" htmlFor="pago-tipo">
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["advance", "Anticipo"],
                ["balance", "Abono"],
                ["deposit", "Depósito"],
              ] as [PaymentKind, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setKind(value)}
                className={cn(
                  "min-h-12 rounded-md border text-sm font-semibold",
                  kind === value
                    ? "border-green bg-green/10 text-green"
                    : "border-rule text-stone-text",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Referencia" htmlFor="pago-ref" optional>
          <Input
            id="pago-ref"
            value={reference}
            placeholder="N.º de transferencia, si aplica"
            onChange={(e) => setReference(e.target.value)}
          />
        </Field>

        <ErrorNote message={error} />

        <Button
          size="lg"
          full
          disabled={busy || Number(amount) <= 0}
          onClick={() =>
            run(() =>
              recordPayment(
                order.id,
                Number(amount),
                method,
                kind,
                reference.trim() || null,
              ),
            )
          }
        >
          {busy ? "Guardando…" : "Registrar pago"}
        </Button>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Retorno
// ---------------------------------------------------------------------------

type ReturnRow = { returned: string; missing: string; damaged: string };

// ---------------------------------------------------------------------------
// Retiro — pickup, where the physical cédula changes hands
// ---------------------------------------------------------------------------

/**
 * Pickup is the moment the customer hands over their cédula, so it is the moment
 * we require it (Brief 04 §2). The field is pre-filled from what we already hold
 * and is required here — but validation only warns on the shape, never blocks,
 * so a tourist or a company with only a RUC can still be picked up.
 */
export function RetiroSheet({ order, open, onClose, onSaved }: SheetProps) {
  const [cedula, setCedula] = useState(order.customerCedula ?? "");
  const [attempted, setAttempted] = useState(false);
  const [skip, setSkip] = useState(false);
  const { busy, error, run } = useAction(onSaved, onClose);

  useEffect(() => {
    if (open) {
      setCedula(order.customerCedula ?? "");
      setAttempted(false);
      setSkip(false);
    }
  }, [open, order.customerCedula]);

  const missing = attempted && !skip && cedula.trim() === "";

  return (
    <Sheet open={open} onClose={onClose} title="Marcar retirado">
      <div className="flex flex-col gap-5 overflow-y-auto px-5 pb-8">
        <p className="text-base text-stone-text">
          Antes de entregar los artículos, anotá la cédula del cliente. La
          guardás en físico hasta que regrese todo.
        </p>

        <CedulaField
          id="retiro-cedula"
          value={skip ? "" : cedula}
          onChange={setCedula}
          required
          optional={false}
          disabled={skip}
          hint="Pedila y anotala — la tenés en físico hasta el regreso."
        />
        {missing && (
          <p role="alert" className="-mt-2 text-sm font-medium text-mamey-text">
            Anotá la cédula para poder marcar el retiro (o marcá que no se
            pidió).
          </p>
        )}

        <button
          type="button"
          onClick={() => {
            setSkip((s) => !s);
            setAttempted(false);
          }}
          className={cn(
            "min-h-12 rounded-md border px-3 py-2 text-left text-sm font-semibold",
            "transition-colors duration-fast ease-out",
            skip
              ? "border-green bg-green/10 text-green"
              : "border-rule text-stone-text",
          )}
        >
          No pidió cédula (cliente de confianza)
          <span className="mt-0.5 block text-xs font-normal text-stone-text">
            No se le va a retener la cédula esta vez.
          </span>
        </button>

        <ErrorNote message={error} />

        <Button
          size="lg"
          full
          disabled={busy}
          onClick={() => {
            setAttempted(true);
            if (!skip && cedula.trim() === "") return;
            run(() => markPickedUp(order.id, skip ? null : cedula));
          }}
        >
          {busy ? "Guardando…" : "Confirmar retiro"}
        </Button>
      </div>
    </Sheet>
  );
}

export function RetornoSheet({
  order,
  open,
  onClose,
  onSaved,
  onCedulaReminder,
}: SheetProps & {
  /** Fired on a full return when we were holding the customer's cédula. */
  onCedulaReminder?: (customerName: string | null) => void;
}) {
  const outstanding = order.lines.filter((l) => l.accounted < l.quantity);
  const [rows, setRows] = useState<Record<string, ReturnRow>>({});
  const [returnedOn, setReturnedOn] = useState(todayISO());
  const { busy, error, run, setError } = useAction(onSaved, onClose);

  const get = (id: string): ReturnRow =>
    rows[id] ?? { returned: "", missing: "", damaged: "" };
  const set = (id: string, patch: Partial<ReturnRow>) =>
    setRows((r) => ({ ...r, [id]: { ...get(id), ...patch } }));

  function submit() {
    const lines = outstanding
      .map((line) => {
        const row = get(line.id);
        return {
          order_line_id: line.id,
          returned: Number(row.returned) || 0,
          missing: Number(row.missing) || 0,
          damaged: Number(row.damaged) || 0,
        };
      })
      .filter((l) => l.returned + l.missing + l.damaged > 0);

    if (lines.length === 0) {
      setError("Anotá cuántas unidades regresaron en al menos una línea.");
      return;
    }
    run(
      () => recordReturn(order.id, lines, returnedOn),
      (data) => {
        if (data.return_cedula) {
          onCedulaReminder?.((data.customer_name as string | null) ?? null);
        }
      },
    );
  }

  return (
    <Sheet open={open} onClose={onClose} title="Registrar regreso">
      <div className="flex flex-col gap-5 overflow-y-auto px-5 pb-8">
        <Field label="Fecha de regreso" htmlFor="retorno-fecha">
          <Input
            id="retorno-fecha"
            type="date"
            value={returnedOn}
            onChange={(e) => setReturnedOn(e.target.value)}
          />
        </Field>

        <ul className="flex flex-col gap-4">
          {outstanding.map((line) => {
            const remaining = line.quantity - line.accounted;
            const name = line.variantLabel
              ? `${line.productName} — ${line.variantLabel}`
              : line.productName;
            const row = get(line.id);
            return (
              <li key={line.id} className="rounded-lg border border-rule bg-paper p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-base font-semibold text-ink">{name}</p>
                  <p className="type-mono text-sm text-stone-text">
                    faltan {remaining}
                  </p>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  {(
                    [
                      ["returned", "Buenas"],
                      ["missing", "Faltan"],
                      ["damaged", "Dañadas"],
                    ] as [keyof ReturnRow, string][]
                  ).map(([field, label]) => (
                    <label key={field} className="flex flex-col gap-1">
                      <span className="type-label text-stone-text">{label}</span>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={remaining}
                        className="min-h-12 py-2 text-center"
                        value={row[field]}
                        onChange={(e) => set(line.id, { [field]: e.target.value })}
                      />
                    </label>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    set(line.id, { returned: String(remaining), missing: "", damaged: "" })
                  }
                  className="mt-2 min-h-10 text-sm font-semibold text-green underline"
                >
                  Todas regresaron bien
                </button>
              </li>
            );
          })}
        </ul>

        <ErrorNote message={error} />

        <Button size="lg" full disabled={busy} onClick={submit}>
          {busy ? "Guardando…" : "Registrar regreso"}
        </Button>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Cargo
// ---------------------------------------------------------------------------

export function CargoSheet({ order, open, onClose, onSaved }: SheetProps) {
  const [kind, setKind] = useState<ChargeKind>("late_fee");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const { busy, error, run } = useAction(onSaved, onClose);

  return (
    <Sheet open={open} onClose={onClose} title="Agregar cargo">
      <div className="flex flex-col gap-5 overflow-y-auto px-5 pb-8">
        <Field label="Tipo de cargo" htmlFor="cargo-tipo">
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(CHARGE_LABEL) as ChargeKind[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setKind(value)}
                className={cn(
                  "min-h-12 rounded-md border text-base font-semibold",
                  kind === value
                    ? "border-green bg-green/10 text-green"
                    : "border-rule text-stone-text",
                )}
              >
                {CHARGE_LABEL[value]}
              </button>
            ))}
          </div>
        </Field>

        <Field
          label="Monto"
          htmlFor="cargo-monto"
          hint={
            kind === "late_fee"
              ? "La mora la decidís vos. El sistema nunca la calcula."
              : undefined
          }
        >
          <Input
            id="cargo-monto"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
          />
        </Field>

        <Field label="Detalle" htmlFor="cargo-detalle" optional>
          <Input
            id="cargo-detalle"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        <ErrorNote message={error} />

        <Button
          size="lg"
          full
          disabled={busy || Number(amount) <= 0}
          onClick={() =>
            run(() =>
              addCharge(order.id, kind, Number(amount), description.trim() || null),
            )
          }
        >
          {busy ? "Guardando…" : "Agregar cargo"}
        </Button>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Confirmar
// ---------------------------------------------------------------------------

export function ConfirmarSheet({ order, open, onClose, onSaved }: SheetProps) {
  const [entrega, setEntrega] = useEntrega(order, open);
  const [deposit, setDeposit] = useState(
    order.securityDeposit ? String(order.securityDeposit) : "",
  );
  const [invoice, setInvoice] = useState(order.physicalInvoiceNumber ?? "");
  const [attempted, setAttempted] = useState(false);
  const { busy, error, run } = useAction(onSaved, onClose);

  const addressError = attempted ? entregaAddressError(entrega) : null;
  const articles = order.totals.linesAfterDiscount;
  const freight =
    entrega.fulfilment === "delivery" && entrega.cost.trim() !== ""
      ? Number(entrega.cost)
      : 0;

  return (
    <Sheet open={open} onClose={onClose} title="Confirmar solicitud">
      <div className="flex flex-col gap-6 overflow-y-auto px-5 pb-8">
        {/* What she is about to confirm, so she never confirms blind. */}
        <div className="rounded-lg border border-rule bg-paper p-4">
          <p className="text-base font-semibold text-ink">{order.customerName}</p>
          <p className="type-mono mt-0.5 text-sm text-stone-text">
            {order.lines.length === 1
              ? "1 artículo"
              : `${order.lines.length} artículos`}
            {" · "}
            {order.billedDays === 1 ? "1 día" : `${order.billedDays} días`}
          </p>
          <dl className="mt-3 flex flex-col gap-1 border-t border-rule pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-stone-text">Artículos</dt>
              <dd className="type-mono text-ink tabular-nums">{money(articles)}</dd>
            </div>
            {freight > 0 && (
              <div className="flex justify-between">
                <dt className="text-stone-text">Envío</dt>
                <dd className="type-mono text-ink tabular-nums">{money(freight)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-rule pt-1">
              <dt className="font-semibold text-ink">Total</dt>
              <dd className="type-mono font-semibold text-ink tabular-nums">
                {money(articles + freight)}
              </dd>
            </div>
          </dl>
        </div>

        <section className="flex flex-col gap-3">
          <h3 className="type-label text-stone-text">Entrega</h3>
          <EntregaFields
            state={entrega}
            set={setEntrega}
            addressError={addressError}
          />
        </section>

        <section className="flex flex-col gap-4">
          <h3 className="type-label text-stone-text">Cobro</h3>
          <Field label="Depósito de garantía" htmlFor="conf-deposito" optional>
            <Input
              id="conf-deposito"
              type="number"
              inputMode="decimal"
              min={0}
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
            />
          </Field>

          <Field label="N.º de factura membretada" htmlFor="conf-factura" optional>
            <Input
              id="conf-factura"
              value={invoice}
              onChange={(e) => setInvoice(e.target.value)}
            />
          </Field>
        </section>

        <ErrorNote message={error} />

        <Button
          size="lg"
          full
          disabled={busy}
          onClick={() => {
            setAttempted(true);
            if (entregaAddressError(entrega)) return;
            run(async () => {
              // Set delivery first so the order is already carrying the right
              // freight the instant it becomes a confirmed order.
              const d = await setDelivery(order.id, entregaInput(entrega));
              if (!d.ok) return d;
              return confirmOrder(order.id, {
                securityDeposit: deposit ? Number(deposit) : null,
                physicalInvoiceNumber: invoice.trim() || null,
              });
            });
          }}
        >
          {busy ? "Confirmando…" : "Confirmar pedido"}
        </Button>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Cancelar
// ---------------------------------------------------------------------------

export function CancelarSheet({ order, open, onClose, onSaved }: SheetProps) {
  const [reason, setReason] = useState("");
  const { busy, error, run } = useAction(onSaved, onClose);

  return (
    <Sheet open={open} onClose={onClose} title="Cancelar pedido">
      <div className="flex flex-col gap-5 overflow-y-auto px-5 pb-8">
        <p className="text-base text-stone-text">
          El pedido no se borra: queda guardado como cancelado, con el motivo.
        </p>

        <Field label="Motivo" htmlFor="cancelar-motivo">
          <Textarea
            id="cancelar-motivo"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
          />
        </Field>

        <ErrorNote message={error} />

        <Button
          size="lg"
          full
          variant="secondary"
          disabled={busy || reason.trim().length === 0}
          onClick={() => run(() => cancelOrder(order.id, reason.trim()))}
        >
          {busy ? "Cancelando…" : "Cancelar este pedido"}
        </Button>
      </div>
    </Sheet>
  );
}
