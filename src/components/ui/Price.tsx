import { moneyAmount } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * The site's aesthetic risk, in one component.
 *
 * The córdoba figure is set larger and heavier than the product name it sits
 * under. The brief names price transparency as a feature and "how much will
 * this cost me" as one of the visitor's two real questions — so the number
 * carries the page, and the imperfect photo only has to support it.
 */

type Props = {
  amount: number;
  size?: "sm" | "md" | "lg";
  /** "por 24 horas" — the rental unit, and the thing customers misread most. */
  unit?: boolean;
  /** "c/u", "el juego" — what one unit of the price buys. */
  per?: string;
  className?: string;
  tone?: "ink" | "onInk";
};

const SIZES = {
  sm: "text-xl",
  md: "text-3xl",
  lg: "text-4xl",
} as const;

export function Price({
  amount,
  size = "md",
  unit = true,
  per,
  className,
  tone = "ink",
}: Props) {
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <p
        className={cn(
          "type-display tabular-nums",
          SIZES[size],
          tone === "onInk" ? "text-white" : "text-ink",
        )}
      >
        {/* The symbol sits smaller and raised, so the digits stay the loudest
            thing in the block. */}
        <span className="mr-1 align-super text-[0.52em] font-bold tracking-normal">
          C$
        </span>
        {moneyAmount(amount)}
      </p>
      {(unit || per) && (
        <p
          className={cn(
            "type-label",
            tone === "onInk" ? "text-ink-muted" : "text-stone-text",
          )}
        >
          {unit ? "por 24 horas" : null}
          {unit && per ? " · " : null}
          {per}
        </p>
      )}
    </div>
  );
}
