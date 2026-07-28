# RUN 06/20 — BOM, routing and specification revision semantics

## Verdict

**FAIL — 14 production defects: 1 P0, 8 P1 and 5 P2.**

Target: `https://monopilot-kira.vercel.app` · deployment `dpl_F8hRCBXB7tdWmNKqMHD7LxnMy3Vm` · commit `2eb57cf7b90c23d4c55afeb01116eaabc3250385` · Vercel state `READY`.

The Codex/Sol browser walk created a new FG item, four BOM revisions, a two-operation routing, a two-version FactorySpec and two disposable planning WOs. It exercised decimal quantities, clone-on-write, approval/publish transitions, active-vs-draft revision binding, site selection, release gates, e-sign rejection and dual-approver policy. The active BOM was bound correctly and the WO material/routing calculations were correct. The run nevertheless found a critical e-sign integrity bypass: an already signed in-review FactorySpec can be edited while the first signature remains valid.

All production writes were performed through the visible UI. Source was inspected read-only only after each browser observation. Disposable WOs were deleted and both owned items were deactivated at the end.

## Scenario matrix

| Scenario | Result | Evidence / observation |
|---|---|---|
| Item create with shelf life and list price | PASS persistence / **FAIL review** | Control item persisted `19 d`, `best_before`, and `£4.321`; the Review step omitted both shelf-life fields. [entered](evidence/R06-24-item-values-entered-before-create.yml), [persisted](evidence/R06-25-item-values-persisted-control.yml) |
| BOM v1 create and decimal precision | PASS | Quantities `.612345/.287655/.100000` and scrap `2.3456/.9876/.3333%` were accepted; displayed rounding did not change stored quantities. [first line](evidence/R06-02-bom-v1-first-line.yml), [three lines](evidence/R06-03-bom-three-lines-no-reorder.yml) |
| BOM line edit/remove | PARTIAL | Quantity, UOM and manufacturing operation edit persisted; scrap cannot be edited and there is no reorder action. |
| Supplier-spec readiness gate | PASS | Approval named the affected component and blocked until the offending lines were removed. |
| BOM draft→approve→publish | PASS | Exactly one version became Active; earlier versions became Superseded/Archived. [history](evidence/R06-07-bom-v3-published-version-history.yml) |
| Locked/archived BOM mutation | PASS server / **FAIL UI** | Row edit/delete were disabled and the server rejected an archived add, but Add/Save/Delete remained enabled. [server rejection](evidence/R06-05-archived-bom-mutation-server-block.yml) |
| Active BOM clone-on-write | **FAIL / P2** | UI promises a new draft; v3 and v4 were created directly as In review. [v3](evidence/R06-06-active-clone-creates-in-review-v3.yml) |
| Routing create/edit | PASS persistence | Two operations, real production-line FKs, decimal run seconds and cost rates survived refresh. [draft](evidence/R06-08-routing-two-lines-decimals.yml), [saved](evidence/R06-10-routing-v1-saved.yml) |
| Routing setup validation | **FAIL / P2** | Decimal setup minutes triggered native `stepMismatch`; Save silently did nothing and rendered no error. [validity](evidence/R06-09-routing-decimal-setup-validity.txt) |
| Routing reorder/delete CRUD | **FAIL / P1** | Operations can only be appended or removed; no move controls exist and a draft routing version cannot be deleted. |
| Routing line/site binding | **FAIL / P1** | Picker contains duplicate line codes/names but no site label, while the backing query returns every active org line. |
| Routing cost preview | PASS | Manual total for volume `123.456` is `£28.1871953057584`; UI rounded to `£28.19`. [preview](evidence/R06-11-routing-cost-math.yml) |
| FactorySpec authoring/versioning | **FAIL / P1** | Create/edit expose code, FG and notes only; no technical parameters or shelf-life input exists. [review](evidence/R06-12-factory-spec-no-params-or-bom.yml) |
| FactorySpec submit/link preflight | PASS | Draft submitted to In review; matching active BOM could be linked and relinked. |
| Invalid e-sign | PASS | Invalid credential did not record an approval. [evidence](evidence/R06-14-invalid-esign-rejected.yml) |
| Two distinct approvers | PASS | First approval recorded `1 of 2`; repeat by the same signer was rejected. [first](evidence/R06-15-esign-one-of-two-approvers.yml), [duplicate](evidence/R06-16-distinct-second-approver-enforced.yml) |
| Signature invalidation after BOM relink | PASS | Relinking v3→v4 reset the signed subject and allowed a fresh first approval. [evidence](evidence/R06-21-esign-resets-on-bom-relink.yml) |
| Signature invalidation after spec edit | **FAIL / P0** | After the first v4 approval, notes were edited; the same signer was still reported as already signed, proving the old receipt remained valid. [evidence](evidence/R06-22-p0-esign-survives-spec-edit.yml) |
| WO requires selected site | PASS | Creation at All sites was blocked with a concrete top-bar instruction. |
| WO pins active, not latest review BOM | PASS | With v3 Active and v4 In review, the new WO bound v3. [evidence](evidence/R06-20-wo-pins-active-v3-over-in-review-v4.yml) |
| WO quantities, materials and routing time | PASS | `12.345 kg` produced `1.239 kg` butter and `15.358 pcs` packaging; operation durations rounded conservatively to `14/11 min`. [WO](evidence/R06-17-wo-created-active-bom.yml) |
| WO release without approved spec | PASS | Release was blocked with a concrete FactorySpec/active-BOM message. [evidence](evidence/R06-18-wo-release-blocked-missing-approved-spec.yml) |
| Technical BOM snapshot audit | **FAIL / P1** | Planned WOs displayed pinned BOM materials, but the BOM detail still reported `Snapshots 0`. [evidence](evidence/R06-19-bom-v3-snapshots-empty-despite-wo.yml) |

