import { beforeEach, describe, expect, it, vi } from 'vitest';

import { releaseWoOutputQa } from './output-qa-actions';
import type { QueryClient } from '../../../../../../lib/production/shared';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const OUTPUT_ID = '33333333-3333-4333-8333-333333333333';
const LP_ID = '44444444-4444-4444-8444-444444444444';

let grantedPermissions: Set<string>;
let outputExists = true;
let outputQaStatus = 'PENDING';
let outputLpId: string | null = LP_ID;
let lpQaStatus = 'pending';
let client: QueryClient;

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
      const normalized = normalize(sql);

      if (normalized.includes('from public.user_roles')) {
        const permission = String(params?.[2] ?? '');
        const ok = grantedPermissions.has(permission);
        return { rows: ok ? [{ ok: true }] : [], rowCount: ok ? 1 : 0 };
      }

      if (normalized.startsWith('select id::text, qa_status, lp_id::text from public.wo_outputs')) {
        return {
          rows: outputExists ? [{ id: OUTPUT_ID, qa_status: outputQaStatus, lp_id: outputLpId }] : [],
          rowCount: outputExists ? 1 : 0,
        };
      }

      if (normalized.startsWith('update public.wo_outputs')) {
        return {
          rows: [{ id: OUTPUT_ID, qa_status: params?.[1], lp_id: outputLpId }],
          rowCount: 1,
        };
      }

      if (normalized.startsWith('select id::text, status, qa_status from public.license_plates')) {
        return {
          rows: [{ id: LP_ID, status: 'available', qa_status: lpQaStatus }],
          rowCount: 1,
        };
      }

      if (normalized.startsWith('update public.license_plates')) {
        lpQaStatus = String(params?.[1] ?? lpQaStatus);
        return { rows: [], rowCount: 1 };
      }

      if (normalized.startsWith('insert into public.lp_state_history')) {
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    }),
  };
}

describe('releaseWoOutputQa', () => {
  beforeEach(() => {
    grantedPermissions = new Set(['quality.batch.release']);
    outputExists = true;
    outputQaStatus = 'PENDING';
    outputLpId = LP_ID;
    lpQaStatus = 'pending';
    client = makeClient();
  });

  it('requires quality.batch.release before reading wo_outputs', async () => {
    grantedPermissions.clear();

    const result = await releaseWoOutputQa({ outputId: OUTPUT_ID, decision: 'PASSED' });

    expect(result).toEqual({ ok: false, reason: 'forbidden' });
    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => normalize(sql));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('from public.user_roles');
  });

  it('updates pending output QA and flips linked LP QA consistently', async () => {
    const result = await releaseWoOutputQa({ outputId: OUTPUT_ID, decision: 'PASSED', note: 'lab pass' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.data).toMatchObject({ outputId: OUTPUT_ID, qaStatus: 'PASSED', lpId: LP_ID, lpQaStatus: 'released' });
    expect(lpQaStatus).toBe('released');

    const calls = vi.mocked(client.query).mock.calls.map(([sql, params]) => ({ sql: normalize(sql), params }));
    expect(calls.some((call) => call.sql.startsWith('update public.wo_outputs') && call.params?.[1] === 'PASSED')).toBe(true);
    expect(calls.some((call) => call.sql.startsWith('update public.license_plates') && call.params?.[1] === 'released')).toBe(true);
    const history = calls.find((call) => call.sql.startsWith('insert into public.lp_state_history'));
    expect(history?.params?.[3]).toContain('"outputQaStatusTo":"PASSED"');
    expect(history?.params?.[3]).toContain('"qaStatusTo":"released"');
  });

  it('maps FAILED to rejected on the linked LP', async () => {
    const result = await releaseWoOutputQa({ outputId: OUTPUT_ID, decision: 'FAILED' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.data.lpQaStatus).toBe('rejected');
    expect(lpQaStatus).toBe('rejected');
  });

  it('refuses non-pending and ON_HOLD outputs without updates', async () => {
    outputQaStatus = 'PASSED';
    await expect(releaseWoOutputQa({ outputId: OUTPUT_ID, decision: 'FAILED' })).resolves.toMatchObject({
      ok: false,
      message: 'invalid_state',
    });

    outputQaStatus = 'ON_HOLD';
    await expect(releaseWoOutputQa({ outputId: OUTPUT_ID, decision: 'PASSED' })).resolves.toMatchObject({
      ok: false,
      message: 'on_hold_requires_holds_flow',
    });
  });
});
