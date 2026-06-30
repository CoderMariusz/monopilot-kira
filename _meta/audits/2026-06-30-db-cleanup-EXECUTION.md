# DB cleanup — DEEP REFACTOR EXECUTION LOG (2026-06-30, autonomous run)

Source plan: `_meta/audits/2026-06-30-db-cleanup-audit.md` (7-phase consolidation order).
Owner mandate: full P0–P2 scope, autonomous ~4h. Cadence per phase: **Codex fix → different
Codex review → Opus (kira-codex-review) cross-review for correctness + one consistent style**.
Claude (main loop) owns migrations (Supabase MCP + record in schema_migrations), the build gate,
commits, and verified-checkpoint pushes. Goal: **one source of truth for values** (price / cost /
qty / units) and one consistent set of tables — kill the rozjazdy.

Start HEAD: `77039d50` · branch `main` · next migration `394`.

## Guardrails for this run
- Stage files EXPLICITLY per phase. NEVER `git add -A`. NEVER stage `purchase-orders/_actions/actions.test.ts`.
- Migrations authored by Claude, applied via MCP, recorded in `public.schema_migrations`.
- Codex briefs: small (3–5 files), NO `pnpm build` (hangs), verify by targeted vitest only.
- DESTRUCTIVE ops (Phase 7 drops, FK conversions that remove columns, product_legacy drop):
  prefer reversible/soft-deprecate; only hard-drop tables PROVEN empty/dead. Flag the rest for
  the joint in-app review. Business decisions (GBP/EUR base currency, final table drops) → defer
  to the joint review; make currency-preserving (no silent relabel) choices in the meantime.
- Push only after a phase is build-green + cross-review-pass. Never push a half-baked main.

## Phase status
| Phase | Scope | Fix | Review | Opus X-review | Build | Migr | Commit | Push |
|---|---|---|---|---|---|---|---|---|
| Scoping | exact specs for P1/P2/cross-cut | — | — | — | — | — | — | — |
| P1 | correctness blockers (wrong numbers) | | | | | | | |
| X-cut | new-org seed / user_sessions / shipping FK / Drizzle | | | | | | | |
| P2 | getEffectiveCost single-source + currency + packaging-in-waterfall | | | | | | | |
| P3 | supplier/customer unify | | | | | | | |
| P4 | process unify (Finance↔ManufacturingOperations) | | | | | | | |
| P5 | allergen single-vocab | | | | | | | |
| P6 | item/product completion | | | | | | | |
| P7 | dead-table drop (cautious) | | | | | | | |

## Decisions deferred to joint in-app review (entangled with business/UX choices — NOT auto-fixed)
- **WAC inventory valuation (audit A3/H4).** `item_wac_state` write path was scoped but DEFERRED: the `currencies` table referenced by `item_wac_state.currency_id` (NOT NULL) **does not exist**, and the sibling finance tables (`wo_actual_costing`/`inventory_cost_layers`/`cost_variances`) are dead. The whole valuation layer is a half-built P2 subsystem; writing WAC would require fabricating a currency_id. Needs a finance-valuation design decision (currency model first).
- **New-org default warehouse/location seed (audit D).** DEFERRED: the onboarding wizard (`createFirstWarehouse`/`createFirstLocation`) already creates these manually, gated on `onboarding_completed_at IS NULL`. Auto-seeding on org-insert could conflict with / bypass the wizard. (org_sequences self-heals; `costing_margin_warn_pct` is already seeded by mig 096.) Decide: auto-seed vs. fail-gracefully-on-missing.
- **Base currency / FX policy (audit A1, Phase 2 dependency).** Cost is stored in GBP (`list_price_gbp`), PLN (`item_cost_history` default), and a column *named* `cost_per_kg_eur` that actually holds GBP/PLN. The single-source resolver (Phase 2) will be currency-PRESERVING (carry `{amount,currency,source}`, stop silent relabel) but the base-currency + FX-rate policy is a business decision — deferred.

## Per-phase detail

### PHASE 1 — correctness blockers (the wrong-number bugs) — DONE
Cadence: 5 Codex fix lanes (parallel) → Codex review (different agent) → Opus (kira-codex-review) cross-review → Claude build gate + migrations + ripple fixes.

Shipped:
1. **Nutrition allergen normalize (H5)** — `nutrition/_actions/compute.ts`: `nutrition_allergens` INSERT now canonicalises codes via `public.normalize_allergen_code(...)` at write, deduping with `select distinct (...)` so two raw codes → one canonical code can't trip `ON CONFLICT ... cannot affect row twice` (review blocker #1 fixed). Mixed 'A01'/'gluten' → readable badge names.
2. **Phantom `"Reference"."Suppliers"` (42P01)** — mig **394**: SECURITY INVOKER view over `public.suppliers` (status='active') + grant; `fg/[productCode]/page.tsx` dropdown allow-list extended. NPD Procurement supplier dropdown no longer 42P01s. Live-verified (view exists, app_user can select).
3. **Phantom `public.user_sessions` (42P01)** — `actions/users/reset-password.ts`: removed the dead `UPDATE user_sessions` (table never existed; Supabase Auth owns sessions). Truthful comment retained.
4. **BOM detail/eligibility/nutrition name from `items` (H1/H2/M4)** — `bom/_actions/{detail-page,queries,generate-batch}.ts` + `nutrition/_actions/list-nutrition.ts`: read `items.name` and eligible-FG set `items WHERE item_type='fg' AND status='active'` (Technical-active FGs now appear in the BOM generator; names no longer null/stale).
5. **per_box fail-loud (A2, HIGH)** — `lib/production/wo-material-scalar.ts` now THROWS `WoMaterialScalarError` instead of silently ~×kg/box overstating. Reused the existing `pack_hierarchy_incomplete` error code (NOT a new near-duplicate — dedup spirit) so it surfaces in the UI with existing i18n. Callers (`createWorkOrder`, `update-work-order` resnapshot, `mrp.convert`) validate the scalar **before any write / before the DELETEs** so a bad per_box BOM fails cleanly with **no orphan/stripped WO** (review blockers #2/#3 fixed).
6. **WO actual_qty/produced_quantity (A3, HIGH)** — `lib/production/complete-cancel-wo.ts`: writes both from primary `wo_outputs` at completion → `yield_percent` (generated) no longer permanently NULL.
7. **packs_per_case→items.each_per_box sync (H3)** — `brief/_actions/update-project-brief.ts`: idempotent sync on brief save → WO snapshots no longer stale until next materialize.
8. **packaging qty_per_pack end-to-end (M3)** — schema/upsert/list/modal + second loader in `packaging/page.tsx`. (Codex also fixed a pre-existing duplicate `$12` param in the upsert.)

Cross-cutting (shipped with P1): mig **395** — 3 shipping FKs (`sales_order_lines.product_id`→items, `inventory_allocations`/`shipment_box_contents.license_plate_id`→license_plates; 0 orphans confirmed) + 5 non-neg CHECKs.

Residual notes (logged, not blocking): `packaging/page.tsx:205` still reads the name from `public.product` (M4-sibling); Drizzle schema drift (types-only, audit F) not yet synced — slated as a safe cross-cutting follow-up.
