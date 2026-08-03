"use client";

import { useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { PhotoFrame } from "@/components/ui/PhotoFrame";
import {
  addVariant,
  saveProduct,
  saveProductOption,
  uploadProductPhoto,
} from "@/lib/admin/inventory";
import { deleteProduct } from "@/lib/admin/order";
import { photoUrl } from "@/lib/catalog";
import type {
  InvProduct,
  InvCategory,
  InvVariant,
} from "@/lib/admin/loadInventory";

/**
 * Editing the product itself — its name, which shelf it lives on, and its
 * photo. The photo is the point of most of this: turning the design's "Foto
 * pendiente" placeholder into the owners' real product, taken with the phone
 * that is already in her hand.
 */

export function ProductEditorSheet({
  product,
  categories,
  canDelete = false,
  canManageStructure = false,
  onClose,
  onSaved,
  onDeleted,
  onVariantAdded,
}: {
  product: InvProduct | null;
  categories: InvCategory[];
  /** Technical admin only; the delete control is absent otherwise. */
  canDelete?: boolean;
  /** Technical admin only; unlocks editing the option and adding a variant. */
  canManageStructure?: boolean;
  onClose: () => void;
  onSaved: (productId: string, patch: Partial<InvProduct>) => void;
  onDeleted?: (productId: string) => void;
  onVariantAdded?: (productId: string, variant: InvVariant) => void;
}) {
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Two-step delete inside the editor: reveal, then type BORRAR to confirm.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteWord, setDeleteWord] = useState("");
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Option (Color/Estilo) — technical admin only.
  const [optionName, setOptionName] = useState("");
  const [optionValuesText, setOptionValuesText] = useState("");
  const [savingOption, setSavingOption] = useState(false);
  const [optionError, setOptionError] = useState<string | null>(null);
  const [optionSaved, setOptionSaved] = useState(false);

  // Add-a-variant form — technical admin only.
  const [nvLabel, setNvLabel] = useState("");
  const [nvPrice, setNvPrice] = useState("");
  const [nvQty, setNvQty] = useState("");
  const [nvPublished, setNvPublished] = useState(true);
  const [addingVariant, setAddingVariant] = useState(false);
  const [variantError, setVariantError] = useState<string | null>(null);
  const [addedLabel, setAddedLabel] = useState<string | null>(null);

  useEffect(() => {
    if (product) {
      setName(product.name);
      setCategoryId(product.categoryId);
      setPhoto(product.photoSquare);
      setError(null);
      setConfirmingDelete(false);
      setDeleteWord("");
      setOptionName(product.optionName ?? "");
      setOptionValuesText((product.optionValues ?? []).join("\n"));
      setOptionError(null);
      setOptionSaved(false);
      setNvLabel("");
      setNvPrice("");
      setNvQty("");
      setNvPublished(true);
      setVariantError(null);
      setAddedLabel(null);
    }
  }, [product]);

  if (!product) return null;

  async function pickPhoto(file: File) {
    if (!product) return;
    setUploading(true);
    setError(null);
    const result = await uploadProductPhoto(product.productId, file);
    setUploading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    // Show it straight away; the row behind the sheet updates on Guardar.
    setPhoto(result.path);
  }

  async function save() {
    if (!product) return;
    setSaving(true);
    setError(null);

    const trimmed = name.trim() || product.name;
    const category = categories.find((c) => c.id === categoryId);

    const result = await saveProduct(product.productId, {
      name: trimmed,
      categoryId,
    });

    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }

    onSaved(product.productId, {
      name: trimmed,
      categoryId,
      categoryName: category?.name ?? product.categoryName,
      topCategoryName: category?.topName ?? product.topCategoryName,
      photoSquare: photo,
    });
    onClose();
  }

  async function saveOption() {
    if (!product) return;
    setSavingOption(true);
    setOptionError(null);
    setOptionSaved(false);

    const values = optionValuesText
      .split(/[\n,]/)
      .map((v) => v.trim())
      .filter((v) => v !== "");

    const result = await saveProductOption(product.productId, {
      optionName,
      optionValues: values,
    });

    setSavingOption(false);
    if (!result.ok) {
      setOptionError(result.message);
      return;
    }
    // Reflect the cleaned values the database actually kept.
    setOptionName(result.data.optionName ?? "");
    setOptionValuesText((result.data.optionValues ?? []).join("\n"));
    setOptionSaved(true);
    onSaved(product.productId, {
      optionName: result.data.optionName,
      optionValues: result.data.optionValues,
    });
  }

  async function addNewVariant() {
    if (!product) return;
    setAddingVariant(true);
    setVariantError(null);
    setAddedLabel(null);

    const result = await addVariant(product.productId, {
      label: nvLabel,
      pricePerDay: nvPrice,
      totalQuantity: nvQty,
      published: nvPublished,
    });

    setAddingVariant(false);
    if (!result.ok) {
      setVariantError(result.message);
      return;
    }

    const variant: InvVariant = {
      variantId: result.data.variantId,
      label: result.data.label,
      pricePerDay: nvPrice.trim() === "" ? null : Number(nvPrice),
      priceSource: nvPrice.trim() === "" ? null : "staff",
      totalQuantity: nvQty.trim() === "" ? null : Number(nvQty),
      quantitySource: nvQty.trim() === "" ? null : "staff",
      published: nvPublished,
    };
    onVariantAdded?.(product.productId, variant);
    setAddedLabel(result.data.label ?? "Variante");
    setNvLabel("");
    setNvPrice("");
    setNvQty("");
  }

  async function remove() {
    if (!product) return;
    setDeleting(true);
    setError(null);
    const result = await deleteProduct(product.productId);
    setDeleting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onDeleted?.(product.productId);
    onClose();
  }

  const deleteConfirmed = deleteWord.trim().toUpperCase() === "BORRAR";

  return (
    <Sheet open={!!product} onClose={onClose} title={`Editar ${product.name}`}>
      <div className="flex flex-col gap-5 overflow-y-auto px-5 pb-8">
        <div className="flex items-center gap-4">
          <div className="w-24 shrink-0">
            <PhotoFrame src={photoUrl(photo)} alt={product.name} ratio="square" />
          </div>
          <div className="flex flex-col gap-2">
            <Button
              variant="quiet"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? "Subiendo…" : photo ? "Cambiar foto" : "Agregar foto"}
            </Button>
            <p className="text-sm text-stone-text">
              Tomala con la cámara o elegí una del teléfono.
            </p>
          </div>
          {/*
            No `capture` attribute on purpose: it would force the camera and hide
            the gallery. Without it the phone offers both — take a new photo OR
            pick one already saved — which is what the hint above promises.
          */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) pickPhoto(file);
              e.target.value = "";
            }}
          />
        </div>

        <Field label="Nombre" htmlFor="p-name" error={error ?? undefined}>
          <Input
            id="p-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <Field label="Categoría" htmlFor="p-cat">
          <Select
            id="p-cat"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.topName === c.name ? c.name : `${c.topName} — ${c.name}`}
              </option>
            ))}
          </Select>
        </Field>

        <div className="flex gap-3 pt-1">
          <Button variant="quiet" full onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button full onClick={save} disabled={saving || uploading}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>

        {canManageStructure && (
          <>
            {/* Option (Color/Estilo) — the shared choice picked at rental time. */}
            <section className="flex flex-col gap-3 border-t border-rule pt-5">
              <div>
                <p className="text-base font-semibold text-ink">Opción</p>
                <p className="text-sm text-stone-text">
                  Una elección al momento de alquilar, como color o estilo. Dejá
                  el nombre vacío si el artículo no tiene opciones.
                </p>
              </div>
              <Field label="Nombre de la opción" htmlFor="pe-opt" optional>
                <Input
                  id="pe-opt"
                  value={optionName}
                  onChange={(e) => {
                    setOptionName(e.target.value);
                    setOptionSaved(false);
                  }}
                  placeholder="Ej. Color"
                />
              </Field>
              {optionName.trim() !== "" && (
                <Field
                  label="Valores"
                  htmlFor="pe-optvals"
                  hint="Uno por línea (o separados por coma)."
                >
                  <Textarea
                    id="pe-optvals"
                    rows={3}
                    value={optionValuesText}
                    onChange={(e) => {
                      setOptionValuesText(e.target.value);
                      setOptionSaved(false);
                    }}
                    placeholder={"Rojo\nAzul\nDorado"}
                  />
                </Field>
              )}
              {optionError && (
                <p className="text-sm font-medium text-mamey-text">{optionError}</p>
              )}
              {optionSaved && (
                <p className="text-sm font-medium text-green">Opción guardada.</p>
              )}
              <Button
                variant="quiet"
                size="sm"
                onClick={saveOption}
                disabled={savingOption}
              >
                {savingOption ? "Guardando…" : "Guardar opción"}
              </Button>
            </section>

            {/* Append a variant to this product. */}
            <section className="flex flex-col gap-3 border-t border-rule pt-5">
              <div>
                <p className="text-base font-semibold text-ink">
                  Agregar variante
                </p>
                <p className="text-sm text-stone-text">
                  Un tamaño o tipo nuevo con su propio precio, por ejemplo
                  “Grande”.
                </p>
              </div>
              {product.variants.length === 1 && !product.variants[0].label && (
                <p className="rounded-md bg-limewash px-3 py-2 text-sm text-ink">
                  Al agregar una segunda variante, ponele también una etiqueta a
                  la que ya existe (tocá su línea) para diferenciarlas.
                </p>
              )}
              <Field label="Nombre de la variante" htmlFor="pe-nv-label" optional>
                <Input
                  id="pe-nv-label"
                  value={nvLabel}
                  onChange={(e) => setNvLabel(e.target.value)}
                  placeholder="Ej. Grande"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Precio / día" htmlFor="pe-nv-price" optional>
                  <Input
                    id="pe-nv-price"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={nvPrice}
                    onChange={(e) => setNvPrice(e.target.value)}
                  />
                </Field>
                <Field label="Cantidad" htmlFor="pe-nv-qty" optional>
                  <Input
                    id="pe-nv-qty"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={nvQty}
                    onChange={(e) => setNvQty(e.target.value)}
                  />
                </Field>
              </div>
              <button
                type="button"
                onClick={() => setNvPublished((v) => !v)}
                className="flex items-center justify-between gap-4 rounded-lg border border-rule bg-paper p-3 text-left"
              >
                <span className="text-sm font-semibold text-ink">
                  {nvPublished ? "En la tienda" : "Oculto"}
                </span>
                <span
                  aria-hidden
                  className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                    nvPublished ? "bg-green" : "bg-rule-strong"
                  }`}
                >
                  <span
                    className={`absolute top-1 size-5 rounded-full bg-white transition-all ${
                      nvPublished ? "left-6" : "left-1"
                    }`}
                  />
                </span>
              </button>
              {variantError && (
                <p className="text-sm font-medium text-mamey-text">
                  {variantError}
                </p>
              )}
              {addedLabel && (
                <p className="text-sm font-medium text-green">
                  Agregada “{addedLabel}”. Podés agregar otra.
                </p>
              )}
              <Button
                variant="quiet"
                size="sm"
                onClick={addNewVariant}
                disabled={addingVariant}
              >
                {addingVariant ? "Agregando…" : "＋ Agregar variante"}
              </Button>
            </section>
          </>
        )}

        {canDelete && (
          <div className="mt-4 rounded-lg border border-mamey/25 bg-mamey/[0.04] p-4">
            <p className="type-label text-mamey-text">Zona técnica</p>
            {!confirmingDelete ? (
              <>
                <p className="mt-1 text-sm text-stone-text">
                  Borra el artículo y sus variantes para siempre. Solo para
                  pruebas o duplicados sin pedidos.
                </p>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className="mt-3 min-h-12 rounded-md border border-mamey/40 px-4 text-base font-semibold text-mamey-text transition-colors duration-fast ease-out hover:bg-mamey/[0.08]"
                >
                  Eliminar artículo
                </button>
              </>
            ) : (
              <>
                <p className="mt-1 text-sm text-ink">
                  Vas a eliminar{" "}
                  <span className="font-semibold">{product.name}</span>. No se
                  puede deshacer.
                </p>
                <Field
                  label="Escribí BORRAR para confirmar"
                  htmlFor="p-del-confirm"
                >
                  <Input
                    id="p-del-confirm"
                    value={deleteWord}
                    onChange={(e) => setDeleteWord(e.target.value)}
                    autoComplete="off"
                    autoCapitalize="characters"
                    placeholder="BORRAR"
                  />
                </Field>
                <button
                  type="button"
                  onClick={remove}
                  disabled={deleting || !deleteConfirmed}
                  className="mt-3 min-h-12 w-full rounded-md bg-mamey px-4 text-base font-semibold text-white transition-colors duration-fast ease-out disabled:opacity-45"
                >
                  {deleting ? "Eliminando…" : "Eliminar para siempre"}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}
