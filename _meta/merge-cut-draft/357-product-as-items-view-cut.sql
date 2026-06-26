-- Migration 357 — product→items MERGE, finalized-cut step 3 (§8d.3-6). GO-LIVE CUT (review-gated).
-- Design: _meta/plans/2026-06-26-product-items-merge-design.md §8d.
--
-- After this migration public.product is a SECURITY INVOKER VIEW over items ⨝ fg_npd_ext, with
-- INSTEAD-OF INSERT/UPDATE/DELETE triggers that fan writes to items (overlap cols) + fg_npd_ext (NPD/gap
-- cols) + a product_legacy SKELETON anchor row (product_code/org_id/NOT-NULL only — sole purpose is to keep
-- the 16 FK satellites resolving until a later phase migrates them to items.id). The 38 product readers,
-- the 17 product writers, the 3 dependent views, and all 16 FK satellites keep working with ZERO code change.
--
-- PRE-REQS (must already be applied + LIVE-verified): mig 355 (the 6 gap cols on fg_npd_ext + backfill)
-- and mig 356 (update_fa_allergen_set rewritten to lock items / write fg_npd_ext — the §8c blocker fix).
--
-- OUT OF SCOPE (later, separate review gate): the bom_headers.product_id text→items.id FK swap (P3-FK)
-- and the FG-NPD-002→FG-002 alias rename (P4). This migration is the cleanly-reversible part EXCEPT it
-- depends on 356 being in place.
--
-- Rollback (reverse order):
--   drop view public.fa, public.fa_allergen_cascade, public.fa_status_overall;  -- (they re-bind to legacy below)
--   drop view public.product cascade;            -- also drops the 3 INSTEAD-OF triggers
--   drop function public.product_instead_of_{insert,update,delete}_fn();
--   alter table public.product_legacy rename to product;       -- 16 FKs + 3 views + names auto-follow
--   -- then re-create the 4 original triggers from migs 097/222/223/345/346 (kept in git history)
--   -- and re-issue fa / fa_allergen_cascade / fa_status_overall against the restored product table.
-- (A full live-walk soak gates the eventual product_legacy DROP — that is P5, not here.)

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Rename the base table out of the way. The 16 FK satellites, the 3 dependent views, and the 4 triggers
--    all auto-follow the rename (they reference the relation by OID). The composite PK (org_id, product_code)
--    and every column are preserved.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.product rename to product_legacy;

-- 2. Drop the 4 legacy triggers — their behaviour is absorbed into the INSTEAD-OF functions below.
--    (They would otherwise fire on the skeleton-anchor writes we do into product_legacy, double-running
--    the built-reset / allergen-refresh logic and corrupting the anchor.)
drop trigger if exists fa_built_v18_check                       on public.product_legacy;
drop trigger if exists fa_reset_built_on_product_edit           on public.product_legacy;
drop trigger if exists fa_allergen_set_refresh_on_product_insert on public.product_legacy;
drop trigger if exists fa_allergen_set_refresh_on_product_edit   on public.product_legacy;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The product VIEW — EXACT 93-column shape, same ordinal order as the captured product table.
--    Source map (§8b): 13 overlap cols come from items i; the 6 gap cols + 74 NPD cols come from fg_npd_ext x.
--      product_code  ← i.item_code            product_name ← i.name
--      bar_codes     ← i.gs1_gtin             shelf_life   ← i.shelf_life_days::text
--      tara_weight   ← i.tare_weight          price        ← i.list_price_gbp
--      org_id        ← i.org_id               ext_jsonb    ← i.ext_jsonb
--      private_jsonb ← i.private_jsonb         schema_version ← i.schema_version
--      created_at    ← i.created_at           created_by_user ← i.created_by
--      deleted_at    ← x.deleted_at  (exact timestamp; items.status='deprecated' is the lifecycle mirror)
--    allergens / may_contain / supplier / created_by_device / app_version  ← x.* (gap cols, mig 355)
--    All remaining NPD cols ← x.* (mig 353/354).
--    SECURITY INVOKER: callers' RLS on items + fg_npd_ext applies (both are org-scoped) — no privilege escalation.
-- ─────────────────────────────────────────────────────────────────────────────
create view public.product
  with (security_invoker = true)
