# Consolidated bug backlog — 2026-07-10 hunt (h1–h10 + 5 Opus scanners)

Deduplicated against `_meta/plans/2026-07-10-bugfix-waves.md` W1–W6. Dropped as already scheduled: WAC currency-pool family (W1), site fail-open RLS mig 383 re-found by h10 (W6), cost NUMERIC(10,4) precision re-found by h9 (W6), hold qa_status snapshot re-found by h7 creation-side (W3-6).

## Tally

**68 new findings: 1×P0, 40×P1, 27×P2.** By area: technical BOM/ECO/release-bundle 15, planning (imports/scheduler/MRP/capacity) 10, finance/costing 10, NPD pipeline/gates/formulation 8, shipping/POD 7, built-flag/product-view 6, production/quality 6, maintenance/calibration/LOTO 4, security/auth 2. Dominant themes: lifecycle state machines bypassed or raced (no `FOR UPDATE`, stale e-signs surviving reverts), money aggregated across currencies/UoMs without conversion, and partial-write commits via `withOrgContext`'s commit-on-non-throw-return semantics.

## Findings

### P0

**[N-01] [P0] Delegated role assignment escalates to owner/admin** — `apps/web/actions/users/assign-role.ts:74` requires only `settings.roles.assign` and the role query at :77 accepts any org role including owner/admin; the only guard (:109) is last-owner removal. Holder of a custom role with `settings.roles.assign` can assign `owner` to themselves, bypassing the denylist that user-creation already enforces (`user-role-policy.ts:10`). Fix: reject system/admin roles unless caller holds them; enforce target-role permission set ⊆ caller's. (h10)

### P1

**[N-02] [P1] User-editable JWT `user_metadata` weakens idle-timeout policy** — `apps/web/lib/auth/edge-middleware-policy.ts:219,233` reads `idle_timeout_min` from `app_metadata` then falls back to user-controlled `user_metadata`; value flows into `session-check.ts:157` expiry. A user sets a large timeout in their own metadata, refreshes token, and stretches a strict tenant timeout to the 8h cap; same source-order issue for `role`/`onboarding_completed_at` (:222-223). Fix: never fall back to `user_metadata` for policy decisions. (h10)

**[N-03] [P1] Deleting a progressed NPD project cascades through lifecycle history instead of `HAS_DEPENDENTS`** — `delete-project.ts:20` expects an FK violation, but migrations 232–235 declare `ON DELETE CASCADE` for packaging, trial batches, pilot runs, handoff checklists (and formulations). Deleting a progressed project silently destroys development/handoff history. Fix: restrictive FKs or explicit dependent probe under the project lock; prefer soft-delete. (h1)

**[N-04] [P1] Cancelling a partial-LP shipment cannot restore stock** — partial ship leaves LP status `available` (`ship-actions.ts:362,369`) but `cancelShipment.ts:619,628` restores only where `status='shipped'` and rolls back on 0 rows (:633). Cancel of any partial-LP shipment returns `persistence_failed` forever; the shipped units are unrecoverable. Test at `cancelShipment.test.ts:460-467` encodes the wrong expectation. Fix: restore from shipment snapshot, drop the status predicate. (h8)

**[N-05] [P1] Shipping one order releases other orders' allocations on the same LP** — `ship-actions.ts:424-435` joins `inventory_allocations` to packed contents by `license_plate_id` only; schema (mig 211:298,323) allows multiple allocations per LP. Shipping SO-A marks SO-B's allocation `released`, leaving ghost-reserved stock and stale line totals. Fix: join on `sales_order_line_id` and shipment's SO. (h8)

**[N-06] [P1] Case/pallet order quantities treated as raw base quantities** — `so-actions.ts:571,611,615` stores the entered number directly in `quantity_ordered` with UOM only in JSON; allocation (:669,697,708) compares it against LP base qty with no pack-factor conversion despite `267-items-pack-hierarchy.sql:5`. Order "3 cases of 12" allocates/ships 3 each. Fix: normalize to canonical inventory UOM with exact pack factors before allocation. (h8)

