# Cleanup & Migration Report — 2026-04-17

**Action:** Monopilot Migration Phase 0 reorganization. Foundation deliverables moved from `new-doc/00-foundation/` into `monopilot-kira-main/_foundation/`; legacy `new-doc/` archived to `_archive/`. Clean working repo established.

## What moved where

### Foundation (_foundation/)
- META-MODEL.md (from new-doc/00-foundation/decisions/)
- 4 ADRs 028-031 (from new-doc/00-foundation/decisions/)
- REALITY-SYNC.md (from new-doc/00-foundation/patterns/)
- 5 skills (schema-driven-design, rule-engine-dsl, reality-sync-workflow, multi-tenant-variation, documentation-patterns)
- REGISTRY.yaml, SKILL-MAP.yaml, SKILL-AUDIT.md, CONSOLIDATION-REPORT.md

### Meta (_meta/)
- Spec: 2026-04-17-monopilot-migration-design.md
- Plan: 2026-04-17-phase-0-meta-spec.md
- Handoff: 2026-04-17-phase-0-close-and-phase-a-bootstrap.md
- Reality-sources/pld-v7-excel/ (placeholder README)

### Archive (_archive/new-doc-2026-02-16/)
- Full original new-doc/ tree (16 modules + 00-foundation full + _meta + presentation + screenshots + Raporting) — 2912 files
- Pre-Phase-0 ADRs (001-027) + 60+ foundation files (prd/, patterns/, procedures/, guides/, api/, other/)
- 16 module directories with their original sub-structures (prd/, stories/, context/, ux/, qa/, api/, guides/)

### Untouched
- monopilot-kira-main/ original contents (15 PRDs + 2 HTMLs + 1 index) — baseline for Phase B/C
- docs/superpowers/ (user's Claude Code tool integration) — specs/plans kept as duplicate reference
- v7/ (VBA scripts — reality source for Phase A)
- ~/.claude/.../memory/ (updated separately by Claude controller)

## Paths updated

Inside `_meta/handoffs/2026-04-17-phase-0-close-and-phase-a-bootstrap.md`:
- `new-doc/00-foundation/*` references → `_foundation/*`
- `new-doc/_meta/reality-sources/*` → `_meta/reality-sources/*`
- Spec reference `docs/superpowers/specs/*` → `_meta/specs/*`
- Skills archive path `new-doc/00-foundation/other/...` → `_archive/new-doc-2026-02-16/00-foundation/other/...`
- Added Archive section at end of HANDOFF

Inside `_foundation/META-MODEL.md`:
- Source spec link rewritten to `_meta/specs/2026-04-17-monopilot-migration-design.md`
- Extends (partial) line de-linked (ADR-003/011/012 are in archive)
- Added "Archive note (post-migration 2026-04-17)" section explaining pre-Phase-0 ADR location in `_archive/`
- Pre-Phase-0 ADR inline refs in ADR-028..031 and deeper in META-MODEL NOT rewritten (too many mutations) — covered by Archive note

## What's still in docs/superpowers/

- `specs/2026-04-17-monopilot-migration-design.md` (duplicate, also in _meta/specs/)
- `plans/2026-04-17-phase-0-meta-spec.md` (duplicate, also in _meta/plans/)

Rationale: keep Claude Code superpowers plugin integration paths intact. Active source-of-truth is now in `_meta/`.

## Next session bootstrap

1. Read `monopilot-kira-main/_meta/handoffs/2026-04-17-phase-0-close-and-phase-a-bootstrap.md`
2. Read `monopilot-kira-main/_foundation/META-MODEL.md` + `REALITY-SYNC.md` + `reality-sync-workflow/SKILL.md`
3. Read spec `_meta/specs/2026-04-17-monopilot-migration-design.md` §3.2 (Phase A detail)
4. Start Phase A Session 1: PROCESS-OVERVIEW.md + DEPARTMENTS.md w `_meta/reality-sources/pld-v7-excel/`

## Stats

- Files moved to _foundation/: 13 (META-MODEL + 4 ADR + REALITY-SYNC + 5 SKILL + REGISTRY + SKILL-MAP + SKILL-AUDIT + CONSOLIDATION-REPORT) — 14 counting new README
- Files moved to _meta/ (copies): 3 (+ 3 new: pld-v7-excel README, _meta README, _foundation README)
- Files moved to _archive/: 2912
- Clean working repo files (excl. archive): 15 PRDs + 3 HTML/index + ~19 foundation/meta + CLEANUP-REPORT = ~38 active files
- Archive size: ~full new-doc/ tree (2912 files across 16 modules + 00-foundation + _meta + presentation + screenshots + Raporting)

## Verification checklist

- [x] monopilot-kira-main/ root: 15 PRDs + 3 HTML/index + _foundation/ + _meta/ + _archive/ + CLEANUP-REPORT.md
- [x] _foundation/ structure matches target (META-MODEL, decisions/ with 4 ADRs, patterns/ with REALITY-SYNC, skills/ with 5 skill-dirs + 4 top-level files, README)
- [x] _meta/ structure matches target (handoffs, specs, plans, reality-sources/pld-v7-excel, README)
- [x] HANDOFF paths updated (verified via Grep: only 2 intentional "legacy" mentions remain)
- [x] _archive/new-doc-2026-02-16/ contains full original tree (2912 files)
- [x] PLD/new-doc/ no longer exists (moved, not copied — verified via ls)
- [x] docs/superpowers/ unchanged (duplicate kept intentionally)
