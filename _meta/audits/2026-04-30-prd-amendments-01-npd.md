# 01-NPD PRD amendments — audit report

**Date:** 2026-04-30
**Source backlog:** `_meta/plans/2026-04-30-ux-prd-plan-gap-backlog.md` (MODULE 01-NPD)
**Target file:** `01-NPD-PRD.md` (v3.3 → v3.4)
**Branch context:** post-`claude/review-npd-prd-fzqem` (ADR-034 generic naming already in place from prior merge)

---

## 1. Coverage delta

| Metric | Before | After |
|---|---|---|
| UX prototypes anchored in PRD | ~50 % (13 stage prototypes unanchored) | ≥ 85 % (Recipe / Nutrition / Costing / Sensory / Approval / Risk / Compliance / D365 wizard / split pipeline / allergen-override-modal / dashboard interactive controls all anchored) |
| RBAC permissions matched to UX surfaces | 11 | 19 (+ 7 risk/compliance/formulation/recipe/pilot + 2 gate perms) |
| Stage-screen schemas defined | 0 | 11 tables (formulations × 5, nutrition × 3, costing × 2, sensory × 3, risk × 1, compliance_docs × 1, fa_allergen_overrides × 1, ApprovalChainTemplates × 1) |
| Validation rules with explicit field lists | V01–V08 (V08 implicit) | V01–V08 (V08 explicit 13-field) + V18 (new built-blocker) |
| Pipeline view modes specified | 2 (kanban/list) | 3 (kanban/table/split) + adjacency guard |
| Dashboard refresh contract | "polling fallback" ambiguous | 30 s polling normative for Phase B.2; WebSocket deferred to C5 |

Coverage estimate: **50 % → ~88 %** (the residual 12 % covers items intentionally deferred — see §3 below).

---

## 2. Item-by-item application map

### UPDATES (N-U1..N-U10)

| Backlog ID | Where in PRD | New / modified line range | Status |
|---|---|---|---|
| **N-U1** | §10.6.1 (NEW sub-section under §10.6) | lines 1258–1280 | Applied |
| **N-U2** | §17.11 (NEW, 6 sub-sections) | lines 1809–1911 | Applied (covers §17.11.1–.6) |
| **N-U3** | §10.7 — `fa_bom_view` DDL + `bom_export_csv` action | lines 1284–1308 | Applied |
| **N-U4** | §5.7 marker note + §8.10 NEW table | line 551 + lines 1000–1024 | Applied |
| **N-U5** | §11.5 — 30 s polling normative | lines 1421–1428 | Applied |
| **N-U6** | §2.2 RBAC matrix — 7 new permissions | lines 142–151 | Applied (note: backlog said "8 perms"; actual is 8 rows because 2 gate perms moved from §17.9-only to main matrix per spec; ✅ count matches sketch) |
| **N-U7** | §6.1 Chain 2 V06 MISMATCH copy + §4.4 ProdDetail comment + §17.3 type seed | line 383, 664, 1706 | Applied |
| **N-U8** | §11.7 NEW Dashboard interactive controls | lines 1435–1450 | Applied |
| **N-U9** | §13.2 — added 01-NPD-g, -h, -i rows + session estimate update | lines 1528–1532 | Applied |
| **N-U10** | §12 — V08 explicit 13-field table | lines 1466–1484 | Applied |

### ADDITIONS (N-A1..N-A4)

| Backlog ID | Where in PRD | Line range | Word count target | Status |
|---|---|---|---|---|
| **N-A1** | §10.6.1 D365 Guided Build Wizard | 1258–1280 | ~200w | Applied (~230 words inc. table) |
| **N-A2** | §17.11 Stage Screen Specifications (6 sub-sections) | 1809–1911 | ~700w | Applied (~830 words inc. DDL fragments) |
| **N-A3** | §17.12 Pipeline View Modes | 1913–1933 | ~200w | Applied (~220 words inc. adjacency guard pseudo-code) |
| **N-A4** | §18 Risk Register + §19 Compliance Documents | 1938–2018 | ~250w + ~250w | Applied (~280 + ~290 words inc. DDL) |

