# Brief 02 — Data Model, Availability Engine & Live Catalog
**Project:** Alquifiestas y Eventos
**Depends on:** Brief 01 (public site + design foundation, already built) and its `DESIGN-TOKENS.md`, which is authoritative for anything visual.
**Written in English for the model. The product itself is 100% in Spanish — see "Language" below.**

---

## Why this brief exists

Brief 01 delivered the public site and the design system, running on mock data. This brief makes it real: it builds the database, the rental-availability engine, and connects the existing public pages to live data so a customer's reservation request actually gets stored.

**This is the highest-risk piece of the whole project.** Rental availability is not stock counting, and getting the model wrong here is expensive to fix later. Read the availability section carefully before writing any schema.

The full business specification lives in `alquifiestas-y-eventos-spec.md`. It is authoritative — where this brief and the spec disagree, ask.

## What to build

1. **Database schema** on Supabase Postgres, covering catalog, customers, orders, returns, payments and charges.
2. **The availability engine** — a single, well-tested module that answers "how many units of item X are free between date A and date B", used identically by the public site and (later) the admin panel.
3. **Catalog seeding** from the existing Odoo catalog.
4. **Wire the public site to real data** — catalog listing, item detail and the reservation request form now read and write real records.
5. **Reservation requests persist** as `solicitud pendiente`, with the availability check running against real data.

## Explicitly out of scope for this brief

- The admin panel (next brief). No order management UI, no inventory editor.
- WhatsApp notifications.
- Paper-invoice scanning (phase 2).
- Online payment (never in scope).
- Any redesign of what Brief 01 produced — reuse the existing tokens and components as they are.

Staff-facing operations (confirming a request, recording returns, registering payments) need to exist as **data model and server-side functions** now, because the schema has to support them, but they need no UI in this brief.

## Language

- **Code, table names, column names, function names, comments, commit messages: English.**
- **Every user-visible string: Spanish** (Nicaraguan, natural). This includes validation messages, availability warnings, empty states and confirmation text.
- **Seed and catalog data: Spanish**, using the business's real category and item names (Sillas Tiffany, Mesa redonda para 10 personas, Pozo de los regalos, Caballo Bayo, etc.).
- Currency is the córdoba, displayed as `C$`. Store money as integers in centavos or as `numeric`, never as float.
- Store timestamps in UTC; render in Nicaragua time (UTC−6, no daylight saving).

## Data model

Design the schema yourself, but it must express the following business reality. These are requirements, not table definitions.

### Catalog — products, variants, and the rentable unit

The real data has variants, and this is the single most important structural fact in this brief. **Price and availability live on the variant, not on the product.**

- **Categories** with a display order, since the public site groups by them. The source data has a two-level shape (`Cristalería / Copas`, `Mantelería / Manteles`), so model parent and child rather than flattening.
- **Products** — the thing with a name, a description, photos and a category. *Cilindros*, *Mesa Redonda para 10 personas*, *Cortinas*.
- **Variants** — the thing that is actually rented, priced and counted. *Cilindros (Grande)*, *Mesa Redonda para 10 personas (Madera)*. In the real catalog 19 of 105 products have variants, ranging from 2 to 6 each, distinguished by size, colour or material.

A product with no variants must still work. Handle this with a **single implicit variant** rather than two code paths — every product has at least one variant, and a product with exactly one just doesn't show a variant selector. Do not write "if the product has variants" branches through the availability engine, the order lines or the UI; that duplication is where the bugs will live.

**The rentable unit — the variant — is what carries:** price per 24 hours, total quantity owned, and the availability calendar. An order line references a variant, never a product.

Items are **quantity-tracked, not unit-tracked** — the business owns "100 sillas Tiffany", not one hundred individually numbered chairs. Do not build per-unit serial tracking. Total quantity must be reducible when an item is destroyed and never replaced (see Returns), so treat it as a mutable field with an audit trail, not a constant.

### Incomplete data is the normal state, not an error

The catalog is being seeded from an Odoo export that **does not contain prices or quantities**, and there will be no second export. The business is going live with gaps and filling them in from the admin panel as it goes — that is a deliberate decision, because entering this data through the new system is faster than any manual alternative.

So the schema and every code path must treat missing price and missing quantity as **legitimate states**, not as validation failures:

