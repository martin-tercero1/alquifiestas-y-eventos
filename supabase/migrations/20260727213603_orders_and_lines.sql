-- ============================================================================
-- Orders.
--
-- Three dates, not two, and the billed period is NOT derived from the occupied
-- period. The customer sometimes picks up a day early for convenience without
-- being charged for it, so `billed_days` is its own field.
--
-- Availability is released by actual_return_date, never by agreed_return_date.
-- Until staff marks receipt, the items stay committed. That is deliberate: it
-- is what stops the system overselling when somebody comes back late.
-- ============================================================================

create type order_status as enum (
  'pending_request',    -- solicitud pendiente: came from the website, untouched
  'confirmed',          -- proforma: staff checked availability and agreed it
  'picked_up',          -- items are out of the warehouse
  'partially_returned', -- some units back, some still out
  'returned',           -- everything physically accounted for
  'closed',             -- settled: paid, deposit resolved, nothing outstanding
  'cancelled'
);

create type fulfilment_method as enum ('pickup', 'delivery');
create type payment_method    as enum ('cash', 'transfer');
create type discount_type     as enum ('amount', 'percent');

-- Human-facing consecutive order number. Fiscal documents get their own
-- sequence; this one is for the business's own reference.
create sequence order_number_seq start 1000;

create table orders (
  id           uuid primary key default gen_random_uuid(),
  number       bigint not null unique default nextval('order_number_seq'),

  customer_id  uuid not null references customers(id) on delete restrict,
  status       order_status not null default 'pending_request',

  -- ---- The three dates ---------------------------------------------------
  -- When the customer takes the items. Occupancy starts here.
  pickup_date        date not null,
  -- When it was agreed they would come back.
  agreed_return_date date not null,
  -- When they actually did, and staff marked receipt. NULL until fully
  -- returned. This — not agreed_return_date — is what releases availability.
  actual_return_date date,

  constraint return_after_pickup check (agreed_return_date >= pickup_date),
  constraint actual_return_after_pickup
    check (actual_return_date is null or actual_return_date >= pickup_date),

  -- What is actually charged. Deliberately NOT derived from the dates above:
  -- an early pickup lengthens the occupied range without lengthening the bill.
  billed_days  int not null default 1 check (billed_days >= 1),

  -- ---- Fulfilment --------------------------------------------------------
  fulfilment       fulfilment_method not null default 'pickup',
  delivery_address text,
  -- ALWAYS null until staff quotes it with a transporter. There is no delivery
  -- pricing logic anywhere in this system, by design.
  delivery_cost    numeric(12,2) check (delivery_cost is null or delivery_cost >= 0),

  constraint delivery_needs_address
    check (fulfilment <> 'delivery' or delivery_address is not null),

  -- ---- Money -------------------------------------------------------------
  payment_method   payment_method not null default 'cash',

  -- Depósito de garantía. Optional, returned when everything comes back whole.
  security_deposit numeric(12,2) check (security_deposit is null or security_deposit >= 0),
  deposit_returned_at timestamptz,

  -- Order-level discount. Always entered by hand by staff; there are no
  -- automatic discount rules of any kind in this system.
  discount_type    discount_type,
  discount_value   numeric(12,2) check (discount_value is null or discount_value >= 0),
  constraint discount_pair check (
    (discount_type is null and discount_value is null) or
    (discount_type is not null and discount_value is not null)
  ),
  constraint discount_percent_range check (
    discount_type is distinct from 'percent' or discount_value <= 100
  ),

  -- The number of the handwritten pre-printed fiscal invoice, so the digital
  -- record links to the legally valid document. The system itself issues an
  -- internal comprobante only — see the documents table.
  physical_invoice_number text,

  -- ---- Availability override ---------------------------------------------
  -- The owner sometimes borrows stock from another business, or knows an order
  -- is coming back early. A hard block is what made Odoo unusable, so the
  -- override exists from day one and is recorded when used.
  availability_overridden boolean not null default false,
  override_reason         text,
  constraint override_needs_reason
    check (not availability_overridden or override_reason is not null),

  notes        text,
  source       text not null default 'admin' check (source in ('website', 'admin')),

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index orders_customer_idx on orders(customer_id);
create index orders_status_idx   on orders(status);
create index orders_pickup_idx   on orders(pickup_date);
-- Overdue lookup: out, past the agreed date, not yet received.
create index orders_open_idx on orders(agreed_return_date)
  where actual_return_date is null and status not in ('cancelled', 'closed');

create trigger orders_touch before update on orders
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Order lines. Each references a VARIANT, never a product.
-- ---------------------------------------------------------------------------
create table order_lines (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references orders(id) on delete cascade,
  variant_id   uuid not null references variants(id) on delete restrict,

  quantity     int not null check (quantity > 0),

  -- Snapshotted at booking time. NEVER join to the current catalog price:
  -- a price correction must not silently rewrite what a customer was quoted.
  unit_price   numeric(12,2) not null check (unit_price >= 0),

  -- Line-level discount, same rules as the order level: manual, never automatic.
  discount_type  discount_type,
  discount_value numeric(12,2) check (discount_value is null or discount_value >= 0),
  constraint line_discount_pair check (
    (discount_type is null and discount_value is null) or
    (discount_type is not null and discount_value is not null)
  ),
  constraint line_discount_percent_range check (
    discount_type is distinct from 'percent' or discount_value <= 100
  ),

  created_at   timestamptz not null default now(),

  -- One line per variant per order; changing your mind changes the quantity.
  constraint order_line_variant_unique unique (order_id, variant_id)
);

create index order_lines_order_idx   on order_lines(order_id);
create index order_lines_variant_idx on order_lines(variant_id);
