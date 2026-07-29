# Design tokens — Alquifiestas y Eventos

Every token lives in [`src/app/globals.css`](src/app/globals.css) inside a Tailwind v4 `@theme` block, which emits each one as a real CSS custom property on `:root`. Tailwind is only the ergonomics on top.

**The admin panel (brief 02) can consume this file directly.** It does not need Tailwind, a config file, or a build step to use these values — `var(--color-ink)` works in any stylesheet that imports the same CSS.

```
┌──────────────────────────────────────────────┐
│  globals.css  @theme { --color-ink: … }      │  ← the source of truth
├──────────────────────────────────────────────┤
│  :root { --color-ink: #12312b }              │  ← what ships
├───────────────────────┬──────────────────────┤
│  Tailwind utilities   │  Plain CSS           │
│  bg-ink  text-ink     │  var(--color-ink)    │
└───────────────────────┴──────────────────────┘
```

---

## Colour

The palette is sampled from the town, not from a mood board: limewashed walls, the deep institutional green of painted public woodwork (park benches, church doors, window frames), and the fruit-orange of the Meseta.

There is deliberately **no gold**, even though the Tiffany chairs are gold. The photographs already carry it, and putting it in the palette tips the whole system into the wedding-industry look this business does not belong to.

### Palette

| Token | Value | Where it goes |
|---|---|---|
| `--color-limewash` | `#e8ebe4` | The page ground. Chalky off-white with a green-grey cast — **not cream** |
| `--color-paper` | `#f4f6f1` | Cards, raised surfaces |
| `--color-paper-warm` | `#fbfcf9` | Inputs and controls, the highest surface |
| `--color-green` | `#186b57` | Brand. Eyebrows, category marks, selected states |
| `--color-green-dark` | `#0f4a3b` | Green pressed / hover |
| `--color-green-tint` | `#d9e3dd` | Selected wash behind option cards |
| `--color-ink` | `#12312b` | Body text, and the dark grounds. A green-black, never neutral |
| `--color-ink-soft` | `#244a41` | Raised surface on a dark ground |
| `--color-ink-muted` | `#8fa79e` | Secondary text on dark grounds |
| `--color-mamey` | `#c7401f` | The action colour. Button fills, focus ring |
| `--color-mamey-text` | `#b93a1b` | Same hue darkened, for accent **text on light** |
| `--color-mamey-dark` | `#a33418` | Pressed |
| `--color-mamey-tint` | `#f6e2db` | Scarce-stock badge |
| `--color-stone` | `#a8ac9e` | Image placeholder, disabled |
| `--color-stone-text` | `#555c4f` | Secondary text on light |
| `--color-rule` | `#d2d7ca` | Hairlines |
| `--color-rule-strong` | `#b9c0b0` | Hairline on hover, drag handle |

### Semantic aliases

Prefer these in new work — they survive a palette change.

`--color-surface` · `--color-surface-raised` · `--color-surface-input` · `--color-text` · `--color-text-muted` · `--color-border` · `--color-accent` · `--color-brand`

### Contrast, measured

Computed from the shipped values, not estimated. All pass WCAG AA for normal body text (4.5:1).

| Pair | Ratio |
|---|---|
| `ink` on `limewash` | **11.62** |
| `white` on `ink` | **14.00** |
| `stone-text` on `paper` | **6.37** |
| `stone-text` on `limewash` | **5.75** |
| `ink-muted` on `ink` | **5.46** |
| `green` on `limewash` | **5.32** |
| `white` on `mamey` | **5.02** |
| `mamey-text` on `limewash` | **4.73** |

> `--color-mamey` (`#c7401f`) on limewash is only **4.14:1**. Use it as a *fill* with white text, never as text on the light ground — that is what `--color-mamey-text` exists for. This is the one trap in the palette.

---

## Type

Two families, both variable, both subset to `latin`, both self-hosted through `next/font`. No network font request, which matters on Nicaraguan mobile data.

| Role | Family | Why this one |
|---|---|---|
| Display | **Archivo** at `wdth: 125`, `wght: 800` | Wide, heavy, flat-sided. The letterform of a hand-painted Nicaraguan *rótulo* — the signage vernacular the business already lives inside. Costs no extra download because it is the body face on a different axis |
| Body / UI | **Archivo** at `wdth: 100`, `wght: 400–600` | Omnibus-Type, an Argentine foundry: the `ñ` and the accents are drawn, not bolted on |
| Utility | **DM Mono** `400 / 500` | Quantities, dates, item codes, the running tally. Monospace here encodes something true — this is a *counted* inventory whose own artifact is a ruled sheet |

Applied through three utilities, not ad-hoc classes: `type-display`, `type-label`, `type-mono`.

### Scale

**The base is 17px, not 16.** The admin panel inherits this and gets used daily, in a hurry, in a warehouse, by two people in their sixties. Setting it generously now is cheaper than overriding a cramped default later — do not reduce it.

