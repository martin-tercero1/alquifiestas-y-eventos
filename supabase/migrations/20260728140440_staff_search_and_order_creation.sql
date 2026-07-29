-- Search and order creation for the admin panel.
--
-- She types fast with a customer waiting, so search has to forgive: no
-- accents, wrong letters, partial words, words out of order.

-- ---------------------------------------------------------------------------
-- staff_catalog: like public_catalog, but shows everything
-- ---------------------------------------------------------------------------
-- The public view hides variants with no price. Staff need exactly those —
-- filling them in is half the job of the Inventario screen, and an unpriced
-- item can still go on a proforma with a price typed by hand.

create or replace view staff_catalog as
select
  v.id                 as variant_id,
  p.id                 as product_id,
  p.slug               as product_slug,
  p.name               as product_name,
  v.label              as variant_label,
  v.price_per_day,
  v.price_source,
  v.total_quantity,
  v.quantity_source,
  v.published,
  c.id                 as category_id,
  c.name               as category_name,
  c.display_order      as category_display_order,
  coalesce(parent.name, c.name) as top_category_name,
  sq.storage_path      as photo_square,
  p.internal_note
from variants v
join products p     on p.id = v.product_id
join categories c   on c.id = p.category_id
left join categories parent on parent.id = c.parent_id
left join product_photos sq on sq.product_id = p.id and sq.crop = 'square';

revoke all on staff_catalog from anon, authenticated;
grant select on staff_catalog to authenticated;

comment on view staff_catalog is
  'Every variant, priced or not, published or not. Staff-only: it carries internal_note, which must never reach the public site.';

-- ---------------------------------------------------------------------------
-- search_variants
-- ---------------------------------------------------------------------------

create or replace function search_variants(q text default '', limit_n int default 30)
returns table (
  variant_id     uuid,
  product_id     uuid,
  product_name   text,
  variant_label  text,
  category_name  text,
  price_per_day  numeric,
  price_source   text,
  total_quantity int,
  published      boolean,
  photo_square   text,
  score          real
)
language sql stable
set search_path = public, extensions
as $$
  with needle as (
    select search_normalize(coalesce(q, '')) as n
  ),
  terms as (
    select array_remove(string_to_array((select n from needle), ' '), '') as parts
  ),
  candidates as (
    select
      sc.*,
      search_normalize(
        sc.product_name || ' ' || coalesce(sc.variant_label, '') || ' ' || sc.category_name
      ) as haystack
    from staff_catalog sc
  )
  select
    c.variant_id, c.product_id, c.product_name, c.variant_label, c.category_name,
    c.price_per_day, c.price_source, c.total_quantity, c.published, c.photo_square,
    greatest(
      extensions.similarity((select n from needle), c.haystack),
      extensions.word_similarity((select n from needle), c.haystack)
    )::real as score
  from candidates c
  where
    (select n from needle) = ''
    -- Every word she typed appears somewhere: "mesa 10" finds
    -- "Mesa Redonda para 10 personas" even though the words are not adjacent.
    or (select bool_and(c.haystack like '%' || part || '%') from unnest((select parts from terms)) part)
    -- ...or it is close enough to be a typo: "tifany" finds "Silla Tiffany".
    or extensions.word_similarity((select n from needle), c.haystack) >= 0.4
  order by
    -- A blank box is the state she starts in, so it shows the categories the
    -- business actually lives on rather than an empty panel.
    case when (select n from needle) = '' then 0 else 1 end,
    case when (select n from needle) = '' then c.category_display_order else 0 end,
    score desc,
    c.product_name,
    c.variant_label nulls first
  limit greatest(1, least(limit_n, 100));
$$;

comment on function search_variants is
  'Accent-, typo- and word-order-tolerant catalog search. Blank query returns the catalog in business-priority order.';

