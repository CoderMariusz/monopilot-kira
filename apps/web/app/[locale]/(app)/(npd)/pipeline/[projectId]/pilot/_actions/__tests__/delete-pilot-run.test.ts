/**
 * NPD PILOT — deletePilotRun Server Action unit tests.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

type Handler = (sql: string, params: readonly unknown[]) => { rows: unknown[] } | undefined;
const handlerHolder: { handler: Handler } = { handler: () => ({ rows: [] }) };

vi.mock('../../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: async (action: (ctx: unknown) => Promise<unknown>) =>
    action({
      userId: '07300000-0000-4000-8000-0000000000aa',
      orgId: '07300000-0000-4000-8000-00000000000a',
      sessionToken: 'tok',
      client: {
        query: async (sql: string, params: readonly unknown[] = []) =>
          handlerHolder.handler(sql, params) ?? { rows: [] },
      },
    }),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { deletePilotRun } from '../delete-pilot-run';

const PROJECT = '07300000-0000-4000-8000-0000000000c1';
const RUN = '07300000-0000-4000-8000-0000000000d1';

afterEach(() => {
  handlerHolder.handler = () => ({ rows: [] });
  vi.clearAllMocks();
});

function permHandler(granted: string[], rest?: Handler): Handler {
  return (sql, params) => {
    if (/role_permissions/.test(sql) && /rp.permission = \$3/.test(sql)) {
      const perm = params[2] as string;
      return { rows: granted.includes(perm) ? [{ ok: true }] : [] };
    }
    return rest ? rest(sql, params) : { rows: [] };
  };
}

describe('deletePilotRun', () => {
  it('rejects invalid input without hitting the DB', async () => {
    const spy = vi.fn(() => ({ rows: [] }));
    handlerHolder.handler = spy as unknown as Handler;
    const r = await deletePilotRun({ pilotRunId: 'nope', projectId: PROJECT });
    expect(r).toEqual(expect.objectContaining({ ok: false, error: 'invalid_input' }));
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns forbidden without npd.pilot.write', async () => {
    handlerHolder.handler = permHandler(['npd.pilot.read']);
    const r = await deletePilotRun({ pilotRunId: RUN, projectId: PROJECT });
    expect(r).toEqual({ ok: false, error: 'forbidden' });
  });

  it('deletes a planned run and writes an audit row', async () => {
    const calls: string[] = [];
    handlerHolder.handler = permHandler(['npd.pilot.write'], (sql) => {
      calls.push(sql);
      if (/delete from public.pilot_runs/.test(sql)) {
        return { rows: [{ id: RUN, status: 'planned', line: 'LINE2', deleted: true }] };
      }
      return { rows: [] };
    });
    const r = await deletePilotRun({ pilotRunId: RUN, projectId: PROJECT });
    expect(r).toEqual({ ok: true, data: { pilotRunId: RUN } });
    expect(calls.some((s) => /npd\.pilot\.run\.deleted/.test(s))).toBe(true);
  });

  it('rejects deleting a run that has progressed past planned', async () => {
    handlerHolder.handler = permHandler(['npd.pilot.write'], (sql) => {
      if (/delete from public.pilot_runs/.test(sql)) {
        return { rows: [{ id: RUN, status: 'completed', line: 'LINE2', deleted: false }] };
      }
      return { rows: [] };
    });
    const r = await deletePilotRun({ pilotRunId: RUN, projectId: PROJECT });
    expect(r).toEqual({ ok: false, error: 'has_progressed' });
  });
});
