/**
 * PF-R06-02 — Shelf life provenance in the FactorySpec Review + authoring modals.
 *
 * `shelf_life_days` is NOT a factory_specs column: list-factory-specs.ts reads it off
 * the joined FG item master (`join public.items i on i.id = fs.fg_item_id`). The bug was
 * not a missing form field — it was a Review document that printed someone else's value
 * with no attribution, and a mute `—` when that value was absent. The fix makes the
 * provenance explicit and routes the author to the FG item master instead of duplicating
 * the column (which would drift on the first item edit).
 *
 * Asserts:
 *   - a present shelf life is labelled as INHERITED and names the FG item code;
 *   - an absent shelf life is NAMED ("Not set on FG item …"), never a bare em dash;
 *   - both cases expose a route to the FG item master at the locale-correct href;
 *   - the authoring (Edit) modal states that shelf life lives on the item, with the
 *     same route — this is the affordance the reporter went looking for and did not find.
 *
 * next-intl resolves to the real EN bundle via test-setup.ui.ts; the transitive
 * release-bundle / lifecycle Server Actions are stubbed (own suites cover them).
 * next/link is stubbed to a plain anchor — the established jsdom accommodation in this
 * repo (10+ suites do the same); href assertions are unaffected.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FactorySpecListItem } from '../../_actions/shared';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href, ...rest }, children),
}));

// Transitive deps of the row-actions tree — stubbed so the island renders in isolation.
vi.mock('../../_actions/recall-spec', () => ({ recallFactorySpec: vi.fn() }));
vi.mock('../../_actions/bundle-data', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../_actions/bundle-data');
  return { ...actual, loadReleaseBundle: vi.fn() };
});
vi.mock('../../../../../../../../actions/technical/release-bundles/approve-bundle', () => ({
  approveReleaseBundleAction: vi.fn(),
}));
vi.mock('../../../../../../../../actions/technical/release-bundles/reject-bundle', () => ({
  rejectReleaseBundleAction: vi.fn(),
}));
vi.mock('../../actions/create-factory-spec', () => ({ createFactorySpec: vi.fn() }));
vi.mock('../../actions/factory-spec-flow', () => ({
  submitFactorySpecForReview: vi.fn(),
  linkFactorySpecBom: vi.fn(),
}));
vi.mock('../../actions/factory-spec-lifecycle', () => ({
  updateFactorySpec: vi.fn(),
  deleteFactorySpec: vi.fn(),
  saveFactorySpecVersion: vi.fn(),
}));
vi.mock('../../../../../../../(npd)/fa/actions/search-items', () => ({ searchItems: vi.fn() }));
vi.mock('../../../../../(npd)/_components/item-picker', () => ({
  ItemPicker: ({ labels }: { labels: { trigger: string } }) =>
    React.createElement('button', { type: 'button', 'data-testid': 'item-picker-trigger' }, labels.trigger),
}));

const { FactorySpecRowActions } = await import('../review-modal.client');

/** The href the (server) list page builds — locale-prefixed, item_code-addressed. */
const FG_ITEM_HREF = '/pl/technical/items/FG5101';

const baseSpec: FactorySpecListItem = {
  id: 'spec-1',
  specCode: 'FS-FG5101',
  version: 3,
  status: 'in_review',
  source: 'technical',
  fgItemId: 'fg-1',
  fgItemCode: 'FG5101',
  fgName: 'Kielbasa slaska 450g',
  productGroup: 'Deli',
  shelfLifeDays: 21,
  bomHeaderId: 'bom-1',
  bomVersion: 8,
  bomStatus: 'in_review',
  d365ItemId: null,
  fgNpdProjectId: null,
  // Non-empty so the only `—` that could appear in the summary is the shelf-life one.
  notes: 'Shelf-life review notes',
  updatedAt: '2026-04-30T11:22:00.000Z',
};

function renderRow(spec: FactorySpecListItem) {
  return render(
    React.createElement(FactorySpecRowActions, {
      spec,
      canApprove: true,
      reviewLabel: 'Review',
      fgItemHref: FG_ITEM_HREF,
    }),
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('PF-R06-02 — Review states where shelf life comes from', () => {
  it('labels a present shelf life as inherited from the named FG item and links to it', () => {
    renderRow(baseSpec);
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));

    const dialog = screen.getByRole('dialog');
    // The value itself is unchanged...
    expect(within(dialog).getByTestId('factory-spec-shelf-life-spec-1')).toHaveTextContent('21 d');
    // ...but the reviewer is now told it is the ITEM's value, not the specification's.
    expect(within(dialog).getByText(/Inherited from FG item FG5101/)).toBeInTheDocument();

    const link = within(dialog).getByTestId('factory-spec-fg-item-link-spec-1');
    expect(link).toHaveTextContent('Open FG item');
    expect(link).toHaveAttribute('href', FG_ITEM_HREF);
  });

  it('names a missing shelf life as a gap on the FG item instead of a bare em dash', () => {
    renderRow({ ...baseSpec, shelfLifeDays: null });
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByTestId('factory-spec-shelf-life-spec-1')).toHaveTextContent(
      'Not set on FG item FG5101',
    );
    // The regression this replaces: a mute `—` that read as "nobody filled the form in".
    expect(within(dialog).queryByText('—')).not.toBeInTheDocument();
    // Provenance + the route to fix it are still offered when the value is absent.
    expect(within(dialog).getByText(/Inherited from FG item FG5101/)).toBeInTheDocument();
    expect(within(dialog).getByTestId('factory-spec-fg-item-link-spec-1')).toHaveAttribute(
      'href',
      FG_ITEM_HREF,
    );
  });
});

describe('PF-R06-02 — authoring has a route to the field it cannot set', () => {
  it('tells the Edit modal author that shelf life lives on the FG item, and links there', () => {
    renderRow(baseSpec);
    fireEvent.click(screen.getByTestId('factory-spec-edit-spec-1'));

    expect(screen.getByTestId('edit-spec-shelf-life-hint-spec-1')).toHaveTextContent(
      'Shelf life is not a specification field',
    );
    expect(screen.getByTestId('edit-spec-shelf-life-hint-spec-1')).toHaveTextContent('FG5101');

    const link = screen.getByTestId('edit-spec-fg-item-link-spec-1');
    expect(link).toHaveTextContent('Open FG item');
    expect(link).toHaveAttribute('href', FG_ITEM_HREF);
  });
});
