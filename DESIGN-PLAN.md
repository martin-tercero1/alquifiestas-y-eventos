# Design Plan — Alquifiestas y Eventos, Public Site

Brief: `brief-01-public-site-design.md`. Written in English; everything that ships is in Spanish.
Status: **awaiting approval before any code is written.**

---

## 1. The thesis

The brief hands us the idea worth designing around:

> "these are objects that get set up, used for one evening, and taken down. The product is a room that exists for a few hours."

In San Marcos the room is almost always **a patio** — someone's house, a school yard, a parish hall. The business doesn't sell chairs, it lends a town the ability to turn an ordinary space into a *salón* for one night.

Working headline (Nicaraguan Spanish, plain, no wedding-magazine register):

> **Vos ponés el lugar, nosotros lo hacemos lucir.**
> Sillas, mesas, mantelería, cristalería y decoración en alquiler. Precios por 24 horas, a la vista.
> San Marcos, Carazo. 20 años. #TuEventoDeSiempre

---

## 2. Palette

Not sampled from a mood board — sampled from the town. Small-town Nicaraguan public woodwork (park benches, church doors, window frames, municipal buildings) is painted a deep institutional green; the houses are limewashed; the loud color in the Meseta is fruit-and-pottery orange.

| Token | Hex | Role |
|---|---|---|
| `--cal` | `#E8EBE4` | Page ground. Limewash — a chalky off-white with a green-grey cast. **Not cream.** |
| `--papel` | `#F4F6F1` | Card / raised surface, one step lighter than the ground |
| `--verde` | `#186B57` | Brand green. Painted-woodwork green. Structure, nav, category marks |
| `--tinta` | `#12312B` | Text and dark grounds. A green-black, never neutral black |
| `--mamey` | `#C7401F` | Action. Buttons, WhatsApp CTA, price emphasis (bg) |
| `--mamey-texto` | `#B93A1B` | Same hue, darkened for text-on-light (contrast, see §7) |
| `--piedra` | `#A8AC9E` | Hairlines, dividers, image placeholders |
| `--piedra-texto` | `#5C6357` | Secondary text |

Deliberately **no gold/brass**, even though Tiffany chairs are gold — the photos already carry gold, and adding it to the palette would tip the whole thing into the wedding-industry look the brief rules out.

## 3. Type

Two families, both variable, both subset to Latin. Chosen partly for payload — this loads over Nicaraguan mobile data.

- **Display — Archivo Expanded** (`wght` 800, `wdth` 125). Wide, heavy, flat-sided grotesque. This is the letterform of a hand-painted Nicaraguan *rótulo* — the shop signage vernacular the business already lives inside. Used with restraint: h1, h2, prices. Archivo is by Omnibus-Type, an Argentine foundry, and its Spanish diacritics and `ñ` are drawn properly rather than bolted on.
- **Body / UI — Archivo** (`wght` 400/500/600, `wdth` 100). Same family, same file, one variable axis apart from the display face. A characterful display face at zero extra download.
- **Utility — DM Mono** (`wght` 400/500). Quantities, dates, item codes, the running tally. Monospace here is not a style choice — it encodes something true: this is a **counted** inventory, and the business's own artifact is a ruled count sheet.

Numerals are `tabular-nums` everywhere a price or quantity can change.

**Base size is 17px, not 16.** The admin panel inherits these tokens and will be used daily, in a hurry, in a warehouse, by two people in their sixties. Setting it generously now is cheaper than overriding it later. Minimum tap target 48×48.

## 4. Layout — mobile first, literally

Designed at 360px, widened up. The hero's LCP element is **text on a flat ground**, not an image — the headline paints before a single photo has downloaded.

```
┌─────────────────────────────┐  360px
│ ALQUIFIESTAS       [WA] [☰] │
├─────────────────────────────┤
│                             │
│  POR UNA NOCHE,             │  Archivo Expanded 800
│  TU PATIO SE                │  tinta on cal
│  VUELVE SALÓN.              │
│                             │
│  Sillas, mesas, mantelería  │
│  y decoración en alquiler.  │
│  Precios por 24 horas.      │
│                             │
│  [   Ver catálogo   ]       │  mamey, white text
│  [ Escribir por WhatsApp ]  │  outline
│                             │
├─────────────────────────────┤
│  ▨  ▨  ▨  ▨   ← la vitrina  │  wall of small square
│  ▨  ▨  ▨  ▨      (scrolls)  │  photos, mono captions
│  ▨  ▨  ▨  ▨                 │
├─────────────────────────────┤
│  CATEGORÍAS                 │
│  Sillas          desde C$10 │  price on every row
│  Mesas          desde C$100 │
│  Mantelería      desde C$60 │
│  …                          │
└─────────────────────────────┘
```

