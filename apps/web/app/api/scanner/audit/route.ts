import { NextRequest } from 'next/server';

import { bulkInsertScannerAudit, writeScannerSessionAudit } from '../../../../lib/scanner/audit';
import { requireScannerSession } from '../../../../lib/scanner/guard';
import { isRecord, jsonError, jsonOk, readJson } from '../../../../lib/scanner/route-utils';

import type { ScannerAuditEntry } from '../../../../lib/scanner/audit';

function parseEntry(entry: unknown): ScannerAuditEntry | null {
  if (!isRecord(entry)) return null;
  if (typeof entry.operation !== 'string' || !entry.operation.trim()) return null;

  return {
    operation: entry.operation.trim(),
    barcodeRaw: typeof entry.barcodeRaw === 'string' ? entry.barcodeRaw : null,
    lpId: typeof entry.lpId === 'string' ? entry.lpId : null,
    woId: typeof entry.woId === 'string' ? entry.woId : null,
    scanMethod: typeof entry.scanMethod === 'string' ? entry.scanMethod : null,
    resultCode: typeof entry.resultCode === 'string' ? entry.resultCode : null,
    clientOpId: typeof entry.clientOpId === 'string' ? entry.clientOpId : null,
    ext: isRecord(entry.ext) ? entry.ext : {},
  };
}

function isScannerAuditEntry(entry: ScannerAuditEntry | null): entry is ScannerAuditEntry {
  return entry !== null;
}

export async function POST(request: NextRequest) {
  const body = await readJson(request);
  if (!isRecord(body)) return jsonError('invalid_json', 400);
  if (!Array.isArray(body.entries)) return jsonError('missing_entries', 400);
  if (body.entries.length > 50) return jsonError('too_many_entries', 413);

  const entries = body.entries.map(parseEntry);
  if (!entries.every(isScannerAuditEntry)) return jsonError('invalid_entry', 400);

  const result = await requireScannerSession(request, body, 'scanner.audit', async ({ client, session }) => {
    const inserted = await bulkInsertScannerAudit(client, session, entries);
    await writeScannerSessionAudit(client, session, 'scanner.audit', 'ok', { requested: entries.length, inserted });
    return jsonOk({ inserted });
  });

  if ('guardError' in result) return jsonError(result.error, result.status);
  return result;
}
