-- Migration 358 — product→items MERGE, finalized-cut step 2 (§8c BLOCKER fix, §8d.2).
-- Design: _meta/plans/2026-06-26-product-items-merge-design.md §8c + §8f finding #2.
-- (Renumbered 356→358 for the supervised apply: live mig HEAD = 355, RBAC seed took 356.)
--
-- THE BLOCKER: once public.product becomes a VIEW with INSTEAD-OF triggers (mig 359), the regulatory
-- allergen function update_fa_allergen_set() breaks two ways:
--   (1) `SELECT … FROM public.product … FOR UPDATE` raises "cannot lock rows in a view";
--   (2) `UPDATE public.product SET allergens=…, may_contain=…` must be re-routed, since those two columns
--       now physically live in public.fg_npd_ext (added in mig 357), not on a base product table.
--
-- §8f finding #2 (DUAL-MODE, the fix): mig 358 ships + is verified BEFORE mig 359. During that pre-cut
-- window public.product is STILL A TABLE, and the legacy FA-create path (`(npd)/fa/actions/create-fa.ts`)
-- inserts ONLY into public.product (no items/ext twin yet) — its AFTER-INSERT trigger then calls this fn.
-- If the rewrite locked items/ext unconditionally it would raise "product % not found" for that pre-cut
-- insert (the items twin does not exist yet). So this function is DUAL-MODE:
--   • PRE-CUT  (public.product is a TABLE — the items/ext twin may be absent): lock the product row
--     (`… FROM public.product … FOR UPDATE`, valid on a table) and read/write allergens/may_contain there.
--   • POST-CUT (public.product is a VIEW): lock public.items (the real base row, by org_id+item_code) and
--     read/write allergens/may_contain on public.fg_npd_ext.
-- The branch is chosen at runtime from pg_class.relkind of public.product ('r' = table → pre-cut;
-- 'v' = view → post-cut), so the SAME function body is correct across the 358→359 boundary with no
-- re-deploy. Everything else is byte-for-byte preserved:
--        • RETURN shape: TABLE(product_code text, allergens text[], may_contain text[], changed boolean)
--        • the fa_allergen_cascade recompute (still org-scoped, read-only, view-transparent)
--        • the sorted/deduped normalization of the persisted sets
--        • the order-independent "changed" diff
--        • the `fa.allergens_changed` outbox emit (same payload, only on real change)
--        • org-scope guard (app.current_org_id() required)
--
-- ORDERING: this ships + is verified on LIVE *before* mig 359 (the view cut), as its own reviewed step.
-- fa_allergen_cascade is read-only and re-binds transparently in mig 359 (it reads `product`, table or view).
-- The p_product_code argument is the items.item_code / fg twin code / product.product_code (identical today;
-- the alias rename is a later phase, §3/P4, out of scope here).
--
-- Rollback: re-create the product-sourced body from mig 345's definition (kept in git history). NOTE: that
-- rollback is only safe BEFORE mig 359 — after the view cut, the product-sourced version is broken (the
-- blocker), so do NOT roll 358 back without also rolling back 359. The dual-mode body here is itself a safe
-- rollback target both before and after 359.

create or replace function public.update_fa_allergen_set(p_product_code text)
  returns table(product_code text, allergens text[], may_contain text[], changed boolean)
  language plpgsql
as $function$
declare
  v_org_id uuid := app.current_org_id();
  v_product_is_view boolean;
  v_item_id uuid;
  v_found boolean := false;
  v_old_allergens text[];
  v_old_may_contain text[];
  v_new_allergens text[];
  v_new_may_contain text[];
  v_norm_allergens text[];
  v_norm_may_contain text[];
  v_changed boolean := false;
