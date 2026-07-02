# Wave F3 A1 — Gap Audit: NPD + Technical + Settings
Tree @ 4248cbc0. Read-only reality audit. Verdicts backed by file:line I actually read.
Roadmap cross-ref: _meta/plans/2026-07-02-ROADMAP-master.md.

## Module A — NPD

| ID | Sev | Tag | Finding | Evidence |
|----|-----|-----|---------|----------|
| NPD-1 | P1 | [KNOWN 1.3] | RM allergen edit does NOT enqueue a cascade rebuild. `saveAllergenOverride`/`clearAllergenOverride` → `upsertProfile`/`deleteProfile` write the item profile + audit + override-ledger but never insert into `allergen_cascade_rebuild_jobs`, so downstream FG allergen cascades go stale silently after an RM allergen change (food-safety). The worker consumer IS registered. | `apps/web/lib/technical/allergens/service.ts:126-187` (no rebuild enqueue); allergen-profile action `apps/web/app/[locale]/(app)/(modules)/technical/items/[item_code]/_actions/allergen-profile.ts:197-241`; consumer `apps/worker/src/index.ts:8` |
| NPD-2 | P3 | [KNOWN 1.1] | Promote-to-production revert wedge is FIXED: release blockers now throw `PromoteAbort('release_blocked')` inside the txn → rolls back; no fake BOM. Verified addressed, not a live gap. | `.../pipeline/[projectId]/handoff/_actions/promote-to-production.ts:146-159,227-232` |
| NPD-3 | P3 | [KNOWN 1.2] | FG-already-linked re-entry dead-end largely FIXED: `createFgCandidate` resolves+remaps the existing linked code instead of burning a new sequence; only throws FG_ALREADY_LINKED on an explicit *different* requested code. `/products/new` now uses `fg.create`+`createFa`+code-mask consistently. Verified addressed. | `apps/web/app/(npd)/pipeline/_actions/_lib/gate-helpers.ts:431-483`; `.../products/new/page.tsx:135-207` |
| NPD-4 | P2 | [NEW] | NPD sensory stage is READ-ONLY with no entry path in-pipeline: the screen renders scores/radar + "Export scores" only; no create-session / record-score UI. Data must be entered in the separate Technical › Sensory module (`technical_sensory_evaluations`). A user in the NPD pipeline sensory tab cannot record a tasting there. | `.../pipeline/[projectId]/sensory/_components/sensory-screen.tsx:237-287` (only export btn); reader `.../sensory/_actions/getSensoryPanel.ts:127,155,169`; writer only in `.../(modules)/technical/sensory/_actions/record-sensory-evaluation.ts` |
| NPD-5 | P3 | [KNOWN SC §14 B-63] | Project brief stores/reads/writes `target_retail_price_eur` in a GBP-only org; brief screen renders `targetRetailPriceEur` — `*Eur` naming + currency-label mismatch. | `.../brief/_actions/update-project-brief.ts:48,77,105,130`; `.../brief/_components/project-brief-screen.tsx:313` |
| NPD-6 | P3 | [KNOWN T1/FG U5] | Owner-workload page is entirely hardcoded EN ("Owner workload", "Owner", "Gate") — no i18n. | `.../pipeline/workload/page.tsx:14,24` |

## Module B — Technical

