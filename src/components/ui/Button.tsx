import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "brand" | "quiet" | "onInk";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  // The action colour. White on mamey is 5.0:1.
  primary:
    "bg-mamey text-white border-transparent hover:bg-mamey-dark active:bg-mamey-dark",
  secondary:
    "bg-transparent text-ink border-ink/25 hover:border-ink/50 hover:bg-ink/[0.04]",
  brand:
    "bg-green text-white border-transparent hover:bg-green-dark active:bg-green-dark",
  quiet:
    "bg-paper text-ink border-rule hover:border-rule-strong hover:bg-paper-warm",
  onInk:
    "bg-white/10 text-white border-white/25 hover:bg-white/16 hover:border-white/40",
};

// Every size clears the 48px tap target except `sm`, which is only used where
// there is generous space around it. The base font never drops below 15px.
const SIZES: Record<Size, string> = {
  sm: "min-h-11 px-4 text-sm gap-1.5",
  md: "min-h-13 px-5 text-base gap-2",
  lg: "min-h-15 px-7 text-lg gap-2.5",
};

const BASE = cn(
  "inline-flex items-center justify-center rounded-md border font-semibold",
  "cursor-pointer select-none text-center",
  "transition-[background-color,border-color,transform,color] duration-fast ease-out",
  "active:scale-[0.97]",
  "disabled:pointer-events-none disabled:opacity-45",
);

type CommonProps = {
  variant?: Variant;
  size?: Size;
  full?: boolean;
  children: ReactNode;
  className?: string;
};

type ButtonAsButton = CommonProps &
  Omit<ComponentProps<"button">, keyof CommonProps> & { href?: never };

type ButtonAsLink = CommonProps &
  Omit<ComponentProps<typeof Link>, keyof CommonProps | "href"> & {
    href: string;
  };

export function Button(props: ButtonAsButton | ButtonAsLink) {
  const {
    variant = "primary",
    size = "md",
    full = false,
    className,
    children,
    ...rest
  } = props;

  const classes = cn(
    BASE,
    VARIANTS[variant],
    SIZES[size],
    full && "w-full",
    className,
  );

  if ("href" in rest && rest.href !== undefined) {
    const { href, ...linkProps } = rest as ButtonAsLink;
    const external = href.startsWith("http") || href.startsWith("tel:");

    if (external) {
      return (
        <a
          href={href}
          className={classes}
          target={href.startsWith("http") ? "_blank" : undefined}
          rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
          {...(linkProps as ComponentProps<"a">)}
        >
          {children}
        </a>
      );
    }

    return (
      <Link href={href} className={classes} {...linkProps}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} {...(rest as ComponentProps<"button">)}>
      {children}
    </button>
  );
}
