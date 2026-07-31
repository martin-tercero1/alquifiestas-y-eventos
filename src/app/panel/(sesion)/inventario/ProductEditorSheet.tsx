"use client";

import { useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { PhotoFrame } from "@/components/ui/PhotoFrame";
import { saveProduct, uploadProductPhoto } from "@/lib/admin/inventory";
import { deleteProduct } from "@/lib/admin/order";
import { photoUrl } from "@/lib/catalog";
import type { InvProduct, InvCategory } from "@/lib/admin/loadInventory";

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
  onClose,
  onSaved,
  onDeleted,
}: {
  product: InvProduct | null;
  categories: InvCategory[];
  /** Technical admin only; the delete control is absent otherwise. */
  canDelete?: boolean;
  onClose: () => void;
  onSaved: (productId: string, patch: Partial<InvProduct>) => void;
  onDeleted?: (productId: string) => void;
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

  useEffect(() => {
    if (product) {
      setName(product.name);
      setCategoryId(product.categoryId);
      setPhoto(product.photoSquare);
      setError(null);
      setConfirmingDelete(false);
      setDeleteWord("");
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
              {uploading ? "Subiendo…" : photo ? "Cambiar foto" : "Tomar foto"}
            </Button>
            <p className="text-sm text-stone-text">
              Tomala con la cámara o elegí una del teléfono.
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
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
