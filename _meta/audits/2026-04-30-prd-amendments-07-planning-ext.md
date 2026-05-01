# PRD Amendments — 07-PLANNING-EXT (Coverage Reconciliation)

**Date:** 2026-04-30
**Source audit:** `_meta/audits/2026-04-30-design-prd-coverage.md` §07-PLANNING-EXT (~65% baseline coverage, audit row 9 / row 17 in §4 top-20)
**Target file:** `07-PLANNING-EXT-PRD.md` v3.2 (sections §17 + §18 added)
**ADR alignment:** ADR-034 (Generic Product Lifecycle Naming & Industry Configuration)

---

## 1. What changed

### Direction B (UX/prototype orphans → new PRD subsections)

13 new PLE-NNN entries added under §17.1 of `07-PLANNING-EXT-PRD.md`:

| ID | Title | Phase | UX line(s) | Prototype label |
|---|---|---|---|---|
| PLE-001 | Scheduler Run History Browser (SCR-07-04 Index) | P1 | `design/07-PLANNING-EXT-UX.md:758-806` | `pext_run_history` |
| PLE-002 | Scheduler Run Detail (SCR-07-04-DETAIL) | P1 | `:808-864` | `pext_run_detail` |
| PLE-003 | Capacity Projection Screen | P1 | `:285-287` (implicit) | `pext_capacity_projection` |
| PLE-004 | Pending Review Full Page (Assignment Queue) | P1 | `:324-338` (Zone D) | `pext_pending_full_page` |
| PLE-005 | Scheduler Settings (Default Run Params + Alerts) | P1 | `:434-440` (implicit) | `pext_settings_screen` |
| PLE-006 | Rule Registry Viewer (Active Rules + Flags) | P1 | scattered links | `pext_rules_screen` |
| PLE-007 | Sequencing Preview & Commit (SCR-07-06 overlay) | P1 | `:1060-1107` | `pext_sequencing` |
| PLE-008 | Scenarios / What-If Simulation Catalog | P2 | `:874-944` | `pext_scenarios` |
| PLE-009 | Re-run Confirmation Modal | P1 | `:802` | `rerun_confirm_modal` |
| PLE-010 | Matrix Review Request Workflow + DDL | P1 | `:522` | `request_review_modal` |
| PLE-011 | Matrix Diff Viewer (Cross-Version) | P1 | `:611` | `matrix_diff_modal` |
| PLE-012 | Matrix CSV Import Workflow | P1 | `:625-635` | `matrix_import_modal` |
| PLE-013 | Matrix Publish & Disable v2 Confirmation Contracts | P1 | `:582-592, :1078` | `matrix_publish_modal`, `disable_v2_modal`, `matrix_cell_edit_modal` |

Each entry includes scope, RBAC, FR-07-PLE-NNN-NN list, cross-refs to existing §9 schemas, and where relevant new DDL stubs (§17.3 backlog).

### Direction A (PRD bullets without design)

