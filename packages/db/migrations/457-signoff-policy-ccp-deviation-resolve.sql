-- Migration 457: Seed signoff policy for CCP deviation resolve (qa.haccp.ccp.deviation).
-- Mirrors migration 419 pattern — status-quo rows (1 signature, no role restriction).
-- Skipped 454–455 (parallel track c1d + buffer).

insert into public.signoff_policies (
  org_id,
  signoff_type,
  required_signatures,
  first_signer_role_id,
  second_signer_role_id,
  allow_same_user,
  is_active
)
select o.id, 'qa.haccp.ccp.deviation', 1, null, null, true, true
  from public.organizations o
on conflict (org_id, signoff_type) do nothing;

do $$
declare
  v_count int;
begin
  select count(*)::int into v_count
    from public.signoff_policies
   where signoff_type = 'qa.haccp.ccp.deviation';
  raise notice '457: % signoff_policies row(s) for qa.haccp.ccp.deviation', v_count;
end $$;
