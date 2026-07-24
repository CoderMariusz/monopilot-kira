-- Migration 516: durable NPD-project ownership for Technical sensory history.
--
-- PF-R04-10: subject_ref is intentionally polymorphic TEXT, so it cannot provide
-- referential integrity for project subjects. Keep it for display/compatibility,
-- add an explicit parent id, and void (never delete) only history that carries an
-- explicit UUID parent reference whose project is provably gone.
-- Wave0 lock: org_id remains the business scope; no tenant_id.

alter table public.technical_sensory_evaluations
  add column if not exists npd_project_id uuid,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid,
  add column if not exists void_reason text;

-- Backfill live parents by the three known legacy subject_ref conventions:
-- project UUID, project code, or a product code that identifies exactly one
-- project in the org. Unmatched non-UUID legacy formats stay live for manual
-- review; failure to recognize a legacy shape is not proof of orphaning.
do $$
declare
  v_linked_count integer := 0;
  v_voided_count integer := 0;
  v_unresolved_count integer := 0;
begin
  update public.technical_sensory_evaluations sensory
     set npd_project_id = (
           select project.id
             from public.npd_projects project
            where project.org_id = sensory.org_id
              and (
                project.id::text = sensory.subject_ref
                or project.code = sensory.subject_ref
                or (
                  project.product_code = sensory.subject_ref
                  and 1 = (
                    select count(*)
                      from public.npd_projects product_project
                     where product_project.org_id = sensory.org_id
                       and product_project.product_code = sensory.subject_ref
                  )
                )
              )
            order by (project.id::text = sensory.subject_ref) desc,
                     (project.code = sensory.subject_ref) desc,
                     project.created_at desc,
                     project.id
            limit 1
         ),
         updated_at = pg_catalog.now()
   where sensory.subject_type = 'project'
     and sensory.npd_project_id is null
     and exists (
       select 1
         from public.npd_projects project
        where project.org_id = sensory.org_id
          and (
            project.id::text = sensory.subject_ref
            or project.code = sensory.subject_ref
            or (
              project.product_code = sensory.subject_ref
              and 1 = (
                select count(*)
                  from public.npd_projects product_project
                 where product_project.org_id = sensory.org_id
                   and product_project.product_code = sensory.subject_ref
              )
            )
          )
     );
  get diagnostics v_linked_count = row_count;

  -- A UUID-shaped subject_ref was an explicit legacy project-id reference. It is
  -- safe to void only when that exact same-org project id no longer exists.
  -- Codes, product codes with multiple candidates, names, and other old formats
  -- are deliberately left untouched when they cannot be resolved.
  with orphaned as (
    update public.technical_sensory_evaluations sensory
       set voided_at = pg_catalog.now(),
           void_reason = coalesce(
             sensory.void_reason,
             'Parent NPD project was not present during migration 516'
           ),
           updated_at = pg_catalog.now()
     where sensory.subject_type = 'project'
       and sensory.npd_project_id is null
       and sensory.voided_at is null
       and sensory.subject_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       and not exists (
         select 1
           from public.npd_projects project
          where project.org_id = sensory.org_id
            and project.id::text = sensory.subject_ref
       )
    returning sensory.org_id,
              sensory.id::text as resource_id,
              sensory.subject_ref,
              sensory.status,
              sensory.status_reason,
              sensory.void_reason
  )
  insert into public.audit_events
    (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
     before_state, after_state, request_id, retention_class)
  select orphaned.org_id,
         null,
         'system',
         'technical.sensory.voided',
         'technical_sensory_evaluation',
         orphaned.resource_id,
         pg_catalog.jsonb_build_object(
           'subject_ref', orphaned.subject_ref,
           'status', orphaned.status,
           'status_reason', orphaned.status_reason
         ),
         pg_catalog.jsonb_build_object(
           'voided', true,
           'void_reason', orphaned.void_reason
         ),
         gen_random_uuid(),
         'operational'
    from orphaned;
  get diagnostics v_voided_count = row_count;

  select count(*)
    into v_unresolved_count
    from public.technical_sensory_evaluations sensory
   where sensory.subject_type = 'project'
     and sensory.npd_project_id is null
     and sensory.voided_at is null;

  raise notice
    'migration 516: linked % project sensory rows; voided % proven UUID orphans; left % unresolved legacy rows live',
    v_linked_count,
    v_voided_count,
    v_unresolved_count;
