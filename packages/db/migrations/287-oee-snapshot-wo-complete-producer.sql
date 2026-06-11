-- Migration 287: 08-production — WO-complete OEE snapshot producer support.
-- PRD: docs/prd/08-PRODUCTION-PRD.md §9.9 (oee_snapshots), D-OEE-1 (08-production is the
-- SOLE writer of oee_snapshots; 15-OEE stays READ-ONLY — this migration changes nothing
-- about that ownership, it only relaxes two producer-side columns + adds idempotency).
--
-- Why:
--   (a) HONEST NULL semantics. The WO-complete producer (apps/web/lib/production/
--       oee-snapshot-producer.ts) refuses to fabricate numbers:
--         * performance_pct is NULL when the WO has no standard-time source
--           (sum of wo_operations.expected_duration_minutes is absent/zero) — we never
--           invent an ideal rate;
--         * quality_pct is NULL when the quality denominator is zero (no registered
--           output and no waste — e.g. an override-completed WO).
--       Both columns were NOT NULL in migration 184 (the per-minute aggregator design);
--       the WO-grain producer needs them NULLable. The 0..100 range CHECKs still hold
--       for non-NULL values (CHECK passes on NULL by SQL semantics).
--       oee_pct is GENERATED ALWAYS AS (A*P*Q/10000) STORED and therefore propagates
--       NULL: oee_pct IS NULL whenever ANY component is NULL — that is the documented
--       contract (no partial products are fabricated).
--   (b) Per-WO idempotency. The producer writes exactly ONE snapshot per completed WO
--       (snapshot_minute = date_trunc('minute', completed_at)). A replayed COMPLETE
--       (R14 transaction_id replay) must not produce a second row. The partial unique
--       index below enforces one row per (org_id, active_wo_id) at the DB level; the
--       producer additionally guards with WHERE NOT EXISTS + ON CONFLICT DO NOTHING,
--       so a replay is a silent no-op (never an error inside the completion txn).
--
-- The existing V-PROD-10 quad-unique (org_id, line_id, shift_id, snapshot_minute) is
-- unchanged — two different WOs completing on the same line+shift within the same
-- minute collapse to one row (first writer wins; documented grain limitation).

alter table public.oee_snapshots alter column performance_pct drop not null;
alter table public.oee_snapshots alter column quality_pct drop not null;

-- (c) Producer-blocking grant gap (found by the real-DB integration run): migration 184
--     granted app_user table DML on oee_snapshots but NOT usage on the bigserial id
--     sequence — every app_user INSERT failed with "permission denied for sequence
--     oee_snapshots_id_seq". This is one reason the table stayed at 0 rows forever.
grant usage, select on sequence public.oee_snapshots_id_seq to app_user;

create unique index if not exists oee_snapshots_org_active_wo_uq
  on public.oee_snapshots (org_id, active_wo_id)
  where active_wo_id is not null;
