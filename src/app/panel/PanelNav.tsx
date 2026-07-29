"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import {
  PlusIcon,
  SheetIcon,
  ClockIcon,
  BoxIcon,
  UsersIcon,
} from "@/components/ui/icons";

/**
 * The bottom bar.
 *
 * Five destinations, no menu, no drawer — the whole panel is reachable in one
 * tap. "Nueva" is the only one in the action colour: it is the thing she does
 * twenty times a day, and everything else is where the day's other work lives.
 *
 * Salir is deliberately NOT here — a mis-tap on the bar used to log people out
 * mid-proforma. It moved to the Hoy header, off the thumb's path.
 */

const LINKS = [
  { href: "/panel", label: "Hoy", icon: ClockIcon, exact: true },
  { href: "/panel/pedidos", label: "Pedidos", icon: SheetIcon },
  { href: "/panel/nueva", label: "Nueva", icon: PlusIcon, primary: true },
  { href: "/panel/inventario", label: "Inventario", icon: BoxIcon },
  { href: "/panel/clientes", label: "Clientes", icon: UsersIcon },
];

export function PanelNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Panel"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-paper/95 backdrop-blur-sm"
    >
      <div className="mx-auto flex w-full max-w-2xl items-stretch gap-0.5 px-1 pb-[env(safe-area-inset-bottom)]">
        {LINKS.map(({ href, label, icon: Icon, exact, primary }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-16 flex-1 flex-col items-center justify-center gap-1 rounded-md px-0.5",
                "text-[11px] font-semibold transition-colors duration-fast ease-out",
                active
                  ? primary
                    ? "text-mamey-text"
                    : "text-green"
                  : "text-stone-text",
              )}
            >
              <Icon
                className={cn("h-6 w-6", primary && active && "scale-110")}
              />
              <span className="max-w-full truncate">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