## Findings

### PF-R06-01 — P0 — Editing an in-review FactorySpec does not invalidate an existing e-sign approval

The linked v4 bundle was signed once and correctly reported `1 of 2 approvers`. While the same FactorySpec remained In review, the row still exposed **Edit**. Changing its notes succeeded. Reopening approval and signing as the same user returned:

> This approver has already signed this bundle; a distinct second approver is required

That proves the first receipt survived a material post-sign edit. A second approver could therefore release content that the first approver never reviewed.

Source correlation identifies the exact integrity gap:

- [`factory-spec-lifecycle.ts`](../../../../apps/web/app/[locale]/(app)/(modules)/technical/factory-specs/actions/factory-spec-lifecycle.ts) permits `updateFactorySpec` for the mutable In review state and updates `spec_code`/`notes` without voiding receipts or creating a new revision.
- [`release-bundle-service.ts`](../../../../apps/web/lib/technical/release-bundle-service.ts) hashes only `factorySpecId`, `bomHeaderId`, `fgItemId` and `bomVersion`. FactorySpec version/content/update timestamp are absent.
- The nonce is stable as `${specId}:${bomId}:approve`, so the duplicate check continues to match after the content mutation.

Minimal safe contract: any business-field edit after the first approval must either be rejected, clone a new spec revision, or atomically invalidate prior receipts; the signed subject must bind immutable spec content/version. Evidence: [post-edit duplicate rejection](evidence/R06-22-p0-esign-survives-spec-edit.yml).

### PF-R06-02 — P1 — FactorySpec authoring cannot capture the specification values shown by Review

Create exposes only specification code, finished-good item and notes. Edit exposes only code and notes. Review displays Shelf life, but there is no input or inheritance control, so the owned spec remained `—` even though a control item proved that item shelf life persists correctly.

The source matches the browser:

- [`create-factory-spec-modal.client.tsx`](../../../../apps/web/app/[locale]/(app)/(modules)/technical/factory-specs/_components/create-factory-spec-modal.client.tsx) sends only `fgItemId`, `specCode`, `notes` and optional supersession.
- [`factory-spec-lifecycle-modals.client.tsx`](../../../../apps/web/app/[locale]/(app)/(modules)/technical/factory-specs/_components/factory-spec-lifecycle-modals.client.tsx) edits only `specCode` and `notes`.
- [`review-modal.client.tsx`](../../../../apps/web/app/[locale]/(app)/(modules)/technical/factory-specs/_components/review-modal.client.tsx) nevertheless presents `shelfLifeDays`.

