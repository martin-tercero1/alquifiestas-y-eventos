"use client";

import { useState } from "react";
import Link from "next/link";
import { business, whatsappLink, whatsappMessages } from "@/lib/business";
import { longDate, money, shortDate, dayCount, itemCount } from "@/lib/format";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Field, Input, OptionCard, Textarea } from "@/components/ui/Field";
import { CedulaField } from "@/components/ui/CedulaField";
import { CheckIcon, WhatsAppIcon } from "@/components/ui/icons";
import { useHoja, returnDate } from "@/components/hoja/HojaProvider";
import { HojaTable } from "@/components/hoja/HojaTable";
import { DateControls } from "@/components/hoja/DateControls";

/**
 * The reservation request.
 *
 * Runs a real availability check and writes a real order in status
 * `pending_request` — the check and the write share one database transaction,
 * so a booking cannot slip between them.
 *
 * It still sets the expectation the business operates on: this is a REQUEST,
 * not a confirmed booking, and nobody pays online.
 *
 * The three steps are numbered because this genuinely is a sequence.
 */

type Delivery = "retiro" | "entrega";
type Payment = "efectivo" | "transferencia";

/** A shortage the availability engine reported. Data, not an exception. */
type Shortage = {
  variant_id: string;
  product_name: string;
  variant_label: string | null;
  requested: number;
  available: number | null;
  is_unknown: boolean;
};

type SubmitResult = {
  ok: boolean;
  error?: string;
  shortages?: Shortage[];
  order_number: number;
};

/** Every failure says what happened and what to do about it. */
const ERROR_MESSAGES: Record<string, string> = {
  empty_request: "Tu hoja está vacía. Agregá al menos un artículo.",
  invalid_days: "El alquiler tiene que ser de al menos un día.",
  pickup_in_past: "La fecha del evento ya pasó. Elegí una fecha de hoy en adelante.",
  delivery_needs_address:
    "Nos falta la dirección para poder cotizarte la entrega.",
  default:
    "No pudimos mandar la solicitud. Probá de nuevo o escribinos por WhatsApp.",
};

type Errors = Partial<
  Record<"eventDate" | "name" | "phone" | "address", string>
>;

const STEPS = ["Tu pedido", "Entrega", "Tus datos"] as const;

