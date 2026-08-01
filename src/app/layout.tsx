import type { Metadata, Viewport } from "next";
import { Archivo, DM_Mono } from "next/font/google";
import "./globals.css";

/**
 * Archivo carries both roles. Its width axis gives the widened display face
 * used for headlines and prices, so that face costs no extra download — which
 * matters when the visitor is on a mid-range Android phone on mobile data.
 */
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
});

/** The utility face: counts, dates, item codes, the running tally. */
const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://alquifiestasyeventos.com"),
  title: {
    default:
      "Alquifiestas y Eventos — Alquiler para fiestas en San Marcos, Carazo",
    template: "%s · Alquifiestas y Eventos",
  },
  description:
    "Alquiler de sillas, mesas, mantelería, cristalería y decoración en San Marcos, Carazo. Precios por 24 horas, a la vista. Más de 20 años atendiendo la zona.",
  keywords: [
    "alquiler de sillas",
    "alquiler de mesas",
    "eventos San Marcos Carazo",
    "mantelería",
    "Caballo Bayo",
    "quinceañeras",
    "graduaciones",
    "Nicaragua",
  ],
  openGraph: {
    type: "website",
    locale: "es_NI",
    siteName: "Alquifiestas y Eventos",
    title: "Vos ponés el lugar, nosotros lo hacemos lucir",
    description:
      "Sillas, mesas, mantelería y decoración en alquiler en San Marcos, Carazo. Precios por 24 horas, a la vista.",
  },
  // Installed to the home screen (Brief 04 §6), the panel opens standalone with
  // its own title bar. The manifest carries the icons; this names the app on iOS.
  appleWebApp: {
    capable: true,
    title: "Alquifiestas",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#e8ebe4",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="es-NI"
      className={`${archivo.variable} ${dmMono.variable} h-full antialiased`}
    >
      {/*
        Only what is genuinely global: fonts, tokens, the document shell. The
        public site's header and footer live in `(sitio)/layout.tsx`, because
        the admin panel shares this document and must not inherit any of the
        customer-facing chrome.
      */}
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