end;
$$;

do $$
begin
  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = 'public.technical_sensory_evaluations'::regclass
       and conname = 'technical_sensory_evaluations_npd_project_fkey'
  ) then
    alter table public.technical_sensory_evaluations
      add constraint technical_sensory_evaluations_npd_project_fkey
      foreign key (npd_project_id)
      references public.npd_projects(id)
      on delete set null
      not valid;
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = 'public.technical_sensory_evaluations'::regclass
       and conname = 'technical_sensory_evaluations_voided_by_fkey'
  ) then
    alter table public.technical_sensory_evaluations
      add constraint technical_sensory_evaluations_voided_by_fkey
      foreign key (voided_by)
      references public.users(id)
      on delete set null
      not valid;
  end if;

end;
$$;

alter table public.technical_sensory_evaluations
  validate constraint technical_sensory_evaluations_npd_project_fkey;
alter table public.technical_sensory_evaluations
  validate constraint technical_sensory_evaluations_voided_by_fkey;

create index if not exists idx_technical_sensory_evaluations_org_npd_project
  on public.technical_sensory_evaluations (org_id, npd_project_id)
  where npd_project_id is not null;

create or replace function public.technical_sensory_resolve_npd_project()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_project_id uuid;
begin
  if new.subject_type <> 'project' then
    new.npd_project_id := null;
    return new;
  end if;

  if new.npd_project_id is not null then
    select project.id
      into v_project_id
      from public.npd_projects project
     where project.org_id = new.org_id
       and project.id = new.npd_project_id;

    if v_project_id is not null then
      return new;
    end if;

    if new.voided_at is not null then
      new.npd_project_id := null;
      return new;
    end if;
  elsif new.voided_at is not null then
    return new;
  end if;

  select project.id
    into v_project_id
    from public.npd_projects project
   where project.org_id = new.org_id
     and (
       project.id::text = new.subject_ref
       or project.code = new.subject_ref
       or (
         project.product_code = new.subject_ref
         and 1 = (
           select count(*)
             from public.npd_projects product_project
            where product_project.org_id = new.org_id
              and product_project.product_code = new.subject_ref
         )
       )
     )
   order by (project.id::text = new.subject_ref) desc,
            (project.code = new.subject_ref) desc,
            project.created_at desc,
            project.id
   limit 1;

  if v_project_id is null then
    raise foreign_key_violation
      using message = 'Project sensory evaluation requires an existing same-org NPD project',
            detail = pg_catalog.format(
              'org_id=%s subject_ref=%s',
              new.org_id,
              new.subject_ref
            ),
            constraint = 'technical_sensory_evaluations_npd_project_fkey';
  end if;

  new.npd_project_id := v_project_id;
  return new;
end;
$$;

drop trigger if exists technical_sensory_resolve_npd_project_trg
  on public.technical_sensory_evaluations;
create trigger technical_sensory_resolve_npd_project_trg
  before insert or update of org_id, subject_type, subject_ref, npd_project_id, voided_at
  on public.technical_sensory_evaluations
  for each row
  execute function public.technical_sensory_resolve_npd_project();

comment on column public.technical_sensory_evaluations.npd_project_id
  is 'Migration 516: durable same-org NPD parent for subject_type=project; subject_ref remains the legacy display identifier.';
comment on column public.technical_sensory_evaluations.voided_at
  is 'Migration 516: audit-preserving retirement timestamp; voided rows are excluded from operational/edit surfaces.';
comment on column public.technical_sensory_evaluations.void_reason
  is 'Migration 516: why this sensory history was retired instead of deleted.';