| Token | px | Use |
|---|---|---|
| `--text-2xs` | 11 | Mono labels only, always uppercase and tracked |
| `--text-xs` | 13 | Fine print, mono captions |
| `--text-sm` | 15 | Secondary text, hints |
| `--text-base` | **17** | Body. The floor for anything a customer reads |
| `--text-lg` | 19 | Lead paragraphs |
| `--text-xl` | 22 | Card headings |
| `--text-2xl` | 27 | Section headings |
| `--text-3xl` | 34 | **The price size on a card** |
| `--text-4xl` | 44 | Page headings, detail-page price |
| `--text-5xl` | 56 | Hero, desktop |
| `--text-6xl` | 72 | Hero, large desktop |

Numbers use `tabular-nums` everywhere a figure can change, so a total never reflows as it updates.

---

## Radii

Explicitly **not zero**. Softer edges read better for the older admin users, and they keep the ruled sheet from drifting into a broadsheet pastiche.

`--radius-sm` 6px · `--radius-md` 8px (controls) · `--radius-lg` 10px (cards) · `--radius-xl` 14px · `--radius-2xl` 20px (sheet)

## Shadows

Green-tinted, never neutral grey — a grey shadow on this ground reads as dirt.

`--shadow-sm` · `--shadow-md` · `--shadow-lg` · `--shadow-sheet` (throws upward, for the bottom sheet)

## Layout

`--tap-target: 48px` — the minimum interactive size, everywhere, no exceptions.
`--container-max: 1180px`

---

## Motion

The built-in CSS easings are too weak to feel intentional. Use these.

| Token | Curve | For |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | Anything entering or exiting, and all press feedback |
| `--ease-in-out` | `cubic-bezier(0.77, 0, 0.175, 1)` | Elements already on screen moving from A to B |
| `--ease-sheet` | `cubic-bezier(0.32, 0.72, 0, 1)` | The bottom sheet only |

| Token | Duration | For |
|---|---|---|
| `--duration-press` | 140ms | Button press |
| `--duration-fast` | 180ms | Hover, colour, small state changes |
| `--duration-mid` | 240ms | Reveals, image scale |
| `--duration-sheet` | 300ms | The sheet |

### Rules this system follows

- **Never `ease-in` on UI.** It delays the first movement, which is exactly the moment the user is watching.
- **Never `transition: all`.** Name the properties.
- **Only `transform` and `opacity`** animate, so motion stays on the GPU.
- **CSS transitions, not keyframes,** for anything that can be re-triggered quickly — a transition retargets mid-flight, a keyframe restarts from zero.
- **Nothing animates from `scale(0)`.** Entrances start at `0.95` with opacity.
- **Hover effects are gated** behind `@media (hover: hover) and (pointer: fine)` — touch devices fire hover on tap.
- **The running total does not animate.** It changes on every tap; frequency of use says make it instant.
- **`prefers-reduced-motion` reduces, it doesn't erase.** Movement goes, meaningful fades stay.

Utilities: `press` (scale 0.97 on `:active`), `lift` (hover raise, pointer-gated), `rise` (first-paint reveal, staggered 40ms per item).

---

## Photography — "la vitrina"

Not a token exactly, but a system rule that everything inherits. See [`PhotoFrame`](src/components/ui/PhotoFrame.tsx).

The image library is WhatsApp photos: uneven light, bad framing, mixed ratios, busy backgrounds, and there is no budget for better. The treatment does not filter them, it **contains** them:

1. **Two ratios only** — 1:1 for grids, 4:5 for detail. No exceptions anywhere in the product.
2. **Always matted** — the photo sits inset in a card with real padding and never bleeds to the card edge or the page edge. The mat is what makes a badly framed shot read as *chosen*.
3. **Small and plural by default** — big single photos appear only where the visitor has explicitly asked to see the thing. At 76px, soft focus stops being visible.
4. **A shared grain** (`grain` utility, ~1KB inline SVG, 5% multiply) so different phones stop looking like different sources and start looking printed on the same stock.
5. **A 6% temperature wash** (`temper` utility) levelling warehouse fluorescent against outdoor daylight — deliberately *not* a duotone, because someone choosing a tablecloth is choosing the actual colour.
6. **Reserved layout** — an aspect-ratio box and a `--color-stone` placeholder mean nothing shifts on a slow connection.

---

## Component primitives

All in `src/components/ui/`, all built on the tokens above, all intended for reuse by the admin panel.

`Button` · `Input` · `Textarea` · `Select` · `Field` · `OptionCard` · `Badge` · `PhotoFrame` · `Price` · `QuantityStepper` · `Sheet` · `icons`

### Notes for brief 02

- `QuantityStepper`'s number is a real text input, not a display. Somebody renting 150 chairs is not going to tap "+" 150 times, and that is a normal order here. Keep it that way in the admin panel.
- `Sheet` already handles drag-to-dismiss with velocity, body scroll lock, Escape, focus restore and reduced motion. Reuse it rather than writing a modal.
- `Button` sizes: `sm` 44px, `md` 52px, `lg` 60px. Nothing smaller than 44px is acceptable anywhere.
- The focus ring is defined once, at real specificity (not `:where()`), with an `.on-ink` variant that switches it to white. Put `class="on-ink"` on any dark-ground container and focus keeps working.
