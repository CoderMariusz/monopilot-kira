# Static audit findings

## Findings

### P1 — Released BOM “clone” loses lineage and permits duplicate forks

Evidence:

- [bom-edit-dialog.tsx:367](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/technical/bom/_components/bom-edit-dialog.tsx:367) describes clone-on-write, but calls `createBomDraft` at [bom-edit-dialog.tsx:395](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/technical/bom/_components/bom-edit-dialog.tsx:395) without the source header ID.
- [create-draft.ts:180](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/technical/bom/_actions/create-draft.ts:180) inserts no `supersedes_bom_header_id`.
- The canonical database clone helper explicitly records lineage and reuses an existing in-flight child at [168-bom-version-state-machine-clone-on-write.sql:153](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/168-bom-version-state-machine-clone-on-write.sql:153) and [168-bom-version-state-machine-clone-on-write.sql:168](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/168-bom-version-state-machine-clone-on-write.sql:168).

Failure scenario: two edits of the same active BOM create unrelated draft versions rather than one idempotent superseding child. History/ECO lineage is lost, and concurrent editors can fork divergent BOMs without detecting each other.

Suggested fix: route immutable-version edits through `bom_request_version_edit`, then append/edit the returned draft, or add equivalent locked/idempotent source-lineage handling to the server action.

---

### P1 — ECO can accept an unrelated factory specification as the superseding version

Evidence:

- `FactorySpecRow` contains no FG identity at [eco-apply-service.ts:62](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/technical/eco-apply-service.ts:62).
- `loadFactorySpec` consequently loads only ID, version, status, and lineage at [eco-apply-service.ts:108](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/technical/eco-apply-service.ts:108).
- Validation at [eco-apply-service.ts:134](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/technical/eco-apply-service.ts:134) accepts any higher-numbered terminal spec, without checking that it belongs to the same `fg_item_id` as the target.
- ECO close relies on that validation at [eco-apply-service.ts:220](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/technical/eco-apply-service.ts:220).

Failure scenario: an ECO targeting FG-A spec v1 can link FG-B spec v2. Closing the ECO succeeds and records the unrelated specification as the implemented supersession.

Suggested fix: load `fg_item_id` for both rows and require equality. Prefer additionally requiring direct lineage unless an explicit lineage-chain rule permits otherwise.

---

### P1 — Routing approval can race with operation replacement and mutate an approved routing

Evidence:

- `updateRouting` reads the status without a row lock at [update-routing.ts:65](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/technical/routings/_actions/update-routing.ts:65).
- After seeing `draft`, it deletes and recreates operations without rechecking the routing status at [update-routing.ts:88](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/technical/routings/_actions/update-routing.ts:88).
- Approval independently changes `draft → approved` using a guarded update at [approve-routing.ts:76](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/technical/routings/_actions/approve-routing.ts:76).

Failure scenario: an edit transaction reads `draft`; another transaction approves it; the first transaction then replaces its operations. The approved routing’s content no longer matches what was reviewed.

Suggested fix: lock the routing row `FOR UPDATE` before checking status and retain the lock through child replacement, or use a database immutability guard tied to the parent status.

---

### P1 — Active WIP definitions are versioned by destructive in-place mutation

Evidence:

- `saveWipDefinition` calculates an incremented version when content changes at [wip-definition-actions.ts:143](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/technical/wip-library/_actions/wip-definition-actions.ts:143).
- It updates the existing definition row—including active rows—in place at [wip-definition-actions.ts:153](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/technical/wip-library/_actions/wip-definition-actions.ts:153).
- It then replaces the same row’s ingredients and processes at [wip-definition-actions.ts:192](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/technical/wip-library/_actions/wip-definition-actions.ts:192).

Failure scenario: changing an active definition from v3 to v4 destroys the v3 content. Existing consumers referencing the definition ID silently see v4 before accepting the update, while acknowledgements retain only a version number whose historical content can no longer be reconstructed.

