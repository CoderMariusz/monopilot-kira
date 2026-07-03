import { beforeEach, describe, expect, it, vi } from 'vitest';

import { transferProjectFieldValuesToProduct } from '../_lib/gate-helpers';
import type { OrgContextLike } from '../shared';

const queryMock = vi.fn();

const projectId = '11111111-1111-4111-8111-111111111111';
const productCode = 'FG-001';

let projectJson: Record<string, unknown>;
let catalogKeys: string[];
let productColumns: string[];
let productValues: Record<string, unknown>;
let updates: Array<{ column: string; value: unknown }>;

function ctx(): OrgContextLike {
  return { userId: 'user-1', orgId: 'org-1', client: { query: queryMock } };
}

function wireQueries() {
  queryMock.mockImplementation(async (sql: string, params?: readonly unknown[]) => {
    const text = String(sql);
    if (/to_jsonb\(np\.\*\)\s+as\s+project_json/i.test(text)) {
      return { rows: [{ project_json: projectJson }] };
    }
    if (/from\s+public\.npd_field_catalog\s+f/i.test(text)) {
      return { rows: catalogKeys.map((column_key) => ({ column_key })) };
    }
    if (/information_schema\.columns/i.test(text) && /table_name\s*=\s*'product'/i.test(text)) {
      return { rows: productColumns.map((column_name) => ({ column_name })) };
    }
    if (/update\s+public\.product/i.test(text)) {
      const match = text.match(/set\s+"([^"]+)"/i);
      const column = match?.[1] ?? '';
      const current = productValues[column];
      if (current === null || current === undefined || current === '') {
        productValues[column] = params?.[1] ?? null;
        updates.push({ column, value: params?.[1] ?? null });
        return { rows: [{ product_code: productCode }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
    if (/sync_prod_detail_rows/i.test(text)) {
      updates.push({ column: 'sync_prod_detail_rows', value: params?.[0] });
      return { rows: [] };
    }
    return { rows: [] };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  projectJson = {
    name: 'Project FG',
    pack_size: '300g',
    field_values: {
      pack_size: '200g',
      case_format: 'CASE-12',
      recipe_components: 'RM-1\nRM-2',
    },
  };
  catalogKeys = ['product_name', 'pack_size', 'case_format', 'recipe_components'];
  productColumns = ['product_name', 'pack_size', 'case_format', 'recipe_components'];
  productValues = {
    product_name: 'Existing FG',
    pack_size: null,
    case_format: '',
    recipe_components: null,
  };
  updates = [];
  wireQueries();
});

describe('transferProjectFieldValuesToProduct', () => {
  it('fills empty product columns from project values, direct columns win, and recipe_components triggers sync', async () => {
    await transferProjectFieldValuesToProduct(ctx(), projectId, productCode);

    expect(updates).toContainEqual({ column: 'pack_size', value: '300g' });
    expect(updates).toContainEqual({ column: 'case_format', value: 'CASE-12' });
    expect(updates).toContainEqual({ column: 'recipe_components', value: 'RM-1\nRM-2' });
    expect(updates).toContainEqual({ column: 'sync_prod_detail_rows', value: productCode });
    expect(updates.some((update) => update.column === 'product_name')).toBe(false);
    expect(productValues.product_name).toBe('Existing FG');
  });

  it('does not clobber non-empty product values and skips non-product catalog fields', async () => {
    productValues.pack_size = '150g';
    catalogKeys.push('private_note');

    await transferProjectFieldValuesToProduct(ctx(), projectId, productCode);

    expect(updates.some((update) => update.column === 'pack_size')).toBe(false);
    expect(updates.some((update) => update.column === 'private_note')).toBe(false);
    expect(productValues.pack_size).toBe('150g');
  });
});
