# Brief 01 — Public Site & Design Foundation
**Project:** Alquifiestas y Eventos
**Skill to use:** `/frontend-design`
**Written in English for the model. The product itself is 100% in Spanish — see "Language" below.**

---

## Why this brief exists

Alquifiestas y Eventos is a family-run party and event rental business in San Marcos, Carazo, Nicaragua. It has been operating for over 20 years. The owners are the parents of the developer; they run the business the traditional way, mostly on paper, and serve most customers in person.

The full system (public site + admin platform for proformas, invoices, inventory and date-based availability) is specified in `alquifiestas-y-eventos-spec.md`. **This brief covers only the first slice: the public-facing site and the visual foundation everything else will inherit.** Do not build the admin panel, the database, or the availability engine yet.

## What to build

A responsive public website with:

1. **Home page** — the marketing front door. This is where the visual identity has to land.
2. **Catalog** — browsable rental items grouped by category, with a detail view per item.
3. **Reservation request form** — a presentational flow only (no backend, no persistence yet). Customer picks items and quantities, picks the event date, chooses pickup or delivery, chooses payment method. Submitting should show a clear confirmation state, nothing more.
4. **Contact page** — address, phone, WhatsApp, business hours, map or directions.
5. **A reusable landing page template** — the owner runs paid social campaigns and needs to spin up single-purpose landing pages (e.g. graduation season, quinceañera packages) that reuse the same design system and catalog components but have their own headline, hero, item selection and call to action. Build one working example.

## Explicitly out of scope for this brief

- Admin panel, authentication, database, real availability checks
- Online payment of any kind (never part of this product)
- Automatic delivery pricing (always quoted manually, case by case)
- Real order submission — the form is presentational for now

Use realistic mock data shaped like the real catalog so the design is tested against real content, not lorem ipsum.

## Language

**Every string the user sees must be in Spanish** — Nicaraguan Spanish, natural and conversational, not translated-from-English Spanish. This includes navigation, buttons, labels, form fields, empty states, error messages, confirmation messages, alt text and metadata.

Code, comments, variable names, file names and commit messages stay in English.

Use the vocabulary the business itself uses: *alquiler*, *proforma*, *factura*, *cotizar*, *apartar*, *retirar en el local*, *entrega a domicilio*, *depósito de garantía*, *anticipo*. Prices are in córdobas, written as `C$`, quoted **por 24 horas**.

Multi-day rentals exist and are priced linearly (24-hour price × number of days). The catalog and the request form should make the 24-hour unit obvious and let the customer pick a date range, not just a single date.

## The subject's world — ground the design here

This is the material to design from. Don't design a generic rental e-commerce site; design *this* business.

- **What they rent:** Tiffany chairs, Garden chairs, plastic chairs, children's chairs. Round tables for 10, rectangular and square tables, children's tables. Tablecloths (round, rectangular, square), chair sashes. Glassware: wine glasses, champagne glasses, tumblers, plates, cutlery. Decor: metal arches, cylinders, iron-and-wood cubicles, the "pozo de los regalos" (gift well) and the "silla trono" (throne chair) — those last two are their most requested decorative pieces. And **Caballo Bayo**, a category named after the traditional Nicaraguan buffet spread, with the serving equipment that goes with it (chafing dishes, etc.).
- **What the items are for:** weddings, baptisms, confirmations, quinceañeras, birthdays, baby showers, graduations, corporate events. School graduations on a tight budget are a real, recurring segment.
- **Where it happens:** a small town in Carazo, Nicaragua. Celebrations here are family-scale and community-scale. The business sits 75 metres south of the Catholic church, across from the CSE.
- **Real detail worth using:** these are objects that get set up, used for one evening, and taken down. The product is a room that exists for a few hours. That's a more interesting thesis than "we rent chairs."

