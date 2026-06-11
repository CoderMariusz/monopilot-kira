import { describe, expect, it, vi } from 'vitest';

import {
  ReceivePoError,
  receiveScannerPoLine,
  type ReceiveLineInput,
} from './receive-po';
import type { QueryClient } from '../../scanner/db';
import type { ScannerSessionRow } from '../../scanner/session';

const ORG_A = '00000000-0000-4000-8000-00000000000a';
const USER_A = '00000000-0000-4000-8000-0000000000aa';
const SESSION_ID = '00000000-0000-4000-8000-0000000000ab';
const PO_ID = '00000000-0000-4000-8000-0000000000p0'.replace('p', 'a');
const LINE_ID = '00000000-0000-4000-8000-0000000000b1';
const ITEM_ID = '00000000-0000-4000-8000-0000000000c1';
const SUPPLIER_ID = '00000000-0000-4000-8000-0000000000d1';
const WAREHOUSE_ID = '00000000-0000-4000-8000-0000000000e1';
const LOCATION_ID = '00000000-0000-4000-8000-0000000000f1';

const session: ScannerSessionRow = {
  id: SESSION_ID,
  org_id: ORG_A,
  user_id: USER_A,
  device_id: null,
  site_id: null,
  line_id: null,
  shift: null,
  mode: 'personal',
  session_token_hash: 'hash',
  expires_at: new Date(),
  ended_at: null,
  created_at: new Date(),
  last_seen_at: new Date(),
};

const input: ReceiveLineInput = {
  clientOpId: 'op-1',
  poLineId: LINE_ID,
  qty: '10.500',
  batchNumber: 'B-1',
  bestBefore: '2026-07-01',
};

describe('scanner receive PO service', () => {
  it('creates a GRN, GRN item, LP, LP genesis history, audit row, and rolls PO status up', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1790000000000);
    vi.spyOn(Math, 'random').mockReturnValue(0.1234);
    const client = makeReceiveClient({ orderedQty: '10.000000', receivedQty: '0.000000', isReceived: true });

    const result = await receiveScannerPoLine(client, session, input);

    expect(result).toMatchObject({
      ok: true,
      grnId: 'grn-1',
      grnNumber: 'GRN-20260611-0001',
      grnItemId: 'grn-item-1',
      lpId: 'lp-1',
      qty: '10.5',
      uom: 'kg',
      overReceived: true,
      poStatus: 'received',
    });
    expect(client.statements).toContain('begin');
    expect(client.statements).toContain('commit');
    expect(findCall(client, 'insert into public.license_plates')?.params).toEqual(
      expect.arrayContaining([ORG_A, WAREHOUSE_ID, ITEM_ID, '10.5', 'kg', 'B-1', '2026-07-01', LOCATION_ID]),
    );
    expect(findCall(client, 'insert into public.grn_items')?.params).toEqual(
      expect.arrayContaining([ORG_A, 'grn-1', ITEM_ID, LINE_ID, '10.000000', '10.5', 'kg', 'B-1', '2026-07-01']),
    );
    expect(findCall(client, 'insert into public.lp_state_history')).toBeTruthy();
    expect(findCall(client, 'update public.purchase_orders')?.params).toEqual([ORG_A, PO_ID, 'received', USER_A]);
    expect(auditExt(client)).toMatchObject({ poLineId: LINE_ID, lpId: 'lp-1', qty: '10.5', overReceived: true });
  });

  it('replays an existing client operation without double receiving', async () => {
    const client = makeReceiveClient({
      replayExt: {
        grnId: 'grn-1',
        grnNumber: 'GRN-20260611-0001',
        grnItemId: 'grn-item-1',
        lpId: 'lp-1',
        lpNumber: 'LP-1',
        qty: '2.5',
        uom: 'kg',
        overReceived: false,
        poStatus: 'partially_received',
      },
    });

    const result = await receiveScannerPoLine(client, session, { ...input, clientOpId: 'op-replay', qty: '2.5' });

    expect(result).toMatchObject({ ok: true, replay: true, lpNumber: 'LP-1', qty: '2.5' });
    expect(client.calls.some((call) => call.sql.includes('insert into public.grn_items'))).toBe(false);
    expect(client.statements).not.toContain('begin');
  });

  it('rejects over-receipt beyond the 10 percent cap', async () => {
    const client = makeReceiveClient({ orderedQty: '10.000000', receivedQty: '10.000000' });

    await expect(receiveScannerPoLine(client, session, { ...input, qty: '1.100001' })).rejects.toMatchObject({
      code: 'over_receive_cap',
      status: 409,
    } satisfies Partial<ReceivePoError>);

    expect(client.statements).toContain('commit');
    expect(client.calls.some((call) => call.sql.includes('insert into public.license_plates'))).toBe(false);
    expect(auditResult(client)).toBe('over_receive_cap');
  });

  it('rejects cross-org PO lines because every lookup is filtered by session.org_id', async () => {
    const client = makeReceiveClient({ lineMissing: true });

    await expect(receiveScannerPoLine(client, session, input)).rejects.toMatchObject({
      code: 'po_line_not_found',
      status: 404,
    } satisfies Partial<ReceivePoError>);

    const lineLookup = findCall(client, 'from public.purchase_order_lines pol');
    expect(lineLookup?.params[0]).toBe(ORG_A);
    expect(client.calls.some((call) => call.sql.includes('insert into public.license_plates'))).toBe(false);
    expect(auditResult(client)).toBe('not_found');
  });
});