The product-spec module therefore has no visible way to author the technical parameters it is supposed to approve. Evidence: [FactorySpec review](evidence/R06-12-factory-spec-no-params-or-bom.yml), [item control](evidence/R06-25-item-values-persisted-control.yml).

### PF-R06-03 — P1 — BOM scrap percentage is immutable after line creation

The Add component modal accepts scrap percentage, and the persisted BOM uses it to inflate WO requirements. The row Edit modal exposes only quantity, UOM and manufacturing operation. `updateBomLine` likewise has no scrap field and does not include `scrap_pct` in its update or audit payload.

Changing an incorrect loss factor therefore requires deleting and recreating the line, which also changes ordering and risks transcription errors in a production-critical calculation. Source: [`bom-line-row-actions.tsx`](../../../../apps/web/app/[locale]/(app)/(modules)/technical/bom/_components/bom-line-row-actions.tsx), [`line-actions.ts`](../../../../apps/web/app/[locale]/(app)/(modules)/technical/bom/_actions/line-actions.ts). Evidence: [three-line BOM](evidence/R06-03-bom-three-lines-no-reorder.yml).

### PF-R06-04 — P1 — BOM component lines cannot be reordered

The three-line draft exposed edit and delete only. No drag handle, move-up/down control or order field exists. The server always appends as `max(line_no)+1`; deletion merely compacts the remaining sequence. There is no reorder action.

This prevents correcting the intended manufacturing sequence without delete/re-add churn. It is particularly unsafe because operation association is editable but component order is not. Source: [`line-actions.ts`](../../../../apps/web/app/[locale]/(app)/(modules)/technical/bom/_actions/line-actions.ts). Evidence: [line table](evidence/R06-03-bom-three-lines-no-reorder.yml).

### PF-R06-05 — P1 — Routing operations cannot be reordered

The routing editor assigns `opNo` solely from the current array index. UI controls allow append and remove, but not moving an existing operation. Correcting operation order requires removing and re-entering downstream operations.

Source: [`routings-manager.client.tsx`](../../../../apps/web/app/[locale]/(app)/(modules)/technical/routings/_components/routings-manager.client.tsx) implements only `addOp`, `removeOp`, and `opNo: i + 1`. Evidence: [two-operation routing](evidence/R06-08-routing-two-lines-decimals.yml).

### PF-R06-06 — P1 — A draft routing version has no delete/retire action

The draft routing row exposes only **Edit** and **Approve**. The codebase contains create, update, approve/publish, list and cost-preview actions, but no routing delete action. A mistaken draft therefore cannot be removed through the application.

This is a concrete CRUD gap, not merely a missing shortcut. Source: [`routings-manager.client.tsx`](../../../../apps/web/app/[locale]/(app)/(modules)/technical/routings/_components/routings-manager.client.tsx) and the routings `_actions` directory. Evidence: [saved draft row](evidence/R06-10-routing-v1-saved.yml).

### PF-R06-07 — P1 — Routing line picker omits site identity while loading all org lines

The picker showed repeated codes/names such as `LINE01`, `LINE02` and `LINE1` with no site. An operator cannot tell which physical site owns a line, so cross-site selection cannot be deliberately verified or avoided.

[`list-routing-items.ts`](../../../../apps/web/app/[locale]/(app)/(modules)/technical/routings/_actions/list-routing-items.ts) queries every active `production_lines` row in the org and maps only `{id, code, name}`. [`routings-manager.client.tsx`](../../../../apps/web/app/[locale]/(app)/(modules)/technical/routings/_components/routings-manager.client.tsx) renders only `code · name`. Server same-site validation is useful, but it cannot repair an ambiguous selector or prove the selected site to the operator. Evidence: [routing editor](evidence/R06-08-routing-two-lines-decimals.yml).

### PF-R06-08 — P2 — Active-BOM edit promises Draft but creates In review

