/**
 * 01-NPD TRIAL stage — Server Action tests (logTrialBatch / updateTrialBatch /
 * listTrialBatches).
 *
 * These run WITHOUT a live Postgres: `withOrgContext` is mocked to invoke the
 * action body against a programmable fake client, so we can prove the closed
 * contract for real in vitest:
 *   - zod validation (invalid_input)
 *   - RBAC (forbidden) using the EXACT perm strings npd.trial.read /
 *     npd.trial.write
 *   - the unique (org_id, project_id, trial_no) constraint (DB 23505) surfaced
 *     as the friendly `duplicate_trial_no` error
 *   - success path returns the documented discriminated-union shape
 *
 * `next/cache` revalidatePath is stubbed (no Next runtime in the unit test).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// Programmable fake client + mocked withOrgContext. Each test sets `handler`.
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

import { logTrialBatch } from '../log-trial-batch';
import { updateTrialBatch } from '../update-trial-batch';
import { listTrialBatches } from '../list-trial-batches';
import { TRIAL_READ_PERMISSION, TRIAL_WRITE_PERMISSION } from '../errors';

const PROJECT = '00000000-0000-4000-8000-0000000000b1';
const VALID = {
  projectId: PROJECT,
  trialNo: 'T-012',
  trialDate: '2025-12-01',
  batchSizeKg: '500',
  yieldPct: '78',
  technologistUserId: '00000000-0000-4000-8000-0000000000c1',
  result: 'pass' as const,
  notes: 'ok',
};

/** Build a query handler that grants the given permission + project + insert. */
function grantHandler(opts: {
  perm?: string;
  projectExists?: boolean;
  insertId?: string;
  throwOnInsert?: { code?: string; constraint?: string };
}): Handler {
  return (sql) => {
    if (sql.includes('from public.user_roles')) {
      return { rows: opts.perm ? [{ ok: true }] : [] };
    }
    if (sql.includes('from public.npd_projects')) {
      return { rows: opts.projectExists === false ? [] : [{ id: PROJECT }] };
    }
    if (sql.includes('insert into public.trial_batches')) {
      if (opts.throwOnInsert) {
        const err = new Error('dup') as Error & { code?: string; constraint?: string };
        err.code = opts.throwOnInsert.code;
        err.constraint = opts.throwOnInsert.constraint;
        throw err;
      }
      return { rows: [{ id: opts.insertId ?? 'tb-1' }] };
    }
    if (sql.includes('insert into public.audit_log')) return { rows: [] };
    if (sql.includes('update public.trial_batches')) return { rows: [{ id: opts.insertId ?? 'tb-1' }] };
    if (sql.includes('select trial_no') && sql.includes('from public.trial_batches')) {
      return {
        rows: opts.projectExists === false
          ? []
          : [{
              trial_no: 'T-012',
              trial_date: '2025-12-01',
              batch_size_kg: '500',
              yield_pct: '78',
              technologist_user_id: null,
              result: 'pending',
              notes: null,
            }],
      };
    }
    if (sql.includes('from public.trial_batches')) return { rows: [] };
    return { rows: [] };
  };
}

beforeEach(() => {
  ctx.handler = () => ({ rows: [] });
});

describe('exact permission strings', () => {
  it('uses BYTE-IDENTICAL seeded perm strings', () => {
    expect(TRIAL_READ_PERMISSION).toBe('npd.trial.read');
    expect(TRIAL_WRITE_PERMISSION).toBe('npd.trial.write');
  });
});

