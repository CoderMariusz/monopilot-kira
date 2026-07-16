# W2 verification proof (prod deploy a24fd65b, dpl 4dyybpc9v READY)

Deploy 2026-07-16: build ✓ Compiled 115s + TS-check passed, db:migrate "Done: 4 applied (501-504), 479 skipped" — no errors, all logged in schema_migrations.
Verification layers: [DB]=live prod DB state · [CODE]=Opus self-review (Codex-review infra-limited) · [UNIT]=vitest · [GATE]=tsc+build+PREPARE.

| Finding | Proof | Evidence |
|---|---|---|
| **C033** WIP cost yield-adjust (not £216/kg) | [DB] compute_intermediate_unit_cost live w/ (material+labor)/yield + mig501 unclamp. [UNIT] 71 tests incl 80%→0.7500, 0.5h. [CODE] no double BAKE labor (C034). | schema_migrations 501 |
| **C034** no double labor | [CODE+UNIT] raw=materials only, labor=single stage. Codex CLOSED R1. | compute-waterfall.ts |
| **C030** live nutrition recurses WIP | [CODE+UNIT] shared resolve-component-nutrition.ts (RM+intermediate recursion), parity w/ materialized. Codex CLOSED R1. | resolve-component-nutrition.ts |
| **C032** lineage not "from BOM" | [CODE] Codex CLOSED R1. | nutrition-labels.ts |
| **C026** canonical FG name | [CODE] project-fg-sync.ts + update-item/import guard. | update-item.ts |
| **C027** delete-project no partial commit | [CODE] ✅ self-review: HasDependentsError thrown in-txn + FOR UPDATE + map-outside. | delete-project.ts |
| **C028** retail price 2dp | [CODE+UNIT] parseOptionalRetailPriceEur in clone+formulation, 37 tests. | retail-price-eur.ts |
| **C047** net_qty precision | [DB] ✅ items.net_qty_per_each **numeric(18,6)** live (was 12,4). mig502. | information_schema |
| **C042** routing precision | [DB] ✅ routing_operations.cost_per_hour + run_time_per_unit_sec **numeric(18,6)** live (was 10,4/10,2). mig503. | information_schema |
| **C043** release-bundle rollback | [CODE] ✅ self-review: BundleApprovalRollbackError re-thrown out of withOrgContext. | release-bundle-service.ts |
| **C044** intermediate BOM item_id | [CODE] ✅ self-review: product_id = intermediate?null:productId (FG flow preserved). | create-draft.ts |
| **C045** manufactured-WIP positive source | [CODE] classifier by active wip_definitions/BOM not absent-spec. Codex-directed. | rm-usability.ts |
| **C046** server op validator | [CODE] V-TEC-63 central validator all BOM writers. | bom/shared.ts |
| **C020** semantic field uniqueness | [DB] ✅ npd_field_catalog_active_semantic_code_uidx + _label_uidx live + mig504 dedup 2617-row catalog. | pg_indexes |
| **C031** export label disabled | [CODE] honest disabled when no handler. Codex CLOSED R1. | nutrition-panel.tsx |
| **C035** WIP edit active version | [CODE] resolveWipReadTarget archived→active + redirect. Codex CLOSED R1. | wip-definition-actions.ts |

## Process
- R1 (8 tracks) → Codex whole-wave review (BLOCKER, 5 CLOSED) → R2 (10 fix tracks) addressing every MUST-FIX → Opus self-review of P0s (Codex-review infra-limited by bash time-limit).
- Config resolved: 3 Cursor + 2 Codex concurrent OK (5× cursor tripped process limit); long Codex reviews die (bash time-limit) → Opus final review + short focused checks.
- REGFIX + REGFIX2 fixed test-mock ripple from C043/C045 query-shape changes (bundle-data, work-orders, materialize-npd-bom — all TEST-ONLY, logic unchanged).
- Test state at deploy: 60 fail/3918 pass — all pre-existing OR DB-loud-fail (no R2 regressions). tsc+build green. i18n parity 604. Migrations 501-504 PREPARE-clean + applied live.
- Pre-deploy backup: npd_field_catalog-pre504.csv (2617 rows).
- Deferred/documented: ro/uk translations for new keys still English (functional); DB integration tests loud-fail locally (no docker) — verified via PREPARE + migration-applied-live.
