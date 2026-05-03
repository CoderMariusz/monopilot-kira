# 2026-05-03 — Final Wave Closeout: First 3 Modules

Repo: `/tmp/monopilot-kira-current`
Base commit: `cef4b4b403f475f5a6c6ce5d2add26d733f893c9`

## Scope

This wave incorporated final PO decisions and rebuilt the documentation/task backlog for:

- 01-NPD
- 02-SETTINGS
- 03-TECHNICAL

No application implementation code was written. Changes are PRD/UX/prototype-notes/meta/atomic-task contracts only.

## Final PO decisions captured

Decision file:

- `_meta/decisions/2026-05-03-flow-d365-settings-technical-decisions.md`

Locked decisions:

- Canonical product term: `FG` / Finished Good.
- Legacy `FA` is compatibility alias only.
- Stage-Gate G0-G4 is MVP.
- Brief creates NPD project (`DEV-123` style).
- Project creates/maps FG at G3.
- NPD Builder creates WIP/intermediates, FG, initial shared BOM version and initial product/factory-spec artifacts.
- One shared BOM table/model is SSOT across NPD/Technical/Planning/Production/integrations.
- D365 is optional import/export integration only; it is not the canonical source of truth.
- Released BOM/product/factory_spec edits create a new version and require Technical approval before factory use.
- Technical-owned factory specification: `factory_spec` / `internal_product_spec`.
- PO actuals record actuals and trigger review/non-conformance; they never silently update supplier_spec or BOM cost_per_kg.
- TO actuals can affect inventory/location/lot/shelf-life and trigger non-conformance; they never change specs/BOM/cost.
- Technical/BOM validates RM usability before BOM/factory use.
- Lab results are Quality-owned read model for Technical.

## E2E spike result

Spike report:

- `_meta/reviews/2026-05-03-e2e-product-release-spike.md`

Initial verdict from spike: **not E2E-ready yet**. Main missing spine:

- Brief -> Project was not explicit enough.
- G3 create/map FG was missing.
- G4 release/NPD Builder transaction was missing.
- factory_spec approval and release-to-factory read model were missing.
- Settings/Auth needed server-side enforcement and rule seed.
- Technical needed approval bundle, release state and NCR contracts.

These blockers were then patched as backlog/task contracts in the final blocker patch wave.

## 01-NPD final patch

Task count after patch:

- 98 tasks
- manifest: `_meta/atomic-tasks/01-npd/manifest.json`
- coverage: `_meta/atomic-tasks/01-npd/coverage.md`

Key patched tasks:

- T-030 — Brief schema links to NPD project; FG not created before G3.
- T-031 — createBrief creates/links canonical NPD project in G0 transactionally.
- T-033 — legacy convertBriefToFa becomes Brief->Project compatibility wrapper; no canonical FG before G3.
- T-034/T-035 — Brief UI/modals use Project/FG terminology and project-first routing.
- T-056 — final G0-G4 checklist seed includes dept closure, G3 FG mapping, G4 RM usability/BOM/factory_spec/Technical approval handoff.
- T-058 — gate actions block G3 without FG candidate and G4 without dept closure/release preflight/Technical approval handoff.
- T-062 — E2E extends to Brief->G4->NPD Builder release->Technical approval->release read model.
- T-093 — shared BOM write is part of release orchestrator and cannot independently mark factory usability.

New NPD tasks:

- T-095 — G3 create/map FG candidate.
- T-096 — canonical `releaseNpdProjectToFactory` / `executeNpdBuilderRelease` orchestrator.
- T-097 — shared factory release status/read model.
- T-098 — full Brief->Project->G3 FG->G4 release->Technical approval->factory read model E2E.

## 02-SETTINGS final patch

Task count after patch:

- 123 tasks
- manifest: `_meta/atomic-tasks/02-settings/manifest.json`
- coverage: `_meta/atomic-tasks/02-settings/coverage.md`

Key patched tasks:

- T-002 — permission enum accepts Settings-owned cross-module permissions:
  - `npd.released_product_edit.request`
  - `npd.released_product_edit.authorize`
  - `technical.product_spec.approve`
- T-020 — `setCoreFlag` must server-side enforce:
  - V-SET-42 D365 integration preflight
  - V-SET-43 NPD post-release edit policy
  - V-SET-44 Technical product spec approval policy
