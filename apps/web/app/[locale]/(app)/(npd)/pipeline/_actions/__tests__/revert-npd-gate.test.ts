import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

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

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: async (action: (c: unknown) => Promise<unknown>) =>
    action({
      userId: mocks.ctx.userId,
      orgId: mocks.ctx.orgId,
      client: {
        query: async (sql: string, params?: readonly unknown[]) => mocks.ctx.handler(sql, params),
      },
    }),
}));

import { revalidatePath } from 'next/cache';
import { revertNpdGate } from '../../../../../../(npd)/pipeline/_actions/revert-npd-gate';

const PROJECT = '00000000-0000-4000-8000-0000000000b1';

function project(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: PROJECT,
    code: 'NPD-001',
    current_gate: 'G3',
    current_stage: 'packaging',
    product_code: 'FG-NPD-001',
    npd_locked_for_release_at: null,
    ...overrides,
  };
}

function handler(row = project()): { calls: Array<{ sql: string; params?: readonly unknown[] }>; handle: Handler } {
  const calls: Array<{ sql: string; params?: readonly unknown[] }> = [];
  return {
    calls,
    handle: (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      if (sql.includes('from public.npd_projects') && sql.includes('for update')) return { rows: [row] };
      if (sql.includes('update public.npd_projects')) return { rows: [] };
      if (sql.includes('insert into public.outbox_events')) return { rows: [] };
      return { rows: [] };
    },
  };
}

beforeEach(() => {
  mocks.signEvent.mockReset();
  mocks.signEvent.mockResolvedValue({
    signatureId: 'sig-1',
    signerUserId: mocks.ctx.userId,
    intent: 'npd.gate.reverted',
    subjectHash: 'subject-hash',
    signedAt: '2026-06-26T10:00:00.000Z',
    auditEventId: 1,
    nonce: 'nonce-1',
  });
  const setup = handler();
  mocks.ctx.handler = setup.handle;
  vi.mocked(revalidatePath).mockClear();
});

describe('revertNpdGate', () => {
  it('reverts to the previous gate after e-sign and emits npd.gate.reverted', async () => {
    const setup = handler(project({ current_gate: 'G3', current_stage: 'packaging' }));
    mocks.ctx.handler = setup.handle;

    const result = await revertNpdGate({ projectId: PROJECT, reason: 'Trial failed label review.', pin: '123456' });

    expect(result).toEqual({ success: true });
    expect(mocks.signEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        signerUserId: mocks.ctx.userId,
        pin: '123456',
        intent: 'npd.gate.reverted',
        subject: expect.objectContaining({
          projectId: PROJECT,
          projectCode: 'NPD-001',
          fromGate: 'G3',
          toGate: 'G2',
        }),
        reason: 'Trial failed label review.',
      }),
      expect.objectContaining({ client: expect.any(Object) }),
    );

    const update = setup.calls.find((call) => /update public\.npd_projects/.test(call.sql));
    expect(update?.params).toEqual([PROJECT, 'G2', 'recipe']);

    const outbox = setup.calls.find((call) => /insert into public\.outbox_events/.test(call.sql));
    expect(outbox?.params?.[0]).toBe('npd.gate.reverted');
    expect(JSON.parse(String(outbox?.params?.[3]))).toEqual({
      project_id: PROJECT,
      from_gate: 'G3',
      to_gate: 'G2',
      reason: 'Trial failed label review.',
      actor_user_id: mocks.ctx.userId,
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/npd/pipeline/${PROJECT}`);
  });

  it('refuses to revert below the first gate', async () => {
    const setup = handler(project({ current_gate: 'G0', current_stage: 'brief' }));
    mocks.ctx.handler = setup.handle;

    const result = await revertNpdGate({ projectId: PROJECT, reason: 'No lower gate exists.', pin: '123456' });

    expect(result).toEqual({ success: false, error: 'ALREADY_AT_FIRST_GATE', status: 409 });
    expect(mocks.signEvent).not.toHaveBeenCalled();
    expect(setup.calls.some((call) => /update public\.npd_projects/.test(call.sql))).toBe(false);
    expect(setup.calls.some((call) => /insert into public\.outbox_events/.test(call.sql))).toBe(false);
  });

  it('refuses when the linked NPD product is locked for release', async () => {
    const setup = handler(project({ npd_locked_for_release_at: '2026-06-26T09:00:00.000Z' }));
    mocks.ctx.handler = setup.handle;

    const result = await revertNpdGate({ projectId: PROJECT, reason: 'Locked release should not move.', pin: '123456' });

    expect(result).toEqual({ success: false, error: 'NPD_RELEASE_LOCKED', status: 409 });
    expect(mocks.signEvent).not.toHaveBeenCalled();
    expect(setup.calls.some((call) => /update public\.npd_projects/.test(call.sql))).toBe(false);
    expect(setup.calls.some((call) => /insert into public\.outbox_events/.test(call.sql))).toBe(false);
  });

  it('returns ESIGN_FAILED and does not persist when the e-sign primitive rejects', async () => {
    const setup = handler(project({ current_gate: 'G4', current_stage: 'approval' }));
    mocks.ctx.handler = setup.handle;
    mocks.signEvent.mockRejectedValueOnce(new Error('Invalid password or PIN'));

    const result = await revertNpdGate({ projectId: PROJECT, reason: 'Approval evidence failed.', pin: '000000' });

    expect(result).toEqual({ success: false, error: 'ESIGN_FAILED', status: 403 });
    expect(mocks.signEvent).toHaveBeenCalledOnce();
    expect(setup.calls.some((call) => /update public\.npd_projects/.test(call.sql))).toBe(false);
    expect(setup.calls.some((call) => /insert into public\.outbox_events/.test(call.sql))).toBe(false);
  });
});
