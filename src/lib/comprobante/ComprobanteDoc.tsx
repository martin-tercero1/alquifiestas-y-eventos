import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import { longDate, shortTime, moneyAmount } from "@/lib/format";
import {
  COMPROBANTE_CHARGE_LABEL,
  type Comprobante,
  type ComprobanteSnapshot,
} from "./types";

/**
 * The comprobante PDF (Brief 04 §9).
 *
 * A non-fiscal internal document — a discreet notice in the footer says so. The
 * pre-printed facturas membretadas remain the legal document; this is the
 * customer's receipt and the business's internal control. It is laid out the way
 * the fiscal version will be, so that when DGI authorization arrives the change
 * is dropping the footer notice and turning it on for staff, not a redesign.
 *
 * It renders only from the frozen snapshot the database wrote at issue time, so
 * two people printing the same comprobante number always get an identical page.
 *
 * Money everywhere is whole córdobas. The source can carry halves (only ever
 * from a percentage discount); we round each shown figure and derive the Total
 * from those rounded parts, so the printed arithmetic always foots to the last
 * córdoba even when the exact stored total ends in .50.
 */

// The brand, muted for print. Uses the same green/mamey as the panel so the
// document reads as the same business, but on white for toner economy.
const INK = "#1c2321";
const STONE = "#5b635f";
const GREEN = "#186b57";
const MAMEY = "#c7401f";
const RULE = "#d9ddd6";
const PAPER = "#f4f2ec";

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 56,
    paddingHorizontal: 44,
    fontSize: 9.5,
    fontFamily: "Helvetica",
    color: INK,
    lineHeight: 1.4,
  },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  bizName: { fontSize: 15, fontFamily: "Helvetica-Bold", color: GREEN },
  bizLine: { fontSize: 8.5, color: STONE, marginTop: 2 },
  docBox: { alignItems: "flex-end" },
  docTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", letterSpacing: 1 },
  docNumber: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: INK,
    lineHeight: 1,
    marginTop: 3,
    marginBottom: 6,
  },
  docMeta: { fontSize: 8.5, color: STONE, lineHeight: 1.3 },

  // Two-column info strip
  strip: { flexDirection: "row", marginTop: 18, gap: 18 },
  stripCol: { flex: 1 },
  label: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: STONE,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  strong: { fontFamily: "Helvetica-Bold" },
  metaGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 14, gap: 0 },
  metaCell: { width: "25%", marginBottom: 8 },

  // Lines table
  table: { marginTop: 20 },
  thead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: INK,
    paddingBottom: 4,
  },
  th: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: STONE, textTransform: "uppercase", letterSpacing: 0.6 },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: RULE,
    paddingVertical: 5,
    alignItems: "flex-start",
  },
  cArt: { flex: 1, paddingRight: 8 },
  cQty: { width: 46, textAlign: "right" },
  cPrice: { width: 66, textAlign: "right" },
  cAmount: { width: 74, textAlign: "right" },
  artName: { fontSize: 9.5 },
  artSub: { fontSize: 8, color: STONE, marginTop: 1 },
  num: { fontSize: 9.5 },

  // Totals
  totalsWrap: { flexDirection: "row", justifyContent: "flex-end", marginTop: 14 },
  totals: { width: 240 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  totalLabel: { fontSize: 9.5, color: STONE },
  totalValue: { fontSize: 9.5 },
  grandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: INK,
    marginTop: 4,
    paddingTop: 5,
  },
  grandLabel: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  grandValue: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  balanceValue: { fontSize: 11, fontFamily: "Helvetica-Bold", color: MAMEY },
  depositNote: { fontSize: 8, color: STONE, marginTop: 8, textAlign: "right" },

  notes: {
    marginTop: 18,
    backgroundColor: PAPER,
    borderRadius: 4,
    padding: 8,
    fontSize: 8.5,
  },

  // Company policies (mirrors the terms printed on the physical factura).
  policies: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: RULE,
    paddingTop: 8,
  },
  policiesTitle: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: STONE,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 5,
  },
  policyItem: { flexDirection: "row", marginBottom: 3 },
  policyNum: {
    width: 14,
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: STONE,
  },
  policyText: { flex: 1, fontSize: 7.5, color: INK, lineHeight: 1.35 },
  policyStrong: { fontFamily: "Helvetica-Bold" },

  // Footer, pinned
  footer: {
    position: "absolute",
    bottom: 26,
    left: 44,
    right: 44,
    borderTopWidth: 1,
    borderTopColor: RULE,
    paddingTop: 6,
  },
  footerText: { fontSize: 7.5, color: STONE, textAlign: "center" },
});

const c$ = (n: number) => `C$ ${moneyAmount(n)}`;

