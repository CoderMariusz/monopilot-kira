# 00-08 Production Start Readiness — Final Review

Date: 2026-05-03
Repo: `/Users/mariuszkrawczyk/Projects/monopilot-kira`
Status: dirty working tree, not committed in this wave.

## Executive verdict

00-08 are now ready for staged ACP draft import / staged implementation planning, with one important caveat: do not launch all 651 tasks as one queued wave. Import/release them in dependency waves.

Documentation/task readiness after this pass is effectively 95%+ for the production-start slice:

- 00 Foundation: 52 tasks, PASS.
- 01 NPD: 100 tasks, PASS.
- 02 Settings: 127 tasks, PASS.
- 03 Technical: 90 tasks, PASS.
- 04 Planning Basic: 65 tasks, PASS.
- 05 Warehouse: 57 tasks, PASS.
- 06 Scanner P1: 48 tasks, PASS.
- 07 Planning Ext: 57 tasks, PASS.
- 08 Production: 55 tasks, PASS.

Total checked ACP task payloads: 651.

## What was hardened in this final continuation

### User decisions captured

Decision file:

- `_meta/decisions/2026-05-03-next-modules-warehouse-scanner-planning-production-decisions.md`

Applied decisions:

- Warehouse WH-008 split destination is required.
- Warehouse WH-109 shelf-life rules CRUD is Phase 1.
- Warehouse M-12 `use_by_override_modal` is canonical.
- Warehouse WH-015 / WH-017 picker/panel can be first-class labels.
- If UI is rebuilt, source-level labels are acceptable.
- Scanner index is canonical.
- Scanner master/index must be canonical.
- Scanner P1 done screens/PIN/camera surfaces are canonical.
- Scanner mobile screenshots/traces policy is required.
- Next step approved: harden 04/05/06 plus 07/08 and review 01/02/03 UI/prototype completeness.

### Module hardening completed by parallel agents

Reports created/updated:

- `_meta/reviews/2026-05-03-04-planning-basic-full-readiness-hardening.md`
- `_meta/reviews/2026-05-03-05-warehouse-wave-next-3-hardening-report.md`
- `_meta/reviews/2026-05-03-06-scanner-p1-wave-next-3-hardening-closeout.md`
- `_meta/reviews/2026-05-03-08-production-full-readiness-hardening.md`
- `_meta/reviews/2026-05-03-01-02-03-ui-prototype-labeling-completeness-after-wave0.md`

07 Planning Ext was also hardened/validated; its final state is reflected in PRD/UX/tasks/prototype index and in this synthesized final report.

### Final cleanup after review agents

I fixed the issues found by the read-only review agents:

1. `05-warehouse/tasks/T-055.json`
   - Replaced invalid dependency range `T-001..T-054` with concrete local dependency IDs `T-001` through `T-054`.
   - Reason: ACP/local dependency tooling should not receive range strings.

2. `_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md`
   - Created the missing policy file referenced by many UI tasks in 00-03.
   - It defines prototype source declaration, parity evidence, screenshots/traces, label/index behavior, and red-line language.

3. `_meta/prototype-labels/master-index.json`
   - Added missing per-module discoverability entries for labels that existed in module indexes but not the global master index:
     - NPD: `allergen_override_modal`, `nutrition_screen`, `costing_screen`
     - Settings: `d365_mapping_screen`
     - Technical: `products_screen`, `boms_screen`, `partners_screen`
     - Production: `shifts_screen`, `settings_screen`
   - Added `module: scanner` to Scanner labels that existed globally but lacked module ownership.

4. Prototype line ranges
   - Clamped stale line ranges where index end lines exceeded current JSX file length:
     - Scanner `consume_done_screen`
     - Scanner `waste_done_screen`
     - Maintenance/multi-site stale entries found by global prototype validation.

5. Priority normalization
   - Normalized 04/05/06/07/08 task priorities into ACP convention bands: 50, 80, 100, 120, 150.
   - Lower number remains earlier/faster.

6. `docs/prd/03-TECHNICAL-PRD.md`
   - Reworded stale `[NO-PROTOTYPE-YET] BLOCKER` wording into `[SPEC-DRIVEN-WAVE0]` language.
   - Reason: T-085..T-089 now provide spec-driven ACP-ready UI tasks; dedicated prototype build is optional/future, not a T3 drafting blocker.

## Validation evidence

Commands run after final cleanup:

