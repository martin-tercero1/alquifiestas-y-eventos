"use client";

import { useState } from "react";
import { SheetIcon } from "@/components/ui/icons";

/**
 * "Enviar documento/comprobante" — the staff action that turns an order into a
 * PDF and hands it off (Brief 04 §9).
 *
 * On a phone it opens the native share sheet with the PDF already attached, so
 * she taps WhatsApp → the customer's chat (two taps, no WhatsApp API). Sending a
 * file straight to a specific number in one tap needs the WhatsApp Business API,
 * which is Brief 05 — this same PDF will flow through it then. On a desktop, or
 * anywhere the share sheet can't take a file, it opens the PDF in a new tab to
 * save or print.
 *
 * Available to every staff member: the page mounts it for anyone with a panel
 * session, and issue_comprobante is granted to the authenticated role.
 */

export function ComprobanteBoton({
  orderId,
  customerName,
}: {
  orderId: string;
  customerName: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const url = `/panel/pedidos/${orderId}/comprobante`;

  async function share() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(url, { headers: { accept: "application/pdf" } });
      if (!res.ok) {
        setError("No se pudo generar el documento. Probá otra vez.");
        return;
      }

      const blob = await res.blob();
      const filename =
        res.headers
          .get("content-disposition")
          ?.match(/filename="([^"]+)"/)?.[1] ?? "comprobante.pdf";
      const file = new File([blob], filename, { type: "application/pdf" });

      // Phone: hand the file to the OS share sheet (WhatsApp appears there).
      if (
        typeof navigator !== "undefined" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] })
      ) {
        try {
          await navigator.share({
            files: [file],
            title: "Comprobante",
            text: `Comprobante de ${customerName} · Alquifiestas y Eventos`,
          });
          return;
        } catch (e) {
          // The user dismissing the share sheet throws AbortError — that is not
          // an error worth showing. Anything else falls through to opening it.
          if (e instanceof DOMException && e.name === "AbortError") return;
        }
      }

      // Desktop / no file-share: open the PDF so she can save or print it.
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      // Give the new tab time to take the URL before revoking it.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch {
      setError("No se pudo generar el comprobante. Revisá la conexión.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={share}
        disabled={busy}
        className="flex min-h-13 w-full items-center justify-center gap-2 rounded-md border border-rule bg-paper px-4 text-base font-semibold text-ink transition-colors duration-fast ease-out hover:border-rule-strong disabled:opacity-45"
      >
        <SheetIcon className="h-5 w-5" />
        {busy ? "Preparando…" : "Enviar documento/comprobante"}
      </button>
      {error && (
        <p className="mt-2 text-sm font-medium text-mamey-text">{error}</p>
      )}
    </div>
  );
}
