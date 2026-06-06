-- Migration 229: 03-Technical — ECO change control + revision history read model.
--
-- Backend-only foundation for EcoScreen, HistoryScreen and later traceability UI.
-- Wave0 lock: org_id is the business scope (NOT tenant_id); RLS via app.current_org_id().
-- Supabase-safe: no leakproof, no alter owner, no extensions, no generic audit trigger.

create or replace function public.technical_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- technical_change_orders — ECO header.
-- ---------------------------------------------------------------------------
create table if not exists public.technical_change_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid,

  code text not null,
  title text not null,
  description text,
  status text not null default 'draft',
  status_tone text generated always as (
    case status
      when 'draft' then 'muted'
      when 'approved' then 'success'
      when 'implementing' then 'warning'
      when 'closed' then 'info'
      else 'danger'
    end
  ) stored,
  priority text not null default 'normal',
  change_type text not null default 'engineering',

  requester_user_id uuid references public.users(id) on delete restrict,
  approver_user_id uuid references public.users(id) on delete restrict,
  target_item_id uuid references public.items(id) on delete restrict,
  target_bom_header_id uuid,
  target_factory_spec_id uuid,

  impact_summary text,
  requested_effective_at timestamptz,
  approved_at timestamptz,
  implementing_at timestamptz,
  closed_at timestamptz,
  rejection_reason text,

  ext_jsonb jsonb not null default '{}'::jsonb,
  schema_version integer not null default 1,
  created_by uuid references public.users(id) on delete restrict,
  updated_by uuid references public.users(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),

  constraint technical_change_orders_org_code_unique unique (org_id, code),
  constraint technical_change_orders_status_check check (
    status in ('draft', 'approved', 'implementing', 'closed')
  ),
  constraint technical_change_orders_status_tone_check check (
    status_tone in ('success', 'warning', 'danger', 'info', 'muted')
  ),
  constraint technical_change_orders_priority_check check (
    priority in ('low', 'normal', 'high', 'critical')
  ),
  constraint technical_change_orders_change_type_check check (
    change_type in ('engineering', 'bom', 'spec', 'item', 'process', 'packaging', 'regulatory')
  ),
  constraint technical_change_orders_target_check check (
    target_item_id is not null or target_bom_header_id is not null or target_factory_spec_id is not null
  ),
  constraint technical_change_orders_json_check check (jsonb_typeof(ext_jsonb) = 'object'),
  constraint technical_change_orders_schema_version_check check (schema_version >= 1),
  constraint technical_change_orders_approved_evidence_check check (
    status not in ('approved', 'implementing', 'closed')
    or (approver_user_id is not null and approved_at is not null)
  ),
  constraint technical_change_orders_implementing_time_check check (
    status <> 'implementing' or implementing_at is not null
  ),
  constraint technical_change_orders_closed_time_check check (
    status <> 'closed' or closed_at is not null
  )
);

create index if not exists idx_technical_change_orders_org_status
  on public.technical_change_orders (org_id, status, updated_at desc);
create index if not exists idx_technical_change_orders_target_item
  on public.technical_change_orders (org_id, target_item_id)
  where target_item_id is not null;
create index if not exists idx_technical_change_orders_target_bom
  on public.technical_change_orders (org_id, target_bom_header_id)
  where target_bom_header_id is not null;
create index if not exists idx_technical_change_orders_target_spec
  on public.technical_change_orders (org_id, target_factory_spec_id)
  where target_factory_spec_id is not null;

alter table public.technical_change_orders enable row level security;
alter table public.technical_change_orders force row level security;

drop policy if exists technical_change_orders_org_context on public.technical_change_orders;
create policy technical_change_orders_org_context
  on public.technical_change_orders
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.technical_change_orders from public;
revoke all on public.technical_change_orders from app_user;
grant select, insert, update, delete on public.technical_change_orders to app_user;

drop trigger if exists technical_change_orders_set_updated_at on public.technical_change_orders;
create trigger technical_change_orders_set_updated_at
  before update on public.technical_change_orders
  for each row execute function public.technical_set_updated_at();

-- ---------------------------------------------------------------------------
-- technical_change_order_lines — ECO line changes.
-- ---------------------------------------------------------------------------
create table if not exists public.technical_change_order_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  change_order_id uuid not null references public.technical_change_orders(id) on delete cascade,
  line_no integer not null,
  action text not null,
  target_type text not null,
  target_id uuid,
  field_name text,
  before_value jsonb,
  after_value jsonb,
  rationale text,
  created_by uuid references public.users(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),

  constraint technical_change_order_lines_order_line_unique unique (change_order_id, line_no),
  constraint technical_change_order_lines_line_no_check check (line_no > 0),
  constraint technical_change_order_lines_action_check check (
    action in ('add', 'change', 'remove', 'replace', 'deprecate')
  ),
  constraint technical_change_order_lines_target_type_check check (
    target_type in ('item', 'bom_header', 'bom_line', 'factory_spec', 'routing', 'document', 'other')
  )
);

