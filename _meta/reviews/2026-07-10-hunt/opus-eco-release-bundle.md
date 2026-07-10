## Bug hunt — eco-apply-service / release-bundle-service / factory-release-persistence

### P1 findings

**P1-1 — ECO factory-spec supersession has no FG-item binding check (approvals/lineage bypass)**
`apps/web/lib/technical/eco-apply-service.ts:134-144` (`validateSupersedingFactorySpec`) and `:62-67` (`FactorySpecRow` doesn't even select `fg_item_id`).
The BOM path enforces same-product (`eco-apply-service.ts:120-122`), but the spec path only checks `supersedes_factory_spec_id === target.id` **OR** `version > target.version` plus status. Versions are per-FG counters (`create-factory-spec.ts:60-70`), so any approved/released spec **for a completely different FG item** with a numerically higher version passes both `linkEcoSupersession` and `applyEcoOnClose`. An ECO targeting spec A (product X) can be closed "applied" with product Y's spec recorded as the superseding version — laundered into the ECO audit trail (`close-change-order.ts:76-87`).
Failure scenario: ECO targets FG-X spec v1; engineer links FG-Y spec v3 (approved_for_factory) → validation passes → ECO closes as applied with cross-product lineage.

**P1-2 — Bundle approval commits an orphaned e-signature and permanently bricks retry (partial-write on soft failure)**
`apps/web/lib/technical/release-bundle-service.ts:401-435`.
`signEvent` INSERTs the CFR-21 signature row with the **deterministic nonce** `` `${spec.id}:${bom.id}:approve` `` (`:413`; persisted in `packages/e-sign/src/sign.ts:239-244`, replay-checked at `:206-218`). It runs **before** `lockFactorySpecForApproval`. If the post-lock recheck then soft-fails (`:426-427` status changed, or `:429-435` pairing changed), the service `return { ok: false }` — and `withOrgContext` **COMMITS on any non-throw return** (`apps/web/lib/auth/with-org-context.ts:353-354`). Result: a persisted approval signature for a bundle that was never approved, and the fixed nonce is consumed — every subsequent approval attempt of that bundle by that signer throws `EReplayError` → `esign_failed`, with no recovery path. A single transient race (spec briefly flipped out of `in_review`) permanently blocks releasing that bundle. These two soft-fail paths must `throw` (rollback) instead of returning, or signing must happen after the lock.

### P2 findings

**P2-1 — RM-usability gate is TOCTOU; no FOR UPDATE on the BOM side (violates AC2)**
`release-bundle-service.ts:390` — `bomRmUsabilityFails` runs before the spec lock (`:425`) and the BOM is never locked at all (`loadBom :161-169` plain select; the BOM UPDATE `:459-468` only predicates on status). The BOM is still `draft`/`in_review` — its lines are mutable. Concurrent txn adds a `bom_line` referencing an inactive item between the check and the approval → bundle approves a BOM that fails RM usability, exactly what AC2 forbids. Needs `FOR UPDATE` on `bom_headers` before the usability check.

**P2-2 — `closeNpdReleaseLoop` has no status predicate: downgrades released rows and wipes blockers unconditionally**
`release-bundle-service.ts:288-310` — the `factory_release_status` UPDATE matches only org/project/product. A row already `released_to_factory` (or `blocked` with populated `release_blockers`) is force-flipped to `approved_for_factory` and `release_blockers = '[]'::jsonb`, silently clearing blockers that were never resolved. Contrast `syncFactoryReleaseStatusForReleasedSpec` (`factory-release-persistence.ts:186-187`) which does predicate on status.

**P2-3 — `rejectReleaseBundle` partial-write: status change commits while caller is told it failed, and no audit row**
`release-bundle-service.ts:585-620` — the spec→`draft` UPDATE succeeds, then if `writeAudit` throws, the catch returns `{ ok: false, error: 'persistence_failed' }` — a non-throw return, so `withOrgContext` COMMITS the demotion with **no audit record** (CFR context) and a "failed" response to the caller. Also `:571-573`: it never verifies `input.bomHeaderId === spec.bom_header_id`, so the audit row (`:602`) can record an arbitrary unrelated BOM as the rejected bundle partner.

**P2-4 — Release outbox event silently lost on re-release after recall**
`factory-release-persistence.ts:59` — `dedupKey` is a pure function of scope+bom+spec ids with a static app version. Flow: release → recall (`recall-factory-spec-core.ts`) → re-approve → re-release: the INSERT hits `on conflict … do nothing` (`:79-80`) and reuses the **old** event id (`:84`). No new `fg.released_to_factory` event is ever emitted for the second release; event-driven consumers (D365 sync, notifications) never learn the spec is live again.

**P2-5 — Recall leaves `factory_release_status` claiming an approved spec that is now draft**
`recall-factory-spec-core.ts:138-162` — the spec is reset to `draft` with `approved_by/approved_at/released_by/released_at` nulled, but `factory_release_status` is only moved `released_to_factory → approved_for_factory` while `active_factory_spec_id` still points at the recalled (now-draft) spec and the row's approval evidence fields survive (allowed by mig 125's `factory_usable_evidence_check`). Anything gating on `release_status = 'approved_for_factory'` + `active_factory_spec_id` sees a factory-usable spec that no longer has approval evidence.

