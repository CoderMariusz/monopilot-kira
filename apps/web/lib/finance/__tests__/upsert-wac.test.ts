import { beforeEach, describe, expect, it, vi } from 'vitest';

import { upsertWac } from '../upsert-wac';

import type { QueryClient } from '../../../app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/procurement-shared';

const ORG_ID = '00000000-0000-4000-8000-00000000000a';
const USER_ID = '00000000-0000-4000-8000-0000000000aa';
const PO_ID = '00000000-0000-4000-8000-0000000000a1';
const LINE_ID = '00000000-0000-4000-8000-0000000000b1';
const ITEM_ID = '00000000-0000-4000-8000-0000000000c1';
const SUPPLIER_ID = '00000000-0000-4000-8000-0000000000d1';
const WAREHOUSE_ID = '00000000-0000-4000-8000-0000000000e1';
const SITE_ID = '00000000-0000-4000-8000-0000000000e2';
const LOCATION_ID = '00000000-0000-4000-8000-0000000000f1';

let currentClient: ReceiveMockClient;

vi.mock('../../auth/with-org-context', () => ({
  withOrgContext: async <T,>(action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<T>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client: currentClient }),
}));

vi.mock('../../site/site-context', () => ({
  getActiveSiteId: vi.fn(async () => SITE_ID),
}));

vi.mock('../../../app/[locale]/(app)/(modules)/warehouse/_actions/shared', () => ({
  hasWarehousePermission: vi.fn(async () => true),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

describe('upsertWac', () => {
  it('writes WAC totals without writing generated avg_cost or site_id', async () => {
    const client = new WacMockClient();

    await upsertWac(client, {
      orgId: ORG_ID,
      siteId: SITE_ID,
      itemId: ITEM_ID,
      deltaQtyKg: '10',
      deltaValue: '100',
      updatedBy: USER_ID,
    });

    expect(client.row).toMatchObject({
      totalQtyKg: '10',
      totalValue: '100',
      avgCost: '10',
    });
    expect(client.calls[0]?.params).toEqual([ORG_ID, ITEM_ID, '10', '100', USER_ID]);
    expect(client.calls[0]?.sql).toContain("select id from public.currencies where code = 'GBP'");
    expect(normalize(client.calls[0]?.sql ?? '')).not.toContain('avg_cost');
    expect(wacWriteColumns(client.calls[0]?.sql ?? '')).not.toContain('site_id');
  });

  it('updates an existing row with clamped running totals and leaves avg_cost generated', async () => {
    const client = new WacMockClient();
    await upsertWac(client, {
      orgId: ORG_ID,
      siteId: SITE_ID,
      itemId: ITEM_ID,
      deltaQtyKg: '10',
      deltaValue: '100',
      updatedBy: USER_ID,
    });

    await upsertWac(client, {
      orgId: ORG_ID,
      siteId: SITE_ID,
      itemId: ITEM_ID,
      deltaQtyKg: '5',
      deltaValue: '80',
      updatedBy: USER_ID,
    });

    expect(client.row).toMatchObject({
      totalQtyKg: '15',
      totalValue: '180',
      avgCost: '12',
    });
    const updateSql = normalize(client.calls[1]?.sql ?? '');
    expect(updateSql).toContain('on conflict (org_id, item_id, currency_id) do update set');
    expect(updateSql).toContain('total_qty_kg = greatest(item_wac_state.total_qty_kg + $3::numeric, 0)');
    expect(updateSql).toContain('total_value = greatest(item_wac_state.total_value + $4::numeric, 0)');
    expect(updateSql).not.toContain('avg_cost');
    expect(updateSql).not.toContain('site_id');
  });

  it('clamps zero quantity edge cases to 0 and leaves generated avg_cost as null', async () => {
    const client = new WacMockClient();

    await upsertWac(client, {
      orgId: ORG_ID,
      siteId: null,
      itemId: ITEM_ID,
      deltaQtyKg: '-5',
      deltaValue: '-20',
      updatedBy: USER_ID,
    });

    expect(client.row).toMatchObject({
      totalQtyKg: '0',
      totalValue: '0',
      avgCost: null,
    });
  });
});

describe('receivePoLineDesktop WAC integration', () => {
  beforeEach(() => {
    currentClient = new ReceiveMockClient();
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 5, 11));
    vi.spyOn(Math, 'random').mockReturnValue(0.1234);
  });

  it('calls upsertWac with received kg and PO line value after LP creation', async () => {
    const { receivePoLineDesktop } = await import(
      '../../../app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/receive-po-line'
    );

    const result = await receivePoLineDesktop({
      poLineId: LINE_ID,
      qty: '10.000',
      batchNumber: 'B-1',
      bestBefore: '2026-07-01',
    });

    expect(result).toMatchObject({ ok: true, lpId: 'lp-1' });
    const lpIndex = currentClient.calls.findIndex((call) => normalize(call.sql).startsWith('insert into public.license_plates'));
    const wacIndex = currentClient.calls.findIndex((call) => normalize(call.sql).startsWith('insert into public.item_wac_state'));
    expect(lpIndex).toBeGreaterThanOrEqual(0);
    expect(wacIndex).toBeGreaterThan(lpIndex);
    expect(currentClient.calls[wacIndex]?.params).toEqual([ORG_ID, ITEM_ID, '10', '42', USER_ID]);
  });
});

type MockCall = { sql: string; params?: readonly unknown[] };

class WacMockClient {
  calls: MockCall[] = [];
  row: { totalQtyKg: string; totalValue: string; avgCost: string | null } | null = null;

  async query<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []): Promise<{ rows: T[]; rowCount?: number | null }> {
    this.calls.push({ sql, params });
    const deltaQty = String(params[2]);
    const deltaValue = String(params[3]);

    if (!this.row) {
      const totalQtyKg = maxDecimal(deltaQty, '0');
      const totalValue = maxDecimal(deltaValue, '0');
      this.row = {
        totalQtyKg,
        totalValue,
        avgCost: compareDecimal(totalQtyKg, '0') > 0 ? divideDecimal(totalValue, totalQtyKg) : null,
      };
      return { rows: [], rowCount: 1 };
    }

    const totalQtyKg = maxDecimal(addDecimal(this.row.totalQtyKg, deltaQty), '0');
    const totalValue = maxDecimal(addDecimal(this.row.totalValue, deltaValue), '0');
    this.row = {
      totalQtyKg,
      totalValue,
      avgCost: compareDecimal(totalQtyKg, '0') > 0 ? divideDecimal(totalValue, totalQtyKg) : null,
    };
    return { rows: [], rowCount: 1 };
  }
}

