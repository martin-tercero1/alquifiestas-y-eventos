"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { whatsappLink, whatsappMessages } from "@/lib/business";
import { cn } from "@/lib/cn";
import { Container } from "./Container";
import { Wordmark } from "./Wordmark";
import { CloseIcon, MenuIcon, WhatsAppIcon } from "@/components/ui/icons";

const NAV = [
  { href: "/catalogo", label: "Catálogo" },
  { href: "/solicitar", label: "Solicitar reserva" },
  { href: "/contacto", label: "Contacto" },
];

export function Header() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Navigating is an answer to the menu — it should close itself.
  useEffect(() => setMenuOpen(false), [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-limewash/95 backdrop-blur-sm">
      <Container className="flex items-center justify-between gap-4 py-3">
        <Wordmark />

        <nav aria-label="Principal" className="hidden items-center gap-1 md:flex">
          {NAV.map((link) => {
            const active =
              pathname === link.href || pathname?.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-2 text-base font-medium",
                  "transition-colors duration-fast ease-out",
                  active
                    ? "text-ink underline decoration-mamey decoration-2 underline-offset-8"
                    : "text-stone-text hover:text-ink",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          {/* WhatsApp is the channel most visitors will actually use, so it is
              never more than one tap away, on any page, at any width. */}
          <a
            href={whatsappLink(whatsappMessages.general)}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-md bg-mamey px-3 font-semibold text-white sm:px-4",
              "transition-[background-color,transform] duration-press ease-out",
              "hover:bg-mamey-dark active:scale-[0.97]",
            )}
          >
            <WhatsAppIcon className="size-5" />
            <span className="hidden sm:inline">WhatsApp</span>
            <span className="sr-only sm:hidden">Escribinos por WhatsApp</span>
          </a>

          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-controls="menu-movil"
            className={cn(
              "grid size-11 place-items-center rounded-md border border-rule text-ink md:hidden",
              "transition-colors duration-fast ease-out hover:border-rule-strong",
            )}
          >
            {menuOpen ? <CloseIcon className="size-5" /> : <MenuIcon />}
            <span className="sr-only">{menuOpen ? "Cerrar menú" : "Abrir menú"}</span>
          </button>
        </div>
      </Container>

      {menuOpen && (
        <div id="menu-movil" className="border-t border-rule bg-paper md:hidden">
          <Container className="flex flex-col py-2">
            {NAV.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="border-b border-rule py-4 text-lg font-semibold text-ink last:border-0"
              >
                {link.label}
              </Link>
            ))}
          </Container>
        </div>
      )}
    </header>
  );
}