begin
  if v_org_id is null then
    raise exception 'update_fa_allergen_set requires an org context (app.current_org_id())';
  end if;

  -- §8f finding #2 — DUAL-MODE. Decide at runtime whether public.product is still a TABLE (pre-359 window)
  -- or already a VIEW (post-359). On a table we MUST lock/read/write product (an items/ext twin may not
  -- exist yet — legacy create-fa.ts inserts product only). On a view we lock items + read/write fg_npd_ext.
  select (c.relkind = 'v')
    into v_product_is_view
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'product';

  if v_product_is_view is null then
    raise exception 'update_fa_allergen_set: public.product relation not found';
  end if;

  -- ── (1) lock + read CURRENT persisted sets from the active source ──
  if v_product_is_view then
    -- POST-359: lock the real base row (items), then lock + read the ext row that owns allergen sets.
    select i.id into v_item_id
    from public.items i
    where i.item_code = p_product_code and i.org_id = v_org_id
    for update;
    if not found then
      raise exception 'update_fa_allergen_set: product % not found in current org', p_product_code;
    end if;

    select coalesce(x.allergens, '{}'::text[]), coalesce(x.may_contain, '{}'::text[])
      into v_old_allergens, v_old_may_contain
    from public.fg_npd_ext x
    where x.item_id = v_item_id
    for update;
    if found then
      v_found := true;
    else
      -- Defensive: an FG with no ext row (should not happen post-backfill). Treat as empty current sets.
      v_old_allergens := '{}'::text[];
      v_old_may_contain := '{}'::text[];
    end if;
  else
    -- PRE-359: public.product is still a TABLE — lock/read it directly (original mig-114/345 behaviour).
    select coalesce(prod.allergens, '{}'::text[]), coalesce(prod.may_contain, '{}'::text[])
      into v_old_allergens, v_old_may_contain
    from public.product prod
    where prod.product_code = p_product_code and prod.org_id = v_org_id
    for update;
    if not found then
      raise exception 'update_fa_allergen_set: product % not found in current org', p_product_code;
    end if;
    v_found := true;
  end if;

  -- ── (2) recompute from the read-model (org-scoped via security_invoker + RLS); identical in both modes.
  --     fa_allergen_cascade reads `product` (table or view) transparently — unchanged by the merge. ──
  select
    coalesce(casc.published_allergens, '{}'::text[]),
    coalesce(casc.may_contain_allergens, '{}'::text[])
    into v_new_allergens, v_new_may_contain
  from public.fa_allergen_cascade casc
  where casc.product_code = p_product_code
    and casc.org_id = v_org_id;

  v_new_allergens := coalesce(v_new_allergens, '{}'::text[]);
  v_new_may_contain := coalesce(v_new_may_contain, '{}'::text[]);

  -- ── (3) diff old vs new (order-independent set comparison). text[] equality after sort. ──
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
    -- Normalize once (sorted, deduped) so both the persisted write and the return value match.
    v_norm_allergens := (select coalesce(pg_catalog.array_agg(distinct a order by a), '{}'::text[])
                           from unnest(v_new_allergens) a);
    v_norm_may_contain := (select coalesce(pg_catalog.array_agg(distinct m order by m), '{}'::text[])
                             from unnest(v_new_may_contain) m);

    -- ── (4) persist to the active source ──
    if v_product_is_view then
      if v_found then
        update public.fg_npd_ext x
           set allergens = v_norm_allergens, may_contain = v_norm_may_contain, updated_at = now()
         where x.item_id = v_item_id;
      end if;
    else
      update public.product prod
         set allergens = v_norm_allergens, may_contain = v_norm_may_contain
       where prod.product_code = p_product_code and prod.org_id = v_org_id;
    end if;

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

  -- ── (5) same return shape from the active source ──
  if v_product_is_view then
    return query
    select i.item_code, coalesce(x.allergens, '{}'::text[]), coalesce(x.may_contain, '{}'::text[]), v_changed
    from public.items i
    left join public.fg_npd_ext x on x.item_id = i.id
    where i.id = v_item_id;
  else
    return query
    select prod.product_code, prod.allergens, prod.may_contain, v_changed
    from public.product prod
    where prod.product_code = p_product_code and prod.org_id = v_org_id;
  end if;
end;
$function$;