- `price_per_day` is **nullable**. A variant with no price cannot be publicly bookable, but it must exist, be searchable, and be quotable by staff who know the price by heart.
- `total_quantity` is **nullable**, and null means *unknown*, which is not the same as zero. Unknown quantity must never be treated as "none available".
- The availability engine returns `unknown` for a variant with no total quantity — not `0`, and not an error. Downstream this surfaces as a warning, consistent with warn-don't-block.
- The public catalog shows a variant only when it is published **and** has a price. Everything else exists internally and is invisible to customers.
- Nothing in the import, the schema constraints or the UI may reject a record for missing price or quantity.

**Expose the gaps as a working queue, not as a report.** Staff need to see what's missing and fix it in as few taps as possible — that queue is how the catalog actually gets completed. The admin screen for it comes in the next brief, but the data model and the queries that feed it belong here: be able to answer "which variants are missing a price" and "which are missing a quantity", ordered so the most-rented categories come first.

### Customers

Name and phone are the only required fields — that's all the business reliably captures today. Everything else (email, address, RUC, notes) is optional. Phone should be usable for WhatsApp later.

Roughly a quarter of the seeded contacts have **no phone at all**. Import them anyway; they are historical names the owner recognises. Just don't build anything that assumes a phone is present.

### Orders

An order carries the customer, the status, the lines, and **three distinct dates**:

| Field | Meaning |
|---|---|
| `pickup_date` | When the customer takes the items. The billing clock starts here. |
| `agreed_return_date` | When it was agreed they'd come back. |
| `actual_return_date` | When they actually came back and staff marked receipt. Null until fully returned. |

Two things follow from this that a naive model gets wrong:

- **The billed period and the out-of-warehouse period are different things.** The customer may arrange to pick up a day early for convenience without being charged for that extra day. Model the billed day count separately from the occupied date range — do not derive one from the other.
- **Availability is released by `actual_return_date`, never by `agreed_return_date`.** Until staff marks items received, they stay committed.

Also on the order:
- Fulfilment: pickup at the shop (default) or delivery requested. If delivery, capture the address and leave the delivery cost null until staff quotes it with a transporter — **never calculate a delivery price**.
- Payment method chosen by the customer: cash or bank transfer.
- Optional security deposit (`depósito de garantía`) amount.
- Optional order-level discount.
- Optional `physical_invoice_number` — the number of the handwritten pre-printed fiscal invoice, so the digital record links to the legal document. See the spec's fiscal section; the system issues an internal comprobante only.
- Free-text notes.

Order status should reflect the real lifecycle: pending request → confirmed/proforma → picked up → returned (fully or partially) → closed, plus cancelled. Model status transitions explicitly rather than letting arbitrary jumps happen.

### Order lines

Each line: item, quantity, unit price at time of booking (**snapshot it — do not join to the current catalog price**), optional line-level discount.

Discounts, at both line and order level, must support **either a fixed amount or a percentage**, must always be entered manually by staff, and must be stored as their own field so reports can compare list price against what was actually charged. **There are no automatic discount rules of any kind.**

### Returns (including partial)

Returns are events, not a boolean. A line can be returned across several events — rare, but it happens (80 of 100 chairs come back, the rest the next day). Each return event records: which line, how many units, the date, and how many of those were **missing** or **damaged**.

- Returned units release availability from the return date onward.
- Missing and damaged units produce a charge (below) and do **not** release availability as usable stock.
- If an item is destroyed and won't be replaced, staff can reduce the item's total quantity. Keep an audit record of why.

### Payments and charges

- An order can have **multiple payments** over time, each with amount, date and method. A ~50% `anticipo` to hold a date is common but not universal, so partial payment is the normal case — never assume a single settling payment.
- **Charges** are separate line items added to an order: late-return fee, damage fee, missing-item fee, delivery cost.
- **Late fees are never calculated.** The system only flags an order as overdue; the amount is always typed in by staff, because in practice it's relative — a few hours late usually isn't charged, a full extra day usually is, and the amount may be a percentage or the entire invoice.
- The order should expose a computed balance: total charged − total paid, with the deposit tracked separately so it can be returned or applied against damages.

### Fiscal readiness (build the fields, don't use them yet)

