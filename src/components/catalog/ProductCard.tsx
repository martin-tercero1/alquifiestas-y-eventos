import Link from "next/link";
import type { CatalogProduct } from "@/lib/catalog";
import { photoUrl } from "@/lib/catalog";
import { PhotoFrame } from "@/components/ui/PhotoFrame";
import { Price } from "@/components/ui/Price";
import { Badge } from "@/components/ui/Badge";
import { AddToHoja } from "@/components/hoja/AddToHoja";
import { cn } from "@/lib/cn";

/**
 * The catalog card.
 *
 * The card's own padding is the mat — the photo never reaches its edge. The
 * price is set larger and heavier than the name it sits under, which is the
 * argument of this design: if the number carries the card, the imperfect photo
 * only has to support it.
 *
 * A product with several bookable variants shows "desde C$…" and sends the
 * visitor to the detail page to choose. A product with one shows its price and
 * an add button, and never mentions variants at all.
 */
export function ProductCard({
  product,
  index = 0,
  className,
}: {
  product: CatalogProduct;
  /** Position in the grid, used only for the first-paint stagger. */
  index?: number;
  className?: string;
}) {
  const single = product.variants.length === 1 ? product.variants[0] : null;

  return (
    <article
      className={cn(
        "rise flex flex-col rounded-lg border border-rule bg-paper p-3",
        "transition-[border-color] duration-fast ease-out hover:border-rule-strong",
        className,
      )}
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <Link
        href={`/catalogo/${product.categorySlug}/${product.slug}`}
        className="group rounded-sm"
      >
        <PhotoFrame
          src={photoUrl(product.photoSquare)}
          alt={`${product.name} — Alquifiestas y Eventos`}
          mat={false}
          imageClassName="transition-transform duration-mid ease-out group-hover:scale-[1.03]"
        />

        <h3 className="mt-3 text-base leading-snug font-semibold text-ink group-hover:text-mamey-text">
          {product.name}
        </h3>
      </Link>

      <div className="mt-2 flex-1">
        <Price
          amount={product.fromPrice}
          per={single ? undefined : `desde · ${product.variants.length} opciones`}
        />
      </div>

      {single?.totalQuantity !== null &&
        single?.totalQuantity !== undefined &&
        single.totalQuantity <= 4 && (
          <p className="mt-3">
            <Badge variant="scarce">Solo {single.totalQuantity} disponibles</Badge>
          </p>
        )}

      <div className="mt-4">
        {single ? (
          <AddToHoja variant={single} />
        ) : (
          <Link
            href={`/catalogo/${product.categorySlug}/${product.slug}`}
            className={cn(
              "inline-flex min-h-13 w-full items-center justify-center rounded-md border border-rule bg-paper-warm px-5",
              "text-base font-semibold text-ink",
              "transition-[border-color,background-color,transform] duration-fast ease-out",
              "hover:border-rule-strong active:scale-[0.97]",
            )}
          >
            Elegir opción
          </Link>
        )}
      </div>
    </article>
  );
}
