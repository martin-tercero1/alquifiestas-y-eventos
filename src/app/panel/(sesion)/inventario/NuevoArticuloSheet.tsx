"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import {
  createCategory,
  createProduct,
  type NewVariantInput,
} from "@/lib/admin/inventory";
import type {
  InvCategory,
  InvProduct,
  TopCategory,
} from "@/lib/admin/loadInventory";

/**
 * Creating a brand-new catalog item — technical-admin only.
 *
 * The whole thing is one sheet: a name, a category (with a shortcut to make a
 * new one), an optional shared choice like Color/Estilo, and one or more
 * variants with their price and count. It starts as a draft and only goes on
 * the public site if the "Mostrar en el sitio web" switch is on. The photo is
 * added afterward from the item's own editor, so this stays a single, quick
 * save.
 */

type VariantRow = NewVariantInput;

const emptyVariant = (): VariantRow => ({
  label: "",
  pricePerDay: "",
  totalQuantity: "",
});

export function NuevoArticuloSheet({
  open,
  onClose,
  categories,
  topCategories,
  onCreated,
  onCategoryCreated,
}: {
  open: boolean;
  onClose: () => void;
  categories: InvCategory[];
  topCategories: TopCategory[];
  /** Prepends the created product to the list. */
  onCreated: (product: InvProduct) => void;
  /** Adds a freshly-created category to the pickers. */
  onCategoryCreated: (category: InvCategory) => void;
}) {
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [optionName, setOptionName] = useState("");
  const [optionValuesText, setOptionValuesText] = useState("");
  const [variants, setVariants] = useState<VariantRow[]>([emptyVariant()]);
  const [published, setPublished] = useState(false);

  // Inline category creation.
  const [makingCategory, setMakingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryParent, setNewCategoryParent] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);

  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setCategoryId("");
      setOptionName("");
      setOptionValuesText("");
      setVariants([emptyVariant()]);
      setPublished(false);
      setMakingCategory(false);
      setNewCategoryName("");
      setNewCategoryParent("");
      setAttempted(false);
      setBusy(false);
      setError(null);
    }
  }, [open]);

  function setVariant(i: number, patch: Partial<VariantRow>) {
    setVariants((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  async function saveCategory() {
    if (newCategoryName.trim() === "") return;
    setCreatingCategory(true);
    setError(null);
    const result = await createCategory({
      name: newCategoryName,
      parentId: newCategoryParent || null,
    });
    setCreatingCategory(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    const cat: InvCategory = {
      id: result.data.id,
      name: result.data.name,
      topName: result.data.topName,
    };
    onCategoryCreated(cat);
    setCategoryId(cat.id);
    setMakingCategory(false);
    setNewCategoryName("");
    setNewCategoryParent("");
  }

  const nameError = attempted && name.trim() === "";
  const categoryError = attempted && categoryId === "";

  async function save() {
    setAttempted(true);
    if (name.trim() === "" || categoryId === "") return;

    setBusy(true);
    setError(null);
    const optionValues = optionValuesText
      .split(/[\n,]/)
      .map((v) => v.trim())
      .filter((v) => v !== "");

    const result = await createProduct({
      name,
      categoryId,
      optionName,
      optionValues,
      published,
      variants,
    });
    setBusy(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    const cat = categories.find((c) => c.id === categoryId);
    const product: InvProduct = {
      productId: result.data.productId,
      slug: result.data.slug,
      name: name.trim(),
      categoryId,
      categoryName: cat?.name ?? "",
      topCategoryName: cat?.topName ?? "",
      photoSquare: null,
      internalNote: null,
      variants: result.data.variants.map((v, i) => {
        const priceStr = variants[i]?.pricePerDay.trim() ?? "";
        const qtyStr = variants[i]?.totalQuantity.trim() ?? "";
        return {
          variantId: v.variantId,
          label: v.label,
          pricePerDay: priceStr === "" ? null : Number(priceStr),
          priceSource: priceStr === "" ? null : "staff",
          totalQuantity: qtyStr === "" ? null : Number(qtyStr),
          quantitySource: qtyStr === "" ? null : "staff",
          published,
        };
      }),
    };

    onCreated(product);
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title="Nuevo artículo">
      <div className="flex flex-col gap-5 overflow-y-auto px-5 pb-8">
        <Field
          label="Nombre"
          htmlFor="na-nombre"
          error={nameError ? "Escribí un nombre." : undefined}
        >
          <Input
            id="na-nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Silla Tiffany"
            autoFocus
          />
        </Field>

        {/* Category — pick one, or open the inline creator. */}
        {!makingCategory ? (
          <Field
            label="Categoría"
            htmlFor="na-cat"
            error={categoryError ? "Elegí una categoría." : undefined}
          >
            <Select
              id="na-cat"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Elegí una categoría…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.topName === c.name ? c.name : `${c.topName} — ${c.name}`}
                </option>
              ))}
            </Select>
            <button
              type="button"
              onClick={() => setMakingCategory(true)}
              className="mt-2 min-h-10 text-sm font-semibold text-green underline"
            >
              ＋ Nueva categoría
            </button>
          </Field>
        ) : (
          <div className="flex flex-col gap-3 rounded-lg border border-rule bg-paper p-4">
            <p className="type-label text-stone-text">Nueva categoría</p>
            <Field label="Nombre de la categoría" htmlFor="na-newcat">
              <Input
                id="na-newcat"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Ej. Toldos"
              />
            </Field>
            <Field label="Va dentro de" htmlFor="na-newcat-parent" optional>
              <Select
                id="na-newcat-parent"
                value={newCategoryParent}
                onChange={(e) => setNewCategoryParent(e.target.value)}
              >
                <option value="">Categoría principal (sin madre)</option>
                {topCategories.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex gap-2">
              <Button
                variant="quiet"
                size="sm"
                onClick={() => setMakingCategory(false)}
                disabled={creatingCategory}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={saveCategory}
                disabled={creatingCategory || newCategoryName.trim() === ""}
              >
                {creatingCategory ? "Creando…" : "Crear categoría"}
              </Button>
            </div>
          </div>
        )}

        {/* Optional shared choice picked at rental time. */}
        <section className="flex flex-col gap-3 border-t border-rule pt-5">
          <div>
            <p className="text-base font-semibold text-ink">Opción (si aplica)</p>
            <p className="text-sm text-stone-text">
              Una elección al momento de alquilar, como color o estilo. Dejalo
              vacío si el artículo no tiene opciones.
            </p>
          </div>
          <Field label="Nombre de la opción" htmlFor="na-opt" optional>
            <Input
              id="na-opt"
              value={optionName}
              onChange={(e) => setOptionName(e.target.value)}
              placeholder="Ej. Color"
            />
          </Field>
          {optionName.trim() !== "" && (
            <Field
              label="Valores"
              htmlFor="na-optvals"
              hint="Uno por línea (o separados por coma)."
            >
              <Textarea
                id="na-optvals"
                rows={3}
                value={optionValuesText}
                onChange={(e) => setOptionValuesText(e.target.value)}
                placeholder={"Rojo\nAzul\nDorado"}
              />
            </Field>
          )}
        </section>

        {/* Variants — at least one. */}
        <section className="flex flex-col gap-3 border-t border-rule pt-5">
          <div>
            <p className="text-base font-semibold text-ink">Variantes</p>
            <p className="text-sm text-stone-text">
              Los tamaños o tipos con precio propio. Si el artículo es uno solo,
              dejá una sola variante sin nombre.
            </p>
          </div>

          {variants.map((v, i) => (
            <div
              key={i}
              className="flex flex-col gap-3 rounded-lg border border-rule bg-paper p-4"
            >
              <div className="flex items-center justify-between">
                <span className="type-label text-stone-text">
                  Variante {i + 1}
                </span>
                {variants.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setVariants((rows) => rows.filter((_, j) => j !== i))
                    }
                    className="min-h-9 px-2 text-sm font-semibold text-mamey-text"
                  >
                    Quitar
                  </button>
                )}
              </div>
              <Field label="Nombre de la variante" htmlFor={`na-v-label-${i}`} optional>
                <Input
                  id={`na-v-label-${i}`}
                  value={v.label}
                  onChange={(e) => setVariant(i, { label: e.target.value })}
                  placeholder="Ej. Grande"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Precio / día" htmlFor={`na-v-price-${i}`} optional>
                  <Input
                    id={`na-v-price-${i}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={v.pricePerDay}
                    onChange={(e) => setVariant(i, { pricePerDay: e.target.value })}
                  />
                </Field>
                <Field label="Cantidad" htmlFor={`na-v-qty-${i}`} optional>
                  <Input
                    id={`na-v-qty-${i}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={v.totalQuantity}
                    onChange={(e) =>
                      setVariant(i, { totalQuantity: e.target.value })
                    }
                  />
                </Field>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => setVariants((rows) => [...rows, emptyVariant()])}
            className="min-h-11 rounded-md border border-rule text-base font-semibold text-green"
          >
            ＋ Agregar otra variante
          </button>
        </section>

        {/* Publish state. */}
        <section className="flex flex-col gap-2 border-t border-rule pt-5">
          <span className="text-base font-semibold text-ink">
            ¿Mostrar en el sitio web?
          </span>
          <div className="flex gap-2">
            {(
              [
                [false, "Borrador (oculto)"],
                [true, "En el sitio web"],
              ] as [boolean, string][]
            ).map(([value, label]) => (
              <button
                key={label}
                type="button"
                onClick={() => setPublished(value)}
                className={cn(
                  "min-h-13 flex-1 rounded-md border px-3 text-sm font-semibold",
                  "transition-colors duration-fast ease-out",
                  published === value
                    ? "border-green bg-green/10 text-green"
                    : "border-rule text-stone-text",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-sm text-stone-text">
            En borrador ya lo podés usar en una proforma; solo no aparece en el
            sitio hasta que lo publiques.
          </p>
        </section>

        {error && (
          <p
            role="alert"
            className="rounded-md border border-mamey/30 bg-mamey/[0.06] px-4 py-3 text-base font-medium text-mamey-text"
          >
            {error}
          </p>
        )}

        <Button size="lg" full disabled={busy} onClick={save}>
          {busy ? "Creando…" : "Crear artículo"}
        </Button>
      </div>
    </Sheet>
  );
}
