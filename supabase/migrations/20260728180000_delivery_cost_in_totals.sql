-- Transportation is money the customer owes, so it belongs in the total and the
-- balance — not just shown beside them. Until now delivery_cost sat on the order
-- but was never summed anywhere, so a delivery order's on-screen total was short
-- by the freight every time. This folds it in, once, in the one place totals are
-- computed. Delivery is never discounted (the line discount applies to articles
-- only), so it is added after apply_discount, alongside charges.
-- Column order is preserved (delivery_cost appended last) so CREATE OR REPLACE
-- is allowed.
create or replace view order_totals as
select
  o.id as order_id,
  o.number,
  coalesce(l.lines_total, 0::numeric) as lines_total,
  apply_discount(coalesce(l.lines_total, 0::numeric), o.discount_type, o.discount_value) as lines_after_discount,
  coalesce(c.charges_total, 0::numeric) as charges_total,
  apply_discount(coalesce(l.lines_total, 0::numeric), o.discount_type, o.discount_value)
    + coalesce(c.charges_total, 0::numeric)
    + coalesce(o.delivery_cost, 0::numeric) as total_charged,
  coalesce(p.paid_total, 0::numeric) as total_paid,
  apply_discount(coalesce(l.lines_total, 0::numeric), o.discount_type, o.discount_value)
    + coalesce(c.charges_total, 0::numeric)
    + coalesce(o.delivery_cost, 0::numeric)
    - coalesce(p.paid_total, 0::numeric) as balance,
  case when o.deposit_returned_at is null then o.security_deposit else 0::numeric end as deposit_held,
  coalesce(o.delivery_cost, 0::numeric) as delivery_cost
from orders o
left join lateral (
  select sum(apply_discount(ol.quantity::numeric * ol.unit_price * o.billed_days::numeric, ol.discount_type, ol.discount_value)) as lines_total
  from order_lines ol where ol.order_id = o.id
) l on true
left join lateral (
  select sum(ch.amount) as charges_total from charges ch where ch.order_id = o.id
) c on true
left join lateral (
  select sum(case when pm.kind = 'refund'::payment_kind then - pm.amount else pm.amount end) as paid_total
  from payments pm where pm.order_id = o.id
) p on true;
