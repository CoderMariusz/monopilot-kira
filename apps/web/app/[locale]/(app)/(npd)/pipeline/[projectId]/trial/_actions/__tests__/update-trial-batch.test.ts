import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../../../../lib/i18n/revalidate-localized', () => ({ revalidateLocalized: vi.fn() }));

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
      client: {
        query: async (sql: string, params?: readonly unknown[]) => ctx.handler(sql, params),
      },
    }),
}));

import { revalidateLocalized } from '../../../../../../../../../lib/i18n/revalidate-localized';
import { updateTrialBatch } from '../update-trial-batch';
import { TRIAL_WRITE_PERMISSION } from '../errors';

const PROJECT = '00000000-0000-4000-8000-0000000000b1';
const BATCH = '00000000-0000-4000-8000-0000000000d1';
const VALID = {
  id: BATCH,
  projectId: PROJECT,
  trialNo: 'T-012',
  trialDate: '2025-12-01',
  batchSizeKg: '500',
  yieldPct: '78',
  technologistUserId: '00000000-0000-4000-8000-0000000000c1',
  result: 'pass' as const,
  notes: 'ok',
};

function grantHandler(opts: {
  perm?: string;
  batchExists?: boolean;
  updateId?: string;
  throwOnUpdate?: { code?: string; constraint?: string };
}): Handler {
  return (sql) => {
    if (sql.includes('from public.user_roles')) {
      return { rows: opts.perm ? [{ ok: true }] : [] };
    }
    if (sql.includes('select trial_no') && sql.includes('from public.trial_batches')) {
      return {
        rows: opts.batchExists === false
          ? []
          : [{
              trial_no: 'T-011',
              trial_date: '2025-11-01',
              batch_size_kg: '400',
              yield_pct: '70',
              technologist_user_id: null,
              result: 'pending',
              notes: null,
            }],
      };
    }
    if (sql.includes('update public.trial_batches')) {
      if (opts.throwOnUpdate) {
        const err = new Error('dup') as Error & { code?: string; constraint?: string };
        err.code = opts.throwOnUpdate.code;
        err.constraint = opts.throwOnUpdate.constraint;
        throw err;
      }
      return { rows: [{ id: opts.updateId ?? BATCH }] };
    }
    if (sql.includes('insert into public.audit_log')) return { rows: [] };
    return { rows: [] };
  };
}

beforeEach(() => {
  ctx.handler = () => ({ rows: [] });
  vi.mocked(revalidateLocalized).mockClear();
});

describe('updateTrialBatch', () => {
  it('rejects invalid input before DB work', async () => {
    const result = await updateTrialBatch({ id: 'bad', projectId: PROJECT, trialNo: '' });
    expect(result).toEqual(expect.objectContaining({ ok: false, error: 'invalid_input' }));
  });

  it('rejects out-of-range yieldPct', async () => {
    const result = await updateTrialBatch({ ...VALID, yieldPct: '150' });
    expect(result).toEqual(expect.objectContaining({ ok: false, error: 'invalid_input' }));
  });

  it('returns forbidden without npd.trial.write', async () => {
    ctx.handler = grantHandler({ perm: undefined });
    const result = await updateTrialBatch(VALID);
    expect(result).toEqual({ ok: false, error: 'forbidden' });
  });

  it('returns not_found when the batch is outside the current org/project', async () => {
    ctx.handler = grantHandler({ perm: TRIAL_WRITE_PERMISSION, batchExists: false });
    const result = await updateTrialBatch(VALID);
    expect(result).toEqual({ ok: false, error: 'not_found' });
  });

  it('surfaces duplicate trial_no as duplicate_trial_no', async () => {
    ctx.handler = grantHandler({
      perm: TRIAL_WRITE_PERMISSION,
      throwOnUpdate: { code: '23505', constraint: 'trial_batches_org_project_trial_no_unique' },
    });
    const result = await updateTrialBatch(VALID);
    expect(result).toEqual({ ok: false, error: 'duplicate_trial_no' });
  });

  it('updates, writes audit_log, revalidates, and returns the documented shape', async () => {
    const calls: string[] = [];
    ctx.handler = (sql, params) => {
      calls.push(sql);
      return grantHandler({ perm: TRIAL_WRITE_PERMISSION, updateId: BATCH })(sql, params);
    };

    const result = await updateTrialBatch(VALID);

    expect(result).toEqual({ ok: true, data: { id: BATCH, trialNo: 'T-012', result: 'pass' } });
    expect(calls.some((sql) => /update public\.trial_batches/.test(sql))).toBe(true);
    expect(calls.some((sql) => /insert into public\.audit_log/.test(sql))).toBe(true);
    expect(vi.mocked(revalidateLocalized)).toHaveBeenCalledWith(`/pipeline/${PROJECT}/trial`);
  });

  it('clears trial notes when null is explicitly present', async () => {
    const calls: Array<{ sql: string; params?: readonly unknown[] }> = [];
    ctx.handler = (sql, params) => {
      calls.push({ sql, params });
      return grantHandler({ perm: TRIAL_WRITE_PERMISSION, updateId: BATCH })(sql, params);
    };

    const result = await updateTrialBatch({ ...VALID, notes: null });

    expect(result).toEqual({ ok: true, data: { id: BATCH, trialNo: 'T-012', result: 'pass' } });
    const updateCall = calls.find(({ sql }) => /update public\.trial_batches/.test(sql));
    expect(updateCall?.sql).toContain("notes                = case when $11::boolean then nullif($9, '') else notes end");
    expect(updateCall?.params?.[8]).toBeNull();
    expect(updateCall?.params?.[10]).toBe(true);
  });

  it('keeps trial notes when notes is omitted', async () => {
    const calls: Array<{ sql: string; params?: readonly unknown[] }> = [];
    const { notes: _notes, ...withoutNotes } = VALID;
    ctx.handler = (sql, params) => {
      calls.push({ sql, params });
      return grantHandler({ perm: TRIAL_WRITE_PERMISSION, updateId: BATCH })(sql, params);
    };

    const result = await updateTrialBatch(withoutNotes);

    expect(result).toEqual({ ok: true, data: { id: BATCH, trialNo: 'T-012', result: 'pass' } });
    const updateCall = calls.find(({ sql }) => /update public\.trial_batches/.test(sql));
    expect(updateCall?.params?.[8]).toBeNull();
    expect(updateCall?.params?.[10]).toBe(false);
  });
});
