-- Migration 114: T-038 — Allergen cascade ENGINE + fa_allergen_cascade view (NPD-c.2/c.3).
-- PRD: docs/prd/01-NPD-PRD.md §8.5 (cascade rule), §8.6 (manual override), §8.10 (current set).
--
-- WHAT THIS IS
-- The allergen cascade is a DERIVED computation. Two surfaces are produced:
--
--   1. A read-model VIEW (public.fa_allergen_cascade) that, per FG, recomputes the
--      allergen sets on every read from the live sources:
--        - Reference.Allergens_by_RM        (mig 082 / T-036) joined on the FG's
--                                            parsed product.ingredient_codes,
--        - Reference.Allergens_added_by_Process (mig 082) joined on the FG's
--                                            prod_detail.manufacturing_operation_1..4,
--        - public.fa_allergen_overrides     (mig 094 / T-037) — the CURRENT effective set.
--
--   2. A cascade ENGINE function (public.update_fa_allergen_set) that MATERIALIZES the
--      view's computed sets onto the FG row (public.product.allergens / .may_contain) and
--      EMITS the canonical outbox event 'fa.allergens_changed' ONLY when the persisted set
--      actually changes (diff old vs new). Idempotent: re-running with no source change
--      persists nothing new and emits no event.
--
-- DERIVED PRINCIPLE (the LAW): the engine recomputes from RM/process/override sources;
-- users NEVER author product.allergens / product.may_contain directly. Manual overrides
-- (fa_allergen_overrides) are ADDITIVE adjustments to the derived set and NEVER clear or
-- mutate the derived source — the view always exposes derived_allergens (untouched union)
-- alongside published_allergens (derived ∪ override-adds, minus override-removes).
--
-- SET DEFINITIONS
--   confirmed_allergens =  union(
--     Allergens_by_RM        where ingredient code IN parse(product.ingredient_codes)
--                              and confidence = 'confirmed',
--     Allergens_added_by_Process where process_name IN
--                              prod_detail.manufacturing_operation_1..4 (this product)
--                              and confidence = 'confirmed')          -- §8.5: confirmed only
--
--   published_allergens = (confirmed_allergens ∪ overrides[action='add'])
--                            \ overrides[action='remove']             -- persisted to product.allergens
--
--   may_contain_allergens = union(
--     Allergens_by_RM        where confidence IN ('may_contain','trace'),
--     Allergens_added_by_Process where confidence = 'conditional')    -- §8.5: conditional
--                            \ published_allergens                    -- a CONFIRMED allergen is
--                                                                     -- never also "may contain"
--                            -- persisted to product.may_contain
--
-- SAFE CONDITIONAL HANDLING (review finding #3): process rows with confidence='conditional'
-- carry a recipe_condition that this layer does NOT evaluate. They are therefore NOT treated
-- as active/published allergens. They are surfaced SEPARATELY in may_contain_allergens (and
-- the dedicated conditional_process_allergens column) so the precautionary information is not
-- lost, but they never silently enter the published label set.
--
-- READ-ONLY / SECURITY
-- The view is security_invoker=true so RLS on every underlying table is evaluated as the
-- querying role via app.current_org_id(). The engine function is security invoker and scopes
-- every statement to app.current_org_id() — no cross-tenant join is possible and no literal
-- org_id is ever referenced. app_user is granted SELECT on the view and EXECUTE on the engine.
--
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id()
-- (NEVER raw current_setting).

-- ---------------------------------------------------------------------------
-- 1. product allergen columns (engine write-back target; org-scoped via existing
--    product RLS policy product_org_context). Derived-only: never user-authored.
-- ---------------------------------------------------------------------------
alter table public.product
  add column if not exists allergens text[] not null default '{}'::text[];
alter table public.product
  add column if not exists may_contain text[] not null default '{}'::text[];

comment on column public.product.allergens is
  'T-038: DERIVED published allergen set (confirmed RM ∪ confirmed process, override-adjusted). Materialized by public.update_fa_allergen_set — never user-authored.';
comment on column public.product.may_contain is
  'T-038: DERIVED precautionary allergen set (RM may_contain/trace ∪ conditional process), minus confirmed allergens. Materialized by public.update_fa_allergen_set — never user-authored.';

-- ---------------------------------------------------------------------------
-- 2. read-model view: recompute all three sets per FG on every read.
-- ---------------------------------------------------------------------------
create or replace view public.fa_allergen_cascade
  with (security_invoker = true)
as
with
-- RM-level CONFIRMED allergens, joined per FG via the parsed ingredient_codes list.
rm_confirmed as (
  select p.product_code, p.org_id, rm.allergen_code
  from public.product p
  cross join lateral pg_catalog.regexp_split_to_table(
    coalesce(p.ingredient_codes, ''), '\s*,\s*'
  ) as parsed(ingredient_code)
  join "Reference"."Allergens_by_RM" rm
    on rm.org_id = p.org_id
   and rm.ingredient_codes = pg_catalog.btrim(parsed.ingredient_code)
   and rm.confidence = 'confirmed'
  where pg_catalog.btrim(parsed.ingredient_code) <> ''
),
-- RM-level MAY-CONTAIN / TRACE allergens (precautionary, never published as confirmed).
rm_may_contain as (
  select p.product_code, p.org_id, rm.allergen_code
  from public.product p
  cross join lateral pg_catalog.regexp_split_to_table(
    coalesce(p.ingredient_codes, ''), '\s*,\s*'
  ) as parsed(ingredient_code)
  join "Reference"."Allergens_by_RM" rm
    on rm.org_id = p.org_id
   and rm.ingredient_codes = pg_catalog.btrim(parsed.ingredient_code)
   and rm.confidence in ('may_contain', 'trace')
  where pg_catalog.btrim(parsed.ingredient_code) <> ''
),
-- Process-level CONFIRMED allergens from manufacturing_operation_1..4.
process_confirmed as (
  select distinct pd.product_code, pd.org_id, ap.allergen_code
  from public.prod_detail pd
  cross join lateral (
    values
      (pd.manufacturing_operation_1),
      (pd.manufacturing_operation_2),
      (pd.manufacturing_operation_3),
      (pd.manufacturing_operation_4)
  ) as ops(process_name)
  join "Reference"."Allergens_added_by_Process" ap
    on ap.org_id = pd.org_id
   and ap.process_name = ops.process_name
   and ap.confidence = 'confirmed'
  where ops.process_name is not null
),
-- Process-level CONDITIONAL allergens (recipe_condition NOT evaluated here → precautionary).
process_conditional as (
  select distinct pd.product_code, pd.org_id, ap.allergen_code
  from public.prod_detail pd
  cross join lateral (
    values
      (pd.manufacturing_operation_1),
      (pd.manufacturing_operation_2),
      (pd.manufacturing_operation_3),
      (pd.manufacturing_operation_4)
  ) as ops(process_name)
  join "Reference"."Allergens_added_by_Process" ap
    on ap.org_id = pd.org_id
   and ap.process_name = ops.process_name
   and ap.confidence = 'conditional'
  where ops.process_name is not null
),
-- Derived CONFIRMED set = union(RM confirmed, process confirmed), deduped.
confirmed as (
  select product_code, org_id, allergen_code from rm_confirmed
  union
  select product_code, org_id, allergen_code from process_confirmed
),
-- Current effective override set (§8.10: superseded_at IS NULL; latest current row wins).
current_overrides as (
  select distinct on (o.org_id, o.product_code, o.allergen_code)
    o.product_code, o.org_id, o.allergen_code, o.action
  from public.fa_allergen_overrides o
  where o.superseded_at is null
  order by o.org_id, o.product_code, o.allergen_code, o.created_at desc, o.id desc
),
-- Published set = (confirmed ∪ adds) minus removes.
published_candidates as (
  select product_code, org_id, allergen_code from confirmed
  union
  select product_code, org_id, allergen_code from current_overrides where action = 'add'
),
published as (
  select pc.product_code, pc.org_id, pc.allergen_code
  from published_candidates pc
  where not exists (
    select 1 from current_overrides co
    where co.org_id = pc.org_id
      and co.product_code = pc.product_code
      and co.allergen_code = pc.allergen_code
      and co.action = 'remove'
  )
),
-- May-contain set = union(RM may_contain/trace, process conditional), deduped.
may_contain_raw as (
  select product_code, org_id, allergen_code from rm_may_contain
  union
  select product_code, org_id, allergen_code from process_conditional
)
select
  p.product_code,
  p.org_id,
  -- derived (confirmed) union, untouched by overrides
  coalesce(
    (select pg_catalog.array_agg(distinct c.allergen_code order by c.allergen_code)
       from confirmed c
      where c.product_code = p.product_code and c.org_id = p.org_id),
    '{}'::text[]
  ) as derived_allergens,
  -- published (overrides applied last) — this is what is persisted to product.allergens
  coalesce(
    (select pg_catalog.array_agg(distinct pub.allergen_code order by pub.allergen_code)
       from published pub
      where pub.product_code = p.product_code and pub.org_id = p.org_id),
    '{}'::text[]
  ) as published_allergens,
  -- may_contain, minus anything that is a confirmed published allergen for this FG
  coalesce(
    (select pg_catalog.array_agg(distinct mc.allergen_code order by mc.allergen_code)
       from may_contain_raw mc
      where mc.product_code = p.product_code and mc.org_id = p.org_id
        and not exists (
          select 1 from published pub2
          where pub2.org_id = mc.org_id
            and pub2.product_code = mc.product_code
            and pub2.allergen_code = mc.allergen_code
        )),
    '{}'::text[]
  ) as may_contain_allergens,
  -- conditional process allergens surfaced separately (recipe_condition unevaluated)
  coalesce(
    (select pg_catalog.array_agg(distinct cp.allergen_code order by cp.allergen_code)
       from process_conditional cp
      where cp.product_code = p.product_code and cp.org_id = p.org_id),
    '{}'::text[]
  ) as conditional_process_allergens
from public.product p;

comment on view public.fa_allergen_cascade is
  'T-038: derived allergen cascade read-model per FG. derived_allergens = union(confirmed RM, confirmed process); published_allergens applies current fa_allergen_overrides additively (add/remove) without mutating the derived source; may_contain_allergens = union(RM may_contain/trace, conditional process) minus confirmed; conditional_process_allergens surfaced separately (recipe_condition NOT evaluated → never silently published). security_invoker=true; org-scoped via underlying RLS (app.current_org_id()).';

revoke all on public.fa_allergen_cascade from public;
grant select on public.fa_allergen_cascade to app_user;

-- ---------------------------------------------------------------------------
-- 3. cascade ENGINE: materialize the computed sets onto product + emit event
--    only on change. security invoker; org-scoped via app.current_org_id().
-- ---------------------------------------------------------------------------
create or replace function public.update_fa_allergen_set(p_product_code text)
returns table (
  product_code text,
  allergens text[],
  may_contain text[],
  changed boolean
)
language plpgsql
security invoker
as $$
declare
  v_org_id uuid := app.current_org_id();
  v_old_allergens text[];
  v_old_may_contain text[];
  v_new_allergens text[];
  v_new_may_contain text[];
  v_changed boolean := false;
begin
  if v_org_id is null then
    raise exception 'update_fa_allergen_set requires an org context (app.current_org_id())';
  end if;

  -- Lock the FG row for this org; fail loudly if it is not visible/owned.
  select coalesce(prod.allergens, '{}'::text[]), coalesce(prod.may_contain, '{}'::text[])
    into v_old_allergens, v_old_may_contain
  from public.product prod
  where prod.product_code = p_product_code
    and prod.org_id = v_org_id
  for update;

  if not found then
    raise exception 'update_fa_allergen_set: product % not found in current org', p_product_code;
  end if;

  -- Recompute from the read-model (already org-scoped via security_invoker + RLS).
  select
    coalesce(casc.published_allergens, '{}'::text[]),
    coalesce(casc.may_contain_allergens, '{}'::text[])
    into v_new_allergens, v_new_may_contain
  from public.fa_allergen_cascade casc
  where casc.product_code = p_product_code
    and casc.org_id = v_org_id;

  v_new_allergens := coalesce(v_new_allergens, '{}'::text[]);
  v_new_may_contain := coalesce(v_new_may_contain, '{}'::text[]);

  -- Diff old vs new (order-independent set comparison). text[] equality after sort.
  v_changed := (
    (select coalesce(pg_catalog.array_agg(a order by a), '{}'::text[])
       from unnest(v_old_allergens) a)
      is distinct from
    (select coalesce(pg_catalog.array_agg(a order by a), '{}'::text[])
       from unnest(v_new_allergens) a)
  ) or (
    (select coalesce(pg_catalog.array_agg(m order by m), '{}'::text[])
       from unnest(v_old_may_contain) m)
      is distinct from
    (select coalesce(pg_catalog.array_agg(m order by m), '{}'::text[])
       from unnest(v_new_may_contain) m)
  );

  if v_changed then
    -- Persist normalized (sorted, deduped) sets onto the FG row.
    update public.product prod
       set allergens = (select coalesce(pg_catalog.array_agg(distinct a order by a), '{}'::text[])
                          from unnest(v_new_allergens) a),
           may_contain = (select coalesce(pg_catalog.array_agg(distinct m order by m), '{}'::text[])
                            from unnest(v_new_may_contain) m)
     where prod.product_code = p_product_code
       and prod.org_id = v_org_id;

    -- Emit the canonical change event ONLY when the set actually changed.
    insert into public.outbox_events
      (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
    values (
      v_org_id,
      'fa.allergens_changed',
      'fa',
      p_product_code,
      jsonb_build_object(
        'product_code', p_product_code,
        'allergens', pg_catalog.to_jsonb(v_new_allergens),
        'may_contain', pg_catalog.to_jsonb(v_new_may_contain),
        'previous_allergens', pg_catalog.to_jsonb(v_old_allergens),
        'previous_may_contain', pg_catalog.to_jsonb(v_old_may_contain)
      ),
      'db-114'
    );
  end if;

  return query
  select prod.product_code, prod.allergens, prod.may_contain, v_changed
  from public.product prod
  where prod.product_code = p_product_code
    and prod.org_id = v_org_id;
end;
$$;

comment on function public.update_fa_allergen_set(text) is
  'T-038 cascade engine: recomputes the derived allergen set for a FG from RM/process/override sources (via fa_allergen_cascade), materializes published_allergens→product.allergens and may_contain_allergens→product.may_contain, and emits outbox fa.allergens_changed ONLY when the persisted set changes. Idempotent: no-op + no event when unchanged. security invoker, org-scoped via app.current_org_id().';

revoke all on function public.update_fa_allergen_set(text) from public;
grant execute on function public.update_fa_allergen_set(text) to app_user;
