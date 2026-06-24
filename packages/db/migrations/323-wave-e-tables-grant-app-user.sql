-- Migration 323: grant the wave-E tables to app_user (the role the app connects as).
--
-- Migrations 315-318 (cold-chain, freight, yard, cycle-count) created their tables with
-- RLS + FORCE RLS but granted privileges to `authenticated` instead of `app_user` — the
-- Wave0-locked role the app runtime actually connects as. Result on the live deploy: every
-- read/write threw `permission denied for table <x>`, breaking cold-chain, freight, yard,
-- and cycle-count for ALL users. Mocked unit tests never connect as app_user, so they
-- stayed green; found by the 2026-06-24 live browser audit
-- (_meta/plans/2026-06-24-browser-audit-findings.md). Applied live via Supabase MCP
-- 2026-06-24; idempotent (re-granting is a no-op).

grant select, insert, update, delete on
  public.product_temp_ranges,
  public.delivery_condition_checks,
  public.carriers,
  public.transport_lanes,
  public.dock_doors,
  public.dock_appointments,
  public.yard_visits,
  public.weighings,
  public.count_sessions,
  public.count_lines,
  public.stock_adjustments
to app_user;