```bash
cd /Users/mariuszkrawczyk/Projects/monopilot-kira
for d in _meta/atomic-tasks/00-foundation \
         _meta/atomic-tasks/01-npd \
         _meta/atomic-tasks/02-settings \
         _meta/atomic-tasks/03-technical \
         _meta/atomic-tasks/04-planning-basic \
         _meta/atomic-tasks/05-warehouse \
         _meta/atomic-tasks/06-scanner-p1 \
         _meta/atomic-tasks/07-planning-ext \
         _meta/atomic-tasks/08-production; do
  python3 "$d/_validate.py"
done
```

Result:

- 00 Foundation: `VALIDATION PASS — 52 tasks, 52 unique deliverables.`
- 01 NPD: `PASS: 100 task files validated, coverage.md clean`
- 02 Settings: `PASS — 0 failures`
- 03 Technical: `PASS: all checks green.`
- 04 Planning Basic: `PASS — 0 failures`
- 05 Warehouse: `PASS: 57 tasks, manifest + coverage.md OK`
- 06 Scanner P1: `ALL PASS`
- 07 Planning Ext: `PASS`
- 08 Production: `PASS: 55 tasks validated`

Custom ACP/prototype validation:

- 651 task payloads checked.
- Required ACP top-level fields present.
- `pipeline_name == kira_dev`.
- Canonical `pipeline_inputs` fields present.
- Dependencies are concrete local `T-XXX` IDs.
- Priorities normalized to allowed bands.
- Prototype index JSON parses.
- Referenced prototype files exist.
- Checked line ranges are not beyond current file length.

Result:

- `CUSTOM_ACP_AND_PROTO_OK`

Git diff whitespace/conflict validation:

- `git diff --check` passed.

## Production flow readiness

The core production flow is now documented/tasked end-to-end:

1. 01 NPD
   - Brief creates NPD Project, e.g. `DEV-xxx`.
   - G3 creates/maps FG.
   - NPD Builder creates WIP/intermediates + FG + initial shared BOM + initial `factory_spec/internal_product_spec` status `in_review`.
   - Release read model/event contract is owned in 01/03, not D365.

2. 03 Technical
   - Approves factory_spec/BOM bundle.
   - Maintains shared BOM/factory spec after release.
   - Validates RM usability.
   - Handles supplier specs Phase 1 and Technical sensory where policy requires.
   - Former no-prototype screens are now spec-driven ACP tasks, not blockers.

3. 04 Planning Basic
   - Consumes canonical factory release read model.
   - Blocks pending/blocked products.
   - Creates WO snapshots with:
     - `active_bom_header_id`
     - `active_factory_spec_id`
     - `factory_release_event_id`
     - `factory_release_status_at_creation`

4. 05 Warehouse
   - Covers LP creation, GRN from PO, putaway/move/split/merge, reservations, FEFO, shelf-life rules, use-by override, label print, genealogy, warehouse E2E.
   - WH-008/WH-109/M-12 decisions applied.

5. 06 Scanner P1
   - Covers canonical scanner index, PIN/camera, mobile P1 done screens, consume/output/coproduct/waste/QA flows, mobile evidence policy.
   - Offline queue remains P2/non-blocking.

6. 07 Planning Ext
   - Covers planning extension surfaces and guards; D365/local export flags are not allowed to drive factory readiness/scheduling.
   - P2/no-dedicated-prototype surfaces are explicitly non-blocking or inline/spec-driven.

7. 08 Production
   - START/consume/output/coproduct/waste execution uses approved WO snapshots.
   - Production does not pick latest BOM/spec dynamically.
   - D365 push/outbox is side-effect only.
   - Deprecated `release_wo_modal` is not to be implemented as Production release ownership.

## 01/02/03 UI/prototype question

Answer: 01/02/03 have enough UI/task/prototype/UX coverage to start staged implementation, but not perfect source-level JSX labeling.

- 01 NPD:
  - Implementation readiness: yes.
  - Full prototype inventory: almost complete.
  - Remaining optional prototype-build candidate: G3 FG create/map exact surface if we want 100% prototype inventory.

- 02 Settings:
  - Implementation readiness: yes after Wave0.
  - Full prototype inventory: not perfect; several surfaces are UX/spec-driven rather than exact prototype screens.
  - Opus is optional if PO wants full visual inventory before implementation.

- 03 Technical:
  - Implementation readiness: yes after spec-driven Wave0 tasks.
  - Best candidate for Opus prototype-build if we want to improve visual certainty before Sonnet implementation/review.
  - Recommended optional Opus surfaces:
    - Bulk Import CSV
    - BOM Snapshots Viewer
    - Regulatory Compliance Dashboard
    - Lab Results Log
    - Cost Import from D365
    - FactorySpec+BOM approval bundle

