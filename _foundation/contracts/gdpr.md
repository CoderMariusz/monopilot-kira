# GDPR Erasure Contract

This contract is normative for every MonoPilot module that stores user-linked
PII or operational actor references. The framework lives in `@monopilot/gdpr`;
module-specific tasks register handlers without editing the dispatcher.

## Per-domain handler protocol

Each domain registers exactly one handler under a stable dot-string domain name
such as `npd`, `warehouse`, or `quality.holds`:

```ts
registerErasureHandler(domain, async (ctx) => result);
```

The handler receives `{ orgId, subjectId, reason, tx, dryRun }`, where
`reason` is always `gdpr-rtbf`, `tx` is a `pg.PoolClient`, and `dryRun`
indicates that mutations must be reported but not persisted. The handler returns
`{ domain, rowsAffected, tablesTouched, warnings }`. Duplicate domain
registration is rejected unless the caller intentionally passes `{ force: true }`
for test replacement or controlled module reloads.

## tx-scoped contract

`runErasure(ownerPool, appPool, orgId, subjectId, opts)` owns the transaction
boundary. It registers a fresh session token through the owner/BYPASSRLS pool,
then opens one transaction on the app-role/RLS pool, calls
`app.set_org_context(...)` for `orgId`, and invokes handlers sequentially in
registration order, or in the requested filtered domain order. All handlers
share the same already-context-set transaction client.

Handlers must not call `app.set_org_context`, must not open their own erasure
transaction, and must not run in parallel. A non-dry run is all-or-nothing for a
single subject: any handler error rolls back every business mutation and the
original error is rethrown. A dry run rolls back handler mutations and commits
only the dry-run audit event.

## Audit events

The dispatcher writes one security-retained `public.audit_events` row per run:

- `gdpr.erasure.completed` after a successful persisted erasure
- `gdpr.erasure.dry_run` after a successful dry run
- `gdpr.erasure.failed` after rollback, written through a separate connection

All erasure audit rows use `actor_type='system'`, `resource_type='gdpr_erasure'`,
`resource_id=subjectId`, and `retention_class='security'`.

Domain handlers must never delete `audit_events` rows. Audit history is retained
under the security retention class. PII linked by per-module actor columns such
as `actor_user_id` must be anonymised through sibling per-module handlers
(T-115+) using tombstone columns such as `gdpr_anonymised_user_id` where that
module's schema defines them; this dispatcher does not ship those module
tombstones itself. The audit row itself remains for retention and traceability.

## Normative scope

This contract applies to every module that holds user-FK PII or actor columns,
including Warehouse signed_by, Scanner operator_id, Quality e-sign signers,
and Production WO actor cols. Future module tasks must implement sibling
handlers that anonymise or tombstone their own domain tables while preserving
regulatory retention, event history, and organization isolation through
`org_id`.

## Sibling implementations

The existing NPD erasure logic from T-089 is the first sibling implementation to
wire into this registry. T-114 supplies the worker cron caller, T-115 registers
the NPD handler, and later Warehouse, Scanner, Quality, Production, and Settings
tasks add their handlers dynamically without modifying `@monopilot/gdpr`.
