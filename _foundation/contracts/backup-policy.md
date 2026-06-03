# Backup Policy Contract

Task: T-119  
Owner: Foundation / platform operations

This contract defines backup and verification requirements for MonoPilot Kira data. It documents the disaster-recovery target for module owners; it does not implement backup orchestration. Actual backup execution is operator configuration.

## RPO

| Class | Data class | Recovery point objective | Backup source |
| --- | --- | --- | --- |
| Class A | Security audit data: `audit_events`, role grants, `gdpr_erasure_requests` | <= 1h | Continuous WAL with managed PITR or WAL-G |
| Class B | Business state: product, work order, lot, shipment, quality event | <= 24h | Nightly logical dump plus WAL |
| Class C | Reference tables and schema metadata | <= 24h | Nightly logical dump plus migration history |
| Class D | Ephemeral audit, drafts, dry-runs | <= 7 days | Best-effort retained snapshots or exportable state |

## RTO

| Class | Data class | Recovery time objective |
| --- | --- | --- |
| Class A | Security audit data: `audit_events`, role grants, `gdpr_erasure_requests` | <= 1h |
| Class B | Business state: product, work order, lot, shipment, quality event | <= 4h |
| Class C | Reference tables and schema metadata | <= 8h |
| Class D | Ephemeral audit, drafts, dry-runs | <= 24h |

The overall organization-level RTO remains <= 8h for production-critical data classes per PRD §13.

## Backup Strategy

Managed deployments use Supabase managed PITR. Self-hosted deployments use `pg_basebackup` plus WAL-G to S3-compatible storage. WAL retention is 7 days. Logical dumps use `pg_dump` nightly to S3 with object lock enabled.

No application role performs backup orchestration. Backup credentials are held by the deployment operator, not by the web or worker runtime.

## Postgres Roles

| Role | Scope |
| --- | --- |
| `postgres` | Database owner and break-glass administration. Never used by the application runtime. |
| `app_user` | Application data access through RLS and `app.current_org_id()`. Must not read backup objects or cloud backup status. |
| `app_readonly` | Read-only operational inspection. Must not mutate data or access backup credentials. |
| `migrations_runner` | Schema migration execution. Must not be used by application runtime code. |

Backup object reads are service-role only. Verification jobs use a service-role connection or explicit `pg_stat_archiver` read permission; they do not query backup status as `app_user`.

## Verification Cron

The worker registers `backup-verification` as a daily interval job. The intended operational schedule is 02:00 UTC; the current scheduler abstraction represents this as a 24h interval.

For self-hosted Postgres mode, the job queries `pg_stat_archiver.last_archived_time` and requires the value to be newer than the configured maximum age. For managed Supabase mode, the job queries the platform backup status path using `SUPABASE_SERVICE_ROLE_KEY`.

Every verification writes exactly one `public.audit_events` row:

| Outcome | Action | Retention |
| --- | --- | --- |
| Fresh backup status | `backup.verification.succeeded` | `retention_class='security'` |
| Stale or unavailable backup status | `backup.verification.failed` | `retention_class='security'` |

Verification failure is an alerting signal and must not throw from the cron handler. Sentry and audit events are the alerting paths.

## Quarterly Restore Drill

The quarterly restore drill runner and evidence capture are documented by T-120. T-119 only defines the backup policy and daily verification stub.

## Encryption At Rest

All S3 buckets used for backups must enforce SSE-KMS. Supabase managed storage encryption is platform-managed and must remain enabled under the managed deployment contract.

## Out Of Scope

GL/AP/AR/CRM backups are out of scope for MonoPilot Kira and are covered by D365, Xero, or Comarch backup policies per PRD §11 out-of-scope systems.
