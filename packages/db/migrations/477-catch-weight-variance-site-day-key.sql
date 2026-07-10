-- ============================================================================
-- 477 — catch_weight_variance_daily per-site roll-up key (Wave 14 / N-62)
--
-- LOUDLY: this migration AUTO-APPLIES on Vercel via @monopilot/db migrate BEFORE build.
-- Safe additive change: swaps unique key from (org,item,day) → (org,item,site,day).
-- Existing blended rows (min(site_id) pin) are superseded on the next cron run;
-- no manual backfill required — row count is typically low (nightly roll-ups only).
-- ============================================================================

drop index if exists public.catch_weight_variance_daily_org_item_day_uq;

create unique index if not exists catch_weight_variance_daily_org_item_site_day_uq
  on public.catch_weight_variance_daily (org_id, item_id, site_id, day) nulls not distinct;

comment on index public.catch_weight_variance_daily_org_item_site_day_uq is
  'Wave 14 N-62: one variance roll-up per org/item/site/day (NULL site_id treated as one bucket).';