The system issues an **internal comprobante only**, not a fiscal document. But leave the model prepared: consecutive numbering capability, business and customer RUC fields, a tax-breakdown structure, and a hard rule that issued documents are **voided, never deleted or rewritten**. Enforce the void-not-delete rule at the database level now, even though nothing fiscal is being emitted yet.

## The availability engine

This is the core of the system. Build it as one module with a clear API, thoroughly unit-tested, used by every caller. Never let a second availability calculation exist anywhere in the codebase.

### The question it answers

> For item X, over the date range [start, end], how many units are free — and if not enough, what exactly is blocking them?

### How occupancy is computed

For each item, on each day in the range, occupied units come from every order line whose occupied range covers that day:

- **Order fully returned:** occupies `pickup_date` through `actual_return_date`.
- **Not yet returned, agreed return date is today or later:** occupies `pickup_date` through `agreed_return_date` (the planned commitment).
- **Not yet returned and past the agreed return date (overdue):** occupies `pickup_date` onward **with no end date**, until receipt is recorded. An overdue order keeps blocking future dates — that's deliberate, it's what prevents overselling when a customer doesn't come back on time.
- **Partially returned:** occupied quantity on a given day is the line quantity minus the units returned on or before that day.
- Cancelled orders occupy nothing.

Availability for the range is the **minimum** free quantity across every day in it — one blocked day blocks the whole booking.

### It must answer for a whole catalogue page at once

The design system built in Brief 01 already includes a **scarce-stock badge** (`Badge` on `--color-mamey-tint`). That badge only works if the catalogue listing knows, for every item on the page, how many units are free for the dates the visitor selected.

So the engine needs **two entry points, sharing one implementation**:

- Single item over a range — used by the item detail page and the request form.
- **Batch: many items over one range, in a single query** — used by the catalogue listing.

Do not solve the listing by calling the single-item function in a loop. Design the batch query first and express the single-item case in terms of it. Getting this backwards produces an N+1 that will be painful to unwind once the listing depends on it.

If the visitor has not chosen dates yet, the listing falls back to total quantity owned and shows no availability badge at all — never show a stale or assumed availability figure.

### It warns, it does not block

This is a product requirement, not a technical preference, and it comes directly from why Odoo failed here.

- The engine **returns a result**; it does not throw and does not veto. The result says how many are free, how many are short, and which orders are causing the conflict.
- Public site: insufficient availability should stop the customer from submitting that combination and explain it clearly in Spanish.
- Staff (later, in the admin panel): the same shortage shows as a **prominent warning that can be overridden**, because the owner sometimes borrows stock from another business or knows an order is coming back early. When overridden, persist an override flag and an optional reason so it's visible afterwards.

Design the API so the override path is available from the start — do not build a hard constraint now and try to soften it later.

### Concurrency

Two people can book the same chairs at the same moment — one on the website, one standing at the counter. Check availability inside the same transaction that writes the order, so the check and the write can't drift apart.

### Testing

Write real tests for this module. At minimum cover: exact-boundary bookings (one returns the day another starts), overdue orders blocking future dates, partial returns releasing partial availability, multi-day ranges where only one interior day is short, and cancelled orders freeing stock.

## Data sources — what exists, what doesn't

Two cleaned CSV files are provided. They were produced from an Odoo Online export by a repeatable cleaning script (`clean_odoo_export.py`), which flattened Odoo's multi-row relational export, extracted database IDs, normalised accents in category names, fixed one miscategorised rental recurrence, and normalised phone numbers.

**There will be no further Odoo export.** Work with these files. Do not design anything that assumes more source data is coming.

### `catalogo-limpio.csv` — 134 rentable units across 105 products

One row per rentable unit. Products without variants produce a single row.

| Column | Notes |
|---|---|
| `db_id` | Odoo product ID. Shared by all variants of a product — **not** a unique key for a row |
| `producto` | Product name |
| `variante` | Variant label (`Grande`, `Madera`, `Blanco Liso`). Empty for products without variants |
| `unidad_alquilable` | Product + variant combined. Unique per row |
| `categoria_principal` / `subcategoria` | Two-level category, already accent-normalised |
| `categoria_sitio_original` | The Odoo website category, kept for reference. Frequently empty or redundant — **prefer the two columns above** |
| `recurrencia` | Always `Diariamente` |
| `publicado` | `si` / `no`. 82 units yes, 52 no |
| `precio_24h` | **Empty in every row.** Not in the export |
| `cantidad_total` | **Empty in every row.** Not in the export |
| `nota_interna` | Staff notes from Odoo — *"Stock desactualizado"*, *"Los 3 valen 500"*. **Internal only, never publish these** |
| `url_producto` | Public shop URL, empty for unpublished products |
| `url_imagen` | Image URL on the current Odoo site |

