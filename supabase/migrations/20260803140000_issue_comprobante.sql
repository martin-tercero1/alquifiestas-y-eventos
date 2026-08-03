-- Brief-04 §9: issue a non-fiscal comprobante for an order.
--
-- SECURITY DEFINER + is_tech_admin() gate: only the technical-admin role can
-- issue one while the layout is being refined, before the parents ever see it.
--
-- Idempotent by design. A document number is a *consecutive* number — the model
-- is built so that when DGI authorization arrives, this same series becomes the
-- fiscal one. So a number is spent once per order and reused on every later
-- render; previewing the PDF ten times must not burn ten numbers. Re-issuing
-- returns the existing live comprobante untouched (a document, once issued, is
-- voided but never rewritten). The frozen `snapshot` captures the order exactly
-- as it stood at issue time, so the PDF is reproducible even if the order later
-- changes.
--
-- Régimen de cuota fija: no IVA line. The tax structure is written into the
-- snapshot and the documents row so switching it on later (régimen general) is
-- a data change, not a layout rebuild.
create or replace function issue_comprobante(
  p_order_id uuid,
  p_business_ruc text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc      documents%rowtype;
  v_order    orders%rowtype;
  v_customer customers%rowtype;
  v_totals   record;
  v_lines    jsonb;
  v_charges  jsonb;
  v_snapshot jsonb;
begin
  if not is_tech_admin() then
    return jsonb_build_object('ok', false, 'error', 'no_autorizado');
  end if;

  select * into v_order from orders where id = p_order_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'pedido_inexistente');
  end if;

  -- One live comprobante per order; re-issue returns the same numbered document.
  select * into v_doc
    from documents
   where order_id = p_order_id
     and type = 'comprobante'
     and voided_at is null
   order by number desc
   limit 1;

  if found then
    return jsonb_build_object(
      'ok', true, 'reused', true,
      'number', v_doc.number, 'issued_at', v_doc.issued_at,
      'snapshot', v_doc.snapshot);
  end if;

  select * into v_customer from customers where id = v_order.customer_id;

  select lines_total, lines_after_discount, charges_total, total_charged,
         total_paid, balance, deposit_held, delivery_cost
    into v_totals
    from order_totals
   where order_id = p_order_id;

  -- Per-line amount is net of that line's own discount, so the lines sum to
  -- lines_total exactly — the comprobante has to foot to the last córdoba.
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
$$;

grant execute on function issue_comprobante(uuid, text) to authenticated;
