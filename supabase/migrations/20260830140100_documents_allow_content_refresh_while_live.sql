-- Immutability, scoped for the non-fiscal stage. The consecutive number, the
-- order it belongs to, its type and its issue date are still frozen — those are
-- the invariants that matter — and a VOIDED document stays frozen forever. But a
-- live comprobante's CONTENT (snapshot + totals) may be refreshed, so
-- regenerating it after the order is edited brings the same numbered document up
-- to date instead of drifting from the order. When real fiscal invoicing arrives
-- it becomes a distinct, fully-immutable document type.
create or replace function public.forbid_document_rewrite()
returns trigger
language plpgsql
as $function$
begin
  -- Identity is permanent — never let the number, order, type or issue date move.
  if new.order_id  is distinct from old.order_id
  or new.type      is distinct from old.type
  or new.number    is distinct from old.number
  or new.issued_at is distinct from old.issued_at
  then
    raise exception
      'La identidad del documento % no se puede cambiar (número, pedido, tipo o fecha de emisión).',
      old.number
      using errcode = 'restrict_violation';
  end if;

  -- Once voided, a document is frozen for good: no content edits, no un-voiding.
  if old.voided_at is not null then
    raise exception 'El documento % está anulado y no se puede modificar.', old.number
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$function$;
