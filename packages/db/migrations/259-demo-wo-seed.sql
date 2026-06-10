-- Migration 259: demo WO seed for planning + production dashboard smoke data.
-- Wave0 lock: org_id business scope (NOT tenant_id). Idempotent deterministic seed.

do $$
declare
  v_org_id constant uuid := '00000000-0000-0000-0000-000000000002';
  v_line_1 constant uuid := '25900000-0000-4000-8000-000000000101';
  v_line_2 constant uuid := '25900000-0000-4000-8000-000000000102';
  v_machine_1 constant uuid := '25900000-0000-4000-8000-000000000201';
  v_machine_2 constant uuid := '25900000-0000-4000-8000-000000000202';
  v_waste_category constant uuid := '25900000-0000-4000-8000-000000000301';
  v_downtime_category constant uuid := '25900000-0000-4000-8000-000000000302';
  v_fg_npd constant uuid := '25900000-0000-4000-8000-000000000401';
  v_fg_e2e constant uuid := '25900000-0000-4000-8000-000000000402';
  v_rm_flour constant uuid := '25900000-0000-4000-8000-000000000501';
  v_rm_spice constant uuid := '25900000-0000-4000-8000-000000000502';
begin
  if not exists (select 1 from public.organizations where id = v_org_id) then
    return;
  end if;

  if to_regclass('public.production_lines') is not null then
    insert into public.production_lines (id, org_id, code, name, status)
    values
      (v_line_1, v_org_id, 'DEMO-LINE-1', 'Demo Line 1', 'active'),
      (v_line_2, v_org_id, 'DEMO-LINE-2', 'Demo Line 2', 'active')
    on conflict (org_id, code) do nothing;
  end if;

  if to_regclass('public.machines') is not null then
    insert into public.machines (id, org_id, code, name, machine_type, status, capacity_per_hour)
    values
      (v_machine_1, v_org_id, 'DEMO-MIX-1', 'Demo Mixer 1', 'mixer', 'active', 1200.000000),
      (v_machine_2, v_org_id, 'DEMO-PACK-1', 'Demo Packer 1', 'packer', 'active', 900.000000)
    on conflict (org_id, code) do nothing;
  end if;

  insert into public.items (id, org_id, item_code, item_type, name, status, uom_base)
  values
    (v_fg_npd, v_org_id, 'FG-NPD-004', 'fg', 'Demo FG NPD 004', 'active', 'kg'),
    (v_fg_e2e, v_org_id, 'E2E-FG-0609', 'fg', 'Demo E2E FG 0609', 'active', 'kg'),
    (v_rm_flour, v_org_id, 'DEMO-RM-FLOUR', 'rm', 'Demo Flour', 'active', 'kg'),
    (v_rm_spice, v_org_id, 'DEMO-RM-SPICE', 'rm', 'Demo Spice Blend', 'active', 'kg')
  on conflict (org_id, item_code) do nothing;

  insert into public.waste_categories (id, org_id, code, name, is_active)
  values (v_waste_category, v_org_id, 'DEMO-SCRAP', 'Demo Scrap', true)
  on conflict (org_id, code) do nothing;

  insert into public.downtime_categories (id, org_id, code, name, kind, is_active)
  values (v_downtime_category, v_org_id, 'DEMO-UNPLANNED', 'Demo Unplanned Stop', 'unplanned', true)
  on conflict (org_id, code) do nothing;

  insert into public.work_orders (
    id, org_id, wo_number, product_id, item_type_at_creation, planned_quantity, produced_quantity,
    uom, status, scheduled_start_time, scheduled_end_time, production_line_id, machine_id,
    priority, source_of_demand, source_reference, actual_qty, started_at, completed_at, ext_jsonb
  )
  values
    ('25900000-0000-4000-8000-000000001001', v_org_id, 'DEMO-WO-259-001', v_fg_npd, 'fg', 1000.000, null,
     'kg', 'DRAFT', '2026-06-09 06:00:00+00', '2026-06-09 14:00:00+00', v_line_1, v_machine_1,
     'normal', 'manual', 'FG-NPD-004', null, null, null, '{"demo_seed":"259"}'::jsonb),
    ('25900000-0000-4000-8000-000000001002', v_org_id, 'DEMO-WO-259-002', v_fg_e2e, 'fg', 1200.000, null,
     'kg', 'RELEASED', '2026-06-09 07:00:00+00', '2026-06-09 15:00:00+00', v_line_1, v_machine_1,
     'high', 'manual', 'E2E-FG-0609', null, null, null, '{"demo_seed":"259"}'::jsonb),
    ('25900000-0000-4000-8000-000000001003', v_org_id, 'DEMO-WO-259-003', v_fg_npd, 'fg', 900.000, 240.000,
     'kg', 'IN_PROGRESS', '2026-06-09 08:00:00+00', '2026-06-09 16:00:00+00', v_line_1, v_machine_1,
     'normal', 'manual', 'FG-NPD-004', 240.000, '2026-06-09 08:05:00+00', null, '{"demo_seed":"259"}'::jsonb),
    ('25900000-0000-4000-8000-000000001004', v_org_id, 'DEMO-WO-259-004', v_fg_e2e, 'fg', 1500.000, 520.000,
     'kg', 'IN_PROGRESS', '2026-06-09 09:00:00+00', '2026-06-09 17:00:00+00', v_line_2, v_machine_2,
     'critical', 'manual', 'E2E-FG-0609', 520.000, '2026-06-09 09:10:00+00', null, '{"demo_seed":"259"}'::jsonb),
    ('25900000-0000-4000-8000-000000001005', v_org_id, 'DEMO-WO-259-005', v_fg_npd, 'fg', 800.000, 798.000,
     'kg', 'COMPLETED', '2026-06-09 05:00:00+00', '2026-06-09 13:00:00+00', v_line_2, v_machine_2,
     'normal', 'manual', 'FG-NPD-004', 798.000, '2026-06-09 05:05:00+00', '2026-06-09 12:45:00+00', '{"demo_seed":"259"}'::jsonb)
  on conflict (org_id, wo_number) do nothing;

  insert into public.wo_materials (id, org_id, wo_id, product_id, material_name, required_qty, uom, sequence, material_source)
  values
    ('25900000-0000-4000-8000-000000002001', v_org_id, '25900000-0000-4000-8000-000000001001', v_rm_flour, 'Demo Flour', 700.000, 'kg', 1, 'stock'),
    ('25900000-0000-4000-8000-000000002002', v_org_id, '25900000-0000-4000-8000-000000001001', v_rm_spice, 'Demo Spice Blend', 20.000, 'kg', 2, 'stock'),
    ('25900000-0000-4000-8000-000000002003', v_org_id, '25900000-0000-4000-8000-000000001002', v_rm_flour, 'Demo Flour', 840.000, 'kg', 1, 'stock'),
    ('25900000-0000-4000-8000-000000002004', v_org_id, '25900000-0000-4000-8000-000000001002', v_rm_spice, 'Demo Spice Blend', 24.000, 'kg', 2, 'stock'),
    ('25900000-0000-4000-8000-000000002005', v_org_id, '25900000-0000-4000-8000-000000001003', v_rm_flour, 'Demo Flour', 630.000, 'kg', 1, 'stock'),
    ('25900000-0000-4000-8000-000000002006', v_org_id, '25900000-0000-4000-8000-000000001003', v_rm_spice, 'Demo Spice Blend', 18.000, 'kg', 2, 'stock'),
    ('25900000-0000-4000-8000-000000002007', v_org_id, '25900000-0000-4000-8000-000000001004', v_rm_flour, 'Demo Flour', 1050.000, 'kg', 1, 'stock'),
    ('25900000-0000-4000-8000-000000002008', v_org_id, '25900000-0000-4000-8000-000000001004', v_rm_spice, 'Demo Spice Blend', 30.000, 'kg', 2, 'stock'),
    ('25900000-0000-4000-8000-000000002009', v_org_id, '25900000-0000-4000-8000-000000001005', v_rm_flour, 'Demo Flour', 560.000, 'kg', 1, 'stock'),
    ('25900000-0000-4000-8000-000000002010', v_org_id, '25900000-0000-4000-8000-000000001005', v_rm_spice, 'Demo Spice Blend', 16.000, 'kg', 2, 'stock')
  on conflict (id) do nothing;

  insert into public.wo_operations (id, org_id, wo_id, sequence, operation_name, machine_id, line_id, expected_duration_minutes, expected_yield_percent, status)
  values
    ('25900000-0000-4000-8000-000000003001', v_org_id, '25900000-0000-4000-8000-000000001001', 1, 'Mix', v_machine_1, v_line_1, 90, 98.5000, 'pending'),
    ('25900000-0000-4000-8000-000000003002', v_org_id, '25900000-0000-4000-8000-000000001001', 2, 'Pack', v_machine_2, v_line_1, 120, 99.0000, 'pending'),
    ('25900000-0000-4000-8000-000000003003', v_org_id, '25900000-0000-4000-8000-000000001002', 1, 'Mix', v_machine_1, v_line_1, 90, 98.5000, 'pending'),
    ('25900000-0000-4000-8000-000000003004', v_org_id, '25900000-0000-4000-8000-000000001002', 2, 'Pack', v_machine_2, v_line_1, 120, 99.0000, 'pending'),
    ('25900000-0000-4000-8000-000000003005', v_org_id, '25900000-0000-4000-8000-000000001003', 1, 'Mix', v_machine_1, v_line_1, 90, 98.5000, 'completed'),
    ('25900000-0000-4000-8000-000000003006', v_org_id, '25900000-0000-4000-8000-000000001003', 2, 'Pack', v_machine_2, v_line_1, 120, 99.0000, 'in_progress'),
    ('25900000-0000-4000-8000-000000003007', v_org_id, '25900000-0000-4000-8000-000000001004', 1, 'Mix', v_machine_1, v_line_2, 90, 98.5000, 'completed'),
    ('25900000-0000-4000-8000-000000003008', v_org_id, '25900000-0000-4000-8000-000000001004', 2, 'Pack', v_machine_2, v_line_2, 120, 99.0000, 'in_progress'),
    ('25900000-0000-4000-8000-000000003009', v_org_id, '25900000-0000-4000-8000-000000001005', 1, 'Mix', v_machine_1, v_line_2, 90, 98.5000, 'completed'),
    ('25900000-0000-4000-8000-000000003010', v_org_id, '25900000-0000-4000-8000-000000001005', 2, 'Pack', v_machine_2, v_line_2, 120, 99.0000, 'completed')
  on conflict (wo_id, sequence) do nothing;

  insert into public.wo_executions (id, org_id, wo_id, status, version, started_at, completed_at, ext_jsonb)
  values
    ('25900000-0000-4000-8000-000000004003', v_org_id, '25900000-0000-4000-8000-000000001003', 'in_progress', 1, '2026-06-09 08:05:00+00', null, '{"demo_seed":"259"}'::jsonb),
    ('25900000-0000-4000-8000-000000004004', v_org_id, '25900000-0000-4000-8000-000000001004', 'in_progress', 1, '2026-06-09 09:10:00+00', null, '{"demo_seed":"259"}'::jsonb)
  on conflict (org_id, wo_id) do nothing;

  insert into public.wo_outputs (id, org_id, transaction_id, wo_id, output_type, product_id, batch_number, qty_kg, uom, qa_status, registered_at, ext_jsonb)
  values
    ('25900000-0000-4000-8000-000000005003', v_org_id, '25900000-0000-4000-8000-000000006003', '25900000-0000-4000-8000-000000001003', 'primary', v_fg_npd, 'DEMO-259-003', 240.000, 'kg', 'PENDING', '2026-06-09 10:00:00+00', '{"demo_seed":"259"}'::jsonb),
    ('25900000-0000-4000-8000-000000005004', v_org_id, '25900000-0000-4000-8000-000000006004', '25900000-0000-4000-8000-000000001004', 'primary', v_fg_e2e, 'DEMO-259-004', 520.000, 'kg', 'PENDING', '2026-06-09 11:00:00+00', '{"demo_seed":"259"}'::jsonb)
  on conflict (transaction_id) do nothing;

  insert into public.wo_waste_log (id, transaction_id, org_id, wo_id, category_id, qty_kg, reason_code, reason_notes, shift_id, recorded_at)
  values
    ('25900000-0000-4000-8000-000000007003', '25900000-0000-4000-8000-000000008003', v_org_id, '25900000-0000-4000-8000-000000001003', v_waste_category, 4.500, 'DEMO_STARTUP', 'Demo startup trim', 'SHIFT-A', '2026-06-09 10:15:00+00'),
    ('25900000-0000-4000-8000-000000007004', '25900000-0000-4000-8000-000000008004', v_org_id, '25900000-0000-4000-8000-000000001004', v_waste_category, 6.750, 'DEMO_STARTUP', 'Demo startup trim', 'SHIFT-A', '2026-06-09 11:15:00+00')
  on conflict (transaction_id) do nothing;

  insert into public.downtime_events (id, org_id, line_id, wo_id, category_id, source, started_at, ended_at, shift_id, reason_notes)
  values
    ('25900000-0000-4000-8000-000000009003', v_org_id, v_line_1::text, '25900000-0000-4000-8000-000000001003', v_downtime_category, 'manual', '2026-06-09 10:30:00+00', null, 'SHIFT-A', 'Demo open stop'),
    ('25900000-0000-4000-8000-000000009004', v_org_id, v_line_2::text, '25900000-0000-4000-8000-000000001004', v_downtime_category, 'manual', '2026-06-09 11:30:00+00', null, 'SHIFT-A', 'Demo open stop')
  on conflict (id) do nothing;
end
$$;