**[N-07] [P1] Registering output into a caller-supplied LP skips validation and inventory update** — `register-output.ts:85,698` accepts and stores `lp_id` from the API body; quantity init happens only when absent (:762), and the only check on a supplied LP is location (:790), yet a receipt stock-move is still posted (:803). Wrong-product/consumed LPs get output + ledger rows while `license_plates.quantity` never changes. Fix: reject caller LPs or lock+validate product/UOM/state and increment atomically. (h6)

**[N-08] [P1] Output genealogy includes fully-reversed consumption and false per-parent quantities** — parent selection (`register-output.ts:345`) groups all consumption rows without excluding negative counter-rows (`reverse-consume/route.ts:284`) and each edge stores the full output qty (:566). Fully-reversed LPs stay parents; two parents of a 9 kg output each claim 9 kg — recall/genealogy corrupted. Fix: net `sum(qty_consumed)` per LP, keep positive-net parents, define edge qty explicitly. (h6)

**[N-09] [P1] Disassembly cost basis is correction-asymmetric → permanently inflated output WAC** — `register-disassembly-output.ts:335` sums WAC snapshots only from `correction_of_id is null` rows (includes later-reversed ones) while `loadConsumedQtyKg` (:207-262) nets reversals. Partial reversal → reversed cost still allocated across outputs, pushed into `upsertWac` (:655) and `item_cost_history` (:664). Fix: net WAC snapshot the same way qty is netted. (opus-lib)

**[N-10] [P1] Recipe/portfolio cost roll-up: mixed currencies summed, no UoM conversion, uncosted lines silently dropped** — `list-recipe-cost.ts:190-207` / `list-portfolio-cost.ts:42-59` compute `sum(bl.quantity * vec.amount)` across currencies (label `MIXED` only), multiply free-text-UoM quantities (mig 090) by per-kg/per-supplier-unit prices (mig 405), and `and vec.amount is not null` (:198/:50) drops uncosted lines from the total with no excluded-count. Header KPI is a nonsense number feeding margin decisions. Fix: convert to one reporting currency via FX + UoM→kg conversion, refuse unconvertible, surface excluded-line count. (h9 + opus-lib, merged)

**[N-11] [P1] WO actual costing mixes non-GBP material with GBP labor/setup** — `wo-cost-actions.ts:303,309` discard material currency; :364,428 hardcode GBP labor; `wo-cost-math.ts:101` adds them. A 25 PLN/kg material sums directly with GBP labor. Fix: resolve all components into one WO currency via FX or block on mismatch. (h9)

**[N-12] [P1] Historical WO costs repriced with today's active cost** — `wo-cost-actions.ts:309-314` uses `effective_to is null` history rows, never the consumption/WO date. A cost roll retroactively changes completed-WO "actuals"; variance is non-reproducible. Fix: prefer the consumption-time WAC snapshot; fall back to the interval containing the WO date. (h9)

**[N-13] [P1] Backdated cost insertion corrupts history intervals** — `write-cost-ledger.ts:75-90` closes whichever row is open and inserts the backdated row with no `effective_to`; inserting July 1 while July 10 is active makes the older cost current and the ranges overlap. Fix: splice into neighbors, close new row at `next_date - 1`, add exclusion constraint. (h9)

**[N-14] [P1] Routing cost preview silently prices crew at 0/hr for non-GBP or missing labor rates** — `cost-preview.ts:98,152` hardcodes `lr.currency='GBP'` and `coalesce(rate,0)` (:85,139); non-empty crew wins over `cost_per_hour` (:75-82), so the op costs 0.00 with no warning. Fix: error/warn on missing rate; support rate currency. (opus-lib)

**[N-15] [P1] Gate revert never invalidates `gate_approvals` — stale e-sign satisfies the checkpoint on re-advance** — `revert-npd-gate.ts:78-91` touches only `npd_projects`; `gate-helpers.ts:242-282` accepts any historical `approved+esigned` row with no timestamp-vs-revert check. Approve G3/G4 → revert → change recipe → re-advance sails through on the pre-revert signature (BRCGS/CFR-21 problem). Fix: bind approvals to a gate-attempt/revision id or require latest decision newer than last revert. (h1 + opus-revert F6)

