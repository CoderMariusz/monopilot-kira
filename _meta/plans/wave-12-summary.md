# Wave 12 — per-bug fix summary

Branch: `fix/wave12-release-eco`. No migrations added.

## Bug 1 (N-18, P1) — orphaned e-signature bricks bundle retry

**Root cause:** `signEvent` ran before `lockFactorySpecForApproval`; post-lock soft-fail `return {ok:false}` committed the signature and consumed the deterministic nonce.

**Fix:** Moved `signEvent` to after lock + rechecks + spec/BOM approval + supersede mutations. E-sign failure after writes now **throws** (rolls back). Post-lock recheck still soft-fails before any writes or signing.

**Tests:** `lib/technical/__tests__/release-bundle.test.ts` — post-lock race leaves no signature and second attempt succeeds; sign runs only after approval/supersede SQL.

## Bug 2 (N-19, P1) — cross-FG ECO supersession

**Root cause:** `validateSupersedingFactorySpec` never loaded or compared `fg_item_id`; per-FG version counters allowed FG-Y v3 to supersede FG-X v1.

**Fix:** `loadFactorySpec` selects `fg_item_id`; validation rejects mismatched FG with typed `supersession_invalid` before close.

**Tests:** `eco/__tests__/eco-apply.unit.test.ts` — cross-FG superseding spec rejected on link and on close.

## Bug 3 (N-49, P2) — closeNpdReleaseLoop downgrades released rows

**Root cause:** `factory_release_status` UPDATE matched only org/project/product, flipping `released_to_factory` / `blocked` to `approved_for_factory` and clearing blockers.

**Fix:** Added `release_status in ('pending_npd_release', 'pending_technical_approval')` predicate (mirrors `syncFactoryReleaseStatusForReleasedSpec` pattern).

**Tests:** `lib/technical/__tests__/release-bundle.test.ts` — UPDATE SQL includes pending-only predicate.

## Bug 4 (N-50, P2) — rejectReleaseBundle partial commit

**Root cause:** Spec demotion committed then audit failure returned `{ok:false}`; `bomHeaderId` never validated against `spec.bom_header_id`.

**Fix:** Validate BOM pairing before demotion; audit failure **throws** (rolls back demotion).

**Tests:** `lib/technical/__tests__/release-bundle.test.ts` — mismatched BOM rejected; audit throw leaves spec in_review (rollback contract).

## Bug 5 (N-51, P2) — re-release outbox event lost after recall

**Root cause:** `dedupKey` was static per scope+bom+spec; recall→re-approve→re-release hit `ON CONFLICT DO NOTHING` and reused the old event id.

**Fix:** Added required `releaseAttemptKey` (callers pass `factory_specs.approved_at`) into `dedupKey`. Each approval cycle gets a fresh key; same-cycle retries still dedup when key unchanged.

**Tests:** `lib/technical/__tests__/factory-release-persistence.test.ts` — different `releaseAttemptKey` values produce distinct dedup keys and new event ids.

**Callers updated:** `factory-spec-flow.ts`, `release-npd-project-to-factory.ts`, `release-preflight.ts` (loads `factorySpecApprovedAt`).

## Bug 6 (N-52, P2) — recall leaves factory-usable release status

**Root cause:** Spec reset to `draft` but `factory_release_status` only moved to `approved_for_factory`, keeping stale evidence fields and a factory-usable presentation.

**Fix:** On recall, set `release_status = 'pending_technical_approval'` and null `factory_available_at`, `factory_approved_by`, `release_event_id` (satisfies mig-125 `factory_usable_evidence_check` — pending is not factory-usable).

**Tests:** `lib/technical/__tests__/recall-factory-spec-core.test.ts` — status row cleared of approval evidence after recall.

## Verification

```text
pnpm --filter web exec tsc --noEmit          # clean
pnpm exec vitest run (4 touched test files)  # 20/20 PASS
```
