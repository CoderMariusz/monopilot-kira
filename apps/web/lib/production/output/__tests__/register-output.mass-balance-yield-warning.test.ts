import { describe, expect, it } from 'vitest';

import { type OrgContextLike, type QueryClient } from '../../shared';
import { registerOutput } from '../register-output';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SITE_ID = '22222222-2222-4222-8222-222222222223';
const WO_ID = '33333333-3333-4333-8333-333333333333';
const PRODUCT_ID = '44444444-4444-4444-8444-444444444444';
const TX_ID = '55555555-5555-4555-8555-555555555555';

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

class MockClient implements QueryClient {
  outboxPayload: Record<string, unknown> | null = null;

  async query<T = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<{ rows: T[]; rowCount?: number | null }> {
    const normalized = normalize(sql);

    if (normalized.startsWith('with cfg as') && normalized.includes('massbalance_threshold_pct')) {
      const runningOutput = Number(params[1]);
      const warnPct = Number(params[2]);
      const postedConsumption = 1000;
      const yieldPct = 95;
      const yieldFactor = yieldPct / 100;
      return {
        rows: [
          {
            expected_input_kg: String(runningOutput / yieldFactor),
            posted_consumption_kg: String(postedConsumption),
            effective_yield_pct: String(yieldPct),
            block_pct: '0',
            warn: postedConsumption > 0 && runningOutput > postedConsumption * yieldFactor * (1 + warnPct),
            block: false,
          },
        ] as T[],
        rowCount: 1,
      };
    }

    if (normalized.includes('allowed_products')) {
      return { rows: [{ allowed: true }] as T[], rowCount: 1 };
    }

    if (normalized.includes('from public.work_orders')) {
      return { rows: [{ id: WO_ID, wo_number: 'WO-001', site_id: SITE_ID, uom: 'kg', uom_snapshot: null }] as T[], rowCount: 1 };
    }

    if (normalized.includes('from public.user_roles')) {
      return { rows: [{ ok: true }] as T[], rowCount: 1 };
    }

    if (normalized.includes('from public.items')) {
      return {
        rows: [
          {
            id: PRODUCT_ID,
            weight_mode: 'fixed',
            shelf_life_days: null,
            nominal_weight: null,
            variance_tolerance_pct: null,
          },
        ] as T[],
        rowCount: 1,
      };
    }

    if (normalized.includes('from public.wo_executions')) {
      return { rows: [{ status: 'in_progress' }] as T[], rowCount: 1 };
    }

    if (normalized.includes('from public.wo_outputs') && normalized.includes('count(*)::text as seq')) {
      return { rows: [{ seq: '0' }] as T[], rowCount: 1 };
    }

    if (normalized.startsWith('insert into public.wo_outputs')) {
      return {
        rows: [{ id: '66666666-6666-4666-8666-666666666666', lp_id: null, expiry_date: null }] as T[],
        rowCount: 1,
      };
    }

    if (normalized.includes('from public.warehouses')) {
      return {
        rows: [
          {
            id: '77777777-7777-4777-8777-777777777777',
            default_location_id: '88888888-8888-4888-8888-888888888888',
          },
        ] as T[],
        rowCount: 1,
      };
    }

    if (normalized.includes('from public.wo_material_consumption')) {
      return { rows: [] as T[], rowCount: 0 };
    }

    if (normalized.startsWith('insert into public.license_plates')) {
      return { rows: [{ id: '99999999-9999-4999-8999-999999999999' }] as T[], rowCount: 1 };
    }

    if (normalized.includes('from public.license_plates')) {
      return { rows: [{ site_id: SITE_ID, location_id: '88888888-8888-4888-8888-888888888888' }] as T[], rowCount: 1 };
    }

    if (normalized.startsWith('insert into public.stock_moves')) {
      return { rows: [] as T[], rowCount: 1 };
    }

    if (normalized.startsWith('insert into public.lp_state_history')) {
      return { rows: [] as T[], rowCount: 1 };
    }

    if (normalized.startsWith('select ($1::numeric * coalesce($2::numeric, 0))::text as value')) {
      return { rows: [{ value: '0' }] as T[], rowCount: 1 };
    }

    if (normalized.includes('insert into public.item_wac_state')) {
      return { rows: [{ totalQtyKg: '0', totalValue: '0', clamped: false }] as T[], rowCount: 1 };
    }

    if (normalized.startsWith('update public.wo_outputs')) {
      return { rows: [] as T[], rowCount: 1 };
    }

    if (normalized.startsWith('insert into public.outbox_events')) {
      this.outboxPayload = JSON.parse(String(params[3])) as Record<string, unknown>;
      return { rows: [] as T[], rowCount: 1 };
    }

    return { rows: [] as T[], rowCount: 0 };
  }
}

describe('registerOutput yield-based mass-balance warning', () => {
  it('warns when output exceeds expected yield even though output is below raw consumption', async () => {
    const client = new MockClient();
    const ctx: OrgContextLike = { userId: USER_ID, orgId: ORG_ID, siteId: SITE_ID, client };

    const result = await registerOutput(ctx, WO_ID, {
      transaction_id: TX_ID,
      output_type: 'primary',
      product_id: PRODUCT_ID,
      qty_kg: '970',
    });

    expect(result.mass_balance_warning).toEqual({
      expected_input_kg: String(970 / 0.95),
      posted_consumption_kg: '1000',
      effective_yield_pct: '95',
      warn_pct: 0.02,
    });
    expect(client.outboxPayload?.mass_balance_warning).toEqual(result.mass_balance_warning);
  });
});
