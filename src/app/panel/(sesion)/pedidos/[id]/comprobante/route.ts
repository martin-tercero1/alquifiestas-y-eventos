import { renderToBuffer } from "@react-pdf/renderer";
import { issueComprobante } from "@/lib/comprobante/issue";
import { ComprobanteDoc } from "@/lib/comprobante/ComprobanteDoc";
import { business } from "@/lib/business";

/**
 * GET /panel/pedidos/[id]/comprobante  →  the comprobante PDF (Brief 04 §9).
 *
 * A route handler, not a page: it produces a real application/pdf body so the
 * phone's share sheet can hand the file straight to WhatsApp, and the browser
 * can save or print it. Authorization is the database's job — issue_comprobante
 * is gated on is_tech_admin() — so a parent's session gets no_autorizado here,
 * which we turn into a 403. The PDF is rendered from the frozen snapshot, never
 * from the live order.
 */

// react-pdf renders with Node APIs (fontkit, streams); keep this off the edge.
export const runtime = "nodejs";
// Never cached: the comprobante is issued/looked up per request against the DB.
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const result = await issueComprobante(id);

  if (!result.ok) {
    const status = result.error === "no_autorizado" ? 403 : 404;
    const message =
      result.error === "no_autorizado"
        ? "Solo el administrador técnico puede generar el comprobante."
        : result.error === "pedido_inexistente"
          ? "No encontramos ese pedido."
          : "No se pudo generar el comprobante.";
    return new Response(message, {
      status,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const { comprobante } = result;

  const buffer = await renderToBuffer(
    ComprobanteDoc({
      comprobante,
      business: {
        legalName: business.fiscal.legalName,
        ruc: business.fiscal.ruc,
        addressLine: `${business.address.street}, ${business.address.town}, ${business.address.department}`,
        whatsapp: business.whatsapp.display,
      },
    }),
  );

  const filename = `comprobante-${String(comprobante.number).padStart(6, "0")}-pedido-${comprobante.snapshot.order.number}.pdf`;

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      // inline so it opens in a tab on desktop; the client fetch reads it as a
      // Blob for the share sheet on a phone.
      "content-disposition": `inline; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
