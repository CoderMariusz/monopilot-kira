/**
 * @vitest-environment jsdom
 *
 * B-6 — RoutingsManager honours the deep-linked item.
 *
 * The page half of this contract is covered in
 * ../../__tests__/routings-item-deeplink.page.test.tsx; this half proves the
 * manager actually acts on `initialItemId` instead of its old unconditional
 * `items[0]` default, including the case that made the bug dangerous: an
 * unresolvable deep link must select NOTHING rather than fall back to another
 * item and let "New routing" author against it.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const listRoutings = vi.fn();

vi.mock('../../_actions/list-routings', () => ({ listRoutings: (...a: unknown[]) => listRoutings(...a) }));
vi.mock('../../_actions/create-routing', () => ({ createRouting: vi.fn() }));
vi.mock('../../_actions/update-routing', () => ({ updateRouting: vi.fn() }));
vi.mock('../../_actions/approve-routing', () => ({ approveRouting: vi.fn(), publishRouting: vi.fn() }));
vi.mock('../../_actions/delete-routing', () => ({ deleteRouting: vi.fn() }));
vi.mock('../../_actions/cost-preview', () => ({ routingCostPreview: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { RoutingsManager } from '../routings-manager.client';
import type { RoutingItemOption } from '../../_actions/list-routing-items';

const ALPHA: RoutingItemOption = {
  id: '11111111-1111-1111-1111-111111111111',
  itemCode: 'AAA-FIRST-0001',
  name: 'Alphabetically first',
};
const TARGET: RoutingItemOption = {
  id: '22222222-2222-2222-2222-222222222222',
  itemCode: 'NIGHT-R06-FG-1138',
  name: 'Deep-linked item',
};

function renderManager(initialItemId?: string) {
  return render(
    <RoutingsManager
      items={[ALPHA, TARGET]}
      lines={[]}
      operationNames={[]}
      canWrite
      canApprove={false}
      {...(initialItemId === undefined ? {} : { initialItemId })}
    />,
  );
}

describe('RoutingsManager — initialItemId (B-6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listRoutings.mockResolvedValue({ ok: true, data: { routings: [] } });
  });

  afterEach(cleanup);

  it('loads the deep-linked item, not the first one in the list', async () => {
    renderManager(TARGET.id);

    await waitFor(() => expect(listRoutings).toHaveBeenCalledWith({ itemId: TARGET.id }));
    expect(listRoutings).not.toHaveBeenCalledWith({ itemId: ALPHA.id });
    expect(screen.getByRole('combobox', { name: 'Item' })).toHaveTextContent(TARGET.itemCode);
  });

  it('selects nothing — and offers no create affordance — when the deep link did not resolve', async () => {
    renderManager('');

    expect(screen.getByText('Select an item to view its routings.')).toBeInTheDocument();
    // The dangerous half: with no item resolved there must be no way to create a
    // routing that would silently land on someone else's item.
    expect(screen.queryByRole('button', { name: '+ New routing' })).not.toBeInTheDocument();
    await waitFor(() => expect(listRoutings).not.toHaveBeenCalled());
  });

  it('keeps the first-item default when no deep link was supplied (anti-regression)', async () => {
    renderManager();

    await waitFor(() => expect(listRoutings).toHaveBeenCalledWith({ itemId: ALPHA.id }));
    expect(screen.getByRole('button', { name: '+ New routing' })).toBeInTheDocument();
  });
});
