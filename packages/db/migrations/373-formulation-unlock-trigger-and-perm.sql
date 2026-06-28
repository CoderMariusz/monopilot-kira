-- Migration 373 — A6 recipe unlock: allow locked -> draft + seed npd.formulation.unlock.
-- The formulation_versions trigger forbade ANY transition out of 'locked'. A6 lets an authorized user
-- UNLOCK a locked recipe version back to 'draft' (gated by e-sign in the unlockVersion server action).
-- This relaxes the trigger to permit locked -> draft ONLY; every other exit from locked stays forbidden,
-- and submitted_for_trial -> draft stays forbidden. Also seeds the new RBAC permission
-- npd.formulation.unlock to every role that already holds npd.formulation.lock, in BOTH stores
-- (role_permissions table + roles.permissions jsonb), per the dual-store requirement. Idempotent.

create or replace function public.formulation_versions_enforce_state_transition()
returns trigger language plpgsql as $function$
begin
  if tg_op = 'UPDATE' and new.state is distinct from old.state then
    -- A6: a locked version may be unlocked back to draft; no other exit from locked is allowed.
    if old.state = 'locked' and new.state <> 'draft' then
      raise exception 'locked formulation versions can only transition to draft (unlock)';
    end if;

    if old.state = 'submitted_for_trial' and new.state = 'draft' then
      raise exception 'formulation versions cannot transition from submitted_for_trial to draft';
    end if;
  end if;

  return new;
end;
$function$;

-- seed npd.formulation.unlock wherever npd.formulation.lock is granted (role_permissions table store)
insert into public.role_permissions (role_id, permission)
select rp.role_id, 'npd.formulation.unlock'
  from public.role_permissions rp
 where rp.permission = 'npd.formulation.lock'
on conflict (role_id, permission) do nothing;

-- mirror into the roles.permissions jsonb store
update public.roles r
   set permissions = coalesce(r.permissions, '[]'::jsonb) || '["npd.formulation.unlock"]'::jsonb
 where coalesce(r.permissions, '[]'::jsonb) ? 'npd.formulation.lock'
   and not (coalesce(r.permissions, '[]'::jsonb) ? 'npd.formulation.unlock');
