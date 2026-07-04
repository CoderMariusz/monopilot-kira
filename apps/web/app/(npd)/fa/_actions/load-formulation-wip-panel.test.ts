import { afterEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();

vi.mock('../../../../lib/auth/with-org-context', () => ({
  withOrgContext: <T,>(fn: (ctx: unknown) => Promise<T>) =>
    fn({
      userId: '11111111-1111-4111-8111-111111111111',
      orgId: '22222222-2222-4222-8222-222222222222',
      client: { query: queryMock },
    }),
}));

vi.mock('../../../../lib/auth/has-permission', () => ({
  hasPermission: vi.fn(async () => true),
}));

vi.mock('../actions/get-component-processes', () => ({
  getComponentProcesses: vi.fn(async () => ({ ok: true, data: [] })),
}));

vi.mock('../../../../actions/reference/manufacturing-ops/list', () => ({
  listManufacturingOperations: vi.fn(async () => ({ ok: true, data: [] })),
}));

vi.mock('../../../[locale]/(app)/(admin)/settings/process-defaults/_actions/process-defaults-actions', () => ({
  getProcessDefault: vi.fn(),
}));

vi.mock('../actions/wip-process-actions', () => ({
  addWipProcess: vi.fn(),
  removeWipProcess: vi.fn(),
  saveWipProcessRoles: vi.fn(),
  updateWipProcess: vi.fn(),
}));

import { loadFormulationWipPanel } from './load-formulation-wip-panel';

const PROJECT_ID = '33333333-3333-4333-8333-333333333333';
const PROD_DETAIL_ID = '44444444-4444-4444-8444-444444444444';

afterEach(() => {
  queryMock.mockReset();
  vi.clearAllMocks();
});

describe('loadFormulationWipPanel', () => {
  it('rehydrates saved production scalars from product when prod_detail is not populated', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (/from public\.npd_projects/.test(text)) {
        return { rows: [{ product_code: 'FG-NPD-042' }] };
      }
      if (/from public\.npd_departments/.test(text) && /lower\(\$1::text\)/.test(text)) {
        return {
          rows: [
            {
              physical_column: 'line',
              column_key: 'Line',
              field_type: null,
              data_type: 'text',
              required_for_done: true,
              dropdown_source: null,
              blocking_rule: null,
              display_order: 1,
              is_auto: false,
              auto_source_field: null,
            },
            {
              physical_column: 'staffing',
              column_key: 'Staffing',
              field_type: null,
              data_type: 'text',
              required_for_done: true,
              dropdown_source: null,
              blocking_rule: null,
              display_order: 2,
              is_auto: false,
              auto_source_field: null,
            },
            {
              physical_column: 'rate',
              column_key: 'Rate',
              field_type: null,
              data_type: 'number',
              required_for_done: true,
              dropdown_source: null,
              blocking_rule: null,
              display_order: 3,
              is_auto: false,
              auto_source_field: null,
            },
          ],
        };
      }
      if (/select to_jsonb\(p\.\*\) as product_json/.test(text)) {
        return {
          rows: [{
            product_json: {
              product_code: 'FG-NPD-042',
              line: 'LINE-7',
              staffing: '2 operators',
              rate: '120.5000',
              closed_production: 'Yes',
            },
          }],
        };
      }
      if (/select to_jsonb\(pd\.\*\) as pd_json/.test(text)) {
        return {
          rows: [{
            pd_json: {
              id: PROD_DETAIL_ID,
              product_code: 'FG-NPD-042',
              component_index: 1,
              intermediate_code: 'RM-1',
              component_weight: '1.25',
              line: null,
              staffing: null,
              rate: null,
            },
          }],
        };
      }
      if (/from public\.formulations/.test(text) && /count\(fi\.id\)/.test(text)) {
        return { rows: [{ ingredient_count: '1' }] };
      }
      return { rows: [] };
    });

    const result = await loadFormulationWipPanel(PROJECT_ID);

    expect(result.state).toBe('ready');
    if (result.state !== 'ready') return;
    expect(result.rows[0]?.values).toMatchObject({
      line: 'LINE-7',
      staffing: '2 operators',
      rate: '120.5000',
      closed_production: 'Yes',
    });
  });
});
