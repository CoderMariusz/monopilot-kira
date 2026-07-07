-- Migration 454: CCP deviation resolve — canonical disposition enum (HACCP practice).
-- Wave0 lock: org_id; RLS via app.current_org_id().
-- disposition is nullable while status = 'open'; required when status = 'resolved'.
-- Reserved 454 for track-c2b (parallel track c1d may take adjacent numbers).

do $$
declare
  v_legacy int;
begin
  select count(*)::int into v_legacy
    from public.ccp_deviations
   where disposition is not null
     and disposition not in ('corrected', 'product_held', 'disposed');

  if v_legacy > 0 then
    raise notice '454: normalizing % legacy ccp_deviations.disposition value(s) to corrected', v_legacy;
    update public.ccp_deviations
       set disposition = 'corrected'
     where disposition is not null
       and disposition not in ('corrected', 'product_held', 'disposed');
  else
    raise notice '454: no legacy ccp_deviations.disposition values to normalize';
  end if;
end $$;

alter table public.ccp_deviations drop constraint if exists ccp_deviations_disposition_check;
alter table public.ccp_deviations add constraint ccp_deviations_disposition_check check (
  disposition is null
  or disposition in ('corrected', 'product_held', 'disposed')
);

alter table public.ccp_deviations drop constraint if exists ccp_deviations_resolved_disposition_check;
alter table public.ccp_deviations add constraint ccp_deviations_resolved_disposition_check check (
  status = 'open'
  or (status = 'resolved' and disposition is not null)
);

comment on column public.ccp_deviations.disposition is
  'HACCP disposition on resolve: corrected (process fixed, no product impact), product_held (product quarantined — release via quality_holds separately), disposed (product condemned/scrapped).';