**[N-16] [P1] G4 approval bypasses `evaluateStageGate` and moves the project to handoff** — `approve-project-gate.ts:142-152` transitions `approval → handoff` after only `getBlockers()`, skipping required-field validation and soft-gate override audit that `advance-project-gate.ts:207` performs. Fix: approval records the checkpoint only; movement goes through `advanceProjectGate`. (h1)

**[N-17] [P1] Formulation "Add version" silently drops persisted columns** — `create-version.ts:56` omits `processing_overhead_pct` (mig 342); the ingredient clone (:85) omits `cost_currency` (mig 397), `substitute_item_id` (mig 424), `wip_definition_id` (mig 430), `npd_wip_process_id` (mig 450). New draft resets overhead and strips WIP routing/substitutes/currency without warning. Fix: clone every business column + regression test with non-default values. (h2)

**[N-18] [P1] Bundle approval commits an orphaned e-signature and permanently bricks retry** — `release-bundle-service.ts:401-435`: `signEvent` with deterministic nonce `` `${spec.id}:${bom.id}:approve` `` runs before the spec lock; the post-lock soft-fails (:426-435) `return {ok:false}`, which `withOrgContext` COMMITS (`with-org-context.ts:353-354`). The consumed nonce makes every retry throw `EReplayError` — one transient race blocks the bundle forever. Fix: throw on the soft-fail paths, or sign after the lock. (opus-eco P1-2)

**[N-19] [P1] ECO accepts a different FG's factory spec as the superseding version** — `eco-apply-service.ts:62-67` never selects `fg_item_id`; validation (:134-144) accepts any terminal spec with a higher version (versions are per-FG counters, `create-factory-spec.ts:60-70`). ECO targeting FG-X spec v1 closes "applied" with FG-Y's spec in the audit trail (`close-change-order.ts:76-87`). Fix: load and require equal `fg_item_id` (and prefer direct lineage). (h3 + opus-eco P1-1)

**[N-20] [P1] Released-BOM "clone" loses lineage and permits duplicate forks** — `bom-edit-dialog.tsx:367,395` calls `createBomDraft` without the source header; `create-draft.ts:180` writes no `supersedes_bom_header_id`, unlike the canonical DB helper (mig 168:153,168) which also reuses an in-flight child. Two edits fork divergent unrelated drafts; ECO lineage lost. Fix: route immutable-version edits through `bom_request_version_edit` or replicate its lineage/idempotency. (h3)

**[N-21] [P1] Routing approval races operation replacement** — `update-routing.ts:65` reads status unlocked, then deletes/recreates operations (:88) without recheck, while `approve-routing.ts:76` flips `draft → approved` concurrently. Approved routing content can differ from what was reviewed. Fix: `FOR UPDATE` on the routing row through child replacement. (h3)

**[N-22] [P1] Active WIP definitions versioned by destructive in-place mutation** — `wip-definition-actions.ts:143,153,192` bumps the version number but updates the same row and replaces its ingredients/processes. v3 content is destroyed; consumers pinned to the ID silently see v4. Fix: clone-on-write into a new version row with supersession lineage. (h3)

**[N-23] [P1] Factory-spec recall races WO creation** — `recall-factory-spec-core.ts:40` locks only the spec; the WO check (:59) is a separate unlocked query before the draft flip (:138). A WO created between check and commit ends up referencing a recalled draft spec. Fix: shared lock/advisory-lock protocol between WO binding and recall, or DB trigger. (h3)

**[N-24] [P1] Mig 359 re-grants full-column UPDATE (incl. `built`) on `product`, undoing mig-223 lockdown** — `359-product-as-items-view-cut.sql:165` grants blanket update to `app_user`; mig 223:197-217 had revoked `built` at the column level. Direct `SET built=…` app traffic works again with only the trigger check left. Fix: re-apply column-level grant excluding `built`. (opus-revert F1)

