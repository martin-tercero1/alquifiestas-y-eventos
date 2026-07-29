import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCategories, getProductsByCategory, fromPriceOf } from "@/lib/catalog";
import { money } from "@/lib/format";
import { whatsappLink, whatsappMessages } from "@/lib/business";
import { Container } from "@/components/layout/Container";
import { ProductCard } from "@/components/catalog/ProductCard";
import { Button } from "@/components/ui/Button";
import { ArrowIcon, WhatsAppIcon } from "@/components/ui/icons";

type Params = { params: Promise<{ categoria: string }> };

export const revalidate = 300;

export async function generateStaticParams() {
  const categories = await getCategories();
  return categories.map((category) => ({ categoria: category.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { categoria } = await params;
  const categories = await getCategories();
  const category = categories.find((c) => c.slug === categoria);
  if (!category) return {};

  return {
    title: `${category.name} en alquiler`,
    description: `${category.name} en alquiler en San Marcos, Carazo. Precios por 24 horas, a la vista.`,
  };
}

export default async function CategoryPage({ params }: Params) {
  const { categoria } = await params;
  const [categories, products] = await Promise.all([
    getCategories(),
    getProductsByCategory(categoria),
  ]);

  const category = categories.find((c) => c.slug === categoria);
  if (!category) notFound();

  const from = fromPriceOf(products);

  return (
    <>
      <section className="border-b border-rule pt-8 pb-10 sm:pt-12">
        <Container>
          <nav aria-label="Migas de pan" className="type-mono text-sm">
            <Link
              href="/catalogo"
              className="text-stone-text underline-offset-4 hover:text-ink hover:underline"
            >
              Catálogo
            </Link>
            <span className="mx-2 text-rule-strong">/</span>
            <span className="text-ink">{category.name}</span>
          </nav>

          <h1 className="type-display mt-5 text-[clamp(1.875rem,7vw,3.5rem)] text-ink uppercase">
            {category.name}
          </h1>
          <p className="type-mono mt-5 text-sm text-stone-text">
            {products.length} artículos
            {from !== null ? ` · desde ${money(from)} por 24 horas` : ""}
          </p>
        </Container>
      </section>

      <section className="py-10 sm:py-14">
        <Container>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
            {products.map((product, index) => (
              <ProductCard
                key={product.productId}
                product={product}
                index={index}
              />
            ))}
          </div>
        </Container>
      </section>

      <section className="pb-16">
        <Container>
          <div className="flex flex-col gap-6 rounded-xl border border-rule bg-paper p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div>
              <h2 className="type-display text-2xl text-ink">
                ¿No encontrás algo?
              </h2>
              <p className="mt-2 max-w-md text-base text-stone-text">
                Tenemos más cosas en bodega de las que alcanzamos a subir.
                Preguntanos y te decimos.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
              <Button href={whatsappLink(whatsappMessages.general)}>
                <WhatsAppIcon className="size-5" />
                Preguntar por WhatsApp
              </Button>
              <Button href="/catalogo" variant="secondary">
                Todo el catálogo
                <ArrowIcon className="size-4" />
              </Button>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
