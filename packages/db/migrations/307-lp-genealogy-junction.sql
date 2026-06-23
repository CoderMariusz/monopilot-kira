-- Migration 307: B-list — lp_genealogy junction (N parents). parent_lp_id stays as the
-- fast-path/first-parent; this junction records ALL parent edges (a disassembly/kit output has
-- many parents). Backfill the existing single-parent edges.
create table if not exists public.lp_genealogy (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  child_lp_id   uuid not null references public.license_plates(id) on delete cascade,
  parent_lp_id  uuid not null references public.license_plates(id) on delete cascade,
  relation_type text not null default 'consumed',
  qty           numeric,
  uom           text,
  created_at    timestamptz not null default pg_catalog.now(),
  constraint lp_genealogy_rel_check check (relation_type in ('consumed','split','merge','derived')),
  constraint lp_genealogy_edge_unique unique (org_id, child_lp_id, parent_lp_id, relation_type),
  constraint lp_genealogy_no_self check (child_lp_id <> parent_lp_id)
);
create index if not exists idx_lp_genealogy_child on public.lp_genealogy (org_id, child_lp_id);
create index if not exists idx_lp_genealogy_parent on public.lp_genealogy (org_id, parent_lp_id);

alter table public.lp_genealogy enable row level security;
alter table public.lp_genealogy force  row level security;
drop policy if exists lp_genealogy_org_isolation on public.lp_genealogy;
create policy lp_genealogy_org_isolation on public.lp_genealogy
  for all to app_user using (org_id = app.current_org_id()) with check (org_id = app.current_org_id());

revoke all on public.lp_genealogy from public;
revoke all on public.lp_genealogy from app_user;
grant select, insert, update, delete on public.lp_genealogy to app_user;

insert into public.lp_genealogy (org_id, child_lp_id, parent_lp_id, relation_type)
select c.org_id, c.id, c.parent_lp_id, 'derived'
from public.license_plates c
where c.parent_lp_id is not null
  and c.parent_lp_id <> c.id
on conflict (org_id, child_lp_id, parent_lp_id, relation_type) do nothing;