describe('logTrialBatch — validation + RBAC + duplicate', () => {
  it('rejects invalid input before any DB write', async () => {
    const r = await logTrialBatch({ projectId: 'not-a-uuid', trialNo: '' });
    expect(r).toEqual(expect.objectContaining({ ok: false, error: 'invalid_input' }));
  });

  it('rejects out-of-range yieldPct (>100)', async () => {
    const r = await logTrialBatch({ ...VALID, yieldPct: '150' });
    expect(r).toEqual(expect.objectContaining({ ok: false, error: 'invalid_input' }));
  });

  it('returns forbidden when the caller lacks npd.trial.write', async () => {
    ctx.handler = grantHandler({ perm: undefined });
    const r = await logTrialBatch(VALID);
    expect(r).toEqual({ ok: false, error: 'forbidden' });
  });

  it('returns not_found when the project does not exist in the org', async () => {
    ctx.handler = grantHandler({ perm: TRIAL_WRITE_PERMISSION, projectExists: false });
    const r = await logTrialBatch(VALID);
    expect(r).toEqual({ ok: false, error: 'not_found' });
  });

  it('surfaces the unique trial_no constraint as duplicate_trial_no (23505)', async () => {
    ctx.handler = grantHandler({
      perm: TRIAL_WRITE_PERMISSION,
      throwOnInsert: { code: '23505', constraint: 'trial_batches_org_project_trial_no_unique' },
    });
    const r = await logTrialBatch(VALID);
    expect(r).toEqual({ ok: false, error: 'duplicate_trial_no' });
  });

  it('succeeds with the documented shape', async () => {
    ctx.handler = grantHandler({ perm: TRIAL_WRITE_PERMISSION, insertId: 'tb-42' });
    const r = await logTrialBatch(VALID);
    expect(r).toEqual({ ok: true, data: { id: 'tb-42', trialNo: 'T-012', result: 'pass' } });
  });

  it('returns persistence_failed without writing audit when insert returns no id (rollback path)', async () => {
    let auditWrites = 0;
    ctx.handler = (sql) => {
      if (sql.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      if (sql.includes('from public.npd_projects')) return { rows: [{ id: PROJECT }] };
      if (sql.includes('insert into public.trial_batches')) return { rows: [] };
      if (sql.includes('insert into public.audit_log')) {
        auditWrites += 1;
        return { rows: [] };
      }
      return { rows: [] };
    };
    const r = await logTrialBatch(VALID);
    expect(r).toEqual({ ok: false, error: 'persistence_failed' });
    expect(auditWrites).toBe(0);
  });
});

describe('updateTrialBatch — RBAC + not_found + success', () => {
  const U = { ...VALID, id: '00000000-0000-4000-8000-0000000000d1' };

  it('forbidden without write perm', async () => {
    ctx.handler = grantHandler({ perm: undefined });
    const r = await updateTrialBatch(U);
    expect(r).toEqual({ ok: false, error: 'forbidden' });
  });

  it('not_found when the row is not in the org', async () => {
    ctx.handler = grantHandler({ perm: TRIAL_WRITE_PERMISSION, projectExists: false });
    const r = await updateTrialBatch(U);
    expect(r).toEqual({ ok: false, error: 'not_found' });
  });

  it('succeeds and returns the documented shape', async () => {
    ctx.handler = grantHandler({ perm: TRIAL_WRITE_PERMISSION, insertId: 'tb-7' });
    const r = await updateTrialBatch(U);
    expect(r).toEqual({ ok: true, data: { id: 'tb-7', trialNo: 'T-012', result: 'pass' } });
  });
});

describe('listTrialBatches — RBAC + read', () => {
  it('forbidden without npd.trial.read', async () => {
    ctx.handler = grantHandler({ perm: undefined });
    const r = await listTrialBatches({ projectId: PROJECT });
    expect(r).toEqual({ ok: false, error: 'forbidden' });
  });

  it('not_found for a malformed projectId', async () => {
    const r = await listTrialBatches({ projectId: 'nope' });
    expect(r).toEqual(expect.objectContaining({ ok: false, error: 'not_found' }));
  });

  it('returns an empty batch list for a valid empty project', async () => {
    ctx.handler = grantHandler({ perm: TRIAL_READ_PERMISSION });
    const r = await listTrialBatches({ projectId: PROJECT });
    expect(r).toEqual({ ok: true, data: { batches: [] } });
  });
});