§17.2 lists 7 PRD bullets without dedicated UX/prototype, marked `[NO-PROTOTYPE-YET]` or `[NO-DEDICATED-PROTOTYPE]`:
- Manual forecast supersession audit trail UI
- Auto-approval policy (P2 #4)
- Solver circuit-breaker UX (covered inline; acceptable)
- Forecast stale flag (P2 — partial)
- V-SCHED-01 ±5% duration warning (covered inline)
- "Matrix not updated 180d" reminder
- Appendix A solver run KPI fixture viewer

### §18 — UI Surfaces bidirectional matrix

New table mapping every PRD anchor ↔ UX line ↔ prototype label across **30 surfaces**. Each row marked OK / `[NO-UX-SECTION-YET]` / `[NO-PROTOTYPE-YET]` / `Acceptable inline`. ADR-034 marker present at section header (FG nomenclature).

### ADR-034 markers

- §17 header: explicit ADR-034 link + FG (Finished Good) nomenclature note.
- §18 header: re-states the marker for industry-config separability.
- Sample codes use generic `FG-XXXX` not domain-specific `FA-XXXX`.

### Backlog DDL (§17.3)

Listed 4 tables that §17 PLE entries reference but require formal §9 DDL in next revision:
1. `scheduler_config` (PLE-005)
2. `matrix_review_request` — DDL stubbed inline (PLE-010)
3. `changeover_matrix_drafts` (PLE-012 staging)
4. `sequence_previews` / `sequence_preview_rows` — likely redundant with `scheduler_runs(run_type='dry_run')` per OQ-EXT-09; confirm next session.

---

## 2. Coverage delta

| Direction | Before | After |
|---|---|---|
| **Direction A** (PRD → design): MODAL-07-01..04 + base SCR-07-01..05 + SCR-07-06 | ~7/9 anchored | 9/9 anchored (2 explicit `[NO-PROTOTYPE-YET]`) |
| **Direction B** (design → PRD): 25 prototype entries | ~14 had a PRD anchor (audit cited 6 orphans implicitly + ~5 partial) | 25/25 have PRD anchor (all via PLE-NNN or pre-existing §) |
| **Bidirectional matrix** | absent | 30 rows, explicit |

**Headline:** Module-level coverage ~65% → **~92%** (audit §4 top-20 row 9 closed; row 17 boundary blur with 04-PLAN clarified in PLE-007).

---

## 3. TODOs (carried forward into Phase E backlog)

1. **UX file extension** (BLOCKER for full closure — but out-of-scope per task constraint "Do NOT edit UX file"):
   - Add SCR-NN headers + line layouts for: Capacity Projection (PLE-003), Pending Review Full Page (PLE-004), Scheduler Settings (PLE-005), Rule Registry Viewer (PLE-006).
2. **§9 DDL formalization** in next 07-PLANNING-EXT-PRD revision:
   - `scheduler_config`, `matrix_review_request`, `changeover_matrix_drafts`.
   - Decide `sequence_previews` redundancy vs `scheduler_runs(run_type='dry_run')`.
3. **Direction-A backlog (Phase E impl)**:
   - Manual forecast supersession audit trail UI.
   - Auto-approval policy config UI (gated by `planning.auto_approval.enabled`).
   - Forecast stale-flag alert variant in `pext_forecasts_screen`.
   - "Matrix not updated 180d" Planner reminder.
4. **Known prototype bugs to track** (referenced in PLE entries):
   - BL-PEXT-02 (scenario solver hookup, P2)
   - BL-PEXT-05 (Gantt hour-zoom re-render)
   - BL-PEXT-06 (matrix JSON viewer placeholder)
   - BL-PEXT-08 (undo-approval 60s timer)
   - BL-PEXT-09 (matrix diff sample rows)
   - BL-PROD-05 (`.btn-danger` missing from production.css)
5. **Boundary cleanup PLE-007 ↔ 04-PLANNING-BASIC §2.8** — both modules must coordinate the shared `/planning/sequencing` route component contract; flag in next 04-PLAN revision.

---

## 4. Blockers

**None blocking the PRD reconciliation itself.** All Direction-B orphans have a PRD anchor. Two soft constraints noted:

- The four PLE entries with `[NO-UX-SECTION-YET]` (PLE-003/004/005/006) cannot have UX line citations until UX file is updated; PRD currently cites the prototype label as authoritative layout source. Acceptable per task constraint forbidding UX edits.
- `scheduler_config` table (PLE-005) DDL is stubbed in §17.1 but not yet promoted to §9 — flagged as a non-blocking next-revision task.

---

## 5. Files modified

- **Modified:** `/Users/mariuszkrawczyk/Projects/monopilot-kira/07-PLANNING-EXT-PRD.md`
  - Added §17 (UX/Prototype Coverage Additions) — 13 PLE-NNN entries + §17.2 Direction-A list + §17.3 backlog DDL list.
  - Added §18 (UI Surfaces Bidirectional Matrix) — 30-row table.
  - No content deleted; existing §16 closing position preserved (kept "End of …" sentinel after §18).

- **Created:** `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/audits/2026-04-30-prd-amendments-07-planning-ext.md` (this file).

- **Not modified:** `design/07-PLANNING-EXT-UX.md` (per task constraint).
