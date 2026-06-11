/**
 * Wave 8b Lane IA — transitionItemStatus unit tests (audit finding #8).
 *
 * Mirrors the supplier-spec-actions.test.ts harness: withOrgContext is mocked to
 * run the action body against a scripted fake client, so the transition map,
 * RBAC gate, activation data-gate and audit write are exercised without a DB.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Call = { sql: string; params: readonly unknown[] };

const ctx = {
  orgId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  grantedPerms: new Set<string>(),
  // the current items row handed back by the SELECT (null ⇒ not found)
  row: { status: 'draft', uom_base: 'kg' } as { status: string; uom_base: string } | null,
  calls: [] as Call[],
};

function fakeClient() {
  return {
    async query(sql: string, params: readonly unknown[] = []) {
      ctx.calls.push({ sql, params });
      const s = sql.replace(/\s+/g, ' ').toLowerCase();

      if (s.includes('from public.user_roles ur')) {
        const perm = params[2] as string;
        return { rows: ctx.grantedPerms.has(perm) ? [{ ok: true }] : [] };
      }
      if (s.includes('select status, uom_base from public.items')) {
        return { rows: ctx.row ? [ctx.row] : [] };
      }
      if (s.includes('update public.items')) {
        return { rows: [{ id: params[0], status: params[1] }] };
      }
      if (s.includes('into public.audit_log')) {
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
}

vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: async (action: (c: unknown) => Promise<unknown>) =>
    action({ orgId: ctx.orgId, userId: ctx.userId, sessionToken: 't', client: fakeClient() }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { ITEMS_EDIT_PERMISSION } from '../shared';
import { transitionItemStatus } from '../transition-item-status';

const ITEM_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

beforeEach(() => {
  ctx.grantedPerms = new Set<string>([ITEMS_EDIT_PERMISSION]);
  ctx.row = { status: 'draft', uom_base: 'kg' };
  ctx.calls = [];
});
afterEach(() => vi.clearAllMocks());

function updateCalls(): Call[] {
  return ctx.calls.filter((c) => c.sql.replace(/\s+/g, ' ').toLowerCase().includes('update public.items'));
}
function auditCalls(): Call[] {
  return ctx.calls.filter((c) => c.sql.toLowerCase().includes('audit_log'));
}

describe('transitionItemStatus (Wave 8b Lane IA)', () => {
  it('happy path: draft → active updates the row and writes the audit entry', async () => {
    const result = await transitionItemStatus({ id: ITEM_ID, toStatus: 'active' });
    expect(result).toEqual({ ok: true, data: { id: ITEM_ID, status: 'active' } });
    expect(updateCalls()).toHaveLength(1);
    expect(updateCalls()[0]!.params).toEqual([ITEM_ID, 'active']);
    expect(auditCalls()).toHaveLength(1);
    const auditParams = auditCalls()[0]!.params;
    expect(auditParams[2]).toBe('item.status_transitioned');
    expect(JSON.parse(auditParams[4] as string)).toEqual({ status: 'draft' });
    expect(JSON.parse(auditParams[5] as string)).toEqual({ status: 'active' });
  });

  it('active → deprecated and deprecated → active are allowed', async () => {
    ctx.row = { status: 'active', uom_base: 'kg' };
    const deprecated = await transitionItemStatus({ id: ITEM_ID, toStatus: 'deprecated' });
    expect(deprecated.ok).toBe(true);

    ctx.row = { status: 'deprecated', uom_base: 'kg' };
    const reactivated = await transitionItemStatus({ id: ITEM_ID, toStatus: 'active' });
    expect(reactivated.ok).toBe(true);
  });

  it('illegal transitions are rejected without touching the row', async () => {
    // blocked → active stays owned by the deactivate flow (no reactivation here)
    ctx.row = { status: 'blocked', uom_base: 'kg' };
    const fromBlocked = await transitionItemStatus({ id: ITEM_ID, toStatus: 'active' });
    expect(fromBlocked).toMatchObject({ ok: false, error: 'invalid_transition' });

    // draft → deprecated skips the lifecycle
    ctx.row = { status: 'draft', uom_base: 'kg' };
    ctx.calls = [];
    const skipped = await transitionItemStatus({ id: ITEM_ID, toStatus: 'deprecated' });
    expect(skipped).toMatchObject({ ok: false, error: 'invalid_transition' });
    expect(updateCalls()).toHaveLength(0);
    expect(auditCalls()).toHaveLength(0);
  });

  it('anything → draft is rejected by input validation', async () => {
    const result = await transitionItemStatus({ id: ITEM_ID, toStatus: 'draft' });
    expect(result).toMatchObject({ ok: false, error: 'invalid_input' });
    expect(ctx.calls).toHaveLength(0);
  });

  it('permission denied: missing technical.items.edit returns forbidden, no write', async () => {
    ctx.grantedPerms = new Set<string>();
    const result = await transitionItemStatus({ id: ITEM_ID, toStatus: 'active' });
    expect(result).toEqual({ ok: false, error: 'forbidden' });
    expect(updateCalls()).toHaveLength(0);
  });

  it('activation gate: a draft with a non-canonical uom_base cannot go active', async () => {
    ctx.row = { status: 'draft', uom_base: 'eac' };
    const result = await transitionItemStatus({ id: ITEM_ID, toStatus: 'active' });
    expect(result).toMatchObject({ ok: false, error: 'activation_gate_failed' });
    expect(updateCalls()).toHaveLength(0);
  });

  it('not found and idempotent re-apply', async () => {
    ctx.row = null;
    const missing = await transitionItemStatus({ id: ITEM_ID, toStatus: 'active' });
    expect(missing).toEqual({ ok: false, error: 'not_found' });

    ctx.row = { status: 'active', uom_base: 'kg' };
    ctx.calls = [];
    const noop = await transitionItemStatus({ id: ITEM_ID, toStatus: 'active' });
    expect(noop).toEqual({ ok: true, data: { id: ITEM_ID, status: 'active' } });
    expect(updateCalls()).toHaveLength(0);
  });
});
