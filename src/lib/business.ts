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
