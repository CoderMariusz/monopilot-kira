-- Migration 526: production line default output location — collapse to ONE canonical column.
-- Wave0: org_id business scope; RLS via app.current_org_id().
--
-- BUG: the settings action wrote `default_output_location_id` (added by migration 337) while
-- every reader read `default_location_id` (the original column from migration 042). Saving a
-- default output location reported success and then showed "— none —" after a reload, because
-- the value went into a column nothing reads.
--
-- CANONICAL COLUMN = `default_location_id`. It is the one with the index
-- (production_lines_default_location_idx) and the FK, the one in the Drizzle model
-- (packages/db/schema/infra-master.ts), and the one every reader uses:
--   - apps/web/app/[locale]/(app)/(admin)/settings/infra/lines/page.tsx
--   - apps/web/app/[locale]/(app)/(admin)/settings/sites/_actions/sites.ts
--   - apps/web/app/api/warehouse/scanner/pick/route.ts        (WO material staging location)
--   - apps/web/lib/warehouse/scanner/movement.ts              (same, scanner pick path)
-- `default_output_location_id` was written by the settings action and read by nothing except
-- that action's own read-back. The application code now writes `default_location_id`.

-- 1. Rescue the orphaned configuration. Rows whose canonical column is already set keep it:
--    that is the value every screen and the scanner have been using, so it wins. Such rows are
--    reported (not silently dropped) — on the live database there are none.
do $$
declare
  v_conflicts int;
begin
  select count(*)
    into v_conflicts
    from public.production_lines
   where default_output_location_id is not null
     and default_location_id is not null
     and default_location_id is distinct from default_output_location_id;

  if v_conflicts > 0 then
    raise notice
      'mig526: % production line(s) already have a different canonical default_location_id; '
      'the dead default_output_location_id value is dropped for them (canonical column wins)',
      v_conflicts;
  end if;
end
$$;

update public.production_lines
   set default_location_id = default_output_location_id
 where default_output_location_id is not null
   and default_location_id is null;

-- 2. Mark the loser dead so nobody revives it. Kept (not dropped) so this migration stays
--    reversible and any row written by an old deployment mid-rollout is still recoverable.
comment on column public.production_lines.default_output_location_id is
  'DEAD as of migration 526 — do NOT read or write. Duplicate of default_location_id that only '
  'the settings write-path ever touched, so saved values were invisible to every reader. Data '
  'was moved to default_location_id. Use default_location_id. Kept in sync by trigger '
  'production_lines_sync_default_location (step 4) so writes from an app version that predates '
  'this migration are not lost; drop the trigger together with this column.';

comment on column public.production_lines.default_location_id is
  'CANONICAL default output location of the production line (FK -> locations, indexed). Read by '
  'the lines + sites settings screens and by the scanner pick path as the WO staging location. '
  'May reference a location that was later deactivated — existing assignments are preserved, '
  'only NEW assignments of an inactive location are refused (in the application layer).';

-- 3. Post-check. Two independent assertions:
--    (a) a whole-table invariant (no LIMIT, no arbitrary row) — nothing is left stranded; and
--    (b) the backfill statement EXECUTED against an object this check creates itself and then
--        unwinds, so a green result cannot come from "there happened to be no matching rows".
--        PL/pgSQL has no SAVEPOINT: a nested BEGIN ... EXCEPTION ... END is the way to roll a
--        block back (same pattern as migration 497).
do $$
declare
  v_org   uuid;
  v_loc   uuid;
  v_line  uuid;
  v_moved uuid;
begin
  -- (a) whole-table invariant
  if exists (
    select 1
      from public.production_lines
     where default_output_location_id is not null
       and default_location_id is null
  ) then
    raise exception
      'mig526 post-check FAILED: production line(s) still have default_location_id null while the '
      'dead default_output_location_id is set — the backfill did not apply';
  end if;

  -- (b) self-built subject, executed then unwound
  select l.id, l.org_id
    into v_loc, v_org
    from public.locations l
   order by l.id
   limit 1;

  if v_loc is null then
    raise exception 'mig526 post-check cannot run: no locations exist to build a test row from';
  end if;

  begin
    -- site_id / warehouse_id stay NULL: the warehouse-site invariant trigger (mig 498) returns
    -- early for a null warehouse, and the routing-lock trigger (mig 496) only fires on site_id.
    insert into public.production_lines (org_id, code, name, default_output_location_id)
    values (
      v_org,
      'ZZ-MIG526-' || replace(gen_random_uuid()::text, '-', ''),
      'mig526 post-check',
      v_loc
    )
    returning id into v_line;

    -- the same statement as step 1
    update public.production_lines
       set default_location_id = default_output_location_id
     where default_output_location_id is not null
       and default_location_id is null
       and id = v_line;

    select default_location_id into v_moved
      from public.production_lines
     where id = v_line;

    if v_moved is distinct from v_loc then
      raise exception 'mig526 post-check FAILED: backfill left default_location_id = % (expected %)',
        v_moved, v_loc;
    end if;

    -- unwind the test row: the only way out of a PL/pgSQL sub-block without keeping its writes
    raise exception 'mig526_unwind';
  exception
    when others then
      if sqlerrm <> 'mig526_unwind' then
        raise;
      end if;
  end;

  raise notice 'mig526 post-check OK: backfill executed and verified on a self-built row (unwound)';