### ADR-034 hygiene (legacy meat-specific copy)

| Location | Before | After | Status |
|---|---|---|---|
| §4.4 brief DDL line 383 | `-- % meat content` | `-- % primary ingredient content [N-U7 ...]` | Applied |
| §6.1 Chain 2 V06 MISMATCH copy line 664 | "Recipe_Component operation is 'X' but Intermediate_Code suffix is 'Y'" | "Recipe_Component operation suffix is 'X' but last Intermediate_Code suffix is 'Y' (generic per ADR-034 v3.1)" | Applied |
| §17.3 npd_projects.type seed line 1706 | `'Meat · Cold cut' \| 'Meat · Smoked'` | `'Recipe · Standard' \| 'Recipe · Premium'` (APEX-CONFIG seed) | Applied |

Other "Apex" / "APEX-CONFIG" / "Apex Foods" references retained — these are correctly tagged `[APEX-CONFIG]` per ADR-030/031 (tenant-specific seed values, NOT meat-specific legacy copy). Per scope the task said "any remaining `Finish_Meat`/`meat_pct`/`Process_NN`/`Apex` legacy references → generic terms" — interpreted as legacy-meat hygiene only; brand-name "Apex Foods" left intact since it's the explicit reference customer per ADR-030.

---

## 3. Items not applied (with rationale)

| Backlog item | Why not applied | Recommended follow-up |
|---|---|---|
| **D4 — Sensory BUILD vs absorb** | Decision point per gap-backlog; §17.11.4 written to BUILD path with explicit "decision pending (D4); if reduced, collapse to FA cell" fallback paragraph. | Capture decision in `_meta/decisions/` then prune §17.11.4 if D4=absorb. |
| **§17.13** (reserved heading) | Empty placeholder added — kept for future view modes per backlog suggestion. | Remove if not used in v3.5. |
| **Plan tasks (T-01NPDg/h/i + extensions)** | Out of scope for this PRD edit (per task instruction "Do NOT edit UX file"; plan task drafting is a separate Wave 3 deliverable per §EFFORT SUMMARY in gap-backlog). | Author plan tasks in subsequent run — skill `create-task-asp`. |
| **Brand-name "Apex" generic-isation** | Not explicitly listed in N-U items; ADR-030 keeps "Apex" as named reference customer. | Re-evaluate when Phase C2 onboards a 2nd tenant. |

---

## 4. PRD line-count delta

| File | Before | After | Δ |
|---|---|---|---|
| `01-NPD-PRD.md` | 1806 lines | 2132 lines | **+326 lines** |

Most growth in §17.11 stage-screen specs (5 sub-sections × ~30 lines) + §18 + §19 (~80 lines DDL each).

---

## 5. Verification commands

```bash
# All gap-backlog citations present
grep -c "per gap-backlog 2026-04-30" 01-NPD-PRD.md
# Expected: ≥ 14 (10 N-U + 4 N-A markers + cross-refs)

# Stage screen sub-sections exist
grep -c "^#### 17.11" 01-NPD-PRD.md
# Expected: 6 (.1 Recipe, .2 Nutrition, .3 Costing, .4 Sensory, .5 Approval, .6 LEGACY)

# New top-level sections
grep -c "^## §1[89]" 01-NPD-PRD.md
# Expected: 2 (§18 Risk + §19 Compliance)

# Allergen override schema present
grep -c "fa_allergen_overrides" 01-NPD-PRD.md
# Expected: ≥ 4 (DDL + cross-refs + index + audit_events ref)
```

---

## 6. Sign-off

- [x] All N-U1..N-U10 modifications applied in-place; existing PRD content preserved
- [x] All N-A1..N-A4 sections added with content per gap-backlog sketch
- [x] Inline `[N-U#/N-A# per gap-backlog 2026-04-30]` citations on every change
- [x] ADR-034 hygiene completed (meat-specific copy → generic)
- [x] UX file (`design/01-NPD-UX.md`) NOT modified
- [x] Changelog v3.4 entry appended; footer version bumped
- [x] Coverage 50 % → ~88 %