as
select
  i.item_code                                  as product_code,        -- 1
  i.name                                        as product_name,        -- 2
  x.pack_size,                                                          -- 3
  x.number_of_cases,                                                    -- 4
  x.recipe_components,                                                  -- 5
  x.ingredient_codes,                                                   -- 6
  x.template,                                                           -- 7
  x.closed_core,                                                        -- 8
  x.primary_ingredient_pct,                                             -- 9
  x.runs_per_week,                                                      -- 10
  x.date_code_per_week,                                                 -- 11
  x.closed_planning,                                                    -- 12
  x.launch_date,                                                        -- 13
  x.department_number,                                                  -- 14
  x.article_number,                                                     -- 15
  i.gs1_gtin                                    as bar_codes,           -- 16
  x.cases_per_week_w1,                                                  -- 17
  x.cases_per_week_w2,                                                  -- 18
  x.cases_per_week_w3,                                                  -- 19
  x.closed_commercial,                                                  -- 20
  x.process_1,                                                          -- 21
  x.yield_p1,                                                           -- 22
  x.process_2,                                                          -- 23
  x.yield_p2,                                                           -- 24
  x.process_3,                                                          -- 25
  x.yield_p3,                                                           -- 26
  x.process_4,                                                          -- 27
  x.yield_p4,                                                           -- 28
  x.line,                                                               -- 29
  x.dieset,                                                             -- 30
  x.yield_line,                                                         -- 31
  x.staffing,                                                           -- 32
  x.rate,                                                               -- 33
  x.pr_code_p1,                                                         -- 34
  x.pr_code_p2,                                                         -- 35
  x.pr_code_p3,                                                         -- 36
  x.pr_code_p4,                                                         -- 37
  x.pr_code_final,                                                      -- 38
  x.closed_production,                                                  -- 39
  i.shelf_life_days::text                       as shelf_life,          -- 40
  x.closed_technical,                                                   -- 41
  x.box,                                                                -- 42
  x.top_label,                                                          -- 43
  x.bottom_label,                                                       -- 44
  x.web,                                                                -- 45
  x.mrp_box,                                                            -- 46
  x.mrp_labels,                                                         -- 47
  x.mrp_films,                                                          -- 48
  x.mrp_sleeves,                                                        -- 49
  x.mrp_cartons,                                                        -- 50
  i.tare_weight                                 as tara_weight,         -- 51
  x.pallet_stacking_plan,                                               -- 52
  x.box_dimensions,                                                     -- 53
  x.closed_mrp,                                                         -- 54
  i.list_price_gbp                              as price,               -- 55
  x.lead_time,                                                          -- 56
  x.supplier,                                                           -- 57
  x.proc_shelf_life,                                                    -- 58
  x.closed_procurement,                                                 -- 59
  x.done_core,                                                          -- 60
  x.done_planning,                                                      -- 61
  x.done_commercial,                                                    -- 62
  x.done_production,                                                    -- 63
  x.done_technical,                                                     -- 64
  x.done_mrp,                                                           -- 65
  x.done_procurement,                                                   -- 66
  x.status_overall,                                                     -- 67
  x.days_to_launch,                                                     -- 68
  coalesce(x.built, false)                      as built,               -- 69 (product.built NOT NULL default false)
  i.org_id,                                                             -- 70
  i.ext_jsonb,                                                          -- 71
  i.private_jsonb,                                                      -- 72
  i.schema_version,                                                     -- 73
  x.model_prediction_id,                                                -- 74
  x.epcis_event_id,                                                     -- 75
  x.external_id,                                                        -- 76
  i.created_at,                                                         -- 77
  i.created_by                                  as created_by_user,     -- 78
  x.created_by_device,                                                  -- 79
  x.app_version,                                                        -- 80
  coalesce(x.allergens, '{}'::text[])           as allergens,           -- 81
  coalesce(x.may_contain, '{}'::text[])         as may_contain,         -- 82
  x.deleted_at,                                                         -- 83
  x.volume,                                                             -- 84
  x.dev_code,                                                           -- 85
  x.weight,                                                             -- 86
  x.packs_per_case,                                                     -- 87
  x.benchmark,                                                          -- 88
  x.price_brief,                                                        -- 89
  x.comments,                                                           -- 90
  x.allergens_declaration_accepted,                                     -- 91
  x.allergens_declaration_accepted_by,                                  -- 92
  x.allergens_declaration_accepted_at                                   -- 93
from public.items i
join public.fg_npd_ext x on x.item_id = i.id;

comment on view public.product is
  'product→items merge (mig 357): items ⨝ fg_npd_ext, exact 93-col legacy shape. '
  'INSTEAD-OF triggers fan writes to items/fg_npd_ext/product_legacy. Base table = product_legacy (skeleton anchor for the 16 FKs).';

