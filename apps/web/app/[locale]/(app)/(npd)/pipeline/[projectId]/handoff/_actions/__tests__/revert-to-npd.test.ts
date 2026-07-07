/**
 * revertToNpd — release-locked NPD project revert wedge (C2d).
 *
 * Covers: locked→revert happy path, active-WO block, RBAC.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

type Handler = (sql: string, params: readonly unknown[]) => { rows: unknown[] } | undefined;

const handlerHolder: { handler: Handler } = { handler: () => ({ rows: [] }) };

vi.mock('../../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: async (action: (ctx: unknown) => Promise<unknown>) =>
    action({
      userId: '07300000-0000-4000-8000-0000000000aa',
      orgId: '07300000-0000-4000-8000-00000000000a',
      client: {
        query: async (sql: string, params: readonly unknown[] = []) =>
          handlerHolder.handler(sql, params) ?? { rows: [] },
      },
    }),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('../../../../../../../../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: vi.fn(),
}));

import { revertToNpd } from '../revert-to-npd';

const PROJECT = '07300000-0000-4000-8000-0000000000c1';
const CHECKLIST = '07300000-0000-4000-8000-0000000000d1';
const SPEC = '07300000-0000-4000-8000-0000000000f1';

function permHandler(granted: string[], rest?: Handler): Handler {
  return (sql, params) => {
    if (/role_permissions/.test(sql) && /rp.permission = \$3/.test(sql)) {
      const perm = params[2] as string;
      return { rows: granted.includes(perm) ? [{ ok: true }] : [] };
    }
    return rest ? rest(sql, params) : { rows: [] };
  };
}

function lockedProject(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: PROJECT,
    code: 'NPD-001',
    product_code: 'FG-NPD-001',
    current_stage: 'handoff',
    current_gate: 'G4',
    npd_locked_for_release_at: '2026-07-07T10:00:00.000Z',
    ...overrides,
  };
}

function happyPathHandler(
  project = lockedProject(),
  specStatus = 'released_to_factory',
): { calls: Array<{ sql: string; params?: readonly unknown[] }>; handle: Handler } {
  const calls: Array<{ sql: string; params?: readonly unknown[] }> = [];
  return {
    calls,
    handle: (sql, params) => {
      calls.push({ sql, params });
      if (/from public\.npd_projects p/.test(sql) && /for update/.test(sql)) {
        return { rows: [project] };
      }
      if (/from public\.handoff_checklists/.test(sql) && /for update/.test(sql)) {
        return {
          rows: [
            {
              id: CHECKLIST,
              bom_verification_status: 'promoted',
              promote_to_production_date: '2026-07-07',
            },
          ],
        };
      }
      if (/from public\.factory_release_status/.test(sql)) {
        return {
          rows: [{ release_status: 'released_to_factory', active_factory_spec_id: SPEC }],
        };
      }
      if (/from public\.work_orders/.test(sql) && /active_factory_spec_id/.test(sql)) {
        return { rows: [] };
      }
      if (/from public\.factory_specs/.test(sql) && /for update/.test(sql)) {
        return {
          rows: [
            {
              id: SPEC,
              spec_code: 'FS-001',
              version: 1,
              status: specStatus,
              approved_by: '07300000-0000-4000-8000-0000000000aa',
              approved_at: '2026-07-07T09:00:00.000Z',
              released_by: '07300000-0000-4000-8000-0000000000aa',
              released_at: '2026-07-07T10:00:00.000Z',
            },
          ],
        };
      }
      if (/update public\.factory_specs/.test(sql)) return { rows: [{ id: SPEC }] };
      if (/update public\.factory_release_status/.test(sql)) return { rows: [] };
      if (/insert into public\.audit_events/.test(sql)) return { rows: [] };
      if (/update public\.product/.test(sql)) return { rows: [] };
      if (/update public\.handoff_checklists/.test(sql)) return { rows: [] };
      if (/update public\.npd_projects/.test(sql)) return { rows: [] };
      return { rows: [] };
    },
  };
}

afterEach(() => {
  handlerHolder.handler = () => ({ rows: [] });
  vi.clearAllMocks();
});

describe('revertToNpd', () => {
  it('reverts a release-locked project: recalls spec, clears lock, unlocks handoff, writes audit', async () => {
    const setup = happyPathHandler();
    handlerHolder.handler = permHandler(['npd.gate.approve'], setup.handle);

    const result = await revertToNpd({
      projectId: PROJECT,
      reason: 'Release criteria changed — return to NPD handoff.',
    });

    expect(result).toEqual({
      ok: true,
      data: { projectId: PROJECT, factorySpecRecalled: true },
    });

    expect(setup.calls.some((c) => /update public\.factory_specs/.test(c.sql))).toBe(true);
    expect(setup.calls.some((c) => /private_jsonb = private_jsonb - 'npd_locked_for_release_at'/.test(c.sql))).toBe(
      true,
    );
    expect(setup.calls.some((c) => /promote_to_production_date = null/.test(c.sql))).toBe(true);

    const audit = setup.calls.find(
      (c) => /insert into public\.audit_events/.test(c.sql) && c.params?.[1] === 'npd.project.reverted_to_npd',
    );
    expect(audit).toBeDefined();
    expect(JSON.parse(String(audit?.params?.[4]))).toMatchObject({
      reason: 'Release criteria changed — return to NPD handoff.',
      factorySpecRecalled: true,
    });
  });

  it('unlocks a wedged lock-only project without a factory spec', async () => {
    const setup = happyPathHandler();
    setup.handle = (sql, params) => {
      if (/from public\.factory_release_status/.test(sql)) return { rows: [] };
      return happyPathHandler().handle(sql, params);
    };
    handlerHolder.handler = permHandler(['npd.gate.approve'], setup.handle);

    const result = await revertToNpd({ projectId: PROJECT, reason: 'Clear release wedge.' });

    expect(result).toEqual({
      ok: true,
      data: { projectId: PROJECT, factorySpecRecalled: false },
    });
    expect(setup.calls.some((c) => /update public\.factory_specs/.test(c.sql))).toBe(false);
  });

  it('refuses when released or in-progress work orders reference the factory spec', async () => {
    const setup = happyPathHandler();
    setup.handle = (sql, params) => {
      if (/from public\.work_orders/.test(sql) && /active_factory_spec_id/.test(sql)) {
        return { rows: [{ wo_number: 'WO-1001' }, { wo_number: 'WO-1002' }] };
      }
      return happyPathHandler().handle(sql, params);
    };
    handlerHolder.handler = permHandler(['npd.gate.approve'], setup.handle);

    const result = await revertToNpd({ projectId: PROJECT, reason: 'Should be blocked.' });

    expect(result).toEqual({
      ok: false,
      error: 'active_work_orders',
      message:
        'Factory spec cannot be recalled while released or in-progress work orders reference it: WO-1001, WO-1002',
    });
    expect(setup.calls.some((c) => /update public\.product/.test(c.sql))).toBe(false);
    expect(setup.calls.some((c) => /insert into public\.audit_events/.test(c.sql) && c.params?.[1] === 'npd.project.reverted_to_npd')).toBe(false);
  });

  it('returns forbidden without npd.gate.approve', async () => {
    const setup = happyPathHandler();
    handlerHolder.handler = permHandler([], setup.handle);

    const result = await revertToNpd({ projectId: PROJECT, reason: 'No permission.' });

    expect(result).toEqual({ ok: false, error: 'forbidden' });
    expect(setup.calls.some((c) => /from public\.npd_projects/.test(c.sql))).toBe(false);
  });

  it('returns not_release_locked when the project is not promoted or locked', async () => {
    const setup = happyPathHandler(
      lockedProject({ npd_locked_for_release_at: null }),
    );
    setup.handle = (sql, params) => {
      if (/from public\.handoff_checklists/.test(sql) && /for update/.test(sql)) {
        return {
          rows: [{ id: CHECKLIST, bom_verification_status: 'pending', promote_to_production_date: null }],
        };
      }
      if (/from public\.factory_release_status/.test(sql)) return { rows: [] };
      return happyPathHandler(lockedProject({ npd_locked_for_release_at: null })).handle(sql, params);
    };
    handlerHolder.handler = permHandler(['npd.gate.approve'], setup.handle);

    const result = await revertToNpd({ projectId: PROJECT, reason: 'Not locked.' });

    expect(result).toEqual({ ok: false, error: 'not_release_locked' });
  });
});
