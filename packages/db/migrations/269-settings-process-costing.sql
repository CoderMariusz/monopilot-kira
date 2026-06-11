-- 269-settings-process-costing.sql
-- Process steps are stored in public.reference_tables (table_code = 'processes')
-- with their generated schema in public.reference_schemas (table_code =
-- 'reference.processes'). Do not create a physical processes table.

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
          'cost_mode',
          'enum',
          true,
          '{"required":true,"enum_values":["per_hour","per_run"]}'::jsonb,
          '{"label":"Cost mode","editable_by":["admin","production_manager"]}'::jsonb
        ),
        (
          'reference.processes',
          'cost_rate',
          'number',
          false,
          '{"required":false,"min":0,"scale":2}'::jsonb,
          '{"label":"Rate","editable_by":["admin","production_manager"]}'::jsonb
        ),
        (
          'reference.processes',
          'currency',
          'text',
          true,
          '{"required":true,"pattern":"^[A-Z]{3}$","default":"EUR"}'::jsonb,
          '{"label":"Currency","editable_by":["admin","production_manager"]}'::jsonb
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

  update public.reference_tables
     set row_data = jsonb_set(
           jsonb_set(
             coalesce(row_data, '{}'::jsonb),
             '{cost_mode}',
             to_jsonb(coalesce(nullif(row_data ->> 'cost_mode', ''), 'per_hour')),
             true
           ),
           '{currency}',
           to_jsonb(coalesce(nullif(row_data ->> 'currency', ''), 'EUR')),
           true
         )
   where table_code = 'processes'
     and (
       not (row_data ? 'cost_mode')
       or nullif(row_data ->> 'cost_mode', '') is null
       or not (row_data ? 'currency')
       or nullif(row_data ->> 'currency', '') is null
     );

  if not exists (
    select 1 from pg_constraint
     where conname = 'reference_processes_cost_mode_check'
       and conrelid = 'public.reference_tables'::regclass
  ) then
    alter table public.reference_tables
      add constraint reference_processes_cost_mode_check
      check (
        table_code <> 'processes'
        or coalesce(row_data ->> 'cost_mode', 'per_hour') in ('per_hour', 'per_run')
      ) not valid;
    alter table public.reference_tables validate constraint reference_processes_cost_mode_check;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'reference_processes_currency_check'
       and conrelid = 'public.reference_tables'::regclass
  ) then
    alter table public.reference_tables
      add constraint reference_processes_currency_check
      check (
        table_code <> 'processes'
        or coalesce(row_data ->> 'currency', 'EUR') ~ '^[A-Z]{3}$'
      ) not valid;
    alter table public.reference_tables validate constraint reference_processes_currency_check;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'reference_processes_cost_rate_check'
       and conrelid = 'public.reference_tables'::regclass
  ) then
    alter table public.reference_tables
      add constraint reference_processes_cost_rate_check
      check (
        table_code <> 'processes'
        or nullif(row_data ->> 'cost_rate', '') is null
        or (row_data ->> 'cost_rate') ~ '^[0-9]+(\.[0-9]{1,2})?$'
      ) not valid;
    alter table public.reference_tables validate constraint reference_processes_cost_rate_check;
  end if;
end $$;
