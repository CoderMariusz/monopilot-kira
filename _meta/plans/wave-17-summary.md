# Wave 17 P2 sweep — per-bug summary

Branch: `fix/wave17-p2-sweep`. All fixes include targeted vitest coverage; `'use server'` touchpoints verified with `pnpm --filter web run build` (exit 0).

## N-42 — Project deletion audit + `npd.project.deleted` event

**Problem:** `gate_approvals.project_id` SET NULL on delete left no durable project identity; `npd.project.deleted` was absent from the outbox CHECK, so emit failed behind a SAVEPOINT and the delete still committed.

**Fix:**
- Migration `482-npd-project-deleted-outbox.sql`: `gate_approvals.project_code` + `project_id_snapshot` (backfilled from live projects); outbox CHECK adds `npd.project.deleted`.
- `events.enum.ts`: `NPD_PROJECT_DELETED`.
- `delete-project.ts`: stamp approvals before delete; emit outbox atomically (throw on failure — no SAVEPOINT).

**Tests:** `delete-project.test.ts` — stamp + event + rollback on emit failure.

## N-43 — Delete unsafe `rollbackGate` (`revert-gate.ts`)

**Problem:** Parallel revert endpoint skipped PIN e-sign, release-lock, and allowed multi-gate jumps. Grep showed importers only in tests/docs — UI uses `revert-npd-gate.ts`.

**Fix:** Deleted `revert-gate.ts`. Integration test repointed to `revertNpdGate` (adjacent, PIN-gated). Removed `rollbackGate` unit tests.

**Note:** Docs under `docs/guide/` still mention `revert-gate.ts` historically; runtime path is `revert-npd-gate.ts` only.

## N-48 — RM-usability TOCTOU on release bundle

**Problem:** `bomRmUsabilityFails` ran before BOM row lock; concurrent `bom_lines` insert could pass check then fail AC2.

**Fix:** `lockBomForApproval` (`SELECT … FOR UPDATE` on `bom_headers`); RM usability re-checked under lock after spec lock.

**Tests:** `release-bundle.test.ts` — `FOR UPDATE` on BOM precedes `bom_lines` blocked count query.

## N-53 — ECO close vs concurrent recall

**Problem:** Superseding spec/BOM validated with plain SELECT; concurrent recall could leave ECO applied against draft spec.

**Fix:** `loadBomForUpdate` / `loadFactorySpecForUpdate` (`FOR UPDATE`) during `applyEcoOnClose` / validation paths.

**Tests:** `eco-apply.unit.test.ts` — asserts `for update` on superseding BOM load.

## N-54 — Product-less BOM pair in ECO apply

**Problem:** `null === null` product match let `product_id!` flow into `publishBomVersion`.

**Fix:** `validateSupersedingBom` rejects when either side has null `product_id`; explicit guard before publish.

**Tests:** `eco-apply.unit.test.ts` — product-less pair returns `supersession_invalid`.

## N-57 — Portfolio totals float round-trip

**Problem:** `list-portfolio-cost.ts` used `Number(...)`; portfolio page used `.toFixed(2)`.

**Fix:** Keep `total_recipe_cost` as decimal string end-to-end; display via `formatCost` (BigInt-scaled).

**Tests:** `where-used-and-portfolio-cost.test.ts` — `9007199254740991.05` preserved exactly.

## N-58 — OR-join double-count in cost roll-ups

**Problem:** `(ci.id = bl.item_id OR ci.item_code = bl.component_code)` matched two items when a re-created item shared a code.

**Fix:** Prefer `item_id` join; code fallback only when `bl.item_id IS NULL`.

**Tests:** `recipe-cost-rollup-sql.test.ts` + SQL shape assertions in portfolio/recipe cost tests.

## N-68 — BOL payload column + shipped carrier audit

**Problem:** `generateBol` stored JSON in `bol_pdf_url`; shipped carrier/tracking edits used only `ship.ship.confirm` with no audit.

**Fix:**
- Migration `483-shipment-bol-payload.sql`: `shipments.bol_payload jsonb` + backfill from legacy JSON in `bol_pdf_url`.
- `generateBol`: write `bol_payload`; leave `bol_pdf_url` for real URLs; on `shipped` status require `ship.bol.sign` and emit `shipping.bol.carrier_updated` audit when carrier/tracking/service change.

**Tests:** `ship-actions.test.ts` — `bol_payload` storage + shipped mutation gate/audit.
