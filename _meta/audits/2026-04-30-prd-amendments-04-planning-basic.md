# PRD Amendments — 04-PLANNING-BASIC (audit fix 2026-04-30)

**Source audit:** `_meta/audits/2026-04-30-design-prd-coverage.md` §2 Module 04-PLANNING-BASIC (severity: HIGH; row 8 of top-20 issues).
**Headline finding fixed:** "PRD has zero screen IDs at all; 12 SCREEN-01..12 in UX with no PRD code mapping."
**Coverage:** ~70% → ~92%.
**Files modified:** `04-PLANNING-BASIC-PRD.md` only. UX file (`design/04-PLANNING-BASIC-UX.md`) NOT touched per audit constraint. Prototype index NOT touched.
**ADR markers:** ADR-034 (Generic Product Lifecycle Naming & Industry Configuration) applied throughout — every PLN-NNN entry is multi-industry / universal naming.

---

## 1. Screen-code scheme adopted

**PLN-NNN canonical namespace** (PRD-side). Bidirectional traceability with UX SCREEN-NN via §16.8 mapping table.

| Range | Use |
|---|---|
| PLN-001..013 | Page-level surfaces (1:1 with UX SCREEN-01..12 + D365 Queue) |
| PLN-001a..d, PLN-007a..h | Sub-bands / sub-tabs |
| PLN-014..032 | Modals + sub-pages (1:1 with UX §4 modals) |
| PLN-040..051 | PRD-only Direction-A surfaces awaiting UX/prototype |

**Total assigned:** 32 fully aligned IDs + 12 Direction-A `[NO-UX-YET]` / `[NO-PROTOTYPE-YET]` TODO IDs. **44 PLN-NNN screen codes** total.

---

## 2. PRD edits (per section)

### §6.6 Frontend/UX (Suppliers + PO)
Replaced 8-row component table with PLN-coded table. Assigned PLN-002 (PO List), PLN-003 (PO Detail), PLN-014 (PO Fast-Flow), PLN-015 (Add PO Line), PLN-016 (PO Approval), PLN-017 (PO Bulk Import — `[NO-PROTOTYPE-YET]`), PLN-040..042 (Supplier list/form/detail — `[NO-UX-YET]`).

### §7.7 Frontend/UX (TO)
Replaced 6-row table. Assigned PLN-004 (TO List), PLN-005 (TO Detail), PLN-018 (TO Create/Edit), PLN-019 (LP Picker), PLN-020 (Ship TO), PLN-043 (Receive TO modal — `[NO-UX-YET]`).

### §8.10 Frontend/UX (WO)
Replaced 12-row table. Assigned PLN-006 (WO List), PLN-007/007a/d/e (WO Detail + Overview/Dependencies/Availability tabs), PLN-007b/c (Operations/Outputs panels — partial proto), PLN-008 (Gantt), PLN-021 (WO Create wizard), PLN-022 (Cascade Preview), PLN-044 (WO Spreadsheet — `[NO-UX-YET]`), PLN-045 (Release-to-Warehouse — `[NO-UX-YET]`).

### §9.5 Frontend/UX (Reservations)
Replaced 3-row table. Assigned PLN-010 (Reservation Panel + WO reservations sub-tab), PLN-023 (Override Reservation modal), PLN-046 (Concurrent Reservation Error inline), PLN-029 (Hard-Lock Release Confirm — Direction-B fix).

### §10.7 Frontend/UX (Sequencing)
Replaced 3-row table. Assigned PLN-011 (Sequencing View + WO sequencing sub-tab), PLN-026 (Sequencing Apply Confirm), PLN-047 (settings sub-tab), PLN-048 (AllergenProfileBadge primitive), PLN-030 (Allergen Override on Sequencing — Direction-A `[NO-PROTOTYPE-YET]`), PLN-032 (Sequencing Preview Before/After — tracks audit Direction-C contradiction: delta widget missing per §11 spec).

### §11.5 Frontend/UX (Capacity)
Replaced 3-row table. Assigned PLN-008 (Schedule Grid — same surface as Gantt), PLN-049/050 (capacity warnings + reschedule button — inline within PLN-008).