Both active-version edits displayed clone-on-write language describing a new draft, but the resulting v3/v4 status was In review. Source comments in `createBomDraft` also claim `status stays 'draft'`, while the current `bom_request_version_edit` database function deliberately inserts `in_review`.

The lifecycle may intentionally require immediate review, but UI, action contract and persisted state must agree. Evidence: [resulting v3](evidence/R06-06-active-clone-creates-in-review-v3.yml), [history](evidence/R06-07-bom-v3-published-version-history.yml).

### PF-R06-09 — P2 — Decimal setup minutes silently disable routing Save

Entering `12.345` or `7.891` in setup minutes made the native number controls invalid because no `step` is declared, so the browser default is integer step `1`. Submitting produced no navigation and no visible error. The server schema also requires an integer.

If setup is intentionally whole minutes, the control should use `step=1` and render an explicit validation message. If decimal setup is valid domain data, the schema must accept it. Silent no-op is incorrect in either case. Source: [`routings-manager.client.tsx`](../../../../apps/web/app/[locale]/(app)/(modules)/technical/routings/_components/routings-manager.client.tsx), [`shared.ts`](../../../../apps/web/app/[locale]/(app)/(modules)/technical/routings/_actions/shared.ts). Evidence: [native validity result](evidence/R06-09-routing-decimal-setup-validity.txt).

### PF-R06-10 — P2 — Released and archived BOMs still expose invalid top-level mutation controls

An archived v1 correctly disabled row-level edits, but top-level **Add component**, **Save version** and **Delete version** stayed enabled. An Add attempt reached the server and returned “BOM version is archived and cannot be saved as a new draft version”.

[`bom-detail-actions.tsx`](../../../../apps/web/app/[locale]/(app)/(modules)/technical/bom/_components/bom-detail-actions.tsx) renders all three controls whenever `canCreate` is true, independent of lifecycle state. The server guard prevents corruption, but the visible controls promise operations that cannot succeed. Evidence: [server block](evidence/R06-05-archived-bom-mutation-server-block.yml).

### PF-R06-11 — P1 — Planned WOs are absent from the immutable BOM snapshot audit

Two planning WOs visibly pinned v3 and showed their materialized “BOM snapshot” lines, yet Technical → BOM → Snapshots still showed `0`. The immutable `bom_snapshots` row is created only when production START runs.

This contradicts the service/test contract that describes snapshot creation atomically with WO creation. Before START, Technical therefore cannot audit which planned WOs use a revision, and the delete/snapshot guard sees no immutable reference.

Source correlation:

- [`detail-page.ts`](../../../../apps/web/app/[locale]/(app)/(modules)/technical/bom/_actions/detail-page.ts) counts only `public.bom_snapshots`.
- [`start-wo.ts`](../../../../apps/web/lib/production/start-wo.ts) is the observed caller of `createBomSnapshot`.
- [`snapshot.ts`](../../../../apps/web/lib/technical/bom/snapshot.ts) and [`bom-snapshot.test.ts`](../../../../apps/web/tests/wiring/bom-snapshot.test.ts) still document WO-creation-time capture.

Evidence: [Technical snapshot tab](evidence/R06-19-bom-v3-snapshots-empty-despite-wo.yml), [planned WO pinned to v3](evidence/R06-20-wo-pins-active-v3-over-in-review-v4.yml).

### PF-R06-12 — P2 — Item creation Review omits shelf-life values

A clean control entered `19` days and `best_before`; both persisted on the resulting item. The Review step showed code, name, type, status, UOM, packaging, weight, GTIN, nominal weight and prices, but omitted shelf-life days and mode.

[`item-create-wizard.tsx`](../../../../apps/web/app/[locale]/(app)/(modules)/technical/items/_components/item-create-wizard.tsx) explicitly gathers the shelf-life fields but excludes them from the Review row array. Evidence: [values before create](evidence/R06-24-item-values-entered-before-create.yml), [persisted detail](evidence/R06-25-item-values-persisted-control.yml).

### PF-R06-13 — P2 — Item Routing empty state gives no route to create the promised routing

The item Routing tab says “No routing version exists for this item. Create one to define its operations”, but renders no button or link. The user must discover the separate global Routings page.

