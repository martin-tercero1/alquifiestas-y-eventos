# Brief 04 — Operational Refinements
**Project:** Alquifiestas y Eventos
**Depends on:** Briefs 01–03 (design system, schema + availability engine, admin panel)
**Written in English for the model. The product itself is 100% in Spanish.**

---

## Why this brief exists

The admin panel is deployed and in real testing on Vercel. This brief is the set of corrections and additions that surfaced from that first real use, plus two business rules that were missing from the original model: the customer's **cédula** (national ID), which the mother physically holds until items are returned, and proper **phone-number handling** for a country where nobody types their country code.

None of this is greenfield. Every item here modifies something that already exists. Read each against the project's standing rules: **warn don't block, never delete, Spanish everywhere the user sees, generous tap targets, the one availability engine.** `alquifiestas-y-eventos-spec.md` and `DESIGN-TOKENS.md` remain authoritative.

There is no launch deadline pressure: the Odoo subscription runs until **January 2027**, so there is room to refine and test properly, and to drop Odoo features gradually rather than in one cutover. Correctness and the mother's adoption matter more than speed.

---

## 1. Phone numbers — store country code separately

Today phone is a single string, and the imported contacts carry a `+505` prefix that neither customers nor staff will ever type. Fix the model rather than stripping the prefix.

### Model

- Split phone into **two columns**: a country calling code (default `505`) and the national number (8 digits for Nicaragua). Apply this to both customers and any other place a phone is stored.
- Storing them separately is what makes the WhatsApp API integration (a later brief) work without guessing the country, and what lets the UI show a bare local number. Do not store only 8 digits with no code — that throws away the information the API will need.

### Migration of existing data

- In the same migration that adds the columns, split the existing values: the 122 contacts whose stored number begins with `+505` (or `505`) get `505` in the code column and the remaining 8 digits in the number column. This is a **reshaping, not a deletion** — no information is lost.
- Handle the handful that may not match cleanly (foreign numbers, malformed entries) by leaving the code null and the raw digits in the number column, and log them for a manual look. Never drop a row.

### Staff UI

- Show a phone field with the country code **pre-selected to 505 and visually secondary**, and a plain 8-digit input as the focus. A normal Nicaraguan user just types 8 digits and never thinks about the prefix.
- A user who knows they need a different code (the occasional foreign customer) can change it, but the interface must not make the common case pay for that rare one.
- Use **`libphonenumber-js`** for parsing, validation and the country selector in the **admin panel**, where the foreign case can occur. Do **not** ship the full library to the **public reservation form** if it costs meaningful mobile bundle weight — there, assume Nicaragua and validate a bare 8-digit input. Keep the heavy dependency on the staff side.

### WhatsApp links

- Everywhere a `wa.me` URL is built, reconstruct the full international number from `code + national number`. This replaces any current front-end logic that hardcodes `505`.

---

## 2. Cédula (national ID)

The mother asks every customer for their cédula and **physically holds it until the items are returned.** This is core to how the business protects itself and was missing from the model.

### The field

- Add a `cedula` field to the customer.
- Nicaraguan format: `NNN-DDMMAA-NNNNX` — three municipality digits, six birth-date digits (DDMMAA), four digits, one check letter. Example shape: `043-140587-1234A`.
- **In the UI, show the expected format explicitly** — a placeholder and a short hint, since staff are typing it off a physical card. San Marcos is municipality code **043**, so most local customers' cédulas begin with `043`; use that as the placeholder to make the pattern obvious.
- Auto-format as they type (insert the dashes) so they don't have to.

### Validation warns, never blocks

- Nicaragua introduced a **new cédula format in February 2026**, and holders of the old format keep it until their document expires — so **two formats will coexist for years.** Validation must therefore accept the known format, warn on anything that doesn't match, and **still let staff save it.** A tourist, a company with only a RUC, or a new-format card must never be blocked.
- The final letter is a real check digit, but given the format transition, validate **shape only** and warn on mismatch rather than rejecting. Do not hard-reject on a failed check character.

### Where it's required

