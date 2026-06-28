/**
 * @vitest-environment jsdom
 *
 * T-136 — FA detail page shell + tabs container.
 *
 * Real-data wiring: the production page reads the FA core row + the FA history
 * timeline through `withOrgContext` (RLS app.current_org_id()). We mock the
 * org-context boundary so the jsdom suite asserts the wiring + label resolution
 * + RBAC + the 5 UI states without a live pg pool — no fixtures replace
 * production data, only the transport boundary (the SQL still runs as app_user
 * against RLS in the live route).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:300-401 (fa_detail)
 *   (FA detail shell: breadcrumb + sticky header with code/name/status badge +
 *    Built badge, then the dept tab bar.)
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import FaDetailPage from './page';

type Locale = 'en' | 'pl' | 'ro' | 'uk';

const { withOrgContextMock } = vi.hoisted(() => ({
  withOrgContextMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/fa/FA0043',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// Resolve labels through the REAL locale JSON so this asserts the production
// next-intl key path (npd.faDetail.* / npd.faHistory.*), not a fixture.
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (req?: string | { locale?: string; namespace?: string }) => {
    const locale = typeof req === 'object' ? (req.locale ?? 'en') : 'en';
    const namespace = typeof req === 'object' ? (req.namespace ?? '') : (req ?? '');
    const file = path.resolve(__dirname, `../../../../../../i18n/${locale}.json`);
    const messages = JSON.parse(readFileSync(file, 'utf-8'));
    const ns = namespace.split('.').reduce((acc: Record<string, unknown>, part: string) => {
      return (acc?.[part] as Record<string, unknown>) ?? {};
    }, messages);
    return (key: string) => {
      const value = key.split('.').reduce((acc: unknown, part: string) => {
        return acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined;
      }, ns);
      return typeof value === 'string' ? value : key;
    };
  }),
}));

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: withOrgContextMock,
}));

const FA_ROW = {
  product_code: 'FA0043',
  product_name: 'Smoked Almond Yoghurt',
  status_overall: 'InProgress',
  built: false,
};

/**
 * Wire withOrgContext so the callback receives a client whose first query is the
 * RBAC permission probe and the second is the FA core row read.
 */
function wireOrgContext(
  opts: { canRead?: boolean; faRow?: Record<string, unknown> | null; coreDone?: boolean } = {},
) {
  const { canRead = true, faRow = FA_ROW, coreDone = true } = opts;
  // T-105: the to_jsonb(product) read drives the dept tabs + the Core/Production
  // close gate. Default the gate open so the tab-order assertion sees UNLOCKED
  // labels (locking is asserted separately in fa-tabs-wiring.test.tsx).
  const productJson = faRow
    ? {
        ...faRow,
        closed_core: coreDone ? 'Yes' : null,
        closed_production: coreDone ? 'Yes' : null,
      }
    : null;
  withOrgContextMock.mockImplementation(async (cb: (ctx: unknown) => Promise<unknown>) => {
    let call = 0;
    const client = {
      query: vi.fn(async (sql: string) => {
        call += 1;
        if (/role_permissions|permissions|user_roles/i.test(sql)) {
          return { rows: canRead ? [{ ok: true }] : [] };
        }
        // to_jsonb(product) value read (drives dept tabs + close gate).
        if (/to_jsonb\(p\.\*\)/i.test(sql)) {
          return { rows: productJson ? [{ product_json: productJson }] : [] };
        }
        // FA core row read.
        if (/from\s+public\.(product|fa)/i.test(sql) && /product_code/i.test(sql)) {
          return { rows: faRow ? [faRow] : [] };
        }
        // DeptColumns / prod_detail / history reads → empty in this jsdom suite.
        return { rows: [] };
      }),
    };
    void call;
    return cb({ userId: 'u1', orgId: 'o1', client });
  });
}

async function renderPage(locale: Locale = 'en', productCode = 'FA0043') {
  const ui = await FaDetailPage({ params: Promise.resolve({ locale, productCode }) });
  return render(ui);
}

beforeEach(() => {
  vi.clearAllMocks();
  wireOrgContext();
});

afterEach(() => cleanup());

