-- Migration 092: T-055 Reference.GateChecklistTemplates.
-- PRD: docs/prd/01-NPD-PRD.md §17.10.
-- Wave0 lock: org_id business scope; RLS via app.current_org_id().
-- Default template seeds are owned by T-056.

create schema if not exists "Reference";

create table if not exists "Reference"."GateChecklistTemplates" (
  org_id uuid not null references public.organizations(id) on delete cascade,
  template_id text not null,
  gate_code text not null,
  category_code text not null,
  item_text text not null,
  required boolean not null,
  sequence integer not null,
  schema_version integer not null default 1,
  constraint gate_checklist_templates_gate_code_check
    check (gate_code in ('G0', 'G1', 'G2', 'G3', 'G4')),
  constraint gate_checklist_templates_category_code_check
    check (category_code in ('technical', 'business', 'compliance')),
  constraint gate_checklist_templates_sequence_positive_check
    check (sequence > 0),
  constraint gate_checklist_templates_schema_version_positive_check
    check (schema_version > 0),
  primary key (org_id, template_id, gate_code, sequence)
);

create index if not exists gate_checklist_templates_seed_idx
  on "Reference"."GateChecklistTemplates" (org_id, template_id, gate_code);

alter table "Reference"."GateChecklistTemplates" enable row level security;
alter table "Reference"."GateChecklistTemplates" force row level security;

drop policy if exists "GateChecklistTemplates_org_context" on "Reference"."GateChecklistTemplates";
create policy "GateChecklistTemplates_org_context"
  on "Reference"."GateChecklistTemplates"
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on "Reference"."GateChecklistTemplates" from public;
revoke all on "Reference"."GateChecklistTemplates" from app_user;

grant usage on schema "Reference" to app_user;
grant select, insert, update, delete on "Reference"."GateChecklistTemplates" to app_user;
