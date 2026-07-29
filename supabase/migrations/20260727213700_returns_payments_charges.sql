-- ============================================================================
-- Returns, stock adjustments, payments and charges.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Return events. Returns are EVENTS, not a boolean — a line can come back
-- across several of them (80 of 100 chairs today, the rest tomorrow).
--
-- THE SUBTLEST RULE IN THE SYSTEM, spelled out because it is easy to get wrong:
--
--   quantity_returned  units settled in this event
--   quantity_missing   of those, units that never physically came back
--   quantity_damaged   of those, units that came back unusable
--
--   usable = quantity_returned - quantity_missing - quantity_damaged
--
-- Only usable units release availability. Missing and damaged ones keep
-- occupying the line, which is what stops the system from re-renting stock it
-- no longer has, in the window between "we found out" and "somebody fixed the
-- total".
--
-- They stop occupying when staff writes them off the variant's total quantity
-- via a stock_adjustment linked to this event. Otherwise the loss would be
-- counted twice — once as a lower total, once as permanent occupancy — and the
-- business would slowly lose stock it actually owns.
-- ---------------------------------------------------------------------------
create table return_events (
  id             uuid primary key default gen_random_uuid(),
  order_line_id  uuid not null references order_lines(id) on delete cascade,

  returned_on    date not null,

  quantity_returned int not null check (quantity_returned > 0),
  quantity_missing  int not null default 0 check (quantity_missing >= 0),
  quantity_damaged  int not null default 0 check (quantity_damaged >= 0),

  -- Maintained by the stock_adjustments trigger. Units of this event that have
  -- been written off the variant total and therefore stop occupying the line.
  quantity_written_off int not null default 0 check (quantity_written_off >= 0),

  notes          text,
  created_at     timestamptz not null default now(),

  constraint losses_within_event
    check (quantity_missing + quantity_damaged <= quantity_returned),
  constraint written_off_within_losses
    check (quantity_written_off <= quantity_missing + quantity_damaged)
);

create index return_events_line_idx on return_events(order_line_id);
create index return_events_date_idx on return_events(returned_on);

-- ---------------------------------------------------------------------------
-- Stock adjustments. The audit trail behind a mutable total_quantity.
--
-- total_quantity is a field staff can change (an item is destroyed and never
-- replaced; a new batch is bought), so every change is recorded with a reason
-- rather than silently overwritten.
-- ---------------------------------------------------------------------------
create table stock_adjustments (
  id           uuid primary key default gen_random_uuid(),
  variant_id   uuid not null references variants(id) on delete cascade,

  -- Negative to write off, positive to add. Never zero.
  delta        int not null check (delta <> 0),
  reason       text not null,

  -- Set when this adjustment settles loss or damage from a specific return.
  return_event_id uuid references return_events(id) on delete set null,

  -- Snapshot around the change. Both null when the total was unknown.
  previous_total int,
  new_total      int,

  created_at   timestamptz not null default now(),
  created_by   uuid
);

create index stock_adjustments_variant_idx on stock_adjustments(variant_id);

-- Apply the adjustment to the variant, and close out the return event's
-- occupancy for the units written off.
create or replace function apply_stock_adjustment() returns trigger
language plpgsql as $$
declare
  current_total int;
begin
  select total_quantity into current_total from variants where id = new.variant_id for update;

  new.previous_total := current_total;

  -- A NULL total means UNKNOWN. An adjustment against an unknown total is
  -- still recorded — it just cannot compute a new number.
  if current_total is not null then
    new.new_total := greatest(current_total + new.delta, 0);
    update variants set total_quantity = new.new_total where id = new.variant_id;
  end if;

  -- Writing units off releases them from the line's occupancy, so the loss is
  -- counted once (as a smaller total) rather than twice.
  if new.return_event_id is not null and new.delta < 0 then
    update return_events
       set quantity_written_off = least(
             quantity_written_off + abs(new.delta),
             quantity_missing + quantity_damaged
           )
     where id = new.return_event_id;
  end if;

  return new;
end;
$$;

create trigger stock_adjustments_apply before insert on stock_adjustments
  for each row execute function apply_stock_adjustment();

-- ---------------------------------------------------------------------------
-- Payments. An order accumulates several over time — a ~50% anticipo to hold
-- the date is common but not universal, so partial payment is the normal case.
-- Never assume a single settling payment.
-- ---------------------------------------------------------------------------
create type payment_kind as enum ('advance', 'balance', 'deposit', 'refund');

create table payments (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references orders(id) on delete cascade,

  amount       numeric(12,2) not null check (amount > 0),
  paid_on      date not null default current_date,
  method       payment_method not null,
  kind         payment_kind not null default 'advance',

  reference    text,
  notes        text,
  created_at   timestamptz not null default now()
);

create index payments_order_idx on payments(order_id);

-- ---------------------------------------------------------------------------
-- Charges added to an order after the fact.
--
-- Late fees are NEVER calculated. The system only flags an order as overdue;
-- the amount is always typed in by staff, because in practice it is relative —
-- a few hours late usually isn't charged, a full day usually is, and the figure
-- may be a percentage or the whole invoice. There is no rule to encode.
-- ---------------------------------------------------------------------------
create type charge_kind as enum ('late_fee', 'damage', 'missing_item', 'delivery', 'other');

create table charges (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references orders(id) on delete cascade,

  kind         charge_kind not null,
  amount       numeric(12,2) not null check (amount >= 0),
  description  text,

  created_at   timestamptz not null default now(),
  created_by   uuid
);

create index charges_order_idx on charges(order_id);
