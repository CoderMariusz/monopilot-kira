# Bug hunt — LOTO / calibration / POD e-sign (RBAC, e-sign bypass, tx safety, org scoping)

## Findings

### P1-1 — LOTO is schema-only: MWOs on LOTO-required equipment start/complete with zero lockout-tagout enforcement
- **Evidence:** `packages/db/migrations/201-maintenance-schema-foundation.sql:93` (`equipment.requires_loto`), `:48` (`maintenance_settings.requires_loto_default`), `:218-237` (`mwo_loto_checklists` with dual e-sign columns per OSHA 29 CFR 1910.147), `packages/db/migrations/220-loto-sanitation-distinct-actor.sql:8-12` (distinct-signers constraint).
- **Gap:** `transitionMwo` (`apps/web/app/[locale]/(app)/(modules)/maintenance/_actions/mwo-actions.ts:722-814`) transitions `open → in_progress → completed` with no check of `equipment.requires_loto` and no read/write of `mwo_loto_checklists`. Repo-wide grep: **zero** app-code references to `requires_loto`, `requires_calibration`, `mwo_loto_checklists`, or `mwo_checklists` outside migrations — no writer exists anywhere. The safety gate the schema mandates (zero-energy verify + release verify, two distinct e-signed actors) is silently bypassed on every MWO execution.
- **Mitigating note:** migration comment marks this as future slice D-MNT-15/T-014, and no UI sets `requires_loto` yet — but the MWO execute path is live in prod, so any SQL/seed-set flag is ignored without warning.

### P1-2 — recordCalibration has no e-sign at all (single-actor, no credential, no reviewer)
- **Evidence:** `apps/web/app/[locale]/(app)/(modules)/maintenance/calibration/_actions/calibration-actions.ts:387-399` — explicit `TODO(e-sign follow-up — F4-H2)`; insert sets `calibrated_by = ctx.userId` and never writes `reviewer_signed_by`; no PIN/password verification, no `e_sign_log` row, no `audit_events` row.
- **Contrast:** POD (`ship-actions.ts:653`) and the LOTO design require CFR-11-style `signEvent`. Calibration records (ISO 9001/NIST traceable, `retention_until` generated column) are created and can FAIL-deactivate instruments purely on a session cookie + `mnt.calib.record`. Documented follow-up, but it's a compliance-critical write path already live.

### P1-3 — `OUT_OF_SPEC` calibration result is treated as success: instrument stays active, emits `maintenance.calibration.completed`
- **Evidence:** `calibration-actions.ts:417-432` — only `result === 'FAIL'` deactivates the instrument; the event-type ternary maps `OUT_OF_SPEC` → `'maintenance.calibration.completed'`. Schema check `packages/db/migrations/201-maintenance-schema-foundation.sql:397-398` defines `OUT_OF_SPEC` as a distinct third state.
- **Failure scenario:** technician records `OUT_OF_SPEC` on a scale → instrument remains `active = true`, `next_due_date` advances a full interval, downstream consumers see a "completed" event. An out-of-tolerance instrument keeps measuring production/QA values for the whole next interval.

### P2-1 — recordCalibration: no `active` check, future-dated calibrations accepted, PASS never reactivates
- **Evidence:** `calibration-actions.ts:367-381` — instrument lookup has no `active = true` predicate; `calibratedAt` (schema `calibration-schemas.ts:48`, `.datetime()`/`.date()`) accepts future dates → `computeNextDueDate` (`:61-65`) pushes `next_due_date` arbitrarily far. Asymmetry: FAIL auto-deactivates (`:417-427`) but a subsequent PASS does not reactivate — register shows latest record PASS while instrument silently stays inactive (reactivate needs the *different* `mnt.asset.edit` permission, `:323`).

### P2-2 — POD evidence is a client-supplied arbitrary URL; e-sign binds the URL string, not the document
- **Evidence:** `ship-actions.ts:40` (`signedPdfUrl: z.string().trim().url()` — any host, any https URL) stored verbatim at `:675` as `bol_signed_pdf_url`; e-sign subject at `:653-657` hashes the URL string only. Contrast `generateBol` which sha256-hashes the payload (`:587`). The signed-POD document has no content hash and no storage-domain allowlist — the file behind the URL can be swapped after signing, defeating the tamper-evidence the e-sign is meant to provide.
- **XSS checked and CLEAN:** rendering guards to `/^https?:\/\//i` (`shipment-ship-controls.tsx:143,152-155,364-377`), so `javascript:` URLs never become hrefs.