Import **all 134 units, including the 52 unpublished ones.** They are real inventory the owner needs in the admin panel; they are simply not shown to customers. Preserve the published flag.

### `contactos-limpio.csv` — 159 contacts

`db_id`, `nombre`, `telefono`, `telefono_alt`, `email`, `ciudad`, `ruc`. Phones are normalised to `+505XXXXXXXX`. The 122 contacts with a phone come first; the 37 without one are at the end of the file. Email, city and RUC are almost always empty. Import all of them.

### Photos

Not in the CSV. Fetch them from the `url_imagen` column, store them in the project's own image storage, and generate the two crops the design system requires. **Do not hotlink the old Odoo site** — that instance is being shut down once its subscription lapses, and any hotlinked image would die with it.

Photos are per product, not per variant; a variant with no photo of its own falls back to the product's.

**Expect a significant number of these fetches to fail.** The 42 unpublished products very likely do not expose their images publicly, and some products have no image at all. This is expected, not an error condition:

- A failed or missing image marks the product as **pending a photo** and moves on. The import never retries in a loop, never aborts, and never fails a record because of an image.
- Pending-photo products render the design system's placeholder, exactly like any other product without a photo.
- Log which products ended up pending, in a form the admin panel can query — this is the third gap queue alongside missing price and missing quantity. Staff will upload those photos themselves later.

The photo import should be **runnable on its own**, separate from the data import, so it can be re-run to pick up images that become available. Run it early: whatever is publicly reachable today should be copied before the Odoo subscription lapses, because after that it is gone for good.

### Prices, and why they aren't here

Prices exist on the public shop pages (`url_producto` shows e.g. `30,00 C$ por 24 Horas`), so they can be recovered later by scraping. **This is not part of this brief.** The variant-level price is behind a JS selector on those pages, so a scrape only reliably yields the default variant's price, and it covers none of the 52 unpublished units.

The decision has been made to launch without prices and enter them through the admin panel. Build for that. If a price-recovery script is written later it becomes an optional pre-fill, never a dependency.

### The import script

Write it as a **repeatable, idempotent import** keyed on `unidad_alquilable`, not a one-off seed file. It will be re-run as the source files are corrected, and re-running must not create duplicates or overwrite prices and quantities that staff have already entered by hand. **Data entered in the admin panel always wins over data from the import.**

## Inherited from Brief 01 — do not re-decide these

`DESIGN-TOKENS.md` documents the design system already built. It is authoritative. This brief consumes it; it does not modify it.

The parts that impose real requirements on the data layer:

- **Photography is limited to two aspect ratios: 1:1 for grids, 4:5 for detail. No exceptions.** This is a constraint on the **image pipeline**, not just on CSS. The Odoo photos arrive in mixed ratios, so the import must produce both crops per item, and the schema must store both. Do not import an original and leave the cropping to the browser — a badly framed WhatsApp photo cropped by CSS is exactly the failure the matting system exists to prevent. Where an automatic centre crop is clearly wrong, the schema should allow a stored focal point or a manually chosen crop so it can be fixed later from the admin panel.
- **Layout is reserved before images load** — store intrinsic dimensions, or at minimum guarantee the two known ratios, so nothing shifts on a slow connection.
- **`QuantityStepper` takes a typed number, not only +/− taps.** Renting 150 chairs is an ordinary order here. Whatever validation the request form applies must accept a directly typed quantity, and the availability check must handle large quantities without the UI having assumed small ones.
- **`Price` uses `tabular-nums`, and money is formatted in córdobas as `C$`.** Keep formatting in one shared helper. Never format money ad hoc at a call site, and never store it as a float.
- **`Sheet`** already handles drag-to-dismiss, scroll lock, Escape, focus restore and reduced motion. Any confirmation or explanation surface this brief needs reuses it rather than introducing a modal.
- **Tokens are plain CSS custom properties**, consumable without Tailwind. Nothing in this brief should make them harder to consume from a future admin panel — in particular, don't bury values in component-local styles.
- **`--tap-target: 48px` and a 17px base size are floors, not defaults.** They exist because the daily users are in their sixties, on a phone, in a warehouse. Nothing added here goes below them.

