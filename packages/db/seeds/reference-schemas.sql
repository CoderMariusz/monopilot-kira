-- Seed: reference_schemas universal L1 baseline for 02-SETTINGS T-093.
-- PRD: docs/prd/02-SETTINGS-PRD.md §8.1, §8.2, §8.8.
-- Scope: org_id IS NULL = universal L1 schema rows; no org-scoped overrides.
-- Idempotency: nullable org_id does not participate in UNIQUE conflicts, so the
-- seed checks universal (org_id IS NULL, table_code, column_code) keys explicitly.

do $$
begin
  perform 1
  from (
    values
      ('reference.dept_columns', 'column_code'),
      ('reference.pack_sizes', 'pack_size'),
      ('reference.pack_sizes', 'display_order'),
      ('reference.pack_sizes', 'is_active'),
      ('reference.lines_by_pack_size', 'pack_size'),
      ('reference.dieset_by_line_pack', 'dieset_code'),
      ('reference.templates', 'template_code'),
      ('reference.email_config', 'email_key'),
      ('reference.processes', 'process_code'),
      ('reference.processes', 'name'),
      ('reference.processes', 'category'),
      ('reference.partners', 'partner_code'),
      ('reference.partners', 'name'),
      ('reference.partners', 'partner_type'),
      ('reference.partners', 'status'),
      ('reference.close_confirm', 'confirmation_code'),
      ('reference.alert_thresholds', 'threshold_code'),
      ('reference.allergens_reference', 'allergen_code'),
      ('reference.d365_constants', 'constant_key'),
      ('reference.quality_hold_reasons', 'reason_code'),
      ('reference.qa_failure_reasons', 'reason_code'),
      ('reference.waste_categories', 'category_code'),
      ('reference.allergen_hold_reasons', 'reason_code'),
      ('reference.shipping_override_reasons', 'reason_code'),
      ('reference.rma_reason_codes', 'reason_code'),
      ('reference.dashboards_catalog', 'dashboard_id'),
      ('reference.shift_configs', 'shift_code'),
      ('reference.oee_alert_thresholds', 'oee_target_pct'),
      ('reference.maintenance_alert_thresholds', 'threshold_code'),
      ('reference.technician_skills', 'skill_code'),
      ('reference.spare_parts_categories', 'category_code'),
      ('reference.sites_hierarchy_config', 'depth'),
      ('reference.changeover_target_duration_min', 'changeover_target_duration_min')
  ) as seed_key(table_code, column_code)
  where not exists (
    select 1
    from public.reference_schemas existing
    where existing.org_id is null
      and existing.table_code = seed_key.table_code
      and existing.column_code = seed_key.column_code
  )
  limit 1;

  if found then
    delete from public.reference_schemas existing
    using (
      values
        ('reference.dept_columns', 'column_code'),
        ('reference.pack_sizes', 'pack_size'),
        ('reference.pack_sizes', 'display_order'),
        ('reference.pack_sizes', 'is_active'),
        ('reference.lines_by_pack_size', 'pack_size'),
        ('reference.dieset_by_line_pack', 'dieset_code'),
        ('reference.templates', 'template_code'),
        ('reference.email_config', 'email_key'),
        ('reference.processes', 'process_code'),
        ('reference.processes', 'name'),
        ('reference.processes', 'category'),
        ('reference.partners', 'partner_code'),
        ('reference.partners', 'name'),
        ('reference.partners', 'partner_type'),
        ('reference.partners', 'status'),
        ('reference.close_confirm', 'confirmation_code'),
        ('reference.alert_thresholds', 'threshold_code'),
        ('reference.allergens_reference', 'allergen_code'),
        ('reference.d365_constants', 'constant_key'),
        ('reference.quality_hold_reasons', 'reason_code'),
        ('reference.qa_failure_reasons', 'reason_code'),
        ('reference.waste_categories', 'category_code'),
        ('reference.allergen_hold_reasons', 'reason_code'),
        ('reference.shipping_override_reasons', 'reason_code'),
        ('reference.rma_reason_codes', 'reason_code'),
        ('reference.dashboards_catalog', 'dashboard_id'),
        ('reference.shift_configs', 'shift_code'),
        ('reference.oee_alert_thresholds', 'oee_target_pct'),
        ('reference.maintenance_alert_thresholds', 'threshold_code'),
        ('reference.technician_skills', 'skill_code'),
        ('reference.spare_parts_categories', 'category_code'),
        ('reference.sites_hierarchy_config', 'depth'),
        ('reference.changeover_target_duration_min', 'changeover_target_duration_min')
    ) as seed_key(table_code, column_code)
    where existing.org_id is null
      and existing.table_code = seed_key.table_code
      and existing.column_code = seed_key.column_code;

    insert into public.reference_schemas (
      org_id,
      table_code,
      column_code,
      data_type,
      tier,
      storage,
      dropdown_source,
      required_for_done,
      validation_json,
      presentation_json
    )
    values
      (null, 'reference.dept_columns', 'column_code', 'text', 'L1', 'ext_jsonb', null, true, '{"required":true,"unique":true}'::jsonb, '{"label":"Column code","editable_by":["admin"]}'::jsonb),
      (null, 'reference.pack_sizes', 'pack_size', 'text', 'L1', 'ext_jsonb', null, true, '{"required":true,"unique":true,"regex":"^\\d+x\\d+cm$"}'::jsonb, '{"label":"Pack size","placeholder":"20x30cm","editable_by":["admin"]}'::jsonb),
      (null, 'reference.pack_sizes', 'display_order', 'number', 'L1', 'ext_jsonb', null, false, '{"required":false}'::jsonb, '{"label":"Display order","editable_by":["admin"]}'::jsonb),
      (null, 'reference.pack_sizes', 'is_active', 'enum', 'L1', 'ext_jsonb', null, true, '{"required":true,"enum_values":["true","false"]}'::jsonb, '{"label":"Active","editable_by":["admin"]}'::jsonb),
      (null, 'reference.lines_by_pack_size', 'pack_size', 'relation', 'L1', 'ext_jsonb', 'reference.pack_sizes', true, '{"required":true}'::jsonb, '{"label":"Pack size","editable_by":["admin"]}'::jsonb),
      (null, 'reference.dieset_by_line_pack', 'dieset_code', 'text', 'L1', 'ext_jsonb', null, true, '{"required":true,"unique":true}'::jsonb, '{"label":"Dieset code","editable_by":["admin"]}'::jsonb),
      (null, 'reference.templates', 'template_code', 'text', 'L1', 'ext_jsonb', null, true, '{"required":true,"unique":true}'::jsonb, '{"label":"Template code","editable_by":["admin"]}'::jsonb),
      (null, 'reference.email_config', 'email_key', 'text', 'L1', 'ext_jsonb', null, true, '{"required":true,"unique":true}'::jsonb, '{"label":"Email config key","editable_by":["admin"]}'::jsonb),
      (null, 'reference.processes', 'process_code', 'text', 'L1', 'ext_jsonb', null, true, '{"required":true,"unique":true}'::jsonb, '{"label":"Process code","editable_by":["admin"]}'::jsonb),
      (null, 'reference.processes', 'name', 'text', 'L1', 'ext_jsonb', null, true, '{"required":true}'::jsonb, '{"label":"Name","editable_by":["admin","production_manager"]}'::jsonb),
      (null, 'reference.processes', 'category', 'enum', 'L1', 'ext_jsonb', null, false, '{"required":false,"enum_values":["preparation","processing","packaging","quality","logistics"]}'::jsonb, '{"label":"Category","editable_by":["admin","production_manager"]}'::jsonb),
      (null, 'reference.partners', 'partner_code', 'text', 'L1', 'ext_jsonb', null, true, '{"required":true,"unique":true}'::jsonb, '{"label":"Partner code","editable_by":["admin"]}'::jsonb),
      (null, 'reference.partners', 'name', 'text', 'L1', 'ext_jsonb', null, true, '{"required":true}'::jsonb, '{"label":"Name","editable_by":["admin"]}'::jsonb),
      (null, 'reference.partners', 'partner_type', 'enum', 'L1', 'ext_jsonb', null, true, '{"required":true,"enum_values":["supplier","customer","both"]}'::jsonb, '{"label":"Type","editable_by":["admin"]}'::jsonb),
      (null, 'reference.partners', 'status', 'enum', 'L1', 'ext_jsonb', null, true, '{"required":true,"enum_values":["active","inactive"]}'::jsonb, '{"label":"Status","editable_by":["admin"]}'::jsonb),
      (null, 'reference.close_confirm', 'confirmation_code', 'text', 'L1', 'ext_jsonb', null, true, '{"required":true,"unique":true}'::jsonb, '{"label":"Confirmation code","editable_by":["admin"]}'::jsonb),
      (null, 'reference.alert_thresholds', 'threshold_code', 'text', 'L1', 'ext_jsonb', null, true, '{"required":true,"unique":true}'::jsonb, '{"label":"Threshold code","editable_by":["admin"]}'::jsonb),
      (null, 'reference.allergens_reference', 'allergen_code', 'text', 'L1', 'ext_jsonb', null, true, '{"required":true,"unique":true}'::jsonb, '{"label":"Allergen code","editable_by":["admin"]}'::jsonb),
      (null, 'reference.d365_constants', 'constant_key', 'text', 'L1', 'ext_jsonb', null, true, '{"required":true,"unique":true}'::jsonb, '{"label":"D365 constant key","editable_by":["admin"]}'::jsonb),
      (null, 'reference.quality_hold_reasons', 'reason_code', 'text', 'L1', 'ext_jsonb', null, true, '{"required":true,"unique":true}'::jsonb, '{"label":"Quality hold reason","editable_by":["admin","quality_manager"]}'::jsonb),
      (null, 'reference.qa_failure_reasons', 'reason_code', 'text', 'L1', 'ext_jsonb', null, true, '{"required":true,"unique":true}'::jsonb, '{"label":"QA failure reason","editable_by":["admin","quality_manager"]}'::jsonb),
      (null, 'reference.waste_categories', 'category_code', 'text', 'L1', 'ext_jsonb', null, true, '{"required":true,"unique":true}'::jsonb, '{"label":"Waste category","editable_by":["admin","production_manager"]}'::jsonb),
      (null, 'reference.allergen_hold_reasons', 'reason_code', 'text', 'L1', 'ext_jsonb', null, true, '{"required":true,"unique":true}'::jsonb, '{"label":"Allergen hold reason","editable_by":["admin","quality_manager"]}'::jsonb),
      (null, 'reference.shipping_override_reasons', 'reason_code', 'text', 'L1', 'ext_jsonb', null, true, '{"required":true,"unique":true}'::jsonb, '{"label":"Shipping override reason","editable_by":["admin","shipping_manager"]}'::jsonb),
      (null, 'reference.rma_reason_codes', 'reason_code', 'text', 'L1', 'ext_jsonb', null, true, '{"required":true,"unique":true}'::jsonb, '{"label":"RMA reason code","editable_by":["admin","shipping_manager"]}'::jsonb),
      (null, 'reference.dashboards_catalog', 'dashboard_id', 'text', 'L1', 'ext_jsonb', null, true, '{"required":true,"unique":true}'::jsonb, '{"label":"Dashboard ID","editable_by":["admin"]}'::jsonb),
      (null, 'reference.shift_configs', 'shift_code', 'text', 'L1', 'ext_jsonb', null, true, '{"required":true,"unique":true}'::jsonb, '{"label":"Shift code","editable_by":["admin","production_manager"]}'::jsonb),
      (null, 'reference.oee_alert_thresholds', 'oee_target_pct', 'number', 'L1', 'ext_jsonb', null, true, '{"required":true,"default":70,"min":0,"max":100,"decimal_places":1}'::jsonb, '{"label":"OEE target %","editable_by":["oee_admin"]}'::jsonb),
      (null, 'reference.maintenance_alert_thresholds', 'threshold_code', 'text', 'L1', 'ext_jsonb', null, true, '{"required":true,"unique":true}'::jsonb, '{"label":"Maintenance threshold","editable_by":["admin","maintenance_manager"]}'::jsonb),
      (null, 'reference.technician_skills', 'skill_code', 'enum', 'L1', 'ext_jsonb', null, true, '{"required":true,"enum_values":["basic","advanced","specialist"]}'::jsonb, '{"label":"Technician skill","editable_by":["admin","maintenance_manager"]}'::jsonb),
      (null, 'reference.spare_parts_categories', 'category_code', 'text', 'L1', 'ext_jsonb', null, true, '{"required":true,"unique":true}'::jsonb, '{"label":"Spare part category","editable_by":["admin","maintenance_manager"]}'::jsonb),
      (null, 'reference.sites_hierarchy_config', 'depth', 'number', 'L1', 'ext_jsonb', null, true, '{"required":true,"default":3,"min":2,"max":5,"integer":true}'::jsonb, '{"label":"Hierarchy depth","editable_by":["admin"]}'::jsonb),
      (null, 'reference.changeover_target_duration_min', 'changeover_target_duration_min', 'number', 'L1', 'ext_jsonb', null, false, '{"required":false,"default":null,"min":1,"max":480,"unit":"minutes"}'::jsonb, '{"label":"Changeover target duration","editable_by":["admin","production_manager"]}'::jsonb);
  end if;
end $$;
