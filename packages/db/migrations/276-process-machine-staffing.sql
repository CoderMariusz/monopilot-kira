-- 276-process-machine-staffing.sql
-- Wave 8a / Lane K4 (C) — machine assignment + staffing + setup cost on processes.
--
-- IMPORTANT (mirrors 269-settings-process-costing.sql): process steps are NOT a
-- physical table. They live in public.reference_tables (table_code = 'processes')
-- with their schema in public.reference_schemas (table_code = 'reference.processes').
-- Therefore the new "columns" are reference_schemas rows + jsonb keys on row_data,
-- exactly how 269 exposed cost_mode / cost_rate / currency.
--
-- machine_id: stored as text (soft reference to public.machines — by code OR id).
--   A physical uuid FK is impossible on a jsonb-backed reference row, so this is a
--   loose reference resolved by the Machines screen (settings/machines). No FK.
-- staffing_count: integer >= 0 (number, scale 0).
-- setup_cost: numeric(12,2) >= 0 (number, scale 2).

do $$
begin
  insert into public.reference_schemas
    (org_id, table_code, column_code, data_type, tier, storage, dropdown_source,
     required_for_done, validation_json, presentation_json)
  select null::uuid, v.table_code, v.column_code, v.data_type, 'L1', 'ext_jsonb',
         null::text, v.required_for_done, v.validation_json, v.presentation_json
    from (
      values
        (
          'reference.processes',
          'machine_id',
          'text',
          false,
          '{"required":false}'::jsonb,
          '{"label":"Machine (code/id)","editable_by":["admin","production_manager"]}'::jsonb
        ),
        (
          'reference.processes',
          'staffing_count',
          'number',
          false,
          '{"required":false,"min":0,"scale":0}'::jsonb,
          '{"label":"Staffing","editable_by":["admin","production_manager"]}'::jsonb
        ),
        (
          'reference.processes',
          'setup_cost',
          'number',
          false,
          '{"required":false,"min":0,"scale":2}'::jsonb,
          '{"label":"Setup cost","editable_by":["admin","production_manager"]}'::jsonb
        )
    ) as v(table_code, column_code, data_type, required_for_done, validation_json, presentation_json)
   where not exists (
     select 1
       from public.reference_schemas existing
      where existing.org_id is null
        and existing.table_code = v.table_code
        and existing.column_code = v.column_code
        and existing.deprecated_at is null
   );

  -- staffing_count must be a non-negative integer when present.
  if not exists (
    select 1 from pg_constraint
     where conname = 'reference_processes_staffing_count_check'
       and conrelid = 'public.reference_tables'::regclass
  ) then
    alter table public.reference_tables
      add constraint reference_processes_staffing_count_check
      check (
        table_code <> 'processes'
        or nullif(row_data ->> 'staffing_count', '') is null
        or (row_data ->> 'staffing_count') ~ '^[0-9]+$'
      ) not valid;
    alter table public.reference_tables validate constraint reference_processes_staffing_count_check;
  end if;

  -- setup_cost must be a non-negative number with up to 2 decimals when present.
  if not exists (
    select 1 from pg_constraint
     where conname = 'reference_processes_setup_cost_check'
       and conrelid = 'public.reference_tables'::regclass
  ) then
    alter table public.reference_tables
      add constraint reference_processes_setup_cost_check
      check (
        table_code <> 'processes'
        or nullif(row_data ->> 'setup_cost', '') is null
        or (row_data ->> 'setup_cost') ~ '^[0-9]+(\.[0-9]{1,2})?$'
      ) not valid;
    alter table public.reference_tables validate constraint reference_processes_setup_cost_check;
  end if;
end $$;
