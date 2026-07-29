import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/Button";
import { whatsappLink, whatsappMessages } from "@/lib/business";
import { WhatsAppIcon } from "@/components/ui/icons";

export default function NotFound() {
  return (
    <section className="py-20 sm:py-28">
      <Container size="narrow">
        <p className="type-label text-green">Error 404</p>
        <h1 className="type-display mt-4 text-[clamp(1.875rem,7vw,3.5rem)] text-ink uppercase">
          Esta página no existe
        </h1>
        <p className="mt-5 max-w-lg text-lg text-stone-text">
          Puede que el enlace esté viejo o que hayamos movido algo de lugar. El
          catálogo completo sigue donde siempre.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button href="/catalogo" size="lg">
            Ver el catálogo
          </Button>
          <Button
            href={whatsappLink(whatsappMessages.general)}
            variant="secondary"
            size="lg"
          >
            <WhatsAppIcon className="size-5" />
            Preguntar por WhatsApp
          </Button>
        </div>
      </Container>
    </section>
  );
}