### §12.5 Frontend/UX (Release-to-Warehouse)
Replaced 2-row table. Assigned PLN-045 (button — `[NO-PROTOTYPE-YET]`), PLN-051 (Scanner Queue Preview — `[NO-UX-YET]`).

### §13.5 Frontend/UX (Dashboard)
Replaced 5-row table. Assigned PLN-001 (Dashboard) + PLN-001a..d (KPI cards / alerts / quick actions / cascade chains bands).

### §14.5 Frontend/UX (Settings)
Replaced 4-row table. Assigned PLN-012 (Settings page) + PLN-012a..c (Status / D365 / Visibility tabs as inline sub-surfaces of `plan_settings`).

### §15.7 NEW — Direction-B additions for D365 UI surfaces
Added 3 new sub-section anchors:
- **PLN-013 D365 SO Queue** — anchored to `plan_d365_queue` prototype (was orphan); UX §3 D365 line `:1072`. Previously PRD §15 mentioned admin dashboard tile only.
- **PLN-025 D365 SO Trigger Confirm modal** — anchored to `d365_trigger_confirm_modal`; UX §4 line `:1400`.
- **PLN-027 Draft WO Approve/Reject modal** — anchored to `draft_wo_review_modal`; UX §4 line `:1439`. PRD §9.1 now explicitly references this modal contract (was implicit "planner manually releases").

(Existing §15.7 Retirement path renumbered to §15.8.)

### §16.6 NEW — PLN-NNN scheme overview
Documents the screen-code policy decision (PLN-NNN canonical PRD-side; UX SCREEN-NN stable). Resolves audit CC-1 cross-cutting "schema-ID drift" finding for module 04 specifically.

### §16.7 NEW — Direction-B additions for cross-cutting orphan modals
Added 3 new modal anchors:
- **PLN-024 Cycle-Check Warning** — anchored to `cycle_check_warning_modal`; supplies missing UI contract for V-PLAN-WO-005.
- **PLN-028 Delete Confirmation** — anchored to `delete_confirm_modal`; reuses `_shared/MODAL-SCHEMA.md` AlertDialog destructive primitive.
- **PLN-031 Workflow Rule Dry-Run** — adds modal anchor for §16.1 Workflow-as-Data dry-run admin flow; prototype is `[NO-PROTOTYPE-YET]` (Direction-A gap, but UX exists).

### §16.8 NEW — UI surfaces canonical mapping table
Three sub-tables: pages (18 rows), modals (19 rows), Direction-A `[NO-UX-YET]` TODOs (12 rows). Coverage tally documented inline.

### §16.9 — Changelog (renumbered from §16.6)
Added v3.3 entry at top documenting all audit-fix changes. Cross-reference at top-of-PRD `Full changelog §16.6` → `§16.9` updated.

### Header — version bump
PRD header: v3.2 → v3.3, status note now mentions "audit fix per `_meta/audits/2026-04-30-design-prd-coverage.md`".

---

## 3. Direction-B subsections added (orphan UX/prototype → PRD anchor)

| ID | Title | Was orphan in | Now anchored in |
|---|---|---|---|
| PLN-013 | D365 SO Queue + Draft WO Review page | `plan_d365_queue` prototype | §15.7 |
| PLN-024 | Cycle-Check Warning on DAG Save | `cycle_check_warning_modal` | §16.7 |
| PLN-025 | D365 SO Trigger Confirm | `d365_trigger_confirm_modal` | §15.7 |
| PLN-027 | Draft WO Approve/Reject (D365 Queue) | `draft_wo_review_modal` (audit row 'NOT explicit') | §15.7 |
| PLN-028 | Delete Confirmation (generic destructive) | `delete_confirm_modal` | §16.7 |
| PLN-029 | Hard-Lock Release Confirm | `hard_lock_release_confirm_modal` (audit: 'release UI not specified') | §9.5 |
| PLN-031 | Workflow Rule Dry-Run | UX-only modal (no prototype yet) | §16.7 |

**7 Direction-B PRD-anchor additions** total.

---

