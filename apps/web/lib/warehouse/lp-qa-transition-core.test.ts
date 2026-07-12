import { describe, expect, it, vi } from 'vitest';

import { applyLpQaLifecycleTransition } from './lp-qa-transition-core';
import type { QueryClient } from '../scanner/db';

const ORG_ID = '00000000-0000-4000-8000-00000000000a';
const USER_ID = '00000000-0000-4000-8000-0000000000aa';
const LP_ID = '00000000-0000-4000-8000-0000000000b1';

describe('applyLpQaLifecycleTransition (S14)', () => {
  it('promotes a received/pending LP to available/released with ledger history (v_inventory_available eligible)', async () => {
    const calls: Array<{ sql: string; params?: readonly unknown[] }> = [];
    const client = {
      query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
        calls.push({ sql, params });
        const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
        if (normalized.startsWith('update public.license_plates')) {
          return {
            rows: [{ id: LP_ID, lp_number: 'LP-1', status: 'available', qa_status: 'released' }],
          };
        }
        if (normalized.includes('from public.v_inventory_available')) {
          return { rows: [{ lp_id: LP_ID, available_qty: '10' }] };
        }
        return { rows: [] };
      }),
    } as unknown as QueryClient;

    const row = await applyLpQaLifecycleTransition(
      { client, userId: USER_ID, orgId: ORG_ID },
      {
        lpId: LP_ID,
        lpBefore: { id: LP_ID, lp_number: 'LP-1', status: 'received', qa_status: 'pending' },
        decision: 'released',
        mode: 'scanner',
      },
    );

    expect(row).toMatchObject({ status: 'available', qa_status: 'released' });
    const update = calls.find((call) => call.sql.toLowerCase().includes('update public.license_plates'));
    expect(update?.sql).toContain("when $2 = 'released' and status = 'received' then 'available'");
    const history = calls.find((call) => call.sql.toLowerCase().includes('insert into public.lp_state_history'));
    expect(history?.params?.[0]).toBe(LP_ID);
    expect(history?.params?.[1]).toBe('received');
    expect(history?.params?.[2]).toBe('available');
    expect(history?.sql).toContain("'qa_status_changed'");

    const inventory = await client.query(
      `select lp_id::text, available_qty::text
         from public.v_inventory_available
        where org_id = app.current_org_id()
          and lp_id = $1::uuid`,
      [LP_ID],
    );
    expect(inventory.rows[0]).toMatchObject({ lp_id: LP_ID });
  });
});
