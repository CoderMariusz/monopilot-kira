# PROPOSED TASK — [P1] Fix outbox event-union drift (6 emitted events fail the CHECK constraint)

**Module:** 02-settings · **Severity:** P1 · **Source:** side-car audit F3

## Problem
Six settings event types are emitted by real Server Actions but absent from `outbox_events_event_type_check`
(authoritative version = `140-outbox-event-type-reconcile-6.sql`). The emit sits inside the action `try`, so a CHECK
violation is swallowed into a generic `persistence_failed` — the user sees "save failed" with no real cause.

| Event | Emit site |
|---|---|
| `settings.dept_override.updated` | `apps/web/actions/tenant/set-dept.ts:83` |
| `settings.rule_variant.updated` | `apps/web/actions/tenant/set-rule-variant.ts` |
| `settings.upgrade.scheduled` | `apps/web/actions/tenant/start-upgrade.ts` |
| `settings.upgrade.rolled_back` | `apps/web/actions/tenant/rollback-upgrade.ts` |
| `settings.user.invitation_resent` | `apps/web/actions/users/invitations-lifecycle.ts` |
| `settings.onboarding.first_wo_created` | `apps/web/actions/onboarding/mark-first-wo-created.ts` |

Also: `packages/outbox/src/events.enum.ts` is stale (12 settings events; missing infra `*.upserted`,
`warehouse.deactivated`, and the 6 above). T-003 ✅ is outdated.

## Acceptance criteria
1. New migration extends `outbox_events_event_type_check` to include the 6 events (idempotent drop+recreate full union).
2. `packages/outbox/src/events.enum.ts` synced to the DB constraint's full list.
3. New test: every `eventType:` literal under `apps/web/actions/**` is a member of both the enum and the DB constraint
   union (mechanize so it stops drifting — this is the 7th reconcile; chronic).
4. Integration proof against real PG: a dept-override save and a tenant upgrade-start now succeed (outbox row written).

## Notes
- Decide ownership (F8): these are settings events; the settings module should own the migration rather than relying
  on an NPD reconcile pass.
