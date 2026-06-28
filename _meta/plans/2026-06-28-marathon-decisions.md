# 7h Marathon — Resolved owner decisions + wave plan (2026-06-28)

Owner confirmed the 5 open decisions at marathon kickoff. These are now LOCKED.

## Resolved decisions

1. **A3 — dynamic FA sections grouping = 3 sections (CONFIRMED).**
   - Section 1 = Core
   - Section 2 = Commercial + Planning
   - Section 3 = Production + Technical
   - The FA/FG detail must render its fields dynamically from `npd_field_catalog`
     (mig ~333, currently unused) grouped into exactly these 3 sections, replacing the
     current `Reference.DeptColumns`-driven 8-section render.

2. **A2 — auto-field source scope = ANY-DEPT.**
   - `auto_source_field` may reference a field from ANY department, not just the same
     department. The auto/auto_source_field migration + resolver must allow cross-dept
     references.

3. **Dashboard SKU tile = SITE-SCOPED.**
   - The dashboard SKU/active-products KPI tile must respect the active site
     (fail-closed via `getActiveSiteId`), not show an org-wide count.

4. **"Packs per case" pre-fill = ADD A BRIEF FIELD.**
   - `npd_projects` gets a `packs_per_case` column (brief field). FG detail pre-fills
     Packs-per-case from it (kill double-entry), same pattern as A12
     (weight/price_brief/volume copy-on-create + backfill).

5. **A11 — auto-created supplier_spec = APPROVED + ACTIVE.**
   - On item create, when a supplier is selected, auto-create a `supplier_specs` row
     with `lifecycle_status='active'` + `review_status='approved'` (not draft), linking
     the new item to the supplier. (Subject to schema constraints — if the table forbids
     an approved spec without a document, surface to owner rather than silently downgrade.)

## Orchestration model (owner-directed this run)

- Claude = **orchestrator only** (conserve context). Backend code → Codex (`codex-rescue`).
  UI → a separate Claude (`kira-ui`). Browser/live verification → a delegated agent.
- Keep up to **3 tracks running continuously**, file-disjoint (no two concurrent agents
  edit the same file; only ONE agent ever touches `apps/web/i18n/en.json` per wave).
- Crons: hourly progress report (+ owner push) + watchdog (recover stuck/blocked agents).
- Codex brief rules (from memory): NO `pnpm build`; verify via targeted vitest only;
  `task --wait --timeout-ms 3000000`; ≤4-5 files; typed casts `$n::type` everywhere
  (untyped-param-in-jsonb bug class). Claude orchestrator runs the build gate + applies
  migrations + pushes via `open /tmp/mk_push.command`.

## Wave 1 (file-disjoint)

- **Scout-1 (Explore, read-only):** inventory site-scoping read gaps in planning + purchasing.
- **Scout-2 (Explore, read-only):** locate A3 FA dynamic-section render + npd_field_catalog shape + 3-section mapping.
- **Track A11 (Codex):** item-create → approved+active supplier_specs row. Files: technical/items/_actions/**. (After supplier_specs schema check.)

## Next free migration = 369.
