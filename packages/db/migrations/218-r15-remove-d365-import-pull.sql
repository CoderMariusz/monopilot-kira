-- Migration 218: R15 D365 export-only anti-corruption corrective migration.
--
-- Source migrations read:
--   * 165-factory-specs.sql: factory_specs.source allowed
--     ('technical', 'npd_builder', 'd365_import').
--   * 164-d365-sync-jobs-and-dlq.sql: d365_sync_jobs.direction and
--     d365_sync_dlq.direction allowed ('pull', 'push').
--
-- R15 correction: D365 is export-only. Remove inbound/pull states from DB
-- constraints after cleaning existing data so the new CHECKs validate.

update public.factory_specs
   set source = 'technical'
 where source = 'd365_import';

alter table public.factory_specs
  drop constraint if exists factory_specs_source_check;

alter table public.factory_specs
  add constraint factory_specs_source_check
  check (source in ('technical', 'npd_builder'));

alter table public.factory_specs
  drop constraint if exists factory_specs_d365_import_status_check;

-- Pull rows are deleted, not rewritten: an export-only clean system must not
-- retain inbound job/DLQ records as active integration state.
delete from public.d365_sync_dlq
 where direction = 'pull';

delete from public.d365_sync_jobs
 where direction = 'pull';

alter table public.d365_sync_jobs
  drop constraint if exists d365_sync_jobs_direction_check;

alter table public.d365_sync_jobs
  add constraint d365_sync_jobs_direction_check
  check (direction in ('push'));

alter table public.d365_sync_dlq
  drop constraint if exists d365_sync_dlq_direction_check;

alter table public.d365_sync_dlq
  add constraint d365_sync_dlq_direction_check
  check (direction in ('push'));
