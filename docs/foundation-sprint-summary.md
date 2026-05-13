# 00-Foundation Remediation Sprint Summary

Closure document for the F-1..F-5 sprint that hardened the foundation
module after the deep audit.

## Slot deliverables

| Slot | Commit  | Theme                          | Notable artifacts                                                                 |
| ---- | ------- | ------------------------------ | --------------------------------------------------------------------------------- |
| F-1  | dad1ee7 | Outbox + cascade + ref seed    | outbox dispatch wired, cross-org cascade reactivated, per-tenant reference seed   |
| F-2  | bfbe4ff | SAML hardening                 | SAML enforce flag wired (FT-028), Jackson createConnection (FT-030), jti replay   |
| F-3  | 61c6fcd | Test hygiene + scaffolds       | Modal vacuous-assert fix, Storybook wired, Playwright e2e scaffold (T-053)        |
| F-4  | 282c4f6 | DB / security sweep            | Approval-token prune cron 034, idp grants 035, MFA guard, owner pool memoisation  |
| F-5  | (this)  | Final sweep + readiness report | Test sweep, tsc/lint verify, this summary                                         |

## Migration count

Migrations 001–036 present; sequence verified with intentional reassignment
holes at 008, 020, 021 (see STATUS.md migration ordering lock), and no gaps in 032–036
(`032-reference-seed-on-org-insert`, `033-consumed-approval-tokens`,
`034-approval-token-prune-cron`, `035-tenant-idp-grants`,
`036-audit-log-retention`).

## Test status (F-5 sweep, 2026-05-08)

| Package              | Pass | Skip | Fail |
| -------------------- | ---- | ---- | ---- |
| packages/db          | 78   | 115  | 0    |
| packages/rbac        | 19   | 13   | 0    |
| packages/ui          | 148  | 0    | 0    |
| packages/outbox      | 15   | 3    | 0    |
| packages/auth        | 24   | 37   | 0    |
| packages/rule-engine | 33   | 12   | 0    |
| apps/web (pnpm test) | 136  | 15   | 0    |

Workspace `pnpm test` is green. Skips are mostly DB-integration tests
that require a live Postgres + RLS env.

## Static checks

- `tsc --noEmit` (apps/web): 0 errors
- `pnpm --filter web lint`: 0 errors, 33 warnings (pre-existing)

## Pre-conditions for 02-settings

- Foundation tests green at workspace level
- Migrations sequential through 036
- Outbox dispatch + cron infra live
- SAML/IdP grant primitives in place for tenant-scoped settings UI
