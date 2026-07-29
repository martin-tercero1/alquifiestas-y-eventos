-- ============================================================================
-- The public API surface, and row-level security.
--
-- Anonymous callers get exactly three things:
--   1. the public_catalog view  (published + priced variants only)
--   2. availability_for_variants
--   3. submit_reservation_request
--
-- They get NO direct table access at all. No customer data, no orders, no
-- unpublished inventory, and in particular products.internal_note — which
-- holds staff notes like "Stock desactualizado" — is not in the view and is
-- not reachable by any granted path.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Lock every table down first. With RLS on and no policies, the anon and
-- authenticated roles see nothing; access is only what is granted below.
-- ---------------------------------------------------------------------------
alter table categories           enable row level security;
alter table products             enable row level security;
alter table variants             enable row level security;
alter table product_photos       enable row level security;
alter table customers            enable row level security;
alter table orders               enable row level security;
alter table order_lines          enable row level security;
alter table return_events        enable row level security;
alter table stock_adjustments    enable row level security;
alter table payments             enable row level security;
alter table charges              enable row level security;
alter table documents            enable row level security;
alter table order_status_history enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- ---------------------------------------------------------------------------
-- The public catalog.
--
-- A variant appears here only when it is PUBLISHED and PRICED. Everything else
-- exists internally and is invisible to customers — a variant with no price is
-- real inventory staff can quote by hand, it just cannot be booked online.
--
-- This is a plain (non-security_invoker) view, so it runs with its owner's
-- rights and reads the base tables regardless of their RLS. That is the point:
-- it is the single, narrow window onto the catalog, and it exposes only the
-- columns a customer should ever see.
-- ---------------------------------------------------------------------------
create or replace view public_catalog as
select
  v.id            as variant_id,
  p.id            as product_id,
  p.slug          as product_slug,
  p.name          as product_name,
  p.description,
  v.label         as variant_label,
  v.price_per_day,
  v.total_quantity,
  c.slug          as category_slug,
  c.name          as category_name,
  parent.slug     as parent_category_slug,
  parent.name     as parent_category_name,
  c.display_order as category_display_order,
  sq.storage_path as photo_square,
  po.storage_path as photo_portrait
from variants v
join products p   on p.id = v.product_id
join categories c on c.id = p.category_id
left join categories parent on parent.id = c.parent_id
left join product_photos sq on sq.product_id = p.id and sq.crop = 'square'
left join product_photos po on po.product_id = p.id and po.crop = 'portrait'
where v.published
  and v.price_per_day is not null;

comment on view public_catalog is
  'The only catalog surface anonymous clients may read. Published and priced variants only; internal notes are deliberately absent.';

grant select on public_catalog to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The availability functions need to read orders and order_lines, which are
-- RLS-locked. SECURITY DEFINER lets them do the arithmetic without exposing a
-- single order row — they return counts, never records.
-- ---------------------------------------------------------------------------
alter function availability_for_variants(uuid[], date, date) security definer;
alter function availability_for_variants(uuid[], date, date) set search_path = public;
alter function availability_for_variant(uuid, date, date)   security definer;
alter function availability_for_variant(uuid, date, date)   set search_path = public;

grant execute on function availability_for_variants(uuid[], date, date) to anon, authenticated;
grant execute on function availability_for_variant(uuid, date, date)    to anon, authenticated;

-- availability_conflicts exposes customer names and order numbers. Staff only:
-- a customer is told how many units are free, never who is holding them.
revoke execute on function availability_conflicts(uuid, date, date) from anon;

