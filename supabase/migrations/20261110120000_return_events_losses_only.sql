-- record_return has always stored quantity_returned as the units that came
-- BACK (missing/damaged counted separately), but the original table assumed
-- returned INCLUDED the losses. So a return of only missing units (returned=0)
-- was rejected by losses_within_event / returned > 0 (order #68).
-- Align the schema and the availability engine with the exclusive meaning.
alter table return_events drop constraint losses_within_event;
alter table return_events drop constraint return_events_quantity_returned_check;
alter table return_events add constraint return_events_quantity_returned_check
  check (quantity_returned >= 0);
alter table return_events add constraint return_event_not_empty
  check (quantity_returned + quantity_missing + quantity_damaged > 0);

-- Released units: what came back plus what was written off (the lost units
-- stop occupying once they leave the inventory total).
do $$
declare d text;
begin
  d := pg_get_functiondef('public.availability_for_variants(uuid[],date,date)'::regprocedure);
  d := regexp_replace(d,
    're\.quantity_returned\s*-\s*re\.quantity_missing\s*-\s*re\.quantity_damaged\s*\+\s*re\.quantity_written_off',
    're.quantity_returned + re.quantity_written_off');
  if d not like '%re.quantity_returned + re.quantity_written_off%' then
    raise exception 'availability rewrite failed';
  end if;
  execute d;
end $$;
