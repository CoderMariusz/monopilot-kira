import { describe, expect, it } from 'vitest';

import type { QueryClient } from '../../_actions/procurement-shared';
import {
  ensureDestinationWarehouseForPoSite,
  warehouseMatchesPoSite,
} from './po-destination-warehouse';

const PO_SITE_ID = '88888888-8888-4888-8888-888888888888';
const OTHER_SITE_ID = '99999999-9999-4999-8999-999999999999';
const WAREHOUSE_ID = '77777777-7777-4777-8777-777777777777';

describe('warehouseMatchesPoSite', () => {
  it('accepts org-wide warehouses (site_id null)', () => {
    expect(warehouseMatchesPoSite(null, PO_SITE_ID)).toBe(true);
    expect(warehouseMatchesPoSite('', PO_SITE_ID)).toBe(true);
  });

  it('accepts warehouses on the PO site', () => {
    expect(warehouseMatchesPoSite(PO_SITE_ID, PO_SITE_ID)).toBe(true);
  });

  it('rejects warehouses on a different site', () => {
    expect(warehouseMatchesPoSite(OTHER_SITE_ID, PO_SITE_ID)).toBe(false);
  });
});

describe('ensureDestinationWarehouseForPoSite', () => {
  it('skips validation when no destination warehouse is supplied', async () => {
    const client = { query: async () => ({ rows: [] }) } as unknown as QueryClient;
    await expect(ensureDestinationWarehouseForPoSite(client, null, PO_SITE_ID)).resolves.toBe('ok');
  });

  it('rejects a destination warehouse from another site', async () => {
    const client = {
      query: async () => ({
        rows: [{ id: WAREHOUSE_ID, site_id: OTHER_SITE_ID }],
      }),
    } as unknown as QueryClient;

    await expect(ensureDestinationWarehouseForPoSite(client, WAREHOUSE_ID, PO_SITE_ID)).resolves.toBe(
      'warehouse_site_mismatch',
    );
  });

  it('accepts a destination warehouse on the PO site', async () => {
    const client = {
      query: async () => ({
        rows: [{ id: WAREHOUSE_ID, site_id: PO_SITE_ID }],
      }),
    } as unknown as QueryClient;

    await expect(ensureDestinationWarehouseForPoSite(client, WAREHOUSE_ID, PO_SITE_ID)).resolves.toBe('ok');
  });
});
