import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProduct, getProductsByCategory } from "@/lib/catalog";
import { money } from "@/lib/format";
import { Container } from "@/components/layout/Container";
import { ProductCard } from "@/components/catalog/ProductCard";
import { ProductView } from "./ProductView";

type Params = { params: Promise<{ categoria: string; articulo: string }> };

// Rendered per request so a catalog edit in the panel shows immediately (see the
// category page for the full rationale).
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { articulo } = await params;
  const product = await getProduct(articulo);
  if (!product) return {};

  return {
    title: `${product.name} — ${money(product.fromPrice)} por 24 horas`,
    description: `${product.name} en alquiler en San Marcos, Carazo. Desde ${money(
      product.fromPrice,
    )} por 24 horas.`,
  };
}

export default async function ProductPage({ params }: Params) {
  const { categoria, articulo } = await params;
  const product = await getProduct(articulo);
  if (!product) notFound();

  const siblings = (await getProductsByCategory(categoria))
    .filter((p) => p.productId !== product.productId)
    .slice(0, 4);

  return (
    <>
      <section className="pt-8 pb-12 sm:pt-10">
        <Container>
          <nav aria-label="Migas de pan" className="type-mono text-sm">
            <Link
              href="/catalogo"
              className="text-stone-text underline-offset-4 hover:text-ink hover:underline"
            >
              Catálogo
            </Link>
            <span className="mx-2 text-rule-strong">/</span>
            <Link
              href={`/catalogo/${product.categorySlug}`}
              className="text-stone-text underline-offset-4 hover:text-ink hover:underline"
            >
              {product.categoryName}
            </Link>
          </nav>

          <ProductView product={product} />
        </Container>
      </section>

      {siblings.length > 0 && (
        <section className="border-t border-rule py-14">
          <Container>
            <h2 className="type-display text-2xl text-ink">
              También de {product.categoryName.toLowerCase()}
            </h2>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
              {siblings.map((sibling, index) => (
                <ProductCard
                  key={sibling.productId}
                  product={sibling}
                  index={index}
                />
              ))}
            </div>
          </Container>
        </section>
      )}
    </>
  );
}
