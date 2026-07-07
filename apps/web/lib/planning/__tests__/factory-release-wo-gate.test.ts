import { describe, expect, it, vi } from 'vitest';

import {
  assertFgReleasedToFactoryForWo,
  FG_FACTORY_RELEASE_WO_GATE_SQL,
} from '../factory-release-wo-gate';

const PRODUCT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function makeClient(blocked: boolean, found = true) {
  return {
    query: vi.fn(async () => ({
      rows: found ? [{ item_id: PRODUCT_ID, blocked }] : [],
    })),
  };
}

describe('FG_FACTORY_RELEASE_WO_GATE_SQL', () => {
  it('blocks unreleased factory_release_status rows and NPD FGs without a released row', () => {
    expect(FG_FACTORY_RELEASE_WO_GATE_SQL).toContain('factory_release_status');
    expect(FG_FACTORY_RELEASE_WO_GATE_SQL).toContain('released_to_factory');
    expect(FG_FACTORY_RELEASE_WO_GATE_SQL).toContain('npd_project_id is not null');
  });
});

describe('assertFgReleasedToFactoryForWo', () => {
  it('allows released and grandfathered legacy items', async () => {
    const client = makeClient(false);
    await expect(assertFgReleasedToFactoryForWo(client, PRODUCT_ID)).resolves.toBe('ok');
  });

  it('blocks unreleased NPD FGs', async () => {
    const client = makeClient(true);
    await expect(assertFgReleasedToFactoryForWo(client, PRODUCT_ID)).resolves.toBe('not_released_to_factory');
  });

  it('returns invalid_input when the product id does not resolve', async () => {
    const client = makeClient(false, false);
    await expect(assertFgReleasedToFactoryForWo(client, PRODUCT_ID)).resolves.toBe('invalid_input');
  });

  it('documents grandfather rule: legacy items without an NPD project pass when blocked=false', async () => {
    const client = makeClient(false);
    await expect(assertFgReleasedToFactoryForWo(client, PRODUCT_ID)).resolves.toBe('ok');
    const sql = vi.mocked(client.query).mock.calls[0]?.[0] as string;
    expect(sql).toContain('npd_project_id is not null');
    expect(sql).toContain('released_to_factory');
  });
});
