import Link from "next/link";
import { getCategories, getProducts, fromPriceOf } from "@/lib/catalog";
import { business, whatsappLink, whatsappMessages } from "@/lib/business";
import { money } from "@/lib/format";
import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/Button";
import { ArrowIcon, WhatsAppIcon } from "@/components/ui/icons";
import { VitrinaWall } from "@/components/catalog/VitrinaWall";

export const revalidate = 300;

export default async function HomePage() {
  const [categories, products] = await Promise.all([
    getCategories(),
    getProducts(),
  ]);

  return (
    <>
      {/* ---- Hero -------------------------------------------------------
          The largest-contentful element is text on a flat ground, not a
          photograph. On a slow connection the headline is already painted
          before a single image has started downloading. */}
      <section className="pt-12 pb-14 sm:pt-20 sm:pb-20">
        <Container>
          <p className="type-label text-green">
            San Marcos, Carazo · Alquiler para eventos
          </p>

          <h1 className="type-display mt-5 max-w-4xl text-[clamp(2rem,8vw,4.5rem)] text-ink uppercase">
            Por una noche, tu patio se vuelve salón.
          </h1>

          <p className="mt-6 max-w-xl text-lg text-stone-text">
            Sillas, mesas, mantelería, cristalería y decoración en alquiler.
            Precios por 24 horas, a la vista, sin tener que preguntar.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button href="/catalogo" size="lg" className="sm:min-w-56">
              Ver el catálogo
              <ArrowIcon className="size-4" />
            </Button>
            <Button
              href={whatsappLink(whatsappMessages.general)}
              variant="secondary"
              size="lg"
            >
              <WhatsAppIcon className="size-5" />
              Escribinos por WhatsApp
            </Button>
          </div>

          <p className="type-mono mt-8 max-w-md text-sm text-stone-text">
            {business.yearsInBusiness} años en el mismo lugar:{" "}
            {business.address.street}, {business.address.town}.
          </p>
        </Container>
      </section>

      {products.length > 0 && (
        <section className="pb-16 sm:pb-20">
          <Container>
            <VitrinaWall products={products} total={products.length} />
          </Container>
        </section>
      )}

      {/* ---- Categories, as a price list --------------------------------
          Not a grid of pretty tiles: a tarifario. Every row leads with what
          it costs, because that is the question the visitor came with. */}
      {categories.length > 0 && (
        <section className="border-t border-rule py-16 sm:py-20">
          <Container>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="type-label text-green">Catálogo</p>
                <h2 className="type-display mt-3 text-3xl text-ink sm:text-4xl">
                  Todo lo que alquilamos
                </h2>
              </div>
              <Link
                href="/catalogo"
                className="inline-flex items-center gap-2 text-base font-semibold text-mamey-text underline-offset-4 hover:underline"
              >
                Ver los {products.length} artículos
                <ArrowIcon className="size-4" />
              </Link>
            </div>

            <ul className="mt-8 border-t border-ink/15">
              {categories.map((category) => {
                const from = fromPriceOf(
                  products.filter((p) =>
                    p.categorySlug.startsWith(category.slug),
                  ),
                );

                return (
                  <li key={category.slug}>
                    <Link
                      href={`/catalogo/${category.slug}`}
                      className="group block border-b border-rule py-5 transition-colors duration-fast ease-out hover:bg-paper"
                    >
                      <div className="flex items-baseline justify-between gap-4">
                        <h3 className="type-display text-xl text-ink group-hover:text-mamey-text sm:text-2xl">
                          {category.name}
                        </h3>

                        {from !== null && (
                          <p className="flex shrink-0 items-baseline gap-2">
                            <span className="type-label text-stone-text">
                              Desde
                            </span>
                            <span className="type-display text-xl tabular-nums text-ink sm:text-2xl">
                              {money(from)}
                            </span>
                          </p>
                        )}
                      </div>

                      <p className="type-mono mt-1 text-xs text-stone-text">
                        {category.productCount} artículos
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Container>
        </section>
      )}

      {/* ---- How it works ----------------------------------------------
          Numbered because it genuinely is a sequence: the order carries
          information the visitor needs. */}
      <section className="border-t border-rule py-16 sm:py-20">
        <Container>
          <p className="type-label text-green">Cómo funciona</p>
          <h2 className="type-display mt-3 text-3xl text-ink sm:text-4xl">
            De la hoja a tu fiesta
          </h2>

          <ol className="mt-10 grid gap-8 sm:grid-cols-3">
            {[
              {
                title: "Armá tu hoja",
                body: "Agregá lo que necesitás y las cantidades. El total se va sumando mientras elegís, para que no te lleves sorpresas.",
              },
              {
                title: "Mandanos la solicitud",
                body: "Por el sitio o por WhatsApp, con la fecha de tu evento. Te confirmamos qué hay disponible ese día.",
              },
              {
                title: "Retirás o te lo llevamos",
                body: "Retirar en el local no tiene costo. Si querés entrega a domicilio, te la cotizamos según dónde sea.",
              },
            ].map((step, index) => (
              <li key={step.title} className="flex flex-col gap-3">
                <span className="type-mono text-2xl tabular-nums text-mamey-text">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="text-xl font-semibold text-ink">{step.title}</h3>
                <p className="text-base text-stone-text">{step.body}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      {/* ---- What to know before asking ---------------------------------- */}
      <section className="pb-16 sm:pb-20">
        <Container>
          <div className="rounded-xl border border-rule bg-paper p-6 sm:p-8">
            <h2 className="type-display text-2xl text-ink">
              Lo que conviene saber
            </h2>
            <dl className="mt-6 grid gap-6 sm:grid-cols-2">
              {[
                {
                  term: "El precio es por 24 horas",
                  detail:
                    "Si lo necesitás más días, se multiplica: el precio de un día por la cantidad de días.",
                },
                {
                  term: "Para apartar la fecha",
                  detail:
                    "Muchos clientes dejan un anticipo, normalmente la mitad. No es obligatorio, pero asegura tu fecha.",
                },
                {
                  term: "Depósito de garantía",
                  detail:
                    "En algunos artículos pedimos un depósito que se devuelve completo cuando regresás todo en orden.",
                },
                {
                  term: "No cobramos en línea",
                  detail:
                    "El pago es en efectivo o por transferencia, coordinado con nosotros después de la solicitud.",
                },
              ].map((fact) => (
                <div key={fact.term}>
                  <dt className="text-base font-semibold text-ink">
                    {fact.term}
                  </dt>
                  <dd className="mt-1 text-base text-stone-text">
                    {fact.detail}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </Container>
      </section>

      {/* ---- WhatsApp ---------------------------------------------------
          Many visitors will never fill in the form. That is fine — this is
          the channel the business actually runs on. */}
      <section className="on-ink bg-ink py-16 sm:py-20">
        <Container>
          <div className="flex flex-col items-start gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl">
              <h2 className="type-display text-3xl text-white sm:text-4xl">
                ¿Preferís preguntarnos directo?
              </h2>
              <p className="mt-4 text-lg text-ink-muted">
                Escribinos por WhatsApp y te decimos qué hay libre para tu
                fecha. Contestamos nosotros mismos, no es un robot.
              </p>
            </div>

            <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
              <Button
                href={whatsappLink(whatsappMessages.general)}
                size="lg"
                className="sm:min-w-56"
              >
                <WhatsAppIcon className="size-5" />
                {business.whatsapp.display}
              </Button>
              <Button href="/contacto" variant="onInk" size="lg">
                Cómo llegar
              </Button>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
