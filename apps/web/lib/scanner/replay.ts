import type { QueryClient } from './db';
import type { ScannerSessionRow } from './session';

/** Client telemetry from POST /api/scanner/audit is namespaced under this prefix. */
export const CLIENT_TELEMETRY_OPERATION_PREFIX = 'client.';

export function toClientTelemetryOperation(operation: string): string {
  const trimmed = operation.trim();
  if (trimmed.startsWith(CLIENT_TELEMETRY_OPERATION_PREFIX)) return trimmed;
  return `${CLIENT_TELEMETRY_OPERATION_PREFIX}${trimmed}`;
}

export type ServerReplayRow = {
  result_code: string | null;
  ext: Record<string, unknown>;
};

/** Max scanner clientOpId token length (receive-po contract). */
export const SCANNER_CLIENT_OP_ID_MAX_LEN = 120;

export function reconstructServerReplayError(replay: ServerReplayRow): {
  error: string;
  status: number;
  extra: Record<string, unknown>;
} {
  const ext = replay.ext;
  const error = replay.result_code ?? 'error';
  const status = typeof ext.status === 'number' ? ext.status : 500;
  const extra: Record<string, unknown> = { ...ext };
  delete extra.status;
  delete extra.woId;
  delete extra.clientOpId;
  delete extra.transactionId;
  return { error, status, extra };
}

export async function acquireScannerIdempotencyLock(
  client: QueryClient,
  orgId: string,
  clientOpId: string,
): Promise<void> {
  await client.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [
    `${orgId}:scanner:${clientOpId}`,
  ]);
}

export async function findServerReplay(
  client: QueryClient,
  orgId: string,
  clientOpId: string,
  operation: string,
): Promise<ServerReplayRow | null> {
  const { rows } = await client.query<{
    result_code: string | null;
    ext: Record<string, unknown> | string | null;
  }>(
    `select result_code, ext
       from public.scanner_audit_log
      where org_id = $1::uuid
        and client_op_id = $2
        and operation = $3
        and operation not like 'client.%'
      limit 1`,
    [orgId, clientOpId, operation],
  );
  const row = rows[0];
  if (!row) return null;
  const ext = typeof row.ext === 'string' ? (JSON.parse(row.ext) as Record<string, unknown>) : (row.ext ?? {});
  return { result_code: row.result_code, ext };
}

export async function insertServerReplay(
  client: QueryClient,
  session: ScannerSessionRow,
  params: {
    operation: string;
    clientOpId: string;
    resultCode: string;
    ext: Record<string, unknown>;
    lpId?: string | null;
    woId?: string | null;
  },
): Promise<void> {
  if (params.operation.startsWith(CLIENT_TELEMETRY_OPERATION_PREFIX)) {
    throw new Error('server replay rows must not use client telemetry operation prefix');
  }
  await client.query(
    `insert into public.scanner_audit_log (
       org_id, session_id, user_id, device_id, operation, lp_id, wo_id,
       result_code, client_op_id, ext
     )
     values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6::uuid, $7::uuid,
             $8, $9, $10::jsonb)`,
    [
      session.org_id,
      session.id,
      session.user_id,
      session.device_id,
      params.operation,
      params.lpId ?? null,
      params.woId ?? null,
      params.resultCode,
      params.clientOpId,
      JSON.stringify(params.ext),
    ],
  );
}
