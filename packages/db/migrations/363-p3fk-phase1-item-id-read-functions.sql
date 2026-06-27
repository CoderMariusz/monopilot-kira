-- Migration 363 — P3-FK Phase 1 (additive): item_id read-path for the pure-READ bom_headers functions
-- + the item_id twin indexes that back them. NOTHING is dropped here.
--
-- Design: _meta/plans/2026-06-27-p3-fk-design.md (Mig-D split into Phase 1 additive + Phase 2 drop).
--
-- Context: mig 362 added bom_headers.item_id (uuid FK → items.id), backfilled it 1:1 from the items twin
-- (item_code = product_id), and installed a BEFORE-trigger that keeps item_id in sync on every write. App
-- readers/writers already use item_id. The remaining product_id consumers are the DB FUNCTIONS. A function
-- that references a dropped column breaks at call time, so EVERY bom_headers.product_id reference must move to
-- item_id BEFORE Phase 2 drops the column.
--
-- This Phase 1 migration converts ONLY the four functions that *read* bom_headers.product_id and never write
-- bom_headers (so they fully shed product_id with zero coordination risk):
--   * get_fa_bom(text)                         — read filter + returned FG code → item_id
--   * get_factory_active_bom(text)             — read filter + returned FG code → item_id
--   * check_factory_release_consistency()      — reads bh.product_id → items join on bh.item_id
--   * factory_release_status_validate()        — reads h.product_id  → items join on h.item_id
-- The five WRITE/GUARD functions (request_npd_released_bom_edit, create_initial_shared_bom_version_for_npd_project,
-- bom_request_version_edit, bom_headers_reject_approved_content_update, backfill_initial_shared_boms_from_legacy_npd)
-- are intentionally LEFT UNCHANGED here: they keep writing product_id (the mig-362 trigger fills item_id), and the
-- existing product_id immutability guard still protects against drift while product_id remains the source of truth.
-- They are rewritten atomically WITH the column drop in Phase 2 (Mig-D, mig 364).
--
-- Pre-checked LIVE before authoring (org 00000000-…-0002, whole table):
--   * item_id is 1:1 with product_id (has_pid_no_iid = 0, has_iid_no_pid = 0)
--   * product_id ≡ item_code(item_id) for EVERY header (value_mismatches = 0) → read rewrites are provably
--     result-equivalent: header.product_id = $code  ⟺  header.item_id = (resolver of $code), and returning
--     the twin's item_code equals returning product_id.
--   * no duplicate (org_id, item_id, version) and no duplicate active (org_id, item_id) → the new UNIQUE
--     item_id indexes build cleanly.
--
-- Rollback (reverse order):
--   drop index if exists public.bom_headers_active_item_idx;
--   drop index if exists public.bom_headers_org_item_idx;
--   drop index if exists public.bom_headers_org_npd_project_version_item_unique;
--   drop index if exists public.bom_headers_org_item_version_unique;
--   -- and re-create the pre-363 product_id-based bodies of the four functions (see git history of this file's deps).

-- ── 1. item_id twin indexes (additive; the product_id originals stay until Phase 2) ───────────────────────────
-- Mirror of bom_headers_org_product_version_unique.
create unique index if not exists bom_headers_org_item_version_unique
  on public.bom_headers using btree (org_id, item_id, version)
  where item_id is not null;

-- Mirror of bom_headers_org_npd_project_version_unique (NPD-only BOMs: item_id IS NULL ⟺ product_id IS NULL).
create unique index if not exists bom_headers_org_npd_project_version_item_unique
  on public.bom_headers using btree (org_id, npd_project_id, version)
  where npd_project_id is not null and item_id is null;

-- Mirror of bom_headers_org_product_idx (lookup/sort support for the rewritten read filters).
create index if not exists bom_headers_org_item_idx
  on public.bom_headers using btree (org_id, item_id, status, version desc)
  where item_id is not null;

-- Mirror of bom_headers_active_version_idx (one active BOM per item).
create unique index if not exists bom_headers_active_item_idx
  on public.bom_headers using btree (org_id, item_id)
  where status = 'active' and item_id is not null;

-- ── 2. get_fa_bom — filter + returned FG code via item_id ─────────────────────────────────────────────────────
-- The returned product_code column equals the input p_product_code (the filter resolves item_id from exactly that
-- code), so we project p_product_code directly — no extra items join in the output, and zero product_id reference.
create or replace function public.get_fa_bom(p_product_code text)
 returns table(bom_header_id uuid, product_code text, status text, version integer, line_no integer, component_code text, component_type text, quantity numeric, uom text, manufacturing_operation_name text, source text)
 language sql
 stable
 security invoker
as $function$
  with selected_header as (
    select header.id, header.status, header.version
    from public.bom_headers header
    where header.org_id = app.current_org_id()
      and header.item_id = (
        select i.id
        from public.items i
        where i.org_id = app.current_org_id()
          and i.item_code = p_product_code
      )
      and header.status in ('active', 'technical_approved', 'in_review', 'draft')
    order by
      case header.status
        when 'active' then 1
        when 'technical_approved' then 2
        when 'in_review' then 3
        else 4
      end,
      header.version desc,
      header.created_at desc
    limit 1
  )
  select
    header.id,
    p_product_code,
    header.status,
    header.version,
    line.line_no,
    line.component_code,
    line.component_type,
    line.quantity,
    line.uom,
    line.manufacturing_operation_name,
    line.source
  from selected_header header
  join public.bom_lines line
    on line.org_id = app.current_org_id()
   and line.bom_header_id = header.id
  order by line.line_no;
$function$;

-- ── 3. get_factory_active_bom — filter + returned FG code via item_id ─────────────────────────────────────────
create or replace function public.get_factory_active_bom(p_product_code text)
 returns table(bom_header_id uuid, product_code text, status text, version integer, line_no integer, component_code text, quantity numeric, uom text, source text)
 language sql
 stable
 security invoker
as $function$
  select
    header.id,
    p_product_code,
    header.status,
    header.version,
    line.line_no,
    line.component_code,
    line.quantity,
    line.uom,
    line.source
  from public.bom_headers header
  join public.bom_lines line
    on line.org_id = header.org_id
   and line.bom_header_id = header.id
  where header.org_id = app.current_org_id()
    and header.item_id = (
      select i.id
      from public.items i
      where i.org_id = app.current_org_id()
        and i.item_code = p_product_code
    )
    and header.status = 'active'
  order by line.line_no;
$function$;

-- ── 4. check_factory_release_consistency — bom's FG code via items LEFT JOIN on bh.item_id ────────────────────
-- v_bom_product_id now sources the BOM's FG code from the item_id twin instead of bh.product_id. LEFT JOIN
-- preserves the "product_id IS NULL → skip" branch (item_id IS NULL ⟺ product_id IS NULL). The driving inner
-- joins are unchanged, so NOT FOUND semantics are identical.
create or replace function public.check_factory_release_consistency()
 returns trigger
 language plpgsql
as $function$
declare
  v_fg_item_code text;
  v_bom_product_id text;
  v_spec_bom_header_id uuid;
begin
  select i.item_code, bomi.item_code, fs.bom_header_id
    into v_fg_item_code, v_bom_product_id, v_spec_bom_header_id
    from public.factory_specs fs
    join public.bom_headers bh
      on bh.id = new.active_bom_header_id
     and bh.org_id = new.org_id
    join public.items i
      on i.id = fs.fg_item_id
     and i.org_id = new.org_id
    left join public.items bomi
      on bomi.id = bh.item_id
     and bomi.org_id = new.org_id
   where fs.id = new.active_factory_spec_id
     and fs.org_id = new.org_id;

  if not found
     or (v_spec_bom_header_id is not null and v_spec_bom_header_id <> new.active_bom_header_id)
     or (v_bom_product_id is not null and v_fg_item_code is distinct from v_bom_product_id) then
    raise exception 'factory_release_spec_bom_mismatch: spec fg_item % does not match bom product_id %',
      v_fg_item_code,
      v_bom_product_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$function$;

-- ── 5. factory_release_status_validate — bom's FG code via items LEFT JOIN on h.item_id ───────────────────────
-- Only the bom_headers read changes. The factory_release_status.product_code checks and the public.product
-- (view) existence check are a DIFFERENT product surface and stay as-is. bom_row.product_id is now sourced
-- from the item_id twin (aliased product_id so downstream references are untouched). LEFT JOIN preserves the
-- "product_id IS NULL → skip linkage check" branch and the "BOM header does not exist" (org_id IS NULL) branch.
create or replace function public.factory_release_status_validate()
 returns trigger
 language plpgsql
as $function$
declare
  project_row record;
  product_org_id uuid;
  bom_row record;
  actor_org_id uuid;
  event_org_id uuid;
begin
  select p.org_id, p.product_code
    into project_row
  from public.npd_projects p
  where p.id = new.project_id;

  if project_row.org_id is null then
    raise exception 'NPD project % does not exist', new.project_id
      using errcode = '23503';
  end if;

  if project_row.org_id <> new.org_id then
    raise exception 'NPD project % does not belong to release org', new.project_id
      using errcode = '42501';
  end if;

  if project_row.product_code is not null and project_row.product_code <> new.product_code then
    raise exception 'NPD project % is not linked to product %', new.project_id, new.product_code
      using errcode = '23514';
  end if;

  select product.org_id
    into product_org_id
  from public.product
  where product.product_code = new.product_code;

  if product_org_id is null then
    raise exception 'Product % does not exist', new.product_code
      using errcode = '23503';
  end if;

  if product_org_id <> new.org_id then
    raise exception 'Product % does not belong to release org', new.product_code
      using errcode = '42501';
  end if;

  if new.active_bom_header_id is not null then
    select h.org_id, bomi.item_code as product_id, h.npd_project_id, h.status
      into bom_row
    from public.bom_headers h
    left join public.items bomi
      on bomi.id = h.item_id
     and bomi.org_id = h.org_id
    where h.id = new.active_bom_header_id;

    if bom_row.org_id is null then
      raise exception 'BOM header % does not exist', new.active_bom_header_id
        using errcode = '23503';
    end if;

    if bom_row.org_id <> new.org_id then
      raise exception 'BOM header % does not belong to release org', new.active_bom_header_id
        using errcode = '42501';
    end if;

    if bom_row.product_id is not null and bom_row.product_id <> new.product_code then
      raise exception 'BOM header % is not linked to product %', new.active_bom_header_id, new.product_code
        using errcode = '23514';
    end if;

    if bom_row.npd_project_id is not null and bom_row.npd_project_id <> new.project_id then
      raise exception 'BOM header % is not linked to project %', new.active_bom_header_id, new.project_id
        using errcode = '23514';
    end if;

    if new.release_status in ('approved_for_factory', 'released_to_factory')
       and bom_row.status not in ('technical_approved', 'active') then
      raise exception 'factory-usable release requires Technical-approved active BOM/spec evidence'
        using errcode = '23514';
    end if;
  end if;

  if new.factory_approved_by is not null then
    select users.org_id
      into actor_org_id
    from public.users
    where users.id = new.factory_approved_by;

    if actor_org_id is null then
      raise exception 'Factory approver % does not exist', new.factory_approved_by
        using errcode = '23503';
    end if;

    if actor_org_id <> new.org_id then
      raise exception 'Factory approver % does not belong to release org', new.factory_approved_by
        using errcode = '42501';
    end if;
  end if;

  if new.requested_by is not null then
    select users.org_id
      into actor_org_id
    from public.users
    where users.id = new.requested_by;

    if actor_org_id is null then
      raise exception 'Release requester % does not exist', new.requested_by
        using errcode = '23503';
    end if;

    if actor_org_id <> new.org_id then
      raise exception 'Release requester % does not belong to release org', new.requested_by
        using errcode = '42501';
    end if;
  end if;

  if new.release_event_id is not null then
    select outbox_events.org_id
      into event_org_id
    from public.outbox_events
    where outbox_events.id = new.release_event_id;

    if event_org_id is null then
      raise exception 'Release event % does not exist', new.release_event_id
        using errcode = '23503';
    end if;

    if event_org_id <> new.org_id then
      raise exception 'Release event % does not belong to release org', new.release_event_id
        using errcode = '42501';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$function$;
