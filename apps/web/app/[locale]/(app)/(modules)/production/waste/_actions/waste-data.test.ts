/**
 * Wave R2 (F3) — waste read-layer storno semantics.
 *
 * Sums stay SIGNED/NET (negative counter-entries cancel voided waste, mig 293),
 * while event COUNTS exclude correction rows (correction_of_id IS NULL filter)
 * and the events journal exposes correction_of_id so the UI renders counter
 * rows distinctly.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getWasteScreen } from './waste-data';

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(
    async (action: (ctx: { userId: string; orgId: string; client: unknown }) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

let queries: string[];
let client: { query: ReturnType<typeof vi.fn> };

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

beforeEach(() => {
  queries = [];
  client = {
    query: vi.fn(async (sql: string) => {
      queries.push(sql);
      const n = normalize(sql);
      if (n.includes('from public.user_roles')) {
        return { rows: [{ ok: true }], rowCount: 1 };
      }
      if (n.includes('as total_kg')) {
        return { rows: [{ total_kg: '7.5', event_count: 2, line_count: 1 }], rowCount: 1 };
      }
      if (n.includes('group by wc.name')) {
        return { rows: [{ category_name: 'Trim', qty_kg: '7.5', events: 2 }], rowCount: 1 };
      }
      if (n.includes('group by w.production_line_id')) {
        return { rows: [], rowCount: 0 };
      }
      if (n.includes('order by wl.recorded_at desc')) {
        return {
          rows: [
            {
              id: 'corr-1',
              correction_of_id: 'orig-1',
              recorded_at: '2026-06-12T09:05:00.000Z',
              line_id: null,
              wo_number: 'WO-1',
              category_name: 'Trim',
              qty_kg: '-4.5',
              operator_name: 'A. Nowak',
              reason_notes: null,
              reason_code: 'entry_error',
            },
            {
              id: 'orig-1',
              correction_of_id: null,
              recorded_at: '2026-06-12T09:00:00.000Z',
              line_id: null,
              wo_number: 'WO-1',
              category_name: 'Trim',
              qty_kg: '4.5',
              operator_name: 'A. Nowak',
              reason_notes: 'duplicate scan',
              reason_code: null,
            },
          ],
          rowCount: 2,
        };
      }
      throw new Error(`unexpected query: ${n}`);
    }),
  };
});

describe('getWasteScreen (Wave R2 storno semantics)', () => {
  it('keeps SUMS signed/net but filters correction rows out of event COUNTS', async () => {
    const result = await getWasteScreen();
    expect(result.ok).toBe(true);

    const kpi = queries.map(normalize).find((q) => q.includes('as total_kg'));
    expect(kpi).toBeDefined();
    // Net total: plain signed sum — NOT filtered.
    expect(kpi).toContain('coalesce(sum(wl.qty_kg), 0) as total_kg');
    // Event count excludes counter-entries.
    expect(kpi).toContain('count(*) filter (where wl.correction_of_id is null)::int as event_count');

    const pareto = queries.map(normalize).find((q) => q.includes('as category_name'));
    expect(pareto).toContain('count(*) filter (where wl.correction_of_id is null)::int as events');

    const byLine = queries.map(normalize).find((q) => q.includes('as line_id'));
    expect(byLine).toContain('count(*) filter (where wl.correction_of_id is null)::int as events');
  });

  it('journal SELECTs correction_of_id and maps it onto the event rows', async () => {
    const result = await getWasteScreen();
    if (!result.ok) throw new Error('expected ok');

    const journal = queries.map(normalize).find((q) => q.includes('wl.recorded_at'));
    expect(journal).toContain('wl.correction_of_id::text as correction_of_id');

    const corr = result.data.events.find((e) => e.id === 'corr-1');
    const orig = result.data.events.find((e) => e.id === 'orig-1');
    expect(corr?.correctionOfId).toBe('orig-1');
    expect(corr?.qtyKg).toBe(-4.5);
    expect(orig?.correctionOfId).toBeNull();
  });
});
