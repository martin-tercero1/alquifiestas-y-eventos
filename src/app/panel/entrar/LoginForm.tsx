"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { panelClient } from "@/lib/supabase/panel";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";

/**
 * Signing in writes the session to cookies, which is what lets the server
 * render the panel already knowing who is asking.
 *
 * Supabase's own error strings are English and read like a stack trace
 * ("Invalid login credentials"). She would see that on a phone, in a hurry,
 * and have no idea whether the problem was her, the phone or the internet —
 * so every failure is translated into what happened and what to do about it.
 */
function spanishError(message: string): string {
  const m = message.toLowerCase();

  if (m.includes("invalid login credentials")) {
    return "El correo o la contraseña no coinciden. Revisá y probá de nuevo.";
  }
  if (m.includes("email not confirmed")) {
    return "Esta cuenta todavía no está activada. Avisale al desarrollador.";
  }
  if (m.includes("too many requests") || m.includes("rate limit")) {
    return "Demasiados intentos seguidos. Esperá un momento y volvé a probar.";
  }
  if (m.includes("fetch") || m.includes("network")) {
    return "No hay conexión. Revisá los datos o el wifi y volvé a probar.";
  }
  return "No se pudo entrar. Probá de nuevo en un momento.";
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    const { error: authError } = await panelClient().auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authError) {
      setError(spanishError(authError.message));
      setBusy(false);
      return;
    }

    // refresh() re-runs the server layout so it picks up the new session;
    // without it the panel would render as though still signed out.
    router.replace(params.get("volver") || "/panel");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <Field label="Correo" htmlFor="email">
        <Input
          id="email"
          type="email"
          name="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error ? true : undefined}
        />
      </Field>

      <Field label="Contraseña" htmlFor="password">
        <Input
          id="password"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "login-error" : undefined}
        />
      </Field>

      {error && (
        <p
          id="login-error"
          role="alert"
          className="rounded-md border border-mamey/30 bg-mamey/[0.06] px-4 py-3 text-base font-medium text-mamey-text"
        >
          {error}
        </p>
      )}

      <Button type="submit" size="lg" full disabled={busy}>
        {busy ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}
