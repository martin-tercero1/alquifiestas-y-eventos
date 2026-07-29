import { Suspense } from "react";
import type { Metadata } from "next";
import { Wordmark } from "@/components/layout/Wordmark";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  // The layout's template already appends " · Panel".
  title: "Entrar",
  robots: { index: false, follow: false },
};

export default function EntrarPage() {
  return (
    <main className="grain min-h-dvh bg-limewash">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-10 px-5 py-12">
        <div className="flex flex-col gap-3">
          <Wordmark />
          <h1 className="type-display text-3xl text-ink">Panel</h1>
          <p className="text-base text-stone-text">
            Entrá para tomar pedidos y ver el inventario.
          </p>
        </div>

        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
