import Link from "next/link";
import type { CatalogProduct } from "@/lib/catalog";
import { photoUrl } from "@/lib/catalog";
import { cn } from "@/lib/cn";

/**
 * The wall.
 *
 * The answer to the photography constraint isn't a filter, it's a decision
 * about scale: make the photos small and numerous instead of big and singular.
 * At 76px, uneven light and soft focus stop being visible and the grid itself
 * becomes the thing you look at. It also happens to be the truest picture of
 * the business — a warehouse full of many small countable things.
 *
 * Products still waiting on a photo get the design system's placeholder, same
 * as anywhere else. The wall renders nothing at all rather than a ragged row,
 * if there is not enough to fill it.
 */
export function VitrinaWall({
  products,
  total,
  className,
}: {
  products: CatalogProduct[];
  total: number;
  className?: string;
}) {
  const wall = products.slice(0, 12);
  if (wall.length < 4) return null;

  return (
    <div className={className}>
      <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-12">
        {wall.map((product, index) => {
          const src = photoUrl(product.photoSquare);
          return (
            <li key={product.productId}>
              <Link
                href={`/catalogo/${product.categorySlug}/${product.slug}`}
                title={product.name}
                className={cn(
                  "grain temper rise relative block aspect-square overflow-hidden rounded-sm bg-stone",
                  "outline-offset-2",
                  "transition-transform duration-fast ease-out hover:z-10 hover:scale-105",
                )}
                style={{ animationDelay: `${index * 35}ms` }}
              >
                {src && (
                  <img
                    src={src}
                    alt={product.name}
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 size-full object-cover"
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      <p className="type-mono mt-3 text-xs text-stone-text">
        {wall.length} de los {total} artículos que podés alquilar hoy.
      </p>
    </div>
  );
}
