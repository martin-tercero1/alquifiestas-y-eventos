import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { HojaProvider } from "@/components/hoja/HojaProvider";
import { LaHoja } from "@/components/hoja/LaHoja";

/**
 * The public site's chrome.
 *
 * This used to live in the root layout, which meant the admin panel rendered
 * inside the customer-facing header, footer and la hoja — the shop's WhatsApp
 * button sitting above the staff login. `(sitio)` is a route group, so it adds
 * nothing to any URL; it just draws the line between the two products that
 * share this codebase.
 *
 * The root layout keeps what genuinely is global: html, body, fonts, tokens.
 */
export default function SitioLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <HojaProvider>
      <a
        href="#contenido"
        className="sr-only rounded-md bg-ink px-4 py-3 font-semibold text-white focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
      >
        Saltar al contenido
      </a>
      <Header />
      <main id="contenido" className="flex-1">
        {children}
      </main>
      <Footer />
      <LaHoja />
    </HojaProvider>
  );
}
