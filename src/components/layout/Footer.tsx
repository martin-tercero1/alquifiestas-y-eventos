import Link from "next/link";
import { business, whatsappLink, whatsappMessages } from "@/lib/business";
import { getCategories } from "@/lib/catalog";
import { Container } from "./Container";
import { Wordmark } from "./Wordmark";
import {
  ClockIcon,
  FacebookIcon,
  InstagramIcon,
  PinIcon,
  WhatsAppIcon,
} from "@/components/ui/icons";

export async function Footer() {
  // Only categories that actually have something bookable in them — no empty
  // shelves in the navigation while prices are still being entered.
  const categories = await getCategories();

  return (
    // No top margin: every page supplies its own bottom padding, and a margin
    // here would cut a light stripe between a dark CTA band and this footer.
    <footer className="on-ink bg-ink text-white">
      <Container className="py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <Wordmark tone="onInk" />
            <p className="mt-4 max-w-xs text-base text-ink-muted">
              Alquiler de artículos para fiestas y eventos. {business.yearsInBusiness}{" "}
              años atendiendo San Marcos y todo Carazo.
            </p>
            <p className="type-label mt-5 text-white">{business.tagline}</p>
          </div>

          <div>
            <h2 className="type-label text-ink-muted">Catálogo</h2>
            <ul className="mt-4 flex flex-col gap-3">
              {categories.map((category) => (
                <li key={category.slug}>
                  <Link
                    href={`/catalogo/${category.slug}`}
                    className="text-base text-white/85 underline-offset-4 hover:text-white hover:underline"
                  >
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="type-label text-ink-muted">Dónde estamos</h2>
            <address className="mt-4 flex flex-col gap-4 not-italic">
              <p className="flex gap-3 text-base text-white/85">
                <PinIcon className="mt-0.5 size-5 shrink-0 text-ink-muted" />
                <span>
                  {business.address.street}
                  <br />
                  {business.address.town}, {business.address.department}
                </span>
              </p>
              <p className="flex gap-3 text-base text-white/85">
                <ClockIcon className="mt-0.5 size-5 shrink-0 text-ink-muted" />
                <span>
                  {business.hours.map((h) => (
                    <span key={h.days} className="block">
                      {h.days}: {h.time}
                    </span>
                  ))}
                </span>
              </p>
            </address>
          </div>

          <div>
            <h2 className="type-label text-ink-muted">Escribinos</h2>
            <ul className="mt-4 flex flex-col gap-3">
              <li>
                <a
                  href={whatsappLink(whatsappMessages.general)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-3 text-base text-white/85 underline-offset-4 hover:text-white hover:underline"
                >
                  <WhatsAppIcon className="size-5 shrink-0 text-ink-muted" />
                  {business.whatsapp.display}
                </a>
              </li>
              <li>
                <a
                  href={business.social.instagram.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-3 text-base text-white/85 underline-offset-4 hover:text-white hover:underline"
                >
                  <InstagramIcon className="size-5 shrink-0 text-ink-muted" />
                  {business.social.instagram.display}
                </a>
              </li>
              <li>
                <a
                  href={business.social.facebook.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-3 text-base text-white/85 underline-offset-4 hover:text-white hover:underline"
                >
                  <FacebookIcon className="size-5 shrink-0 text-ink-muted" />
                  {business.social.facebook.display}
                </a>
              </li>
            </ul>

            <p className="mt-6 text-sm text-ink-muted">
              No cobramos en línea. El pago se coordina con nosotros, en efectivo
              o por transferencia.
            </p>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="type-mono text-xs text-ink-muted">
            © {new Date().getFullYear()} Alquifiestas y Eventos · San Marcos,
            Carazo, Nicaragua
          </p>
          <p className="type-mono text-xs text-ink-muted">
            Precios por 24 horas, sujetos a disponibilidad.
          </p>
        </div>

        <p className="type-mono mt-4 text-center text-xs text-ink-muted">
          Desarrollado por{" "}
          <a
            href="https://martin-tercero.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/85 underline-offset-4 hover:text-white hover:underline"
          >
            Martin Tercero
          </a>
        </p>
      </Container>
    </footer>
  );
}