### P2-3 — e-sign replay protection is opt-in and inert for POD
- **Evidence:** `packages/e-sign/src/sign.ts:205` — `nonce = parsed.nonce ?? randomUUID()`; the replay lookup (`:206-218`) matches on `nonce`, so any caller omitting the nonce gets a fresh one per call and `EReplayError` can never fire. `recordPod` passes the nonce as client-optional (`ship-actions.ts:44`) and the modal (`record-pod-modal.tsx:113-118`) never sends one. Only the shipment state machine (`shipped → delivered`) prevents duplicate PODs.
- Also: no `record_pod` row found in any `signoff_policies` seed (grep across `packages/db/migrations/*.sql` = 0 hits) → `readSignoffPolicy` returns `null` and role/dual-sign enforcement (`sign.ts:119-136`) is a no-op unless an org configures it manually.

### P2-4 — signPodDelivery collapses all e-sign failures into one opaque code
- **Evidence:** `ship-actions.ts:88-90` — `catch { throw new ActionError('esign_failed') }` swallows `EPinFailedError` vs `ESignPolicyError` vs `EReplayError`. A signer blocked by signoff policy (role mismatch, second-signature-required) is indistinguishable from a typo'd password; PIN-lockout signals are hidden too.

### P2-5 — generateBol stores the full JSON BOL payload in the `bol_pdf_url` text column
- **Evidence:** `ship-actions.ts:590-611` — `$5 = serializedPayload` (the whole JSON) written to `bol_pdf_url`; the UI must special-case it (`shipment-ship-controls.tsx:352-357` comment: "persisted but NOT a browsable URL"). Acknowledged in a comment, but after reload the BOL reference is unrecoverable (only the em-dash renders) and the column type lies. Also `generateBol` is gated by `ship.ship.confirm` (`:543`), not `ship.bol.sign` — carrier/tracking/BOL are mutable on already-`shipped` shipments (`:566`) with no e-sign or audit event.

## Verified CLEAN
- **RBAC:** every mutation in `mwo-actions.ts`, `calibration-actions.ts`, `list-calibration.ts`, `ship-actions.ts` re-checks `hasPermission` server-side (correct SoD: `mnt.mwo.cancel` split from execute at `mwo-actions.ts:730-731`; POD gated by `ship.bol.sign` at `ship-actions.ts:628`). Client `canPod`/permission flags are advisory-only (`record-pod-modal.tsx:13-15`) — no client-trusted flag reaches a write.
- **Org scoping:** all queries in the four action files + `pm-mwo-generate.ts` carry `app.current_org_id()` predicates on every table and join (`equipment`, `maintenance_schedules`, `shipment_box_contents`, `license_plates`, allocations…). `mwo_loto_checklists` is in the migration-201 FOR ALL RLS union (`201:473`). The only unscoped query is `sign.ts:147-149` (`users` email lookup) — safe because `signerUserId` is always the session user.
- **Transaction safety:** each action runs inside one `withOrgContext` txn; `transitionMwo` uses `FOR UPDATE` + from-state re-assertion (`mwo-actions.ts:742-779`); MWO numbering under per-org advisory xact lock (`:303-318`); `shipShipment` food-safety re-check throws → rolls back the status flip (`ship-actions.ts:311-336`); LP decrement guarded by `lp.quantity >= shipped_qty` + rowcount check (`:378-385`); e-sign log + audit are in the same txn as the status write.
- **e-sign core:** replay 23505 fallback handled (`sign.ts:311-315`); mistyped-password-never-burns-PIN-lockout guard (`:197-201`); canonical-JSON subject hashing deterministic.
- **XSS via stored URLs:** blocked at render (see P2-2 note).

## NOT covered
- `so-transitions.ts` / `so-status-write.ts` internals (assumed correct from prior D1/D2 audit); `verifyPin` lockout internals; `debitWac`; `withOrgContext`/`hasPermission` implementations (trusted as previously audited).
- Warehouse module actions (`direct-adjust-actions.ts`, `count-actions.ts`) — my grep hits there were incidental, not LOTO/calibration/POD.
- Sanitation checklists (`mwo_checklists`, `sanitation_runs` if any) beyond confirming no app writers exist — same schema-only status as LOTO.
- Runtime/RLS behavior against live DB (static review only); e2e specs; scanner routes.