-- Migration 484 (W17 / N-42): DB-driven gate_approval project preservation on delete.
--
-- gate_approvals.project_id is SET NULL when npd_projects is deleted (mig 085).
-- Stamp project_code + project_id_snapshot from the still-existing parent row in a
-- BEFORE DELETE trigger on npd_projects so durable refs survive SET NULL. The stamp
-- runs in the delete transaction and rolls back if a later FK failure aborts delete.

drop trigger if exists gate_approvals_preserve_project_on_set_null on public.gate_approvals;
drop function if exists public.gate_approvals_preserve_project_on_set_null();

create or replace function public.npd_projects_stamp_gate_approvals_on_delete()
returns trigger
language plpgsql
as $$
begin
  update public.gate_approvals ga
     set project_code = old.code,
         project_id_snapshot = old.id
   where ga.org_id = old.org_id
     and ga.project_id = old.id
     and (
       ga.project_code is distinct from old.code
       or ga.project_id_snapshot is distinct from old.id
     );

  return old;
end;
$$;

drop trigger if exists npd_projects_stamp_gate_approvals_on_delete on public.npd_projects;
create trigger npd_projects_stamp_gate_approvals_on_delete
  before delete on public.npd_projects
  for each row
  execute function public.npd_projects_stamp_gate_approvals_on_delete();

comment on function public.npd_projects_stamp_gate_approvals_on_delete() is
  'Before npd_projects delete, stamp gate_approvals with durable project_code and project_id_snapshot so SET NULL on project_id retains audit identity.';
