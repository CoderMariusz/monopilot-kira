import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

type Handler = (sql: string, params?: readonly unknown[]) => { rows: unknown[] };

const ctx = {
  userId: '00000000-0000-4000-8000-0000000000aa',
  orgId: '00000000-0000-4000-8000-00000000000a',
  handler: (() => ({ rows: [] })) as Handler,
};

vi.mock('../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: async (action: (c: unknown) => Promise<unknown>) =>
    action({
      userId: ctx.userId,
      orgId: ctx.orgId,
      client: {
        query: async (sql: string, params?: readonly unknown[]) => ctx.handler(sql, params),
      },
    }),
}));

import { revalidatePath } from 'next/cache';
import { toggleGateChecklistItem } from '../toggle-gate-checklist-item';

const PROJECT = '00000000-0000-4000-8000-0000000000b1';
const ITEM = '00000000-0000-4000-8000-0000000000c1';

const BEFORE = {
  id: ITEM,
  project_id: PROJECT,
  gate_code: 'G2',
  item_text: 'Target margin confirmed',
  required: true,
  completed_at: null,
  completed_by_user: null,
};

const AFTER = {
  ...BEFORE,
  completed_at: '2026-06-09 12:00:00+00',
  completed_by_user: ctx.userId,
};

function handler(opts: { perm?: boolean; found?: boolean; updateFound?: boolean } = {}): Handler {
  return (sql) => {
    if (sql.includes('from public.user_roles')) {
      return { rows: opts.perm === false ? [] : [{ ok: true }] };
    }
    if (sql.includes('from public.gate_checklist_items') && sql.includes('for update')) {
      return { rows: opts.found === false ? [] : [BEFORE] };
    }
    if (sql.includes('update public.gate_checklist_items')) {
      return { rows: opts.updateFound === false ? [] : [AFTER] };
    }
    if (sql.includes('insert into public.audit_events')) return { rows: [] };
    return { rows: [] };
  };
}

beforeEach(() => {
  ctx.handler = handler();
  vi.mocked(revalidatePath).mockClear();
});

describe('toggleGateChecklistItem', () => {
  it('rejects invalid input before DB work', async () => {
    const result = await toggleGateChecklistItem({ projectId: 'bad', itemId: ITEM, completed: true });
    expect(result).toEqual({ ok: false, code: 'INVALID_INPUT', status: 400 });
  });

  it('returns forbidden without npd.core.write', async () => {
    ctx.handler = handler({ perm: false });
    const result = await toggleGateChecklistItem({ projectId: PROJECT, itemId: ITEM, completed: true });
    expect(result).toEqual({ ok: false, code: 'FORBIDDEN', status: 403 });
  });

  it('returns not_found when the item is outside the project/current org', async () => {
    ctx.handler = handler({ found: false });
    const result = await toggleGateChecklistItem({ projectId: PROJECT, itemId: ITEM, completed: true });
    expect(result).toEqual({ ok: false, code: 'NOT_FOUND', status: 404 });
  });

  it('updates completion state, audits, and revalidates the pipeline', async () => {
    const calls: Array<{ sql: string; params?: readonly unknown[] }> = [];
    ctx.handler = (sql, params) => {
      calls.push({ sql, params });
      return handler()(sql, params);
    };

    const result = await toggleGateChecklistItem({ projectId: PROJECT, itemId: ITEM, completed: true });

    expect(result).toEqual({ ok: true });
    expect(calls.some((call) => /update public\.gate_checklist_items/.test(call.sql))).toBe(true);
    expect(calls.some((call) => /completed_by_user/.test(call.sql))).toBe(true);
    expect(calls.some((call) => /insert into public\.audit_events/.test(call.sql))).toBe(true);
    expect(calls.find((call) => /update public\.gate_checklist_items/.test(call.sql))?.params).toEqual([
      ITEM,
      PROJECT,
      true,
      ctx.userId,
    ]);
    expect(revalidatePath).toHaveBeenCalledWith('/pipeline');
  });
});
