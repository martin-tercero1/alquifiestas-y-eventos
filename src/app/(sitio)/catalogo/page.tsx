import type { Metadata } from "next";
import Link from "next/link";
import { getCategories, getProducts, fromPriceOf } from "@/lib/catalog";
import { money } from "@/lib/format";
import { Container } from "@/components/layout/Container";
import { ProductCard } from "@/components/catalog/ProductCard";
import { ArrowIcon } from "@/components/ui/icons";

export const metadata: Metadata = {
  title: "Catálogo",
  description:
    "Sillas, mesas, mantelería, cristalería, decoración y Caballo Bayo en alquiler. Precios en córdobas por 24 horas.",
};

// The catalog changes when staff edit it, not on every request.
export const revalidate = 300;

export default async function CatalogPage() {
  const [categories, products] = await Promise.all([
    getCategories(),
    getProducts(),
  ]);

  return (
    <>
      <section className="pt-10 pb-8 sm:pt-14">
        <Container>
          <p className="type-label text-green">Catálogo completo</p>
          <h1 className="type-display mt-4 max-w-3xl text-[clamp(1.875rem,6vw,3.5rem)] text-ink uppercase">
            {products.length} artículos, con su precio
          </h1>
          <p className="mt-5 max-w-xl text-lg text-stone-text">
            Todos los precios son por 24 horas y están en córdobas. Agregá lo
            que necesités a la hoja y te va sumando el total.
          </p>
        </Container>
      </section>

      {categories.length === 0 ? (
        <section className="pb-20">
          <Container>
            <div className="rounded-xl border border-rule bg-paper p-8 text-center">
              <p className="type-label text-stone-text">Catálogo en preparación</p>
              <p className="mx-auto mt-3 max-w-md text-base text-stone-text">
                Estamos terminando de subir los precios. Mientras tanto,
                escribinos por WhatsApp y te cotizamos lo que ocupés.
              </p>
            </div>
          </Container>
        </section>
      ) : (
        <>
          {/* Category jump list — on a 360px screen this scrolls sideways
              rather than wrapping into four cramped rows. */}
          <div className="sticky top-[73px] z-20 border-y border-rule bg-limewash/95 backdrop-blur-sm">
            <Container className="flex gap-2 overflow-x-auto py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {categories.map((category) => (
                <a
                  key={category.slug}
                  href={`#${category.slug}`}
                  className="type-label shrink-0 rounded-full border border-rule bg-paper px-4 py-2.5 whitespace-nowrap text-stone-text transition-colors duration-fast ease-out hover:border-rule-strong hover:text-ink"
                >
                  {category.name}
                </a>
              ))}
            </Container>
          </div>

          {categories.map((category) => {
            // Subcategories roll up to their parent in the listing, so
            // "Cristalería" shows its copas, vasos, platos and cubiertos too.
            const shown = products.filter((p) =>
              p.categorySlug.startsWith(category.slug),
            );
            const from = fromPriceOf(shown);

            if (shown.length === 0) return null;

            return (
              <section
                key={category.slug}
                id={category.slug}
                className="scroll-mt-36 py-12 sm:py-16"
              >
                <Container>
                  <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ink/15 pb-4">
                    <h2 className="type-display text-2xl text-ink sm:text-3xl">
                      {category.name}
                    </h2>
                    <p className="type-mono text-sm text-stone-text">
                      {shown.length} artículos
                      {from !== null ? ` · desde ${money(from)}` : ""}
                    </p>
                  </div>

                  <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
                    {shown.map((product, index) => (
                      <ProductCard
                        key={product.productId}
                        product={product}
                        index={index}
                      />
                    ))}
                  </div>

                  <Link
                    href={`/catalogo/${category.slug}`}
                    className="mt-6 inline-flex items-center gap-2 text-base font-semibold text-mamey-text underline-offset-4 hover:underline"
                  >
                    Ver solo {category.name.toLowerCase()}
                    <ArrowIcon className="size-4" />
                  </Link>
                </Container>
              </section>
            );
          })}
        </>
      )}
    </>
  );
}