create index if not exists idx_technical_change_order_lines_order
  on public.technical_change_order_lines (org_id, change_order_id, line_no);
create index if not exists idx_technical_change_order_lines_target
  on public.technical_change_order_lines (org_id, target_type, target_id)
  where target_id is not null;

alter table public.technical_change_order_lines enable row level security;
alter table public.technical_change_order_lines force row level security;

drop policy if exists technical_change_order_lines_org_context on public.technical_change_order_lines;
create policy technical_change_order_lines_org_context
  on public.technical_change_order_lines
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.technical_change_order_lines from public;
revoke all on public.technical_change_order_lines from app_user;
grant select, insert, update, delete on public.technical_change_order_lines to app_user;

drop trigger if exists technical_change_order_lines_set_updated_at on public.technical_change_order_lines;
create trigger technical_change_order_lines_set_updated_at
  before update on public.technical_change_order_lines
  for each row execute function public.technical_set_updated_at();

-- ---------------------------------------------------------------------------
-- technical_change_order_approvals — explicit approval/rejection/transition audit.
-- ---------------------------------------------------------------------------
create table if not exists public.technical_change_order_approvals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  change_order_id uuid not null references public.technical_change_orders(id) on delete cascade,
  action text not null,
  from_status text,
  to_status text not null,
  actor_user_id uuid references public.users(id) on delete restrict,
  comment text,
  occurred_at timestamptz not null default pg_catalog.now(),

  constraint technical_change_order_approvals_action_check check (
    action in ('approve', 'reject', 'start_implementation', 'close')
  ),
  constraint technical_change_order_approvals_from_status_check check (
    from_status is null or from_status in ('draft', 'approved', 'implementing', 'closed')
  ),
  constraint technical_change_order_approvals_to_status_check check (
    to_status in ('draft', 'approved', 'implementing', 'closed')
  )
);

create index if not exists idx_technical_change_order_approvals_order
  on public.technical_change_order_approvals (org_id, change_order_id, occurred_at desc);

alter table public.technical_change_order_approvals enable row level security;
alter table public.technical_change_order_approvals force row level security;

drop policy if exists technical_change_order_approvals_org_context on public.technical_change_order_approvals;
create policy technical_change_order_approvals_org_context
  on public.technical_change_order_approvals
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.technical_change_order_approvals from public;
revoke all on public.technical_change_order_approvals from app_user;
grant select, insert on public.technical_change_order_approvals to app_user;

-- ---------------------------------------------------------------------------
-- technical_change_order_audit — ECO-specific append-only audit feed.
-- ---------------------------------------------------------------------------
create table if not exists public.technical_change_order_audit (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  change_order_id uuid not null references public.technical_change_orders(id) on delete cascade,
  actor_user_id uuid references public.users(id) on delete set null,
  action text not null,
  from_status text,
  to_status text,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default pg_catalog.now(),

  constraint technical_change_order_audit_payload_check check (jsonb_typeof(payload) = 'object')
);

create index if not exists idx_technical_change_order_audit_order
  on public.technical_change_order_audit (org_id, change_order_id, occurred_at desc);

alter table public.technical_change_order_audit enable row level security;
alter table public.technical_change_order_audit force row level security;

drop policy if exists technical_change_order_audit_org_context on public.technical_change_order_audit;
create policy technical_change_order_audit_org_context
  on public.technical_change_order_audit
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.technical_change_order_audit from public;
revoke all on public.technical_change_order_audit from app_user;
grant select, insert on public.technical_change_order_audit to app_user;

-- Revision/version audit read model. Security-invoker view keeps underlying RLS active and
-- every branch explicitly filters org_id = app.current_org_id().
create or replace view public.v_technical_revision_history
with (security_invoker = true) as
select
  i.org_id,
  'item'::text as entity_type,
  i.id::text as entity_id,
  i.item_code as entity_code,
  i.name as entity_title,
  i.schema_version::integer as revision,
  i.status,
  'info'::text as status_tone,
  i.created_by as actor_user_id,
  i.created_at as occurred_at,
  'item.created'::text as action,
  jsonb_build_object('itemType', i.item_type, 'uomBase', i.uom_base) as payload
