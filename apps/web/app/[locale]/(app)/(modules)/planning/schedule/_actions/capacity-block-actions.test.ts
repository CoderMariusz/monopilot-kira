/**
 * Booking a trial onto a production line must refuse a VOIDED trial, and must
 * take a row lock so it serializes against a concurrent void (PF-R04-12 review).
 * Hiding the button is not the guard — a Server Action can be called directly.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: vi.fn(),
}));

type Handler = (sql: string, params?: readonly unknown[]) => { rows: unknown[] };

const ctx = {
  userId: '00000000-0000-4000-8000-0000000000aa',
  orgId: '00000000-0000-4000-8000-00000000000a',
  handler: (() => ({ rows: [] })) as Handler,
};

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: async (action: (c: unknown) => Promise<unknown>) =>
    action({
      userId: ctx.userId,
      orgId: ctx.orgId,
      client: {
        query: async (sql: string, params?: readonly unknown[]) => ctx.handler(sql, params),
      },
    }),
}));

import { upsertCapacityBlock } from './capacity-block-actions';

const TRIAL = '00000000-0000-4000-8000-0000000000d1';
const LINE = '00000000-0000-4000-8000-0000000000e1';
const VALID = {
  trialId: TRIAL,
  lineId: LINE,
  blockDate: '2026-08-01',
  startTime: '09:00',
  endTime: '12:00',
};

function handler(opts: { voidedAt?: string | null }): Handler {
  return (sql) => {
    if (sql.includes('from public.user_roles')) return { rows: [{ ok: true }] };
    if (sql.includes('from public.production_lines')) return { rows: [{ id: LINE }] };
    if (sql.includes('from public.trial_batches')) {
      return {
        rows: [
          {
            trial_id: TRIAL,
            trial_no: 'T-012',
            project_id: '00000000-0000-4000-8000-0000000000b1',
            project_code: 'NPD-001',
            voided_at: opts.voidedAt ?? null,
          },
        ],
      };
    }
    if (sql.includes('insert into public.planning_capacity_blocks')) {
      return { rows: [{ id: 'block-1' }] };
    }
    return { rows: [] };
  };
}

beforeEach(() => {
  ctx.handler = () => ({ rows: [] });
});

describe('upsertCapacityBlock — voided trials', () => {
  it('books a live trial', async () => {
    ctx.handler = handler({});
    expect(await upsertCapacityBlock(VALID)).toEqual({ ok: true, id: 'block-1' });
  });

  it('refuses to reserve line time for a voided trial', async () => {
    const calls: string[] = [];
    ctx.handler = (sql, params) => {
      calls.push(sql);
      return handler({ voidedAt: '2026-07-20T10:00:00Z' })(sql, params);
    };

    expect(await upsertCapacityBlock(VALID)).toEqual({ ok: false, error: 'voided' });
    expect(calls.some((sql) => /insert into public\.planning_capacity_blocks/.test(sql))).toBe(
      false,
    );
  });

  it('locks the trial row so book-vs-void cannot interleave', async () => {
    const calls: string[] = [];
    ctx.handler = (sql, params) => {
      calls.push(sql);
      return handler({})(sql, params);
    };

    await upsertCapacityBlock(VALID);

    const trialRead = calls.find((sql) => sql.includes('from public.trial_batches'));
    expect(trialRead).toContain('for update of tb');
  });
});
