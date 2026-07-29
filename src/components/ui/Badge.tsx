import { cn } from "@/lib/cn";

type Variant = "neutral" | "scarce" | "brand" | "onInk";

const VARIANTS: Record<Variant, string> = {
  neutral: "bg-limewash text-stone-text border-rule",
  /** Only two of these exist. Saying so is useful information, not urgency. */
  scarce: "bg-mamey-tint text-mamey-text border-mamey/25",
  brand: "bg-green-tint text-green-dark border-green/25",
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
    <span
      className={cn(
        "type-label inline-flex items-center rounded-full border px-2.5 py-1",
        VARIANTS[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