from public.items i
where i.org_id = app.current_org_id()
union all
select
  b.org_id,
  'bom'::text as entity_type,
  b.id::text as entity_id,
  b.product_id as entity_code,
  coalesce(b.product_id, b.fa_code, b.id::text) as entity_title,
  b.version,
  b.status,
  case
    when b.status in ('active', 'technical_approved') then 'success'
    when b.status in ('in_review') then 'info'
    when b.status in ('draft') then 'muted'
    when b.status in ('superseded', 'archived') then 'warning'
    else 'danger'
  end as status_tone,
  coalesce(b.approved_by, b.created_by_user) as actor_user_id,
  coalesce(b.approved_at, b.updated_at, b.created_at) as occurred_at,
  ('bom.' || b.status)::text as action,
  jsonb_build_object('yieldPct', b.yield_pct, 'effectiveFrom', b.effective_from, 'effectiveTo', b.effective_to) as payload
from public.bom_headers b
where b.org_id = app.current_org_id()
union all
select
  fs.org_id,
  'factory_spec'::text as entity_type,
  fs.id::text as entity_id,
  fs.spec_code as entity_code,
  fs.spec_code as entity_title,
  fs.version,
  fs.status,
  case
    when fs.status in ('approved_for_factory', 'released_to_factory') then 'success'
    when fs.status = 'in_review' then 'info'
    when fs.status = 'draft' then 'muted'
    when fs.status in ('superseded', 'archived') then 'warning'
    else 'danger'
  end as status_tone,
  coalesce(fs.released_by, fs.approved_by, fs.created_by) as actor_user_id,
  coalesce(fs.released_at, fs.approved_at, fs.updated_at, fs.created_at) as occurred_at,
  ('factory_spec.' || fs.status)::text as action,
  jsonb_build_object('fgItemId', fs.fg_item_id, 'bomHeaderId', fs.bom_header_id, 'bomVersion', fs.bom_version) as payload
from public.factory_specs fs
where fs.org_id = app.current_org_id()
union all
select
  co.org_id,
  'eco'::text as entity_type,
  co.id::text as entity_id,
  co.code as entity_code,
  co.title as entity_title,
  co.schema_version as revision,
  co.status,
  co.status_tone,
  coalesce(a.actor_user_id, co.updated_by, co.created_by) as actor_user_id,
  coalesce(a.occurred_at, co.updated_at, co.created_at) as occurred_at,
  coalesce(a.action, 'eco.' || co.status)::text as action,
  coalesce(a.payload, jsonb_build_object('targetItemId', co.target_item_id, 'targetBomHeaderId', co.target_bom_header_id, 'targetFactorySpecId', co.target_factory_spec_id)) as payload
from public.technical_change_orders co
left join public.technical_change_order_audit a
  on a.org_id = co.org_id
 and a.change_order_id = co.id
where co.org_id = app.current_org_id()
union all
select
  ae.org_id,
  ae.resource_type as entity_type,
  ae.resource_id as entity_id,
  ae.resource_id as entity_code,
  ae.resource_type as entity_title,
  null::integer as revision,
  null::text as status,
  'info'::text as status_tone,
  ae.actor_user_id,
  ae.occurred_at,
  ae.action,
  jsonb_build_object('before', ae.before_state, 'after', ae.after_state, 'requestId', ae.request_id) as payload
from public.audit_events ae
where ae.org_id = app.current_org_id()
  and ae.resource_type in ('item', 'bom', 'bom_header', 'factory_spec', 'eco', 'technical_change_order');

revoke all on public.v_technical_revision_history from public;
grant select on public.v_technical_revision_history to app_user;

comment on table public.technical_change_orders is
  '03-Technical ECO headers. org_id-scoped via RLS/app.current_org_id(); status_tone maps ECO status to semantic badge variants.';
comment on table public.technical_change_order_lines is
  '03-Technical ECO line items. org_id-scoped via RLS/app.current_org_id().';
comment on table public.technical_change_order_approvals is
  '03-Technical ECO approval/transition audit. Append-only for app_user; org_id-scoped via RLS/app.current_org_id().';
comment on table public.technical_change_order_audit is
  '03-Technical ECO-specific audit feed. Append-only for app_user; org_id-scoped via RLS/app.current_org_id().';
comment on view public.v_technical_revision_history is
  '03-Technical revision history read model over item/BOM/factory_spec/ECO/audit_events. security_invoker=true plus app.current_org_id() filters.';