**[N-25] [P1] V18 downgrade guard rewritten to `session_user` breaks the audited built-reset path** — mig 359:399 raises on `session_user='app_user'`, but `session_user` is the login role and is NOT changed by SECURITY DEFINER, so the audited helper `fa_reset_product_built_for_edit` (mig 223:75-79), fired by the still-live prod_detail trigger (223:192-195), hard-fails under all app connections. Currently masked because main flows reset `built` via the view first; any prod_detail-first path aborts with `V18_BUILT_DOWNGRADE_REQUIRES_AUDIT`, and CI can't see it (integration test runs as owner). Fix: key the guard on `current_user` or a session GUC. (opus-revert F2; verify live login role, see Uncertain)

**[N-26] [P1] Built reset skips prod_detail INSERT/DELETE** — trigger `fa_reset_built_on_prod_detail_edit` (mig 223:192-195) is UPDATE-only; `add-prod-detail-component.ts:135,259,314` insert/delete components without resetting `built` or emitting `fa.built_reset`. A built product's recipe changes materially with the flag intact. Fix: extend trigger to insert/delete (cf. mig 222 allergen triggers). (opus-revert F3)

**[N-27] [P1] WIP process-model mutations never reset `built`** — mig 391:200-215 triggers on `npd_wip_processes` refresh allergens only; zero `built` references in migs 389/391. The successor to `manufacturing_operation_N` edits (which did reset built via mig 223) rewrites a built product's process list silently. Fix: add built-reset to the wip-process trigger family or `wip-process-actions.ts`. (opus-revert F4)

**[N-28] [P1] Direct `items` master edits bypass the built reset** — post-359 the reset lives only in `product_instead_of_update_fn` (359:413-430); `update-item.ts:74-96` updates `name`/`gs1_gtin`/`tare_weight`/`shelf_life_days` directly on `items`, which the view projects as product label fields. A built FG's label/GTIN changes with `built=true` and no event. Fix: mirror the reset in an `items` trigger for overlap columns. (opus-revert F5)

**[N-29] [P1] Settings→BOMs screen permanently empty: phantom `p.name` column** — `settings/boms/_actions/boms.ts:144,161` selects/groups `p.name`, but the `product` view (mig 359:66) exposes `product_name`; Postgres 42703 kills the query every time and the catch (:177-180) returns empty KPIs/rows as success. Fix: `p.product_name`. (opus-views)

**[N-30] [P1] PO `all_or_nothing` import commits successful groups alongside runtime failures** — validation runs in a separate txn (`import-po.ts:85` vs :109); inside the write txn runtime failures only accumulate (:133,183) and the callback returns normally (:199), committing earlier POs. Fix: revalidate in the write txn and throw on any runtime failure in all_or_nothing mode. (h4)

**[N-31] [P1] TO `all_or_nothing` import commits each order in its own transaction** — `import-to.ts:168` calls public `createTransferOrder`, which opens its own `withOrgContext` (`actions.ts:438,492`); outer rollback can't undo committed groups (:182,199). Fix: extract `createTransferOrderCore(ctx, input)` like the PO core, throw on first failure. (h4)

**[N-32] [P1] PO import bypasses the runtime schema used by single-create** — import validation skips `CreatePurchaseOrderInput` limits (80-char number, 3-char currency, 2000-char notes, 200 lines; `procurement-shared.ts:72`), concatenates notes unbounded (`import-po.ts:400`), and calls the core (:168) with no runtime validation into unconstrained text columns (mig 262:10). Fix: `safeParse` the grouped payload before the core, map issues to source rows. (h4)

**[N-33] [P1] Scheduler computes changeovers between WOs on different lines** — `sequence-solver.ts:258-291` uses the global-sequence predecessor as `previous` without a same-line check; Line 2 is charged an allergen cleanup from a WO that ran on Line 1, while its real predecessor is ignored. Fix: per-line tails for changeover derivation. (h5)

**[N-34] [P1] WO longer than daily capacity silently bypasses capacity enforcement** — `sequence-solver.ts:183-200`: a run exceeding daily capacity is bumped 400 times then scheduled at the original time with no reservation and no error — potentially on top of other work. Fix: split load across day buckets or reject as infeasible. (h5)

