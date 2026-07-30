import { beforeEach, describe, expect, it, vi } from 'vitest';

const context = vi.hoisted(() => ({
  client: null as PermissionBoundaryClient | null,
}));

vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (
    action: (ctx: {
      userId: string;
      orgId: string;
      client: PermissionBoundaryClient;
    }) => Promise<unknown>,
  ) => {
    if (!context.client) throw new Error('missing contract client');
    return action({
      userId: '11111111-1111-4111-8111-111111111111',
      orgId: '22222222-2222-4222-8222-222222222222',
      client: context.client,
    });
  }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { confirmBulkImportPo } from '../../lib/import/po-import-actions';
import { confirmWoImport } from '../../lib/import/wo-import-actions';

class PermissionBoundaryClient {
  readonly permissionChecks: string[] = [];
  readonly calls: string[] = [];
  reachedExecution = false;

  constructor(private readonly grants: Set<string>) {}

  async query<T = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<{ rows: T[]; rowCount: number }> {
    const text = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    this.calls.push(text);
    if (text.includes('from public.user_roles')) {
      const permission = String(params[2] ?? '');
      this.permissionChecks.push(permission);
      const ok = this.grants.has(permission);
      return { rows: ok ? ([{ ok: true }] as T[]) : [], rowCount: ok ? 1 : 0 };
    }
    this.reachedExecution = true;
    throw new Error('contract fake stops after the permission boundary');
  }
}

const PO_ROW = {
  rowNumber: 1,
  supplierCode: 'SUP-1',
  supplierId: '33333333-3333-4333-8333-333333333333',
  itemCode: 'RM-1',
  itemId: '44444444-4444-4444-8444-444444444444',
  qty: '5.000',
  uom: 'kg',
  unitPrice: '2.50',
  currency: 'GBP',
};

const WO_ROW = {
  ...PO_ROW,
  supplierCode: '',
  supplierId: '',
  itemCode: 'FG-1',
  itemId: '55555555-5555-4555-8555-555555555555',
  unitPrice: '0',
  woNumber: 'WO-IMPORT-1',
};

beforeEach(() => {
  context.client = null;
});

describe('XC-034 import RBAC contract', () => {
  it('denies PO import for a read-only user before any write path', async () => {
    const client = new PermissionBoundaryClient(new Set());
    context.client = client;

    const result = await confirmBulkImportPo([PO_ROW]);

    expect(result.created).toBe(0);
    expect(result.errors[0]?.message).toContain('forbidden');
    expect(client.permissionChecks).toEqual(['planning.po.manage']);
    expect(client.reachedExecution).toBe(false);
  });

  it('denies WO import for a read-only user before any write path', async () => {
    const client = new PermissionBoundaryClient(new Set());
    context.client = client;

    const result = await confirmWoImport([WO_ROW]);

    expect(result.created).toBe(0);
    expect(result.errors[0]?.message).toContain('forbidden');
    expect(client.permissionChecks).toEqual(['npd.planning.write']);
    expect(client.reachedExecution).toBe(false);
  });

  it.each([
    ['PO', new Set(['planning.po.manage']), () => confirmBulkImportPo([PO_ROW])],
    ['WO', new Set(['npd.planning.write']), () => confirmWoImport([WO_ROW])],
  ])('lets a correctly-authorized %s import reach its execution path', async (_kind, grants, run) => {
    const client = new PermissionBoundaryClient(grants);
    context.client = client;

    await run();

    expect(client.reachedExecution).toBe(true);
  });
});
