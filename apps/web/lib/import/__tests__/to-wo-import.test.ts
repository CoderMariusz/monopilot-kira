import { beforeEach, describe, expect, it, vi } from 'vitest';

import { previewToImport } from '../to-import-validator';
import { previewWoImport } from '../wo-import-validator';
import { withOrgContext } from '../../auth/with-org-context';

vi.mock('../../auth/with-org-context', () => ({
  withOrgContext: vi.fn(),
}));

const mockedWithOrgContext = vi.mocked(withOrgContext);

type QueryCall = { sql: string; params?: readonly unknown[] };

function fileFormData(csv: string): FormData {
  const formData = new FormData();
  formData.set('file', new File([csv], 'import.csv', { type: 'text/csv' }));
  return formData;
}

function installQueryMock(options: {
  warehouses?: Array<{ id: string; code: string }>;
  items?: Array<{
    id: string;
    code?: string;
    item_code?: string;
    uom_base?: string | null;
    uom_secondary?: string | null;
    output_uom?: string | null;
  }>;
  routings?: Array<{ id: string }>;
}): QueryCall[] {
  const calls: QueryCall[] = [];
  const client = {
    query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
      calls.push({ sql, params });
      const normalized = sql.toLowerCase().replace(/\s+/g, ' ');
      if (normalized.includes('from public.warehouses')) return { rows: options.warehouses ?? [] };
      if (normalized.includes('from public.items')) {
        return {
          rows: (options.items ?? []).map((item) => ({
            ...item,
            code: item.code ?? item.item_code,
            item_code: item.item_code ?? item.code,
          })),
        };
      }
      if (normalized.includes('from public.routings')) return { rows: options.routings ?? [] };
      return { rows: [] };
    }),
  };

  mockedWithOrgContext.mockImplementation(async (callback) =>
    callback({ userId: 'user-1', orgId: 'org-1', client } as never),
  );

  return calls;
}

describe('previewToImport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts a valid transfer order row', async () => {
    installQueryMock({
      warehouses: [
        { id: 'wh-from', code: 'WH-A' },
        { id: 'wh-to', code: 'WH-B' },
      ],
      items: [{ id: 'item-1', item_code: 'ITEM-1' }],
    });

    const result = await previewToImport(fileFormData('to_number,from_site,to_site,item_code,qty,uom\nTO-1,WH-A,WH-B,ITEM-1,12.5,kg'));

    expect(result.errors).toEqual([]);
    expect(result.valid).toMatchObject([
      {
        rowNumber: 1,
        toNumber: 'TO-1',
        fromSiteId: 'wh-from',
        toSiteId: 'wh-to',
        itemId: 'item-1',
        qty: '12.5',
        uom: 'kg',
      },
    ]);
  });

  it('returns a missing from_site error', async () => {
    installQueryMock({
      warehouses: [{ id: 'wh-to', code: 'WH-B' }],
      items: [{ id: 'item-1', item_code: 'ITEM-1' }],
    });

    const result = await previewToImport(fileFormData('to_number,from_site,to_site,item_code,qty,uom\nTO-1,,WH-B,ITEM-1,1,kg'));

    expect(result.valid).toEqual([]);
    expect(result.errors).toContainEqual({ rowNumber: 1, column: 'from_site', message: 'Source site is required.' });
  });

  it('returns a missing item_code error', async () => {
    installQueryMock({
      warehouses: [
        { id: 'wh-from', code: 'WH-A' },
        { id: 'wh-to', code: 'WH-B' },
      ],
    });

    const result = await previewToImport(fileFormData('to_number,from_site,to_site,item_code,qty,uom\nTO-1,WH-A,WH-B,,1,kg'));

    expect(result.valid).toEqual([]);
    expect(result.errors).toContainEqual({ rowNumber: 1, column: 'item_code', message: 'Item code is required.' });
  });

  it('returns an unknown item_code lookup error', async () => {
    installQueryMock({
      warehouses: [
        { id: 'wh-from', code: 'WH-A' },
        { id: 'wh-to', code: 'WH-B' },
      ],
      items: [],
    });

    const result = await previewToImport(fileFormData('to_number,from_site,to_site,item_code,qty,uom\nTO-1,WH-A,WH-B,NOPE,1,kg'));

    expect(result.valid).toEqual([]);
    expect(result.errors).toContainEqual({ rowNumber: 1, column: 'item_code', message: 'Item/product code "NOPE" was not found.' });
  });
});

describe('previewWoImport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts a valid work order row', async () => {
    installQueryMock({
      items: [{ id: 'fg-1', item_code: 'FG-1', uom_base: 'kg', uom_secondary: null, output_uom: 'base' }],
    });

    const result = await previewWoImport(fileFormData('wo_number,item_code,qty,uom\nWO-1,FG-1,10,kg'));

    expect(result.errors).toEqual([]);
    expect(result.valid).toMatchObject([
      {
        rowNumber: 1,
        woNumber: 'WO-1',
        itemCode: 'FG-1',
        itemId: 'fg-1',
        qty: '10',
        uom: 'kg',
      },
    ]);
  });

  it('returns a missing item_code error', async () => {
    installQueryMock({ items: [] });

    const result = await previewWoImport(fileFormData('wo_number,item_code,qty,uom\nWO-1,,10,kg'));

    expect(result.valid).toEqual([]);
    expect(result.errors).toContainEqual({ rowNumber: 1, column: 'item_code', message: 'Item code is required.' });
  });

  it('returns an invalid qty error', async () => {
    installQueryMock({
      items: [{ id: 'fg-1', item_code: 'FG-1', uom_base: 'kg', uom_secondary: null, output_uom: 'base' }],
    });

    const result = await previewWoImport(fileFormData('wo_number,item_code,qty,uom\nWO-1,FG-1,0,kg'));

    expect(result.valid).toEqual([]);
    expect(result.errors).toContainEqual({
      rowNumber: 1,
      column: 'qty',
      message: 'Quantity must be greater than 0 with at most 3 decimal places.',
    });
  });
});
