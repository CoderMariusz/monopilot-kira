-- 419-signoff-policies-hold-ncr-seed.sql
-- Draft seed for H1 signoff-policy enforcement consumers.
--
-- Mirrors migration 275's one-shot org-loop seed. If org creation/onboarding
-- later grows an automatic signoff_policies seed hook, include these policy
-- types there as well for newly created orgs.
--
-- These are status-quo rows: readSignoffPolicy returns required_signatures = 1,
-- signer roles = null, allow_same_user = true. enforceSignoffPolicyForSigner
-- therefore has no second-signature or role restriction to enforce on the first
-- and only signer, preserving pre-H1 behavior while making the rows visible in
-- settings.

insert into public.signoff_policies (
  org_id,
  signoff_type,
  required_signatures,
  first_signer_role_id,
  second_signer_role_id,
  allow_same_user,
  is_active
)
select o.id, policy.signoff_type, 1, null, null, true, true
  from public.organizations o
 cross join (
   values
     ('qa.hold.release'),
     ('qa.ncr.close')
 ) as policy(signoff_type)
on conflict (org_id, signoff_type) do nothing;
