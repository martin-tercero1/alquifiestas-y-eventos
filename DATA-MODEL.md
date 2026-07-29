# Data model & availability — Alquifiestas y Eventos

Brief 02. Supabase project `gxjrbxtafkshgsimhzek` (`alquifiestas-y-eventos`, free tier).

The 11 migrations that build this schema live in [`supabase/migrations/`](supabase/migrations/). Re-mirror them after any change with `npm run db:migrations`.

> **Connect through the Session pooler, not the direct connection.** `db.<ref>.supabase.co` has no A record — it is IPv6-only and fails with `ENOTFOUND` on an IPv4 network. The scripts detect that and print the fix.

---

## The three ideas that shape everything

**1. The variant is the rentable unit.** Price, quantity and availability live on `variants`, never on `products`. An order line references a variant. Every product has **at least one** variant — a product with no real variants gets one implicit variant whose `label` is `NULL`. Nothing in the schema, the engine or the UI branches on "does this product have variants", because that duplication is where the bugs would live.

**2. Missing data is a legitimate state.** `price_per_day` and `total_quantity` are both nullable and the import never writes them. A variant with no price exists, is searchable, and is quotable by staff who know it by heart — it just cannot be booked online. A variant with no quantity is **unknown, not zero**.

**3. Availability is not stock counting.** What matters is not how many chairs are in the warehouse but how many are already committed and have not come back.

---

## Availability engine

One implementation: `availability_for_variants(uuid[], date, date)` in Postgres. Never write a second one.

### Occupancy, per order line, per day

| Case | Occupies |
|---|---|
| Cancelled order | nothing |
| Fully returned | `pickup_date` … `actual_return_date` |
| Out, not yet due | `pickup_date` … `agreed_return_date` |
| Out and **overdue** | `pickup_date` … **infinity** |

That last row is deliberate. An overdue order keeps blocking future dates until somebody records receipt, because the alternative is promising a customer chairs that are sitting in a stranger's patio. Availability is released by `actual_return_date`, **never** by the agreed one.

Availability over a range is the **minimum free quantity on any day in it** — one blocked day blocks the whole booking.

### Partial returns, and the subtlest rule in the system

A return event records `quantity_returned`, and of those, how many were `quantity_missing` or `quantity_damaged`.

```
usable = quantity_returned − quantity_missing − quantity_damaged
```

Only usable units release availability. Missing and damaged ones keep occupying the line — that is what stops the system re-renting stock it no longer has, in the window between "we found out" and "somebody fixed the total".

They stop occupying when staff write them off the variant's total via a `stock_adjustments` row linked to the return event, which bumps `quantity_written_off`. Without that link the loss would be counted **twice** — once as a lower total, once as permanent occupancy — and the business would slowly lose stock it actually owns.

### Three states, and conflating any two is a bug

| Status | Meaning |
|---|---|
| `available` | known quantity, enough of it |
| `short` | known quantity, not enough |
| `unknown` | `total_quantity` is null. **Not zero.** Bookable; staff confirm by hand |

### It warns, it does not block

The engine returns a **result**. It never raises and never vetoes. The public site uses it to stop a customer submitting an impossible combination; the admin panel will use the same result as an **overridable warning** — `orders.availability_overridden` and `override_reason` exist from day one, because the owner sometimes borrows stock from another business or knows an order is coming back early. A hard block is what made Odoo unusable here.

### Batch first

`availability_for_variants` takes an array because the catalogue listing needs every item on the page at once. `availability_for_variant` is defined **in terms of it**. Never loop the single-item version.

### Tests

21 assertions in `tests.availability_suite()`, run with `npm run db:test`. They run inside a rolled-back subtransaction, so the suite is safe against a database holding real orders.

Covered: exact-boundary handover, overdue blocking the far future, receipt releasing it, partial returns, worst-day-in-range, one short interior day, cancellation freeing stock, unknown ≠ zero, damaged units held until written off, batch/single agreement.

---

## Orders: three dates, two periods

