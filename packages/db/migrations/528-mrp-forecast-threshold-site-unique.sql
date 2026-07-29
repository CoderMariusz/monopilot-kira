-- 528-mrp-forecast-threshold-site-unique.sql
-- PF-R09-03 (Fala 9 T2): demand_forecasts + reorder_thresholds carry site_id but their
-- UNIQUE keys omitted it — only one row per (org, item, …) could exist, so site-scoped
-- MRP reused org-global (site_id IS NULL) forecast/threshold rows on every site.
--
-- NULL site_id = org-global row (visible only when app.current_site_id() IS NULL).
-- NULLS NOT DISTINCT keeps at most one global row per (org, item, iso_week) / (org, item).
-- Existing rows with site_id IS NULL are preserved unchanged.

alter table public.demand_forecasts
  drop constraint if exists demand_forecasts_org_item_week_unique;

alter table public.demand_forecasts
  add constraint demand_forecasts_org_item_week_unique
  unique nulls not distinct (org_id, item_id, iso_week, site_id);

comment on constraint demand_forecasts_org_item_week_unique on public.demand_forecasts is
  'PF-R09-03: one forecast per org/item/ISO-week/site (NULL site = org-global). Migration 528.';

alter table public.reorder_thresholds
  drop constraint if exists reorder_thresholds_org_item_unique;

alter table public.reorder_thresholds
  add constraint reorder_thresholds_org_item_unique
  unique nulls not distinct (org_id, item_id, site_id);

comment on constraint reorder_thresholds_org_item_unique on public.reorder_thresholds is
  'PF-R09-03: one reorder threshold per org/item/site (NULL site = org-global). Migration 528.';

-- Post-check: two rows differing only by site_id must both insert; duplicate within one site must fail.
do $$
declare
  v_org uuid;
  v_item uuid;
  v_site_a uuid := gen_random_uuid();
  v_site_b uuid := gen_random_uuid();
  v_fc_a uuid;
  v_fc_b uuid;
  v_rt_a uuid;
  v_rt_b uuid;
  v_caught boolean;
begin
  select f.org_id, f.item_id
    into v_org, v_item
    from public.demand_forecasts f
   limit 1;

  if v_org is null then
    select rt.org_id, rt.item_id
      into v_org, v_item
      from public.reorder_thresholds rt
     limit 1;
  end if;

  if v_org is null then
    select i.org_id, i.id
      into v_org, v_item
      from public.items i
     where i.item_type in ('rm', 'ingredient', 'fg', 'intermediate', 'packaging')
     limit 1;
  end if;

  if v_org is null then
    raise exception 'migration 528 FAILED: no org/item row available for per-site unique-key probe';
  end if;

  insert into public.demand_forecasts (org_id, item_id, iso_week, site_id, qty, uom)
  values (v_org, v_item, '2099-W01', v_site_a, 1, 'kg')
  returning id into v_fc_a;

  insert into public.demand_forecasts (org_id, item_id, iso_week, site_id, qty, uom)
  values (v_org, v_item, '2099-W01', v_site_b, 2, 'kg')
  returning id into v_fc_b;

  v_caught := false;
  begin
    insert into public.demand_forecasts (org_id, item_id, iso_week, site_id, qty, uom)
    values (v_org, v_item, '2099-W01', v_site_a, 3, 'kg');
    raise exception 'migration 528 FAILED: duplicate demand_forecasts per site succeeded';
  exception
    when unique_violation then
      v_caught := true;
  end;
  if not v_caught then
    raise exception 'migration 528 FAILED: duplicate demand_forecasts did not raise unique_violation';
  end if;

  delete from public.demand_forecasts where id in (v_fc_a, v_fc_b);

  insert into public.reorder_thresholds (org_id, item_id, site_id, min_qty, reorder_qty)
  values (v_org, v_item, v_site_a, 1, 1)
  returning id into v_rt_a;

  insert into public.reorder_thresholds (org_id, item_id, site_id, min_qty, reorder_qty)
  values (v_org, v_item, v_site_b, 2, 2)
  returning id into v_rt_b;

  v_caught := false;
  begin
    insert into public.reorder_thresholds (org_id, item_id, site_id, min_qty, reorder_qty)
    values (v_org, v_item, v_site_a, 3, 3);
    raise exception 'migration 528 FAILED: duplicate reorder_thresholds per site succeeded';
  exception
    when unique_violation then
      v_caught := true;
  end;
  if not v_caught then
    raise exception 'migration 528 FAILED: duplicate reorder_thresholds did not raise unique_violation';
  end if;

  delete from public.reorder_thresholds where id in (v_rt_a, v_rt_b);

  raise notice 'migration 528: per-site unique keys enforced for demand_forecasts and reorder_thresholds';
end
$$;
