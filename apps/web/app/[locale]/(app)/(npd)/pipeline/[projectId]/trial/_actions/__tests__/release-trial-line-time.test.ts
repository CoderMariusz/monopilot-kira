import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../../../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: vi.fn(),
}));

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
import { releaseTrialLineTime } from '../release-trial-line-time';

const PROJECT = '00000000-0000-4000-8000-0000000000b1';
const TRIAL = '00000000-0000-4000-8000-0000000000d1';
const VALID = {
  trialId: TRIAL,
  projectId: PROJECT,
  reasonCode: 'entry_error' as const,
  note: null,
};

function handler(opts: { granted?: boolean; trialExists?: boolean; booked?: boolean }): Handler {
  return (sql) => {
    if (sql.includes('from public.user_roles')) {
      return { rows: [{ ok: opts.granted !== false }] };
    }
    if (sql.includes('from public.trial_batches')) {
      return { rows: opts.trialExists === false ? [] : [{ id: TRIAL }] };
    }
    if (sql.includes('delete from public.planning_capacity_blocks')) {
      return {
        rows:
          opts.booked === false
            ? []
            : [
                {
                  id: 'block-1',
                  line_id: 'line-1',
                  line_code: 'L1',
                  line_name: 'Slicing line 1',
                  project_id: PROJECT,
                  trial_id: TRIAL,
                  label: 'NPD-001 trial T-012',
                  block_date: '2026-08-01',
                  start_time: '09:00:00',
                  end_time: '12:00:00',
                  block_type: 'npd_trial',
                },
              ],
      };
    }
    if (sql.includes('insert into public.audit_events')) return { rows: [] };
    return { rows: [] };
  };
}

beforeEach(() => {
  ctx.handler = () => ({ rows: [] });
  vi.mocked(revalidateLocalized).mockClear();
});

describe('releaseTrialLineTime', () => {
  it('requires a reason code', async () => {
    const result = await releaseTrialLineTime({ trialId: TRIAL, projectId: PROJECT });
    expect(result).toEqual(expect.objectContaining({ ok: false, error: 'invalid_input' }));
  });

  it('returns forbidden without npd.planning.write', async () => {
    ctx.handler = handler({ granted: false });
    expect(await releaseTrialLineTime(VALID)).toEqual({ ok: false, error: 'forbidden' });
  });

  it('returns not_found when the trial is outside this org/project', async () => {
    ctx.handler = handler({ trialExists: false });
    expect(await releaseTrialLineTime(VALID)).toEqual({ ok: false, error: 'not_found' });
  });

  it('reports not_booked rather than pretending it released something', async () => {
    ctx.handler = handler({ booked: false });
    expect(await releaseTrialLineTime(VALID)).toEqual({ ok: false, error: 'not_booked' });
  });

  it('frees the slot and records the freed slot in the audit pre-image', async () => {
    const calls: Array<{ sql: string; params?: readonly unknown[] }> = [];
    ctx.handler = (sql, params) => {
      calls.push({ sql, params });
      return handler({})(sql, params);
    };

    const result = await releaseTrialLineTime({ ...VALID, note: 'booked by mistake' });

    expect(result).toEqual({ ok: true, data: { trialId: TRIAL } });
    expect(calls.some(({ sql }) => /delete from public\.planning_capacity_blocks/.test(sql))).toBe(
      true,
    );

    const audit = calls.find(({ sql }) => /insert into public\.audit_events/.test(sql));
    expect(audit?.sql).toContain('npd.trial_line_time.released');
    // The row is gone, so the audit pre-image IS the trail for the freed slot.
    expect(JSON.parse(String(audit?.params?.[2]))).toEqual(
      expect.objectContaining({
        trialId: TRIAL,
        projectId: PROJECT,
        lineId: 'line-1',
        lineCode: 'L1',
        lineName: 'Slicing line 1',
        label: 'NPD-001 trial T-012',
        blockDate: '2026-08-01',
        startTime: '09:00:00',
        endTime: '12:00:00',
        blockType: 'npd_trial',
      }),
    );
    expect(JSON.parse(String(audit?.params?.[3]))).toEqual(
      expect.objectContaining({
        reasonCode: 'entry_error',
        note: 'booked by mistake',
        releasedBy: ctx.userId,
      }),
    );
  });
});
