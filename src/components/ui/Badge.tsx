import { cn } from "@/lib/cn";

type Variant = "neutral" | "scarce" | "brand" | "quote" | "onInk";

const VARIANTS: Record<Variant, string> = {
  neutral: "bg-limewash text-stone-text border-rule",
  /** Only two of these exist. Saying so is useful information, not urgency. */
  scarce: "bg-mamey-tint text-mamey-text border-mamey/25",
  brand: "bg-green-tint text-green-dark border-green/25",
  /** A quote reserves nothing yet — the dashed edge reads as "provisional". */
  quote: "bg-paper text-stone-text border-rule-strong border-dashed",
  onInk: "bg-white/10 text-white border-white/20",
};

export function Badge({
  children,
  variant = "neutral",
  className,
}: {
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
}) {
  return (
    // Plain sentence case at a real reading size, not the 2xs all-caps label
    // it used to be: a status a phone can read at a glance is the whole point.
    <span
      className={cn(
        "type-mono inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold leading-none",
        VARIANTS[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
