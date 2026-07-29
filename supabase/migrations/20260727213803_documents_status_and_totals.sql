-- ============================================================================
-- Documents, status transitions, and computed order totals.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Documents.
--
-- The system issues an INTERNAL COMPROBANTE ONLY. It is not a fiscal document:
-- in Nicaragua the pre-printed membretadas the owners already have remain the
-- legal instrument, and emitting fiscal invoices electronically would require
-- prior DGI authorisation.
--
-- The model is nonetheless built ready for that day: consecutive numbering,
-- both RUC fields, a tax breakdown structure, and the rule that an issued
-- document is VOIDED, NEVER DELETED OR REWRITTEN — enforced below at the
-- database level, not in application code, because that is the one rule a
-- future bug must not be able to break.
-- ---------------------------------------------------------------------------
create type document_type as enum ('proforma', 'comprobante');

create sequence document_number_seq start 1;

create table documents (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references orders(id) on delete restrict,

  type         document_type not null,
  number       bigint not null unique default nextval('document_number_seq'),

  issued_at    timestamptz not null default now(),

  -- Voiding, the only mutation an issued document permits.
  voided_at    timestamptz,
  void_reason  text,
  constraint void_needs_reason check (voided_at is null or void_reason is not null),

  -- Fiscal fields: present and unused until the business is authorised.
  business_ruc text,
  customer_ruc text,
  subtotal     numeric(12,2),
  tax_total    numeric(12,2),
  tax_breakdown jsonb,
  total        numeric(12,2),

  -- Frozen copy of the lines as issued. A later catalog edit must never change
  -- what a document said when it was handed to a customer.
  snapshot     jsonb not null,

  created_at   timestamptz not null default now()
);

create index documents_order_idx on documents(order_id);

-- Void, never delete.
create or replace function forbid_document_delete() returns trigger
language plpgsql as $$
begin
  raise exception
    'Documents are voided, never deleted. Set voided_at and void_reason on document %.',
    old.number
    using errcode = 'restrict_violation';
end;
$$;

create trigger documents_no_delete before delete on documents
  for each row execute function forbid_document_delete();

-- Void, never rewrite. Only the voiding fields may change after issue.
create or replace function forbid_document_rewrite() returns trigger
language plpgsql as $$
begin
  if new.order_id  is distinct from old.order_id
  or new.type      is distinct from old.type
  or new.number    is distinct from old.number
  or new.issued_at is distinct from old.issued_at
  or new.subtotal  is distinct from old.subtotal
  or new.tax_total is distinct from old.tax_total
  or new.tax_breakdown is distinct from old.tax_breakdown
  or new.total     is distinct from old.total
  or new.snapshot  is distinct from old.snapshot
  or new.business_ruc is distinct from old.business_ruc
  or new.customer_ruc is distinct from old.customer_ruc
  then
    raise exception
      'Issued document % cannot be rewritten. Void it and issue a new one.',
      old.number
      using errcode = 'restrict_violation';
  end if;

  if old.voided_at is not null and new.voided_at is distinct from old.voided_at then
    raise exception 'Document % is already voided.', old.number
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

create trigger documents_no_rewrite before update on documents
  for each row execute function forbid_document_rewrite();

-- ---------------------------------------------------------------------------
-- Status transitions, modelled explicitly so arbitrary jumps can't happen.
-- ---------------------------------------------------------------------------
create table order_status_history (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  from_status order_status,
  to_status   order_status not null,
  changed_at  timestamptz not null default now(),
  changed_by  uuid,
  note        text
);

create index order_status_history_order_idx on order_status_history(order_id);

create or replace function validate_status_transition() returns trigger
language plpgsql as $$
declare
  allowed order_status[];
begin
  if new.status = old.status then
    return new;
  end if;

  allowed := case old.status
    when 'pending_request'    then array['confirmed', 'cancelled']::order_status[]
    when 'confirmed'          then array['picked_up', 'cancelled']::order_status[]
    when 'picked_up'          then array['partially_returned', 'returned']::order_status[]
    when 'partially_returned' then array['returned']::order_status[]
    when 'returned'           then array['closed']::order_status[]
    -- closed and cancelled are terminal.
    else array[]::order_status[]
  end;

  if not (new.status = any(allowed)) then
    raise exception 'Order % cannot move from % to %.', old.number, old.status, new.status
      using errcode = 'check_violation';
  end if;

  insert into order_status_history (order_id, from_status, to_status)
  values (new.id, old.status, new.status);

  return new;
end;
$$;

create trigger orders_validate_status before update of status on orders
  for each row execute function validate_status_transition();

-- ---------------------------------------------------------------------------
-- Order totals.
--
-- Rental is linear: the 24-hour price multiplied by the number of BILLED days
-- (not the occupied span — an early pickup is not charged for).
-- The deposit is tracked separately so it can be returned or applied against
-- damages rather than being confused with revenue.
-- ---------------------------------------------------------------------------
create or replace function apply_discount(
  base numeric, kind discount_type, value numeric
) returns numeric
language sql immutable as $$
  select case
    when kind is null then base
    when kind = 'amount'  then greatest(base - value, 0)
    when kind = 'percent' then round(base * (1 - value / 100.0), 2)
  end;
$$;

create view order_totals as
select
  o.id as order_id,
  o.number,
  coalesce(l.lines_total, 0)                                as lines_total,
  apply_discount(coalesce(l.lines_total, 0),
                 o.discount_type, o.discount_value)         as lines_after_discount,
  coalesce(c.charges_total, 0)                              as charges_total,
  apply_discount(coalesce(l.lines_total, 0),
                 o.discount_type, o.discount_value)
    + coalesce(c.charges_total, 0)                          as total_charged,
  coalesce(p.paid_total, 0)                                 as total_paid,
  apply_discount(coalesce(l.lines_total, 0),
                 o.discount_type, o.discount_value)
    + coalesce(c.charges_total, 0)
    - coalesce(p.paid_total, 0)                             as balance,
  case when o.deposit_returned_at is null then o.security_deposit else 0 end
                                                            as deposit_held
from orders o
left join lateral (
  select sum(apply_discount(ol.quantity * ol.unit_price * o.billed_days,
                            ol.discount_type, ol.discount_value)) as lines_total
  from order_lines ol where ol.order_id = o.id
) l on true
left join lateral (
  select sum(ch.amount) as charges_total from charges ch where ch.order_id = o.id
) c on true
left join lateral (
  -- Refunds count against what has been paid.
  select sum(case when pm.kind = 'refund' then -pm.amount else pm.amount end) as paid_total
  from payments pm where pm.order_id = o.id
) p on true;
