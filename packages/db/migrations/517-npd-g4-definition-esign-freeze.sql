-- Migration 517 — NPD G4 definition freeze + gate_approval e-sign receipt FK.
--
-- 1. Bind gate_approvals to immutable e_sign_log receipts (signature_id FK).
-- 2. Supersede trail for revert-npd-gate (legal unfreeze path).
-- 3. Backfill signature_id only for unambiguous historical subject_hash matches.
-- 4. BEFORE UPDATE trigger on npd_projects blocking protected column changes.

-- ---------------------------------------------------------------------------
-- A) gate_approvals receipt FK + supersede audit columns
-- ---------------------------------------------------------------------------

alter table public.gate_approvals
  add column if not exists signature_id uuid,
  add column if not exists superseded_at timestamptz,
  add column if not exists superseded_by_user_id uuid references public.users(id) on delete restrict,
  add column if not exists superseded_reason text,
  add column if not exists superseded_signature_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'gate_approvals_signature_id_fkey'
  ) then
    alter table public.gate_approvals
      add constraint gate_approvals_signature_id_fkey
      foreign key (signature_id)
      references public.e_sign_log (signature_id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'gate_approvals_superseded_signature_id_fkey'
  ) then
    alter table public.gate_approvals
      add constraint gate_approvals_superseded_signature_id_fkey
      foreign key (superseded_signature_id)
      references public.e_sign_log (signature_id) on delete restrict;
  end if;
end $$;

create index if not exists gate_approvals_active_g4_lookup_idx
  on public.gate_approvals (org_id, project_id, gate_code)
  where gate_code = 'G4'
    and decision = 'approved'
    and superseded_at is null
    and esigned_at is not null;

comment on column public.gate_approvals.signature_id is
  'Immutable e_sign_log receipt for this gate approval (npd.gate.approved intent).';
comment on column public.gate_approvals.superseded_at is
  'When set, this approval no longer freezes the project definition (revert-npd-gate path).';

-- ---------------------------------------------------------------------------
-- B) Subject-hash helper (mirrors @monopilot/e-sign canonicalJson + sha256)
-- ---------------------------------------------------------------------------

create or replace function public.npd_gate_approval_subject_hash(
  p_project_id uuid,
  p_project_code text,
  p_gate_code text,
  p_decision text
)
returns text
language sql
immutable
parallel safe
as $$
  select encode(
    digest(
      format(
        '{"decision":%s,"gateCode":%s,"projectCode":%s,"projectId":%s}',
        to_json(p_decision),
        to_json(p_gate_code),
        to_json(p_project_code),
        to_json(p_project_id::text)
      ),
      'sha256'
    ),
    'hex'
  );
$$;

revoke all on function public.npd_gate_approval_subject_hash(uuid, text, text, text) from public;
grant execute on function public.npd_gate_approval_subject_hash(uuid, text, text, text) to app_user;

-- ---------------------------------------------------------------------------
-- C) Backfill signature_id — ONLY unambiguous subject_hash matches (no time window)
-- ---------------------------------------------------------------------------

update public.gate_approvals ga
   set signature_id = match.signature_id
  from (
    select ga_inner.id as approval_id,
           esl.signature_id
      from public.gate_approvals ga_inner
      left join public.npd_projects p
        on p.id = ga_inner.project_id
       and p.org_id = ga_inner.org_id
      join public.e_sign_log esl
        on esl.org_id = ga_inner.org_id
       and esl.signer_user_id = ga_inner.approver_user_id
       and esl.intent = 'npd.gate.approved'
       and esl.subject_hash = public.npd_gate_approval_subject_hash(
         ga_inner.project_id,
         coalesce(p.code, ga_inner.project_code),
         ga_inner.gate_code,
         ga_inner.decision
       )
     where ga_inner.signature_id is null
       and ga_inner.esigned_at is not null
       and ga_inner.decision = 'approved'
       and ga_inner.project_id is not null
       and coalesce(p.code, ga_inner.project_code) is not null
     group by ga_inner.id, esl.signature_id, esl.org_id, esl.signer_user_id, esl.intent, esl.subject_hash
    having count(*) = 1
  ) match
 where ga.id = match.approval_id
   and ga.signature_id is null;

-- ---------------------------------------------------------------------------
-- D) Active verified G4 predicate + npd_projects freeze trigger
-- ---------------------------------------------------------------------------

create or replace function public.npd_project_has_active_verified_g4_approval(
  p_org_id uuid,
  p_project_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select exists (
    select 1
      from public.gate_approvals ga
      left join public.npd_projects p
        on p.id = ga.project_id
       and p.org_id = ga.org_id
     where ga.org_id = p_org_id
       and ga.project_id = p_project_id
       and ga.gate_code = 'G4'
       and ga.decision = 'approved'
       and ga.superseded_at is null
       and ga.esigned_at is not null
       and (
         ga.signature_id is not null
         or (
           ga.signature_id is null
           and exists (
             select 1
               from public.e_sign_log esl
              where esl.org_id = ga.org_id
                and esl.signer_user_id = ga.approver_user_id
                and esl.intent = 'npd.gate.approved'
                and esl.subject_hash = public.npd_gate_approval_subject_hash(
                  ga.project_id,
                  coalesce(p.code, ga.project_code),
                  ga.gate_code,
                  ga.decision
                )
              group by esl.org_id, esl.signer_user_id, esl.intent, esl.subject_hash
             having count(*) = 1
           )
         )
       )
  );
$$;

revoke all on function public.npd_project_has_active_verified_g4_approval(uuid, uuid) from public;
grant execute on function public.npd_project_has_active_verified_g4_approval(uuid, uuid) to app_user;

create or replace function public.npd_projects_enforce_g4_definition_freeze()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not public.npd_project_has_active_verified_g4_approval(OLD.org_id, OLD.id) then
    return NEW;
  end if;

  if (
    NEW.name is distinct from OLD.name
    or NEW.type is distinct from OLD.type
    or NEW.target_launch is distinct from OLD.target_launch
    or NEW.pack_format is distinct from OLD.pack_format
    or NEW.pack_weight_g is distinct from OLD.pack_weight_g
    or NEW.packs_per_case is distinct from OLD.packs_per_case
    or NEW.output_unit is distinct from OLD.output_unit
    or NEW.weekly_volume_packs is distinct from OLD.weekly_volume_packs
    or NEW.runs_per_week is distinct from OLD.runs_per_week
    or NEW.marketing_claims is distinct from OLD.marketing_claims
    or NEW.target_retail_price_eur is distinct from OLD.target_retail_price_eur
    or NEW.sales_channel is distinct from OLD.sales_channel
    or NEW.target_audience is distinct from OLD.target_audience
    or NEW.constraints is distinct from OLD.constraints
  ) then
    raise exception 'npd_project_definition_frozen (PF-R04-02): signed G4 gate approval locks product definition fields'
      using errcode = 'P0001';
  end if;

  return NEW;
end;
$$;

drop trigger if exists npd_projects_enforce_g4_definition_freeze on public.npd_projects;
create trigger npd_projects_enforce_g4_definition_freeze
  before update on public.npd_projects
  for each row
  execute function public.npd_projects_enforce_g4_definition_freeze();

revoke all on function public.npd_projects_enforce_g4_definition_freeze() from public;
grant execute on function public.npd_projects_enforce_g4_definition_freeze() to app_user;
