/**
 * SET — updateShiftPattern / deleteShiftPattern action unit tests (no DB).
 *
 * DEFECT-15: shifts had create only. These cover the new update + soft-delete
 * actions through a mocked withOrgContext: the permission gate (settings.org.update),
 * org scoping, not-found handling, and that delete soft-retires BOTH the
 * shift_patterns row and its paired shift_config (is_active = false).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

type QueryFn = ReturnType<typeof vi.fn>;

let queryImpl: QueryFn;

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: <T,>(fn: (ctx: unknown) => Promise<T>) =>
    fn({ userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', orgId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', client: { query: (sql: string, params?: unknown[]) => queryImpl(sql, params) } }),
}));

import { updateShiftPattern, deleteShiftPattern } from './shifts';

const VALID_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const baseUpdateInput = {
  id: VALID_ID,
  name: 'Morning',
  start_time: '06:00',
  end_time: '14:00',
  days_of_week: ['mon', 'tue'] as const,
  site_id: null,
  line_id: null,
};

/** Permission probe is the query that selects `true as ok`. */
function permissionGranted(sql: string): boolean {
  return /select true as ok/i.test(sql);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('updateShiftPattern', () => {
  it('rejects invalid input before any query', async () => {
    queryImpl = vi.fn();
    const result = await updateShiftPattern({ id: 'not-a-uuid', name: '' });
    expect(result).toEqual({ ok: false, error: 'invalid_input' });
    expect(queryImpl).not.toHaveBeenCalled();
  });

  it('returns forbidden without the settings.org.update permission', async () => {
    queryImpl = vi.fn(async (sql: string) =>
      permissionGranted(sql) ? { rows: [] } : { rows: [] },
    );
    const result = await updateShiftPattern(baseUpdateInput);
    expect(result).toEqual({ ok: false, error: 'forbidden' });
  });

  it('returns not_found when the pattern does not exist in the org', async () => {
    queryImpl = vi.fn(async (sql: string) => {
      if (permissionGranted(sql)) return { rows: [{ ok: true }] };
      if (/from public\.shift_patterns/i.test(sql)) return { rows: [] }; // existing lookup
      return { rows: [] };
    });
    const result = await updateShiftPattern(baseUpdateInput);
    expect(result).toEqual({ ok: false, error: 'not_found' });
  });

  it('updates both shift_config and shift_pattern and returns the row', async () => {
    const calls: string[] = [];
    queryImpl = vi.fn(async (sql: string) => {
      calls.push(sql);
      if (permissionGranted(sql)) return { rows: [{ ok: true }] };
      if (/select shift_id/i.test(sql)) return { rows: [{ shift_id: 'shift-xyz' }] };
      if (/update public\.shift_configs/i.test(sql)) return { rows: [] };
      if (/update public\.shift_patterns/i.test(sql)) {
        return {
          rows: [{
            id: VALID_ID, name: 'Morning', start_time: '06:00:00', end_time: '14:00:00',
            days_of_week: ['mon', 'tue'], site_id: null, site_name: null, line_id: null, line_label: null,
            org_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          }],
        };
      }
      return { rows: [] };
    });
    const result = await updateShiftPattern(baseUpdateInput);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.id).toBe(VALID_ID);
    expect(calls.some((s) => /update public\.shift_configs/i.test(s))).toBe(true);
    expect(calls.some((s) => /update public\.shift_patterns/i.test(s))).toBe(true);
    expect(calls.some((s) => /production_line_id\s*=\s*\$4::uuid/i.test(s))).toBe(true);
  });
});

describe('deleteShiftPattern', () => {
  it('rejects invalid input before any query', async () => {
    queryImpl = vi.fn();
    const result = await deleteShiftPattern({ id: 'nope' });
    expect(result).toEqual({ ok: false, error: 'invalid_input' });
    expect(queryImpl).not.toHaveBeenCalled();
  });

  it('returns forbidden without permission', async () => {
    queryImpl = vi.fn(async () => ({ rows: [] }));
    const result = await deleteShiftPattern({ id: VALID_ID });
    expect(result).toEqual({ ok: false, error: 'forbidden' });
  });

  it('returns not_found when the active pattern is missing', async () => {
    queryImpl = vi.fn(async (sql: string) => {
      if (permissionGranted(sql)) return { rows: [{ ok: true }] };
      return { rows: [] }; // soft-delete update matched nothing
    });
    const result = await deleteShiftPattern({ id: VALID_ID });
    expect(result).toEqual({ ok: false, error: 'not_found' });
  });

  it('soft-retires the pattern AND its paired shift_config', async () => {
    const updates: string[] = [];
    queryImpl = vi.fn(async (sql: string) => {
      if (permissionGranted(sql)) return { rows: [{ ok: true }] };
      if (/update public\.shift_patterns/i.test(sql)) {
        updates.push('pattern');
        return { rows: [{ id: VALID_ID, shift_id: 'shift-xyz' }] };
      }
      if (/update public\.shift_configs/i.test(sql)) {
        updates.push('config');
        return { rows: [] };
      }
      return { rows: [] };
    });
    const result = await deleteShiftPattern({ id: VALID_ID });
    expect(result).toEqual({ ok: true, id: VALID_ID });
    expect(updates).toEqual(['pattern', 'config']);
  });
});