Suggested fix: clone changed active definitions into a new version row with immutable child content and explicit supersession lineage; consumers should remain pinned to their accepted version.

---

### P1 — Factory-spec recall can race with work-order creation

Evidence:

- Recall locks only the factory-spec row at [recall-factory-spec-core.ts:40](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/technical/recall-factory-spec-core.ts:40).
- It checks existing work orders in a separate query at [recall-factory-spec-core.ts:59](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/technical/recall-factory-spec-core.ts:59).
- It then changes the released spec back to draft at [recall-factory-spec-core.ts:138](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/technical/recall-factory-spec-core.ts:138).

Failure scenario: after recall observes no blocking WO, a concurrent transaction inserts/releases a WO referencing the spec. Recall then commits, leaving a released/in-progress WO pointing to a recalled draft specification.

Suggested fix: serialize WO binding and recall through a shared locked release-status/spec row, or enforce the invariant in a database trigger/advisory-lock protocol used by both paths.

---

### P2 — Where-used reports draft, superseded, and archived BOM content as current usage

Evidence:

- The query joins every `bom_headers` row without filtering lifecycle status at [list-where-used.ts:33](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/technical/where-used/_actions/list-where-used.ts:33).
- `DISTINCT ON` selects merely the numerically latest version at [list-where-used.ts:28](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/technical/where-used/_actions/list-where-used.ts:28) and [list-where-used.ts:47](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/technical/where-used/_actions/list-where-used.ts:47).
- The UI describes results as “every FG BOM that uses” the component at [where-used/page.tsx:85](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/technical/where-used/page.tsx:85).

Failure scenario: active v3 uses RM-X, while draft v4 removes it. RM-X still matches v3, but `DISTINCT ON` can return the draft/other version’s line or omit/misrepresent current production usage. Superseded-only usage is also presented without lifecycle context.

Suggested fix: define the intended view explicitly—normally active BOMs only. If historical/planned usage is required, return version and status rather than collapsing all versions by FG code.

---

### P2 — Item type can change in place after the item has acquired typed dependencies

Evidence:

- `updateItem` exposes `item_type` for all statuses at [update-item.ts:73](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/technical/items/_actions/update-item.ts:73).
- The assignment occurs directly at [update-item.ts:76](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/technical/items/_actions/update-item.ts:76).
- The only lifecycle validation concerns `status`, not `item_type`, at [update-item.ts:67](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/technical/items/_actions/update-item.ts:67).

Failure scenario: an active FG with released BOMs/routings can be changed to RM or packaging in place. UUID references remain valid, but domain assumptions used by BOM authoring, planning, and item-type-specific validation no longer hold.

Suggested fix: define legal type transitions. At minimum, freeze `item_type` once active or referenced; otherwise require dependency-aware migration/clone handling.

## Clean areas verified

- BOM approval revalidates component usability and cycle constraints before transition.
- BOM publishing uses a shared transactional publish service instead of independently superseding/activating rows.
- ECO close locks the ECO row and applies the linked BOM inside the same org-scoped transaction.
- Factory-spec release locks the selected spec and performs supersede, release, event, and release-status synchronization transactionally.
- Routing publish guards the target status and supersedes the incumbent in the same transaction.
- All reviewed SQL paths use `org_id` with `app.current_org_id()`; no `tenant_id` leakage was found.
- Factory-spec released-content immutability and BOM approved-content immutability are backed by migration triggers.
- Direct self-reference/cycle rejection exists for BOM creation and approval.

## Not covered

- UI parity, accessibility, i18n, and general loading/error states.
- Costing, nutrition, allergens, sensory, shelf-life, tooling, compliance, and traceability beyond dependencies encountered.
- Live Supabase trigger inspection or concurrency execution; this was static analysis against migration ground truth.
- Full recursive where-used semantics across intermediate/WIP chains.
- Runtime tests, build, typecheck, or mutation testing.
- Previously enumerated known bugs were intentionally excluded.
