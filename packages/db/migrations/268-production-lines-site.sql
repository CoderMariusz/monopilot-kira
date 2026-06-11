-- Migration 268: Settings production lines site assignment.
-- Wave0: org_id business scope. RLS stays on app.current_org_id().
-- Multi-site day-1 pattern: production_lines.site_id is nullable and intentionally
-- has no FK here; public.sites is a soft reference owned by migration 215.

alter table public.production_lines
  add column if not exists site_id uuid null;

comment on column public.production_lines.site_id is
  'Nullable day-1 soft reference to public.sites.id; no FK until multi-site activation/backfill.';

update public.production_lines pl
   set site_id = default_site.id
  from public.sites default_site
 where pl.site_id is null
   and default_site.org_id = pl.org_id
   and default_site.is_default = true
   and default_site.is_active = true;

create index if not exists production_lines_org_site_idx
  on public.production_lines (org_id, site_id);

do $$
declare
  v_constraint_name name;
begin
  select c.conname
    into v_constraint_name
  from pg_constraint c
  where c.conrelid = 'public.production_lines'::regclass
    and c.contype = 'u'
    and c.conkey = array[
      (
        select a.attnum
        from pg_attribute a
        where a.attrelid = 'public.production_lines'::regclass
          and a.attname = 'org_id'
      ),
      (
        select a.attnum
        from pg_attribute a
        where a.attrelid = 'public.production_lines'::regclass
          and a.attname = 'code'
      )
    ]::smallint[]
  limit 1;

  if v_constraint_name is not null then
    execute format('alter table public.production_lines drop constraint %I', v_constraint_name);
  end if;
end
$$;

create unique index if not exists production_lines_org_site_code_uq
  on public.production_lines (org_id, site_id, code)
  where site_id is not null;

create unique index if not exists production_lines_org_null_site_code_uq
  on public.production_lines (org_id, code)
  where site_id is null;
