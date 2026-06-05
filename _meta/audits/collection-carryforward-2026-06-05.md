# Collection Carry-Forward → Fix-Wave (2026-06-05)

Items surfaced during the wave-B foundation + 08-production collection (Tasks A/B) and the
Codex Gate-4 cross-provider review (3 rounds), DEFERRED to the quality-gap fix wave. The
genuine BLOCK/integrity/regulatory findings were fixed in rounds 1-2 (commits 7a8b1e3f,
c888b94b, 0a02d399); these are the tracked remainders.

## Deferred from Codex review (HIGH, design-level — not collection blockers)
1. **13-maintenance dual-sign Part 11 depth** (mig 201): LOTO / calibration / sanitation
   dual-sign modeled as nullable UUIDs with no DB-level distinct-signer (`first <> second`)
   guard and no CFR-21 attestation hash/session FK. Needs the canonical e-sign attestation
   wiring (cross-link to T-124 e-sign) + immutable-finalized guards on calibration certs.
2. **sites exactly-one-default-per-org** (mig 215): `idx_sites_default` enforces AT MOST one
   default, not EXACTLY one (V-MS-01). Add a deferred-constraint trigger / controlled
   create-update fn preventing an org from having zero default sites.
3. **register-output catch-weight precision** (apps/web/lib/production/output/register-output.ts):
   the catch-weight VARIANCE TOLERANCE gate still derives `Number(variance_tolerance_pct)/100`
   (float) even though kg values are now string-exact. Plus the inherited schema deviation
   (weight_mode 'nominal'→'fixed', avg_unit_kg→items.nominal_weight, default tolerance 0.10).
   Needs a HOLISTIC catch-weight review (MON-domain-production + catch-weight PRD): make
   tolerance fixed-point/basis-points end-to-end, validate the weight_mode mapping.

## Deferred collection work (not yet collected)
4. **-7 T-027-L3 technical schema-driven items** (branch worktree-wf_52ca809a-667-7): overlaps
   P0-3 (createItem/updateItem/shared.ts cost-ledger bypass) — collect + fix together in the wave.
5. **scanner 195/196** (05-warehouse): never built (agent rate-limited to 0 twice) — re-dispatch.
6. **08-production OEE producer wiring**: oee_snapshots producer schema exists (mig 185); the
   lib/production producer path was deferred during P0-5 collection — wire in this layer.
7. **spare_parts_stock canonical-owner unification**: 05-warehouse (mig 193) and 13-maintenance
   (mig 201, renamed maintenance_spare_parts_stock to avoid the table collision) both model
   spare-parts stock. Decide the single owner + reference model (food-MES: spares ≈ maintenance).

## Live Gate-5 smoke findings (deploy d4414d6f READY, Supabase @217)
8. **08-production dashboard dead nav links** (Gate-5 smoke): /en/production renders + is wired
   into the menu, but its "Production areas" nav links to 6 UNBUILT subroutes — /production/
   {shifts,analytics,waste,downtime,wos,changeover} all 404 (prefetch errors in console). Only the
   dashboard + work-orders/[id] API + lib/production were collected. Fix-wave: build the subroutes
   OR make the nav links honest stubs. (Login ✅, dashboard ✅ no 403, /technical existing ✅ 0 errors.)

## Dismissed false-positives (Codex diff-scoping artifacts — verified safe, no action)
- "outbox CHECK drops events" (migs 202/215): mig 217 recreates the full DB_EVENT_TYPES union
  as the FINAL state; check-drift gate green. Per-module intermediate CHECK narrowing is benign
  for cumulative migrate.
- "missing production.* RBAC seed": committed mig 185 seeds the full family (Codex only saw the
  app-layer diff).
- "wo_outputs conflict target not schema-aligned" (start-wo): mig 181 has
  `wo_outputs_transaction_id_unique UNIQUE (transaction_id)` — `on conflict (transaction_id)` is
  correct.

## Verification gap (environmental)
Local live migration-apply (001→217) was NOT run — Docker daemon unavailable in the session
(no Docker.app; socket dead; integration suites skip on absent DATABASE_URL). Migrations
validated by static review + 3-round Codex review. The Vercel fail-loud migrate on push is the
real-apply gate. Re-run `pnpm db:up && DATABASE_URL=... pnpm --filter @monopilot/db test` with
Docker up for the local gate before final sign-off.