// Company policies, mirrored from the pre-printed factura and lightly edited for
// grammar/clarity (meaning unchanged). The last item stays fully uppercase for
// emphasis, as on the physical document.
const RENTAL_POLICIES: readonly string[] = [
  "Toda factura debe cancelarse antes del evento; como mínimo se debe abonar el 50% para reservar.",
  "El arreglo del local y el desmontaje de los artículos en el mismo son responsabilidad del cliente.",
  "El cliente deberá revisar cada uno de los artículos al momento de RECIBIRLOS y ENTREGARLOS, haciéndose responsable de su buen estado mientras estén en su poder.",
  "Todo daño (quemadura; mancha de grasa, parafina o tinta; artículo faltante; quebradura o reventadura) deberá ser pagado por el cliente. No se aceptan artículos distintos a los de nuestro inventario.",
  "La cristalería se entrega limpia y debe devolverse limpia; de lo contrario, se cobrará el servicio de limpieza.",
  "El contrato de alquiler es por 24 horas. Si el cliente retiene los artículos por más tiempo del establecido, deberá pagar por cada día de retraso en la entrega.",
  "Si el evento se cancela por cualquier motivo, se cobrará el 30% del total de la factura. Cualquier cambio al pedido deberá solicitarse con al menos 3 semanas de anticipación.",
  "El depósito se retiene como garantía y se aplica a cubrir daños, faltantes o mora; el saldo se devuelve tras la revisión de los artículos al momento de la entrega.",
  "UNA VEZ ENTREGADO EL ALQUILER, NO SE ACEPTAN DEVOLUCIONES DE NINGÚN TIPO.",
];

export type ComprobanteBusiness = {
  legalName: string;
  ruc: string;
  addressLine: string;
  /** The business has no landline; WhatsApp is the real contact channel. */
  whatsapp: string;
};

function lineName(l: ComprobanteSnapshot["lines"][number]): string {
  return l.variantLabel ? `${l.productName} — ${l.variantLabel}` : l.productName;
}