grant select, insert, update, delete on public.product to app_user;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4a. INSTEAD-OF INSERT — fan a product insert to: items (overlap) + fg_npd_ext (NPD/gap) +
--     product_legacy skeleton anchor (NOT-NULL cols only, for the FKs). Then run the absorbed AFTER-INSERT
--     allergen refresh. SECURITY DEFINER mirrors the original built-reset trigger (it wrote outbox); RLS is
--     still enforced because every write carries an explicit org_id = app.current_org_id() check.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.product_instead_of_insert_fn()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public', 'pg_catalog'
as $function$
declare
  v_org_id uuid := app.current_org_id();
  v_item_id uuid;
begin
  if v_org_id is null then
    raise exception 'product insert requires an org context (app.current_org_id())';
  end if;
  if new.org_id is not null and new.org_id <> v_org_id then
    raise exception 'product insert org mismatch (% <> %)', new.org_id, v_org_id;
  end if;

  -- V18 high-open-risk gate on direct insert with built=true (absorbed from fa_built_v18_check).
  if coalesce(new.built, false) is true then
    if exists (
      select 1 from public.risks risk
      where risk.org_id = v_org_id
        and risk.product_code = new.product_code
        and risk.bucket = 'High' and risk.state = 'Open'
    ) then
      raise exception 'V18_HIGH_RISK_OPEN' using errcode = '23514';
    end if;
  end if;

  -- (a) items overlap row. Re-use an existing twin if present (the materializer's lock-step row),
  --     else create the fg master. NOT-NULL items cols without default: item_type, name, uom_base.
  select i.id into v_item_id
  from public.items i
  where i.org_id = v_org_id and i.item_code = new.product_code;

  if v_item_id is null then
    insert into public.items (
      org_id, item_code, item_type, name, status, uom_base,
      gs1_gtin, tare_weight, shelf_life_days, list_price_gbp,
      ext_jsonb, private_jsonb, schema_version, created_by, created_at,
      origin_module
    ) values (
      v_org_id, new.product_code, 'fg',
      coalesce(nullif(new.product_name, ''), new.product_code),
      case when new.deleted_at is not null then 'deprecated' else 'active' end,
      'kg',
      new.bar_codes, new.tara_weight, nullif(new.shelf_life, '')::int, new.price,
      coalesce(new.ext_jsonb, '{}'::jsonb), coalesce(new.private_jsonb, '{}'::jsonb),
      coalesce(new.schema_version, 1), new.created_by_user, coalesce(new.created_at, now()),
      'npd'
    )
    returning id into v_item_id;
  else
    -- twin exists → sync the overlap cols from the product insert payload.
    update public.items i
       set name           = coalesce(nullif(new.product_name, ''), i.name),
           gs1_gtin       = new.bar_codes,
           tare_weight    = new.tara_weight,
           shelf_life_days= nullif(new.shelf_life, '')::int,
           list_price_gbp = new.price,
           status         = case when new.deleted_at is not null then 'deprecated' else i.status end,
           ext_jsonb      = coalesce(new.ext_jsonb, i.ext_jsonb),
           private_jsonb  = coalesce(new.private_jsonb, i.private_jsonb),
           updated_at     = now()
     where i.id = v_item_id;
  end if;

  -- (b) fg_npd_ext row (NPD + gap cols). built is reset to false-on-edit elsewhere; on INSERT honour payload.
  insert into public.fg_npd_ext (
    item_id, org_id,
    pack_size, number_of_cases, recipe_components, ingredient_codes, template, primary_ingredient_pct,
    runs_per_week, date_code_per_week, launch_date, department_number, article_number,
    cases_per_week_w1, cases_per_week_w2, cases_per_week_w3,
    process_1, yield_p1, process_2, yield_p2, process_3, yield_p3, process_4, yield_p4,
    line, dieset, yield_line, staffing, rate,
    pr_code_p1, pr_code_p2, pr_code_p3, pr_code_p4, pr_code_final,
    box, top_label, bottom_label, web, mrp_box, mrp_labels, mrp_films, mrp_sleeves, mrp_cartons,
    pallet_stacking_plan, box_dimensions, lead_time, proc_shelf_life,
    closed_core, closed_planning, closed_commercial, closed_production, closed_technical, closed_mrp, closed_procurement,
    done_core, done_planning, done_commercial, done_production, done_technical, done_mrp, done_procurement,
    status_overall, days_to_launch, built, volume, dev_code, weight, packs_per_case, benchmark, price_brief, comments,
    allergens_declaration_accepted, allergens_declaration_accepted_by, allergens_declaration_accepted_at,
    model_prediction_id, epcis_event_id, external_id,
    supplier, created_by_device, app_version, allergens, may_contain, deleted_at
  ) values (
    v_item_id, v_org_id,
    new.pack_size, new.number_of_cases, new.recipe_components, new.ingredient_codes, new.template, new.primary_ingredient_pct,
    new.runs_per_week, new.date_code_per_week, new.launch_date, new.department_number, new.article_number,
    new.cases_per_week_w1, new.cases_per_week_w2, new.cases_per_week_w3,
    new.process_1, new.yield_p1, new.process_2, new.yield_p2, new.process_3, new.yield_p3, new.process_4, new.yield_p4,
    new.line, new.dieset, new.yield_line, new.staffing, new.rate,
    new.pr_code_p1, new.pr_code_p2, new.pr_code_p3, new.pr_code_p4, new.pr_code_final,
    new.box, new.top_label, new.bottom_label, new.web, new.mrp_box, new.mrp_labels, new.mrp_films, new.mrp_sleeves, new.mrp_cartons,
    new.pallet_stacking_plan, new.box_dimensions, new.lead_time, new.proc_shelf_life,
    new.closed_core, new.closed_planning, new.closed_commercial, new.closed_production, new.closed_technical, new.closed_mrp, new.closed_procurement,
    new.done_core, new.done_planning, new.done_commercial, new.done_production, new.done_technical, new.done_mrp, new.done_procurement,
    new.status_overall, new.days_to_launch, coalesce(new.built, false),
    new.volume, new.dev_code, new.weight, new.packs_per_case, new.benchmark, new.price_brief, new.comments,
    coalesce(new.allergens_declaration_accepted, false), new.allergens_declaration_accepted_by, new.allergens_declaration_accepted_at,
    new.model_prediction_id, new.epcis_event_id, new.external_id,
    new.supplier, new.created_by_device, new.app_version,
    coalesce(new.allergens, '{}'::text[]), coalesce(new.may_contain, '{}'::text[]), new.deleted_at
  )
  on conflict (item_id) do update set
    pack_size = excluded.pack_size, number_of_cases = excluded.number_of_cases,
    recipe_components = excluded.recipe_components, ingredient_codes = excluded.ingredient_codes,
    template = excluded.template, status_overall = excluded.status_overall, built = excluded.built,
    deleted_at = excluded.deleted_at, updated_at = now();

  -- (c) product_legacy skeleton anchor — ONLY the NOT-NULL cols + the FK key, for the 16 satellites.
  --     Defaults cover ext_jsonb/private_jsonb/schema_version/allergens/may_contain/allergens_declaration_accepted.
  insert into public.product_legacy (org_id, product_code, built, created_by_user, created_at)
  values (v_org_id, new.product_code, coalesce(new.built, false),
          coalesce(new.created_by_user, public.fa_actor_from_local_context()), coalesce(new.created_at, now()))
  on conflict (org_id, product_code) do nothing;

  -- (d) absorbed AFTER-INSERT allergen refresh (was fa_allergen_set_refresh_on_product_insert).
  --     update_fa_allergen_set now writes fg_npd_ext (mig 356) — NO trigger on that table → cannot recurse
  --     through this view. Guard depth defensively anyway.
  if pg_trigger_depth() < 2 then
    perform public.update_fa_allergen_set(new.product_code);
  end if;

  return new;
end;
$function$;

create trigger product_instead_of_insert
  instead of insert on public.product
  for each row execute function public.product_instead_of_insert_fn();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4b. INSTEAD-OF UPDATE — fan to items (overlap) + fg_npd_ext (NPD/gap). Absorbs:
--     • fa_built_v18_check  (block app_user built downgrade; block built-true with High/Open risk)
--     • fa_reset_built_on_product_edit (any non-built field change resets built=false + emits fa.built_reset)
--     • fa_allergen_set_refresh_on_product_edit (refresh when recipe_components/ingredient_codes change)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.product_instead_of_update_fn()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public', 'pg_catalog'
as $function$
declare
  v_org_id uuid := app.current_org_id();
  v_item_id uuid;
  v_actor uuid;
  v_effective_built boolean;
  v_non_built_changed boolean;
begin
  if v_org_id is null then
    raise exception 'product update requires an org context (app.current_org_id())';
  end if;

  select i.id into v_item_id
  from public.items i
  where i.org_id = v_org_id and i.item_code = old.product_code
  for update;
  if v_item_id is null then
    raise exception 'product update: % not found in current org', old.product_code;
  end if;

  -- ── built transition guards (fa_built_v18_check) ──
  if new.built is distinct from old.built then
    if new.built is false and old.built is true and current_user = 'app_user' then
      raise exception 'V18_BUILT_DOWNGRADE_REQUIRES_AUDIT' using errcode = '23514';
    end if;
    if new.built is true and old.built is false then
      if exists (
        select 1 from public.risks risk
        where risk.org_id = v_org_id and risk.product_code = old.product_code
          and risk.bucket = 'High' and risk.state = 'Open'
      ) then
        raise exception 'V18_HIGH_RISK_OPEN' using errcode = '23514';
      end if;
    end if;
  end if;

  -- ── reset-built-on-edit (fa_reset_built_on_product_edit): if it was built and ANY non-built column
  --    changed, force built=false and emit fa.built_reset. Compare the 93-col image minus built. ──
  v_effective_built := new.built;
  v_non_built_changed := (to_jsonb(new) - 'built') is distinct from (to_jsonb(old) - 'built');
  if old.built is true and v_non_built_changed then
    v_effective_built := false;
    v_actor := public.fa_actor_from_local_context();
    insert into public.outbox_events
      (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
    values (
      v_org_id, 'fa.built_reset', 'fa', old.product_code,
      jsonb_build_object('org_id', v_org_id, 'product_code', old.product_code,
                         'actor_user_id', v_actor, 'source', 'product', 'diff', '{}'::jsonb),
      'update-fa-cell-reset-built-v2'
    );
  end if;

  -- ── (a) items overlap columns ──
  update public.items i
     set item_code      = new.product_code,
         name           = coalesce(nullif(new.product_name, ''), i.name),
         gs1_gtin       = new.bar_codes,
         tare_weight    = new.tara_weight,
         shelf_life_days= nullif(new.shelf_life, '')::int,
         list_price_gbp = new.price,
         status         = case when new.deleted_at is not null then 'deprecated'
                               when old.deleted_at is not null and new.deleted_at is null then 'active'
                               else i.status end,
         ext_jsonb      = coalesce(new.ext_jsonb, i.ext_jsonb),
         private_jsonb  = coalesce(new.private_jsonb, i.private_jsonb),
         schema_version = coalesce(new.schema_version, i.schema_version),
         updated_at     = now()
   where i.id = v_item_id;

  -- ── (b) fg_npd_ext NPD + gap columns (built := effective value after reset logic) ──
  update public.fg_npd_ext x
     set pack_size = new.pack_size, number_of_cases = new.number_of_cases,
         recipe_components = new.recipe_components, ingredient_codes = new.ingredient_codes,
         template = new.template, primary_ingredient_pct = new.primary_ingredient_pct,
         runs_per_week = new.runs_per_week, date_code_per_week = new.date_code_per_week,
         launch_date = new.launch_date, department_number = new.department_number, article_number = new.article_number,
         cases_per_week_w1 = new.cases_per_week_w1, cases_per_week_w2 = new.cases_per_week_w2, cases_per_week_w3 = new.cases_per_week_w3,
         process_1 = new.process_1, yield_p1 = new.yield_p1, process_2 = new.process_2, yield_p2 = new.yield_p2,
         process_3 = new.process_3, yield_p3 = new.yield_p3, process_4 = new.process_4, yield_p4 = new.yield_p4,
         line = new.line, dieset = new.dieset, yield_line = new.yield_line, staffing = new.staffing, rate = new.rate,
         pr_code_p1 = new.pr_code_p1, pr_code_p2 = new.pr_code_p2, pr_code_p3 = new.pr_code_p3,
         pr_code_p4 = new.pr_code_p4, pr_code_final = new.pr_code_final,
         box = new.box, top_label = new.top_label, bottom_label = new.bottom_label, web = new.web,
         mrp_box = new.mrp_box, mrp_labels = new.mrp_labels, mrp_films = new.mrp_films,
         mrp_sleeves = new.mrp_sleeves, mrp_cartons = new.mrp_cartons,
         pallet_stacking_plan = new.pallet_stacking_plan, box_dimensions = new.box_dimensions,
         lead_time = new.lead_time, proc_shelf_life = new.proc_shelf_life,
         closed_core = new.closed_core, closed_planning = new.closed_planning, closed_commercial = new.closed_commercial,
         closed_production = new.closed_production, closed_technical = new.closed_technical,
         closed_mrp = new.closed_mrp, closed_procurement = new.closed_procurement,
         done_core = new.done_core, done_planning = new.done_planning, done_commercial = new.done_commercial,
         done_production = new.done_production, done_technical = new.done_technical,
         done_mrp = new.done_mrp, done_procurement = new.done_procurement,
         status_overall = new.status_overall, days_to_launch = new.days_to_launch,
         built = v_effective_built,
         volume = new.volume, dev_code = new.dev_code, weight = new.weight, packs_per_case = new.packs_per_case,
         benchmark = new.benchmark, price_brief = new.price_brief, comments = new.comments,
         allergens_declaration_accepted = coalesce(new.allergens_declaration_accepted, false),
         allergens_declaration_accepted_by = new.allergens_declaration_accepted_by,
         allergens_declaration_accepted_at = new.allergens_declaration_accepted_at,
         model_prediction_id = new.model_prediction_id, epcis_event_id = new.epcis_event_id, external_id = new.external_id,
         supplier = new.supplier, created_by_device = new.created_by_device, app_version = new.app_version,
         -- allergens/may_contain are owned by update_fa_allergen_set; honour an explicit payload change,
         -- otherwise leave them to the allergen refresh below.
         allergens = coalesce(new.allergens, x.allergens),
         may_contain = coalesce(new.may_contain, x.may_contain),
         deleted_at = new.deleted_at,
         updated_at = now()
   where x.item_id = v_item_id;

  -- ── keep the product_legacy skeleton anchor's NOT-NULL cols coherent (code/built/org) ──
  update public.product_legacy pl
     set product_code = new.product_code, built = coalesce(v_effective_built, false)
   where pl.org_id = v_org_id and pl.product_code = old.product_code;

  -- ── (d) absorbed AFTER-UPDATE-OF(recipe_components, ingredient_codes) allergen refresh ──
  if pg_trigger_depth() < 2
     and (old.recipe_components is distinct from new.recipe_components
          or old.ingredient_codes is distinct from new.ingredient_codes) then
    perform public.update_fa_allergen_set(new.product_code);
  end if;

  return new;
end;
$function$;

create trigger product_instead_of_update
  instead of update on public.product
  for each row execute function public.product_instead_of_update_fn();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4c. INSTEAD-OF DELETE — hard delete fans to fg_npd_ext + items + product_legacy. (Soft delete is an
--     UPDATE of deleted_at and goes through 4b.) FK satellites that still point at product_legacy will
--     block a hard delete via their own ON DELETE rules — that is the correct legacy behaviour preserved.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.product_instead_of_delete_fn()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public', 'pg_catalog'
as $function$
declare
  v_org_id uuid := app.current_org_id();
  v_item_id uuid;
begin
  if v_org_id is null then
    raise exception 'product delete requires an org context (app.current_org_id())';
  end if;

  select i.id into v_item_id
  from public.items i
  where i.org_id = v_org_id and i.item_code = old.product_code;

  -- Remove the legacy anchor first (its FKs gate the delete exactly as before).
  delete from public.product_legacy pl
   where pl.org_id = v_org_id and pl.product_code = old.product_code;

  if v_item_id is not null then
    delete from public.fg_npd_ext x where x.item_id = v_item_id;  -- (also ON DELETE CASCADE from items)
    delete from public.items i where i.id = v_item_id;
  end if;

  return old;
end;
$function$;

create trigger product_instead_of_delete
  instead of delete on public.product
  for each row execute function public.product_instead_of_delete_fn();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Re-issue the 3 dependent views so they re-bind to the NEW public.product view (they currently point
--    at product_legacy after the rename). Bodies are byte-identical to the captured definitions — only the
--    underlying `product` relation changes (now the items-backed view). Verified to return the SAME rows.
--    SECURITY INVOKER preserved (these were invoker views; RLS flows through items+fg_npd_ext).
-- ─────────────────────────────────────────────────────────────────────────────

-- 5a. fa = product where deleted_at is null (read-only compat view).
create or replace view public.fa
  with (security_invoker = true)
as
select
  product_code, product_name, pack_size, number_of_cases, recipe_components, ingredient_codes, template,
  closed_core, primary_ingredient_pct, runs_per_week, date_code_per_week, closed_planning, launch_date,
  department_number, article_number, bar_codes, cases_per_week_w1, cases_per_week_w2, cases_per_week_w3,
  closed_commercial, process_1, yield_p1, process_2, yield_p2, process_3, yield_p3, process_4, yield_p4,
  line, dieset, yield_line, staffing, rate, pr_code_p1, pr_code_p2, pr_code_p3, pr_code_p4, pr_code_final,
  closed_production, shelf_life, closed_technical, box, top_label, bottom_label, web,
  mrp_box, mrp_labels, mrp_films, mrp_sleeves, mrp_cartons, tara_weight, pallet_stacking_plan, box_dimensions,
  closed_mrp, price, lead_time, supplier, proc_shelf_life, closed_procurement,
  done_core, done_planning, done_commercial, done_production, done_technical, done_mrp, done_procurement,
  status_overall, days_to_launch, built, org_id, ext_jsonb, private_jsonb, schema_version,
  model_prediction_id, epcis_event_id, external_id, created_at, created_by_user, created_by_device, app_version,
  allergens, may_contain, deleted_at
from public.product
where deleted_at is null;

grant select on public.fa to app_user;

-- 5b. fa_allergen_cascade — body unchanged; re-issued so its `FROM product` re-binds to the new view.
create or replace view public.fa_allergen_cascade
  with (security_invoker = true)
as
 WITH rm_confirmed AS (
         SELECT p_1.product_code, p_1.org_id, rm.allergen_code
           FROM product p_1
             CROSS JOIN LATERAL regexp_split_to_table(COALESCE(p_1.ingredient_codes, ''::text), '\s*,\s*'::text) parsed(ingredient_code)
             JOIN "Reference"."Allergens_by_RM" rm ON rm.org_id = p_1.org_id AND rm.ingredient_codes = btrim(parsed.ingredient_code) AND rm.confidence = 'confirmed'::text
          WHERE btrim(parsed.ingredient_code) <> ''::text
        ), rm_may_contain AS (
         SELECT p_1.product_code, p_1.org_id, rm.allergen_code
           FROM product p_1
             CROSS JOIN LATERAL regexp_split_to_table(COALESCE(p_1.ingredient_codes, ''::text), '\s*,\s*'::text) parsed(ingredient_code)
             JOIN "Reference"."Allergens_by_RM" rm ON rm.org_id = p_1.org_id AND rm.ingredient_codes = btrim(parsed.ingredient_code) AND (rm.confidence = ANY (ARRAY['may_contain'::text, 'trace'::text]))
          WHERE btrim(parsed.ingredient_code) <> ''::text
        ), process_confirmed AS (
         SELECT DISTINCT pd.product_code, pd.org_id, ap.allergen_code
           FROM prod_detail pd
             CROSS JOIN LATERAL ( VALUES (pd.manufacturing_operation_1),(pd.manufacturing_operation_2),(pd.manufacturing_operation_3),(pd.manufacturing_operation_4)) ops(process_name)
             JOIN "Reference"."Allergens_added_by_Process" ap ON ap.org_id = pd.org_id AND ap.process_name = ops.process_name AND ap.confidence = 'confirmed'::text
          WHERE ops.process_name IS NOT NULL
        ), process_conditional AS (
         SELECT DISTINCT pd.product_code, pd.org_id, ap.allergen_code
           FROM prod_detail pd
             CROSS JOIN LATERAL ( VALUES (pd.manufacturing_operation_1),(pd.manufacturing_operation_2),(pd.manufacturing_operation_3),(pd.manufacturing_operation_4)) ops(process_name)
             JOIN "Reference"."Allergens_added_by_Process" ap ON ap.org_id = pd.org_id AND ap.process_name = ops.process_name AND ap.confidence = 'conditional'::text
          WHERE ops.process_name IS NOT NULL
        ), recipe_confirmed AS (
         SELECT f.product_code, f.org_id, btrim(a.allergen_code) AS allergen_code
           FROM formulations f
             JOIN LATERAL ( SELECT fv.id FROM formulation_versions fv WHERE fv.formulation_id = f.id AND fv.state <> 'draft'::text ORDER BY fv.version_number DESC LIMIT 1) v ON true
             JOIN formulation_ingredients fi ON fi.version_id = v.id
             CROSS JOIN LATERAL unnest(COALESCE(fi.allergens_inherited, '{}'::text[])) a(allergen_code)
          WHERE btrim(COALESCE(a.allergen_code, ''::text)) <> ''::text
        ), confirmed AS (
         SELECT product_code, org_id, allergen_code FROM rm_confirmed
        UNION SELECT product_code, org_id, allergen_code FROM process_confirmed
        UNION SELECT product_code, org_id, allergen_code FROM recipe_confirmed
        ), current_overrides AS (
         SELECT DISTINCT ON (o.org_id, o.product_code, o.allergen_code) o.product_code, o.org_id, o.allergen_code, o.action
           FROM fa_allergen_overrides o
          WHERE o.superseded_at IS NULL
          ORDER BY o.org_id, o.product_code, o.allergen_code, o.created_at DESC, o.id DESC
        ), published_candidates AS (
         SELECT product_code, org_id, allergen_code FROM confirmed
        UNION SELECT product_code, org_id, allergen_code FROM current_overrides WHERE action = 'add'::fa_allergen_override_action
        ), published AS (
         SELECT pc.product_code, pc.org_id, pc.allergen_code
           FROM published_candidates pc
          WHERE NOT (EXISTS ( SELECT 1 FROM current_overrides co
                  WHERE co.org_id = pc.org_id AND co.product_code = pc.product_code AND co.allergen_code = pc.allergen_code AND co.action = 'remove'::fa_allergen_override_action))
        ), may_contain_raw AS (
         SELECT product_code, org_id, allergen_code FROM rm_may_contain
        UNION SELECT product_code, org_id, allergen_code FROM process_conditional
        )
 SELECT p.product_code, p.org_id,
    COALESCE(( SELECT array_agg(DISTINCT c.allergen_code ORDER BY c.allergen_code) FROM confirmed c WHERE c.product_code = p.product_code AND c.org_id = p.org_id), '{}'::text[]) AS derived_allergens,
    COALESCE(( SELECT array_agg(DISTINCT pub.allergen_code ORDER BY pub.allergen_code) FROM published pub WHERE pub.product_code = p.product_code AND pub.org_id = p.org_id), '{}'::text[]) AS published_allergens,
    COALESCE(( SELECT array_agg(DISTINCT mc.allergen_code ORDER BY mc.allergen_code) FROM may_contain_raw mc
          WHERE mc.product_code = p.product_code AND mc.org_id = p.org_id AND NOT (EXISTS ( SELECT 1 FROM published pub2
                  WHERE pub2.org_id = mc.org_id AND pub2.product_code = mc.product_code AND pub2.allergen_code = mc.allergen_code))), '{}'::text[]) AS may_contain_allergens,
    COALESCE(( SELECT array_agg(DISTINCT cp.allergen_code ORDER BY cp.allergen_code) FROM process_conditional cp WHERE cp.product_code = p.product_code AND cp.org_id = p.org_id), '{}'::text[]) AS conditional_process_allergens
   FROM product p;

grant select on public.fa_allergen_cascade to app_user;

-- 5c. fa_status_overall — body unchanged; re-issued so its `FROM product` re-binds to the new view.
create or replace view public.fa_status_overall
  with (security_invoker = true)
as
 WITH computed AS (
         SELECT p.product_code, p.org_id, p.built,
            p.launch_date - CURRENT_DATE AS days_to_launch,
            COALESCE(p.closed_core, ''::text) = 'Yes'::text AS closed_core_yes,
            COALESCE(p.closed_planning, ''::text) = 'Yes'::text AS closed_planning_yes,
            COALESCE(p.closed_commercial, ''::text) = 'Yes'::text AS closed_commercial_yes,
            COALESCE(p.closed_production, ''::text) = 'Yes'::text AS closed_production_yes,
            COALESCE(p.closed_technical, ''::text) = 'Yes'::text AS closed_technical_yes,
            COALESCE(p.closed_mrp, ''::text) = 'Yes'::text AS closed_mrp_yes,
            COALESCE(p.closed_procurement, ''::text) = 'Yes'::text AS closed_procurement_yes,
            is_all_required_filled(p.product_code, 'Core'::text) AS all_core_required,
            is_all_required_filled(p.product_code, 'Planning'::text) AS all_planning_required,
            is_all_required_filled(p.product_code, 'Commercial'::text) AS all_commercial_required,
            is_all_required_filled(p.product_code, 'Production'::text) AS all_production_required,
            is_all_required_filled(p.product_code, 'Technical'::text) AS all_technical_required,
            is_all_required_filled(p.product_code, 'MRP'::text) AS all_mrp_required,
            is_all_required_filled(p.product_code, 'Procurement'::text) AS all_procurement_required
           FROM product p
        ), done AS (
         SELECT computed.*,
            computed.all_core_required AND computed.closed_core_yes AS done_core,
            computed.all_planning_required AND computed.closed_planning_yes AS done_planning,
            computed.all_commercial_required AND computed.closed_commercial_yes AS done_commercial,
            computed.all_production_required AND computed.closed_production_yes AS done_production,
            computed.all_technical_required AND computed.closed_technical_yes AS done_technical,
            computed.all_mrp_required AND computed.closed_mrp_yes AS done_mrp,
            computed.all_procurement_required AND computed.closed_procurement_yes AS done_procurement
           FROM computed
        )
 SELECT product_code, org_id, done_core, done_planning, done_commercial, done_production, done_technical, done_mrp, done_procurement,
        CASE
            WHEN built = true THEN 'Built'::text
            WHEN done_core AND done_planning AND done_commercial AND done_production AND done_technical AND done_mrp AND done_procurement THEN 'Complete'::text
            WHEN days_to_launch <= 10 AND NOT (all_core_required AND all_planning_required AND all_commercial_required AND all_production_required AND all_technical_required AND all_mrp_required AND all_procurement_required) THEN 'Alert'::text
            WHEN closed_core_yes OR closed_planning_yes OR closed_commercial_yes OR closed_production_yes OR closed_technical_yes OR closed_mrp_yes OR closed_procurement_yes THEN 'InProgress'::text
            ELSE 'Pending'::text
        END AS status_overall,
    days_to_launch
   FROM done;

grant select on public.fa_status_overall to app_user;

commit;
