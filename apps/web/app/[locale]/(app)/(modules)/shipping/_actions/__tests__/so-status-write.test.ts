import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  readLockedShipmentStatus,
  writeSalesOrderStatusInContext,
  writeShipmentStatusInContext,
} from '../so-status-write';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SHIPMENT_ID = '44444444-4444-4444-8444-444444444444';
const SO_ID = '33333333-3333-4333-8333-333333333333';

let client: QueryClient;
let shipmentStatus = 'shipped';
let updateQueries: string[];

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const q = normalize(sql);

      if (q.startsWith('select status, sales_order_id::text') && q.includes('for update')) {
        return {
          rows: [{ status: shipmentStatus, sales_order_id: SO_ID }],
          rowCount: 1,
        };
      }

      if (q.startsWith('update public.shipments')) {
        updateQueries.push(sql);
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('select status') && q.includes('from public.sales_orders') && q.includes('for update')) {
        return { rows: [{ status: 'confirmed' }], rowCount: 1 };
      }

      if (q.startsWith('update public.sales_orders')) {
        updateQueries.push(sql);
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    }),
  };
}

const ctx = () => ({ userId: USER_ID, orgId: ORG_ID, client });

beforeEach(() => {
  shipmentStatus = 'shipped';
  updateQueries = [];
  client = makeClient();
});

describe('writeShipmentStatusInContext illegal transitions', () => {
  it('rejects shipped→confirmed without issuing an UPDATE', async () => {
    const result = await writeShipmentStatusInContext(ctx(), SHIPMENT_ID, 'confirmed', {
      currentStatus: 'shipped',
    });

    expect(result).toBe('illegal_transition');
    expect(updateQueries).toEqual([]);
  });

  it('rejects cancelled→packing without issuing an UPDATE', async () => {
    shipmentStatus = 'cancelled';

    const locked = await readLockedShipmentStatus(ctx(), SHIPMENT_ID);
    expect(locked).not.toBe('not_found');

    const result = await writeShipmentStatusInContext(ctx(), SHIPMENT_ID, 'packing');

    expect(result).toBe('illegal_transition');
    expect(updateQueries).toEqual([]);
  });
});

describe('writeSalesOrderStatusInContext illegal transitions', () => {
  it('rejects cancelled→confirmed without issuing an UPDATE', async () => {
    const result = await writeSalesOrderStatusInContext(ctx(), SO_ID, 'confirmed', {
      currentStatus: 'cancelled',
    });

    expect(result).toBe('illegal_transition');
    expect(updateQueries).toEqual([]);
  });
});
