/**
 * D365-identity — drift resolve must not rename item_code for linked/referenced items.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();
const hasPermissionMock = vi.fn();

vi.mock('../../../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: <T,>(fn: (ctx: unknown) => Promise<T>) =>
    fn({ userId: 'user-1', orgId: 'org-1', client: { query: queryMock } }),
}));

vi.mock('../../../../../../../../../../lib/integrations/d365/rbac', () => ({
  hasD365SyncPermission: (...args: unknown[]) => hasPermissionMock(...args),
}));

import { bulkResolveDriftAction, resolveDriftAction } from '../drift-actions';

const DRIFT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LINKED_DRIFT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ITEM_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LINKED_FG_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OCCURRED_AT = '2026-07-13T10:00:00.000Z';
const REASON = 'operator approved D365 value';

beforeEach(() => {
  vi.clearAllMocks();
  hasPermissionMock.mockResolvedValue(true);
});

afterEach(() => {
  queryMock.mockReset();
});

function wireDriftResolve(opts: {
  currentCode: string;
  proposedCode: string;
  mutable: boolean;
  itemId?: string;
  driftId?: string;
  currentType?: string;
  proposedType?: string;
}) {
  const itemId = opts.itemId ?? ITEM_ID;
  const driftId = opts.driftId ?? DRIFT_ID;
  const currentType = opts.currentType ?? 'fg';
  const proposedType = opts.proposedType ?? 'fg';

  queryMock.mockImplementation(async (sql: string, params?: readonly unknown[]) => {
    const text = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();

    if (text.includes('from public.audit_log') && text.includes('d365_drift')) {
      return {
        rows: [{
          id: driftId,
          occurred_at: OCCURRED_AT,
          resource_id: itemId,
          before_state: { item_code: opts.currentCode, name: 'MP', item_type: currentType },
          after_state: { item_code: opts.proposedCode, name: 'D365', item_type: proposedType },
        }],
      };
    }
    if (text.includes('select item_code') && text.includes('from public.items')) {
      return { rows: [{ item_code: opts.currentCode }] };
    }
    if (text.includes('items_is_item_code_mutable')) {
      return { rows: [{ mutable: opts.mutable }] };
    }
    if (text.startsWith('update public.items')) {
      return { rows: [], rowCount: 1 };
    }
    if (text.startsWith('insert into public.audit_log')) {
      return { rows: [] };
    }
    return { rows: [] };
  });
}

describe('resolveDriftAction — item_code identity guard', () => {
  it('rejects item_code rename for a referenced item but still syncs other safe fields', async () => {
    wireDriftResolve({ currentCode: 'FG-OLD', proposedCode: 'FG-NEW', mutable: false });

    const result = await resolveDriftAction({
      driftId: DRIFT_ID,
      occurredAt: OCCURRED_AT,
      resolution: 'accept',
      direction: 'd365_wins',
      reason: REASON,
    });

    expect(result).toEqual({
      ok: true,
      warning: 'Cannot rename a referenced FG; identity is local-owned',
    });

    const itemUpdate = queryMock.mock.calls.find(
      ([sql]) => String(sql).toLowerCase().includes('update public.items') && String(sql).toLowerCase().includes('d365_sync_status'),
    );
    expect(itemUpdate).toBeDefined();
    const updateSql = String(itemUpdate![0]).toLowerCase();
    expect(updateSql).not.toMatch(/item_code\s*=/);
    expect(updateSql).not.toMatch(/item_type\s*=/);
    expect(itemUpdate![1]).toEqual([ITEM_ID, 'D365']);

    const auditInsert = queryMock.mock.calls.find(
      ([sql]) => String(sql).toLowerCase().startsWith('insert into public.audit_log'),
    );
    expect(auditInsert).toBeDefined();
    const afterState = JSON.parse(String(auditInsert![1]![4]));
    expect(afterState.partial).toEqual({ item_code_preserved: true, item_type_preserved: true });
    expect(afterState.warning).toBe('Cannot rename a referenced FG; identity is local-owned');
  });

  it('rejects item_code rename for a linked FG and preserves item_type', async () => {
    wireDriftResolve({
      currentCode: 'FG-LINKED',
      proposedCode: 'FG-RENAMED',
      mutable: false,
      itemId: LINKED_FG_ID,
      driftId: LINKED_DRIFT_ID,
      currentType: 'fg',
      proposedType: 'rm',
    });

    const result = await resolveDriftAction({
      driftId: LINKED_DRIFT_ID,
      occurredAt: OCCURRED_AT,
      resolution: 'accept',
      direction: 'd365_wins',
      reason: REASON,
    });

    expect(result).toEqual({
      ok: true,
      warning: 'Cannot rename a referenced FG; identity is local-owned',
    });

    const mutableCheck = queryMock.mock.calls.find(
      ([sql]) => String(sql).toLowerCase().includes('items_is_item_code_mutable'),
    );
    expect(mutableCheck![1]).toEqual([LINKED_FG_ID]);

    const itemUpdate = queryMock.mock.calls.find(
      ([sql]) => String(sql).toLowerCase().includes('update public.items') && String(sql).toLowerCase().includes('d365_sync_status'),
    );
    expect(itemUpdate).toBeDefined();
    const updateSql = String(itemUpdate![0]).toLowerCase();
    expect(updateSql).not.toMatch(/item_code\s*=/);
    expect(updateSql).not.toMatch(/item_type\s*=/);
    expect(itemUpdate![1]).toEqual([LINKED_FG_ID, 'D365']);
  });

  it('allows item_code rename when the item is unreferenced and unlinked', async () => {
    wireDriftResolve({ currentCode: 'FG-OLD', proposedCode: 'FG-NEW', mutable: true });

    const result = await resolveDriftAction({
      driftId: DRIFT_ID,
      occurredAt: OCCURRED_AT,
      resolution: 'accept',
      direction: 'd365_wins',
      reason: REASON,
    });

    expect(result).toEqual({ ok: true });

    const itemUpdate = queryMock.mock.calls.find(
      ([sql]) => String(sql).toLowerCase().includes('update public.items') && String(sql).toLowerCase().includes('item_code'),
    );
    expect(itemUpdate).toBeDefined();
    expect(itemUpdate![1]).toEqual([ITEM_ID, 'FG-NEW', 'D365', 'fg']);
  });
});

describe('bulkResolveDriftAction — identity warnings', () => {
  it('returns blocked and warning counts when rename is rejected', async () => {
    let call = 0;
    queryMock.mockImplementation(async (sql: string, params?: readonly unknown[]) => {
      const text = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();
      call += 1;

      if (text.includes('from public.audit_log') && text.includes('d365_drift')) {
        const driftId = call % 2 === 0 ? DRIFT_ID : LINKED_DRIFT_ID;
        const itemId = call % 2 === 0 ? ITEM_ID : LINKED_FG_ID;
        return {
          rows: [{
            id: driftId,
            occurred_at: OCCURRED_AT,
            resource_id: itemId,
            before_state: { item_code: 'FG-OLD', name: 'MP', item_type: 'fg' },
            after_state: { item_code: 'FG-NEW', name: 'D365', item_type: 'fg' },
          }],
        };
      }
      if (text.includes('select item_code') && text.includes('from public.items')) {
        return { rows: [{ item_code: 'FG-OLD' }] };
      }
      if (text.includes('items_is_item_code_mutable')) {
        return { rows: [{ mutable: false }] };
      }
      if (text.startsWith('update public.items') || text.startsWith('insert into public.audit_log')) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const result = await bulkResolveDriftAction({
      drifts: [
        { driftId: DRIFT_ID, occurredAt: OCCURRED_AT },
        { driftId: LINKED_DRIFT_ID, occurredAt: OCCURRED_AT },
      ],
      resolution: 'accept',
      direction: 'd365_wins',
      reason: REASON,
    });

    expect(result).toEqual({ ok: true, resolved: 2, blocked: 2, warnings: 2 });
  });
});
