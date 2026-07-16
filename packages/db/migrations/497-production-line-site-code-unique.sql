-- Migration 497: C036 production line code unique per (org, site).
-- Wave0: org_id business scope; RLS via app.current_org_id().
-- Adds CASE-INSENSITIVE unique indexes on upper(code) (mig 268 was case-sensitive only),
-- to match the case-insensitive app-layer resolver/dedup. Reports same-site collisions
-- via RAISE NOTICE and skips the index (not fails deploy) if legacy duplicates exist.

do $$
declare
  v_collision record;
begin
  for v_collision in
    select org_id,
           site_id,
           upper(code) as line_code,
           count(*) as dup_count,
           array_agg(id::text order by id) as line_ids
      from public.production_lines
     where site_id is not null
     group by org_id, site_id, upper(code)
    having count(*) > 1
  loop
    raise notice 'C036 collision: org=% site=% code=% count=% ids=%',
      v_collision.org_id,
      v_collision.site_id,
      v_collision.line_code,
      v_collision.dup_count,
      v_collision.line_ids;
  end loop;

  for v_collision in
    select org_id,
           upper(code) as line_code,
           count(*) as dup_count,
           array_agg(id::text order by id) as line_ids
      from public.production_lines
     where site_id is null
     group by org_id, upper(code)
    having count(*) > 1
  loop
    raise notice 'C036 collision (null site): org=% code=% count=% ids=%',
      v_collision.org_id,
      v_collision.line_code,
      v_collision.dup_count,
      v_collision.line_ids;
  end loop;
end
$$;

-- Drop legacy org-wide (org_id, code) unique constraint if it persisted past migration 268.
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

-- C036 real invariant: the app layer resolves/dedups line codes case-insensitively
-- (actions/infra/line-resolve.ts uses `upper(code)`), but migration 268 only enforces
-- CASE-SENSITIVE uniqueness on raw `code`, so `LINE01` and `line01` could both persist
-- in the same (org, site) and re-introduce the ambiguous identity C036 is about.
-- Add CASE-INSENSITIVE unique indexes on upper(code) under NEW names so DB matches app.
-- If legacy case-insensitive collisions exist, the CREATE would fail; we catch that and
-- RAISE NOTICE instead of failing the deploy (collisions were already listed above and
-- the app-layer duplicate_code guard still applies until they are resolved by hand).
do $$
begin
  begin
    create unique index if not exists production_lines_org_site_codeci_uq
      on public.production_lines (org_id, site_id, upper(code))
      where site_id is not null;
  exception when unique_violation then
    raise notice 'C036: skipped case-insensitive site index — legacy collisions must be resolved first';
  end;

  begin
    create unique index if not exists production_lines_org_null_site_codeci_uq
      on public.production_lines (org_id, upper(code))
      where site_id is null;
  exception when unique_violation then
    raise notice 'C036: skipped case-insensitive null-site index — legacy collisions must be resolved first';
  end;
end
$$;
