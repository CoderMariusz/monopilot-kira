# PROPOSED TASK STUB — create MON-domain-multisite skill (build-readiness gap)

> Proposal only. Not added to any manifest/STATUS.

## Problem (evidence)
- 13-maintenance has a dedicated domain skill `.claude/skills/MON-domain-maintenance/SKILL.md` (opus, 151 lines).
- 14-multi-site has **no dedicated domain skill**; it relies on the generic `MON-multi-tenant-site` ("THE LAW"
  RLS/org_id skill). Given 14's surface — IST state machine (to_state_machine_v1 IN_TRANSIT), transport lanes +
  versioned rate cards (supersede chain), replication queue + conflict resolution, the 21-table site_id activation
  migration, hierarchy config, cross-site dashboards — a domain playbook is warranted for consistent decomposition.

## Proposed scope
- Author `.claude/skills/MON-domain-multisite/SKILL.md` (model: opus; canonical_spec: docs/prd/14-MULTI-SITE-PRD.md)
  covering: D-MS-1..18 decisions, site-scoped vs master split (D-MS-4), the site_id strategy (link D-1 decision),
  RLS two-variant pattern, `withSiteContext`/`current_site_id()`, IST + lanes + rate-card lifecycle, activation
  wizard state machine, F-5 oee_snapshots owner rule, phantom-package + migration-renumber gotchas.
- Register in `MON-INDEX.md` (via /kira:skills-overhaul).

## Acceptance
- Skill exists, triggers on 14-multi-site task descriptions, references PRD anchors + D-1/F-5 decisions.

## Risk tier: low (docs/skill).
## Cross-module: 14-multi-site.
</content>
