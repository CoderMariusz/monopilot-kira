-- Migration 162: 03-Technical — lab_results (Quality-OWNED read model) + supplier_specs (Phase 1).
-- PRD: docs/prd/03-TECHNICAL-PRD.md §5.5, §10.6 ; task _meta/atomic-tasks/03-technical/tasks/T-005.json
-- Wave0 lock: org_id is the business scope (the org, not a license/billing tier);
--             RLS via app.current_org_id().
--
-- CANONICAL-OWNER NOTE (do NOT cross): lab_results is QUALITY-OWNED. Technical READS it
-- READ-ONLY — there is no Technical write/approve path. app_user keeps SELECT + INSERT here
-- only so the Quality-side service/bridge can author rows; UPDATE/DELETE are revoked from
-- app_user (Quality canonical writes/lifecycle live in 09-QUALITY, not Technical). The schema
-- lives in this Technical migration per T-005 scope, but ownership stays with Quality.
--
-- site_id day-1: nullable uuid, NO FK / NO registry (registry is added later by 14-multi-site).
-- declared_allergens stored as TEXT[]; supplier-declared codes are resolved against the
-- allergens reference at the API layer (not an FK here).
-- ATP swab threshold default 10 RLU is captured as a column default; the V-TEC-44 auto-fail
-- trigger is OUT OF SCOPE here (it lives in T-026).
-- d365 is never the system of record; no D365 hard FK is introduced.

-- ============================================================================
-- 1. lab_results — Quality-owned read model (Technical reads only)
-- ============================================================================
create table if not exists public.lab_results (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid,                                          -- day-1 nullable, no FK / no registry
  item_id uuid references public.items(id) on delete restrict,
  work_order_id uuid,                                    -- soft uuid; FK lives in 08-PRODUCTION
  quality_result_id uuid,                                -- soft pointer to Quality canonical row/event
  test_type text not null,                              -- 'atp_swab'|'allergen_elisa'|'micro_apc'|'nutrition'|'sensory'
  test_code text,
  result_value numeric(14, 4),
  result_unit text,
  result_status text not null,                          -- 'pass'|'fail'|'inconclusive'|'pending'|'hold'
  threshold_rlu numeric(10, 2) default 10.00,           -- ATP default 10 RLU; auto-fail trigger is T-026
  tested_at timestamptz,
  lab_provider text,
  notes text,
  created_by uuid references public.users(id) on delete restrict, -- Quality-side / bridge actor
  created_at timestamptz not null default pg_catalog.now(),

  constraint lab_results_test_type_check check (
    test_type in ('atp_swab', 'allergen_elisa', 'micro_apc', 'nutrition', 'sensory')
  ),
  constraint lab_results_result_status_check check (
    result_status in ('pass', 'fail', 'inconclusive', 'pending', 'hold')
  ),
  constraint lab_results_threshold_rlu_nonnegative_check check (
    threshold_rlu is null or threshold_rlu >= 0
  )
);

-- FK / lookup indexes (org_id first; FK columns get their own composite indexes)
create index if not exists idx_lab_results_org_item
  on public.lab_results (org_id, item_id);
create index if not exists idx_lab_results_org_test_type
  on public.lab_results (org_id, test_type, result_status);
create index if not exists idx_lab_results_org_work_order
  on public.lab_results (org_id, work_order_id)
  where work_order_id is not null;
create index if not exists idx_lab_results_org_site
  on public.lab_results (org_id, site_id);

alter table public.lab_results enable row level security;
alter table public.lab_results force row level security;

drop policy if exists lab_results_org_context_select on public.lab_results;
create policy lab_results_org_context_select
  on public.lab_results
  for select
  to app_user
  using (org_id = app.current_org_id());

-- INSERT is permitted (Quality-side bridge authors rows); Technical does not UPDATE/DELETE here.
drop policy if exists lab_results_org_context_insert on public.lab_results;
create policy lab_results_org_context_insert
  on public.lab_results
  for insert
  to app_user
  with check (org_id = app.current_org_id());

-- Grants: Quality-owned read model — app_user gets SELECT + INSERT only.
revoke all on public.lab_results from public;
revoke all on public.lab_results from app_user;
grant select, insert on public.lab_results to app_user;
revoke update, delete on public.lab_results from app_user;

