"use client";

import { useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { PhotoFrame } from "@/components/ui/PhotoFrame";
import { saveProduct, uploadProductPhoto } from "@/lib/admin/inventory";
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
  onClose,
  onSaved,
}: {
  product: InvProduct | null;
  categories: InvCategory[];
  onClose: () => void;
  onSaved: (productId: string, patch: Partial<InvProduct>) => void;
}) {
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (product) {
      setName(product.name);
      setCategoryId(product.categoryId);
      setPhoto(product.photoSquare);
      setError(null);
    }
  }, [product]);

  if (!product) return null;

  async function pickPhoto(file: File) {
    if (!product) return;
    setUploading(true);
    setError(null);
    const result = await uploadProductPhoto(product.productId, product.slug, file);
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
      </div>
    </Sheet>
  );
}
