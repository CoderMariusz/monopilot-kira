# PROPOSED STUB — m10-S1 (10-finance): Reconcile NUMERIC money precision

**Severity:** High — blocker for a clean 10-a start.
**Type:** Fix / decision (skill + PRD + tasks alignment). Not a feature.

## Problem (evidence)
- `.claude/skills/MON-domain-finance/SKILL.md` lines 47-56 mandate:
  Money = `NUMERIC(18,4)`, Quantity/kg = `NUMERIC(14,3)`, Percent = `NUMERIC(8,2)`,
  FX rate = `NUMERIC(12,6)`. Header says "NUMERIC precision (HARD RULE)".
- `docs/prd/10-FINANCE-PRD.md` §6.4 DDL and the finance task JSONs use:
  money `NUMERIC(15,4)` (12 occurrences across tasks), qty `NUMERIC(12,3)` (5×),
  FX `NUMERIC(15,6)` (2×), one `NUMERIC(16,4)` (`item_wac_state.total_value`),
  one `NUMERIC(10,4)`, percent `NUMERIC(8,2)` (matches).
- Agents read the SKILL as authority → will emit `(18,4)`/`(14,3)` while task DDL says
  `(15,4)`/`(12,3)` → migration vs Drizzle vs test mismatches and review churn.

## Proposed resolution
Pick ONE precision policy and make skill + PRD §6.4 + every 10-finance task DDL agree:
- **Recommended:** adopt the skill's `NUMERIC(18,4)` money / `NUMERIC(14,3)` qty /
  `NUMERIC(12,6)` FX as the standard (headroom + matches the documented HARD RULE), and
  amend PRD §6.4 + tasks T-002, T-009, T-015, T-021, T-024, T-027 accordingly.
- Alternatively, downgrade the skill to `(15,4)`/`(12,3)` to match the PRD — but the skill
  explicitly bills itself as the hard rule, so amending tasks up is cleaner.

## Acceptance
- `grep -rho 'NUMERIC([0-9]*,[0-9]*)' _meta/atomic-tasks/10-finance/tasks/` returns ONE money
  scale and ONE qty scale, matching MON-domain-finance/SKILL.md exactly.
- All money columns remain pinned (no bare NUMERIC) and totals/variances stay GENERATED STORED.

READ-ONLY proposal — implement during consolidate/plan, not in this audit.