**[N-35] [P1] Cross-midnight WOs consume capacity only from the start day** — `sequence-solver.ts:184-193` checks/records the full duration in one bucket, while board reporting splits at day boundaries (`board.ts:210`). 23:00–03:00 WO leaves day two "free"; solver and displayed utilization disagree. Fix: intersect the interval with every affected bucket. (h5)

**[N-36] [P1] WO chain links duplicate WIP components to the first matching material row** — `create-work-order-chain.ts:211-213` makes a child per BOM line, but dependency wiring (:504-518) finds the FG material by `productId` alone; two lines with the same WIP item both point at the first `wo_materials` row and its quantity. Stage genealogy/readiness wrong for the second WO. Fix: link by BOM line/`bom_item_id`. (h5)

**[N-37] [P1] Passing a wo_output inspection releases the LP but leaves the output decision PENDING** — `inspection-actions.ts:356` calls only `releaseLpQaForContext`; `wo_outputs.qa_status` is transitioned only by production-owned `output-qa-actions.ts:89`. LP becomes usable while the canonical output record still says PENDING. Fix: one production-owned atomic transition doing both. (h7)

**[N-38] [P1] CCP/inspection holds deduplicated against unrelated active holds** — `createCcpDeviationHoldIfMissing` / `createInspectionHoldIfMissing` (`haccp-actions.ts:238,267`; `inspection-actions.ts:266,286`) treat any active hold on the same `(reference_type, reference_id)` as satisfying the safety event. Releasing an older administrative hold removes the only gate on an undispositioned CCP breach. Fix: idempotency keyed on the originating deviation/inspection, not the target. (h7)

**[N-39] [P1] LOTO is schema-only — MWOs on LOTO-required equipment execute with zero enforcement** — schema mandates dual-e-sign checklists (mig 201:93,218-237; mig 220), but `transitionMwo` (`mwo-actions.ts:722-814`) never reads `requires_loto` or `mwo_loto_checklists`; repo-wide, no app code references them. Any flag set via SQL/seed is silently ignored on a live prod path. Fix: gate `in_progress`/`completed` transitions on the checklist. (opus-loto; scoped as future slice D-MNT-15 — confirm, see Uncertain) (opus-loto P1-1)

**[N-40] [P1] recordCalibration has no e-sign at all** — `calibration-actions.ts:387-399` (explicit TODO F4-H2): no PIN/credential, no `e_sign_log`, no reviewer; ISO/NIST-traceable records and FAIL-deactivation ride on a session cookie + `mnt.calib.record`. Fix: wire `signEvent` like POD. (opus-loto P1-2; documented follow-up — confirm scope)

**[N-41] [P1] OUT_OF_SPEC calibration treated as success** — `calibration-actions.ts:417-432` deactivates only on `FAIL`; `OUT_OF_SPEC` (a distinct state, mig 201:397-398) leaves the instrument active, advances `next_due_date` a full interval, and emits `maintenance.calibration.completed`. An out-of-tolerance scale keeps measuring production for the whole interval. Fix: treat OUT_OF_SPEC as failure (deactivate or force disposition). (opus-loto P1-3)

### P2

**[N-42] [P2] Project deletion detaches approval audit rows and emits no deletion event** — `gate_approvals.project_id` SET NULL on delete (mig 085:60); `npd.project.deleted` missing from the outbox allow-list, insert failure caught and deletion committed anyway (`delete-project.ts:60`, `events.enum.ts:79`). Fix: allow-list the event, make it atomic, keep a durable project identifier on approvals. (h1)

**[N-43] [P2] `rollbackGate` is a weaker parallel revert: no PIN e-sign, no release-lock check, multi-gate jumps** — `revert-gate.ts:21-25,110-117` vs `revert-npd-gate.ts:52-54`; same permission. No UI importer found, but it's a live exported `'use server'` endpoint. Fix: delete it or bring to parity. (opus-revert F7)

**[N-44] [P2] Revert outbox `dedupKey` embeds `Date.now()` → dedup is a no-op** — `revert-npd-gate.ts:90`, `revert-gate.ts:85`; retries emit duplicate `npd.gate.reverted`. Fix: deterministic key (project+gate+revision). (opus-revert F9)