| Field | Meaning |
|---|---|
| `pickup_date` | items leave. Occupancy starts |
| `agreed_return_date` | when it was agreed they'd come back |
| `actual_return_date` | when staff recorded receipt. Null until fully returned |

`billed_days` is **its own field**, not derived from the dates. An early pickup lengthens the occupied range without lengthening the bill.

Also on the order: fulfilment (`delivery_cost` is **always null until staff quote it** — there is no delivery pricing logic anywhere), payment method, optional deposit, optional manual discount (amount or percent, never automatic), `physical_invoice_number` linking to the handwritten membretada, and the override fields.

Status transitions are validated by trigger and recorded in `order_status_history`:

```
pending_request → confirmed → picked_up → partially_returned → returned → closed
       ↓              ↓
   cancelled      cancelled
```

> Reversing a status (undoing a mistake) is intentionally not allowed yet. Worth revisiting in brief 03 — a hard block is the failure mode that killed Odoo.

## Fiscal

The system issues an **internal comprobante only**. The pre-printed membretadas remain the legal document. `documents` is built ready: consecutive numbering, both RUC fields, tax breakdown, frozen `snapshot`.

**Void, never delete or rewrite** — enforced by two triggers at the database level, not in application code, because that is the one rule a future bug must not be able to break.

---

## Security

Row-level security is on for every table, and `anon` has **no table access at all**. It gets exactly three things:

1. `public_catalog` — a view exposing only **published + priced** variants, and only customer-safe columns
2. `availability_for_variants` — returns counts, never records
3. `submit_reservation_request` — creates a pending request

`products.internal_note` (staff notes like *"Stock desactualizado"*, *"Los 3 valen 500"*) is absent from the view and unreachable by any granted path. `availability_conflicts` exposes customer names and is revoked from `anon`.

The service-role key is confined to `scripts/` and never prefixed `NEXT_PUBLIC_`.

### Verified with the publishable key

Probed with the anon client rather than assumed:

| Target | Result |
|---|---|
| `products` (and `internal_note`), `variants`, `categories`, `product_photos` | `permission denied` |
| `customers`, `orders`, `order_lines`, `payments`, `documents` | `permission denied` |
| `availability_conflicts` (staff only) | `permission denied` |
| `public_catalog` | readable |
| `availability_for_variants` | callable |
| `submit_reservation_request` | callable |

A full anonymous booking was exercised end to end: the client read the catalog, booked 100 units (order created as `pending_request`, `billed_days` 3, price snapshotted, total C$ 12,000), then asked for 250 and got `{ok: false, error: "unavailable", available: 200}` with no order written. All test data removed afterwards.

---

## Staff access (brief 03)

Until brief 03 every table had RLS on and **no policies at all** — the public site reads one view and writes one `SECURITY DEFINER` function, so nothing else needed access. A logged-in staff user could not read a row.

The model is deliberately flat: there is no self-registration and the developer creates the two or three accounts by hand, so **any authenticated user is staff**. Roles and per-row ownership would be machinery guarding a situation that cannot arise, and machinery is what killed Odoo.

**"Nothing is ever deleted" is now structural.** `select, insert, update` are granted to `authenticated`; `delete` never is, and no delete policy exists. It stopped being a convention someone has to remember.

| Piece | |
|---|---|
| `staff` | one row per login, auto-created by a trigger on `auth.users` so a dashboard-created account just works |
| `created_by` / `updated_by` | on orders, lines, payments, charges, returns, customers. For answering *"who took this order?"*, not for policing |
| `staff_catalog` | like `public_catalog` but shows unpriced and unpublished variants — and carries `internal_note`, so it is staff-only |
| `search_variants` / `search_customers` | accent-, typo- and word-order-tolerant search |
| `create_staff_order` | one transaction; **never refuses** |

### Search ranking

Matching was the easy half. The first cut matched correctly and ordered uselessly — `manteleria` put *Bambalina* above *Mantel Cuadrado*, because a category hit scored the same as a name hit. Score is layered instead:

```
+1.00  every typed word appears in the product name
+sim   closeness to the product name   (catches "tifany" -> Silla Tiffany)
+0.25  every word appears once the category is included
+0.15  the category itself matches
```