class ReceiveMockClient implements QueryClient {
  calls: MockCall[] = [];

  async query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }> {
    this.calls.push({ sql, params });
    const normalized = normalize(sql);

    if (normalized.includes('from public.purchase_order_lines pol') && normalized.includes('for update of pol, po')) {
      return {
        rows: [
          {
            id: LINE_ID,
            org_id: ORG_ID,
            po_id: PO_ID,
            item_id: ITEM_ID,
            supplier_id: SUPPLIER_ID,
            destination_warehouse_id: null,
            line_no: 1,
            ordered_qty: '10.000000',
            uom: 'kg',
            unit_price: '4.20',
            received_qty: '0.000000',
            shelf_life_days: null,
            shelf_life_mode: null,
          },
        ] as T[],
      };
    }
    if (normalized.includes('from public.warehouses w')) {
      return { rows: [{ id: WAREHOUSE_ID, site_id: SITE_ID, default_location_id: LOCATION_ID }] as T[] };
    }
    if (normalized.includes('pg_advisory_xact_lock')) return { rows: [] };
    if (normalized.includes('from public.grns') && normalized.includes('status =')) return { rows: [] };
    if (normalized.includes("substring(grn_number from 'grn-")) return { rows: [{ seq: 1 }] as T[] };
    if (normalized.startsWith('insert into public.grns')) return { rows: [{ id: 'grn-1', grn_number: 'GRN-20260611-0001' }] as T[] };
    if (normalized.startsWith('insert into public.license_plates')) return { rows: [{ id: 'lp-1' }] as T[] };
    if (normalized.startsWith('select ($1::numeric * coalesce($2::numeric, 0))::text as value')) {
      return { rows: [{ value: multiplyDecimal(String(params?.[0] ?? '0'), String(params?.[1] ?? '0')) }] as T[] };
    }
    if (normalized.startsWith('insert into public.item_wac_state')) return { rows: [], rowCount: 1 };
    if (normalized.includes('max(line_number)')) return { rows: [{ line_number: 1 }] as T[] };
    if (normalized.startsWith('insert into public.grn_items')) return { rows: [{ id: 'grn-item-1' }] as T[] };
    if (normalized.startsWith('insert into public.lp_state_history')) return { rows: [] };
    if (normalized.startsWith('insert into public.outbox_events')) return { rows: [] };
    if (normalized.includes('from public.tenant_variations')) return { rows: [{ require_qc: false }] as T[] };
    if (normalized.includes('bool_and')) return { rows: [{ is_received: true }] as T[] };
    if (normalized.startsWith('update public.purchase_orders')) return { rows: [] };
    if (normalized.startsWith('update public.grns')) return { rows: [] };
    if (normalized.startsWith('insert into public.audit_events')) return { rows: [] };

    return { rows: [] };
  }
}

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function wacWriteColumns(sql: string): string {
  const match = normalize(sql).match(/insert into public\.item_wac_state \(([^)]+)\)/);
  return match?.[1] ?? '';
}

const SCALE = 1_000_000n;

function toFixed(value: string): bigint {
  const negative = value.startsWith('-');
  const body = negative ? value.slice(1) : value;
  const [integer = '0', fraction = ''] = body.split('.');
  const fixed = BigInt(integer || '0') * SCALE + BigInt((fraction + '000000').slice(0, 6));
  return negative ? -fixed : fixed;
}

function fromFixed(value: bigint): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const integer = abs / SCALE;
  const fraction = (abs % SCALE).toString().padStart(6, '0').replace(/0+$/, '');
  return `${negative && abs !== 0n ? '-' : ''}${integer}${fraction ? `.${fraction}` : ''}`;
}

function addDecimal(left: string, right: string): string {
  return fromFixed(toFixed(left) + toFixed(right));
}

function maxDecimal(left: string, right: string): string {
  return compareDecimal(left, right) >= 0 ? left : right;
}

function compareDecimal(left: string, right: string): number {
  const diff = toFixed(left) - toFixed(right);
  return diff > 0n ? 1 : diff < 0n ? -1 : 0;
}

function multiplyDecimal(left: string, right: string): string {
  return fromFixed((toFixed(left) * toFixed(right)) / SCALE);
}

function divideDecimal(left: string, right: string): string {
  return fromFixed((toFixed(left) * SCALE) / toFixed(right));
}