**[N-45] [P2] Formulation deletion leaves orphaned nutrition records** — `nutrition_profiles/nutrition_allergens/nutri_score_results.formulation_version_id` are bare UUIDs with no FK (mig 086:34,48,64) while versions cascade (mig 093:18). Fix: add cascading (or SET NULL) FKs after cleaning existing orphans. (h2)

**[N-46] [P2] Where-used reports draft/superseded/archived BOM content as current usage** — `list-where-used.ts:28,33,47` joins all `bom_headers` and `DISTINCT ON` picks the numerically latest version; a draft removing the component hides real active usage. Fix: filter to active BOMs or return version+status. (h3)

**[N-47] [P2] `item_type` mutable in place after typed dependencies exist** — `update-item.ts:67-76` validates only status; an active FG with released BOMs can become RM/packaging. Fix: freeze `item_type` once active/referenced. (h3)

**[N-48] [P2] Bundle RM-usability gate is TOCTOU; BOM never locked** — `release-bundle-service.ts:390` check runs before the spec lock; BOM (`loadBom` :161-169) is a plain select and stays draft-mutable. Concurrent bom_line insert between check and approve violates AC2. Fix: `FOR UPDATE` on `bom_headers` before the usability check. (opus-eco P2-1)

**[N-49] [P2] `closeNpdReleaseLoop` has no status predicate — downgrades released rows and wipes blockers** — `release-bundle-service.ts:288-310` force-flips `released_to_factory`/`blocked` rows to `approved_for_factory` with `release_blockers='[]'`. Fix: status-predicate like `factory-release-persistence.ts:186-187`. (opus-eco P2-2)

**[N-50] [P2] `rejectReleaseBundle` partial-write: demotion commits with no audit row while caller sees failure** — `release-bundle-service.ts:585-620`; catch returns `{ok:false}` (non-throw → commit). Also never verifies `input.bomHeaderId === spec.bom_header_id` (:571-573), so the audit can name an unrelated BOM. Fix: throw on audit failure; validate the pairing. (opus-eco P2-3)

**[N-51] [P2] Release outbox event silently lost on re-release after recall** — `factory-release-persistence.ts:59,79-84`: static dedupKey hits `on conflict do nothing` on the second release; D365/notification consumers never learn the spec is live again. Fix: include a release-attempt discriminator in the key. (opus-eco P2-4)

**[N-52] [P2] Recall leaves `factory_release_status` pointing at a now-draft spec** — `recall-factory-spec-core.ts:138-162` resets the spec to draft but only moves the status row `released → approved_for_factory` with `active_factory_spec_id` and approval-evidence fields intact. Fix: clear/downgrade the status row consistently. (opus-eco P2-5)

**[N-53] [P2] ECO close races recall — superseding spec validated without `FOR UPDATE`** — `eco-apply-service.ts:220-229` plain SELECT; concurrent recall between validation and commit closes the ECO "applied" against a draft spec. Fix: lock the superseding spec/BOM rows. (opus-eco P2-6)

**[N-54] [P2] Nullable `product_id` asserted non-null in ECO apply** — `eco-apply-service.ts:178,190,204` use `supersedingBom.product_id!` after a `null===null` product-match (:120); `null` flows into `publishBomVersion.productId`. Fix: reject product-less BOM pairs. (opus-eco P2-7)

**[N-55] [P2] Blocking a supplier races PO creation** — unlocked status read (`create-purchase-order-core.ts:169`) vs unguarded supplier update (`suppliers/actions.ts:276,283`); PO inserts against a just-blocked supplier. Fix: lock the supplier row during the check or DB trigger. (h4)

**[N-56] [P2] Capacity-block wall-clock times forced to UTC** — `board.ts:122-124` appends `Z` to tz-free date/time columns (mig 423:12); a 09:00 London block renders at 10:00 during BST and conflict detection shifts seasonally. Fix: interpret in site IANA tz server-side or store timestamptz. (h5)