-- ============================================================================
-- 2. supplier_specs — Technical-owned supplier spec Phase 1 governance
-- ============================================================================
create table if not exists public.supplier_specs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid,                                          -- day-1 nullable, no FK / no registry
  item_id uuid not null references public.items(id) on delete restrict,
  supplier_code text not null,
  supplier_status text not null default 'pending',      -- 'pending'|'approved'|'blocked'
  spec_document_url text,                                -- S3 / Blob storage link
  document_sha256 text,
  document_mime_type text,
  spec_version text not null,
  issued_date date,
  effective_from date not null default current_date,
  expiry_date date,
  lifecycle_status text not null default 'draft',        -- 'draft'|'active'|'expired'|'superseded'|'blocked'
  review_status text not null default 'pending',         -- 'pending'|'approved'|'rejected'|'blocked'
  review_notes text,
  cost_review_blocked boolean not null default false,
  spec_review_blocked boolean not null default false,
  approved_by uuid references public.users(id) on delete restrict,
  approved_at timestamptz,
  rejected_by uuid references public.users(id) on delete restrict,
  rejected_at timestamptz,
  rejection_reason text,
  declared_allergens text[],                             -- supplier-declared allergen codes (resolved at API layer)
  declared_attrs jsonb not null default '{}'::jsonb,     -- nutrition, origin, certifications
  certificate_refs jsonb not null default '[]'::jsonb,   -- COA/BRCGS/organic/etc metadata
  uploaded_at timestamptz not null default pg_catalog.now(),
  uploaded_by uuid references public.users(id) on delete restrict,
  -- R13 audit cols (mirrors items master)
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),

  constraint supplier_specs_supplier_status_check check (
    supplier_status in ('pending', 'approved', 'blocked')
  ),
  constraint supplier_specs_lifecycle_status_check check (
    lifecycle_status in ('draft', 'active', 'expired', 'superseded', 'blocked')
  ),
  constraint supplier_specs_review_status_check check (
    review_status in ('pending', 'approved', 'rejected', 'blocked')
  ),
  constraint supplier_specs_declared_attrs_object_check check (
    jsonb_typeof(declared_attrs) = 'object'
  ),
  constraint supplier_specs_certificate_refs_array_check check (
    jsonb_typeof(certificate_refs) = 'array'
  ),
  constraint supplier_specs_expiry_after_effective_check check (
    expiry_date is null or effective_from is null or expiry_date >= effective_from
  )
);

-- FK / lookup indexes
create index if not exists idx_supplier_specs_org_item
  on public.supplier_specs (org_id, item_id);
create index if not exists idx_supplier_specs_org_supplier
  on public.supplier_specs (org_id, supplier_code, item_id);
create index if not exists idx_supplier_specs_org_site
  on public.supplier_specs (org_id, site_id);

-- At most one active+approved spec per org/item/supplier (PRD §5.5).
create unique index if not exists supplier_specs_one_active_approved
  on public.supplier_specs (org_id, item_id, supplier_code)
  where lifecycle_status = 'active' and review_status = 'approved';

alter table public.supplier_specs enable row level security;
alter table public.supplier_specs force row level security;

drop policy if exists supplier_specs_org_context_select on public.supplier_specs;
create policy supplier_specs_org_context_select
  on public.supplier_specs
  for select
  to app_user
  using (org_id = app.current_org_id());

drop policy if exists supplier_specs_org_context_insert on public.supplier_specs;
create policy supplier_specs_org_context_insert
  on public.supplier_specs
  for insert
  to app_user
  with check (org_id = app.current_org_id());

drop policy if exists supplier_specs_org_context_update on public.supplier_specs;
create policy supplier_specs_org_context_update
  on public.supplier_specs
  for update
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

drop policy if exists supplier_specs_org_context_delete on public.supplier_specs;
create policy supplier_specs_org_context_delete
  on public.supplier_specs
  for delete
  to app_user
  using (org_id = app.current_org_id());

-- Grants: Technical-owned — app_user gets full DML.
revoke all on public.supplier_specs from public;
revoke all on public.supplier_specs from app_user;
grant select, insert, update, delete on public.supplier_specs to app_user;

-- updated_at trigger (mirrors items master pattern)
create or replace function public.supplier_specs_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists supplier_specs_set_updated_at on public.supplier_specs;
create trigger supplier_specs_set_updated_at
  before update on public.supplier_specs
  for each row execute function public.supplier_specs_set_updated_at();
