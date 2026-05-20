-- Migration 046: app.count_manufacturing_operation_usage helper (T-038)
-- PRD: docs/prd/02-SETTINGS-PRD.md §8.9 / V-SET-MFG-04
-- Reason: Reference.ManufacturingOperations.deactivate() must report the
--   number of active FA rows and Template rows that reference an operation
--   by name. FA/template tables may not exist yet (LEGACY-FA migration is
--   ongoing) so this helper guards each lookup with to_regclass() and
--   returns honest zeros instead of failing. When the real tables ship,
--   only this function needs an upgrade — callers remain unchanged.

create or replace function app.count_manufacturing_operation_usage(
  p_org_id uuid,
  p_operation_name text
)
returns table (active_fa_count integer, template_count integer)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_fa integer := 0;
  v_tpl integer := 0;
begin
  if p_org_id is null or p_operation_name is null then
    return query select 0, 0;
    return;
  end if;

  if to_regclass('npd.formulation_assignments') is not null then
    execute format(
      'select count(*)::integer
         from %s
        where org_id = $1
          and is_active = true
          and (
                manufacturing_operation_1 = $2
             or manufacturing_operation_2 = $2
             or manufacturing_operation_3 = $2
             or manufacturing_operation_4 = $2
              )',
      'npd.formulation_assignments'
    )
    into v_fa
    using p_org_id, p_operation_name;
  end if;

  if to_regclass('npd.templates') is not null then
    execute format(
      'select count(*)::integer
         from %s
        where org_id = $1
          and is_active = true
          and (
                template_operation_1 = $2
             or template_operation_2 = $2
             or template_operation_3 = $2
             or template_operation_4 = $2
              )',
      'npd.templates'
    )
    into v_tpl
    using p_org_id, p_operation_name;
  end if;

  return query select coalesce(v_fa, 0), coalesce(v_tpl, 0);
end;
$$;

revoke all on function app.count_manufacturing_operation_usage(uuid, text) from public;
grant execute on function app.count_manufacturing_operation_usage(uuid, text) to app_user;

comment on function app.count_manufacturing_operation_usage(uuid, text) is
  'V-SET-MFG-04 helper: returns active FA + template reference counts for a given operation name within the current org. Returns (0, 0) when the underlying FA/template tables do not exist (LEGACY-FA migration not yet complete).';
