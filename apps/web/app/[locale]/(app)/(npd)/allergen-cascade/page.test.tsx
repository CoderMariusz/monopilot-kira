/**
 * @vitest-environment jsdom
 *
 * Top-level NPD Allergen cascade screen — page wiring + FG selector + states.
 *
 * Exercises the test-only injection seam (fgList / allergenLoad props) so the suite
 * asserts the wiring + the FG selector navigation + the page-level UI states + the
 * reused T-040 cascade widget WITHOUT a live pg pool — no fixtures replace production
 * data, only the transport boundary (the live route reads public.product +
 * public.fa_allergen_cascade as app_user under RLS).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/allergen-screens.jsx:5-145
 *   (AllergenCascade)
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { renderToString } from 'react-dom/server';
import { cleanup, render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const replace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => '/en/allergen-cascade',
  useSearchParams: () => new URLSearchParams(''),
}));

import AllergenCascadePage, { CascadeBody, type FgListResult } from './page';
import type { AllergenLoad } from '../../../../(npd)/fa/[productCode]/_lib/allergen-cascade';

afterEach(() => cleanup());
beforeEach(() => replace.mockClear());

const FG_LIST: FgListResult = {
  state: 'ready',
  fgs: [
    { value: 'FG-001', label: 'FG-001 — Tomato Soup' },
    { value: 'FG-002', label: 'FG-002 — Beef Stew' },
  ],
};

const READY_LOAD: AllergenLoad = {
  state: 'ready',
  data: {
    productCode: 'FG-001',
    derivedAllergens: ['gluten', 'milk'],
    publishedAllergens: ['gluten', 'soybeans'],
    mayContainAllergens: ['nuts'],
    conditionalProcessAllergens: ['nuts'],
  },
  canWrite: true,
  displayNames: {},
};

const ACCEPTED_AT = '2026-06-15T12:34:56.000Z';
const ACCEPTED_AT_CLIENT = new Date(ACCEPTED_AT).toLocaleDateString();

const ACCEPTED_DECLARATION_LOAD: AllergenLoad = {
  ...READY_LOAD,
  data: {
    ...READY_LOAD.data!,
    declarationAccepted: true,
    declarationAcceptedBy: 'Ada Lovelace',
    declarationAcceptedAt: ACCEPTED_AT,
  },
};

async function buildBodyElement(props: {
  fgList: FgListResult;
  allergenLoad?: AllergenLoad;
  requestedFg?: string;
}): Promise<React.ReactElement> {
  const labels = {
    title: 'Allergen cascade preview',
    subtitle: 'Visual trace RM → process → FG',
    breadcrumb: 'NPD / Allergen cascade',
    selectorLabel: 'Finished Good',
    selectorPlaceholder: 'Select a Finished Good…',
    emptyTitle: 'No Finished Goods yet',
    emptyBody: 'Create an FG to see its allergen declaration here.',
    error: 'Unable to load Finished Goods.',
    loading: 'Loading allergen cascade…',
  };
  // Minimal allergen labels: the reused widget falls back to its own defaults for
  // any key not provided; the page just needs the wiring to render.
  const allergenLabels = {
    declarationTitle: 'Declaration sign-off',
    declarationDescription: 'Published FG declaration',
    declarationAcceptLabel: 'Accept declaration',
    declarationAcceptedBadge: 'Declaration accepted',
    declarationNotAccepted: 'Declaration not accepted',
    declarationAcceptedBy: 'by {name} on {date}',
    declarationPending: 'Saving...',
    declarationError: 'Could not update the declaration.',
  } as never;
  return (await CascadeBody({
    locale: 'en',
    requestedFg: props.requestedFg,
    pageLabels: labels,
    allergenLabels,
    injectedFgList: props.fgList,
    injectedAllergenLoad: props.allergenLoad,
  })) as React.ReactElement;
}

async function renderBody(props: {
  fgList: FgListResult;
  allergenLoad?: AllergenLoad;
  requestedFg?: string;
}) {
  const element = await buildBodyElement(props);
  return render(element);
}

describe('Allergen cascade page — parity shell + breadcrumb', () => {
  it('renders the page shell, breadcrumb, title and Suspense fallback', async () => {
    const element = (await AllergenCascadePage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({}),
      fgList: FG_LIST,
      allergenLoad: READY_LOAD,
    })) as React.ReactElement;
    render(element);
    expect(screen.getByTestId('allergen-cascade-page')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByLabelText('breadcrumb')).toBeInTheDocument();
  });
});

describe('Allergen cascade page — FG selector + reused cascade renderer', () => {
  it('renders the FG selector and the reused allergen widget (ready state)', async () => {
    await renderBody({ fgList: FG_LIST, allergenLoad: READY_LOAD });
    expect(screen.getByTestId('fg-selector')).toBeInTheDocument();
    const widget = screen.getByTestId('allergen-cascade-widget');
    expect(widget).toBeInTheDocument();
    // Real-shaped props flow into the reused renderer → derived/final badges render.
    expect(within(widget).getByTestId('allergen-final-contains-gluten')).toBeInTheDocument();
    expect(within(widget).getByTestId('allergen-may-contain-nuts')).toBeInTheDocument();
  });

  it('selector lists every org FG as an option', async () => {
    await renderBody({ fgList: FG_LIST, allergenLoad: READY_LOAD });
    const trigger = screen.getByTestId('fg-selector').querySelector('[data-slot="select-trigger"]')!;
    fireEvent.click(trigger);
    expect(screen.getByRole('option', { name: 'FG-001 — Tomato Soup' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'FG-002 — Beef Stew' })).toBeInTheDocument();
  });

  it('changing the selector navigates with the ?fg= search param', async () => {
    await renderBody({ fgList: FG_LIST, allergenLoad: READY_LOAD, requestedFg: 'FG-001' });
    const trigger = screen.getByTestId('fg-selector').querySelector('[data-slot="select-trigger"]')!;
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('option', { name: 'FG-002 — Beef Stew' }));
    expect(replace).toHaveBeenCalledWith('/en/allergen-cascade?fg=FG-002', { scroll: false });
  });

  it('defaults the selected FG to the first FG when ?fg is absent', async () => {
    await renderBody({ fgList: FG_LIST, allergenLoad: READY_LOAD });
    const value = screen
      .getByTestId('fg-selector')
      .querySelector('[data-slot="select-trigger"]')!
      .getAttribute('data-value');
    expect(value).toBe('FG-001');
  });

  it('falls back to the first FG when ?fg points at an FG outside the org', async () => {
    await renderBody({ fgList: FG_LIST, allergenLoad: READY_LOAD, requestedFg: 'FG-999' });
    const value = screen
      .getByTestId('fg-selector')
      .querySelector('[data-slot="select-trigger"]')!
      .getAttribute('data-value');
    expect(value).toBe('FG-001');
  });
});

describe('Allergen cascade page — UI states', () => {
  it('renders the empty state when the org has no FG', async () => {
    await renderBody({ fgList: { state: 'empty', fgs: [] } });
    expect(screen.getByTestId('allergen-cascade-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('fg-selector')).not.toBeInTheDocument();
  });

  it('renders the error state when the FG list read fails', async () => {
    await renderBody({ fgList: { state: 'error', fgs: [] } });
    const alert = screen.getByTestId('allergen-cascade-fg-error');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveAttribute('role', 'alert');
  });

  it('surfaces permission-denied via the reused widget forbidden notice', async () => {
    await renderBody({
      fgList: FG_LIST,
      allergenLoad: { state: 'permission_denied', data: null, canWrite: false, displayNames: {} },
    });
    // The reused widget renders its forbidden notice (role=alert) for this state.
    expect(screen.getByTestId('allergen-cascade-widget')).toBeInTheDocument();
    expect(screen.queryByTestId('allergen-refresh')).not.toBeInTheDocument();
  });

  it('renders the per-FG empty (no allergen data) state via the reused widget', async () => {
    await renderBody({
      fgList: FG_LIST,
      allergenLoad: { state: 'empty', data: null, canWrite: false, displayNames: {} },
    });
    expect(screen.getByTestId('fg-selector')).toBeInTheDocument();
    expect(screen.getByTestId('allergen-cascade-widget')).toBeInTheDocument();
  });

  it('first paints declaration timestamps deterministically, then formats after mount', async () => {
    const element = await buildBodyElement({
      fgList: FG_LIST,
      allergenLoad: ACCEPTED_DECLARATION_LOAD,
    });
    const ssrHtml = renderToString(element);

    expect(ssrHtml).toContain(ACCEPTED_AT);
    expect(ssrHtml).not.toContain(ACCEPTED_AT_CLIENT);

    render(element);

    await waitFor(() => {
      expect(screen.getByTestId('allergen-declaration-confirmation')).toHaveTextContent(ACCEPTED_AT_CLIENT);
    });
  });
});
