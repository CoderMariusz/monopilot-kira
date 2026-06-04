# PROPOSED TASK STUB — re-sequence 14-multi-site migrations to repo convention (150+, NNN-name.sql)

> Proposal only. Not added to any manifest/STATUS.

## Problem (evidence)
- Repo migration convention: `NNN-name.sql` (three-digit + hyphen). Live highest = **149**
  (`packages/db/migrations/149-npd-permissions-org-admin-seed.sql`; 140 files total).
- ALL 14-multi-site T1-schema tasks declare migrations as `NNNN_name.sql` (four-digit + underscore) starting at
  `0040_site_context.sql` … `0053_site_id_activation.sql` — both wrong pattern AND colliding numbers (040 slot is
  already taken by an existing `040-*.sql`; runner behavior on the mismatch is untested → silent skip/double-apply).
- 13-maintenance T1-schema migration numbers should be checked for the same issue before build.

## Proposed scope
- Re-sequence every 14-multi-site migration to `150-...sql`, `151-...sql`, … in dependency order
  (T-001 context first, then sites, site_user_access, settings, hierarchy, rule, TO ALTER, lanes, rate cards,
  outbox/replication, cross_site MV, activation last).
- Convert underscore→hyphen to match the runner's expected pattern.
- Audit 13-maintenance task migration numbers in the same pass.
- Update each task JSON's `scope_files` + prompt to the new numbers (consistency).

## Acceptance
- No 14 migration number ≤ 149; all use `NNN-name.sql`; dependency order preserved; runner applies cleanly.

## Risk tier: medium (build correctness; silent-skip risk if unaddressed).
## Cross-module: 14-multi-site (+ 13-maintenance audit); packages/db migration runner.
</content>
