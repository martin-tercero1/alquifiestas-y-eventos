import type { MetadataRoute } from "next";

/**
 * PWA manifest — so the panel installs to the parents' home screen and opens
 * like an app, not a browser tab (Brief 04 §6).
 *
 * `start_url` is the panel, because that is the app for the people who install
 * it: the mother taps the icon and lands on Hoy, already signed in thanks to
 * the long-lived session in proxy.ts. `display: standalone` drops the browser
 * chrome. Colours come straight from the design tokens so the splash and title
 * bar match the app the instant it opens.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Alquifiestas y Eventos",
    short_name: "Alquifiestas",
    description:
      "Panel de Alquifiestas y Eventos — pedidos, clientes e inventario.",
    start_url: "/panel",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#e8ebe4",
    theme_color: "#186b57",
    lang: "es-NI",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
