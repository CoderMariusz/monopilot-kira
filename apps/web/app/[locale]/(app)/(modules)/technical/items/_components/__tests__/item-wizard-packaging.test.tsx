/**
 * @vitest-environment jsdom
 *
 * TAXONOMY lane — Item Create Wizard: packaging type option + the wizard-only
 * "= WIP (work in progress)" helper under the Intermediate type.
 *
 * Prototype source (literal anchor, file length verified with
 *   `wc -l "prototypes/design/Monopilot Design System/technical/modals.jsx"` = 656):
 *   prototypes/design/Monopilot Design System/technical/modals.jsx:22-136
 *   (ProductCreateModal — Stepper + per-step Field grid; the classification step
 *   carries the item-type select).
 *
 * Asserts:
 *   - The item-type Select offers a 'packaging' option (ITEM_TYPE_LABELS map).
 *   - The "= WIP (work in progress)" helper shows ONLY when Intermediate is the
 *     selected type, and not for rm / packaging.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('../../_actions/create-item', () => ({ createItem: vi.fn() }));
vi.mock('../../_actions/update-item', () => ({ updateItem: vi.fn() }));

import {
  ItemWizard,
  DEFAULT_WIZARD_LABELS,
  emptyWizardForm,
} from '../item-create-wizard';

const L = DEFAULT_WIZARD_LABELS;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** Open the wizard pre-seeded onto the classification step at a given type. */
function renderOnClassification(itemType: 'rm' | 'intermediate' | 'packaging') {
  render(
    <ItemWizard
      open
      onClose={vi.fn()}
      mode={{ kind: 'create' }}
      initialForm={{ ...emptyWizardForm(), itemCode: 'X-1', name: 'X', itemType }}
    />,
  );
}

async function gotoClassification(user: ReturnType<typeof userEvent.setup>) {
  // basic step is valid via initialForm; advance once to classification.
  await user.click(screen.getByRole('button', { name: L.next }));
}

describe('ItemWizard — packaging option + WIP helper', () => {
  it('offers a Packaging item-type option', async () => {
    const user = userEvent.setup();
    renderOnClassification('rm');
    await gotoClassification(user);
    const typeSelect = screen.getByRole('combobox', { name: L.fields.itemType });
    await user.click(typeSelect);
    expect(
      screen.getByRole('option', { name: 'Packaging' }),
    ).toBeInTheDocument();
  });

  it('shows "= WIP (work in progress)" only for the Intermediate type', async () => {
    const user = userEvent.setup();
    renderOnClassification('intermediate');
    await gotoClassification(user);
    expect(screen.getByText(L.intermediateHint)).toBeInTheDocument();
  });

  it('does not show the WIP helper for rm or packaging', async () => {
    const user = userEvent.setup();
    renderOnClassification('rm');
    await gotoClassification(user);
    expect(screen.queryByText(L.intermediateHint)).not.toBeInTheDocument();
    cleanup();

    renderOnClassification('packaging');
    await gotoClassification(user);
    expect(screen.queryByText(L.intermediateHint)).not.toBeInTheDocument();
  });
});