[`item-data-tabs.tsx`](../../../../apps/web/app/[locale]/(app)/(modules)/technical/items/[item_code]/_components/item-data-tabs.tsx) returns a plain `EmptyCard` for this state. This is a broken task continuation, especially because other item actions are colocated on the detail screen. Evidence: [owned item detail](evidence/R06-01-owned-item-created.yml).

### PF-R06-14 — P1 — Reopening bundle approval hides collected e-sign state and receipts

Immediately after signing, the dialog displayed `1 of 2 approvers`. After closing and reopening, that progress disappeared. “Approval / rejection history” listed lifecycle audit actions but no e-sign receipt, signer count or outstanding approver count. The same signer can fill and submit the form again only to learn from the duplicate error that their receipt exists.

[`bundle-data.ts`](../../../../apps/web/app/[locale]/(app)/(modules)/technical/factory-specs/_actions/bundle-data.ts) reads only `audit_events` lifecycle history and returns no approval count/receipts from `e_sign_log`. In a two-person CFR-style approval, durable progress and signer evidence must be visible before the next person acts. Evidence: [transient 1-of-2 state](evidence/R06-21-esign-resets-on-bom-relink.yml), [reopened history without receipt](evidence/R06-22-p0-esign-survives-spec-edit.yml).

## Calculation checks

| Calculation | Manual | UI | Verdict |
|---|---:|---:|---|
| Routing op 1 cost | `(12/60 + 123.456×4.56789/3600)×23.4567` | included | PASS |
| Routing op 2 cost | `(8/60 + 123.456×8.76543/3600)×45.6789` | included | PASS |
| Routing total | `£28.1871953057584` | `£28.19` | PASS rounding |
| WO butter base | `12.345×0.100000 = 1.2345 kg` | scrap-adjusted `1.239 kg` | PASS conservative rounding |
| WO packaging base | `12.345×1.2345 = 15.2399025 pcs` | scrap-adjusted `15.358 pcs` | PASS conservative rounding |
| Operation 1 duration | `12 + 12.345×5.4321/60 = 13.117… min` | `14 min` | PASS ceiling |
| Operation 2 duration | `9 + 12.345×7.6543/60 = 10.574… min` | `11 min` | PASS ceiling |

## Prior-fix and gate verification

| Contract | Result |
|---|---|
| S22 two distinct approvers | **PASS** — one signer cannot satisfy both approvals. |
| Invalid e-sign rejection | **PASS** — no approval recorded. |
| BOM relink changes signed subject | **PASS** — v3→v4 relink required a fresh signature. |
| Active-vs-review BOM selection | **PASS** — new WO pinned active v3 instead of in-review v4. |
| Site required for WO creation | **PASS** — All sites was rejected with a concrete message. |
| FactorySpec release gate | **PASS** — unsigned/unreleased spec prevented WO release. |
| BOM materialization precision | **PASS** — decimal quantity and scrap calculations matched manual checks. |
| Routing duration/cost precision | **PASS** — exact inputs produced correct conservative durations and currency rounding. |

## Cleanup and retained artifacts

- Deleted both disposable draft WOs through the visible UI.
- Deactivated owned items `NIGHT-R06-FG-1138` and `NIGHT-R06-VAL-1241`; both are Blocked.
- Retained the versioned BOM/routing/FactorySpec history because the application provides no safe complete-delete path for the approved artifacts.
- Primary BOM v4 remains Active, prior BOM versions are Superseded/Archived, routing v1 remains Active, and FactorySpec v2 remains In review with one approval receipt. The retained In-review spec is the evidence-bearing P0 reproduction.
- Reset the top-bar site filter to All sites.

## Limitations

- Only one available signed-in account was used, so the run did not complete the second distinct approval. This is not treated as a defect; the first-sign and duplicate-sign behavior was fully observable.
- The ambiguous routing picker made a deliberate cross-site line selection unsafe; the finding is limited to the visible ambiguity and the source-confirmed org-wide option query. Same-site server enforcement was not bypassed.
- Planned WOs were deleted after their BOM binding/material calculations were captured, so production START was not used merely to create an immutable snapshot.
- No production table was queried or modified outside the application UI.
