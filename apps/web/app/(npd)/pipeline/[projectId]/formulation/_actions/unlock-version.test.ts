import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (sql: string, params?: readonly unknown[]) => { rows: unknown[] };

const mocks = vi.hoisted(() => ({
  signEvent: vi.fn(),
  ctx: {
    userId: '00000000-0000-4000-8000-0000000000aa',
    orgId: '00000000-0000-4000-8000-00000000000a',
    handler: (() => ({ rows: [] })) as Handler,
  },
}));

vi.mock('@monopilot/e-sign', () => ({ signEvent: mocks.signEvent }));

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: async (action: (c: unknown) => Promise<unknown>) =>
    action({
      userId: mocks.ctx.userId,
      orgId: mocks.ctx.orgId,
      client: {
        query: async (sql: string, params?: readonly unknown[]) => mocks.ctx.handler(sql, params),
      },
    }),
}));

const PROJECT = '00000000-0000-4000-8000-0000000000b1';
const VERSION = '00000000-0000-4000-8000-0000000000b2';
const FORMULATION = '00000000-0000-4000-8000-0000000000b3';

function version(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    formulation_id: FORMULATION,
    version_id: VERSION,
    state: 'locked',
    product_code: 'FG-NPD-001',
    ...overrides,
  };
}

function handler(row: Record<string, unknown> | null = version(), hasPerm = true) {
  const calls: Array<{ sql: string; params?: readonly unknown[] }> = [];
  return {
    calls,
    handle: (sql: string, params?: readonly unknown[]) => {
      calls.push({ sql, params });
      if (sql.includes('from public.user_roles')) return { rows: hasPerm ? [{ ok: true }] : [] };
      if (sql.includes('from public.formulations') && sql.includes('for update')) {
        return { rows: row ? [row] : [] };
      }
      if (sql.includes('update public.formulation_versions')) return { rows: [] };
      if (sql.includes('update public.formulations')) return { rows: [] };
      if (sql.includes('insert into public.formulation_audit_log')) return { rows: [] };
      return { rows: [] };
    },
  };
}

beforeEach(() => {
  mocks.signEvent.mockReset();
  mocks.signEvent.mockResolvedValue({
    signatureId: 'sig-1',
    signerUserId: mocks.ctx.userId,
    intent: 'formulation.unlocked',
    subjectHash: 'subject-hash',
    signedAt: '2026-06-28T10:00:00.000Z',
    auditEventId: 1,
    nonce: 'nonce-1',
  });
  mocks.ctx.handler = handler().handle;
});

describe('unlockVersion', () => {
  it('returns VERSION_NOT_LOCKED for non-locked versions without signing', async () => {
    const setup = handler(version({ state: 'draft' }));
    mocks.ctx.handler = setup.handle;
    const { unlockVersion } = await import('./unlock-version');

    const result = await unlockVersion({ projectId: PROJECT, versionId: VERSION, pin: '123456' });

    expect(result).toEqual({ ok: false, error: 'VERSION_NOT_LOCKED' });
    expect(mocks.signEvent).not.toHaveBeenCalled();
    expect(setup.calls.some((call) => /update public\.formulation_versions/.test(call.sql))).toBe(false);
  });

  it('unlocks a locked version with a valid pin and writes audit evidence', async () => {
    const setup = handler(version());
    mocks.ctx.handler = setup.handle;
    const { unlockVersion } = await import('./unlock-version');

    const result = await unlockVersion({
      projectId: PROJECT,
      versionId: VERSION,
      pin: '123456',
      reason: 'Rework trial formula.',
    });

    expect(result).toEqual({ ok: true, data: { versionId: VERSION } });
    expect(mocks.signEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        signerUserId: mocks.ctx.userId,
        pin: '123456',
        intent: 'formulation.unlocked',
        subject: {
          versionId: VERSION,
          formulationId: FORMULATION,
          productCode: 'FG-NPD-001',
        },
        reason: 'Rework trial formula.',
      }),
      expect.objectContaining({ client: expect.any(Object) }),
    );

    const versionUpdate = setup.calls.find((call) => /update public\.formulation_versions/.test(call.sql));
    expect(versionUpdate?.sql).toContain("set state = 'draft'");
    expect(versionUpdate?.sql).toContain("state = 'locked'");
    expect(versionUpdate?.params).toEqual([VERSION]);

    const formulationUpdate = setup.calls.find((call) => /update public\.formulations/.test(call.sql));
    expect(formulationUpdate?.sql).toContain('locked_at = null');
    expect(formulationUpdate?.sql).toContain('locked_by_user = null');
    expect(formulationUpdate?.params).toEqual([FORMULATION, VERSION]);

    const audit = setup.calls.find((call) => /insert into public\.formulation_audit_log/.test(call.sql));
    expect(audit?.sql).toContain("'formulation.unlocked'");
    expect(audit?.params).toEqual([
      FORMULATION,
      VERSION,
      JSON.stringify({ productCode: 'FG-NPD-001', reason: 'Rework trial formula.' }),
      mocks.ctx.userId,
    ]);
    expect(setup.calls.some((call) => /insert into public\.outbox_events/.test(call.sql))).toBe(false);
  });

  it('returns esign_failed and does NOT update formulation_versions when PIN is rejected', async () => {
    const setup = handler(version());
    mocks.ctx.handler = setup.handle;
    mocks.signEvent.mockRejectedValue(new Error('pin failed'));
    const { unlockVersion } = await import('./unlock-version');

    const result = await unlockVersion({ projectId: PROJECT, versionId: VERSION, pin: 'wrong-pin' });

    expect(result).toEqual({ ok: false, error: 'esign_failed' });
    expect(setup.calls.some((call) => /update\s+public\.formulation_versions/i.test(call.sql))).toBe(false);
  });

  it('returns forbidden when the user lacks npd.formulation.unlock', async () => {
    const setup = handler(version(), false);
    mocks.ctx.handler = setup.handle;
    const { unlockVersion } = await import('./unlock-version');

    const result = await unlockVersion({ projectId: PROJECT, versionId: VERSION, pin: '123456' });

    expect(result).toEqual({ ok: false, error: 'forbidden' });
    expect(mocks.signEvent).not.toHaveBeenCalled();
    expect(setup.calls.some((call) => /from public\.formulations/.test(call.sql))).toBe(false);
  });
});