- T-119 — Pending Invitations screen deepened with permission denied/read-only, resend/revoke semantics.
- T-120 — Roles & Permissions deepened with workflow permission visibility and policy summaries.
- T-121 — Global Import/Export deepened, including authorization policy import guard.
- T-122 — org_authorization_policies contract deepened with schema/actions/UI/tests, blocker codes and audit/outbox.

New Settings task:

- T-123 — seed active P1 rule `technical_product_spec_approval_gate_v1`.

## 03-TECHNICAL final patch

Task count after patch:

- 83 tasks
- manifest: `_meta/atomic-tasks/03-technical/manifest.json`
- coverage: `_meta/atomic-tasks/03-technical/coverage.md`

Key patched tasks:

- T-038 — BOM detail has release badge, linked factory_spec blocker, clone-on-write banner, RM usability panel.
- T-039 — BOM edit modal enforces RM usability, clone-on-write and D365 optional posture.
- T-060 — spec review UI reframed as Technical approval/factory_spec/release blocker surface.
- T-073 — shared BOM SSOT approval is bundle-aware and release-model dependent.
- T-074 — RM usability adds server-side enforce points and UI report shape.
- T-076/T-077 — PO/TO actual triggers link to shared NCR event contract.
- T-078 — UI prototype red-line governance links to T-083.

New Technical tasks:

- T-072 — supplier_specs Phase 1 docs/API/UI brief.
- T-073 — shared BOM SSOT + released edit clone-on-write enforcement.
- T-074 — RM usability shared decision service.
- T-075 — supplier_specs Phase 1 governance and review states.
- T-076 — PO actuals review/non-conformance trigger.
- T-077 — TO actuals review/non-conformance trigger.
- T-078 — UX implementation red-lines.
- T-079 — factory_specs Technical-owned version approval foundation.
- T-080 — FactorySpec+BOM bundle approval API/UI flow.
- T-081 — shared release status model/adapters.
- T-082 — canonical `non_conformance.requested` event contract for PO/TO triggers.
- T-083 — local UI copy/prototype red-lines for FG/factory_spec/shared BOM/RM usability/D365.

## Verification

Final validation command results:

- `_meta/atomic-tasks/01-npd/tasks`: 98 task JSON files
- `_meta/atomic-tasks/02-settings/tasks`: 123 task JSON files
- `_meta/atomic-tasks/03-technical/tasks`: 83 task JSON files

Manifest validation:

- 01-npd manifest: 98 disk / 98 listed
- 02-settings manifest: 123 disk / 123 listed
- 03-technical manifest: 83 disk / 83 listed

All required `kira_dev` fields present:

- root_path
- description
- details
- scope_files
- acceptance_criteria
- test_strategy
- risk_red_lines
- skills
- checkpoint_policy

`git diff --check`: PASS.

## Current verdict

After the final blocker patch wave, the first three modules now have an ACP-ready task spine for the intended E2E flow:

1. Brief creates NPD project.
2. Stage-Gate G0-G4 controls MVP flow.
3. G3 creates/maps FG candidate.
4. G4 release orchestrator calls NPD Builder.
5. NPD Builder creates WIP/intermediates + FG + initial shared BOM + factory_spec artifacts.
6. RM usability is validated.
7. Settings/Auth supplies per-org authorization and Technical approval gates.
8. Technical approves factory_spec/BOM bundle.
9. Shared release status/read model gates factory/Planning/Technical availability.
10. D365 export is optional and cannot set canonical release/factory state.

This is now much closer to agent-executable. It is still documentation/task work, not implementation. The next safe step is to run a small ACP draft import/wave review, not launch all tasks at once.

## Recommended next wave

Recommended ACP order:

1. Import as draft only.
2. Promote 2-3 foundation/schema tasks first:
   - Settings T-002/T-122/T-123
   - Technical T-073/T-074/T-079/T-081
   - NPD T-095/T-096/T-097
3. Verify RED/GREEN/REVIEW/CLOSEOUT evidence for each.
4. Then promote UI parity tasks only after backend state/permissions are real.

## Notes

The working tree is intentionally uncommitted for review.

Review with:

```bash
cd /tmp/monopilot-kira-current
git status --short
git diff --stat
git diff --check
```