-- ---------------------------------------------------------------------------
-- Submitting a reservation request.
--
-- The availability check and the write happen in ONE transaction, because two
-- people can book the same chairs at the same moment — one on the website, one
-- standing at the counter. The variant rows are locked first so concurrent
-- requests for the same stock serialise instead of both seeing "plenty free".
--
-- Returns a JSON result. It never raises for a shortage: shortages are data,
-- described well enough for the site to explain them in Spanish.
-- ---------------------------------------------------------------------------
create or replace function submit_reservation_request(
  p_customer_name    text,
  p_customer_phone   text,
  p_pickup_date      date,
  p_days             int,
  p_fulfilment       fulfilment_method,
  p_payment_method   payment_method,
  p_lines            jsonb,          -- [{ "variant_id": uuid, "quantity": int }]
  p_delivery_address text default null,
  p_notes            text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_return_date date;
  v_customer_id uuid;
  v_order_id    uuid;
  v_order_no    bigint;
  v_ids         uuid[];
  v_shortages   jsonb := '[]'::jsonb;
  rec           record;
begin
  ----------------------------------------------------------------- validation
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    return jsonb_build_object('ok', false, 'error', 'empty_request');
  end if;

  if p_days < 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid_days');
  end if;

  if p_pickup_date < current_date then
    return jsonb_build_object('ok', false, 'error', 'pickup_in_past');
  end if;

  if p_fulfilment = 'delivery'
     and (p_delivery_address is null or length(trim(p_delivery_address)) < 6) then
    return jsonb_build_object('ok', false, 'error', 'delivery_needs_address');
  end if;

  -- The rental is priced linearly: 24-hour price x number of days. The last
  -- day is the return day, so N days of rental spans N days of occupancy.
  v_return_date := p_pickup_date + (p_days - 1);

  select array_agg((l->>'variant_id')::uuid)
    into v_ids
    from jsonb_array_elements(p_lines) l;

  -- Serialise concurrent bookings of the same stock.
  perform 1 from variants where id = any(v_ids) order by id for update;

  ------------------------------------------------------------ availability
  -- Unknown quantity is bookable: the business is live with quantity gaps on
  -- purpose, and staff confirm by hand. Only a KNOWN shortage stops a request.
  for rec in
    select
      req.variant_id,
      req.quantity as requested,
      a.available,
      a.is_unknown,
      p.name as product_name,
      v.label as variant_label
    from (
      select (l->>'variant_id')::uuid as variant_id,
             (l->>'quantity')::int    as quantity
      from jsonb_array_elements(p_lines) l
    ) req
    join variants v on v.id = req.variant_id
    join products p on p.id = v.product_id
    left join lateral availability_for_variant(req.variant_id, p_pickup_date, v_return_date) a
      on true
    where not v.published
       or v.price_per_day is null
       or (a.available is not null and a.available < req.quantity)
       or req.quantity < 1
  loop
    v_shortages := v_shortages || jsonb_build_object(
      'variant_id',   rec.variant_id,
      'product_name', rec.product_name,
      'variant_label', rec.variant_label,
      'requested',    rec.requested,
      'available',    rec.available,
      'is_unknown',   coalesce(rec.is_unknown, true)
    );
  end loop;

  if jsonb_array_length(v_shortages) > 0 then
    return jsonb_build_object('ok', false, 'error', 'unavailable',
                              'shortages', v_shortages);
  end if;

  -------------------------------------------------------------------- customer
  -- Match on phone when there is one; a quarter of contacts have none, so a
  -- missing phone always creates a new record rather than merging strangers.
  if p_customer_phone is not null and length(trim(p_customer_phone)) > 0 then
    select id into v_customer_id
      from customers where phone = p_customer_phone limit 1;
  end if;

  if v_customer_id is null then
    insert into customers (name, phone)
    values (trim(p_customer_name), nullif(trim(p_customer_phone), ''))
    returning id into v_customer_id;
  end if;

  ----------------------------------------------------------------------- order
  insert into orders (
    customer_id, status, pickup_date, agreed_return_date, billed_days,
    fulfilment, delivery_address, payment_method, notes, source
  ) values (
    v_customer_id, 'pending_request', p_pickup_date, v_return_date, p_days,
    p_fulfilment, nullif(trim(p_delivery_address), ''), p_payment_method,
    nullif(trim(p_notes), ''), 'website'
  )
  returning id, number into v_order_id, v_order_no;

  -- Prices are SNAPSHOTTED from the catalog now. A later price correction must
  -- never silently rewrite what this customer was quoted.
  insert into order_lines (order_id, variant_id, quantity, unit_price)
  select
    v_order_id,
    (l->>'variant_id')::uuid,
    (l->>'quantity')::int,
    v.price_per_day
  from jsonb_array_elements(p_lines) l
  join variants v on v.id = (l->>'variant_id')::uuid;

  insert into order_status_history (order_id, to_status, note)
  values (v_order_id, 'pending_request', 'Solicitud recibida desde el sitio web');

  return jsonb_build_object(
    'ok', true,
    'order_id', v_order_id,
    'order_number', v_order_no,
    'pickup_date', p_pickup_date,
    'return_date', v_return_date
  );
end;
$$;

comment on function submit_reservation_request is
  'Creates a pending reservation request. Checks availability and writes in one transaction; returns a result rather than raising on shortage.';

grant execute on function submit_reservation_request(
  text, text, date, int, fulfilment_method, payment_method, jsonb, text, text
) to anon, authenticated;
