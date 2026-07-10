import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { QueryClient } from '../../_actions/procurement-shared';
import {
  canImportPurchaseOrders,
  canImportTransferOrders,
  canImportWorkOrders,
} from './can-import-po';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

let allowPoManage = true;
let allowToManage = true;
let allowPlanningWrite = true;

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client: makeClient() }),
  ),
}));

function makeClient(): QueryClient {
  const query: QueryClient['query'] = async <T = Record<string, unknown>>(
    _sql: string,
    params: readonly unknown[] = [],
  ): Promise<{ rows: T[]; rowCount?: number | null }> => {
    const permission = params[2] as string;
    const allowed =
      permission === 'planning.po.manage'
        ? allowPoManage
        : permission === 'planning.to.manage'
          ? allowToManage
          : permission === 'npd.planning.write'
            ? allowPlanningWrite
            : false;
    return { rows: allowed ? ([{ ok: true }] as T[]) : [], rowCount: allowed ? 1 : 0 };
  };

  return { query: vi.fn(query) as unknown as QueryClient['query'] };
}

describe('planning import RBAC gates', () => {
  beforeEach(() => {
    allowPoManage = true;
    allowToManage = true;
    allowPlanningWrite = true;
  });

  it('canImportPurchaseOrders resolves planning.po.manage', async () => {
    allowPoManage = false;
    await expect(canImportPurchaseOrders()).resolves.toBe(false);
    allowPoManage = true;
    await expect(canImportPurchaseOrders()).resolves.toBe(true);
  });

  it('canImportTransferOrders resolves planning.to.manage independently of PO manage', async () => {
    allowPoManage = false;
    allowToManage = true;
    await expect(canImportTransferOrders()).resolves.toBe(true);

    allowToManage = false;
    await expect(canImportTransferOrders()).resolves.toBe(false);
  });

  it('canImportWorkOrders resolves npd.planning.write for WO import hosts', async () => {
    allowPlanningWrite = false;
    await expect(canImportWorkOrders()).resolves.toBe(false);
    allowPlanningWrite = true;
    await expect(canImportWorkOrders()).resolves.toBe(true);
  });
});
