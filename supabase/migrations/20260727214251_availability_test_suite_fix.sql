-- Fix: `text[] || 'literal'` parses the literal as an array, not as an element.
-- array_append is unambiguous.
create or replace function tests.availability_suite()
returns table (case_name text, passed boolean, detail text)
language plpgsql
as $$
declare
  n text[] := '{}';
  p boolean[] := '{}';
  d text[] := '{}';

  cat_id  uuid;
  prod_id uuid;
  v_known uuid;
  v_unk   uuid;
  cust_id uuid;
  ord_id  uuid;
  line_id uuid;
  ev_id   uuid;

  t date := current_date;
  got  int;
  gotb boolean;
  i    int;
begin
  begin
    insert into categories (slug, name) values ('test-cat', 'Test') returning id into cat_id;
    insert into products (slug, name, category_id) values ('test-prod', 'Test', cat_id)
      returning id into prod_id;
    insert into variants (product_id, label, source_key, total_quantity, price_per_day, published)
      values (prod_id, 'known', 'test-known', 100, 25, true) returning id into v_known;
    insert into variants (product_id, label, source_key, total_quantity, price_per_day, published)
      values (prod_id, 'unknown', 'test-unknown', null, 25, true) returning id into v_unk;
    insert into customers (name) values ('Test Cliente') returning id into cust_id;

    -- 1: nothing booked
    select available into got from availability_for_variant(v_known, t + 1, t + 3);
    n := array_append(n, 'no bookings: all units free');
    p := array_append(p, got = 100);
    d := array_append(d, format('expected 100, got %s', got));

    -- 2: a simple confirmed booking
    insert into orders (customer_id, status, pickup_date, agreed_return_date, billed_days)
      values (cust_id, 'confirmed', t + 10, t + 12, 3) returning id into ord_id;
    insert into order_lines (order_id, variant_id, quantity, unit_price)
      values (ord_id, v_known, 40, 25);

    select available into got from availability_for_variant(v_known, t + 10, t + 12);
    n := array_append(n, 'booked range: units held');
    p := array_append(p, got = 60);
    d := array_append(d, format('expected 60, got %s', got));

    select available into got from availability_for_variant(v_known, t + 8, t + 9);
    n := array_append(n, 'before pickup: nothing held');
    p := array_append(p, got = 100);
    d := array_append(d, format('expected 100, got %s', got));

    select available into got from availability_for_variant(v_known, t + 13, t + 14);
    n := array_append(n, 'after agreed return: released');
    p := array_append(p, got = 100);
    d := array_append(d, format('expected 100, got %s', got));

    -- 3: exact boundary
    insert into orders (customer_id, status, pickup_date, agreed_return_date, billed_days)
      values (cust_id, 'confirmed', t + 12, t + 14, 3) returning id into ord_id;
    insert into order_lines (order_id, variant_id, quantity, unit_price)
      values (ord_id, v_known, 70, 25);

    select peak_occupied into got from availability_for_variant(v_known, t + 12, t + 12);
    n := array_append(n, 'exact boundary: same-day handover overlaps');
    p := array_append(p, got = 110);
    d := array_append(d, format('expected peak 110 (40+70), got %s', got));

    select available into got from availability_for_variant(v_known, t + 12, t + 12);
    n := array_append(n, 'exact boundary: oversubscribed clamps to zero free');
    p := array_append(p, got = 0);
    d := array_append(d, format('expected 0, got %s', got));

    select available into got from availability_for_variant(v_known, t + 13, t + 14);
    n := array_append(n, 'exact boundary: only the second order holds after');
    p := array_append(p, got = 30);
    d := array_append(d, format('expected 30, got %s', got));

    -- 4: overdue blocks the future
    insert into orders (customer_id, status, pickup_date, agreed_return_date, billed_days)
      values (cust_id, 'picked_up', t - 10, t - 5, 5) returning id into ord_id;
    insert into order_lines (order_id, variant_id, quantity, unit_price)
      values (ord_id, v_known, 30, 25);

    select available into got from availability_for_variant(v_known, t + 100, t + 100);
    n := array_append(n, 'overdue order blocks dates far in the future');
    p := array_append(p, got = 70);
    d := array_append(d, format('expected 70, got %s', got));

    update orders set status = 'returned', actual_return_date = t - 4 where id = ord_id;
    select available into got from availability_for_variant(v_known, t + 100, t + 100);
    n := array_append(n, 'recording receipt releases an overdue order');
    p := array_append(p, got = 100);
    d := array_append(d, format('expected 100, got %s', got));

    -- 5: partial return
    insert into orders (customer_id, status, pickup_date, agreed_return_date, billed_days)
      values (cust_id, 'picked_up', t + 20, t + 25, 6) returning id into ord_id;
    insert into order_lines (order_id, variant_id, quantity, unit_price)
      values (ord_id, v_known, 50, 25) returning id into line_id;
    insert into return_events (order_line_id, returned_on, quantity_returned)
      values (line_id, t + 22, 30);

    select available into got from availability_for_variant(v_known, t + 20, t + 21);
    n := array_append(n, 'partial return: full quantity held before the event');
    p := array_append(p, got = 50);
    d := array_append(d, format('expected 50, got %s', got));

    select available into got from availability_for_variant(v_known, t + 22, t + 25);
    n := array_append(n, 'partial return: releases the returned units');
    p := array_append(p, got = 80);
    d := array_append(d, format('expected 80, got %s', got));

    select available into got from availability_for_variant(v_known, t + 20, t + 25);
    n := array_append(n, 'partial return: range takes the worst day');
    p := array_append(p, got = 50);
    d := array_append(d, format('expected 50, got %s', got));

    -- 6: one short interior day
    insert into orders (customer_id, status, pickup_date, agreed_return_date, billed_days)
      values (cust_id, 'confirmed', t + 32, t + 32, 1) returning id into ord_id;
    insert into order_lines (order_id, variant_id, quantity, unit_price)
      values (ord_id, v_known, 95, 25);

    select available into got from availability_for_variant(v_known, t + 30, t + 35);
    n := array_append(n, 'one short interior day blocks the whole range');
    p := array_append(p, got = 5);
    d := array_append(d, format('expected 5, got %s', got));

    select available into got from availability_for_variant(v_known, t + 33, t + 35);
    n := array_append(n, 'range excluding the short day is free');
    p := array_append(p, got = 100);
    d := array_append(d, format('expected 100, got %s', got));

    -- 7: cancelled frees stock
    insert into orders (customer_id, status, pickup_date, agreed_return_date, billed_days)
      values (cust_id, 'confirmed', t + 40, t + 42, 3) returning id into ord_id;
    insert into order_lines (order_id, variant_id, quantity, unit_price)
      values (ord_id, v_known, 100, 25);

    select available into got from availability_for_variant(v_known, t + 40, t + 42);
    n := array_append(n, 'confirmed order holds the stock');
    p := array_append(p, got = 0);
    d := array_append(d, format('expected 0, got %s', got));

    update orders set status = 'cancelled' where id = ord_id;
    select available into got from availability_for_variant(v_known, t + 40, t + 42);
    n := array_append(n, 'cancelling frees the stock');
    p := array_append(p, got = 100);
    d := array_append(d, format('expected 100, got %s', got));

    -- 8: unknown is not zero
    select available, is_unknown into got, gotb
      from availability_for_variant(v_unk, t + 1, t + 3);
    n := array_append(n, 'unknown quantity returns null, not zero');
    p := array_append(p, got is null and gotb);
    d := array_append(d, format('expected null/true, got %s/%s',
                                coalesce(got::text, 'null'), gotb));

    insert into orders (customer_id, status, pickup_date, agreed_return_date, billed_days)
      values (cust_id, 'confirmed', t + 1, t + 3, 3) returning id into ord_id;
    insert into order_lines (order_id, variant_id, quantity, unit_price)
      values (ord_id, v_unk, 12, 25);

    select peak_occupied, available into got, i
      from availability_for_variant(v_unk, t + 1, t + 3);
    n := array_append(n, 'unknown quantity still tracks what is committed');
    p := array_append(p, got = 12 and i is null);
    d := array_append(d, format('expected peak 12 and null available, got %s/%s',
                                got, coalesce(i::text, 'null')));

    -- 9: damaged units keep occupying until written off
    insert into orders (customer_id, status, pickup_date, agreed_return_date, billed_days)
      values (cust_id, 'picked_up', t + 50, t + 52, 3) returning id into ord_id;
    insert into order_lines (order_id, variant_id, quantity, unit_price)
      values (ord_id, v_known, 20, 25) returning id into line_id;
    insert into return_events
      (order_line_id, returned_on, quantity_returned, quantity_damaged)
      values (line_id, t + 51, 20, 5) returning id into ev_id;

    select available into got from availability_for_variant(v_known, t + 51, t + 52);
    n := array_append(n, 'damaged units do not return to usable stock');
    p := array_append(p, got = 95);
    d := array_append(d, format('expected 95 (100 total, 5 held as damaged), got %s', got));

    insert into stock_adjustments (variant_id, delta, reason, return_event_id)
      values (v_known, -5, 'Damaged beyond repair on return', ev_id);

    select total_quantity, available into got, i
      from availability_for_variant(v_known, t + 51, t + 52);
    n := array_append(n, 'writing off damage lowers the total exactly once');
    p := array_append(p, got = 95 and i = 95);
    d := array_append(d, format('expected total 95 and 95 free, got %s/%s',
                                got, coalesce(i::text, 'null')));

    -- 10: batch agrees with single
    select count(*)::int into got
      from availability_for_variants(array[v_known, v_unk], t + 1, t + 3);
    n := array_append(n, 'batch returns one row per requested variant');
    p := array_append(p, got = 2);
    d := array_append(d, format('expected 2 rows, got %s', got));

    raise exception 'AVAILABILITY_SUITE_ROLLBACK';
  exception
    when others then
      if sqlerrm <> 'AVAILABILITY_SUITE_ROLLBACK' then
        raise;
      end if;
  end;

  for i in 1 .. coalesce(array_length(n, 1), 0) loop
    case_name := n[i];
    passed    := p[i];
    detail    := case when p[i] then 'ok' else d[i] end;
    return next;
  end loop;
end;
$$;
