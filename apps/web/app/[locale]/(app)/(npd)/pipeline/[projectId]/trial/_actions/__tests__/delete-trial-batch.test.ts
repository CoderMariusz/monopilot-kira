/**
 * 01-NPD TRIAL — deleteTrialBatch Server Action unit tests.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

type Handler = (sql: string, params?: readonly unknown[]) => { rows: unknown[] };
const ctx = {
  userId: '00000000-0000-4000-8000-0000000000aa',
  orgId: '00000000-0000-4000-8000-00000000000a',
  handler: (() => ({ rows: [] })) as Handler,
};

vi.mock('../../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: async (action: (c: unknown) => Promise<unknown>) =>
    action({
      userId: ctx.userId,
      orgId: ctx.orgId,
      sessionToken: 'test',
      client: {
        query: async (sql: string, params?: readonly unknown[]) => ctx.handler(sql, params),
      },
    }),
}));

import { deleteTrialBatch } from '../delete-trial-batch';
import { TRIAL_WRITE_PERMISSION } from '../errors';

const PROJECT = '00000000-0000-4000-8000-0000000000b1';
const TRIAL = '00000000-0000-4000-8000-0000000000d1';

beforeEach(() => {
  ctx.handler = () => ({ rows: [] });
});

describe('deleteTrialBatch', () => {
  it('rejects invalid input before any DB write', async () => {
    const spy = vi.fn(() => ({ rows: [] }));
    ctx.handler = spy as unknown as Handler;
    const r = await deleteTrialBatch({ id: 'nope', projectId: PROJECT });
    expect(r).toEqual(expect.objectContaining({ ok: false, error: 'invalid_input' }));
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns forbidden without npd.trial.write', async () => {
    ctx.handler = (sql) => {
      if (sql.includes('from public.user_roles')) return { rows: [] };
      return { rows: [] };
    };
    const r = await deleteTrialBatch({ id: TRIAL, projectId: PROJECT });
    expect(r).toEqual({ ok: false, error: 'forbidden' });
  });

  it('deletes a pending trial and writes an audit row', async () => {
    const calls: string[] = [];
    ctx.handler = (sql) => {
      calls.push(sql);
      if (sql.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      if (sql.includes('delete from public.trial_batches')) {
        return { rows: [{ id: TRIAL, trial_no: 'T-014', result: 'pending', deleted: true }] };
      }
      return { rows: [] };
    };
    const r = await deleteTrialBatch({ id: TRIAL, projectId: PROJECT });
    expect(r).toEqual({ ok: true, data: { id: TRIAL } });
    expect(calls.some((s) => s.includes('npd.trial_batch.deleted'))).toBe(true);
    expect(calls[0]).toContain('user_roles'); // perm first
  });

  it('rejects deleting a trial that already has a result (has_progressed)', async () => {
    ctx.handler = (sql) => {
      if (sql.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      if (sql.includes('delete from public.trial_batches')) {
        return { rows: [{ id: TRIAL, trial_no: 'T-012', result: 'pass', deleted: false }] };
      }
      return { rows: [] };
    };
    const r = await deleteTrialBatch({ id: TRIAL, projectId: PROJECT });
    expect(r).toEqual({ ok: false, error: 'has_progressed' });
  });

  it('uses BYTE-IDENTICAL npd.trial.write permission', async () => {
    let seenPerm: string | undefined;
    ctx.handler = (sql, params) => {
      if (sql.includes('from public.user_roles')) {
        seenPerm = params?.[2] as string;
        return { rows: [] };
      }
      return { rows: [] };
    };
    await deleteTrialBatch({ id: TRIAL, projectId: PROJECT });
    expect(seenPerm).toBe(TRIAL_WRITE_PERMISSION);
    expect(TRIAL_WRITE_PERMISSION).toBe('npd.trial.write');
  });
});