grant execute on function search_variants(text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- search_customers
-- ---------------------------------------------------------------------------

create or replace function search_customers(q text default '', limit_n int default 15)
returns table (
  id            uuid,
  name          text,
  phone         text,
  phone_alt     text,
  orders_count  bigint,
  last_order_at timestamptz,
  score         real
)
language sql stable
set search_path = public, extensions
as $$
  with needle as (
    select search_normalize(coalesce(q, '')) as n,
           -- Phones are matched on digits alone, so "8888 7777", "88887777"
           -- and "+505 8888-7777" are the same search.
           regexp_replace(coalesce(q, ''), '\D', '', 'g') as digits
  )
  select
    cu.id, cu.name, cu.phone, cu.phone_alt,
    count(o.id) as orders_count,
    max(o.created_at) as last_order_at,
    extensions.word_similarity((select n from needle), search_normalize(cu.name))::real as score
  from customers cu
  left join orders o on o.customer_id = cu.id
  where
    (select n from needle) = ''
    or search_normalize(cu.name) like '%' || (select n from needle) || '%'
    or extensions.word_similarity((select n from needle), search_normalize(cu.name)) >= 0.4
    or (
      length((select digits from needle)) >= 4
      and regexp_replace(coalesce(cu.phone, '') || coalesce(cu.phone_alt, ''), '\D', '', 'g')
          like '%' || (select digits from needle) || '%'
    )
  group by cu.id, cu.name, cu.phone, cu.phone_alt
  order by score desc, max(o.created_at) desc nulls last, cu.name
  limit greatest(1, least(limit_n, 50));
$$;

grant execute on function search_customers(text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- create_staff_order
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER: this runs as the logged-in staff member, so RLS applies
-- and created_by fills itself in from auth.uid().
--
-- It NEVER refuses. The public function rejects a request it cannot honour,
-- because a stranger on the internet must not book chairs that do not exist.
-- This one is used by the owner, standing next to the customer, who knows
-- things the database does not — she borrows stock from another business, or
-- knows an order is coming back early. It saves the order and reports
-- shortages as data. A hard block is what made Odoo unusable.

create or replace function create_staff_order(p jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_order_id    uuid;
  v_order_no    bigint;
  v_pickup      date := (p->>'pickup_date')::date;
  v_return      date := (p->>'agreed_return_date')::date;
  v_shortages   jsonb := '[]'::jsonb;
  v_saved       jsonb := '[]'::jsonb;
  rec           record;
  line          jsonb;
begin
  if p->'lines' is null or jsonb_array_length(p->'lines') = 0 then
    return jsonb_build_object('ok', false, 'error', 'sin_articulos');
  end if;

  if v_pickup is null or v_return is null or v_return < v_pickup then
    return jsonb_build_object('ok', false, 'error', 'fechas_invalidas');
  end if;

  ------------------------------------------------------------------- customer
  v_customer_id := nullif(p->'customer'->>'id', '')::uuid;

  if v_customer_id is null then
    insert into customers (name, phone)
    values (
      trim(p->'customer'->>'name'),
      nullif(trim(coalesce(p->'customer'->>'phone', '')), '')
    )
    returning id into v_customer_id;
  end if;

  ---------------------------------------------------------------------- order
  insert into orders (
    customer_id, status, pickup_date, agreed_return_date, billed_days,
    fulfilment, delivery_address, delivery_cost, payment_method,
    security_deposit, discount_type, discount_value,
    physical_invoice_number, notes, source, override_reason
  ) values (
    v_customer_id,
    coalesce((p->>'status')::order_status, 'confirmed'),
    v_pickup,
    v_return,
    greatest(1, coalesce((p->>'billed_days')::int, (v_return - v_pickup) + 1)),
    coalesce((p->>'fulfilment')::fulfilment_method, 'pickup'),
    nullif(trim(coalesce(p->>'delivery_address', '')), ''),
    (p->>'delivery_cost')::numeric,
    coalesce((p->>'payment_method')::payment_method, 'cash'),
    (p->>'security_deposit')::numeric,
    (p->>'discount_type')::discount_type,
    (p->>'discount_value')::numeric,
    nullif(trim(coalesce(p->>'physical_invoice_number', '')), ''),
    nullif(trim(coalesce(p->>'notes', '')), ''),
    'admin',
    nullif(trim(coalesce(p->>'override_reason', '')), '')
  )
  returning id, number into v_order_id, v_order_no;

  ---------------------------------------------------------------------- lines
  for line in select * from jsonb_array_elements(p->'lines') loop
    insert into order_lines (order_id, variant_id, quantity, unit_price,
                             discount_type, discount_value)
    values (
      v_order_id,
      (line->>'variant_id')::uuid,
      greatest(1, (line->>'quantity')::int),
      (line->>'unit_price')::numeric,
      (line->>'discount_type')::discount_type,
      (line->>'discount_value')::numeric
    );

    -- The catalog fills itself in as a side effect of real work: she types a
    -- price for an item that had none, ticks the box, and it is in the
    -- catalog. Marked 'staff' because she is the authority on it — that is
    -- what stops a later import run overwriting it.
    if coalesce((line->>'save_price_to_catalog')::boolean, false) then
      update variants
         set price_per_day = (line->>'unit_price')::numeric,
             price_source  = 'staff'
       where id = (line->>'variant_id')::uuid
         and (price_per_day is null or price_source in ('recovered', 'estimated'))
      returning id into rec;

      if found then
        v_saved := v_saved || to_jsonb(line->>'variant_id');
      end if;
    end if;
  end loop;

  ------------------------------------------------------------- availability
  -- Computed AFTER the write, on purpose: the order exists either way, and
  -- this is a report on it rather than a gate in front of it.
  for rec in
    select
      ol.variant_id,
      ol.quantity as requested,
      a.available,
      a.is_unknown,
      pr.name  as product_name,
      v.label  as variant_label
    from order_lines ol
    join variants v on v.id = ol.variant_id
    join products pr on pr.id = v.product_id
    left join lateral availability_for_variant(ol.variant_id, v_pickup, v_return) a on true
    where ol.order_id = v_order_id
      and a.available is not null
      and a.available < 0
  loop
    v_shortages := v_shortages || jsonb_build_object(
      'variant_id',    rec.variant_id,
      'product_name',  rec.product_name,
      'variant_label', rec.variant_label,
      'requested',     rec.requested,
      'available',     rec.available,
      'is_unknown',    coalesce(rec.is_unknown, true)
    );
  end loop;

  if jsonb_array_length(v_shortages) > 0 then
    update orders set availability_overridden = true where id = v_order_id;
  end if;

  insert into order_status_history (order_id, to_status, changed_by, note)
  values (
    v_order_id,
    coalesce((p->>'status')::order_status, 'confirmed'),
    auth.uid(),
    'Proforma creada en el panel'
  );

  return jsonb_build_object(
    'ok', true,
    'order_id', v_order_id,
    'order_number', v_order_no,
    'shortages', v_shortages,
    'prices_saved', v_saved
  );
end;
$$;

comment on function create_staff_order is
  'Creates a proforma in one transaction. Never refuses on availability — it saves and reports shortages as data, because the owner knows things the database does not.';

grant execute on function create_staff_order(jsonb) to authenticated;
