import { toClientTelemetryOperation } from './replay';

import type { QueryClient } from './db';
import type { ScannerSessionRow } from './session';

export type ScannerAuditEntry = {
  operation: string;
  barcodeRaw?: string | null;
  lpId?: string | null;
  woId?: string | null;
  scanMethod?: string | null;
  resultCode?: string | null;
  clientOpId?: string | null;
  ext?: Record<string, unknown> | null;
};

export async function writeScannerAudit(
  client: QueryClient,
  input: {
    orgId: string;
    sessionId?: string | null;
    userId?: string | null;
    deviceId?: string | null;
    operation: string;
    resultCode?: string | null;
    ext?: Record<string, unknown> | null;
  },
): Promise<void> {
  await client.query(
    `insert into public.scanner_audit_log (
       org_id,
       session_id,
       user_id,
       device_id,
       operation,
       result_code,
       ext
     )
     values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7::jsonb)`,
    [
      input.orgId,
      input.sessionId ?? null,
      input.userId ?? null,
      input.deviceId ?? null,
      input.operation,
      input.resultCode ?? null,
      JSON.stringify(input.ext ?? {}),
    ],
  );
}

export async function writeScannerSessionAudit(
  client: QueryClient,
  session: ScannerSessionRow,
  operation: string,
  resultCode: string,
  ext?: Record<string, unknown>,
): Promise<void> {
  await writeScannerAudit(client, {
    orgId: session.org_id,
    sessionId: session.id,
    userId: session.user_id,
    deviceId: session.device_id,
    operation,
    resultCode,
    ext,
  });
}

export async function bulkInsertScannerAudit(
  client: QueryClient,
  session: ScannerSessionRow,
  entries: ScannerAuditEntry[],
): Promise<number> {
  if (entries.length === 0) return 0;

  // Dedupe repeated clientOpIds WITHIN the batch — ON CONFLICT DO NOTHING
  // only dedupes against existing rows; two identical conflict keys in one
  // INSERT raise "cannot affect row a second time" and 500 the whole batch.
  const seenOpIds = new Set<string>();
  const deduped = entries.filter((entry) => {
    if (!entry.clientOpId) return true;
    if (seenOpIds.has(entry.clientOpId)) return false;
    seenOpIds.add(entry.clientOpId);
    return true;
  });

  const values: unknown[] = [];
  const placeholders = deduped.map((entry, index) => {
    const base = index * 12;
    values.push(
      session.org_id,
      session.id,
      session.user_id,
      session.device_id,
      toClientTelemetryOperation(entry.operation),
      entry.barcodeRaw ?? null,
      entry.lpId ?? null,
      entry.woId ?? null,
      entry.scanMethod ?? null,
      entry.resultCode ?? null,
      // Client telemetry must never occupy server replay keys.
      null,
      JSON.stringify(entry.ext ?? {}),
    );
    return `($${base + 1}::uuid, $${base + 2}::uuid, $${base + 3}::uuid, $${base + 4}::uuid, $${base + 5}, $${base + 6}, $${base + 7}::uuid, $${base + 8}::uuid, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}::jsonb)`;
  });

  const result = await client.query(
    `insert into public.scanner_audit_log (
       org_id,
       session_id,
       user_id,
       device_id,
       operation,
       barcode_raw,
       lp_id,
       wo_id,
       scan_method,
       result_code,
       client_op_id,
       ext
     )
     values ${placeholders.join(', ')}`,
    values,
  );
  return result.rowCount ?? 0;
}