The existing tagline they've used is **#TuEventoDeSiempre**. Their current promise is personal attention and quality goods from a business the town has known for two decades. Keep that promise; the current Odoo-generated site does not express it at all.

## Audience and tone

The visitor is usually a woman between 25 and 55 planning a family event, on an Android phone, on mobile data, comparing options and worried about two things: **will it be available on my date**, and **how much will this cost me**. She is not shopping for a lifestyle brand. She wants clarity and reassurance.

Tone: warm, direct, competent. Not corporate, not cutesy, not aspirational-wedding-magazine. The business is proud and established, not aspirational.

## Hard constraints that should shape the design

- **Mobile-first, seriously.** Not "responsive down to mobile" as an afterthought — the primary device is a mid-range Android phone. Design the phone layout first and let the desktop layout follow.
- **Performance matters.** Assume slow mobile connections. Keep the page light, lazy-load images, avoid heavy libraries and heavy fonts.
- **The photography is imperfect.** The existing image library is WhatsApp photos taken at real events and in the warehouse: uneven lighting, mixed aspect ratios, busy backgrounds, no studio shots and no budget for any. **The design has to make these photos look intentional.** This is a real constraint and a real opportunity — build a treatment (framing, cropping, overlay, grid discipline, whatever you decide) that turns amateur photography into a coherent visual system. Do not design something that only works with clean product-on-white images, because those will never exist.
- **Price transparency is a feature.** Prices are public and per-24-hours. Show them plainly; don't hide them behind "request a quote."
- **WhatsApp is the real channel.** A WhatsApp call-to-action needs to be present and obvious throughout, not buried in the footer. Many visitors will never fill out the form; they'll message instead, and that's fine.

## Design system requirements

The tokens you establish here will be inherited by the admin panel in a later brief, so build them as a real system, not as one-off page styles:

- Color tokens, type scale, spacing scale, radii, shadows, and component primitives (button, input, select, card, badge, modal) defined once and reused.
- The admin panel will be used daily on a phone by two people in their sixties with no technical background, in a warehouse, sometimes in a hurry. **That means the base type size, tap target size and contrast you set now have to be generous enough to survive that context.** Don't set a 13px base size that will need to be overridden later.
- Support a visible keyboard focus state and respect `prefers-reduced-motion` from the start.

## Aesthetic direction

The visual direction is open — that's the point of using the design skill. A few things to hold onto:

- The current site is an untouched Odoo template. Anything is an improvement, so aim higher than "clean and modern."
- Don't reach for a generic event-rental or wedding-industry look (blush palettes, thin serif script, endless soft-focus stock). That vocabulary belongs to a different market than San Marcos.
- Don't land on a default AI aesthetic either — the cream-background/serif/terracotta look, the near-black with one acid accent, or the newspaper-broadsheet grid. If you arrive at one of those, that's a signal to push further.
- Take one real aesthetic risk and justify it in the plan you present before building.
- Whatever direction you choose has to survive being rendered next to a slightly blurry WhatsApp photo of a table setup. Test it that way.

## Technical setup

- Next.js (App Router), deployed on Vercel.
- Styling approach is your call, but it must produce a token system that a later admin panel can consume without a rewrite.
- No CMS. Catalog data comes from mock data now, from the project's own database later.
- Free-tier everything — this is a small family business with no software budget.

## Process expected

Follow the `/frontend-design` process: brainstorm a compact design plan (palette as named hex values, type pairing, layout concept, and the one signature element the site will be remembered by), critique that plan against this brief before writing any code, then build to the revised plan.

**Present the design plan for approval before building.** Write the plan in English; write everything that ships in Spanish.

## Definition of done

- Home, catalog listing, item detail, request form, contact page and one example landing page, all working and all in Spanish.
- A documented token system other briefs can build on.
- Real-shaped mock catalog data with real category names and real prices.
- Works well on a 360px-wide Android screen.
- Keyboard-navigable with visible focus, reduced motion respected, images lazy-loaded.