describe('T-136 FA detail page — parity + real-data header', () => {
  it('renders the FA core row (code, name, status, built) read via withOrgContext', async () => {
    await renderPage();

    // Org-scoped reads run through the withOrgContext boundary on the ready path:
    // (1) the FA core row + dept columns (incl. MRP) + history (loadFaDetail),
    // (2) the allergen cascade read-model (readAllergenCascade, reused T-040
    // action) that feeds the Technical-section allergen slot, (3) the finish-WIP
    // prod_detail rows (listProdDetail), (4) the FA benchmarks (listBenchmarks) —
    // both feeding the Core-section editor slots — (5) the read-only FA BOM
    // (getFaBom, Lane 12) feeding the BOM tab, and (6) a further org-scoped read
    // in the ready-path fan-out. All go through RLS as app_user — the client
    // never re-queries or trusts a client permission flag.
    expect(withOrgContextMock).toHaveBeenCalledTimes(6);

    const header = screen
      .getByRole('heading', { name: 'Smoked Almond Yoghurt' })
      .closest('section') as HTMLElement;
    expect(header).not.toBeNull();
    expect(within(header).getByText('FA0043')).toBeInTheDocument();
    expect(within(header).getByText('Smoked Almond Yoghurt')).toBeInTheDocument();
    // status_overall surfaced as a labelled badge (not color-only).
    expect(within(header).getByTestId('fa-detail-status')).toHaveTextContent(/in ?progress/i);
    // not-built FA: no Built badge.
    expect(screen.queryByTestId('fa-detail-built')).not.toBeInTheDocument();
  });

  it('shows the Built badge only when the FA is built', async () => {
    wireOrgContext({ faRow: { ...FA_ROW, built: true, status_overall: 'Built' } });
    await renderPage();
    expect(screen.getByTestId('fa-detail-built')).toHaveTextContent(/built/i);
  });

  it('mounts the tabs container with the 3 section tabs + BOM + History in order (A3 SLICE 2)', async () => {
    await renderPage();
    const tablist = screen.getByRole('tablist', { name: /fg detail departments|finished good .* departments|fa detail departments|factory article departments|fa tabs/i });
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent?.trim())).toEqual([
      'Core',
      'Commercial & Planning',
      'Production & Technical',
      'BOM',
      'History',
    ]);
  });
});

describe('T-136 FA detail page — states', () => {
  it('renders the not-found / empty state when the FA row does not exist', async () => {
    wireOrgContext({ faRow: null });
    await renderPage('en', 'FA-MISSING');
    expect(screen.getByTestId('fa-detail-empty')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('renders the permission-denied state when the caller cannot read FAs', async () => {
    wireOrgContext({ canRead: false });
    await renderPage();
    expect(screen.getByTestId('fa-detail-forbidden')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('renders the error state when the org-scoped read throws', async () => {
    withOrgContextMock.mockRejectedValue(new Error('boom'));
    await renderPage();
    expect(screen.getByTestId('fa-detail-error')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });
});

describe('FA detail page — dept strip + actions bar + workflow line (fa-screens.jsx:330-385)', () => {
  it('renders the 7-dept status strip below the header (server-derived, no hardcode)', async () => {
    await renderPage();
    const strip = screen.getByTestId('fa-dept-status-strip');
    expect(strip).toHaveAttribute('data-prototype-anchor', 'npd/fa-screens.jsx:365-385');
    for (const dept of [
      'core',
      'planning',
      'commercial',
      'production',
      'technical',
      'mrp',
      'procurement',
    ]) {
      expect(within(strip).getByTestId(`fa-dept-status-${dept}`)).toBeInTheDocument();
    }
    // Core was closed (coreDone default Yes) with no required cols loaded → done.
    expect(within(strip).getByTestId('fa-dept-status-core')).toHaveAttribute('data-status', 'done');
    // Planning was not closed and no fields → pending.
    expect(within(strip).getByTestId('fa-dept-status-planning')).toHaveAttribute(
      'data-status',
      'pending',
    );
  });

  it('renders the header ACTIONS BAR with Delete FA + Build D365 (D365 disabled unless Complete)', async () => {
    await renderPage();
    const bar = screen.getByTestId('fa-header-actions');
    expect(bar).toHaveAttribute('data-prototype-anchor', 'npd/fa-screens.jsx:344-362');
    // Delete enabled (canDelete resolved true in the mock RBAC probe).
    expect(screen.getByTestId('fa-header-action-delete')).not.toBeDisabled();
    // Build D365 disabled because status_overall is InProgress (not Complete).
    expect(screen.getByTestId('fa-header-action-d365')).toBeDisabled();
  });

  it('enables Build D365 when the FA is Complete', async () => {
    wireOrgContext({ faRow: { ...FA_ROW, status_overall: 'Complete' } });
    await renderPage();
    expect(screen.getByTestId('fa-header-action-d365')).not.toBeDisabled();
  });

  it('renders the workflow template line with the · 7 departments suffix', async () => {
    await renderPage();
    const line = screen.getByTestId('fa-detail-workflow-line');
    expect(line).toHaveTextContent(/Workflow template:/i);
    expect(line).toHaveTextContent(/7 departments/i);
  });
});

describe('T-136 FA detail page — i18n (next-intl locale path)', () => {
  it('resolves the npd.faDetail eyebrow label in English', async () => {
    await renderPage('en');
    expect(screen.getByText('Finished Good')).toBeInTheDocument();
  });

  it('resolves Polish labels through the npd.faDetail namespace', async () => {
    await renderPage('pl');
    // eyebrow label localized — proves the namespace exists in pl.json.
    expect(screen.getByText('Wyrób gotowy')).toBeInTheDocument();
  });
});