- **Required in the admin panel** when confirming a pickup — that's the moment the physical card is handed over.
- **Optional on the public reservation form** — an online requester has no way to hand over a card yet; they do it in person at pickup. Suggested: optional online, required at in-person pickup confirmation.

### Cédula retained — make it a tracked state, not just a field

The card is held until return. That's an obligation the system should help them not forget.

- Track that a cédula is currently retained for an open order.
- When a return is recorded (including a full return that closes the order), surface a clear reminder in Spanish to **return the physical cédula to the customer.** This is exactly the kind of thing that gets forgotten and produces an angry customer.

---

## 3. Customer matching by cédula

Cédula is the strongest identifier the business has — genuinely unique and stable. Phone is weaker (shared family phones, changed numbers, contacts with only one or the other). Extend matching to use it, carefully.

### Public path (`submit_reservation_request`)

This RPC currently matches on phone only. Add cédula matching **ahead of** phone:

1. If a cédula is provided, match on cédula first.
2. If no cédula, or no cédula match, fall back to the existing phone match.
3. If neither matches, create a new customer (unchanged).

**The dangerous case — handle it explicitly:** the phone matches one customer but the cédula matches a *different* customer. The system must **not** guess or silently merge. For the automated public path, prefer the cédula match, but flag the order for staff review with a clear note that the phone pointed elsewhere. Never merge two customer records automatically.

Remember most imported/historical customers have **no cédula** (it was never captured), so cédula matching only helps going forward; phone stays the primary identifier for a long time. That's expected.

### Staff path (`create_staff_order` / `search_customers`)

The staff already pick the customer manually, so no automatic match is added here. Instead, **extend `search_customers` to also search by cédula**, so when a customer hands over their card the mother can find them by ID as fast as by name or phone.

---

## 4. Pickup and return times

Creating an order today with same-day pickup makes no sense, and in practice the parents always agree a specific time with the customer for pickup and for return, because they're often busy with other things.

- Add an **agreed pickup time** and an **agreed return time** alongside the existing dates.
- **Do not change availability granularity.** Availability stays day-based. These times are **coordination information, not calculation** — they exist so the *Hoy* screen can sort by time and the parents know who to expect at 8 and who at 3. Putting hours into the availability engine would multiply its complexity and solve no real problem.
- Default the pickup date to **tomorrow**, not today, so the common case is right by default — but don't forbid same-day, since they sometimes do hand over same-day. This is a default, not a block.
- Show the times on the *Hoy* screen and *Detalle de pedido*, and use them to order the day's lists.

---

## 5. Technical-admin role and real deletion

Nothing in the parents' view ever deletes — that rule stands. But the developer needs a way to remove genuine junk (test orders, duplicates, experiment data) so the database doesn't accumulate noise.

- Add a **technical-admin role** on the existing auth — same login, a role flag, no separate system.
- Hard-delete of customers, products, orders, etc. is available **only** to that role, and those controls are **completely absent from the parents' UI** — not disabled, absent. This also removes a category of buttons from their screens, which is a usability win, not just a safety one.
- Deletion by the technical admin is for cleanup, not for volume control. At this business's scale the relational data is tiny (hundreds of orders a year); it will not fill anything. The real growth risk is image storage, handled in §8.
- Even technical-admin deletion should require a confirmation that names what's being deleted, and where a record has history (an order with payments), prefer refusing the hard-delete in favour of the existing void/cancel unless it's clearly test data.

---

## 6. Permanent session, no logout for the parents

The mother must never be stuck at a login screen. A phone that asks for a password every morning gets abandoned.

- Configure Supabase sessions so they **don't expire from inactivity or a time-box** on the parents' devices — a long-lived, silently-refreshing session.
- **Remove the logout control entirely from the parents' UI.** If she can't log out, she can't get locked out. Logout remains available to the technical-admin role only.
- Set the app up as an installable **PWA** on the home screen so it opens like an app.
- The developer provisions the accounts directly on the parents' phones with the password saved in the phone's password manager. No self-registration, no email verification, no password-strength theatre.
- Biometric/fingerprint login is **explicitly not in scope** — the permanent session solves the real problem. If hardening is wanted later, it would be a WebAuthn *local unlock* of the app, not a login method, layered on top of the still-alive session.
- Continue recording which user made each write (already required in Brief 03) — that's for "who took this order?", not for access control.

