# Wave 17 P2 sweep — per-bug summary

Branch: `fix/wave17-p2-sweep`. All fixes include targeted vitest coverage; `'use server'` touchpoints verified with `pnpm --filter web run build` (exit 0).

## N-42 — Project deletion audit + `npd.project.deleted` event

**Problem:** `gate_approvals.project_id` SET NULL on delete left no durable project identity; `npd.project.deleted` was absent from the outbox CHECK, so emit failed behind a SAVEPOINT and the delete still committed.

**Fix:**
- Migration `482-npd-project-deleted-outbox.sql`: `gate_approvals.project_code` + `project_id_snapshot` columns + outbox CHECK adds `npd.project.deleted`.
- Migration `484-gate-approvals-project-preserve-on-set-null.sql`: DB trigger stamps durable refs on `gate_approvals.project_id` SET NULL (no app pre-delete write).
- `events.enum.ts`: `NPD_PROJECT_DELETED`.
- `delete-project.ts`: delete then emit outbox atomically (no pre-delete stamp).

**Tests:** `delete-project.test.ts`, `delete-project.pg.test.ts` — no app stamp + SET NULL preservation + FK failure leaves approval unstamped.

## N-43 — Delete unsafe `rollbackGate` (`revert-gate.ts`)

**Problem:** Parallel revert endpoint skipped PIN e-sign, release-lock, and allowed multi-gate jumps. Grep showed importers only in tests/docs — UI uses `revert-npd-gate.ts`.

**Fix:** Deleted `revert-gate.ts`. Integration test repointed to `revertNpdGate` (adjacent, PIN-gated). Removed `rollbackGate` unit tests.

**Note:** Docs under `docs/guide/` repointed to `revert-npd-gate.ts` (fix round 1).

## N-48 — RM-usability TOCTOU on release bundle

**Problem:** `bomRmUsabilityFails` ran before BOM row lock; concurrent `bom_lines` insert could pass check then fail AC2.

**Fix:** `lockBomForApproval` (`SELECT … FOR UPDATE` on `bom_headers`); RM usability re-checked under lock. Migration `485-bom-lines-header-lock-immutability.sql` locks parent header inside `bom_lines` immutability trigger.

**Tests:** `release-bundle.test.ts`; `bom-lines-header-lock.pg.test.ts` — two-connection UPDATE race.

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
- `generateBol`: write `bol_payload`; `FOR UPDATE` shipment lock; status predicate on update; throw on zero-row update; on `shipped` require `ship.bol.sign` + carrier audit.

**Tests:** `ship-actions.test.ts`; `generate-bol-ship-race.pg.test.ts` — packed→shipped interleaving.

## Fix round 1

Adversarial Codex review follow-up (N-42, N-43, N-48, N-68):

- **484-gate-approvals-project-preserve-on-set-null.sql** — DB trigger preserves `project_code` / `project_id_snapshot` on `gate_approvals.project_id` SET NULL; removed app pre-delete stamp.
- **485-bom-lines-header-lock-immutability.sql** — `bom_lines` immutability trigger locks parent `bom_headers` FOR UPDATE.
- **Docs** — English + Polish guides repointed from deleted `revert-gate.ts` / `rollbackGate` to `revertNpdGate` / `revert-npd-gate.ts`.
- **generateBol** — shipment `FOR UPDATE` lock, status predicate on final UPDATE, throw on zero-row update (no orphan audit).
- **Pg tests** — `delete-project.pg.test.ts`, `bom-lines-header-lock.pg.test.ts`, `generate-bol-ship-race.pg.test.ts`.

## Fix round 2

Codex re-review follow-up (N-42 migration semantics, N-68 race regression proof):

- **484-gate-approvals-project-preserve-on-set-null.sql** — replaced broken `gate_approvals` SET NULL trigger with `BEFORE DELETE` on `npd_projects` that stamps `project_code` + `project_id_snapshot` while the parent row still exists (rolls back with failed delete).
- **generate-bol-ship-race.pg.test.ts** — drives real `generateBol` / `shipShipment` with opposing `FOR UPDATE` lock + flip trigger; asserts shipped-path audit + BOL payload, packed-path BOL persistence, and `not_found` with no orphan audit on zero-row update.

## Fix round 3

Codex re-review follow-up (N-68 pg harness only — production `generateBol` unchanged):

- **generate-bol-ship-race.pg.test.ts** — shipped-path denial case revokes `ship.bol.sign` before `generateBol` and restores it in `finally`; asserts carrier/BOL payload unchanged and zero audit rows. Replaced self-modifying `BEFORE UPDATE` flip trigger with a `RETURN NULL` skip trigger plus two-connection barriers: BOL-wins race uses pool hooks so `shipShipment` blocks on `generateBol`'s `FOR UPDATE` until BOL commits on `packed`; zero-row path pauses before the shipment lock read so `shipShipment` commits first, then `generateBol` hits empty `RETURNING` (`not_found`) with no orphan audit.
