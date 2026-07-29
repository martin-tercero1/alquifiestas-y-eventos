# Brief 03 — Admin Panel
**Project:** Alquifiestas y Eventos
**Depends on:** Brief 01 (design system), Brief 02 (schema + availability engine)
**Written in English for the model. The product itself is 100% in Spanish.**

---

## Why this brief exists

This is the part of the project that actually replaces something. The public site is a catalog; **this is the tool that replaces paper and Odoo in the daily running of the business.** Most orders for the foreseeable future will be created here, by staff, with a customer standing at the counter — not by customers online.

It is also the part most likely to fail, and there is a specific, documented way it fails: **Odoo was abandoned after a year because it had too many features and was not usable from a phone.** Every decision in this brief should be read against that.

## Who is actually using this

Not a persona. Two real people.

- **The owner's mother**, in her sixties, no technical background. She serves nearly every walk-in customer herself. She is the primary user and the one whose adoption determines whether this project succeeded.
- **The owner's father**, same context, occasional use.
- **The developer**, occasionally, for maintenance.

The conditions this runs in: a mid-range Android phone, held in one hand, in a warehouse or at a counter, with a customer waiting, sometimes on unreliable mobile data. Occasionally a tablet or a computer, but design for the phone and let the larger screens inherit.

What this means concretely:

- **Fewer screens beats more features.** If a screen can be removed by folding it into another, remove it.
- **No feature exists "just in case."** Everything unused is a thing she has to look past to find what she needs.
- **Never lose typed work.** A failed save with a customer waiting is the moment she goes back to paper permanently.
- **Nothing critical hides behind a menu, a hover, or a swipe.** The primary action on every screen is visible without scrolling.
- Type size and tap targets come from the design system and are already generous. Do not shrink them to fit more in.

She writes proformas on paper today, and that is the benchmark: **creating an order here has to feel faster than writing it by hand.** If it doesn't, she'll use paper.

## What to build

Six screens. That is the budget — treat adding a seventh as a decision that needs justifying.

1. **Hoy** — the daily anchor
2. **Nueva proforma** — the most-used screen in the product
3. **Pedidos** — the list, including online requests
4. **Detalle de pedido** — where an order lives its whole life
5. **Inventario** — catalog editing and the missing-data queue
6. **Clientes** — a thin contact list

Plus authentication.

### Build order

If only part of this ships, it must be the first three items:

1. Auth + shell + **Nueva proforma** + **Detalle de pedido** — this alone replaces the paper proforma and is independently useful
2. **Pedidos** and **Hoy**
3. **Inventario** and **Clientes**

## The screens

### Auth

Supabase Auth, email and password, two or three accounts. Sessions are long-lived — **she should not be logging in repeatedly**; a phone that asks for a password every morning gets abandoned. No self-registration, no password-strength theatre, no email verification flow. The developer creates the accounts.

Every write records which user made it. Not for policing — for answering "who took this order?" when a customer disputes something.

### Hoy

The screen she opens by default. Three sections, in this order:

1. **Sale hoy** — orders being picked up today, with customer, items and whether delivery was requested
2. **Regresa hoy** — orders due back today
3. **Atrasados** — orders past their agreed return date and not yet received, ordered by how late

Nothing else. No charts, no revenue counter, no activity feed. If a section is empty, say so plainly in Spanish and take up no space.

### Nueva proforma

The screen that decides the project. Optimise this one harder than everything else combined.

The flow, in order, on one scrolling screen rather than a multi-step wizard:

1. **Customer** — search by name or phone with results appearing as she types, or create one inline with just name and phone. Creating a customer must not navigate away from the order.
2. **Dates** — pickup date, agreed return date. Default to a sensible single-day rental so the common case needs no input. Early pickup is just a pickup date earlier than the event; there is no special mode for it.
3. **Items** — search, tap to add, set quantity. The quantity control from Brief 01 keeps its typed-number input; somebody renting 150 chairs will not tap "+" 150 times.
4. **Running total**, always visible without scrolling, updating instantly and without animation.
5. **Save.**

Specific requirements:

- **Search must be forgiving.** It has to match without accents and survive typos and partial words: `manteleria` finds *Mantelería*, `tifany` finds *Silla Tiffany*, `mesa 10` finds *Mesa Redonda para 10 personas*. She types fast with a customer waiting.
- **Variants must not slow her down.** Adding *Cilindros* should let her pick Grande/Mediano/Pequeño in the same interaction, not a separate screen.
- **Missing prices are expected.** Much of the catalog has no price yet. When she adds such an item, let her type the price on the line and continue — never block. Offer a checkbox to save that price back to the catalog, so the catalog fills itself in as a side effect of real work. This is the fastest path to a complete catalog and it costs her nothing.
- **Availability warns, never blocks.** Shortages appear inline on the line, in plain Spanish, stating what's available and what's committed elsewhere. She can proceed anyway; record the override and let her add a reason. Unknown quantity shows as unknown, not as zero.
- **Discounts are manual**, per line or on the total, fixed amount or percentage. No automatic rules ever.
- Optional fields, visually secondary and collapsed by default: security deposit, delivery requested plus address, physical invoice number, notes.
- **Saving is unlosable.** Preserve the in-progress order locally as she types so a dropped connection, an accidental back, or a phone call never destroys it. Save states are explicit: she must always know whether it saved.

