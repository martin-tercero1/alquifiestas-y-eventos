import type { Metadata } from "next";
import { Container } from "@/components/layout/Container";
import { RequestFlow } from "./RequestFlow";

export const metadata: Metadata = {
  title: "Solicitar reserva",
  description:
    "Mandanos tu solicitud de alquiler con la fecha de tu evento. Te confirmamos disponibilidad y coordinamos el pago en efectivo o por transferencia.",
};

export default function RequestPage() {
  return (
    <section className="pt-10 pb-20 sm:pt-14">
      <Container size="narrow">
        <RequestFlow />
      </Container>
    </section>
  );
}
