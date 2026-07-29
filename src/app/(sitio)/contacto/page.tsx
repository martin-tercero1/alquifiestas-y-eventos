import type { Metadata } from "next";
import { business, whatsappLink, whatsappMessages } from "@/lib/business";
import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/Button";
import { ClockIcon, PhoneIcon, PinIcon, WhatsAppIcon } from "@/components/ui/icons";
import { Croquis } from "./Croquis";

export const metadata: Metadata = {
  title: "Contacto y cómo llegar",
  description:
    "Estamos en San Marcos, Carazo: de la Iglesia Católica 75 metros al sur, frente al CSE. Horarios, teléfono y WhatsApp.",
};

export default function ContactPage() {
  return (
    <>
      <section className="pt-10 pb-12 sm:pt-14">
        <Container>
          <p className="type-label text-green">Contacto</p>
          <h1 className="type-display mt-4 max-w-3xl text-[clamp(1.875rem,7vw,3.5rem)] text-ink uppercase">
            Estamos donde siempre
          </h1>
          <p className="mt-5 max-w-xl text-lg text-stone-text">
            En el mismo lugar desde hace {business.yearsInBusiness} años. Podés
            venir a ver los artículos antes de decidir — mucha gente lo hace y
            nos parece bien.
          </p>
        </Container>
      </section>

      <section className="pb-16">
        <Container>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
            {/* Nicaraguan addresses are given from landmarks, so the map is a
                croquis: church, distance, us, and what's across the street. */}
            <div>
              <h2 className="type-label text-stone-text">Cómo llegar</h2>
              <Croquis className="mt-4" />
              <Button
                href={business.address.mapsUrl}
                variant="secondary"
                full
                className="mt-4"
              >
                Abrir en Google Maps
              </Button>
            </div>

            <div className="flex flex-col gap-8">
              <div>
                <h2 className="type-label text-stone-text">Dirección</h2>
                <address className="mt-3 flex gap-3 not-italic">
                  <PinIcon className="mt-1 size-5 shrink-0 text-green" />
                  <p className="text-lg text-ink">
                    {business.address.street}
                    <br />
                    {business.address.town}, {business.address.department},{" "}
                    {business.address.country}
                  </p>
                </address>
              </div>

              <div>
                <h2 className="type-label text-stone-text">Horarios</h2>
                <ul className="mt-3 flex flex-col gap-2">
                  {business.hours.map((entry) => (
                    <li
                      key={entry.days}
                      className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule py-2"
                    >
                      <span className="flex items-center gap-3 text-base text-ink">
                        <ClockIcon className="size-5 shrink-0 text-stone-text" />
                        {entry.days}
                      </span>
                      <span className="type-mono text-base text-stone-text">
                        {entry.time}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h2 className="type-label text-stone-text">Escribinos o llamanos</h2>
                <div className="mt-4 flex flex-col gap-3">
                  <Button
                    href={whatsappLink(whatsappMessages.general)}
                    size="lg"
                    full
                  >
                    <WhatsAppIcon className="size-5" />
                    WhatsApp {business.whatsapp.display}
                  </Button>
                  <Button
                    href={`tel:${business.phone.number}`}
                    variant="secondary"
                    size="lg"
                    full
                  >
                    <PhoneIcon className="size-5" />
                    Llamar al {business.phone.display}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      <section className="pb-20">
        <Container>
          <div className="rounded-xl border border-rule bg-paper p-6 sm:p-8">
            <h2 className="type-display text-2xl text-ink">
              Antes de venir, dos cosas
            </h2>
            <dl className="mt-6 grid gap-6 sm:grid-cols-2">
              <div>
                <dt className="text-base font-semibold text-ink">
                  Traé la fecha de tu evento
                </dt>
                <dd className="mt-1 text-base text-stone-text">
                  Con la fecha en mano te decimos al momento qué está libre y
                  qué ya está comprometido para ese día.
                </dd>
              </div>
              <div>
                <dt className="text-base font-semibold text-ink">
                  El pago es aquí, no en línea
                </dt>
                <dd className="mt-1 text-base text-stone-text">
                  Efectivo o transferencia. Si dejás anticipo para apartar la
                  fecha, te damos su comprobante.
                </dd>
              </div>
            </dl>
          </div>
        </Container>
      </section>
    </>
  );
}
