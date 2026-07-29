import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getProduct,
  getProducts,
  getProductsByCategory,
  photoUrl,
} from "@/lib/catalog";
import { money } from "@/lib/format";
import { whatsappLink, whatsappMessages } from "@/lib/business";
import { Container } from "@/components/layout/Container";
import { PhotoFrame } from "@/components/ui/PhotoFrame";
import { Button } from "@/components/ui/Button";
import { ProductCard } from "@/components/catalog/ProductCard";
import { WhatsAppIcon } from "@/components/ui/icons";
import { VariantPicker } from "./VariantPicker";

type Params = { params: Promise<{ categoria: string; articulo: string }> };

export const revalidate = 300;

export async function generateStaticParams() {
  const products = await getProducts();
  return products.map((product) => ({
    categoria: product.categorySlug,
    articulo: product.slug,
  }));
}

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

          <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-14">
            {/* The one place a photo is allowed to be large: the visitor has
                explicitly asked to see this thing. */}
            <PhotoFrame
              src={photoUrl(product.photoPortrait ?? product.photoSquare)}
              alt={`${product.name} — Alquifiestas y Eventos, San Marcos`}
              ratio="portrait"
              priority
              className="lg:sticky lg:top-28"
            />

            <div>
              <h1 className="type-display text-[clamp(1.75rem,6vw,3rem)] text-ink">
                {product.name}
              </h1>

              {product.description && (
                <p className="mt-4 text-lg text-stone-text">
                  {product.description}
                </p>
              )}

              <div className="mt-7">
                <VariantPicker variants={product.variants} />
              </div>

              <p className="mt-4">
                <Button
                  href={whatsappLink(whatsappMessages.item(product.name))}
                  variant="secondary"
                  full
                >
                  <WhatsAppIcon className="size-5" />
                  Consultar disponibilidad
                </Button>
              </p>
            </div>
          </div>
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
