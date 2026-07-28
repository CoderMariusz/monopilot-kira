/**
 * @vitest-environment jsdom
 *
 * B-6 — the item-detail "+ New routing" CTA passes `?item=<item_code>`.
 *
 * This suite exists because the previous round asserted the deep link only from
 * the SOURCE side (a hand-written <a> in an RTL fixture) and never checked that
 * anything reads the parameter. Nothing did: this page took no searchParams and
 * RoutingsManager always opened on items[0], so the CTA quietly offered to
 * author a routing for whichever item sorts first alphabetically.
 *
 * These tests drive the real page function and assert what reaches the manager.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const listRoutingItems = vi.fn();

vi.mock('../_actions/list-routing-items', () => ({
  listRoutingItems: (...args: unknown[]) => listRoutingItems(...args),
}));

// Stand-in for the manager: surfaces the props under test as DOM attributes.
// `initialItemId` is deliberately reported as the literal string 'undefined'
// when absent so "no deep link" and "unresolvable deep link" stay tellable apart.
vi.mock('../_components/routings-manager.client', () => ({
  RoutingsManager: ({ initialItemId }: { initialItemId?: string }) => (
    <div
      data-testid="routings-manager"
      data-initial-item-id={initialItemId === undefined ? 'undefined' : initialItemId}
    />
  ),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => {
    const t = (key: string) => key;
    (t as { has: (key: string) => boolean }).has = () => false;
    return t;
  }),
}));

const ALPHA = { id: 'id-alpha', itemCode: 'AAA-FIRST-0001', name: 'Alphabetically first' };
const TARGET = { id: 'id-target', itemCode: 'NIGHT-R06-FG-1138', name: 'The item the operator came from' };

function readyResult(items = [ALPHA, TARGET]) {
  return { items, lines: [], operationNames: [], canWrite: true, canApprove: false, state: 'ready' as const };
}

async function renderPage(searchParams?: Record<string, string | string[] | undefined>) {
  const pageModule = await import('../page');
  const element = await pageModule.default({
    params: Promise.resolve({ locale: 'pl' }),
    ...(searchParams ? { searchParams: Promise.resolve(searchParams) } : {}),
  });
  render(element as React.ReactElement);
  return screen.getByTestId('routings-manager');
}

describe('technical/routings page — ?item= deep link (B-6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    listRoutingItems.mockResolvedValue(readyResult());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('opens on the item named by ?item=, not on the alphabetically first one', async () => {
    const manager = await renderPage({ item: TARGET.itemCode });

    expect(manager).toHaveAttribute('data-initial-item-id', TARGET.id);
    // The precise regression: the first item must NOT win.
    expect(manager).not.toHaveAttribute('data-initial-item-id', ALPHA.id);
  });

  it('asks the loader to pin the deep-linked code so an item past the row cap is still selectable', async () => {
    await renderPage({ item: TARGET.itemCode });

    // Without this argument the picker is capped at the first N item_codes and an
    // org past the cap could not select the very item the CTA came from.
    expect(listRoutingItems).toHaveBeenCalledWith(TARGET.itemCode);
  });

  it('selects NOTHING when ?item= names an item that does not resolve', async () => {
    const manager = await renderPage({ item: 'GHOST-DOES-NOT-EXIST' });

    // '' (not undefined, not items[0]) — the manager then shows its "pick an item"
    // prompt and hides "New routing", instead of silently targeting another item.
    expect(manager).toHaveAttribute('data-initial-item-id', '');
  });

  it('leaves the default first-item selection alone when no ?item= is supplied', async () => {
    const manager = await renderPage({});

    expect(manager).toHaveAttribute('data-initial-item-id', 'undefined');
    expect(listRoutingItems).toHaveBeenCalledWith(undefined);
  });

  it('still renders when the page is reached with no searchParams at all', async () => {
    const manager = await renderPage();

    expect(manager).toHaveAttribute('data-initial-item-id', 'undefined');
  });

  it('takes the first value when ?item= is repeated', async () => {
    const manager = await renderPage({ item: [TARGET.itemCode, ALPHA.itemCode] });

    expect(manager).toHaveAttribute('data-initial-item-id', TARGET.id);
  });
});