### Detalle de pedido

One screen where an order lives its entire life. Its state determines which actions are offered — never show an action that doesn't apply.

- **Confirm** an online request into a proforma; adjust lines, add the quoted delivery cost, add a deposit.
- **Record a payment** — partial payments are the norm, and a roughly 50% anticipo to hold a date is common. Show the balance prominently.
- **Mark picked up.**
- **Record a return**, including **partial returns**: how many units of which line came back, and how many were missing or damaged. Availability releases only on what was actually received.
- **Add charges** — late fee, damages, missing items, delivery. **Late fees are always typed by staff, never calculated.** The system flags an order as overdue and says nothing about how much to charge.
- **Cancel** with a reason. Nothing is ever deleted; cancelled orders are voided and stay visible.
- **Share by WhatsApp** — a button that opens WhatsApp with a pre-filled message summarising the proforma to send to the customer. This uses the plain `wa.me` link from her own phone, not the API. Automated notifications are out of scope; this manual share is worth having on day one because it is what she already does by hand.

Also on this screen: the physical invoice number field, so the digital record links to the handwritten fiscal invoice she still issues. The system's document remains an internal comprobante, not a fiscal one.

### Inventario

Two jobs on one screen.

**Editing** — name, category, price, total quantity, photo, published or not, per variant. Editing a price must be reachable in very few taps; it is the most common edit by far.

**The missing-data queue** — the questions Brief 02 left queries for: which variants have no price, which have no quantity, which products have no photo. Present it as work to get through, ordered by business priority (Sillas, Mesas and Mantelería first — they are the core of the business, not the largest categories), with a visible sense of progress. Editing from the queue should not lose her place in it.

Photo upload comes straight from the phone camera. Many products are pending a photo because the images were never publicly reachable on the old Odoo site.

### Clientes

Deliberately thin: search, view, create, edit. Name and phone are the only required fields. Show the customer's order history and their outstanding balance, and give a direct WhatsApp link.

Roughly a quarter of imported contacts have no phone. Don't treat that as broken data.

## Rules that cut across every screen

- **Warn, don't block.** This applies beyond availability. The owner knows things the system doesn't. Every guard rail is a warning she can proceed past, with the override recorded.
- **Nothing is ever deleted.** Cancel, void, deactivate — always recoverable, always with a reason.
- **Spanish everywhere the user can see**, Nicaraguan and plain. Error messages especially: say what happened and what to do, never a code or a raw database error.
- **Assume the network is bad.** Optimistic updates, explicit save states, retry on failure, and never a silent loss of typed input.
- **Money is exact.** Never floating point; the design system's tabular numbers are already set up so a total doesn't reflow as it changes.
- **Reuse Brief 01's primitives** — Button, Input, Field, Sheet, QuantityStepper, Badge, PhotoFrame and the rest. Do not introduce a component library, and do not restyle. `DESIGN-TOKENS.md` is authoritative; the admin panel was accounted for when those tokens were set.
- **One availability engine.** Use Brief 02's module. Never write a second availability calculation.

## Explicitly out of scope

- Automated WhatsApp notifications via the API (later brief). The manual `wa.me` share is in scope; the automation isn't.
- Paper-invoice scanning with a vision model — phase 2, explicitly after the digital flow is proven in real use.
- Reports and analytics beyond what's described. Revenue by month, most-rented items and outstanding balances come later, once there's real data worth reporting on.
- Fiscal invoice emission. The system issues an internal comprobante; the pre-printed `facturas membretadas` remain the legal document.
- Online payment. Never in scope.
- Any redesign of Brief 01.

## Definition of done

- The owner can create a complete order — customer, dates, items with variants, quantities, discount, deposit — on a phone, faster than writing it on paper.
- An order can be taken from online request through confirmation, payment, pickup, partial return, extra charges and closure, with availability releasing correctly at each step.
- Items with no price can be added to an order by typing a price, and that price can be saved back to the catalog in the same action.
- Availability shortages warn and can be overridden with the override recorded.
- The missing-data queue works and visibly shrinks as data is entered.
- Nothing in the product can permanently delete a record.
- Every screen is usable one-handed on a 360px Android screen, and no primary action requires scrolling to reach.
- A dropped connection mid-order does not lose the order.
