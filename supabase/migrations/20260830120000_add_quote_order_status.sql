-- A new order status: 'quote' (Cotización). A quote is a provisional order that
-- does NOT reserve inventory — the customer asked for a price but has not
-- committed. It sits before 'pending_request' in the enum for a natural reading
-- order. Availability treats it like 'cancelled' (ignored); confirming it turns
-- it into a normal reserving order.
--
-- Kept in its own migration so the value is committed before the functions in
-- the next migration reference it.
alter type order_status add value if not exists 'quote' before 'pending_request';
