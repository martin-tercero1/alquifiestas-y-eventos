-- Bug fix: update_order_details billed the rental with an inclusive +1 day,
-- contradicting the nights model (days = nights = return - pickup, min 1) that
-- create_staff_order and the client daysBetween both use. A Fri→Sat rental is
-- 1 día, not 2. Recompute without the +1.
create or replace function public.update_order_details(
  p_order_id uuid,
  p_pickup_date date,
  p_return_date date,
  p_pickup_time time default null,
  p_return_time time default null,
  p_security_deposit numeric default null,
  p_notes text default null,
  p_physical_invoice_number text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_status    order_status;
  v_days      int;
  v_shortages jsonb := '[]'::jsonb;
  rec         record;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'no_autorizado');
  end if;

  select status into v_status from orders where id = p_order_id;
  if v_status is null then
    return jsonb_build_object('ok', false, 'error', 'no_encontrado');
  end if;
  if v_status not in ('quote', 'pending_request', 'confirmed') then
    return jsonb_build_object('ok', false, 'error', 'no_editable');
  end if;
  if p_pickup_date is null or p_return_date is null or p_return_date < p_pickup_date then
    return jsonb_build_object('ok', false, 'error', 'fechas_invalidas');
  end if;

  -- Nights, not inclusive days: a same-day return is still 1 día.
  v_days := greatest(1, p_return_date - p_pickup_date);

  update orders
     set pickup_date             = p_pickup_date,
         agreed_return_date      = p_return_date,
         pickup_time             = p_pickup_time,
         agreed_return_time      = p_return_time,
         billed_days             = v_days,
         security_deposit        = p_security_deposit,
         notes                   = nullif(trim(coalesce(p_notes, '')), ''),
         physical_invoice_number =
           nullif(trim(coalesce(p_physical_invoice_number, '')), '')
   where id = p_order_id;

  for rec in
    select ol.variant_id, a.total_quantity, a.peak_occupied
    from order_lines ol
    left join lateral availability_for_variant(ol.variant_id, p_pickup_date, p_return_date) a on true
    where ol.order_id = p_order_id
      and a.total_quantity is not null
      and a.peak_occupied > a.total_quantity
  loop
    v_shortages := v_shortages || jsonb_build_object('variant_id', rec.variant_id);
  end loop;

  update orders
     set availability_overridden =
           (v_status <> 'quote' and jsonb_array_length(v_shortages) > 0)
   where id = p_order_id;

  return jsonb_build_object('ok', true, 'billed_days', v_days);
end;
$function$;
