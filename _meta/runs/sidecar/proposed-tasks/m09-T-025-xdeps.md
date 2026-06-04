# PROPOSED REFINEMENT — 09-quality T-025 soft cross-module dep

**Type:** edit existing task. **Priority:** LOW. **Finding:** Q-2.

## Problem
`T-025` (quality_inspections + quality_test_results schema) FK-references `items` (product master, 03-TECH/01-NPD SSOT) via `product_id UUID REFERENCES items(id)` and `specification_id` (own T-017). It declares `dependencies:[]` and `cross_module_dependencies:null`. Wave-planning could schedule it before the product table exists.

## Proposed change
Add a soft cross-module dep:
```json
{"module": "01-npd", "task_id": "T-001",
 "reason": "quality_inspections.product_id FK → items (product FG SSOT). Product master table must exist before inspections schema migration."}
```
(Or the 03-TECHNICAL items-owner task if `items` is owned there — confirm canonical owner during consolidation; per manifests product FG SSOT = 01-NPD T-001.)

## Acceptance
- T-025 scheduled after product master table lands.
