"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { saveVariant } from "@/lib/admin/inventory";
import { variantName } from "@/lib/catalog";
import type { InvVariant } from "@/lib/admin/loadInventory";

/**
 * Editing one variant — and the reason Inventario exists at all: fixing a price
 * in a few taps. The sheet opens with the price selected, so the common path is
 * tap the row, type the number, Guardar.
 *
 * An empty price or quantity box is a real, saved value — "we don't know / we
 * don't count these" — not zero. Where the current number is a guess (an
 * imported estimate) the field says so, so she knows what she is replacing.
 */

type Draft = { price: string; quantity: string; label: string; published: boolean };

function toDraft(v: InvVariant): Draft {
  return {
    price: v.pricePerDay === null ? "" : String(v.pricePerDay),
    quantity: v.totalQuantity === null ? "" : String(v.totalQuantity),
    label: v.label ?? "",
    published: v.published,
  };
}

/** "" -> null; a number -> that number. Rejects nonsense back to unchanged. */
function num(text: string): number | null {
  const t = text.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const SOURCE_NOTE: Record<string, string> = {
  estimated: "Es un estimado. Poné el precio real cuando lo tengás.",
  recovered: "Recuperado de la tienda vieja. Confirmalo si cambió.",
};

export function VariantEditorSheet({
  variant,
  productName,
  hasSiblings,
  onClose,
  onSaved,
}: {
  variant: InvVariant | null;
  productName: string;
  /** The product has more than one variant, so the label matters. */
  hasSiblings: boolean;
  onClose: () => void;
  onSaved: (variantId: string, patch: Partial<InvVariant>) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() =>
    variant ? toDraft(variant) : { price: "", quantity: "", label: "", published: true },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reload the form each time a different variant opens the sheet.
  useEffect(() => {
    if (variant) {
      setDraft(toDraft(variant));
      setError(null);
    }
  }, [variant]);

  if (!variant) return null;

  const title = variantName(productName, variant.label);
  const priceNote = variant.priceSource ? SOURCE_NOTE[variant.priceSource] : undefined;
  const willHide =
    draft.published && num(draft.price) === null
      ? "Publicado, pero no aparece en la tienda hasta que tenga precio."
      : null;

  async function save() {
    if (!variant) return;
    setSaving(true);
    setError(null);

    const price = num(draft.price);
    const quantity = num(draft.quantity);
    const label = hasSiblings ? draft.label.trim() || null : variant.label;

    const result = await saveVariant(variant.variantId, {
      pricePerDay: price,
      totalQuantity: quantity === null ? null : Math.round(quantity),
      published: draft.published,
      ...(hasSiblings ? { label } : {}),
    });

    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }

    onSaved(variant.variantId, {
      pricePerDay: price,
      totalQuantity: quantity === null ? null : Math.round(quantity),
      published: draft.published,
      label,
      priceSource: price !== variant.pricePerDay ? "staff" : variant.priceSource,
      quantitySource:
        quantity !== variant.totalQuantity ? "staff" : variant.quantitySource,
    });
    onClose();
  }

  return (
    <Sheet open={!!variant} onClose={onClose} title={`Editar ${title}`}>
      <div className="flex flex-col gap-5 overflow-y-auto px-5 pb-8">
        <div>
          <p className="type-label text-stone-text">Artículo</p>
          <h2 className="type-display mt-1 text-2xl text-ink">{title}</h2>
        </div>

        <Field
          label="Precio por día"
          htmlFor="v-price"
          hint={priceNote}
          error={error ?? undefined}
        >
          <div className="relative">
            <span className="type-mono pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-base text-stone-text">
              C$
            </span>
            <Input
              id="v-price"
              inputMode="numeric"
              autoFocus
              value={draft.price}
              onChange={(e) =>
                setDraft((d) => ({ ...d, price: e.target.value.replace(/[^\d.]/g, "") }))
              }
              placeholder="Sin precio"
              className="pl-11 text-lg"
            />
          </div>
        </Field>

        <Field
          label="Cantidad que tienen"
          htmlFor="v-qty"
          hint="Cuántas hay en total. Dejalo vacío si no lo sabés."
        >
          <Input
            id="v-qty"
            inputMode="numeric"
            value={draft.quantity}
            onChange={(e) =>
              setDraft((d) => ({ ...d, quantity: e.target.value.replace(/[^\d]/g, "") }))
            }
            placeholder="Sin contar"
            className="text-lg"
          />
        </Field>

        {hasSiblings && (
          <Field label="Etiqueta" htmlFor="v-label" optional>
            <Input
              id="v-label"
              value={draft.label}
              onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
              placeholder="Grande, Rojo, Redonda…"
            />
          </Field>
        )}

        <button
          type="button"
          onClick={() => setDraft((d) => ({ ...d, published: !d.published }))}
          className="flex items-center justify-between gap-4 rounded-lg border border-rule bg-paper p-4 text-left"
        >
          <span>
            <span className="block text-base font-semibold text-ink">
              {draft.published ? "En la tienda" : "Oculto"}
            </span>
            <span className="block text-sm text-stone-text">
              {draft.published
                ? "Los clientes lo pueden ver y pedir en línea."
                : "No aparece en el sitio. Igual lo podés usar en una proforma."}
            </span>
          </span>
          <span
            aria-hidden
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
              draft.published ? "bg-green" : "bg-rule-strong"
            }`}
          >
            <span
              className={`absolute top-1 size-5 rounded-full bg-white transition-all ${
                draft.published ? "left-6" : "left-1"
              }`}
            />
          </span>
        </button>

        {willHide && <p className="-mt-2 text-sm text-mamey-text">{willHide}</p>}

        <div className="flex gap-3 pt-1">
          <Button variant="quiet" full onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button full onClick={save} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
