/**
 * @vitest-environment jsdom
 *
 * Module-close gap fix — locale allergens sub-route (sibling of docs/ + risks/).
 *
 * Exercises the test-only injection seam (data/state/canWrite props) so the suite
 * asserts the wiring + the five UI states + RBAC + the reused T-040 widget WITHOUT a
 * live pg pool — no fixtures replace production data, only the transport boundary
 * (the live route reads public.fa_allergen_cascade as app_user under RLS).
 *
 * Prototype parity source (1:1, unchanged from T-040):
 *   prototypes/design/Monopilot Design System/npd/allergen-screens.jsx:5-118 (allergen_cascade)
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import AllergensPage from './page';
import type { AllergenCascadeData } from '../_lib/allergen-cascade';

afterEach(() => cleanup());

const DATA: AllergenCascadeData = {
  productCode: 'FG-001',
  derivedAllergens: ['gluten', 'milk'],
  publishedAllergens: ['gluten', 'soybeans'],
  mayContainAllergens: ['nuts'],
  conditionalProcessAllergens: ['nuts'],
};

async function renderPage(props: Record<string, unknown>) {
  const element = (await AllergensPage({
    params: Promise.resolve({ locale: 'en', productCode: 'FG-001' }),
    ...props,
  })) as React.ReactElement;
  return render(element);
}

describe('Allergens locale sub-route — reachable + states', () => {
  it('renders the breadcrumb + the reused allergen widget (data state)', async () => {
    await renderPage({ data: DATA, state: 'ready', canWrite: true });
    expect(screen.getByTestId('fa-allergens-page')).toBeInTheDocument();
    const widget = screen.getByTestId('allergen-cascade-widget');
    expect(widget).toBeInTheDocument();
    expect(within(widget).getByTestId('allergen-final-contains-gluten')).toBeInTheDocument();
    expect(within(widget).getByTestId('allergen-may-contain-nuts')).toBeInTheDocument();
  });

  it('exposes Refresh + Override when canWrite (RBAC pass)', async () => {
    await renderPage({ data: DATA, state: 'ready', canWrite: true });
    expect(screen.getByTestId('allergen-refresh')).toBeInTheDocument();
    expect(screen.getByTestId('allergen-override-trigger-gluten')).toBeInTheDocument();
  });

  it('hides Refresh + Override when not canWrite (RBAC deny — no render-then-disable)', async () => {
    await renderPage({ data: DATA, state: 'ready', canWrite: false });
    expect(screen.queryByTestId('allergen-refresh')).not.toBeInTheDocument();
    expect(screen.queryByTestId('allergen-override-trigger-gluten')).not.toBeInTheDocument();
  });

  it('renders the empty state', async () => {
    await renderPage({ data: null, state: 'empty' });
    // The widget empty notice resolves the next-intl npd.allergenWidget.empty key.
    expect(screen.getByTestId('allergen-cascade-widget')).toBeInTheDocument();
  });

  it('renders the loading state', async () => {
    await renderPage({ data: null, state: 'loading' });
    expect(screen.getByTestId('allergen-cascade-widget')).toBeInTheDocument();
  });

  it('renders the error state', async () => {
    await renderPage({ data: null, state: 'error' });
    expect(screen.getByTestId('allergen-cascade-widget')).toBeInTheDocument();
  });

  it('renders the permission-denied state', async () => {
    await renderPage({ data: null, state: 'permission_denied' });
    expect(screen.getByTestId('allergen-cascade-widget')).toBeInTheDocument();
    expect(screen.queryByTestId('allergen-refresh')).not.toBeInTheDocument();
  });
});