Catalog card — **the price is typographically louder than the name**:

```
┌───────────────────┐
│  ┌─────────────┐  │
│  │   ▨ photo   │  │  1:1, matted inside the card
│  └─────────────┘  │
│  SILLA TIFFANY    │  Archivo 600, 17px
│  dorada           │  piedra-texto
│                   │
│  C$ 40            │  Archivo Expanded 800, 34px
│  POR 24 HORAS     │  DM Mono, 11px, tracked
│                   │
│  [ + Agregar ]    │
└───────────────────┘
```

Routes: `/` · `/catalogo` · `/catalogo/[categoria]` · `/catalogo/[categoria]/[articulo]` · `/solicitar` · `/contacto` · `/campanas/graduaciones` (the landing template's working example).

## 5. Signature element — **"La hoja"**

The one thing the site is remembered by. The mother's actual working artifact is a ruled paper proforma. So the cart isn't a cart — it's **a sheet that follows you**, and it looks like the form she already fills in by hand.

Collapsed, pinned to the bottom of every page on mobile (`--tinta` ground, mono):

```
┌─────────────────────────────┐
│ LA HOJA · 3 renglones    ▲  │
│ C$ 4,350   POR 24 HORAS     │
└─────────────────────────────┘
```

Expanded — a drawer that reads as the paper form:

```
  CANT   ARTÍCULO                IMPORTE
  ───────────────────────────────────────
   100   Silla Tiffany dorada    C$ 4,000
    10   Mesa redonda para 10    C$ 1,200
    10   Mantel redondo blanco     C$ 650
  ───────────────────────────────────────
         SUBTOTAL POR 24 H       C$ 5,850
         DÍAS                           1
         TOTAL                   C$ 5,850
  ───────────────────────────────────────
  Fecha del evento:  sáb 14 mar 2026
         [ Solicitar reserva ]
```

It answers the visitor's second question ("how much will this cost me") continuously, in her own vendor's handwriting-adjacent format, and it carries the event date forward so brief 02's availability engine has somewhere to land. It is the same object on the home page, the catalog, the item detail and the campaign landing page.

## 6. The photography treatment — **"La vitrina"**

The hardest real constraint: WhatsApp photos, uneven light, mixed ratios, busy backgrounds, no budget for better. The system doesn't filter them — it **contains** them.

1. **Two ratios only.** 1:1 for grids and thumbnails, 4:5 for item detail. No exceptions anywhere.
2. **Always matted.** Every photo sits inset inside a `--papel` card with a `--piedra` hairline and real padding. A photo never bleeds to the card edge and never bleeds to the page edge. The mat is what makes a badly framed shot read as *chosen*.
3. **Small and plural by default.** Big single photos appear only on the item detail page, where the visitor has explicitly asked to see the thing. At 88px in a grid, bad focus and bad light stop mattering.
4. **Shared grain.** A ~1KB tiled noise overlay at ~4% `multiply` across every photo. Different phones and different lighting stop looking like different sources and start looking *printed on the same stock*.
5. **A 6% temperature wash**, not a duotone. Levels warehouse fluorescent against outdoor daylight — but never enough to lie about color, because a customer choosing a tablecloth or a chair is choosing the actual color.
6. Explicit `width`/`height`, `sizes`, `loading="lazy"`, and a `--piedra` placeholder block. No layout shift on a slow connection.

## 7. Accessibility & performance floor

- Contrast, measured against the shipped values (see `DESIGN-TOKENS.md` for the full table): ink on limewash **11.62** · white on ink **14.00** · green on limewash **5.32** · white on mamey **5.02** · mamey-text on limewash **4.73**. All pass AA for body text.
- Visible keyboard focus on every interactive element, from the first component.
- `prefers-reduced-motion` collapses transforms to opacity — reduced, not removed.
- Motion budget (per the Emil Kowalski skill now installed in this repo): drawer 300ms `cubic-bezier(0.32, 0.72, 0, 1)`; press feedback `scale(0.97)` at 140ms; catalog reveal staggered 40ms on first paint only; hover effects gated behind `@media (hover: hover)`. **The tally total does not animate** — it changes on every tap, and frequency of use says make it instant.
- No animation library. CSS transitions only, so nothing drops frames while the page is still loading over 3G.

## 8. The aesthetic risk, stated and justified

**The site is typeset as a price list, not as a brochure.** On every card and every category row, the córdoba figure is set larger and heavier than the product name — 34px Archivo Expanded 800 against a 17px name. Category pages read as a *tarifario*.

Why this is the right risk here:

- The brief names price transparency as a feature and "how much will this cost me" as one of two questions the visitor actually has. Most rental sites in this category bury price behind "solicitar cotización." Doing the opposite is both a differentiator and a kindness.
- It is the one move that **structurally** solves the photography problem instead of cosmetically. If the number carries the page, the photo only has to support it, and the imperfect photo is never the star.
- It sets up brief 02 honestly: the admin panel is numbers-dominant, and these are its tokens.

The risk it carries: it can tip toward wholesale-hardware-catalog. Guarded by the limewash ground, the 10px radii, and the mat around every photo — none of which a hardware catalog has.

## 9. Self-critique against the brief's named defaults

| Default to avoid | Where I landed |
|---|---|
| Cream + high-contrast serif + terracotta | Limewash green-grey `#E8EBE4`, **no serif anywhere**, orange-red rather than terracotta, green as the structural color |
| Near-black + one acid accent | `--tinta` is a green-black used *only* for the hoja, the footer and one home section. The dominant surface is light. The accent is not acid. |
| Broadsheet grid, hairlines, zero radius | Caught this on review: the ruled rows were drifting broadsheet. Fixed — **radii are not zero** (10px cards, 8px controls, which also reads softer for the older admin users), and rules appear *only inside la hoja*, where they encode a real form rather than decorate a page. |
| Numbered markers 01 / 02 / 03 | Used only in the request form, where it is a genuine sequence (paso 1 → 2 → 3). |
| Wedding-industry blush/script/soft-focus | None present. Gold deliberately excluded from the palette despite gold Tiffany chairs. |

Changed on review: the palette originally carried a brass/ochre fifth accent for prices. Cut — it was the accessory to remove, and it was pulling the whole thing toward the wedding vocabulary the brief rules out. Prices are now `--tinta` and `--mamey`, which is louder anyway.

## 10. Technical approach

- **Next.js App Router + TypeScript**, deployed to Vercel.
- **Tailwind v4 with a hand-authored `@theme` layer.** Every token above is a real CSS custom property; Tailwind is only the ergonomics on top. The later admin panel can consume `tokens.css` directly without a rewrite — that constraint from the brief is what rules out a config-file-only or CSS-in-JS approach.
- Component primitives built once and reused: `Button`, `Input`, `Select`, `Field`, `Card`, `Badge`, `Drawer`, `Modal`, `QuantityStepper`, `PhotoFrame`.
- `next/font` for both families, subset `latin`, self-hosted, no network font request.
- Mock catalog in `src/data/catalog.ts`, shaped like the eventual database row so swapping the source is a one-file change.
- Deliverable doc: `DESIGN-TOKENS.md` so brief 02 has something to build on.

## 11. Mock data — real categories, plausible prices

Categories exactly as the business uses them: **Sillas · Mesas · Mantelería · Cristalería · Decoración · Caballo Bayo.**

Indicative prices per 24 h, in córdobas — these are estimates and **need the owners' correction before launch**:

| Item | C$ / 24h |
|---|---|
| Silla plástica | 12 |
| Silla Garden | 22 |
| Silla Tiffany dorada | 40 |
| Silla infantil | 10 |
| Mesa redonda para 10 | 120 |
| Mesa rectangular | 100 |
| Mesa infantil | 60 |
| Mantel redondo | 70 |
| Faja para silla | 10 |
| Copa de vino | 7 |
| Plato | 5 |
| Arco metálico | 700 |
| Pozo de los regalos | 800 |
| Silla trono | 1,000 |
| Cubículo de hierro y madera | 400 |
| Chafing dish (Caballo Bayo) | 300 |