export function ComprobanteDoc({
  comprobante,
  business,
}: {
  comprobante: Comprobante;
  business: ComprobanteBusiness;
}) {
  const { snapshot } = comprobante;
  const { order, customer, lines, charges, totals } = snapshot;

  // Round for display, then derive the Total from the rounded parts so the page
  // foots exactly even when a percentage discount left a half-córdoba behind.
  const subtotal = lines.reduce((s, l) => s + Math.round(l.lineTotal), 0);
  const net = Math.round(totals.linesAfterDiscount);
  const discount = subtotal - net;
  const delivery = Math.round(totals.deliveryCost);
  const chargesTotal = Math.round(totals.chargesTotal);
  const grandTotal = net + delivery + chargesTotal;
  const paid = Math.round(totals.totalPaid);
  const balance = grandTotal - paid;
  const deposit = Math.round(totals.depositHeld);

  const multiDay = order.billedDays > 1;

  return (
    <Document
      title={`Comprobante ${comprobante.number} · Pedido ${order.number}`}
      author={business.legalName}
    >
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.bizName}>{business.legalName}</Text>
            <Text style={styles.bizLine}>RUC: {business.ruc}</Text>
            <Text style={styles.bizLine}>{business.addressLine}</Text>
            <Text style={styles.bizLine}>WhatsApp: {business.whatsapp}</Text>
          </View>
          <View style={styles.docBox}>
            <Text style={styles.docTitle}>COMPROBANTE</Text>
            <Text style={styles.docNumber}>
              N° {String(comprobante.number).padStart(6, "0")}
            </Text>
            <Text style={styles.docMeta}>
              Emitido {longDate(comprobante.issuedAt.slice(0, 10))}
            </Text>
            <Text style={styles.docMeta}>Pedido #{order.number}</Text>
          </View>
        </View>

        {/*
          The prominent non-fiscal banner that used to sit here was removed at
          the owner's request — too disruptive on the page. The discreet notice
          in the footer ("Comprobante interno sin valor fiscal") now carries the
          disclaimer on its own. Kept here for reference, in case the fuller
          wording is ever needed again:

            Title: "Comprobante interno — no es un documento fiscal"
            Body:  "No sustituye a la factura membretada, que es el documento
                    fiscal válido. Sirve como constancia para el cliente y
                    control del negocio."
        */}

        {/* Customer */}
        <View style={styles.strip}>
          <View style={styles.stripCol}>
            <Text style={styles.label}>Cliente</Text>
            <Text style={styles.strong}>{customer.name}</Text>
            {customer.cedula && <Text>Cédula: {customer.cedula}</Text>}
            {customer.ruc && <Text>RUC: {customer.ruc}</Text>}
            {customer.phone && <Text>Tel: {customer.phone}</Text>}
          </View>
          <View style={styles.stripCol}>
            <Text style={styles.label}>Entrega</Text>
            <Text>
              {order.fulfilment === "delivery"
                ? "A domicilio"
                : "Retira en el local"}
            </Text>
            {order.fulfilment === "delivery" && order.deliveryAddress && (
              <Text style={{ color: STONE, marginTop: 1 }}>
                {order.deliveryAddress}
              </Text>
            )}
          </View>
        </View>

        {/* Order meta grid */}
        <View style={styles.metaGrid}>
          <View style={styles.metaCell}>
            <Text style={styles.label}>Sale</Text>
            <Text>{longDate(order.pickupDate)}</Text>
            {order.pickupTime && (
              <Text style={{ color: STONE }}>{shortTime(order.pickupTime)}</Text>
            )}
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.label}>Regresa</Text>
            <Text>{longDate(order.agreedReturnDate)}</Text>
            {order.agreedReturnTime && (
              <Text style={{ color: STONE }}>
                {shortTime(order.agreedReturnTime)}
              </Text>
            )}
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.label}>Días facturados</Text>
            <Text>{order.billedDays}</Text>
          </View>
          {order.physicalInvoiceNumber && (
            <View style={styles.metaCell}>
              <Text style={styles.label}>Factura membretada</Text>
              <Text>{order.physicalInvoiceNumber}</Text>
            </View>
          )}
        </View>

        {/* Lines */}
        <View style={styles.table}>
          <View style={styles.thead}>
            <Text style={[styles.th, styles.cArt]}>Artículo</Text>
            <Text style={[styles.th, styles.cQty]}>Cant.</Text>
            <Text style={[styles.th, styles.cPrice]}>
              {multiDay ? "P. × día" : "Precio"}
            </Text>
            <Text style={[styles.th, styles.cAmount]}>Importe</Text>
          </View>
          {lines.map((l, i) => (
            <View style={styles.row} key={i} wrap={false}>
              <View style={styles.cArt}>
                <Text style={styles.artName}>{lineName(l)}</Text>
                {l.optionChoice && (
                  <Text style={styles.artSub}>{l.optionChoice}</Text>
                )}
                {multiDay && (
                  <Text style={styles.artSub}>
                    {c$(l.unitPrice)} × {l.quantity} × {order.billedDays} días
                    {l.discounted ? " · con descuento" : ""}
                  </Text>
                )}
                {!multiDay && l.discounted && (
                  <Text style={styles.artSub}>con descuento</Text>
                )}
              </View>
              <Text style={[styles.num, styles.cQty]}>{l.quantity}</Text>
              <Text style={[styles.num, styles.cPrice]}>{c$(l.unitPrice)}</Text>
              <Text style={[styles.num, styles.cAmount]}>
                {c$(Math.round(l.lineTotal))}
              </Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totalsWrap}>
          <View style={styles.totals}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>{c$(subtotal)}</Text>
            </View>
            {discount > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Descuento</Text>
                <Text style={styles.totalValue}>− {c$(discount)}</Text>
              </View>
            )}
            {delivery > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Envío</Text>
                <Text style={styles.totalValue}>{c$(delivery)}</Text>
              </View>
            )}
            {chargesTotal > 0 &&
              charges.map((ch, i) => (
                <View style={styles.totalRow} key={i}>
                  <Text style={styles.totalLabel}>
                    {COMPROBANTE_CHARGE_LABEL[ch.kind]}
                    {ch.description ? ` · ${ch.description}` : ""}
                  </Text>
                  <Text style={styles.totalValue}>{c$(Math.round(ch.amount))}</Text>
                </View>
              ))}
            <View style={styles.grandRow}>
              <Text style={styles.grandLabel}>Total</Text>
              <Text style={styles.grandValue}>{c$(grandTotal)}</Text>
            </View>
            {paid > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Pagado</Text>
                <Text style={styles.totalValue}>− {c$(paid)}</Text>
              </View>
            )}
            <View style={styles.grandRow}>
              <Text style={styles.grandLabel}>Saldo</Text>
              <Text style={balance > 0 ? styles.balanceValue : styles.grandValue}>
                {c$(balance)}
              </Text>
            </View>
          </View>
        </View>

        {deposit > 0 && (
          <Text style={styles.depositNote}>
            Más {c$(deposit)} de depósito, que se devuelve al regresar todo.
          </Text>
        )}

        {/* Company policies */}
        <View style={styles.policies} wrap={false}>
          <Text style={styles.policiesTitle}>Políticas de la empresa</Text>
          {RENTAL_POLICIES.map((policy, i) => (
            <View style={styles.policyItem} key={i} wrap={false}>
              <Text style={styles.policyNum}>{i + 1}.</Text>
              <Text
                style={[
                  styles.policyText,
                  i === RENTAL_POLICIES.length - 1 ? styles.policyStrong : {},
                ]}
              >
                {policy}
              </Text>
            </View>
          ))}
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {business.legalName} · Comprobante interno sin valor fiscal · Gracias
            por su preferencia.
          </Text>
        </View>
      </Page>
    </Document>
  );
}