export function RequestFlow() {
  const hoja = useHoja();
  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  const [delivery, setDelivery] = useState<Delivery>("retiro");
  const [payment, setPayment] = useState<Payment>("efectivo");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [cedula, setCedula] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  // Snapshot of the sheet at the moment of sending, so the confirmation keeps
  // showing what was requested even if the visitor edits the sheet after.
  const [receipt, setReceipt] = useState<{
    lines: { name: string; quantity: number; amount: number }[];
    total: number;
    eventDate: string;
    days: number;
    orderNumber: number;
  } | null>(null);

  const [submitting, setSubmitting] = useState(false);
  /** Shortages come back from the availability check as data, not exceptions. */
  const [shortages, setShortages] = useState<Shortage[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (!hoja.ready) {
    return <div className="min-h-96" aria-busy="true" />;
  }

  if (submitted && receipt) {
    return <Confirmation receipt={receipt} delivery={delivery} payment={payment} name={name} />;
  }

  if (hoja.resolved.length === 0) {
    return (
      <div className="py-10">
        <h1 className="type-display text-3xl text-ink uppercase sm:text-4xl">
          Todavía no hay nada en tu hoja
        </h1>
        <p className="mt-4 max-w-lg text-lg text-stone-text">
          Para mandarnos una solicitud necesitamos saber qué ocupás. Andá al
          catálogo, agregá los artículos con sus cantidades y volvé acá.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button href="/catalogo" size="lg">
            Ver el catálogo
          </Button>
          <Button
            href={whatsappLink(whatsappMessages.general)}
            variant="secondary"
            size="lg"
          >
            <WhatsAppIcon className="size-5" />
            Preguntar por WhatsApp
          </Button>
        </div>
      </div>
    );
  }

  function validate(current: number): boolean {
    const next: Errors = {};

    if (current === 0 && !hoja.eventDate) {
      next.eventDate = "Poné la fecha de tu evento para poder revisarte la disponibilidad.";
    }
    if (current === 1 && delivery === "entrega" && address.trim().length < 6) {
      next.address =
        "Escribinos la dirección con alguna referencia, para poder cotizarte la entrega.";
    }
    if (current === 2) {
      if (name.trim().length < 3) next.name = "Escribí tu nombre completo.";
      if (phone.replace(/\D/g, "").length < 8)
        next.phone = "Necesitamos un número de 8 dígitos para poder contactarte.";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function goNext() {
    if (!validate(step)) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goBack() {
    setErrors({});
    setStep((s) => Math.max(s - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate(2)) return;

    setSubmitting(true);
    setShortages([]);
    setSubmitError(null);

    // The availability check and the write happen inside one database
    // transaction, so two people booking the same chairs at the same moment —
    // one here, one standing at the counter — cannot both succeed.
    const { data, error } = await supabase.rpc("submit_reservation_request", {
      p_customer_name: name.trim(),
      p_customer_phone: phone.replace(/\s+/g, ""),
      p_pickup_date: hoja.eventDate!,
      p_days: hoja.days,
      p_fulfilment: delivery === "retiro" ? "pickup" : "delivery",
      p_payment_method: payment === "efectivo" ? "cash" : "transfer",
      p_lines: hoja.resolved.map((l) => ({
        variant_id: l.variantId,
        quantity: l.quantity,
      })),
      p_delivery_address: delivery === "entrega" ? address.trim() : null,
      p_notes: notes.trim() || null,
      p_cedula: cedula.trim() || null,
    });

    setSubmitting(false);

    if (error) {
      setSubmitError(
        "No pudimos mandar la solicitud. Revisá tu conexión y probá de nuevo, o escribinos por WhatsApp.",
      );
      return;
    }

    const result = data as SubmitResult;

    if (!result?.ok) {
      if (result?.error === "unavailable" && result.shortages) {
        setShortages(result.shortages);
        setStep(0);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      setSubmitError(ERROR_MESSAGES[result?.error ?? ""] ?? ERROR_MESSAGES.default);
      return;
    }

    setReceipt({
      lines: hoja.resolved.map((l) => ({
        name: l.name,
        quantity: l.quantity,
        amount: l.perDay * hoja.days,
      })),
      total: hoja.total,
      eventDate: hoja.eventDate!,
      days: hoja.days,
      orderNumber: result.order_number,
    });
    setSubmitted(true);
    hoja.clear();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div>
      <h1 className="type-display text-[clamp(1.75rem,6vw,3rem)] text-ink uppercase">
        Solicitar reserva
      </h1>
      <p className="mt-4 max-w-lg text-lg text-stone-text">
        Esto es una solicitud, no una reserva confirmada. La revisamos, te
        decimos qué hay disponible para tu fecha y ahí lo cerramos.
      </p>

      <ol className="mt-8 flex gap-2">
        {STEPS.map((label, index) => (
          <li key={label} className="flex-1">
            <div
              className={cn(
                "h-1 rounded-full transition-colors duration-mid ease-out",
                index <= step ? "bg-mamey" : "bg-rule",
              )}
            />
            <p
              className={cn(
                "type-label mt-2",
                index === step ? "text-ink" : "text-stone-text",
              )}
            >
              <span className="tabular-nums">{index + 1}.</span> {label}
            </p>
          </li>
        ))}
      </ol>

      <form onSubmit={submit} className="mt-10" noValidate>
        {step === 0 && (
          <fieldset>
            {/* A shortage is explained, never scolded. The engine tells us how
                many are free; the customer decides what to do about it. */}
            {shortages.length > 0 && (
              <div
                role="alert"
                className="mb-6 rounded-xl border border-mamey/30 bg-mamey-tint p-5"
              >
                <h2 className="text-lg font-semibold text-mamey-text">
                  Para esas fechas no tenemos todo lo que pediste
                </h2>
                <ul className="mt-3 flex flex-col gap-2">
                  {shortages.map((s) => (
                    <li key={s.variant_id} className="text-base text-ink">
                      <span className="font-semibold">
                        {s.product_name}
                        {s.variant_label ? ` — ${s.variant_label}` : ""}
                      </span>
                      :{" "}
                      {s.available === 0
                        ? "no nos queda ninguno libre"
                        : `solo tenemos ${s.available}, y pediste ${s.requested}`}
                      .
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-sm text-stone-text">
                  Bajá las cantidades o cambiá la fecha. Si lo ocupás sí o sí,
                  escribinos por WhatsApp — a veces conseguimos prestado.
                </p>
              </div>
            )}

            <legend className="type-display text-2xl text-ink">
              Lo que llevás
            </legend>
            <p className="mt-2 text-base text-stone-text">
              Podés cambiar las cantidades acá mismo.
            </p>

            <div className="mt-6 rounded-xl border border-rule bg-paper p-4 sm:p-6">
              <HojaTable />
            </div>

            <div className="mt-8">
              <DateControls layout="row" />
              {errors.eventDate && (
                <p role="alert" className="mt-3 text-sm font-medium text-mamey-text">
                  {errors.eventDate}
                </p>
              )}
            </div>
          </fieldset>
        )}

        {step === 1 && (
          <fieldset>
            <legend className="type-display text-2xl text-ink">
              ¿Cómo lo recibís?
            </legend>

            <div className="mt-6 flex flex-col gap-3">
              <OptionCard
                name="entrega"
                value="retiro"
                checked={delivery === "retiro"}
                onChange={(v) => setDelivery(v as Delivery)}
                title="Retiro en el local"
                detail="Sin costo. Pasás por San Marcos el día que acordemos."
                note={`${business.address.street}, ${business.address.town}.`}
              />
              <OptionCard
                name="entrega"
                value="entrega"
                checked={delivery === "entrega"}
                onChange={(v) => setDelivery(v as Delivery)}
                title="Entrega a domicilio"
                detail="Con costo adicional. Lo cotizamos según dónde sea."
                note="El costo de entrega no está incluido en el total: te lo confirmamos antes de cerrar."
              />
            </div>

            {delivery === "entrega" && (
              <Field
                label="¿Dónde lo entregamos?"
                htmlFor="direccion"
                hint="Dirección y alguna referencia, para cotizarte el flete."
                error={errors.address}
                className="mt-6"
              >
                <Textarea
                  id="direccion"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Ej.: Jinotepe, del parque central 2 cuadras al norte, casa de portón verde."
                  aria-invalid={Boolean(errors.address)}
                  aria-describedby={errors.address ? "direccion-error" : undefined}
                />
              </Field>
            )}
          </fieldset>
        )}

        {step === 2 && (
          <fieldset>
            <legend className="type-display text-2xl text-ink">
              ¿Con quién coordinamos?
            </legend>

            <div className="mt-6 flex flex-col gap-6">
              <Field label="Tu nombre" htmlFor="nombre" error={errors.name}>
                <Input
                  id="nombre"
                  value={name}
                  autoComplete="name"
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nombre y apellido"
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={errors.name ? "nombre-error" : undefined}
                />
              </Field>

              <Field
                label="Tu WhatsApp"
                htmlFor="telefono"
                hint="Por ahí te confirmamos la disponibilidad."
                error={errors.phone}
              >
                <Input
                  id="telefono"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="8888 8888"
                  aria-invalid={Boolean(errors.phone)}
                  aria-describedby={errors.phone ? "telefono-error" : undefined}
                />
              </Field>

              <CedulaField
                id="cedula"
                value={cedula}
                onChange={setCedula}
                hint="Podés adelantárnosla para agilizar el retiro. La pedimos en físico ese día."
              />

              <div>
                <p className="text-base font-semibold text-ink">
                  ¿Cómo vas a pagar?
                </p>
                <p className="mt-1 mb-3 text-sm text-stone-text">
                  No se cobra nada en línea. Esto es solo para saber cómo
                  coordinamos.
                </p>
                <div className="flex flex-col gap-3">
                  <OptionCard
                    name="pago"
                    value="efectivo"
                    checked={payment === "efectivo"}
                    onChange={(v) => setPayment(v as Payment)}
                    title="Efectivo"
                    detail="Pagás cuando retirás o cuando entregamos."
                  />
                  <OptionCard
                    name="pago"
                    value="transferencia"
                    checked={payment === "transferencia"}
                    onChange={(v) => setPayment(v as Payment)}
                    title="Transferencia bancaria"
                    detail="Te pasamos los datos de la cuenta al confirmar."
                  />
                </div>

                {payment === "transferencia" && (
                  <div className="mt-4 rounded-lg border border-rule bg-paper p-4">
                    <p className="type-label text-stone-text">
                      Cuentas para depositar
                    </p>
                    <ul className="mt-3 flex flex-col gap-3">
                      {business.bankAccounts.map((account) => (
                        <li key={account.bank}>
                          <p className="text-base font-semibold text-ink">
                            {account.bank}
                          </p>
                          <p className="type-mono text-sm text-stone-text">
                            {account.account} · {account.currency} ·{" "}
                            {account.holder}
                          </p>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-sm text-stone-text">
                      Mandanos el comprobante por WhatsApp cuando hagás el
                      depósito.
                    </p>
                  </div>
                )}
              </div>

              <Field
                label="¿Algo más que debamos saber?"
                htmlFor="notas"
                optional
                hint="Hora del evento, colores de mantelería, lo que sea."
              >
                <Textarea
                  id="notas"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ej.: el evento empieza a las 4, ocupamos los manteles color vino."
                />
              </Field>
            </div>
          </fieldset>
        )}

        {/* Step 1 already ends with the sheet's own total — repeating it here
            would be two identical figures stacked. */}
        {step > 0 && <Summary />}

        {submitError && (
          <p
            role="alert"
            className="mt-6 rounded-lg border border-mamey/30 bg-mamey-tint p-4 text-base font-medium text-mamey-text"
          >
            {submitError}
          </p>
        )}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row-reverse">
          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={goNext} size="lg" className="sm:min-w-48">
              Continuar
            </Button>
          ) : (
            <Button
              type="submit"
              size="lg"
              className="sm:min-w-48"
              disabled={submitting}
            >
              {submitting ? "Mandando…" : "Mandar la solicitud"}
            </Button>
          )}

          {step > 0 && (
            <Button type="button" onClick={goBack} variant="secondary" size="lg">
              Regresar
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

/** The total travels with the visitor through every step. */
function Summary() {
  const { total, days, eventDate, itemCount: items } = useHoja();

  return (
    <aside className="mt-8 rounded-xl border border-ink/15 bg-green-tint p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="type-label text-green-dark">Total estimado</p>
          <p className="type-display mt-1 text-3xl tabular-nums text-ink">
            {money(total)}
          </p>
          <p className="type-mono mt-1 text-xs text-stone-text">
            {itemCount(items)} · {dayCount(days)}
            {eventDate ? ` · retiro ${shortDate(eventDate)}` : ""}
          </p>
        </div>
        <p className="max-w-xs text-sm text-stone-text">
          No incluye entrega ni depósito de garantía. Si aplican, te los
          confirmamos antes de cerrar.
        </p>
      </div>
    </aside>
  );
}

function Confirmation({
  receipt,
  delivery,
  payment,
  name,
}: {
  receipt: {
    lines: { name: string; quantity: number; amount: number }[];
    total: number;
    eventDate: string;
    days: number;
    orderNumber: number;
  };
  delivery: Delivery;
  payment: Payment;
  name: string;
}) {
  const summary = receipt.lines
    .map((l) => `${l.quantity} × ${l.name}`)
    .join("\n");

  return (
    <div className="py-6">
      <span className="grid size-14 place-items-center rounded-full bg-green text-white">
        <CheckIcon className="size-7" />
      </span>

      <h1 className="type-display mt-6 text-[clamp(1.75rem,6vw,3rem)] text-ink uppercase">
        Recibimos tu solicitud
      </h1>

      <p className="mt-4 max-w-xl text-lg text-stone-text">
        Gracias, {name.split(" ")[0] || "de nuevo"}. Quedó registrada con el número{" "}
        <span className="type-mono font-semibold text-ink">#{receipt.orderNumber}</span>.
        La revisamos y te
        escribimos por WhatsApp para confirmarte qué hay disponible para el{" "}
        <span className="font-semibold text-ink">
          {longDate(receipt.eventDate)}
        </span>
        . Normalmente contestamos el mismo día.
      </p>

      <div className="mt-8 rounded-xl border border-rule bg-paper p-5 sm:p-6">
        <p className="type-label text-stone-text">Lo que pediste</p>

        <ul className="mt-4">
          {receipt.lines.map((line) => (
            <li
              key={line.name}
              className="flex items-baseline justify-between gap-4 border-b border-rule py-3"
            >
              <span className="text-base text-ink">
                <span className="type-mono text-stone-text">
                  {line.quantity} ×{" "}
                </span>
                {line.name}
              </span>
              <span className="type-mono shrink-0 text-base text-ink">
                {money(line.amount)}
              </span>
            </li>
          ))}
        </ul>

        <dl className="mt-4 flex flex-col gap-2">
          <Row term="Retiro" detail={shortDate(receipt.eventDate)} />
          <Row
            term="Devolución"
            detail={shortDate(returnDate(receipt.eventDate, receipt.days))}
          />
          <Row
            term="Entrega"
            detail={
              delivery === "retiro"
                ? "Retirás en el local"
                : "A domicilio, costo por confirmar"
            }
          />
          <Row
            term="Pago"
            detail={payment === "efectivo" ? "Efectivo" : "Transferencia"}
          />
        </dl>

        <div className="mt-5 flex items-baseline justify-between border-t-2 border-ink pt-4">
          <span className="type-label text-ink">Total estimado</span>
          <span className="type-display text-2xl tabular-nums text-ink">
            {money(receipt.total)}
          </span>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button
          href={whatsappLink(whatsappMessages.quote(summary))}
          size="lg"
          className="sm:min-w-56"
        >
          <WhatsAppIcon className="size-5" />
          Escribirnos ahora
        </Button>
        <Button href="/catalogo" variant="secondary" size="lg">
          Seguir viendo el catálogo
        </Button>
      </div>

      <p className="mt-6 max-w-xl text-sm text-stone-text">
        Guardá esta pantalla o mandanos el mensaje por WhatsApp. Todavía no es
        una reserva: la fecha queda apartada cuando la confirmemos, y muchos
        clientes dejan un anticipo para asegurarla.{" "}
        <Link
          href="/contacto"
          className="font-semibold text-mamey-text underline underline-offset-4"
        >
          Cómo llegar al local
        </Link>
        .
      </p>
    </div>
  );
}

function Row({ term, detail }: { term: string; detail: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-sm text-stone-text">{term}</dt>
      <dd className="type-mono text-sm text-ink">{detail}</dd>
    </div>
  );
}