Verified: `tifany` → Silla Tiffany · `manteleria` → the Mantel family · `mesa 10` → Mesa Redonda para 10 personas (1.70 vs 0.70 for the runner-up) · `comal grande` → the **Grande** variant at 2.01.

### create_staff_order refuses nothing

`submit_reservation_request` rejects what it cannot honour, because a stranger on the internet must not book chairs that do not exist. The staff function is the opposite: the owner is standing next to the customer and knows things the database does not. It writes the order, then computes availability and returns shortages **as data**, flagging `availability_overridden`. Computing it after the write is deliberate — `available < 0` then means precisely "oversold".

It also writes prices back: tick the box on a line and the typed price lands in the catalog marked `staff`, which is what stops a later import overwriting it. The catalog fills itself in as a side effect of real work.

### Verified with role impersonation

No login needed — `set role authenticated` plus a JWT claim:

| | |
|---|---|
| staff read orders, `order_totals`, `internal_note`, search | ok |
| staff **delete** orders / customers | `permission denied` |
| anon read `staff_catalog`, `staff`, search | denied |
| anon read `public_catalog` | 82 rows (correct) |

That probe caught a real hole: `staff` was created without `enable row level security`, so its policies were inert and Supabase's default grants left the family's names readable by anon. Fixed, plus `alter default privileges … revoke all on tables from anon` so the next new table fails closed.

### Order lifecycle

The status machine was enforced in brief 02 by `validate_status_transition`. Brief 03 added the actions the Detalle screen drives, all SECURITY INVOKER so RLS and `auth.uid()` apply: `confirm_order`, `record_payment`, `mark_picked_up`, `record_return`, `add_order_charge`, `cancel_order`, `close_order`.

Two fixes to the trigger came first: it logged every transition but **dropped `changed_by`**, and a cancellation had nowhere to record its reason. Both are now handled centrally — the trigger stamps `auth.uid()` and reads a transaction-local note that `cancel_order` sets.

Rules that live in these functions:

