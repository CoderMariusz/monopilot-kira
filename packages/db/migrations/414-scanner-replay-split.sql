-- Migration 414 (DRAFT — not applied by lane): enforce server/client replay namespace split.
--
-- Server replay rows carry client_op_id for idempotent retries; client telemetry
-- (POST /api/scanner/audit) is namespaced under client.* and must not set
-- client_op_id, so it can never satisfy a server replay probe.
--
-- Idempotency uniqueness is per (org_id, operation, client_op_id) so the same
-- clientOpId may be reused across different scanner mutations independently.

-- (a) Backfill: client telemetry rows must not retain client_op_id (would block
--     server replay tokens or violate the server-only CHECK below).
update public.scanner_audit_log
   set client_op_id = null
 where operation like 'client.%'
   and client_op_id is not null;

alter table public.scanner_audit_log
  drop constraint if exists scanner_audit_log_client_op_id_server_only;

alter table public.scanner_audit_log
  add constraint scanner_audit_log_client_op_id_server_only
  check (client_op_id is null or operation not like 'client.%');

-- (c) Add a 3-col unique index scoped to server replay operations only.
-- NOTE: legacy 2-col index scanner_audit_log_org_client_op_id_uq is kept for old-code compatibility during deploy; drop it in a follow-up migration after code soak.

create unique index if not exists scanner_audit_log_org_operation_client_op_id_uq
  on public.scanner_audit_log (org_id, operation, client_op_id)
  where client_op_id is not null
    and operation not like 'client.%';