---

## 7. UI corrections from real testing

Small, concrete fixes observed on the deployed build:

- **Date pickers open on the whole field.** Right now only the calendar icon opens the picker. Call the browser's `showPicker()` on click/focus anywhere in the date field, with a fallback for browsers that don't support it (works in Chrome on Android, which is the target).
- **Delivery address required in the UI when delivery is selected.** A DB constraint already requires the address, and it currently surfaces as a raw constraint error when confirming a delivery order. Move the guard into the form: when "entrega a domicilio" is selected, the address field becomes required, appears inline, and shows a plain-Spanish message saying what's missing. A raw database error must never reach the user.

---

## 8. Image storage policy — overwrite, don't accumulate

Confirm how images are currently stored and make uploads **replace**, not pile up, so free-tier storage isn't exhausted.

- Store each image at a **deterministic path** per product, e.g. `productos/{id}/principal.webp`, and upload with **upsert** so a re-upload overwrites the same object instead of creating a new randomly-named file. A random filename per upload is the one pattern that grows storage without bound — avoid it.
- **Compress and convert to WebP before upload**, max ~1600px on the long side.
- If the design system's two crops are generated, give each a fixed path too, and overwrite them on re-upload.
- For scale sanity: 134 products at two crops each is on the order of ~50 MB against a 1 GB free tier — plenty of headroom, *provided* overwrites are in place.

---

## 9. Formal comprobante PDF (technical-admin only, for now)

Alongside the manual WhatsApp share, add the ability to generate a **more formal PDF** of an order — the shape a real invoice will take once fiscal invoicing is implemented.

- Use the fiscal-readiness fields already in the model (consecutive numbering capability, business and customer RUC, tax breakdown, the cédula, the customer's details).
- **Enabled only for the technical-admin role initially**, so it can be refined before the parents ever see it.
- It must carry a **visible label stating it is not a fiscal document** (an internal comprobante), consistent with the spec — the pre-printed `facturas membretadas` remain the legal document.
- Design it so that when DGI authorization is eventually obtained, enabling it for staff and removing the non-fiscal label is the main change — not a rebuild. Keep the layout and numbering ready for that.
- The PDF is generated server-side and offered as a download/share; it does not replace the `wa.me` proforma share from Brief 03, which stays as the everyday tool.

---

## Out of scope (still)

- **WhatsApp Business API integration** — this is its own brief (Brief 05). It depends on external Meta steps: a verified Meta Business account, the number migrated off the current Odoo integration onto your own account, approved message templates, and a webhook. Those have their own lead time and shouldn't block this brief. Note the number can only live in one integration at a time, so it must be freed from Odoo before January 2027.
- **Fiscal invoice emission** — still requires DGI authorization; the PDF above is explicitly a non-fiscal comprobante.
- Automated notifications, paper-invoice scanning (phase 2), online payment — all unchanged from prior briefs.

---

## Definition of done

- Phone is stored as country code + national number; existing `+505` contacts are reshaped into the two columns with nothing lost; staff enter 8 digits with `505` pre-selected; `wa.me` links rebuild the full number; foreign codes are possible but never burden the common case.
- Cédula is captured with Nicaraguan formatting and an on-screen hint, validation warns without blocking (old and new formats both accepted), it's required at in-person pickup and optional online, and returning the physical card is surfaced as a reminder on return.
- Public-path matching prefers cédula over phone and flags conflicts for review instead of merging; `search_customers` finds customers by cédula.
- Orders carry agreed pickup and return times used for ordering the day's work, with availability still day-based and pickup defaulting to tomorrow.
- A technical-admin role can hard-delete; the parents' UI has no delete controls and no logout control.
- Parent sessions don't expire; the app installs as a PWA.
- Date pickers open from anywhere in the field; selecting delivery makes the address required in the form with a plain-Spanish message, no raw constraint errors.
- Image re-uploads overwrite at deterministic paths as compressed WebP.
- A non-fiscal comprobante PDF can be generated by the technical-admin role, clearly labelled, and structured for an easy fiscal transition later.