Labeling/index state after cleanup:

- Broken master-index discoverability found by review agents was patched.
- Missing UI parity policy file was created.
- Scanner master module ownership and stale line ranges were patched.
- Literal `data-prototype-label` anchors are still not universal in JSX. This is not an ACP/task blocker because external prototype indexes are canonical, but it is a good Sonnet cleanup task before UI-heavy implementation if you want selector-level automation.

## Do we need Opus or Sonnet now?

Recommended, but not blocking for ACP draft import:

### Opus prototype-build work

Use Opus only where it adds real design/spec value, not for every module.

High-value optional Opus work:

1. 03 Technical dedicated prototype pack:
   - Bulk Import CSV
   - BOM Snapshots Viewer
   - Regulatory Compliance Dashboard
   - Lab Results Log
   - Cost Import from D365
   - FactorySpec+BOM approval bundle

Optional smaller Opus work:

2. 01 NPD G3 FG create/map exact prototype surface.
3. 02 Settings full prototype inventory only if you want no spec-driven UI surfaces.
4. 08 Production changeover gate modal enhancement if the current stub is too weak for 1:1 implementation.

Not necessary as blockers:

- 04 Planning Basic
- 05 Warehouse
- 06 Scanner P1
- 07 Planning Ext

### Sonnet labeling/index cleanup

Recommended before large UI implementation waves:

1. Add `data-prototype-label` or equivalent source anchors for first-class labels in 01-08, starting with UI-heavy/high-risk screens.
2. Keep external prototype indexes canonical and add tests that consume them.
3. Ensure every UI T3/T4 closeout attaches screenshots and Playwright traces/artifacts.

Because external indexes are now canonical and validated, this is a quality accelerator, not a start blocker.

## Remaining risks / blockers

No hard blocker for staged ACP implementation of 00-08.

Remaining risks are sequencing/operational, not missing-doc blockers:

1. Do not queue all 651 tasks at once.
2. 09 Quality exact task IDs are still pending; 05/06/08 currently use typed external Quality contracts.
3. 03 Technical dedicated prototypes would reduce review risk, but spec-driven tasks are enough to start.
4. Source-level JSX labels are not universal; external prototype indexes are canonical for now.
5. Working tree is large and dirty; review before commit.

## Recommended ACP implementation order

Draft import / stage only first, then promote small waves:

1. Foundation/release spine:
   - 00 foundation org/RLS/FG/factory-release constants.
   - 01 NPD release model tasks, especially G3 FG + NPD Builder + release read model.
   - 03 Technical factory_spec/BOM approval tasks.

2. Settings enforcement:
   - 02 auth/org/RLS/rule registry/permissions/import-export guards.

3. Planning/Production guard spine:
   - 04 WO factory release snapshot.
   - 08 START/consume/output release guards.

4. Warehouse/Scanner operational slice:
   - 05 LP/GRN/move/split/reserve/FEFO/shelf-life/genealogy.
   - 06 scanner P1 consume/output/done screens/PIN/camera.

5. Planning Ext and Production advanced flows:
   - 07 scheduling extensions.
   - 08 Production E2E/outbox/D365 side-effect flows.

6. Quality integration follow-up:
   - Replace typed 09 Quality contracts with exact 09 task IDs after Quality module hardening.

## Files changed/created in this continuation

Key new/changed artifacts:

- `_meta/decisions/2026-05-03-next-modules-warehouse-scanner-planning-production-decisions.md`
- `_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md`
- `_meta/reviews/2026-05-03-00-08-production-start-readiness-final-report.md`
- `_meta/reviews/2026-05-03-04-planning-basic-full-readiness-hardening.md`
- `_meta/reviews/2026-05-03-05-warehouse-wave-next-3-hardening-report.md`
- `_meta/reviews/2026-05-03-06-scanner-p1-wave-next-3-hardening-closeout.md`
- `_meta/reviews/2026-05-03-08-production-full-readiness-hardening.md`
- `_meta/reviews/2026-05-03-01-02-03-ui-prototype-labeling-completeness-after-wave0.md`
- PRD/UX/task/prototype index changes across 04/05/06/07/08.
- Final hygiene patches in 03 Technical PRD, 05 T-055, master-index and selected prototype indexes.

Current working tree size after this wave:

- `593 files changed`
- `18411 insertions`
- `4574 deletions`
- `707` changed/untracked status entries

This wave is not committed.
