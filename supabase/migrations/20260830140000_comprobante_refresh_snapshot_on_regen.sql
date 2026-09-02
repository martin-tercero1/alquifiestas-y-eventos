-- The comprobante used to freeze its snapshot at first issue and return that
-- stale copy on every later generation, so edits to the order never reached the
-- PDF. While this is a non-fiscal internal document and orders are still being
-- edited, the useful behaviour is the opposite: always render the latest.
--
-- So: build the snapshot from current data every time, and REUSE the existing
-- document row (same consecutive number, same id, original issued_at) — just
-- refresh its snapshot/totals. Still exactly one comprobante per order; it now
-- tracks the order instead of drifting from it. (When real fiscal invoicing
-- arrives, that immutable document becomes a separate, frozen type.)
create or replace function public.issue_comprobante(p_order_id uuid, p_business_ruc text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_doc      documents%rowtype;
  v_order    orders%rowtype;
  v_customer customers%rowtype;
  v_totals   record;
  v_lines    jsonb;
  v_charges  jsonb;
  v_snapshot jsonb;
begin
  -- No role gate: the comprobante is available to every staff member. The
  -- grant to `authenticated` (below) is what keeps anon out.
  select * into v_order from orders where id = p_order_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'pedido_inexistente');
  end if;

  -- The one live (non-voided) comprobante for this order, if it already exists.
  select * into v_doc
    from documents
   where order_id = p_order_id
     and type = 'comprobante'
     and voided_at is null
   order by number desc
   limit 1;

  select * into v_customer from customers where id = v_order.customer_id;

  select lines_total, lines_after_discount, charges_total, total_charged,
         total_paid, balance, deposit_held, delivery_cost
    into v_totals
    from order_totals
   where order_id = p_order_id;

  select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'product_name',  p.name,
          'variant_label', vr.label,
          'option_choice', ol.option_choice,
          'quantity',      ol.quantity,
          'unit_price',    ol.unit_price,
          'discounted',    (ol.discount_type is not null and ol.discount_value is not null and ol.discount_value > 0),
          'line_total',    apply_discount(ol.quantity::numeric * ol.unit_price * v_order.billed_days::numeric, ol.discount_type, ol.discount_value)
        )
        order by p.name, vr.label
      ),
      '[]'::jsonb)
    into v_lines
    from order_lines ol
    join variants vr on vr.id = ol.variant_id
    join products p  on p.id = vr.product_id
   where ol.order_id = p_order_id;

  select coalesce(
      jsonb_agg(
        jsonb_build_object('kind', ch.kind, 'description', ch.description, 'amount', ch.amount)
        order by ch.created_at),
      '[]'::jsonb)
    into v_charges
    from charges ch
   where ch.order_id = p_order_id;

  v_snapshot := jsonb_build_object(
    'order', jsonb_build_object(
      'number',                  v_order.number,
      'source',                  v_order.source,
      'pickup_date',             v_order.pickup_date,
      'agreed_return_date',      v_order.agreed_return_date,
      'pickup_time',             v_order.pickup_time,
      'agreed_return_time',      v_order.agreed_return_time,
      'billed_days',             v_order.billed_days,
      'fulfilment',              v_order.fulfilment,
      'delivery_address',        v_order.delivery_address,
      'physical_invoice_number', v_order.physical_invoice_number
    ),
    'customer', jsonb_build_object(
      'name',   v_customer.name,
      'cedula', v_customer.cedula,
      'ruc',    v_customer.ruc,
      'phone',  v_customer.phone
    ),
    'lines',   v_lines,
    'charges', v_charges,
    'totals', jsonb_build_object(
      'lines_total',          coalesce(v_totals.lines_total, 0),
      'order_discount',       coalesce(v_totals.lines_total, 0) - coalesce(v_totals.lines_after_discount, 0),
      'lines_after_discount', coalesce(v_totals.lines_after_discount, 0),
      'delivery_cost',        coalesce(v_totals.delivery_cost, 0),
      'charges_total',        coalesce(v_totals.charges_total, 0),
      'total_charged',        coalesce(v_totals.total_charged, 0),
      'total_paid',           coalesce(v_totals.total_paid, 0),
      'balance',              coalesce(v_totals.balance, 0),
      'deposit_held',         coalesce(v_totals.deposit_held, 0)
    ),
    'tax', jsonb_build_object(
      'regime', 'cuota_fija', 'iva_rate', 0, 'tax_total', 0,
      'subtotal', coalesce(v_totals.total_charged, 0)
    )
  );

  if v_doc.id is not null then
    -- Refresh the existing comprobante in place: same number, same id, original
    -- issued_at — only the content is brought up to date.
    update documents
       set snapshot     = v_snapshot,
           customer_ruc = v_customer.ruc,
           subtotal     = coalesce(v_totals.total_charged, 0),
           total        = coalesce(v_totals.total_charged, 0)
     where id = v_doc.id
     returning * into v_doc;

    return jsonb_build_object(
      'ok', true, 'reused', true,
      'number', v_doc.number, 'issued_at', v_doc.issued_at,
      'snapshot', v_doc.snapshot);
  end if;

  insert into documents(
      order_id, type, business_ruc, customer_ruc,
      subtotal, tax_total, tax_breakdown, total, snapshot)
    values (
      p_order_id, 'comprobante', p_business_ruc, v_customer.ruc,
      coalesce(v_totals.total_charged, 0), 0,
      jsonb_build_object('regime', 'cuota_fija', 'iva_rate', 0),
      coalesce(v_totals.total_charged, 0), v_snapshot)
    returning * into v_doc;

  return jsonb_build_object(
    'ok', true, 'reused', false,
    'number', v_doc.number, 'issued_at', v_doc.issued_at,
    'snapshot', v_doc.snapshot);
end;
$function$;
