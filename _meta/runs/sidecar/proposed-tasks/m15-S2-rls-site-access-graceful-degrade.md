# PROPOSED STUB — m15-S2 (15-oee): RLS policies must degrade gracefully pre-14-multi-site

**Severity:** Low-Medium — preventive (sidecar F-1 adjacent).
**Type:** Fix (RLS robustness). Not a feature.

## Problem (evidence)
- 15-oee T-003 (`shift_configs`, `oee_alert_thresholds`) and T-004 (`shift_patterns`,
  `org_non_production_days`) define RLS policies of the form:
  `USING (org_id = app.current_org_id() AND (site_id IS NULL OR site_id IN
   (SELECT site_id FROM site_user_access WHERE user_id = auth.uid())))`.
- `site_user_access` / `sites` are owned by **14-multi-site** and may NOT exist when 15-oee
  runs (sidecar F-1: day-1 site_id assumed but not yet provisioned).
- If the policy references a non-existent `site_user_access` table, the migration fails OR the
  policy errors at query time.

## Proposed resolution
- Make the policy degrade: when `site_user_access` is absent, the policy filters on
  `org_id = app.current_org_id()` only (site_id is nullable REC-L1; all rows have site_id NULL
  pre-14-multi-site, so the `site_id IS NULL` branch already passes). Either:
  (a) gate the `site_user_access` sub-select behind an `IF EXISTS` check in the migration, or
  (b) ship the site_id sub-clause as a follow-up migration owned/triggered by 14-multi-site.
- Apply the same pattern consistently across T-002/T-003/T-004 (and T-023 P2 tables).

## Acceptance
- 15-oee RLS migrations apply cleanly on a DB WITHOUT `site_user_access`/`sites`, with org-level
  isolation enforced; site-level filtering activates once 14-multi-site lands.
- RLS isolation tests (two orgs) pass in both states.

READ-ONLY proposal.