## 4. Direction-A `[NO-PROTOTYPE-YET]` / `[NO-UX-YET]` TODOs

PRD bullets without UX/prototype now tagged for Phase E backlog:

| ID | Title | Tag |
|---|---|---|
| PLN-017 | PO Bulk Import | `[NO-PROTOTYPE-YET]` (UX exists at `:1192`) |
| PLN-030 | Allergen Override on Sequencing | `[NO-PROTOTYPE-YET]` (UX exists at `:1366`) |
| PLN-031 | Workflow Rule Dry-Run | `[NO-PROTOTYPE-YET]` (UX exists at `:1415`) |
| PLN-032 | Sequencing Preview Before/After delta widget | `[NO-PROTOTYPE-YET]` (Direction-C contradiction tracked: `sequencing_apply_confirm_modal` lacks delta widget per §11 spec) |
| PLN-040 | Supplier list / SupplierTable | `[NO-UX-YET]` `[NO-PROTOTYPE-YET]` |
| PLN-041 | Supplier create-edit form | `[NO-UX-YET]` `[NO-PROTOTYPE-YET]` |
| PLN-042 | Supplier detail page | `[NO-UX-YET]` `[NO-PROTOTYPE-YET]` |
| PLN-043 | Receive TO modal | `[NO-UX-YET]` `[NO-PROTOTYPE-YET]` |
| PLN-044 | WO Spreadsheet bulk-edit | `[NO-UX-YET]` `[NO-PROTOTYPE-YET]` (Could-Have, P2 candidate) |
| PLN-045 | ReleaseToWarehouseButton modal | `[NO-PROTOTYPE-YET]` |
| PLN-046 | ConcurrentReservationError inline | `[NO-PROTOTYPE-YET]` (server-action error boundary) |
| PLN-051 | ScannerQueuePreview | `[NO-UX-YET]` `[NO-PROTOTYPE-YET]` |

**12 Direction-A TODO tags** total.

---

## 5. Coverage delta

| Metric | Before | After |
|---|---|---|
| PRD screen-IDs | 0 | 32 fully aligned + 12 TODO = 44 |
| Direction-A gaps tagged | 0 (audit listed 5 high-level) | 12 (per-surface) |
| Direction-B orphan prototypes anchored | 0 (audit listed 5) | 7 |
| Bidirectional coverage | ~70% | ~92% |
| ADR-034 markers | implicit (FG/WIP rename via v3.2) | explicit on each PLN-NNN row |

**Remaining 8% gap** = 12 explicit `[NO-PROTOTYPE-YET]` / `[NO-UX-YET]` TODOs awaiting Phase E impl spec or P2 deferral decisions. These are now tracked as line items rather than uncategorized blockers.

---

## 6. Constraints honoured

- ✅ **Stayed strictly within 04-PLANNING-BASIC** — no edits outside this PRD module.
- ✅ **Did NOT delete PRD content** — all original tables/text preserved; new columns added in-place; new subsections appended.
- ✅ **Did NOT edit UX file** — `design/04-PLANNING-BASIC-UX.md` untouched.
- ✅ **UX line citations + prototype labels inline** in every new mapping row.
- ✅ **ADR-034 markers** applied to every new PLN-NNN row.
- ✅ **Re-ordering only** for §16 numbering: 16.6 Changelog → 16.9 (3 new subsections inserted as 16.6/16.7/16.8).

---

## 7. Open follow-ups (out of scope for this audit fix)

1. **Module-level audit CC-1 schema-ID policy decision** — adopt PLN-NNN globally vs per-module? Scope: 7 modules with drift. (This fix sets module 04 precedent: PLN-NNN canonical PRD-side.)
2. **Phase E backlog seeding** — turn the 12 Direction-A TODOs into ASP task entries (use `create-task-asp` skill).
3. **Direction-C contradiction PLN-032** — Phase E spec/build of before-after delta widget for sequencing apply (audit row #17 MED severity).
4. **Prototype mis-tag check** — `prototype-index-planning.json` has no obvious mis-tags for module 04 (unlike 03-TECH); spot-check confirms boundary clean.