**[N-57] [P2] Portfolio totals converted from exact NUMERIC to JS float** — `list-portfolio-cost.ts:71` `Number(...)`, formatted with `toFixed(2)` (`portfolio/page.tsx:104`), violating the module's own string-decimal rule. Fix: keep decimal strings + existing BigInt helpers. (h9 + opus-lib, merged)

**[N-58] [P2] OR-join in cost roll-ups can fan out and double-count a line** — `(ci.id = bl.item_id or ci.item_code = bl.component_code)` (`list-recipe-cost.ts:194,255`, `list-portfolio-cost.ts:46`) matches two items when a re-created item shares the code. Fix: prefer id, fall back to code only when id is null. (opus-lib)

**[N-59] [P2] V-TEC-53 20% cost-change guard compares across currencies** — `write-cost-ledger.ts:59-70` ignores the currency column: GBP→PLN repricing false-triggers, same-number currency switch passes. Fix: compare within currency or convert first. (opus-lib)

**[N-60] [P2] Disassembly ledger currency: silent GBP fallback + relabel without conversion** — `register-disassembly-output.ts:304,670`; allocated value comes from snapshots whose currency was never stored, yet caller-supplied `currency` relabels it. Fix: store snapshot currency, refuse mismatched relabels. (opus-lib)

**[N-61] [P2] MRP planned-order release computes WO material scalar in JS floats** — `mrp.ts:1361-1368,1399` `Number(...)`+`toFixed(6)` feeding `required_qty`, breaking the bigint micro-unit discipline of `mrp-compute.ts`. Fix: reuse the micro-unit helpers. (opus-lib)

**[N-62] [P2] Catch-weight daily variance row misattributes site** — `catch-weight-variance.ts:113,118,138` groups by item only and pins `min(site_id::text)`; two-site items get one blended row on an arbitrary site, unrecoverable given the `(org,item,day)` upsert key. Fix: add site to the group/key. (opus-lib)

**[N-63] [P2] Catch-weight items with missing/zero nominal invisibly excluded from monitoring** — `catch-weight-variance.ts:109` drops them with no log/counter/exception row; a misconfigured item can never alert. Fix: emit a skipped-samples signal. (opus-lib)

**[N-64] [P2] Calibration: no active-instrument check, future dates accepted, PASS never reactivates** — `calibration-actions.ts:367-381,417-427`; future `calibratedAt` pushes `next_due_date` arbitrarily; FAIL deactivates but PASS can't undo it (needs separate `mnt.asset.edit`). Fix: validate active+date, reactivate on PASS or surface state. (opus-loto P2-1)

**[N-65] [P2] POD evidence is an arbitrary client URL; e-sign binds the string, not the document** — `ship-actions.ts:40,675,653-657`: any https URL, no content hash, no storage allowlist; file behind the URL swappable after signing. Fix: hash document content and restrict to own storage. (opus-loto P2-2)

**[N-66] [P2] POD e-sign replay protection inert + no signoff policy seeded** — `sign.ts:205` mints a fresh nonce when the caller omits it and `record-pod-modal.tsx:113-118` never sends one; no `record_pod` row in any `signoff_policies` seed, so role/dual-sign enforcement is a no-op. Fix: server-derived deterministic nonce; seed the policy. (opus-loto P2-3)

**[N-67] [P2] signPodDelivery collapses all e-sign failures into `esign_failed`** — `ship-actions.ts:88-90` swallows `EPinFailedError` vs `ESignPolicyError` vs `EReplayError`; lockouts and policy blocks look like typos. Fix: map error classes to distinct codes. (opus-loto P2-4)

**[N-68] [P2] generateBol stores the JSON payload in `bol_pdf_url` and BOL fields mutable on shipped shipments without e-sign** — `ship-actions.ts:590-611,543,566`; after reload the BOL reference is unrecoverable, and carrier/tracking edits on shipped shipments are gated by `ship.ship.confirm` with no audit event. Fix: store payload in a proper column/storage, gate mutation + audit. (opus-loto P2-5)

## Proposed fix-waves (W7+)

Ordered security & data-loss first; each clusters one domain/file-set for a single Composer agent.