**P2-6 — ECO close races recall: superseding spec/BOM validated without FOR UPDATE**
`eco-apply-service.ts:220-229` (and `:162-165` for BOMs) — `close-change-order.ts:26-33` locks the ECO row only. The superseding spec is validated as `approved_for_factory|released_to_factory` via plain SELECT; a concurrent `recallFactorySpecInTransaction` (released→draft) between validation and commit closes the ECO as "applied" with a draft spec recorded in the audit payload as the applied supersession.

**P2-7 — nullable `product_id` asserted non-null**
`eco-apply-service.ts:178,190,204` — `supersedingBom.product_id!` after a validation that treats `null === null` as a product match (`:120`); two product-less BOMs pass and `null` flows into `publishBomVersion.productId` and the result payload.

### Verified CLEAN

- `approveReleaseBundle` hard-failure paths (`throw` at `:453,470,550`) correctly roll back via `withOrgContext`; supersede-after-update ordering (`:474-484`) is safe; outbox + audit are in-txn.
- `lockFactorySpecForApproval` (`:149-159`) uses `FOR UPDATE` with org scope and re-checks status + BOM pairing after locking.
- `guardStatusTransition` / `guardBusinessFieldEdit` transition tables match the mig-165 clone-on-write contract, incl. the mig-453 `released_to_factory → draft` recall edge; no `draft → approved_for_factory` shortcut.
- `releaseFactorySpecToFactory` (`factory-spec-flow.ts:297-372`): spec locked `FOR UPDATE`, approval-evidence + BOM-pairing checks, NPD specs correctly diverted to NPD handoff (`:323-330`); `transitionFactorySpecToReleased` is status-predicated and idempotent (`released_at` coalesce).
- `closeChangeOrder` locks the ECO `FOR UPDATE` with status predicate; `EcoApplyAbort`/`EcoCloseAbort` throw-to-rollback pattern is correct; `publishBomVersion` performs all validations before its first write, so its `ok:false` returns commit nothing.
- `createFactorySpec` clone-on-write: fresh row (no shared mutable child rows), advisory-lock-serialized version allocation, `supersedesSpecId` validated as same-FG prior version.
- `linkFactorySpecBom` enforces product/FG match and draft/in_review-only, status-predicated UPDATE.
- Self-supersession in ECO validation is rejected (equal version fails `newerVersion`, no lineage).

### NOT covered

- The mig-165 DB trigger SQL itself (only its app-side mirror in the guards) and mig-125/453 trigger bodies beyond the constraint grep.
- `releaseNpdProjectToFactory` (NPD handoff caller of factory-release-persistence) — outside `lib/technical/`.
- `revert-to-npd.ts`, `reject-bundle.ts` action wrapper, `revalidate.ts`, `release-state-adapters.ts` internals, `bom/_actions/shared.ts` (`writeAudit`/`writeOutbox` impls), `hasPermission` internals.
- RLS policy correctness of the un-org-scoped queries (`loadFactorySpec`/`loadBom` in release-bundle-service rely entirely on RLS; assumed enforced by the app-role pool).
- Runtime/E2E reproduction — all findings are static.