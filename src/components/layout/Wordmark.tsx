import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * The wordmark.
 *
 * Set in the same widened Archivo as the headlines — the letterform of a
 * hand-painted rótulo, which is the signage this business already lives
 * inside. "y eventos" sits under it in the utility face, the way a painted
 * sign carries its second line smaller.
 */
export function Wordmark({
  tone = "ink",
  className,
}: {
  tone?: "ink" | "onInk";
  className?: string;
}) {
  return (
    <Link
      href="/"
      className={cn("group inline-flex flex-col leading-none", className)}
      aria-label="Alquifiestas y Eventos — inicio"
    >
      <span
        className={cn(
          "type-display text-xl transition-colors duration-fast ease-out",
          tone === "onInk"
            ? "text-white"
            : "text-ink group-hover:text-mamey-text",
        )}
      >
        ALQUIFIESTAS
      </span>
      <span
        className={cn(
          "type-label mt-0.5",
          tone === "onInk" ? "text-ink-muted" : "text-stone-text",
        )}
      >
        y eventos · San Marcos
      </span>
    </Link>
  );
}
