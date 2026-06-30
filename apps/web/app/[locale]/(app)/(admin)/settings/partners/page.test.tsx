/**
 * @vitest-environment jsdom
 * DB-cleanup Phase 3 — /settings/partners is now an informational LANDING that
 * points operators at the OPERATIONAL master modules (Suppliers under planning,
 * Customers under shipping). The decorative reference_tables.partners store had
 * zero operational readers and caused the "Settings shows 2, Planning shows 4"
 * confusion, so the schema-driven SingleReferenceScreen is gone.
 *
 * Parity source for the landing chrome: the sibling settings page
 * settings/scanner-auth/page.tsx (page-head + h1.page-title + p.muted) and the
 * tenant page card/anchor pattern (settings/tenant/page.tsx — section.card,
 * card-head, card-title, a.btn.btn-secondary.btn-sm with /${locale}/... hrefs).
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  withOrgContext: vi.fn(),
  upsertReferenceRow: vi.fn(),
  softDeleteReferenceRow: vi.fn(),
  getTranslations: vi.fn(),
}));

// If the page still imported the SingleReferenceScreen path it would pull these
// in; the landing must NOT, so we keep the mocks to prove they are never read.
vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: mocks.withOrgContext,
}));
vi.mock('../../../../../../actions/reference/upsert', () => ({
  upsertReferenceRow: mocks.upsertReferenceRow,
}));
vi.mock('../../../../../../actions/reference/soft-delete', () => ({
  softDeleteReferenceRow: mocks.softDeleteReferenceRow,
}));

// i18n — the landing copy must come from the settings.partners namespace
// (real en/pl values live in messages/<locale>/02-settings.json). We assert the
// page resolves the namespace rather than hardcoding inline strings.
const I18N: Record<string, string> = {
  movedTitle: 'Suppliers & customers',
  movedBody:
    'Suppliers and customers are managed in their operational modules — there is one source of truth for each. Use the links below to maintain them.',
  suppliersLink: 'Manage suppliers',
  suppliersDescription: 'Supplier master records, specs and scorecards (Planning).',
  customersLink: 'Manage customers',
  customersDescription: 'Customer master records used for sales orders and shipping.',
};

vi.mock('next-intl/server', () => ({
  getTranslations: (...args: unknown[]) => mocks.getTranslations(...args),
}));

async function renderPage(locale = 'en') {
  const mod = (await import(/* @vite-ignore */ './page')) as {
    default: (p: { params: Promise<{ locale: string }> }) => Promise<React.ReactNode>;
  };
  const node = await mod.default({ params: Promise.resolve({ locale }) });
  return render(<>{node}</>);
}

afterEach(() => cleanup());

describe('/settings/partners — operational masters landing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withOrgContext.mockReset();
    mocks.getTranslations.mockReset();
    mocks.getTranslations.mockImplementation(async (opts: { namespace?: string }) => {
      const t = (key: string) => I18N[key] ?? key;
      // surface the namespace the page asked for so the test can assert it
      (t as unknown as { __namespace?: string }).__namespace = opts?.namespace;
      return t as unknown as (key: string) => string;
    });
  });

  it('renders the settings landing chrome with the moved-title + explanatory body (no inline strings, settings.partners namespace)', async () => {
    await renderPage();

    // parity: page-head + h1.page-title (matches scanner-auth sibling)
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent(I18N.movedTitle);
    expect(heading).toHaveClass('page-title');

    // explanatory body — the "one source of truth" message
    expect(screen.getByText(I18N.movedBody)).toBeInTheDocument();

    // i18n: the copy resolves through the settings.partners namespace
    expect(mocks.getTranslations).toHaveBeenCalledWith(
      expect.objectContaining({ locale: 'en', namespace: 'settings.partners' }),
    );
  });

  it('offers two operational links with locale-aware hrefs to the canonical masters', async () => {
    await renderPage('en');

    const suppliers = screen.getByRole('link', { name: new RegExp(I18N.suppliersLink) });
    expect(suppliers).toHaveAttribute('href', '/en/planning/suppliers');

    const customers = screen.getByRole('link', { name: new RegExp(I18N.customersLink) });
    expect(customers).toHaveAttribute('href', '/en/shipping/customers');
  });

  it('prefixes the operational hrefs with the active locale (pl)', async () => {
    await renderPage('pl');

    expect(screen.getByRole('link', { name: new RegExp(I18N.suppliersLink) })).toHaveAttribute(
      'href',
      '/pl/planning/suppliers',
    );
    expect(screen.getByRole('link', { name: new RegExp(I18N.customersLink) })).toHaveAttribute(
      'href',
      '/pl/shipping/customers',
    );
  });

  it('does NOT render the schema-driven SingleReferenceScreen any more (no reference table, no reference_tables read, no stub)', async () => {
    const { container } = await renderPage();

    // RBAC posture: a purely-navigational landing reads no org-scoped reference
    // data, so it never touches withOrgContext / role_permissions (consistent
    // with sibling navigational settings pages; view is open to the settings
    // session, edit of the masters is gated server-side in their own modules).
    expect(mocks.withOrgContext).not.toHaveBeenCalled();

    // the decorative store is gone — no data table, no partner rows, no stub
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText('SUP-0001')).toBeNull();
    expect(container.querySelector('[data-testid^="settings-route-stub-"]')).toBeNull();
  });
});
