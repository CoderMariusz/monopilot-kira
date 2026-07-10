import { describe, expect, it } from 'vitest';

import { recallFactorySpecInTransaction } from '../recall-factory-spec-core';

const SPEC_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

type ReleaseStatusRow = {
  release_status: string;
  active_factory_spec_id: string;
  factory_available_at: string | null;
  factory_approved_by: string | null;
  release_event_id: number | null;
};

function norm(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

describe('recallFactorySpecInTransaction wave-12 integrity', () => {
  it('downgrades factory_release_status to pending_technical_approval and clears approval evidence', async () => {
    const releaseRow: ReleaseStatusRow = {
      release_status: 'released_to_factory',
      active_factory_spec_id: SPEC_ID,
      factory_available_at: '2026-07-01T10:00:00.000Z',
      factory_approved_by: USER_ID,
      release_event_id: 42,
    };

    const client = {
      async query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]) {
        const n = norm(sql);
        if (n.includes('from public.factory_specs') && n.includes('for update')) {
          return {
            rows: [
              {
                id: SPEC_ID,
                spec_code: 'FS-1',
                version: 1,
                status: 'released_to_factory',
                approved_by: USER_ID,
                approved_at: '2026-07-01T09:00:00.000Z',
                released_by: USER_ID,
                released_at: '2026-07-01T10:00:00.000Z',
              },
            ] as T[],
          };
        }
        if (n.includes('from public.work_orders')) return { rows: [] as T[] };
        if (n.startsWith('update public.factory_specs') && n.includes("set status = 'draft'")) {
          return { rows: [{ id: SPEC_ID }] as T[] };
        }
        if (n.startsWith('update public.factory_release_status')) {
          expect(n).toContain("release_status = 'pending_technical_approval'");
          expect(n).toContain('factory_available_at = null');
          expect(n).toContain('factory_approved_by = null');
          expect(n).toContain('release_event_id = null');
          expect(params?.[0]).toBe(SPEC_ID);
          releaseRow.release_status = 'pending_technical_approval';
          releaseRow.factory_available_at = null;
          releaseRow.factory_approved_by = null;
          releaseRow.release_event_id = null;
          return { rows: [] as T[] };
        }
        if (n.startsWith('insert into public.audit_events')) return { rows: [] as T[] };
        throw new Error(`Unhandled SQL: ${n}`);
      },
    };

    const result = await recallFactorySpecInTransaction({ userId: USER_ID, client }, { specId: SPEC_ID });
    expect(result).toEqual({ ok: true, recalled: true });
    expect(releaseRow.release_status).toBe('pending_technical_approval');
    expect(releaseRow.factory_available_at).toBeNull();
    expect(releaseRow.factory_approved_by).toBeNull();
    expect(releaseRow.release_event_id).toBeNull();
    expect(releaseRow.active_factory_spec_id).toBe(SPEC_ID);
  });
});
