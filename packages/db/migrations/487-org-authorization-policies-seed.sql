-- Migration 487: backfill missing org_authorization_policies rows (B4b / S22).
-- NEXT FREE after 486. Idempotent, additive, live-safe — mirrors 063 seed values and
-- the 486 cross-join organizations pattern. Orgs that already have a policy row are
-- untouched (ON CONFLICT DO NOTHING).

insert into public.org_authorization_policies
  (org_id, policy_code, is_enabled, request_permissions, authorize_permissions,
   approver_role_codes, min_approvers, require_segregation_of_duties, requires_new_version,
   approval_gate_rule_code, settings_json, version)
select
  o.id,
  p.policy_code,
  true,
  p.request_permissions,
  p.authorize_permissions,
  p.approver_role_codes,
  1,
  true,
  p.requires_new_version,
  p.approval_gate_rule_code,
  p.settings_json,
  1
from public.organizations o
cross join (
  values
    (
      'npd_post_release_edit',
      array['npd.released_product_edit.request']::text[],
      array['npd.released_product_edit.authorize']::text[],
      array['owner']::text[],
      true,
      null::text,
      '{}'::jsonb
    ),
    (
      'technical_product_spec_approval',
      '{}'::text[],
      array['technical.product_spec.approve']::text[],
      array['quality_lead']::text[],
      true,
      'technical_product_spec_approval_gate_v1',
      jsonb_build_object('require_dual_sign_off', true)
    )
) as p(
  policy_code,
  request_permissions,
  authorize_permissions,
  approver_role_codes,
  requires_new_version,
  approval_gate_rule_code,
  settings_json
)
on conflict on constraint org_authorization_policies_org_code_unique do nothing;

-- Gate rule referenced by technical approval preflight (idempotent).
insert into public.rule_definitions
  (org_id, rule_code, rule_type, tier, definition_json, version, active_from, active_to)
select
  o.id,
  'technical_product_spec_approval_gate_v1',
  'gate',
  'L1',
  jsonb_build_object('min_approvers', 1, 'requires_new_version', true),
  1,
  pg_catalog.now(),
  null
from public.organizations o
where to_regclass('public.rule_definitions') is not null
on conflict (org_id, rule_code, version) do nothing;

do $$
declare
  v_npd int;
  v_technical int;
begin
  select count(*)::int into v_npd
    from public.org_authorization_policies
   where policy_code = 'npd_post_release_edit';
  select count(*)::int into v_technical
    from public.org_authorization_policies
   where policy_code = 'technical_product_spec_approval';
  raise notice '487: org_authorization_policies npd_post_release_edit row count = %', v_npd;
  raise notice '487: org_authorization_policies technical_product_spec_approval row count = %', v_technical;
end $$;
