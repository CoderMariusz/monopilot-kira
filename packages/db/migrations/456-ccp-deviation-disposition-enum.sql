-- Migration 456: CCP deviation resolve — canonical disposition enum (HACCP practice).
-- Wave0 lock: org_id; RLS via app.current_org_id().
-- disposition is nullable while status = 'open'; required when status = 'resolved'.
-- Skipped 454–455 (parallel track c1d + buffer). Idempotent, additive, live-safe.
--
-- Legacy free-text disposition values are NOT rewritten — that would falsify quality
-- history. CHECK constraints are added NOT VALID (mig 328 pattern) so new writes are
-- guarded while existing rows remain until an audited manual cleanup.

do $$
declare
  v_legacy int;
begin
  select count(*)::int into v_legacy
    from public.ccp_deviations
   where disposition is not null
     and disposition not in ('corrected', 'product_held', 'disposed');

  if v_legacy > 0 then
    raise notice '456: % legacy ccp_deviations.disposition value(s) outside canonical enum — left unchanged (NOT VALID checks protect new writes only)', v_legacy;
  else
    raise notice '456: no legacy ccp_deviations.disposition values outside canonical enum';
  end if;
end $$;

alter table public.ccp_deviations drop constraint if exists ccp_deviations_disposition_check;
alter table public.ccp_deviations add constraint ccp_deviations_disposition_check check (
  disposition is null
  or disposition in ('corrected', 'product_held', 'disposed')
) not valid;

alter table public.ccp_deviations drop constraint if exists ccp_deviations_resolved_disposition_check;
alter table public.ccp_deviations add constraint ccp_deviations_resolved_disposition_check check (
  status = 'open'
  or (status = 'resolved' and disposition is not null)
) not valid;

comment on column public.ccp_deviations.disposition is
  'HACCP disposition on resolve: corrected (process fixed, no product impact), product_held (product quarantined — release via quality_holds separately), disposed (product condemned/scrapped).';
