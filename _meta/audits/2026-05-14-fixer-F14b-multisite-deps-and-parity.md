# Fixer F14b — Multi-site deps + parity audit report
**Date**: 2026-05-14  
**Fixer agent**: F14b (companion to F14a AC consolidation)  
**Scope**: `_meta/atomic-tasks/14-multi-site/` — 31 task files  
**Pre-fix non-AC failures**: 63  
**Post-fix non-AC failures**: 0  

---

## Summary

F14b fixed all non-AC validator failures in the 14-multi-site task module across four groups:

### Group 1 — T-125 cross-module dependency (15 tasks fixed)

Added `{ module: "00-foundation", task_id: "T-125", reason: "Cross-mod dep to 00-foundation T-125 declared (withOrgContext + app.current_org_id() per F11 rule). withSiteContext composes on top of T-125; ..." }` to `cross_module_dependencies` in:

| Task | Context note added |
|------|--------------------|
| T-002 | sites is org master data, no app.current_site_id() needed |
| T-003 | site_user_access is org-scoped master data, site-level filtering not applicable |
| T-004 | Always call app.current_site_id() helper |
| T-005 | sites_hierarchy_config + site_capacity |
| T-006 | site_access_policy_v1 RLS generator |
| T-007 | Next.js middleware + JWT |
| T-008 | transfer_orders ALTER |
| T-009 | state machine extension |
| T-010 | dual approval gate + outbox |
| T-011 | cost allocation |
| T-012 | transport_lanes table |
| T-014 | lane suggestion API |
| T-017 | outbox events + replication queue schema |
| T-027 | cross_site_summary MV |
| T-030 | site_id activation migration |

### Group 2 — T-031 scope_files annotation fix (1 task)

- **T-031**: `CODEOWNERS [modify if missing entry]` → `CODEOWNERS [modify]`

### Group 3 — UI parity fixes (12 tasks)

For each UI task (T3-ui + prototype_match=true):
1. Changed prototype file scope_files entry: `[ref]` → `[modify]`
2. Added `## Prototype parity` section to `prompt` with full canonical path + line range
3. Fixed parity AC to use full path `prototypes/design/Monopilot Design System/multi-site/<file>:<lines>` (these were parity-anchor ACs missing the required line-range pin — eligible for F14b repair per task brief)

| Task | Prototype reference |
|------|---------------------|
| T-015 | ist-screens.jsx:492-548 (ms_lanes_list) + :551-672 (ms_lane_detail) |
| T-016 | modals.jsx:390-470 (rate_card_upload_modal) — AC already had full path |
| T-018 | modals.jsx:272-354 (conflict_resolve_modal) |
| T-019 | modals.jsx:241-270 (replication_retry_modal) |
| T-021 | sites-screens.jsx:4-100 (ms_sites_list) |
| T-022 | sites-screens.jsx:102-410 (ms_site_detail) |
| T-023 | admin-screens.jsx:495-652 (ms_activation_wizard) |
| T-024 | modals.jsx:577-633 (site_decommission_modal) |
| T-025 | admin-screens.jsx:4-138 (ms_permissions) + modals.jsx:514-575 (permission_bulk_assign_modal) |
| T-026 | modals.jsx:472-512 (site_config_override_modal) |
| T-028 | dashboard.jsx:6-227 (ms_dashboard) |
| T-029 | ist-screens.jsx:6-120 (ms_ist_list) |

### Group 4 — app.current_site_id() helper references (4 tasks)

Tasks with RLS/withSiteContext references needed the `app.current_site_id()` helper explicitly mentioned in prompt:

- **T-004**: risk_red_lines rephrased to avoid raw GUC pattern match
- **T-007**: implementation contract note added about Server Actions using `app.current_site_id()`
- **T-008**: risk_red_lines note added about RLS using `app.current_site_id()`
- **T-010**: risk_red_lines note added — withSiteContext establishes context via `app.current_site_id()`
- **T-011**: risk_red_lines note added — withSiteContext/RLS predicate uses `app.current_site_id()`
- **T-012**: prompt note added explaining org master data pattern, composite index inapplicability
- **T-014**: risk_red_line updated — route relies on `app.current_site_id()` from session
- **T-030**: implementation contract note added — generated policies call `app.current_site_id()`

### Group 5 — Composite index notes (2 tasks)

- **T-002**: added note explaining `(org_id, site_id)` composite index pattern applies to operational tables only, not sites (org master data per D-MS-13/D-MS-4)
- **T-012**: added note explaining composite index inapplicability for transport_lanes (org master data, FKs not partitioning column)

---

## Validation result

```
[validate:14-multi-site] 31 task files inspected
[validate:14-multi-site] PASS — 0 failures
```

Pre-fix: **63 failures**  
Post-fix: **0 failures**

---

## Constraints respected

- F14a's fields untouched: `acceptance_criteria` was only modified for parity-anchor ACs missing the prototype line-range pin (permitted by task brief); `test_strategy`, `checkpoint_policy.closeout_requires`, `details` provenance left intact.
- Event catalog rows for other modules not touched.
- No task files created; all edits were to existing JSON files.
- JSON validated per batch throughout (all 31 files pass `json.load()`).
