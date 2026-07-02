-- Migration 415 (DRAFT — not applied by lane): drop the legacy 2-column scanner
-- replay unique index.
--
-- Background: mig 265 created scanner_audit_log_org_client_op_id_uq on
-- (org_id, client_op_id). Mig 414 superseded it with a 3-column unique index
-- scanner_audit_log_org_operation_client_op_id_uq on (org_id, operation,
-- client_op_id) scoped to server-only operations (where client_op_id is not null
-- and operation not like 'client.%'). All ON CONFLICT arbiters in application
-- code were retargeted to the 3-column form in wave F2; the 2-column index is
-- no longer referenced by any ON CONFLICT clause or code path.
--
-- Verified before drafting: grep of *.ts / *.tsx / *.sql in the worktree found
-- the 2-column index name only in mig 265 (its CREATE) and mig 414 (a NOTE
-- comment saying to drop it here). Zero live ON CONFLICT clauses use
-- (org_id, client_op_id); the scanner mutation files use
-- (org_id, operation, client_op_id) exclusively.

DROP INDEX IF EXISTS public.scanner_audit_log_org_client_op_id_uq;
