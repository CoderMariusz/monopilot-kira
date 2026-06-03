-- Migration 098: T-077 Reference.ApprovalChainTemplates.
-- PRD: docs/prd/01-NPD-PRD.md §17.11.5.
-- Wave0 lock: org_id business scope; RLS via app.current_org_id().

create schema if not exists "Reference";

create table if not exists "Reference"."ApprovalChainTemplates" (
  org_id uuid not null references public.organizations(id) on delete cascade,
  template_id text not null,
  chain_mode text not null,
  steps jsonb not null,
  created_at timestamptz not null default now(),
  constraint approval_chain_templates_chain_mode_check
    check (chain_mode in ('single', 'multi')),
  constraint approval_chain_templates_steps_array_check
    check (jsonb_typeof(steps) = 'array'),
  primary key (org_id, template_id)
);

create index if not exists approval_chain_templates_org_idx
  on "Reference"."ApprovalChainTemplates" (org_id);

alter table "Reference"."ApprovalChainTemplates" enable row level security;
alter table "Reference"."ApprovalChainTemplates" force row level security;

drop policy if exists "ApprovalChainTemplates_org_context" on "Reference"."ApprovalChainTemplates";
create policy "ApprovalChainTemplates_org_context"
  on "Reference"."ApprovalChainTemplates"
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on "Reference"."ApprovalChainTemplates" from public;
revoke all on "Reference"."ApprovalChainTemplates" from app_user;

grant usage on schema "Reference" to app_user;
grant select, insert, update, delete on "Reference"."ApprovalChainTemplates" to app_user;
