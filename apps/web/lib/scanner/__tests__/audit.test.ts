import { describe, expect, it, vi } from 'vitest';

import { bulkInsertScannerAudit, type ScannerAuditEntry } from '../audit';
import type { ScannerSessionRow } from '../session';

const SESSION = {
  id: 'sess-1',
  org_id: 'org-1',
  user_id: 'user-1',
  device_id: null,
} as unknown as ScannerSessionRow;

function mockClient() {
  const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 });
  return { client: { query }, query };
}

describe('bulkInsertScannerAudit', () => {
  it('dedupes repeated clientOpIds WITHIN one batch (Postgres would raise "cannot affect row a second time")', async () => {
    const { client, query } = mockClient();
    const entries: ScannerAuditEntry[] = [
      { operation: 'scanner.consume', clientOpId: 'op-1' },
      { operation: 'scanner.consume', clientOpId: 'op-1' }, // same-batch duplicate
      { operation: 'scanner.output', clientOpId: 'op-2' },
    ];

    await bulkInsertScannerAudit(client, SESSION, entries);

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, values] = query.mock.calls[0] as [string, unknown[]];
    // 12 params per row — only 2 rows survive the in-batch dedupe.
    expect(values).toHaveLength(24);
    // No ON CONFLICT clause: client telemetry always sets client_op_id=null so
    // there is nothing to conflict on; the in-batch deduplication above handles
    // same-batch duplicate clientOpIds before the query runs.
    expect(sql).not.toContain('on conflict');
    expect(values.filter((v) => v === 'op-1')).toHaveLength(0);
    expect(values.filter((v) => v === 'client.scanner.consume')).toHaveLength(1);
    expect(values.filter((v) => v === 'client.scanner.output')).toHaveLength(1);
  });

  it('keeps multiple entries with NO clientOpId (null never conflicts)', async () => {
    const { client, query } = mockClient();
    const entries: ScannerAuditEntry[] = [
      { operation: 'scanner.scan' },
      { operation: 'scanner.scan' },
    ];

    await bulkInsertScannerAudit(client, SESSION, entries);

    const [, values] = query.mock.calls[0] as [string, unknown[]];
    expect(values).toHaveLength(24);
  });

  it('returns 0 without querying for an empty batch', async () => {
    const { client, query } = mockClient();
    expect(await bulkInsertScannerAudit(client, SESSION, [])).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });
});
