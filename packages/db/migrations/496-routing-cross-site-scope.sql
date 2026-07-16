-- Migration 496: C041 — enforce single-site scope on routing approve/publish.
-- All routing operations must bind production lines from one site; the routing
-- header site_id (when set) must match every line site_id. Mixing org-wide
-- (NULL-site) lines with site-assigned lines is rejected.
-- Idempotent data-fix demotes cross-site approved/active routings to draft.

-- Shared scope check: true when the routing violates V-TEC-64.
create or replace function public.routing_line_site_scope_violated(
  p_routing_id uuid,
  p_org_id uuid,
  p_header_site_id uuid
)
returns boolean
language sql
stable
set search_path = pg_catalog, public, pg_temp
as $$
  with line_sites as (
    select pl.site_id
      from public.routing_operations ro
      join public.production_lines pl
        on pl.id = ro.line_id
       and pl.org_id = ro.org_id
     where ro.routing_id = p_routing_id
       and ro.org_id = p_org_id
  ),
  stats as (
    select count(*) filter (where site_id is null) as null_line_cnt,
           count(distinct site_id) filter (where site_id is not null) as distinct_non_null_sites
      from line_sites
  )
  select
    stats.distinct_non_null_sites > 1
    or (stats.null_line_cnt > 0 and stats.distinct_non_null_sites > 0)
    or (
      p_header_site_id is not null
      and exists (
        select 1
          from line_sites ls
         where ls.site_id is distinct from p_header_site_id
      )
    )
  from stats;
$$;

-- Preview: list routing IDs that containment will demote (visible in migrate logs).
do $$
declare
  v_row record;
begin
  for v_row in
    select r.id
      from public.routings r
     where r.status in ('approved', 'active')
       and public.routing_line_site_scope_violated(r.id, r.org_id, r.site_id)
     order by r.id
  loop
    raise notice 'C041 containment preview: demoting routing_id=%', v_row.id;
  end loop;
end;
$$;

-- A) Backfill routing.site_id when every bound line shares one non-null site
--    and no org-wide (NULL-site) lines are mixed in.
update public.routings r
   set site_id = scoped.canonical_site_id
  from (
    select ro.routing_id,
           min(pl.site_id::text)::uuid as canonical_site_id
      from public.routing_operations ro
      join public.production_lines pl
        on pl.id = ro.line_id
       and pl.org_id = ro.org_id
     group by ro.routing_id
    having count(distinct pl.site_id) filter (where pl.site_id is not null) = 1
       and count(*) filter (where pl.site_id is null) = 0
  ) scoped
 where r.id = scoped.routing_id
   and r.site_id is null;

-- B) Containment: reopen cross-site routings that were approved or active.
update public.routings r
   set status = 'draft',
       approved_by = null,
       approved_at = null,
       effective_to = null,
       updated_at = pg_catalog.now()
 where r.status in ('approved', 'active')
   and public.routing_line_site_scope_violated(r.id, r.org_id, r.site_id);

-- C) DB gate: block transitions into approved/active when site scope is broken.
create or replace function public.routings_enforce_line_site_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.status not in ('approved', 'active') then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.status in ('approved', 'active')
     and new.status = old.status
     and new.site_id is not distinct from old.site_id then
    return new;
  end if;

  if public.routing_line_site_scope_violated(new.id, new.org_id, new.site_id) then
    raise exception 'routing_cross_site_lines (V-TEC-64)'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists routings_enforce_line_site_scope on public.routings;
create trigger routings_enforce_line_site_scope
  before insert or update of status, site_id
  on public.routings
  for each row
  execute function public.routings_enforce_line_site_scope();

-- D) Approved/active routings are immutable at the operation grain — force a new draft version.
-- INSERT checks NEW parent; DELETE checks OLD parent; UPDATE checks BOTH independently
-- so reparenting an operation away from a locked routing cannot bypass the guard.
create or replace function public.routing_operations_guard_locked_routing()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_status text;
begin
  if tg_op in ('INSERT', 'UPDATE') then
    select r.status
      into v_status
      from public.routings r
     where r.id = new.routing_id
       and r.org_id = new.org_id;

    if v_status in ('approved', 'active') then
      raise exception 'routing_operations_immutable (V-TEC-64)'
        using errcode = '23514';
    end if;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    select r.status
      into v_status
      from public.routings r
     where r.id = old.routing_id
       and r.org_id = old.org_id;

    if v_status in ('approved', 'active') then
      raise exception 'routing_operations_immutable (V-TEC-64)'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists routing_operations_guard_locked_routing on public.routing_operations;
create trigger routing_operations_guard_locked_routing
  before insert or update or delete
  on public.routing_operations
  for each row
  execute function public.routing_operations_guard_locked_routing();

-- E) production_lines.site_id cannot change while the line is bound to approved/active routings.
create or replace function public.production_lines_guard_site_while_routing_locked()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.site_id is distinct from old.site_id
     and exists (
       select 1
         from public.routing_operations ro
         join public.routings r
           on r.id = ro.routing_id
          and r.org_id = ro.org_id
        where ro.line_id = new.id
          and ro.org_id = new.org_id
          and r.status in ('approved', 'active')
     ) then
    raise exception 'production_line_site_immutable_while_routing_active (V-TEC-64)'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists production_lines_guard_site_while_routing_locked on public.production_lines;
create trigger production_lines_guard_site_while_routing_locked
  before update of site_id
  on public.production_lines
  for each row
  execute function public.production_lines_guard_site_while_routing_locked();
