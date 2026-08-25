# Alquifiestas y Eventos

Public website for a family-run party and event rental business in San Marcos, Carazo, Nicaragua — 20 years in business, moving off Odoo.

## Where this stands

| Brief | |
|---|---|
| **01** — public site and visual foundation | built |
| **02** — schema, availability engine, catalog import | built |
| **02b** — price recovery off the old Odoo shop | built, 82/82 units recovered |
| admin platform — proformas, invoices, inventory | not started |

The site reads live data from Supabase and the reservation form writes real orders. **82 items are live in the catalog** — 74 priced from the recovered Odoo data, the rest carrying estimates so the site can be tested end to end.

> ⚠️ **There is invented data in the database right now.** 55 prices and 60 quantities are estimates, not numbers this business charges. `select * from estimated_values` lists them, and `pnpm db:clear-estimates` removes them. That view must be empty before a real customer sees the site.

- [`DATA-MODEL.md`](DATA-MODEL.md) — schema, availability rules, security, import and price recovery. **The reference for everything server-side.**
- [`DESIGN-PLAN.md`](DESIGN-PLAN.md) — the design direction and the reasoning behind it
- [`DESIGN-TOKENS.md`](DESIGN-TOKENS.md) — the token system, which the admin panel will inherit
- [`alquifiestas-y-eventos-spec.md`](alquifiestas-y-eventos-spec.md) — the full system spec, most of it still unbuilt

## Running it

```bash
pnpm install
```

Copy [`.env.example`](.env.example) to `.env.local` and fill it in. The file explains each variable; two of them matter enough to repeat here:

- `SUPABASE_SERVICE_ROLE_KEY` bypasses row-level security. It belongs to the scripts in `scripts/` only — never imported under `src/`, never prefixed `NEXT_PUBLIC_`.
- `SUPABASE_DB_URL` must be the **Session pooler** string. The direct host is IPv6-only and fails with `ENOTFOUND` on an IPv4 network; the scripts detect that and print the fix.

```bash
pnpm dev
```

```bash
pnpm build
```

## Routes

| Route | |
|---|---|
| `/` | Home |
| `/catalogo` | Full catalog, grouped by category |
| `/catalogo/[categoria]` | One category |
| `/catalogo/[categoria]/[articulo]` | Item detail, with variant picker |
| `/solicitar` | Reservation request — checks availability and writes a real order |
| `/contacto` | Address, croquis, hours, WhatsApp |

Catalog pages are statically rendered and revalidate every 5 minutes, so a price entered in the database appears without a deploy.

There is no `/campanas` route. Brief 01 shipped a campaign landing template against mock data; it was removed in brief 02 rather than carried forward pointing at variants that no longer existed. Rebuilding it against the real catalog is outstanding work.

## Scripts

```bash
pnpm scrape:test      # price-parser tests — no network, no database
pnpm scrape:prices    # recover prices off the live Odoo shop (resumable, cached)

pnpm import:build     # CSVs -> supabase/seed/*.sql
pnpm import:run       # apply the import          (needs SUPABASE_DB_URL)
pnpm import:photos    # copy photos off Odoo      (needs SUPABASE_SERVICE_ROLE_KEY)
pnpm import:prices    # load recovered prices and quantities  (--dry-run, --estimates)

pnpm db:test              # availability engine suite (needs SUPABASE_DB_URL)
pnpm db:migrations        # mirror applied migrations into supabase/migrations/
pnpm db:clear-estimates   # strip every invented price and quantity back out
```

The import is **idempotent** and keyed on `unidad_alquilable`. It never writes `price_per_day` or `total_quantity`, and never overwrites a name staff have edited — re-run it as often as the source CSVs are corrected. Details in [`DATA-MODEL.md`](DATA-MODEL.md).

## Data and availability

Loaded: **14 categories, 103 products, 129 variants, 159 customers.**

Three ideas carry the whole design, and [`DATA-MODEL.md`](DATA-MODEL.md) explains each properly:

1. **The variant is the rentable unit** — price, quantity and availability live there, never on the product.
2. **Missing data is a legitimate state** — a variant with no quantity is *unknown*, not zero.
3. **Availability is not stock counting** — it is driven by three dates per order, and an overdue order keeps blocking until somebody records receipt.

The engine **warns, it never blocks**: it returns a result the admin panel will be able to override. A hard block is what made Odoo unusable here.

Anonymous visitors have no table access at all. They get one view (`public_catalog`, published and priced only), one function to read counts, and one to create a pending request — verified with the publishable key, not assumed.

## Language

**Everything a visitor reads is in Nicaraguan Spanish.** Code, comments, variable names, filenames and commits are in English.

The vocabulary follows the business: *alquiler*, *proforma*, *cotizar*, *apartar*, *retirar en el local*, *entrega a domicilio*, *depósito de garantía*, *anticipo*. Prices are in córdobas, written `C$`, always **por 24 horas**.

## Photography

**63 of 103 products have real photographs**, copied off the old Odoo site into Supabase Storage in three sizes (`original`, `square` 1000×1000, `portrait` 1000×1250). The originals are kept so crops can be regenerated once Odoo is gone. Paths resolve through `photoUrl()` in [`src/lib/catalog.ts`](src/lib/catalog.ts).

The remaining **40 have no photo in Odoo either** — it serves a grey placeholder with a 200 rather than a 404, which is why the import calibrates itself against a known-missing product and rejects byte-identical responses. They are queued in `products_missing_photo`.

`public/catalogo/` still holds the 49 generated SVG placeholders from brief 01, and `pnpm photos` still regenerates them. **No page references them any more** — they are dead weight pending a decision to delete them.

When the missing photographs are supplied, upload them through Supabase Storage rather than this folder. [`PhotoFrame`](src/components/ui/PhotoFrame.tsx) is still a plain `<img>`; swapping it for `next/image` is a one-file change.

## Before this goes live

- [ ] **`select * from estimated_values` must come back empty.** 55 prices and 60 quantities are currently invented test data. Confirm each with the owners and mark it `staff`, or run `pnpm db:clear-estimates` to strip them.
- [ ] **The 8 `revisar` rows in [`precios-recuperados.csv`](precios-recuperados.csv)** — seven are variants the old shop never published, and *Aro Metálico* is stored in Odoo at a **per-hour** rate, not per 24 h.
- [ ] Decide whether the 47 unpublished variants should be sold online at all. They are priced but not published, so they stay invisible until someone says so.
- [ ] Real WhatsApp and phone numbers in [`src/lib/business.ts`](src/lib/business.ts) — the current ones are placeholders
- [ ] Real bank account numbers (same file, currently `TODO-000000000`)
- [ ] Confirm the business hours and the Google Maps pin
- [ ] Upload the 40 missing photographs
- [ ] Point `NEXT_PUBLIC_SITE_URL` at the real domain. Nothing hardcodes it, so the cutover is a config change — `alquifiestasyeventos.com` still serves Odoo until that subscription lapses.

## Not built

No admin panel and no authentication — staff still work from the handwritten membretadas, which remain the legal document. Any comprobante this system issues is internal only.

**No online payment. That is never part of this product.** Delivery is always quoted by hand, case by case: there is no delivery pricing logic anywhere, and there should not be. Late fees are never calculated and discounts are always manual.
