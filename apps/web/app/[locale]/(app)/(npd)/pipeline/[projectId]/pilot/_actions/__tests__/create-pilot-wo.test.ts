/**
 * NPD PILOT stage — createPilotWorkOrder unit tests.
 *
 * Mocks withOrgContext + createWorkOrder (canonical planning path). Asserts:
 * happy path, rejection when no linked FG, idempotency (second call returns
 * existing WO without a second insert).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

type Handler = (sql: string, params: readonly unknown[]) => { rows: unknown[] } | undefined;

const handlerHolder: { handler: Handler } = { handler: () => ({ rows: [] }) };

const { createWorkOrderMock } = vi.hoisted(() => ({
  createWorkOrderMock: vi.fn(),
}));

vi.mock('../../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: async (action: (ctx: unknown) => Promise<unknown>) =>
    action({
      userId: '07300000-0000-4000-8000-0000000000aa',
      orgId: '07300000-0000-4000-8000-00000000000a',
      sessionToken: 'tok',
      client: {
        query: async (sql: string, params: readonly unknown[] = []) =>
          handlerHolder.handler(sql, params) ?? { rows: [] },
      },
    }),
}));

vi.mock('../../../../../../../../../app/[locale]/(app)/(modules)/planning/work-orders/_actions/createWorkOrder', () => ({
  createWorkOrder: createWorkOrderMock,
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { createPilotWorkOrder } from '../create-pilot-wo';

const PROJECT = '07300000-0000-4000-8000-0000000000c1';
const ITEM_ID = '07300000-0000-4000-8000-0000000000f1';
const WO_ID = '07300000-0000-4000-8000-0000000000a1';
const PRODUCT_CODE = 'FG0042';

afterEach(() => {
  handlerHolder.handler = () => ({ rows: [] });
  createWorkOrderMock.mockReset();
  vi.clearAllMocks();
});

function permHandler(granted: string[], rest?: Handler): Handler {
  return (sql, params) => {
    if (/role_permissions/.test(sql) && /rp.permission = \$3/.test(sql)) {
      const perm = params[2] as string;
      return { rows: granted.includes(perm) ? [{ ok: true }] : [] };
    }
    return rest ? rest(sql, params) : { rows: [] };
  };
}

function seedHappyPath(rest?: Handler): Handler {
  return (sql, params) => {
    if (/from public.npd_projects/.test(sql)) {
      return { rows: [{ id: PROJECT, product_code: PRODUCT_CODE }] };
    }
    if (/from public.product/.test(sql) && /private_jsonb/.test(sql)) {
      return { rows: [{ private_jsonb: {} }] };
    }
    if (/from public.formulation_versions/.test(sql) && /locked/.test(sql)) {
      return { rows: [{ ok: true }] };
    }
    if (/from public.items/.test(sql) && /item_code/.test(sql)) {
      return { rows: [{ id: ITEM_ID, item_code: PRODUCT_CODE }] };
    }
    if (/from public.pilot_runs/.test(sql) && /batch_size_kg/.test(sql)) {
      return { rows: [{ batch_size_kg: '250.000' }] };
    }
    if (/update public.product/.test(sql) && /npd_project_pilot_wo_id/.test(sql)) {
      return { rows: [] };
    }
    if (/update public.work_orders/.test(sql) && /wo_number/.test(sql)) {
      return { rows: [] };
    }
    if (/from public.work_orders/.test(sql) && /id = \$1/.test(sql)) {
      return { rows: [{ id: WO_ID, wo_number: 'WO-202607-0007' }] };
    }
    if (/from public.work_orders/.test(sql) && /wo_number/.test(sql)) {
      return { rows: [] };
    }
    return rest ? rest(sql, params) : { rows: [] };
  };
}

describe('createPilotWorkOrder', () => {
  it('rejects when the project has no linked FG', async () => {
    handlerHolder.handler = permHandler(['npd.pilot.write'], (sql) => {
      if (/from public.npd_projects/.test(sql)) {
        return { rows: [{ id: PROJECT, product_code: null }] };
      }
      return { rows: [] };
    });

    const result = await createPilotWorkOrder({ projectId: PROJECT });
    expect(result).toEqual({ ok: false, error: 'no_linked_fg' });
    expect(createWorkOrderMock).not.toHaveBeenCalled();
  });

  it('creates a pilot WO on the happy path and renames it to WO-pilot-{FG}', async () => {
    handlerHolder.handler = permHandler(['npd.pilot.write'], seedHappyPath());
    createWorkOrderMock.mockResolvedValue({
      ok: true,
      workOrder: {
        id: WO_ID,
        woNumber: 'WO-202607-0007',
        productId: ITEM_ID,
        itemCode: PRODUCT_CODE,
        plannedQuantity: '250.000',
        producedQuantity: null,
        uom: 'kg',
        status: 'DRAFT',
        scheduledStartTime: null,
        scheduledEndTime: null,
        productionLineId: null,
        machineId: null,
        priority: null,
        sourceOfDemand: 'manual',
        sourceReference: PRODUCT_CODE,
        notes: null,
        createdAt: '2026-07-03T00:00:00.000Z',
        updatedAt: '2026-07-03T00:00:00.000Z',
        itemTypeAtCreation: 'fg',
      },
      materials: [],
      primarySchedule: {} as never,
    });

    const result = await createPilotWorkOrder({ projectId: PROJECT });
    expect(result).toEqual({
      ok: true,
      data: { id: WO_ID, woNumber: `WO-pilot-${PRODUCT_CODE}` },
      created: true,
    });
    expect(createWorkOrderMock).toHaveBeenCalledTimes(1);
    expect(createWorkOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: ITEM_ID,
        itemCode: PRODUCT_CODE,
        plannedQuantity: '250.000',
      }),
    );
  });

  it('returns the existing pilot WO on a second call (idempotent)', async () => {
    const linked = { id: WO_ID, wo_number: `WO-pilot-${PRODUCT_CODE}` };
    handlerHolder.handler = permHandler(['npd.pilot.write'], (sql) => {
      if (/from public.npd_projects/.test(sql)) {
        return { rows: [{ id: PROJECT, product_code: PRODUCT_CODE }] };
      }
      if (/from public.product/.test(sql)) {
        return { rows: [{ private_jsonb: { npd_project_pilot_wo_id: WO_ID } }] };
      }
      if (/from public.work_orders/.test(sql) && /id = \$1/.test(sql)) {
        return { rows: [linked] };
      }
      if (/update public.product/.test(sql)) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const first = await createPilotWorkOrder({ projectId: PROJECT });
    const second = await createPilotWorkOrder({ projectId: PROJECT });

    expect(first).toEqual({
      ok: true,
      data: { id: WO_ID, woNumber: `WO-pilot-${PRODUCT_CODE}` },
      created: false,
    });
    expect(second).toEqual({
      ok: true,
      data: { id: WO_ID, woNumber: `WO-pilot-${PRODUCT_CODE}` },
      created: false,
    });
    expect(createWorkOrderMock).not.toHaveBeenCalled();
  });
});