| ID | Sev | Tag | Finding | Evidence |
|----|-----|-----|---------|----------|
| TEC-1 | P2 | [NEW] | Contamination-risk matrix is a claim-vs-enforcement gap: the screen's docstring claims it "feeds the allergen-changeover gate in 08-PRODUCTION (PRD §10.5)", but `allergen_contamination_risk` is read by NOTHING in scheduler/production — only its own load/save. The matrix an operator fills has zero effect on any changeover/sequencing gate. | claim `.../technical/allergens/contamination-risk/page.tsx:5-6`; writer `apps/web/lib/technical/allergens/contamination.ts:95-119`; readers = only `.../allergens-config/_actions/load-config.ts` (no production/scheduler consumer) |
| TEC-2 | P3 | [NEW] | Where-used screen dead-end + no i18n: only loads when `?code=` is in the URL; the on-screen input only *filters already-loaded rows* ("Filter loaded results"), so a user landing with no query sees "Enter a code in the URL" and has no way to enter one. Entire screen is hardcoded EN. | `.../technical/where-used/page.tsx:40-56,84-102` (all inline EN, no code-entry action) |
| TEC-3 | P3 | [NEW] | Materials list silently truncates at 200 with no warning: it calls `listItems({itemTypes})` but destructures only `{items,canCreate,state}`, discarding the `total`/`truncated` flags that the Items list DOES surface. Same `listItems` (MAX 200). | `.../technical/materials/page.tsx:37`; contrast `.../technical/items/page.tsx:78,205` (surfaces `list.truncated`); `list-items.ts:111,131,185-186` |
| TEC-4 | P2 | [KNOWN 4.7 / 2.2] | Factory specs have NO document render/print/export: list + create + review + recall + bundle-approval exist, but the "factory spec" (a compliance document) cannot be rendered/printed/exported. Spec payload also thin (roadmap 4.7). | `.../technical/factory-specs/_actions/` (bundle-data / list / recall / shared — no pdf/print/export) |
| TEC-5 | P3 | [KNOWN 6.6/OD-14] | `settings/processes` writes `reference.processes` dual-store (shadows `Reference.ManufacturingOperations`); Finance WO cost reads the reference_tables side → cost↔operation disconnect. Confirmed dual-store still present. | `.../(admin)/settings/processes/page.tsx:11-40` (SingleReferenceScreen, tableCode 'processes') |
| TEC-6 | P3 | [info] | ECO (change-order) "start implementation" / "close" only flip status; they do NOT auto-apply BOM changes (governance record, actual edit via normal BOM flow). Acceptable by design; noted so it isn't mistaken for an auto-applier. | `.../technical/eco/_actions/start-change-order-implementation.ts:24-32`; `close-change-order.ts:24-32` |
| TEC-7 | P3 | [info] | BOM version state machine is sound (draft→technical_approved→active→superseded) with clone-on-write immutability; no dead-end. Recorded as a NON-gap for balance. | `.../technical/bom/_actions/workflow.ts:60-167` |

## Module C — Settings

| ID | Sev | Tag | Finding | Evidence |
|----|-----|-----|---------|----------|
| SET-1 | P1 | [NEW] | Sign-off policies configured in Settings › Sign-off are UNENFORCED. The screen writes `signoff_policies` (Required signatures, First/second signer role, Allow same user) but NO e-sign/quality/production path reads that table — grep for `signoff_policies` / `required_signatures` / `second_signer` outside the settings screen = 0 hits. Configuring dual-sign or a signer-role restriction has zero effect (food-safety/21 CFR 11 control). NOTE: the *overconsume* thresholds on the same screen ARE enforced (via tenant feature_flags), so the screen mixes one wired + one dead control. | screen `.../(admin)/settings/signoff/_actions/signoff-actions.ts`; overconsume reader `.../(modules)/production/_actions/consume-material-actions.ts:373-382`; no `signoff_policies` reader anywhere in app/lib (only settings screen + tests) |
| SET-2 | P2 | [NEW] | User deactivation is a one-way door: `deactivate.ts` sets `is_active=false` but there is NO `reactivate` action anywhere (`set is_active = true` for a deactivated user = 0 hits). The list even shows/counts 'disabled' users but offers no path back to active. Dialogs present: Deactivate, RoleAssign, AssignSites, Invite — no Reactivate. | writer `apps/web/actions/users/deactivate.ts:74-95`; list shows disabled `.../settings/users/page.tsx:234,306`; dialogs dir `.../settings/users/_components/` (no Reactivate/ResetMfa) |
| SET-3 | P2 | [NEW] | No admin MFA reset/recovery: users page READS `mfa_enrolled` (badge) but there is no action to reset/clear a user's MFA. A user who loses their authenticator cannot be recovered by an admin. (roadmap 0.7 notes `force-mfa.ts` is dead code, but there's no benign reset either). | read `.../settings/users/page.tsx:57,223,304`; no reset-mfa action in `apps/web/actions/users/` |
| SET-4 | P3 | [KNOWN 6.9] | Heavy settings route duplication: ~10 pages are 10-line legacy redirects (audit-logs, warehouses, manufacturing-ops, d365-conn, email-config, schema-migrations, schema-wizard, shipping-overrides, settings root) + re-export aliases (profile, my-profile, my-notifications). Twin-trap maintenance surface. | e.g. `.../settings/warehouses/page.tsx:1-10`, `.../settings/profile/page.tsx` re-exports company |
| SET-5 | P3 | [info] | Users overhaul is genuinely landed: create-with-password, invite, resetPassword, assignRole, assignUserSites, deactivate, last_login_at, CSV export, mfa_enrolled badge, active/invited/disabled KPI counts. Remaining gaps = SET-2 (reactivate) + SET-3 (MFA reset). | `.../settings/users/page.tsx:3-11,232-234,371` |
| SET-6 | P3 | [info] | Positive controls verified as NON-gaps: audit-log screen has real page/pageSize/total pagination (no silent trunc); npd-fields settings write `npd_field_catalog`/`npd_departments` and the FA dynamic sections READ the same tables (field catalog dual-store resolved); rules registry is intentionally a read-only viewer. | audit `.../settings/audit/audit-log-loader.ts:173,202-209,227-228`; npd-fields write `.../settings/npd-fields/_actions/npd-field-config.ts:275,289`, FA read `.../(npd)/fg/[productCode]/_actions/load-fa-dynamic-sections.ts:131,135` |