end
$$;

-- 4. Close the DEPLOY WINDOW. The backfill in step 1 runs ONCE, during the Vercel
--    build — and the build is not the cutover. Until the new deployment starts
--    serving, the PREVIOUS app version is still live and still writing
--    `default_output_location_id`, so any line whose default output location is
--    saved in that window lands in the dead column after the backfill has already
--    passed over it, and is invisible to every reader.
--
--    Chosen fix: a trigger that keeps the two columns identical, NOT a
--    "read coalesce(canonical, dead) for one release" compatibility shim.
--    Reasons:
--      * it needs no manual step and no follow-up deploy — a post-deploy sweep or
--        a "remember to delete the coalesce next release" note is exactly the kind
--        of step nobody runs;
--      * it covers writers this repo does not control on the way through (SQL
--        consoles, the old bundle still in a warm lambda, a rollback to the
--        previous deployment) — a reader-side coalesce only covers readers that
--        were redeployed;
--      * it is self-cancelling: once the dead column is dropped, the trigger and
--        its function go with it and nothing else has to change.
--    DROP THIS TRIGGER together with `default_output_location_id`.
create or replace function public.production_lines_sync_default_location()
returns trigger
language plpgsql
-- No table or function references in the body, but pinned anyway so the function
-- cannot be hijacked through a mutable search_path.
set search_path = pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    -- Old app inserts the dead column only; new app inserts the canonical one.
    -- The `else` makes the post-condition total: after this trigger the two
    -- columns are ALWAYS equal, including when a writer sets both to different
    -- values (canonical wins, same tie-break as step 1).
    if new.default_location_id is null then
      new.default_location_id := new.default_output_location_id;
    else
      new.default_output_location_id := new.default_location_id;
    end if;
    return new;
  end if;

  -- UPDATE: mirror whichever column the writer actually touched. When both moved
  -- (or neither did) the canonical column wins — the same tie-break as step 1.
  -- A write that CLEARS a column propagates the null, so unsetting still works.
  if new.default_output_location_id is distinct from old.default_output_location_id
     and new.default_location_id is not distinct from old.default_location_id then
    new.default_location_id := new.default_output_location_id;
  elsif new.default_location_id is distinct from old.default_location_id then
    new.default_output_location_id := new.default_location_id;
  end if;
  return new;
end
$$;

drop trigger if exists production_lines_sync_default_location on public.production_lines;
create trigger production_lines_sync_default_location
  before insert or update on public.production_lines
  for each row
  execute function public.production_lines_sync_default_location();

-- 5. Post-check for the trigger: BOTH directions exercised on a self-built row
--    that is then unwound. A green here means an old-app write really does reach
--    the canonical column.
do $$
declare
  v_org   uuid;
  v_loc   uuid;
  v_line  uuid;
  v_canon uuid;
  v_dead  uuid;
begin
  select l.id, l.org_id
    into v_loc, v_org
    from public.locations l
   order by l.id
   limit 1;

  if v_loc is null then
    raise exception 'mig526 trigger post-check cannot run: no locations exist to build a test row from';
  end if;

  begin
    -- site_id / warehouse_id stay NULL for the same reason as the step-3 check.
    insert into public.production_lines (org_id, code, name)
    values (
      v_org,
      'ZZ-MIG526T-' || replace(gen_random_uuid()::text, '-', ''),
      'mig526 trigger post-check'
    )
    returning id into v_line;

    -- (a) OLD app version: writes the dead column only. This is the deploy-window
    --     write the one-shot backfill cannot catch.
    update public.production_lines
       set default_output_location_id = v_loc
     where id = v_line;

    select default_location_id into v_canon from public.production_lines where id = v_line;
    if v_canon is distinct from v_loc then
      raise exception
        'mig526 trigger post-check FAILED: an old-app write to default_output_location_id left '
        'default_location_id = % (expected %) — deploy-window writes would still be lost', v_canon, v_loc;
    end if;

    -- (b) NEW app version: writes the canonical column only, including clearing it.
    update public.production_lines
       set default_location_id = null
     where id = v_line;

    select default_output_location_id into v_dead from public.production_lines where id = v_line;
    if v_dead is not null then
      raise exception
        'mig526 trigger post-check FAILED: clearing default_location_id left the dead column at % '
        '— the two columns would drift apart', v_dead;
    end if;

    raise exception 'mig526_unwind';
  exception
    when others then
      if sqlerrm <> 'mig526_unwind' then
        raise;
      end if;
  end;

  raise notice 'mig526 trigger post-check OK: both write directions mirror correctly (unwound)';
end
$$;
