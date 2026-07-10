-- Migration 484 (W17 / N-42): DB-driven gate_approval project preservation on delete.
--
-- gate_approvals.project_id is SET NULL when npd_projects is deleted (mig 085).
-- Stamp project_code + project_id_snapshot in that SET NULL path so the app does
-- not need a pre-delete UPDATE (which soft-failed under withOrgContext).

create or replace function public.gate_approvals_preserve_project_on_set_null()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and old.project_id is not null
     and new.project_id is null then
    select p.code, p.id
      into new.project_code, new.project_id_snapshot
      from public.npd_projects p
     where p.id = old.project_id
       and p.org_id = old.org_id;

    if new.project_code is null then
      new.project_code := coalesce(
        new.project_code,
        (select p.code from public.npd_projects p where p.id = old.project_id)
      );
    end if;
    if new.project_id_snapshot is null then
      new.project_id_snapshot := coalesce(new.project_id_snapshot, old.project_id);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists gate_approvals_preserve_project_on_set_null on public.gate_approvals;
create trigger gate_approvals_preserve_project_on_set_null
  before update of project_id on public.gate_approvals
  for each row
  execute function public.gate_approvals_preserve_project_on_set_null();

comment on function public.gate_approvals_preserve_project_on_set_null() is
  'When gate_approvals.project_id is SET NULL on npd_projects delete, retain durable project_code and project_id_snapshot for audit.';