- **W7 — Security & NPD gate integrity**: N-01 (assign-role escalation), N-02 (JWT metadata timeout), N-15 (stale gate approvals survive revert), N-16 (G4 bypass), N-03 (delete-project cascade), N-44 (revert dedupKey).
- **W8 — Shipping stock & POD integrity**: N-04 (partial-LP cancel), N-05 (cross-order allocation release), N-06 (case/pallet qty), N-65 (POD URL binding), N-66 (POD replay/policy), N-67 (opaque e-sign errors).
- **W9 — Production output, genealogy & QA handshake**: N-07 (caller-supplied LP), N-08 (genealogy reversed consumption), N-09 (disassembly cost asymmetry), N-60 (disassembly currency), N-37 (inspection vs output QA), N-38 (CCP hold dedup).
- **W10 — Money roll-ups (technical cost + finance)**: N-10 (recipe/portfolio currency+UoM+dropped lines), N-11 (WO costing currencies), N-12 (historical repricing), N-13 (backdated intervals), N-14 (routing preview 0/hr), N-59 (V-TEC-53 currency-blind).
- **W11 — Built-flag / product-view pack (mig 359 fallout)**: N-24 (built grant regression), N-25 (session_user guard), N-26 (insert/delete reset gap), N-27 (WIP-process reset gap), N-28 (items-edit reset gap), N-29 (settings BOMs p.name).
- **W12 — Release bundle & ECO**: N-18 (bricked bundle retry), N-19 (cross-FG supersession), N-49 (blocker wipe), N-50 (reject partial-write), N-51 (lost re-release event), N-52 (stale release status after recall).
- **W13 — Scheduler & MRP**: N-33 (cross-line changeover), N-34 (capacity bypass), N-35 (cross-midnight), N-36 (chain dup-WIP link), N-56 (capacity-block UTC), N-61 (MRP float scalar).
- **W14 — Planning imports & procurement**: N-30 (PO all_or_nothing), N-31 (TO per-order txns), N-32 (import schema bypass), N-55 (supplier-block race), N-62 (catch-weight site), N-63 (catch-weight nominal).
- **W15 — Technical BOM/routing/WIP lifecycle**: N-20 (BOM clone lineage), N-21 (routing approval race), N-22 (WIP destructive versioning), N-23 (recall vs WO race), N-46 (where-used), N-47 (item_type freeze).
- **W16 — Formulation + maintenance/calibration**: N-17 (create-version drops columns), N-45 (nutrition orphans), N-41 (OUT_OF_SPEC), N-64 (calibration validation), N-40 (calibration e-sign), N-39 (LOTO gate).
- **W17 — P2 sweep**: N-42 (deletion audit/event), N-43 (rollbackGate), N-48 (RM-usability TOCTOU), N-53 (ECO close vs recall race), N-54 (product_id!), N-57 (portfolio float), N-58 (OR-join fan-out), N-68 (BOL payload/mutation).

## Uncertain / needs verification

- **N-25 precondition**: the `session_user='app_user'` failure assumes Vercel's `DATABASE_URL_APP` logs in as role `app_user` — inferred from `with-org-context.ts` comments and grants, not verified against the live env. Check `select session_user` on the app pool before building the fix.
- **N-39 / N-40 scope**: LOTO enforcement is marked as future slice D-MNT-15/T-014 and calibration e-sign as follow-up F4-H2 in the code itself. Real compliance gaps on live paths, but confirm with the owner whether they're bugs to fix now or scheduled feature work before burning a wave slot.
- **Revert stage snap-back (opus-revert F8)**: single-gate revert from `handoff` lands on `packaging`, discarding intermediate stages — documented as intentional ("earliest stage of that gate"), so likely by-design; the UX blast radius (silent loss of intra-gate progress) needs an owner decision, not a code fix.
- **Live-DB drift**: opus-views verified migrations-as-written only; hand-applied changes on prod (khjvkhzwfzuwzrusgobp) could invalidate N-29 or hide other phantom columns. One `psql \d product` on prod confirms.
- **Dynamic SQL surfaces** (reference_tables row_key queries, `to_jsonb(p)->>key` in mig 106) were not auditable statically — string-keyed misses fail silently to NULL rather than erroring.