type FakeClient = QueryClient & {
  calls: Array<{ sql: string; params: readonly unknown[] }>;
  statements: string[];
};

function makeReceiveClient(options: {
  orderedQty?: string;
  receivedQty?: string;
  isReceived?: boolean;
  lineMissing?: boolean;
  replayExt?: Record<string, unknown>;
}): FakeClient {
  const calls: FakeClient['calls'] = [];
  const statements: string[] = [];
  return {
    calls,
    statements,
    async query<T = unknown>(sql: string, params: readonly unknown[] = []) {
      const normalized = sql.trim().replace(/\s+/g, ' ');
      calls.push({ sql: normalized, params });
      if (['begin', 'commit', 'rollback'].includes(normalized)) {
        statements.push(normalized);
        return { rows: [] as T[], rowCount: null };
      }
      if (normalized.includes('from public.scanner_audit_log') && normalized.includes('client_op_id')) {
        return {
          rows: options.replayExt ? ([{ result_code: 'ok', ext: options.replayExt }] as T[]) : ([] as T[]),
          rowCount: options.replayExt ? 1 : 0,
        };
      }
      if (normalized.includes('bool_and(coalesce(rec.received_qty')) {
        return { rows: [{ is_received: options.isReceived ?? false }] as T[], rowCount: 1 };
      }
      if (normalized.includes('from public.purchase_order_lines pol')) {
        return {
          rows: options.lineMissing
            ? ([] as T[])
            : ([
                {
                  id: LINE_ID,
                  org_id: ORG_A,
                  po_id: PO_ID,
                  item_id: ITEM_ID,
                  supplier_id: SUPPLIER_ID,
                  line_no: 1,
                  ordered_qty: options.orderedQty ?? '10.000000',
                  uom: 'kg',
                  received_qty: options.receivedQty ?? '0.000000',
                },
              ] as T[]),
          rowCount: options.lineMissing ? 0 : 1,
        };
      }
      if (normalized.includes('from public.warehouses w')) {
        return { rows: [{ id: WAREHOUSE_ID, default_location_id: LOCATION_ID }] as T[], rowCount: 1 };
      }
      if (normalized.includes('from public.grns') && normalized.includes('status =')) {
        return { rows: [] as T[], rowCount: 0 };
      }
      if (normalized.includes("substring(grn_number from 'GRN-")) {
        return { rows: [{ seq: 1 }] as T[], rowCount: 1 };
      }
      if (normalized.includes('insert into public.grns')) {
        return { rows: [{ id: 'grn-1', grn_number: 'GRN-20260611-0001' }] as T[], rowCount: 1 };
      }
      if (normalized.includes('coalesce(max(line_number)')) {
        return { rows: [{ line_number: 1 }] as T[], rowCount: 1 };
      }
      if (normalized.includes('insert into public.license_plates')) {
        return { rows: [{ id: 'lp-1' }] as T[], rowCount: 1 };
      }
      if (normalized.includes('insert into public.grn_items')) {
        return { rows: [{ id: 'grn-item-1' }] as T[], rowCount: 1 };
      }
      return { rows: [] as T[], rowCount: 1 };
    },
  };
}

function findCall(client: FakeClient, fragment: string) {
  return client.calls.find((call) => call.sql.includes(fragment));
}

function auditResult(client: FakeClient): unknown {
  return findCall(client, 'insert into public.scanner_audit_log')?.params[4];
}

function auditExt(client: FakeClient): Record<string, unknown> {
  const raw = findCall(client, 'insert into public.scanner_audit_log')?.params[6];
  return JSON.parse(String(raw)) as Record<string, unknown>;
}
