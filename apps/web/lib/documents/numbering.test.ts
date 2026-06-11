import { describe, expect, it, vi } from 'vitest';

import { nextDocumentNumber, type QueryClient } from './numbering';

describe('nextDocumentNumber', () => {
  it('formats prefix, date part, and padded old sequence from the increment row', async () => {
    const client: QueryClient = {
      query: vi.fn(async () => ({
        rows: [{ old_seq: '7', number_prefix: 'PO', number_date_part: 'YYYYMM', number_seq_padding: 4 }],
      })),
    };

    await expect(nextDocumentNumber(client, '11111111-1111-4111-8111-111111111111', 'po', new Date('2026-06-11T12:00:00Z'))).resolves.toBe(
      'PO-202606-0007',
    );
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('set next_seq = next_seq + 1'), [
      '11111111-1111-4111-8111-111111111111',
      'po',
    ]);
  });

  it('omits the date part when configured as none', async () => {
    const client: QueryClient = {
      query: vi.fn(async () => ({
        rows: [{ old_seq: 12, number_prefix: 'WO', number_date_part: 'none', number_seq_padding: 5 }],
      })),
    };

    await expect(nextDocumentNumber(client, '11111111-1111-4111-8111-111111111111', 'wo', new Date('2026-06-11T12:00:00Z'))).resolves.toBe(
      'WO-00012',
    );
  });

  it('inserts legacy defaults and retries once when the settings row is missing', async () => {
    const client: QueryClient = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{ old_seq: '1', number_prefix: 'TO', number_date_part: 'YYYYMMDD', number_seq_padding: 3 }],
        }),
    };

    await expect(nextDocumentNumber(client, '11111111-1111-4111-8111-111111111111', 'to', new Date('2026-06-11T12:00:00Z'))).resolves.toBe(
      'TO-20260611-001',
    );
    expect(vi.mocked(client.query).mock.calls[1]?.[0]).toContain('on conflict (org_id, doc_type) do nothing');
  });
});
