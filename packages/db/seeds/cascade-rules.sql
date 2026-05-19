-- Seed: Reference.Rules — cascading rules per PRD §9.1 / ADR-029
-- T-021 — manufacturing_operation_N → intermediate_code_pN cascade.
--
-- Pre-condition: public.organizations row with external_id = 'apex' must exist.
-- Idempotent via ON CONFLICT (org_id, rule_id, version) DO NOTHING.
--
-- The handler in packages/rule-engine/src/cascade-handler.ts looks up this row
-- by (org_id, rule_id='manufacturing_operation_to_intermediate_code_cascade')
-- and skips if active_from > now() OR active_to < now() (M3 active-window guard).

do $$
declare
  v_apex_org_id uuid;
begin
  select id into v_apex_org_id
  from public.organizations
  where external_id = 'apex'
  order by created_at asc, id asc
  limit 1;

  if v_apex_org_id is null then
    raise exception
      'Apex org not found (external_id = ''apex''). Run baseline org seed first.';
  end if;

  -- Single cascade rule — fires when a manufacturing_operation_N column changes
  -- and recomputes the matching intermediate_code_pN.
  insert into "Reference"."Rules"
    (id, org_id, rule_id, rule_type, definition_json, version, active_from, active_to)
  values
    (gen_random_uuid(),
     v_apex_org_id,
     'manufacturing_operation_to_intermediate_code_cascade',
     'cascading',
     jsonb_build_object(
       'trigger',   jsonb_build_object('event', 'fg.manufacturing_operation_1.changed'),
       'target',    jsonb_build_object('table', 'public.fg', 'column', 'intermediate_code_p1'),
       'recompute', 'intermediate_code_pN(operation_seq, process_suffix)'
     ),
     1,
     now(),
     null)
  on conflict (org_id, rule_id, version) do nothing;
end $$;
