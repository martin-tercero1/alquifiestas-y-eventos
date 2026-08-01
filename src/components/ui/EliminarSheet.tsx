"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import type { MutationResult } from "@/lib/admin/order";

/**
 * Confirm-and-hard-delete sheet — technical-admin only.
 *
 * Brief-04 §5: real deletion exists for the developer to remove genuine junk,
 * and every deletion must name what it removes and be deliberate. This sheet is
 * that guard: it spells out the record in plain Spanish, makes the person type
 * BORRAR so it can't be a fat-finger, and keeps itself open on any error so the
 * message is read rather than dismissed. It never appears on the parents'
 * screens — the caller only renders it when the signed-in staff is a tech admin.
 */

const CONFIRM_WORD = "BORRAR";

export function EliminarSheet({
  open,
  onClose,
  onDeleted,
  title,
  what,
  warning,
  run,
}: {
  open: boolean;
  onClose: () => void;
  /** Called after a successful delete — the caller navigates away or refreshes. */
  onDeleted: () => void;
  /** Sheet title, e.g. "Eliminar pedido". */
  title: string;
  /** Names the record: "el pedido #123 de Juan Pérez". */
  what: string;
  /** An extra line of caution shown above the confirmation, when relevant. */
  warning?: string;
  run: () => Promise<MutationResult>;
}) {
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setWord("");
      setBusy(false);
      setError(null);
    }
  }, [open]);

  const confirmed = word.trim().toUpperCase() === CONFIRM_WORD;

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await run();
    if (result.ok) {
      onDeleted();
      onClose();
    } else {
      setError(result.message);
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-5 overflow-y-auto px-5 pb-8">
        <p className="text-base text-ink">
          Vas a eliminar <span className="font-semibold">{what}</span>. Esto lo
          borra de la base de datos para siempre — no se puede deshacer.
        </p>

        {warning && (
          <p className="rounded-md border border-mamey/30 bg-mamey/[0.06] px-4 py-3 text-sm font-medium text-mamey-text">
            {warning}
          </p>
        )}

        <Field
          label="Escribí BORRAR para confirmar"
          htmlFor="eliminar-confirmar"
        >
          <Input
            id="eliminar-confirmar"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            placeholder="BORRAR"
          />
        </Field>

        {error && (
          <p
            role="alert"
            className="rounded-md border border-mamey/30 bg-mamey/[0.06] px-4 py-3 text-base font-medium text-mamey-text"
          >
            {error}
          </p>
        )}

        <Button
          size="lg"
          full
          variant="primary"
          disabled={busy || !confirmed}
          onClick={submit}
        >
          {busy ? "Eliminando…" : "Eliminar para siempre"}
        </Button>
      </div>
    </Sheet>
  );
}
