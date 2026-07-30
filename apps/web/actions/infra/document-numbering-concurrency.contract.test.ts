import { describe, expect, it } from 'vitest';

import {
  nextDocumentNumber,
  type QueryClient,
} from '../../lib/documents/numbering';

class AtomicNumberingClient implements QueryClient {
  private nextSequence: number;

  constructor(nextSequence = 41, private readonly settingsExist = true) {
    this.nextSequence = nextSequence;
  }

  async query<T = Record<string, unknown>>(
    sql: string,
  ): Promise<{ rows: T[]; rowCount: number }> {
    const text = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (text.startsWith('update public.org_document_settings')) {
      if (!this.settingsExist) return { rows: [], rowCount: 0 };
      if (!text.includes('set next_seq = next_seq + 1')) {
        throw new Error('document number allocation must be one atomic UPDATE');
      }
      const oldSequence = this.nextSequence;
      this.nextSequence += 1;
      await Promise.resolve();
      return {
        rows: [{
          old_seq: oldSequence,
          number_prefix: 'WO',
          number_date_part: 'YYYYMMDD',
          number_seq_padding: 4,
        }] as T[],
        rowCount: 1,
      };
    }
    if (text.startsWith('insert into public.org_document_settings')) {
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`unexpected query: ${text}`);
  }
}

describe('XC-035 document numbering concurrency contract', () => {
  it('returns two distinct consecutive masked numbers for parallel allocations', async () => {
    const client = new AtomicNumberingClient();
    const now = new Date('2026-07-30T12:00:00.000Z');

    const numbers = await Promise.all([
      nextDocumentNumber(client, '11111111-1111-4111-8111-111111111111', 'wo', now),
      nextDocumentNumber(client, '11111111-1111-4111-8111-111111111111', 'wo', now),
    ]);

    expect(numbers).toEqual(['WO-20260730-0041', 'WO-20260730-0042']);
    expect(new Set(numbers).size).toBe(2);
  });

  it('fails instead of fabricating a number when settings cannot be loaded or created', async () => {
    const client = new AtomicNumberingClient(1, false);

    await expect(
      nextDocumentNumber(
        client,
        '11111111-1111-4111-8111-111111111111',
        'po',
        new Date('2026-07-30T12:00:00.000Z'),
      ),
    ).rejects.toThrow('document_number_settings_missing:po');
  });
});
