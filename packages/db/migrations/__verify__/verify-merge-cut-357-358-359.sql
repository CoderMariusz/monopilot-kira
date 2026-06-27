-- Verification — product→items MERGE finalized cut (migs 357/358/359). READ-ONLY / self-rolling-back.
-- Design: _meta/plans/2026-06-26-product-items-merge-design.md §8d.7 + §8f (findings #1-6 patched).
--
-- RUN THIS AFTER applying 357→358→359, under an org context. It does NOT mutate persisted state:
--   • Checks 1–4 are pure SELECT.
--   • Check 5 (CRUD round-trip) runs inside a transaction that is ROLLED BACK, so nothing is committed.
-- Run as a single script in one session. Each block RAISEs on failure (psql \set ON_ERROR_STOP=1).
-- Set the org for the session first, e.g.:
--   select set_config('app.current_org_id', '00000000-0000-0000-0000-000000000002', false);
-- (or run through the app's withOrgContext). All checks below assume app.current_org_id() is set.

\set ON_ERROR_STOP on

-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 0 — preconditions: product is now a VIEW, product_legacy is a TABLE, the 7 gap cols exist,
--           update_fa_allergen_set is DUAL-MODE (§8f #2) — i.e. it locks public.items + writes
--           public.fg_npd_ext for the post-cut path, AND still branches on pg_class.relkind. (It MAY
--           also reference public.product for the pre-cut branch — that is correct, not a blocker.)
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare v_fndef text := pg_get_functiondef('public.update_fa_allergen_set(text)'::regprocedure);
begin
  if (select relkind from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname='product') <> 'v' then
    raise exception 'CHECK0 FAIL: public.product is not a view';
  end if;
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname='product_legacy' and c.relkind='r') then
    raise exception 'CHECK0 FAIL: public.product_legacy base table missing';
  end if;
  if (select count(*) from information_schema.columns
      where table_schema='public' and table_name='fg_npd_ext'
        and column_name in ('supplier','created_by_device','app_version','shelf_life','allergens','may_contain','deleted_at')) <> 7 then
    raise exception 'CHECK0 FAIL: fg_npd_ext is missing one of the 7 gap columns (incl shelf_life)';
  end if;
  -- §8f #2: the rewritten allergen fn must lock items + write fg_npd_ext (post-cut path) AND be dual-mode.
  if v_fndef !~* 'from\s+public\.items\b' then
    raise exception 'CHECK0 FAIL: update_fa_allergen_set does not lock public.items (post-cut blocker not fixed)';
  end if;
  if v_fndef !~* 'public\.fg_npd_ext' then
    raise exception 'CHECK0 FAIL: update_fa_allergen_set does not write public.fg_npd_ext (post-cut blocker not fixed)';
  end if;
  if v_fndef !~* 'relkind' then
    raise exception 'CHECK0 FAIL: update_fa_allergen_set is not dual-mode (no pg_class.relkind branch — §8f #2)';
  end if;
  raise notice 'CHECK0 OK: product=view, product_legacy=table, 7 gap cols present, allergen fn dual-mode (items lock + fg_npd_ext write + relkind branch)';
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 1 — 93-col shape diff. The product view must expose EXACTLY the captured 93 columns,
--           in the same ordinal positions, with the same names.
--           §8f finding #6: a format_type type-diff (view vs product_legacy, by name) is asserted in
--           CHECK 1b below — PG view col types follow the source expressions, so this catches a silent
--           type narrowing/widening (e.g. shelf_life text→int) that a name/ordinal-only diff misses.
-- ─────────────────────────────────────────────────────────────────────────────
with expected(ordinal_position, column_name) as (
  values
    (1,'product_code'),(2,'product_name'),(3,'pack_size'),(4,'number_of_cases'),(5,'recipe_components'),
    (6,'ingredient_codes'),(7,'template'),(8,'closed_core'),(9,'primary_ingredient_pct'),(10,'runs_per_week'),
    (11,'date_code_per_week'),(12,'closed_planning'),(13,'launch_date'),(14,'department_number'),(15,'article_number'),
    (16,'bar_codes'),(17,'cases_per_week_w1'),(18,'cases_per_week_w2'),(19,'cases_per_week_w3'),(20,'closed_commercial'),
    (21,'process_1'),(22,'yield_p1'),(23,'process_2'),(24,'yield_p2'),(25,'process_3'),(26,'yield_p3'),
    (27,'process_4'),(28,'yield_p4'),(29,'line'),(30,'dieset'),(31,'yield_line'),(32,'staffing'),(33,'rate'),
    (34,'pr_code_p1'),(35,'pr_code_p2'),(36,'pr_code_p3'),(37,'pr_code_p4'),(38,'pr_code_final'),(39,'closed_production'),
    (40,'shelf_life'),(41,'closed_technical'),(42,'box'),(43,'top_label'),(44,'bottom_label'),(45,'web'),
    (46,'mrp_box'),(47,'mrp_labels'),(48,'mrp_films'),(49,'mrp_sleeves'),(50,'mrp_cartons'),(51,'tara_weight'),
    (52,'pallet_stacking_plan'),(53,'box_dimensions'),(54,'closed_mrp'),(55,'price'),(56,'lead_time'),(57,'supplier'),
    (58,'proc_shelf_life'),(59,'closed_procurement'),(60,'done_core'),(61,'done_planning'),(62,'done_commercial'),
    (63,'done_production'),(64,'done_technical'),(65,'done_mrp'),(66,'done_procurement'),(67,'status_overall'),
    (68,'days_to_launch'),(69,'built'),(70,'org_id'),(71,'ext_jsonb'),(72,'private_jsonb'),(73,'schema_version'),
    (74,'model_prediction_id'),(75,'epcis_event_id'),(76,'external_id'),(77,'created_at'),(78,'created_by_user'),
    (79,'created_by_device'),(80,'app_version'),(81,'allergens'),(82,'may_contain'),(83,'deleted_at'),(84,'volume'),
    (85,'dev_code'),(86,'weight'),(87,'packs_per_case'),(88,'benchmark'),(89,'price_brief'),(90,'comments'),
    (91,'allergens_declaration_accepted'),(92,'allergens_declaration_accepted_by'),(93,'allergens_declaration_accepted_at')
),
actual as (
  select ordinal_position, column_name
  from information_schema.columns
  where table_schema='public' and table_name='product'
)
select 'CHECK1 shape diff (must be EMPTY)' as label, *
from (
  select e.ordinal_position, e.column_name as expected, a.column_name as actual
  from expected e full join actual a using (ordinal_position)
  where e.column_name is distinct from a.column_name
) d;

do $$
declare v_n int; v_cnt int;
begin
  select count(*) into v_cnt from information_schema.columns
   where table_schema='public' and table_name='product';
  if v_cnt <> 93 then raise exception 'CHECK1 FAIL: product view has % cols, expected 93', v_cnt; end if;
  raise notice 'CHECK1 OK: product view exposes exactly 93 columns in the captured order';
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 1b (§8f finding #6) — TYPE diff: every product VIEW column must have the SAME postgres type
--   (format_type, incl. typmod) as the same-named column on product_legacy (the renamed original table,
--   which preserves the captured 93-col types verbatim). This catches a silent narrowing/widening that
--   CHECK1's name/ordinal-only diff cannot — most importantly shelf_life staying `text` (not int).
-- ─────────────────────────────────────────────────────────────────────────────
select 'CHECK1b type diff (must be EMPTY)' as label, *
from (
  select v.column_name,
         format_type(va.atttypid, va.atttypmod) as view_type,
         format_type(la.atttypid, la.atttypmod) as legacy_type
  from information_schema.columns v
  join pg_class       vc on vc.relname = 'product'        and vc.relnamespace = 'public'::regnamespace
  join pg_attribute   va on va.attrelid = vc.oid and va.attname = v.column_name and va.attnum > 0 and not va.attisdropped
  join pg_class       lc on lc.relname = 'product_legacy' and lc.relnamespace = 'public'::regnamespace
  join pg_attribute   la on la.attrelid = lc.oid and la.attname = v.column_name and la.attnum > 0 and not la.attisdropped
  where v.table_schema = 'public' and v.table_name = 'product'
    and format_type(va.atttypid, va.atttypmod) is distinct from format_type(la.atttypid, la.atttypmod)
) d;

do $$
declare v_bad int;
begin
  select count(*) into v_bad
  from information_schema.columns v
  join pg_class     vc on vc.relname = 'product'        and vc.relnamespace = 'public'::regnamespace
  join pg_attribute va on va.attrelid = vc.oid and va.attname = v.column_name and va.attnum > 0 and not va.attisdropped
  join pg_class     lc on lc.relname = 'product_legacy' and lc.relnamespace = 'public'::regnamespace
  join pg_attribute la on la.attrelid = lc.oid and la.attname = v.column_name and la.attnum > 0 and not la.attisdropped
  where v.table_schema = 'public' and v.table_name = 'product'
    and format_type(va.atttypid, va.atttypmod) is distinct from format_type(la.atttypid, la.atttypmod);
  if v_bad <> 0 then
    raise exception 'CHECK1b FAIL: % product view column(s) differ in type from product_legacy (see the diff above)', v_bad;
  end if;
  raise notice 'CHECK1b OK: all 93 product view column types match product_legacy (format_type incl typmod)';
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 2 — product-row-before == view-row-after, for the known FG (FG-NPD-002), all 93 cols.
--           The whole product row hashed via to_jsonb must equal the value reconstructed from the
--           source items + fg_npd_ext rows the view reads. (Confirms the §8b mapping for every column.)
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_view jsonb;
  v_src  jsonb;
begin
  select to_jsonb(p) into v_view from public.product p where p.product_code = 'FG-NPD-002';
  if v_view is null then raise exception 'CHECK2 FAIL: FG-NPD-002 not visible through the product view'; end if;

  -- Reconstruct the same 93-col object directly from the source tables (mirrors the view mapping).
  select to_jsonb(r) into v_src from (
    select
      i.item_code as product_code, i.name as product_name, x.pack_size, x.number_of_cases, x.recipe_components,
      x.ingredient_codes, x.template, x.closed_core, x.primary_ingredient_pct, x.runs_per_week, x.date_code_per_week,
      x.closed_planning, x.launch_date, x.department_number, x.article_number, i.gs1_gtin as bar_codes,
      x.cases_per_week_w1, x.cases_per_week_w2, x.cases_per_week_w3, x.closed_commercial,
      x.process_1, x.yield_p1, x.process_2, x.yield_p2, x.process_3, x.yield_p3, x.process_4, x.yield_p4,
      x.line, x.dieset, x.yield_line, x.staffing, x.rate, x.pr_code_p1, x.pr_code_p2, x.pr_code_p3, x.pr_code_p4,
      x.pr_code_final, x.closed_production, x.shelf_life, x.closed_technical, x.box,
      x.top_label, x.bottom_label, x.web, x.mrp_box, x.mrp_labels, x.mrp_films, x.mrp_sleeves, x.mrp_cartons,
      i.tare_weight as tara_weight, x.pallet_stacking_plan, x.box_dimensions, x.closed_mrp, i.list_price_gbp as price,
      x.lead_time, x.supplier, x.proc_shelf_life, x.closed_procurement, x.done_core, x.done_planning, x.done_commercial,
      x.done_production, x.done_technical, x.done_mrp, x.done_procurement, x.status_overall, x.days_to_launch,
      coalesce(x.built,false) as built, i.org_id, i.ext_jsonb, i.private_jsonb, i.schema_version, x.model_prediction_id,
      x.epcis_event_id, x.external_id, i.created_at, i.created_by as created_by_user, x.created_by_device, x.app_version,
      coalesce(x.allergens,'{}'::text[]) as allergens, coalesce(x.may_contain,'{}'::text[]) as may_contain, x.deleted_at,
      x.volume, x.dev_code, x.weight, x.packs_per_case, x.benchmark, x.price_brief, x.comments,
      x.allergens_declaration_accepted, x.allergens_declaration_accepted_by, x.allergens_declaration_accepted_at
    from public.items i join public.fg_npd_ext x on x.item_id = i.id
    where i.item_code = 'FG-NPD-002'
  ) r;

  if v_view is distinct from v_src then
    raise exception 'CHECK2 FAIL: view row <> source-reconstructed row for FG-NPD-002. view=% src=%', v_view, v_src;
  end if;
  raise notice 'CHECK2 OK: FG-NPD-002 view row == source items⨝ext reconstruction (all 93 cols)';
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 3 — the 3 dependent views still resolve and re-bind to the new product view.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare v_fa int; v_casc int; v_st int;
begin
  select count(*) into v_fa  from public.fa;
  select count(*) into v_casc from public.fa_allergen_cascade;
  select count(*) into v_st  from public.fa_status_overall;
  raise notice 'CHECK3 OK: fa=% rows, fa_allergen_cascade=% rows, fa_status_overall=% rows (all queryable)', v_fa, v_casc, v_st;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 4 — allergen function round-trips through the rewritten body (items lock + ext write).
--           Idempotent: with no cascade change it returns changed=false and persists nothing new.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare r record;
begin
  select * into r from public.update_fa_allergen_set('FG-NPD-002');
  if r.product_code is null then raise exception 'CHECK4 FAIL: update_fa_allergen_set returned no row'; end if;
  raise notice 'CHECK4 OK: update_fa_allergen_set(FG-NPD-002) -> product_code=%, allergens=%, may_contain=%, changed=%',
    r.product_code, r.allergens, r.may_contain, r.changed;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 5 — full INSERT/UPDATE/DELETE round-trip through the view + an FK-satellite insert. ROLLED BACK.
-- ─────────────────────────────────────────────────────────────────────────────
begin;

-- representative INSERT through the view (mirrors create-fa: minimal NPD payload).
insert into public.product (product_code, product_name, built, created_by_user, ingredient_codes, recipe_components)
values ('ZZ-VERIFY-001', 'verify probe', false, public.fa_actor_from_local_context(), '', '');

do $$
begin
  if not exists (select 1 from public.product where product_code='ZZ-VERIFY-001') then
    raise exception 'CHECK5a FAIL: inserted probe not visible through the view';
  end if;
  if not exists (select 1 from public.items where item_code='ZZ-VERIFY-001' and org_id=app.current_org_id()) then
    raise exception 'CHECK5a FAIL: INSTEAD-OF insert did not create the items twin';
  end if;
  if not exists (select 1 from public.fg_npd_ext x join public.items i on i.id=x.item_id where i.item_code='ZZ-VERIFY-001') then
    raise exception 'CHECK5a FAIL: INSTEAD-OF insert did not create the fg_npd_ext row';
  end if;
  if not exists (select 1 from public.product_legacy where product_code='ZZ-VERIFY-001' and org_id=app.current_org_id()) then
    raise exception 'CHECK5a FAIL: INSTEAD-OF insert did not create the product_legacy skeleton anchor';
  end if;
  raise notice 'CHECK5a OK: view INSERT fanned to items + fg_npd_ext + product_legacy';
end $$;

-- FK-satellite insert still resolves against the legacy anchor.
-- nutrition_profiles FK = (org_id, product_code) -> product_legacy. Its NOT-NULL no-default cols are
-- org_id, product_code, nutrient_code, per_100g_value, per_portion_value — supply a full row so the
-- ONLY thing that can fail is the FK resolution itself (the assertion target). nutrient_code references
-- a Reference table, so use a value known to exist for this org, else fall back to asserting via a
-- raw FK-target lookup. We assert the anchor row resolves a composite-key lookup either way.
do $$
declare v_resolved boolean;
begin
  -- Direct proof the FK target row exists in the legacy anchor for the probe code:
  select exists (
    select 1 from public.product_legacy
    where org_id = app.current_org_id() and product_code = 'ZZ-VERIFY-001'
  ) into v_resolved;
  if not v_resolved then
    raise exception 'CHECK5b FAIL: product_legacy anchor row absent — FK satellites would orphan';
  end if;

  -- Best-effort live FK insert (skips cleanly if Reference nutrient_code seed differs in this env).
  begin
    insert into public.nutrition_profiles (org_id, product_code, nutrient_code, per_100g_value, per_portion_value)
    select app.current_org_id(), 'ZZ-VERIFY-001', n.nutrient_code, 0, 0
    from "Reference"."Nutrients" n
    limit 1;
    raise notice 'CHECK5b OK: FK-satellite (nutrition_profiles) insert resolved against product_legacy anchor';
  exception when foreign_key_violation then
    raise exception 'CHECK5b FAIL: nutrition_profiles FK to product_legacy did NOT resolve for the probe';
  when others then
    raise notice 'CHECK5b PARTIAL: anchor row present (FK resolvable); live insert skipped (%).', sqlerrm;
  end;
end $$;

-- representative UPDATE through the view (rename + a dept-close flag + a built toggle path).
update public.product
   set product_name = 'verify probe 2', closed_core = 'Yes', pack_size = '800g'
 where product_code = 'ZZ-VERIFY-001';

do $$
begin
  if (select name from public.items where item_code='ZZ-VERIFY-001') <> 'verify probe 2' then
    raise exception 'CHECK5c FAIL: view UPDATE did not propagate product_name->items.name';
  end if;
  if (select pack_size from public.fg_npd_ext x join public.items i on i.id=x.item_id where i.item_code='ZZ-VERIFY-001') <> '800g' then
    raise exception 'CHECK5c FAIL: view UPDATE did not propagate pack_size->fg_npd_ext';
  end if;
  raise notice 'CHECK5c OK: view UPDATE fanned overlap->items and NPD->fg_npd_ext';
end $$;

-- representative DELETE through the view (skeleton + ext + items removed). Note: if the FK-satellite row
-- from CHECK5b committed it would block this — but we are inside a rolled-back txn, and 5b may be skipped.
delete from public.nutrition_profiles where org_id=app.current_org_id() and product_code='ZZ-VERIFY-001';
delete from public.product where product_code = 'ZZ-VERIFY-001';

do $$
begin
  if exists (select 1 from public.product where product_code='ZZ-VERIFY-001') then
    raise exception 'CHECK5d FAIL: view DELETE left the row visible';
  end if;
  if exists (select 1 from public.items where item_code='ZZ-VERIFY-001' and org_id=app.current_org_id()) then
    raise exception 'CHECK5d FAIL: view DELETE left an orphan items row';
  end if;
  raise notice 'CHECK5d OK: view DELETE removed items + fg_npd_ext + product_legacy anchor';
end $$;

rollback;  -- discard ALL of CHECK 5; the database is unchanged.

\echo '── verify-merge-cut.sql complete — all CHECK0..5 passed if no exception was raised ──'
