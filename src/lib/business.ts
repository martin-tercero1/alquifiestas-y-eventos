/**
 * Business constants.
 *
 * WhatsApp and the Maps pin are the owners' real details. The landline phone
 * and the bank-transfer accounts are still placeholders (marked TODO) and need
 * the real values before real customers use the transfer flow.
 */

export const business = {
  name: "Alquifiestas y Eventos",
  tagline: "#TuEventoDeSiempre",
  yearsInBusiness: 20,

  /**
   * Fiscal identity, printed on the comprobante (Brief 04 §9). The comprobante
   * is a non-fiscal internal document today; these fields exist so that when
   * DGI authorization eventually arrives, the layout already carries the RUC and
   * legal name and only the "no es documento fiscal" label has to come off.
   *
   * `ruc` is still a placeholder (like the bank accounts) — it must hold the
   * business's real RUC before a comprobante is ever shown to a customer.
   */
  fiscal: {
    /** Razón social — the name the RUC is registered under. */
    legalName: "Alquifiestas y Eventos",
    ruc: "TODO-RUC-DEL-NEGOCIO",
  },

  /** The business's real WhatsApp — used to build wa.me links. */
  whatsapp: {
    /** International format, digits only — used to build wa.me links. */
    number: "50585791770",
    display: "+505 8579 1770",
  },

  phone: {
    number: "50525350000",
    display: "+505 2535 0000",
  },

  address: {
    street: "De la Iglesia Católica, 75 metros al sur, frente al CSE",
    town: "San Marcos",
    department: "Carazo",
    country: "Nicaragua",
    mapsUrl: "https://maps.app.goo.gl/yVkBekTwzpGM1Ezi7",
    wazeUrl: "https://waze.com/ul/hd44ewru7b",
  },

  hours: [
    { days: "Lunes a viernes", time: "8:00 a. m. – 5:00 p. m." },
    { days: "Sábado", time: "8:00 a. m. – 4:00 p. m." },
    { days: "Domingo", time: "Solo con cita previa" },
  ],

  /** Shown to the customer when they choose bank transfer. */
  bankAccounts: [
    {
      bank: "BAC Credomatic",
      holder: "Alquifiestas y Eventos",
      account: "TODO-000000000",
      currency: "Córdobas",
    },
    {
      bank: "Banpro",
      holder: "Alquifiestas y Eventos",
      account: "TODO-000000000",
      currency: "Córdobas",
    },
  ],
} as const;

/** Opens WhatsApp with a message already written, so the visitor only taps send. */
export function whatsappLink(message: string): string {
  return `https://wa.me/${business.whatsapp.number}?text=${encodeURIComponent(message)}`;
}

export const whatsappMessages = {
  general: "¡Hola! Quiero consultar sobre alquiler para mi evento.",
  item: (itemName: string) =>
    `¡Hola! Quiero consultar la disponibilidad de: ${itemName}.`,
  quote: (summary: string) =>
    `¡Hola! Les paso lo que necesito para mi evento:\n\n${summary}`,
};
