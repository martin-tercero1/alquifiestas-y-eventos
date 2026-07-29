-- ============================================================================
-- THE AVAILABILITY ENGINE
--
-- One implementation. Never write a second availability calculation anywhere.
--
-- The question: for these variants, over [start, end], how many units are free?
--
-- Rental availability is NOT stock counting. What matters is not how many
-- chairs are in the warehouse but how many are already committed and have not
-- yet come back.
--
-- OCCUPANCY RULES, per order line, per day:
--
--   cancelled order            occupies nothing
--   fully returned             pickup_date .. actual_return_date
--   still out, not yet due     pickup_date .. agreed_return_date
--   still out and OVERDUE      pickup_date .. INFINITY
--
-- That last one is deliberate. An overdue order keeps blocking future dates
-- until somebody records receipt, because the alternative is promising a
-- customer chairs that are sitting in a stranger's patio.
--
-- Partial returns reduce occupancy from the return date onward, but only by
-- the USABLE units — see the comment on return_events for why missing and
-- damaged units keep occupying until they are written off the total.
--
-- Availability across a range is the MINIMUM free quantity on any day in it:
-- one blocked day blocks the whole booking. Equivalently, total minus the
-- PEAK occupancy, which is how it is computed here.
--
-- UNKNOWN IS NOT ZERO. A variant whose total_quantity is null returns
-- available = null with is_unknown = true. It must never be reported as "none
-- available" — the business is going live with quantity gaps on purpose.
--
-- IT WARNS, IT DOES NOT BLOCK. This function returns a result. It never
-- raises, never vetoes. Callers decide: the public site stops a customer from
-- submitting an impossible combination; staff get an overridable warning,
-- because the owner sometimes borrows stock from another business or knows an
-- order is coming back early. A hard block is what made Odoo unusable here.
-- ============================================================================

-- The effective last day an order occupies stock. Its own function so the
-- engine and any diagnostic query can never disagree about the rule.
create or replace function order_occupancy_end(
  p_actual_return date,
  p_agreed_return date
) returns date
language sql immutable as $$
  select case
    when p_actual_return is not null then p_actual_return
    when p_agreed_return >= current_date then p_agreed_return
    else 'infinity'::date   -- overdue: blocks until receipt is recorded
  end;
$$;

comment on function order_occupancy_end is
  'Last day an order occupies stock. Released by actual return, never by the agreed one; overdue orders block indefinitely.';

-- ---------------------------------------------------------------------------
-- THE BATCH ENTRY POINT.
--
-- Designed batch-first on purpose: the catalogue listing needs availability
-- for every variant on the page, and solving that by calling a single-item
-- function in a loop is an N+1 that gets painful to unwind once the listing
-- depends on it. The single-item case below is expressed in terms of this one.
-- ---------------------------------------------------------------------------
create or replace function availability_for_variants(
  p_variant_ids uuid[],
  p_start       date,
  p_end         date
)
returns table (
  variant_id     uuid,
  total_quantity int,
  peak_occupied  int,
  available      int,
  is_unknown     boolean
)
language sql
stable
as $$
  with days as (
    select d::date as day
    from generate_series(p_start, p_end, interval '1 day') d
  ),
  -- Pre-filter to lines whose occupancy window can possibly overlap the range,
  -- before the per-day expansion.
  relevant_lines as (
    select
      ol.id,
      ol.variant_id,
      ol.quantity,
      o.pickup_date,
      order_occupancy_end(o.actual_return_date, o.agreed_return_date) as ends_on
    from order_lines ol
    join orders o on o.id = ol.order_id
    where ol.variant_id = any(p_variant_ids)
      and o.status <> 'cancelled'
      and o.pickup_date <= p_end
      and order_occupancy_end(o.actual_return_date, o.agreed_return_date) >= p_start
  ),
  daily as (
    select
      rl.variant_id,
      d.day,
      sum(
        greatest(
          rl.quantity - coalesce(released.units, 0),
          0
        )
      ) as occupied
    from relevant_lines rl
    cross join days d
    left join lateral (
      -- Usable units back on or before this day. Missing and damaged ones do
      -- not count until written off the variant total.
      select sum(
               re.quantity_returned
               - re.quantity_missing
               - re.quantity_damaged
               + re.quantity_written_off
             ) as units
      from return_events re
      where re.order_line_id = rl.id
        and re.returned_on <= d.day
    ) released on true
    where d.day between rl.pickup_date and rl.ends_on
    group by rl.variant_id, d.day
  ),
  peak as (
    select daily.variant_id, max(daily.occupied)::int as peak_occupied
    from daily group by daily.variant_id
  )
  select
    v.id,
    v.total_quantity,
    coalesce(peak.peak_occupied, 0),
    -- Unknown total propagates as null, never as zero.
    case when v.total_quantity is null
         then null
         else greatest(v.total_quantity - coalesce(peak.peak_occupied, 0), 0)
    end,
    v.total_quantity is null
  from variants v
  left join peak on peak.variant_id = v.id
  where v.id = any(p_variant_ids);
$$;

comment on function availability_for_variants is
  'Batch availability over a date range. available IS NULL means the total quantity is unknown, which is not the same as none free.';

-- ---------------------------------------------------------------------------
-- The single-item case, expressed in terms of the batch one.
-- ---------------------------------------------------------------------------
create or replace function availability_for_variant(
  p_variant_id uuid,
  p_start      date,
  p_end        date
)
returns table (
  variant_id     uuid,
  total_quantity int,
  peak_occupied  int,
  available      int,
  is_unknown     boolean
)
language sql
stable
as $$
  select * from availability_for_variants(array[p_variant_id], p_start, p_end);
$$;

-- ---------------------------------------------------------------------------
-- What is blocking a variant, for explaining a shortage to staff.
--
-- STAFF ONLY — it exposes order numbers and customer names. The public site
-- never needs this; a customer is told how many are free, not who has them.
-- ---------------------------------------------------------------------------
create or replace function availability_conflicts(
  p_variant_id uuid,
  p_start      date,
  p_end        date
)
returns table (
  order_id       uuid,
  order_number   bigint,
  customer_name  text,
  status         order_status,
  pickup_date    date,
  occupancy_ends date,
  quantity       int,
  is_overdue     boolean
)
language sql
stable
security invoker
as $$
  select
    o.id,
    o.number,
    c.name,
    o.status,
    o.pickup_date,
    order_occupancy_end(o.actual_return_date, o.agreed_return_date),
    ol.quantity,
    o.actual_return_date is null and o.agreed_return_date < current_date
  from order_lines ol
  join orders o    on o.id = ol.order_id
  join customers c on c.id = o.customer_id
  where ol.variant_id = p_variant_id
    and o.status <> 'cancelled'
    and o.pickup_date <= p_end
    and order_occupancy_end(o.actual_return_date, o.agreed_return_date) >= p_start
  order by o.pickup_date;
$$;

comment on function availability_conflicts is
  'Which orders are holding a variant over a range. Staff only: exposes customer names.';
