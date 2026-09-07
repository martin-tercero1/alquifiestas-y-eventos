"use client";

import { useState } from "react";
import { photoUrl, type CatalogProduct } from "@/lib/catalog";
import { whatsappLink, whatsappMessages } from "@/lib/business";
import { PhotoFrame } from "@/components/ui/PhotoFrame";
import { Price } from "@/components/ui/Price";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { WhatsAppIcon } from "@/components/ui/icons";
import { AddToHojaDetail } from "@/components/hoja/AddToHoja";
import { cn } from "@/lib/cn";

/**
 * The product's image + buy box, as one client unit so a choice can change both
 * at once. Picking a variant switches the price; picking an option value (a
 * mantel colour) switches the main image when we have a photo for it — the same
 * choices the panel offers, now visible to the customer. Every option shown is
 * bookable: the public catalog only carries published, priced variants.
 */
export function ProductView({ product }: { product: CatalogProduct }) {
  const [variantId, setVariantId] = useState(product.variants[0].variantId);
  const variant =
    product.variants.find((v) => v.variantId === variantId) ??
    product.variants[0];

  const options = product.options;
  const hasOptions = Boolean(product.optionName) && options.length > 0;
  const [optionValue, setOptionValue] = useState<string | null>(
    hasOptions ? options[0].value : null,
  );
  const chosen = hasOptions
    ? options.find((o) => o.value === optionValue) ?? options[0]
    : null;

  const hasVariantChoice = product.variants.length > 1;

  // The selected colour's photo wins; otherwise the product's default image.
  const image =
    photoUrl(chosen?.photoPortrait ?? null) ??
    photoUrl(product.photoPortrait ?? product.photoSquare);

  const consultName = optionValue
    ? `${product.name} (${optionValue})`
    : product.name;

  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-14">
      {/* The one place a photo is allowed to be large. */}
      <PhotoFrame
        src={image}
        alt={`${consultName} — Alquifiestas y Eventos, San Marcos`}
        ratio="portrait"
        priority
        className="lg:sticky lg:top-28"
      />

      <div>
        <h1 className="type-display text-[clamp(1.75rem,6vw,3rem)] text-ink">
          {product.name}
        </h1>

        {product.description && (
          <p className="mt-4 text-lg text-stone-text">{product.description}</p>
        )}

        <div className="mt-7">
          {hasVariantChoice && (
            <Chips
              legend="Elegí cuál ocupás"
              items={product.variants.map((v) => ({
                key: v.variantId,
                label: v.variantLabel ?? "Opción única",
                active: v.variantId === variant.variantId,
                onSelect: () => setVariantId(v.variantId),
              }))}
            />
          )}

          {hasOptions && (
            <Chips
              legend={`Elegí ${product.optionName!.toLowerCase()}`}
              items={options.map((o) => ({
                key: o.value,
                label: o.value,
                active: o.value === optionValue,
                onSelect: () => setOptionValue(o.value),
              }))}
            />
          )}

          <div className="border-y border-ink/15 py-6">
            <Price amount={variant.pricePerDay} size="lg" />
            <p className="mt-3 max-w-sm text-sm text-stone-text">
              El precio es por cada 24 horas. Si lo ocupás más días, se
              multiplica por la cantidad de días.
            </p>
          </div>

          <div className="mt-7">
            <AddToHojaDetail variant={variant} optionChoice={optionValue} />
          </div>

          <p className="mt-4">
            <Button
              href={whatsappLink(whatsappMessages.item(consultName))}
              variant="secondary"
              full
            >
              <WhatsAppIcon className="size-5" />
              Consultar disponibilidad
            </Button>
          </p>

          <dl className="mt-9 divide-y divide-rule border-t border-rule">
            {variant.variantLabel && (
              <Row term="Opción" detail={variant.variantLabel} />
            )}
            {optionValue && product.optionName && (
              <Row term={product.optionName} detail={optionValue} />
            )}
            <Row term="Categoría" detail={variant.categoryName} />
            <Row
              term="En bodega"
              detail={
                variant.totalQuantity === null
                  ? "Consultanos"
                  : String(variant.totalQuantity)
              }
            />
          </dl>

          {variant.totalQuantity !== null && variant.totalQuantity <= 4 && (
            <p className="mt-5">
              <Badge variant="scarce">
                Solo {variant.totalQuantity} — conviene apartarlo temprano
              </Badge>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Chips({
  legend,
  items,
}: {
  legend: string;
  items: { key: string; label: string; active: boolean; onSelect: () => void }[];
}) {
  return (
    <fieldset className="mb-7">
      <legend className="type-label mb-3 text-stone-text">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <label
            key={item.key}
            className={cn(
              "min-h-13 cursor-pointer rounded-md border px-4 py-3",
              "flex items-center gap-3 text-base font-medium",
              "transition-[border-color,background-color] duration-fast ease-out",
              "has-focus-visible:outline has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-mamey",
              item.active
                ? "border-green bg-green-tint text-ink"
                : "border-rule bg-paper text-stone-text hover:border-rule-strong",
            )}
          >
            <input
              type="radio"
              checked={item.active}
              onChange={item.onSelect}
              aria-label={item.label}
              className="sr-only"
            />
            {item.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Row({ term, detail }: { term: string; detail: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-3">
      <dt className="type-label text-stone-text">{term}</dt>
      <dd className="type-mono text-right text-base text-ink">{detail}</dd>
    </div>
  );
}
