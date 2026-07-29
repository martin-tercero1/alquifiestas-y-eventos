import { cn } from "@/lib/cn";

/**
 * "La vitrina" — the photography treatment.
 *
 * The image library is WhatsApp photos: uneven light, bad framing, mixed
 * ratios, busy backgrounds. This component doesn't filter them, it contains
 * them, with four rules that apply everywhere without exception:
 *
 *   1. Two ratios only — 1:1 for grids, 4:5 for detail. Never anything else.
 *   2. Always matted. The photo sits inset in a paper card with real padding
 *      and never bleeds to the card edge or the page edge. The mat is what
 *      makes a badly framed shot read as chosen rather than as a mistake.
 *   3. A shared grain, so different phones stop looking like different sources.
 *   4. A 6% temperature wash — never a duotone, because someone choosing a
 *      tablecloth is choosing the actual colour.
 *
 * The aspect-ratio box reserves layout before the image arrives, so nothing
 * shifts on a slow connection.
 *
 * NOTE: uses a plain <img> because the current placeholders are SVG and
 * next/image would need `dangerouslyAllowSVG` to serve them. When the owners'
 * real JPEGs land, swap the <img> here for next/image — this is the only file
 * that needs to change.
 */

type Props = {
  /** null when the product has no photo yet — a common, expected state. */
  src: string | null;
  alt: string;
  /** 1:1 for grids and thumbnails, 4:5 for the item detail page. */
  ratio?: "square" | "portrait";
  /** The mat. Off only when the frame is already inside another card. */
  mat?: boolean;
  /** Above the fold — skips lazy loading. Use sparingly. */
  priority?: boolean;
  /** Thumbnail-sized: the "Foto pendiente" caption would clip, so drop it. */
  compact?: boolean;
  className?: string;
  imageClassName?: string;
};

export function PhotoFrame({
  src,
  alt,
  ratio = "square",
  mat = true,
  priority = false,
  compact = false,
  className,
  imageClassName,
}: Props) {
  return (
    <div
      className={cn(
        mat && "rounded-lg border border-rule bg-paper p-2",
        className,
      )}
    >
      <div
        className={cn(
          "grain temper relative overflow-hidden rounded-sm bg-stone",
          ratio === "square" ? "aspect-square" : "aspect-4/5",
        )}
      >
        {src ? (
          <img
            src={src}
            alt={alt}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            fetchPriority={priority ? "high" : "auto"}
            className={cn(
              "absolute inset-0 size-full object-cover",
              imageClassName,
            )}
          />
        ) : (
          /* Many of the old Odoo images are not publicly reachable, so a
             missing photo is normal rather than an error. It gets the design
             system's own placeholder and is queued for staff to upload. */
          <span className="absolute inset-0 grid place-items-center px-2 text-center">
            {compact ? (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="size-5 text-white/70"
              >
                <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h1.2l.9-1.4A1 1 0 0 1 8.5 5h7a1 1 0 0 1 .9.6l.9 1.4h1.2A1.5 1.5 0 0 1 20 8.5v8A1.5 1.5 0 0 1 18.5 18h-13A1.5 1.5 0 0 1 4 16.5Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            ) : (
              <span className="type-label text-white/70">Foto pendiente</span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
