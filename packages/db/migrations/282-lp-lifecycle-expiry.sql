-- Migration 282: LP lifecycle + canonical expiry column — data fix.
-- Audit: _meta/audits/2026-06-11-cross-module-consistency.md F-A01 (BLOCKER) + F-B07 (HIGH).
--
-- Problem (verified live): receive inserts license_plates with status='received'
-- (receive-po.ts) and NOTHING in the repo ever wrote status='available', while
-- v_inventory_available (migration 191) requires status='available' AND
-- qa_status='released' — so QA-released pallets stayed invisible to inventory,
-- FEFO and the consume picker. Separately, receive wrote best_before_date while
-- every reader (FEFO view ordering, expiry tiers, alerts) reads expiry_date.
--
-- Owner decisions (W9-K-I): putaway promotes received→available; QA release ALSO
-- auto-promotes received→available; canonical expiry column = expiry_date
-- (best_before_date stays populated for back-compat). The code-side writers ship
-- in the same lane (movement.ts putaway path, lp-qa-actions.ts releaseLpQa,
-- receive-po.ts expiry_date computation).
--
-- Idempotent: (a) is guarded by expiry_date IS NULL; (b) re-matches zero rows on
-- a second run (status already flipped); (c) ledger rows use a deterministic
-- transaction_id (md5 of lp id) + ON CONFLICT DO NOTHING.
-- Wave0 lock: org_id business scope (NOT tenant_id); this is an org-agnostic
-- repo-wide data fix — org_id is carried row-by-row from license_plates into
-- lp_state_history, never hardcoded.

-- (a) Backfill the canonical expiry column from the legacy write target.
update public.license_plates
   set expiry_date = best_before_date
 where expiry_date is null
   and best_before_date is not null;

-- (b) + (c) Promote stuck stock: exactly the QA-released-but-invisible pallets
-- (status='received' AND qa_status='released'), and write the matching
-- lp_state_history transition rows (table from migration 193) in one statement
-- so ledger and state can never diverge. created_by stays NULL (system fix).
with promoted as (
  update public.license_plates
     set status = 'available',
         updated_at = pg_catalog.now()
   where status = 'received'
     and qa_status = 'released'
  returning id, org_id, site_id
)
insert into public.lp_state_history
  (org_id, site_id, lp_id, from_state, to_state, reason_code, reason_text, transaction_id)
select p.org_id,
       p.site_id,
       p.id,
       'received',
       'available',
       'migration_282_backfill',
       'QA-released stock promoted received->available (audit F-A01)',
       md5('282-lp-lifecycle-expiry:' || p.id::text)::uuid
  from promoted p
on conflict (org_id, transaction_id) do nothing;
