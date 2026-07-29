# Brief 02b — Price Recovery Scraper
**Project:** Alquifiestas y Eventos
**Priority: run this before anything else.** The data source disappears when the Odoo subscription lapses.
**Written in English for the model. Output files and their headers stay in Spanish, matching the existing data files.**

---

## Goal

Recover the 24-hour rental price for every published product from the business's **own** live Odoo shop at `alquifiestasyeventos.com`, so the catalog doesn't have to be priced by hand.

This is not third-party scraping — it is the project owner's own site, and this is a one-time recovery of data that the Odoo CSV export omitted. Be polite to the server anyway; it is a small hosted instance.

**Why it's urgent:** the Odoo subscription is being allowed to lapse. Once it does, these pages are gone and all 134 rentable units must be priced manually. Everything else in the project can wait; this can't.

## Input

`catalogo-limpio.csv` (already in the repo). Use the rows where `publicado` is `si` — 82 rentable units across **63 distinct products**. The `url_producto` column already holds the shop URL and `db_id` holds the Odoo product template ID.

Unpublished products have no public page and are out of scope here; they get priced by hand.

## Output

Write `precios-recuperados.csv`. **Do not modify `catalogo-limpio.csv` or `precios-captura.csv`** — merging is a separate, reviewable step.

| Column | Notes |
|---|---|
| `db_id` | Odoo product template ID |
| `producto` | Product name as it appears in the source CSV |
| `variante` | Variant label, empty for products without variants |
| `unidad_alquilable` | Must match the value in `catalogo-limpio.csv` exactly — this is the merge key |
| `precio_24h` | Numeric, plain decimal point, no currency symbol, no thousands separator |
| `moneda` | Currency code read from the page, expected `NIO` / `C$` |
| `descripcion_venta` | Customer-facing description from the page, if present (see below) |
| `metodo` | `pagina` or `combination_info` — how the price was obtained |
| `confianza` | `alta` or `revisar` (see below) |
| `notas` | Anything odd worth a human look |

Also write `precios-fallidos.csv` with `db_id`, `producto`, `url`, `motivo` for every product that couldn't be resolved.

## Steps

### 1. Fetch each published product page

One request per product (63), not per variant. Cache the raw HTML to disk so re-runs don't re-fetch — this must be **resumable**: if it dies at product 40, running it again picks up from there rather than starting over.

### 2. Extract the base price

The page renders the price as `30,00 C$ por 24 Horas`. Parsing rules:

- **Comma is the decimal separator, period is the thousands separator.** `1.500,00` is one thousand five hundred, not one point five. Getting this backwards silently corrupts every four-digit price — test it explicitly.
- Strip the `C$` symbol and the `por 24 Horas` suffix.
- If the page carries JSON-LD or microdata with a structured `price` / `priceCurrency`, prefer that over the rendered text — it avoids the separator problem entirely. Fall back to text parsing only when structured data isn't present.
- Record which method was used.

### 3. Extract the sales description — a bonus worth taking

The CSV export gave us Odoo's **internal notes** field, not the customer-facing description. The shop page has the real customer-facing text. Capture it while you're there; it is otherwise unrecoverable and it's content the new public site can use.

Strip HTML to plain text. Empty is fine and common.

### 4. Variant prices

The rendered price belongs to the **default variant only**. Products with variants may price each one differently — *Cubículos* is known to be 100 / 150 / 200 by size.

Attempt, in this order:

1. **Read the variant selector out of the page** to get each combination's attribute value IDs.
2. **Query Odoo's own endpoint** that the page's JavaScript uses to update the price when a variant is selected — in `website_sale` this is typically `/website_sale/get_combination_info`, taking the product template ID and the selected combination, and returning that combination's price. Send it the same JSON-RPC shaped payload the page sends.
3. If that endpoint doesn't exist or doesn't respond as expected on this Odoo version, **stop and fall back**: write the default-variant price against every variant of that product, mark `confianza` as `revisar`, and note it. Do not guess at variant pricing.

Do not spend long fighting this. Roughly 19 products have variants; if the endpoint route fails, flagging those ~40 units for manual review is an acceptable outcome and far cheaper than a fragile browser automation.

### 5. Confidence flag

Mark `confianza` as `revisar` when any of these hold, so the human review pass knows where to look:

- The price came from the default variant and was copied across siblings
- The price parsed as `0`, or above a sanity ceiling (say C$5,000 — this business rents chairs, not venues)
- The currency isn't the expected one
- The product has variants but only one price was found

Everything else is `alta`.

## Robustness

- **Rate limit to about one request per second**, with a real User-Agent. Don't hammer a small hosted instance.
- Retry a failed request twice with backoff, then record it in `precios-fallidos.csv` and continue. **Never abort the whole run over one product.**
- Time out individual requests; a hung connection must not stall the job.
- Log progress as it goes so a long run is observable.

## What this script must not do

- Touch the database. It produces CSVs; importing is a separate step with its own review.
- Modify the existing cleaned CSVs.
- Scrape anything outside `alquifiestasyeventos.com`.
- Fetch images — those are already handled and 63 are stored.

## After the run

Print a summary: how many products resolved, how many prices recovered at `alta` confidence, how many need review, how many failed, and the min/median/max price recovered. The price range is the fastest sanity check available — if the median comes out at C$3,000, the decimal separator is being parsed backwards.

Then leave the merge to a human: the recovered file gets reviewed against `precios-captura.csv`, the gaps get filled by hand with the business owner, and only then does the idempotent catalog import run. **Remember the import rule: staff-entered data always wins over imported data.**

## Definition of done

- `precios-recuperados.csv` exists, with one row per published rentable unit that resolved.
- `precios-fallidos.csv` lists everything that didn't, with a reason.
- The run is resumable and the raw HTML is cached.
- Decimal separator handling is covered by a test with a four-digit price.
- The summary prints and the numbers are plausible for a party rental business in Nicaragua.