- **`record_return` handles partial returns.** It records per-line returned / missing / damaged, rejects a return that exceeds what is still out (*"quedan 40"*), and only sets `actual_return_date` — closing occupancy — once **every** line is fully accounted for. Missing and damaged units keep occupying until written off, exactly as [the return rule](#partial-returns-and-the-subtlest-rule-in-the-system) requires.
- **Late fees are never computed.** `add_order_charge` takes an amount; the system flags overdue and says nothing about how much.
- **Nothing blocks.** `create_staff_order` writes an oversold order and flags `availability_overridden`; the detail actions warn and proceed.

The over-clamped-availability bug lived here: `create_staff_order` first tested `available < 0`, but the engine clamps availability at zero, so an oversell never showed. Now tested against unclamped `peak_occupied > total_quantity`. Verified end to end via role impersonation: 50% anticipo, pickup, partial return, over-return rejection, damage charge, close — every status row carrying its author.

## Import

```bash
npm run import:build    # CSVs -> supabase/seed/*.sql
npm run import:run      # apply (needs SUPABASE_DB_URL)
npm run import:photos   # copy photos off Odoo (needs SUPABASE_SERVICE_ROLE_KEY)
```

Idempotent, keyed on `unidad_alquilable`. **Never writes `price_per_day` or `total_quantity`** — on insert or update. Names respect `name_overridden` / `label_overridden`, so an edit made in the admin panel survives a re-import.

Loaded: **14 categories, 103 products, 129 variants (82 published), 159 customers** (122 with a phone, 37 without).

### Deliberately not imported

- **`Transporte`** — the delivery service, not rentable inventory. Filed under Mesas in Odoo only because everything needed a category.
- **`Cortinas` (4 rows)** — the cleaning script split a two-attribute variant label on its comma, leaving `(Blanco`, `(Rojo`, `Grande)`, `Normal)`. The owner confirms it is not a product they rent often, so it stays out rather than carrying corrupt source data. Add it by hand from the admin panel if that changes.

### Accent repair

The export stripped accents from most product names. `scripts/import/name-corrections.mjs` holds an explicit, reviewed dictionary — *Silla Plástica*, *Taza para Café*, *Cubículos*, *Número 15*, *Cucharas de Jícara*, *Pequeño* — and the raw value is kept in `source_name` / `source_label`. Words the business genuinely spells that way (*Queque*, *Chafer Dish*, *Yacar*, *Buffette*) are left alone.

---

## Price recovery from Odoo

Brief 02b. The Odoo subscription is lapsing, and the CSV export omitted every price — so the prices were read back off the business's own live shop before the pages disappear.

```bash
npm run scrape:test               # parsing tests, no network
npm run scrape:prices             # resume (cached pages, no refetch)
npm run scrape:prices -- --refresh
npm run scrape:prices -- --limit 5   # writes *-parcial.csv, never over the real files
```

Output is **CSV only** — [`precios-recuperados.csv`](precios-recuperados.csv) and [`precios-fallidos.csv`](precios-fallidos.csv). It touches neither the database nor the cleaned seed files, because merging is a reviewable step and staff-entered data still wins over imported data.

**Recovered: 82 of 82 published units, 63 of 63 products, nothing failed.** 74 at `alta` confidence, 8 flagged `revisar`. Range C$4 – C$925, median C$66.50.

### The decimal separator

The shop renders `1.500,00 C$` — comma decimal, period thousands. Reading that as 1.5 would corrupt every four-digit price *plausibly*, which is why `parseLocalizedNumber` states the rule explicitly instead of calling `parseFloat`, and why [`parse-odoo.test.mjs`](scripts/scrape/parse-odoo.test.mjs) asserts the four-digit case from both directions.

Belt and braces: the price is taken from Odoo's `itemprop="price"` microdata, which is already machine-formatted (`1500.0`), and the rendered text is parsed only to cross-check it. The median printed at the end of the run is the third check — a median in the thousands would mean the separator flipped.

### Variant prices

The rendered page price belongs to the **default variant only**. Per-variant prices come from `/website_sale/get_combination_info`, the same endpoint the page's own JavaScript calls; combinations are read out of the variant selector and matched to `unidad_alquilable` by an accent-folded key, since the export stripped the accents the shop still has.

Two shapes of product needed distinguishing, and conflating them would have sent the owner back to a site that no longer exists:

- **Decorative attributes** — `Estilo 1…5`, `Color: Celeste`, `Forma: Redonda`. Every option carries the same price, and the CSV rightly treats them as one unit. Resolved at `alta`, with the options recorded in `notas`.
- **Unpublished variants** — the shop offers only `Forma: Redonda` while the backend export lists Cuadrado, Ovalado and Redonda. There is **no online price to recover**; the sibling price is copied across and the row says so.

### The 8 rows that need the owner

| Rows | Why |
|---|---|
| Aro Metálico ×2, Cofre (Metálico), Camino de Mesa ×3, Mesa Redonda (Plástico) | The shop never published these variants — the price shown is a sibling's |
| Aro Metálico (Redonda) | **Priced per 1 Hora in Odoo, not per 24 Horas.** A real data fault, not a parsing one |

### Two things the run also settled

**The internal notes are stale.** *Cilindros* is live at 200 / 250 / 300, not the *"100 Pequeno150 Mediano200 Grande"* the note claims — and *"Los 3 valen 500"* against a live total of 750. *Cubículos* is a single C$400 unit, with no size variants at all. Price from the recovered file, not from the notes.

**There are no sales descriptions to rescue.** Of 63 pages, one has a description container and it is empty. The `descripcion_venta` column exists and is entirely blank — the shop never had customer-facing copy, so the new site's product text has to be written rather than migrated.

Odoo's own `free_qty` is recorded in `notas` and deliberately **not** in a column that looks mergeable: the source already warns *"Stock desactualizado"*, and in this schema an unknown quantity is a legitimate state while a wrong one is a bug.

## Loading prices and quantities

The catalog import never writes `price_per_day` or `total_quantity`. One script does, and only this one:

```bash
npm run import:prices -- --dry-run     # show the plan, write nothing
npm run import:prices                  # recovered values only
npm run import:prices -- --estimates   # also invent the gaps, for testing
```

### Provenance, because three kinds of number now share two columns

`variants.price_source` and `variants.quantity_source`:

| Value | Meaning |
|---|---|
| `recovered` | Read off the Odoo shop. Real, but a snapshot of a system being retired |
| `estimated` | **Invented so the site could be tested. Not a price this business charges** |
| `staff` | Entered by someone who knows the business. Authoritative |
| `null` **beside a non-null value** | Treated as staff-entered, so anything predating this migration is protected |

The confidence flag from the recovery run maps onto this rather than being discarded: a `revisar` row is a sibling's price copied across, which is a guess, so it lands as **`estimated`** — not `recovered`.

**Staff data always wins**, and the guard is in the `where` clause rather than in JavaScript, so it holds no matter what calls it:

```sql
where v.source_key = i.source_key
  and (v.price_per_day is null or v.price_source in ('recovered', 'estimated'))
```

Verified, not assumed: a row marked `staff` and a row with a non-null price and no source both survived a re-run untouched — 127 of 129 prices written, the two protected ones skipped.

### Getting the invented data back out

```bash
npm run db:clear-estimates -- --dry-run
npm run db:clear-estimates
```

`select * from estimated_values` lists every variant still carrying invented data. **That view must be empty before the site serves a real customer.** It is revoked from `anon`.

### Current state

| | |
|---|---|
| Variants priced | **129 / 129** |
| Variants with a quantity | **129 / 129** |
| Price recovered from Odoo | 74 |
| Price estimated | 55 |
| Quantity estimated | 60 |
| **Visible to the public** | **82** |

The other 47 are not published, so a price alone does not surface them — `public_catalog` requires published **and** priced. Publishing them is a business decision, not an import one, so nothing here touches `variants.published`.

Quantities come from Odoo's `free_qty`. **A zero is treated as unknown, not as zero**: `free_qty` is what was free, not what the business owns, and it reads zero on products whose stock was never maintained. Writing zero would make an item permanently unbookable, and in this schema unknown is a supported state while a wrong number is a bug.

Estimates are per-category medians — a chair estimated from other chairs rather than from an alfombra.

## Gap queues

Not reports — a working queue, ordered so the most-rented categories come first.

`variants_missing_price` · `variants_missing_quantity` · `products_missing_photo` · `catalog_gaps_summary`

Current state: **every variant now has a price and a quantity** (see above — 55 prices and 60 quantities are estimates, not real). 40 products still have no photo.

## Photos

63 of 103 products now have real photography copied off the Odoo site into Supabase Storage, in all three sizes (`original`, `square` 1000×1000, `portrait` 1000×1250). The originals are kept so crops can be regenerated after Odoo is gone.

**Odoo does not 404 for a product with no image** — it returns its own grey placeholder with a 200. A naive import therefore "succeeds" on all 103 and fills the catalog with identical grey squares; it did exactly that on the first run. The script now calibrates itself at startup by requesting the image of a product id that cannot exist, hashes whatever comes back, and rejects any byte-identical response. That found precisely the 40 products Odoo has no photo for, and they are queued in `products_missing_photo`.

`Cofre` and `Cofre Madera` legitimately share one photograph in Odoo. That is real data, not a placeholder, and it is left alone.

> Some prices are hiding in `internal_note`: *"Los 3 valen 500"* (Cilindros), *"100 Pequeno150 Mediano200 Grande"* (Cubículos). Worth surfacing in the admin panel's price queue.

**Until a variant has a price, it does not appear in the public catalog.** Set one and it shows up within the 5-minute revalidation window:

```sql
update variants
   set price_per_day = 40, total_quantity = 300, price_source = 'staff', quantity_source = 'staff'
 where source_key = 'Silla Tiffany';
```

Marking it `staff` is what stops the next `import:prices` run putting the recovered value back.