## Wiring the public site

- Catalog listing and item detail now read from the database instead of mock data.
- **Only variants that are published and have a price appear publicly.** A product whose variants are all priceless doesn't appear at all; a product with a mix shows only the priced ones, and the variant selector must not offer an option the customer can't actually book.
- Item detail shows the variant selector for products that have real variants, and no selector at all for those that don't.
- The reservation request form runs a real availability check for the selected date range before allowing submission. Where a variant's total quantity is unknown, the check returns `unknown` — treat that as bookable and let staff confirm, rather than blocking the customer or claiming a quantity the system doesn't have.
- Submitting creates an order in `solicitud pendiente` status with its lines (each referencing a **variant**), the chosen fulfilment method, the chosen payment method, and a new or matched customer record.
- Confirmation screen makes it unmistakably clear, in Spanish, that this is a **request, not a confirmed booking** — the business will contact them to confirm availability, and to quote the delivery cost if delivery was requested.
- If the customer chose bank transfer, show the account details, with a clear note not to transfer anything until the business confirms.
- Keep the multi-day date range from Brief 01: pricing is the 24-hour price multiplied by the number of days.

## Technical setup

- Supabase Postgres (free tier). The project already has a Supabase connection available.
- Next.js App Router on Vercel, same project as Brief 01.
- **No custom domain yet.** The site runs on its Vercel URL and everything — including the reservation flow — is tested there. `alquifiestasyeventos.com` still points at Odoo and stays that way until the new system is refined and the Odoo subscription lapses. Nothing may hardcode the final domain: canonical URLs, metadata, WhatsApp links, and any absolute URL come from a single environment variable so the cutover is a config change, not a find-and-replace.
- Use migrations for all schema changes — no schema edited by hand in a dashboard.
- Row-level security configured deliberately: the public site can read published, priced catalog entries and insert requests, and can read nothing else. No customer data, no orders, no unpublished inventory, no internal notes exposed to anonymous clients. The `nota_interna` field in particular must never be reachable from a public query.
- Images: keep the approach chosen in Brief 01. Since Supabase is already in the stack, use its storage rather than adding a second image service.
- The service role key belongs to the import scripts only. It must never reach anything that ships to the browser.

## Assumptions being made — flag if wrong

1. Items are quantity-tracked, not individually tracked.
2. Availability is computed at day granularity, not by the hour — a rental is a block of 24 hours or more, and same-day turnaround of the same units is not something the business does.
3. Two to three staff accounts will eventually exist, with the owner's account being the everyday one. Auth itself comes in the next brief; just don't design a single-user schema.
4. Delivery is always optional and always quoted manually, so there is no delivery pricing logic at all.
5. Variant labels in the source data are flat strings (`Grande`, `Madera`), not structured attribute/value pairs. Modelling them as a single label per variant is enough; a full attribute system is not needed.

## Definition of done

- Migrations create the full schema, with variants as the rentable unit, and the void-not-delete rule enforced in the database.
- Price and quantity are nullable end to end, and a variant missing either one imports cleanly, appears in the admin data, and is excluded from the public catalog without any special-casing at the call site.
- The availability module exists in one place, has a documented API, distinguishes `unknown` from `0`, and passes the test cases listed above.
- The import script loads all 134 rentable units and all 159 contacts from the provided CSVs, is safe to re-run, and never overwrites staff-entered data.
- Photos that are publicly reachable are copied off the Odoo site into the project's own storage, in both required crops; the rest are recorded as pending without failing the import.
- Queries exist to answer "which variants are missing a price", "which are missing a quantity" and "which products are missing a photo", ready for the admin panel to consume.
- A customer can complete a reservation request end to end and the order lands in the database with correct dates, variant-level lines, snapshotted prices and status.
- Availability shortages are explained to the customer in clear Spanish, and the override path exists in the engine's API ready for the admin panel.