## Phantoms / carry-forwards
- Mig 408 (fa_allergen_cascade cross-org leak, roadmap 0.1) was slated to apply "tonight"; the allergen-cascade page reads the `fa_allergen_cascade` VIEW (`.../(npd)/allergen-cascade/page.tsx`). DB-apply state not verified here (migration lane owns it) — flag to confirm 408 is LIVE before trusting the cascade cross-org boundary.
- Route-tree twin-trap (SET-4) means some NPD/Technical/Settings actions still live in the OLD `(npd)`/`(settings)` trees and are imported cross-tree (e.g. FG detail docs/risks import `(npd)/fa/[productCode]/...`). Wired, but doubles the audit surface (roadmap 6.9).

## Extras (code with no obvious owning task)
- None material found in these 3 modules beyond the known dual-stores; the surface is task-backed. `costs/d365-import` is a clean legacy redirect, not orphan code.

## TOP-10 (NEW first, then severity)
1. SET-1 (P1, NEW) — Sign-off policies (dual-sign / signer-role / allow-same-user) are configurable but UNENFORCED; food-safety/21 CFR 11 control that silently does nothing.
2. NPD-1 (P1, KNOWN 1.3) — RM allergen edit never triggers FG cascade rebuild; downstream allergen declarations go stale (food-safety).
3. TEC-1 (P2, NEW) — Contamination-risk matrix claims to feed the production changeover gate but has zero consumers; unenforced allergen segregation control.
4. SET-2 (P2, NEW) — User deactivate is a one-way door; no reactivate leg (CRUD dead-end, disabled users stuck).
5. SET-3 (P2, NEW) — No admin MFA reset/recovery; authenticator-loss lockout is unrecoverable.
6. NPD-4 (P2, NEW) — NPD sensory stage read-only with no in-pipeline entry path (data only enterable in Technical module).
7. TEC-2 (P3, NEW) — Where-used screen dead-end (URL-only load, on-screen input can't seed a query) + fully hardcoded EN.
8. TEC-3 (P3, NEW) — Materials list silently truncates at 200 (Items list surfaces the warning; Materials discards it).
9. TEC-4 (P2, KNOWN 4.7) — Factory specs have no document render/print/export (compliance doc that can't be produced).
10. NPD-5/NPD-6 (P3, KNOWN) — `*Eur` brief field in a GBP org; workload page hardcoded EN.
