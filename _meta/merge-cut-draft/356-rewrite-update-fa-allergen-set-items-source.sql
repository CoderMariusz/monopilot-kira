-- Migration 356 — product→items MERGE, finalized-cut step 2 (§8c BLOCKER fix, §8d.2).
-- Design: _meta/plans/2026-06-26-product-items-merge-design.md §8c.
--
-- THE BLOCKER: once public.product becomes a VIEW with INSTEAD-OF triggers (mig 357), the regulatory
-- allergen function update_fa_allergen_set() breaks two ways:
--   (1) `SELECT … FROM public.product … FOR UPDATE` raises "cannot lock rows in a view";
--   (2) `UPDATE public.product SET allergens=…, may_contain=…` must be re-routed, since those two columns
--       now physically live in public.fg_npd_ext (added in mig 355), not on a base product table.
-- FIX: rewrite the function to LOCK public.items (the real base row, by org_id+item_code) and to
--      read/write allergens & may_contain on public.fg_npd_ext. Everything else is byte-for-byte preserved:
--        • RETURN shape: TABLE(product_code text, allergens text[], may_contain text[], changed boolean)
--        • the fa_allergen_cascade recompute (still org-scoped, read-only, view-transparent)
--        • the sorted/deduped normalization of the persisted sets
--        • the order-independent "changed" diff
--        • the `fa.allergens_changed` outbox emit (same payload, only on real change)
--        • org-scope guard (app.current_org_id() required)
--
-- ORDERING: this ships + is verified on LIVE *before* mig 357 (the view cut), as its own reviewed step.
-- At 356-time public.product is still a TABLE — but this function no longer touches it, so it is correct
-- both before AND after the cut. fa_allergen_cascade is read-only and re-binds transparently in mig 357.
-- The p_product_code argument is the items.item_code / fg twin code (identical today; the alias rename
-- is a later phase, §3/P4, out of scope here).
--
-- Rollback: re-create the product-sourced body from mig 345's definition (kept in git history). NOTE: that
-- rollback is only safe BEFORE mig 357 — after the view cut, the product-sourced version is broken (the
-- blocker), so do NOT roll 356 back without also rolling back 357.

create or replace function public.update_fa_allergen_set(p_product_code text)
  returns table(product_code text, allergens text[], may_contain text[], changed boolean)
  language plpgsql
as $function$
declare
  v_org_id uuid := app.current_org_id();
  v_item_id uuid;
  v_old_allergens text[];
  v_old_may_contain text[];
  v_new_allergens text[];
  v_new_may_contain text[];
  v_changed boolean := false;
begin
  if v_org_id is null then
    raise exception 'update_fa_allergen_set requires an org context (app.current_org_id())';
  end if;

  -- Lock the FG row for this org on the REAL base table (items), not the product view.
  -- This replaces the old `… FROM public.product … FOR UPDATE` (which cannot lock a view).
  select i.id
    into v_item_id
  from public.items i
  where i.item_code = p_product_code
    and i.org_id = v_org_id
  for update;

  if not found then
    raise exception 'update_fa_allergen_set: product % not found in current org', p_product_code;
  end if;

  -- Current persisted sets now live on fg_npd_ext (mig 355). Lock that row too so the read-modify-write
  -- is serialized per FG (mirrors the original single-row FOR UPDATE intent).
  select coalesce(x.allergens, '{}'::text[]), coalesce(x.may_contain, '{}'::text[])
    into v_old_allergens, v_old_may_contain
  from public.fg_npd_ext x
  where x.item_id = v_item_id
  for update;

  if not found then
    -- Defensive: an FG with no ext row (should not happen post-backfill). Treat as empty current sets.
    v_old_allergens := '{}'::text[];
    v_old_may_contain := '{}'::text[];
  end if;

  -- Recompute from the read-model (already org-scoped via security_invoker + RLS).
  -- fa_allergen_cascade is read-only and view-transparent — unchanged by the merge.
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
    -- Persist normalized (sorted, deduped) sets onto the FG extension row.
    update public.fg_npd_ext x
       set allergens = (select coalesce(pg_catalog.array_agg(distinct a order by a), '{}'::text[])
                          from unnest(v_new_allergens) a),
           may_contain = (select coalesce(pg_catalog.array_agg(distinct m order by m), '{}'::text[])
                            from unnest(v_new_may_contain) m),
           updated_at = now()
     where x.item_id = v_item_id;

    -- Emit the canonical change event ONLY when the set actually changed (unchanged payload contract).
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

  -- Same return shape, now sourced from items (code) ⨝ fg_npd_ext (allergen sets).
  return query
  select i.item_code, coalesce(x.allergens, '{}'::text[]), coalesce(x.may_contain, '{}'::text[]), v_changed
  from public.items i
  left join public.fg_npd_ext x on x.item_id = i.id
  where i.id = v_item_id;
end;
$function$;
