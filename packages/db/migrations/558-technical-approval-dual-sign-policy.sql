-- Migration 558: make the Technical dual-sign approval policy internally consistent.
-- Historical migrations 063/487 seeded require_dual_sign_off=true with min_approvers=1.

-- Future orgs (and explicit re-initialization) receive the corrected policy.
create or replace function public.seed_authorization_policies_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.org_authorization_policies
    (org_id, policy_code, is_enabled, request_permissions, authorize_permissions,
     approver_role_codes, min_approvers, require_segregation_of_duties, requires_new_version,
     approval_gate_rule_code, settings_json, version)
  values
    (p_org_id, 'npd_post_release_edit', true,
     array['npd.released_product_edit.request']::text[],
     array['npd.released_product_edit.authorize']::text[],
     array['owner']::text[], 1, true, true,
     null, '{}'::jsonb, 1)
  on conflict (org_id, policy_code) do nothing;

  insert into public.org_authorization_policies
    (org_id, policy_code, is_enabled, request_permissions, authorize_permissions,
     approver_role_codes, min_approvers, require_segregation_of_duties, requires_new_version,
     approval_gate_rule_code, settings_json, version)
  values
    (p_org_id, 'technical_product_spec_approval', true,
     '{}'::text[],
     array['technical.product_spec.approve']::text[],
     array['quality_lead']::text[], 2, true, true,
     'technical_product_spec_approval_gate_v1',
     jsonb_build_object('require_dual_sign_off', true), 1)
  on conflict (org_id, policy_code) do nothing;

  if to_regclass('public.rule_definitions') is not null then
    insert into public.rule_definitions
      (org_id, rule_code, rule_type, tier, definition_json, version, active_from, active_to)
    values
      (p_org_id, 'technical_product_spec_approval_gate_v1', 'gate', 'L1',
       jsonb_build_object('min_approvers', 2, 'requires_new_version', true),
       1, pg_catalog.now(), null)
    on conflict (org_id, rule_code, version) do nothing;
  end if;
end;
$$;

-- Repair only rows that express the contradictory dual-sign combination.
do $$
declare
  v_repaired integer;
begin
  update public.org_authorization_policies
     set min_approvers = 2,
         version = version + 1
   where settings_json @> '{"require_dual_sign_off": true}'::jsonb
     and min_approvers < 2;

  get diagnostics v_repaired = row_count;
  raise notice '558: repaired contradictory dual-sign policies = %', v_repaired;
end
$$;

-- Add the database gate only after the contradictory historical rows are repaired.
alter table public.org_authorization_policies
  add constraint org_authorization_policies_dual_sign_min_approvers_check
  check (
    coalesce(settings_json -> 'require_dual_sign_off', 'false'::jsonb) <> 'true'::jsonb
    or min_approvers >= 2
  );

-- Executable post-check: PREPARE does not validate procedural bodies in this repo.
do $$
declare
  v_remaining integer;
begin
  select count(*)::integer
    into v_remaining
    from public.org_authorization_policies
   where settings_json @> '{"require_dual_sign_off": true}'::jsonb
     and min_approvers < 2;

  if v_remaining > 0 then
    raise exception '558: contradictory dual-sign policies remain: %', v_remaining
      using errcode = '23514';
  end if;

  raise notice '558: contradictory dual-sign policies remaining = %', v_remaining;
end
$$;
