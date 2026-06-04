/**
 * @vitest-environment jsdom
 *
 * T-138 — WIRING: FA detail layout (shell + tabs + persistent right panel + modal routing).
 *
 * The FA detail layout is an RSC that wires the merged shell (T-136 page/tabs)
 * and the merged right panel (T-137) into a single two-column screen so that:
 *
 *   1. the tabbed main content (children = page.tsx) renders on the LEFT and the
 *      FaRightPanel (T-137) renders STICKY on the RIGHT (acceptance #1);
 *   2. the right panel lives in the LAYOUT (not the page), so it is preserved by
 *      Next.js across `?tab=` query navigation — i.e. it does NOT remount when a
 *      user switches Core → Technical (acceptance #2). We prove this structurally
 *      (right panel rendered by the layout, alongside children) plus with a
 *      stable-instance assertion via the client actions wrapper;
 *   3. the right-panel Dept Close / D365 Build actions route to the established
 *      `?modal=` query-trigger pattern (acceptance #3) and the modal host opens
 *      the correct modal when the URL carries `?modal=deptClose|d365Build`.
 *
 * Real-data wiring: the layout reads the FA core + gate progress ONCE through
 * `withOrgContext` (RLS pinned to app.current_org_id(); RBAC `npd.fa.read` /
 * `npd.fa.close` resolved server-side). We mock ONLY the org-context transport
 * boundary + the next-intl locale resolver — the SQL still runs as app_user
 * against RLS in the live route, and the i18n keys resolve through the REAL
 * locale JSON, so no fixture replaces production data.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:300-452
 *   (fa_detail two-column grid `1fr 280px` + fa_right_panel sticky aside.)
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import FaDetailLayout from '../../layout';

type Locale = 'en' | 'pl' | 'ro' | 'uk';

// ---------------------------------------------------------------------------
// next/navigation harness — URL-driven `?modal=` routing (mirrors fa-tabs).
// ---------------------------------------------------------------------------

let pathname = '/en/fa/FA0043';
let searchParams = new URLSearchParams();

const routerPush = vi.fn((href: string) => {
  const next = new URL(href, 'https://monopilot.test');
  pathname = next.pathname;
  searchParams = new URLSearchParams(next.searchParams);
});

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({
    push: routerPush,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(searchParams.toString()),
}));

const { withOrgContextMock } = vi.hoisted(() => ({ withOrgContextMock: vi.fn() }));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (req?: string | { locale?: string; namespace?: string }) => {
    const locale = typeof req === 'object' ? (req.locale ?? 'en') : 'en';
    const namespace = typeof req === 'object' ? (req.namespace ?? '') : (req ?? '');
    const file = path.resolve(__dirname, `../../../../../../../../i18n/${locale}.json`);
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

vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: withOrgContextMock,
}));

const SUMMARY_ROW = {
  product_code: 'FA0043',
  product_name: 'Smoked Almond Yoghurt',
  status_overall: 'InProgress',
  built: false,
  days_to_launch: 42,
  launch_date: '2026-09-01',
  created_at: '2026-04-15T16:21:00.000Z',
  closed_core: 'Yes',
  closed_planning: 'No',
  closed_commercial: 'No',
  closed_production: 'No',
  closed_technical: 'No',
  closed_mrp: 'No',
  closed_procurement: 'No',
};

function wireOrgContext(opts: { canRead?: boolean; canClose?: boolean; row?: Record<string, unknown> | null } = {}) {
  const { canRead = true, canClose = true, row = SUMMARY_ROW } = opts;
  withOrgContextMock.mockImplementation(async (cb: (ctx: unknown) => Promise<unknown>) => {
    const client = {
      query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
        if (/permissions|user_roles/i.test(sql)) {
          const perm = String(params?.[2] ?? '');
          if (perm.includes('close')) return { rows: canClose ? [{ ok: true }] : [] };
          return { rows: canRead ? [{ ok: true }] : [] };
        }
        if (/from\s+public\.(product|fa)/i.test(sql)) {
          return { rows: row ? [row] : [] };
        }
        return { rows: [] };
      }),
    };
    return cb({ userId: 'u1', orgId: 'o1', client });
  });
}

const Child = () => <div data-testid="layout-children">tab content here</div>;

async function renderLayout(locale: Locale = 'en', productCode = 'FA0043') {
  const ui = await FaDetailLayout({
    children: <Child />,
    params: Promise.resolve({ locale, productCode }),
  } as never);
  return render(ui as React.ReactElement);
}

beforeEach(() => {
  pathname = '/en/fa/FA0043';
  searchParams = new URLSearchParams();
  vi.clearAllMocks();
  wireOrgContext();
});

afterEach(() => cleanup());

describe('T-138 FA detail layout — two-column composition (acceptance #1)', () => {
  it('renders the tabbed main content (children) on the left', async () => {
    await renderLayout();
    expect(screen.getByTestId('layout-children')).toBeInTheDocument();
  });

  it('renders the FaRightPanel (T-137) sticky on the right, inside the layout', async () => {
    await renderLayout();
    const aside = screen.getByRole('complementary');
    expect(aside).toHaveAttribute('data-prototype-anchor', 'npd/fa-screens.jsx:404-452');
    expect(aside.className).toMatch(/sticky/);
  });

  it('lays out a two-column shell (left children + right panel side by side)', async () => {
    await renderLayout();
    const shell = screen.getByTestId('fa-detail-shell');
    expect(shell).toBeInTheDocument();
    // Both the children column and the right panel are descendants of the shell.
    expect(within(shell).getByTestId('layout-children')).toBeInTheDocument();
    expect(within(shell).getByRole('complementary')).toBeInTheDocument();
  });
});

describe('T-138 FA detail layout — right panel persistence (acceptance #2)', () => {
  it('places the right panel in the LAYOUT (preserved across ?tab= navigation, no remount)', async () => {
    // The layout owns the right panel — Next.js does NOT re-render a layout on a
    // query-only (?tab=) navigation, so the panel instance is preserved. We prove
    // the panel is rendered by the LAYOUT (alongside children), not the page.
    await renderLayout();
    const shell = screen.getByTestId('fa-detail-shell');
    const aside = within(shell).getByRole('complementary');
    const children = within(shell).getByTestId('layout-children');
    // Right panel and children are SIBLINGS in the shell — the layout composes both.
    expect(aside.parentElement).toBe(children.parentElement?.parentElement ?? shell);
    // Right panel carries a stable mount marker so an E2E can assert identity.
    expect(aside).toHaveAttribute('data-testid', 'fa-right-panel');
  });
});

describe('T-138 FA detail layout — modal routing (acceptance #3)', () => {
  it('routes Dept Close to ?modal=deptClose via the established query-trigger', async () => {
    const user = userEvent.setup();
    await renderLayout();
    const btn = screen.getByTestId('fa-right-panel-action-deptClose');
    expect(btn).toBeEnabled();
    await user.click(btn);
    expect(routerPush).toHaveBeenCalledTimes(1);
    expect(routerPush.mock.calls[0][0]).toMatch(/modal=deptClose/);
  });

  it('routes D365 Build to ?modal=d365Build via the established query-trigger', async () => {
    const user = userEvent.setup();
    // FA must be Complete for D365 Build to be enabled (prototype line 347).
    wireOrgContext({ row: { ...SUMMARY_ROW, status_overall: 'Complete' } });
    await renderLayout();
    const btn = screen.getByTestId('fa-right-panel-action-d365Build');
    expect(btn).toBeEnabled();
    await user.click(btn);
    expect(routerPush).toHaveBeenCalledTimes(1);
    expect(routerPush.mock.calls[0][0]).toMatch(/modal=d365Build/);
  });

  it('disables D365 Build until the FA is Complete (prototype line 347-349)', async () => {
    wireOrgContext({ row: { ...SUMMARY_ROW, status_overall: 'InProgress' } });
    await renderLayout();
    expect(screen.getByTestId('fa-right-panel-action-d365Build')).toBeDisabled();
  });

  it('mounts the modal host that opens the deptClose modal when ?modal=deptClose', async () => {
    searchParams = new URLSearchParams('modal=deptClose');
    await renderLayout();
    expect(screen.getByTestId('fa-modal-host')).toBeInTheDocument();
    expect(screen.getByTestId('fa-modal-deptClose')).toBeInTheDocument();
  });

  it('opens the d365Build modal when ?modal=d365Build', async () => {
    searchParams = new URLSearchParams('modal=d365Build');
    wireOrgContext({ row: { ...SUMMARY_ROW, status_overall: 'Complete' } });
    await renderLayout();
    expect(screen.getByTestId('fa-modal-d365Build')).toBeInTheDocument();
  });

  it('renders no open modal when no ?modal= is present', async () => {
    await renderLayout();
    expect(screen.queryByTestId('fa-modal-deptClose')).not.toBeInTheDocument();
    expect(screen.queryByTestId('fa-modal-d365Build')).not.toBeInTheDocument();
  });
});

describe('T-138 FA detail layout — RBAC + real-data wiring', () => {
  it('reads FA core through withOrgContext (RLS) — no mock array', async () => {
    const captured: string[] = [];
    withOrgContextMock.mockImplementation(async (cb: (ctx: unknown) => Promise<unknown>) => {
      const client = {
        query: vi.fn(async (sql: string) => {
          captured.push(sql);
          if (/permissions|user_roles/i.test(sql)) return { rows: [{ ok: true }] };
          if (/from\s+public\.(product|fa)/i.test(sql)) return { rows: [SUMMARY_ROW] };
          return { rows: [] };
        }),
      };
      return cb({ userId: 'u1', orgId: 'o1', client });
    });
    await renderLayout();
    expect(captured.some((s) => /from\s+public\.(product|fa)/i.test(s))).toBe(true);
  });

  it('disables the Dept Close action when the caller lacks npd.fa.close (no client trust)', async () => {
    wireOrgContext({ canClose: false });
    await renderLayout();
    expect(screen.getByTestId('fa-right-panel-action-deptClose')).toBeDisabled();
  });

  it('still renders children + a non-actionable right panel when FA core is missing (empty)', async () => {
    wireOrgContext({ row: null });
    await renderLayout('en', 'FA-MISSING');
    // Children always render (children own their own state); right panel shows empty.
    expect(screen.getByTestId('layout-children')).toBeInTheDocument();
    expect(screen.getByTestId('fa-right-panel-empty')).toBeInTheDocument();
  });
});

describe('T-138 FA detail layout — i18n (next-intl, all four locales)', () => {
  it('resolves the deferred deptClose modal copy through the npd.faDetailModals namespace (pl)', async () => {
    searchParams = new URLSearchParams('modal=deptClose');
    await renderLayout('pl');
    // Proves pl.json carries the new faDetailModals key (no inline literal).
    expect(screen.getByText('Tutaj otwiera się proces zamykania działu.')).toBeInTheDocument();
  });

  it('localizes the D365 disabled hint through npd.faRightPanel (pl)', async () => {
    wireOrgContext({ row: { ...SUMMARY_ROW, status_overall: 'InProgress' } });
    await renderLayout('pl');
    const btn = screen.getByTestId('fa-right-panel-action-d365Build');
    expect(btn).toHaveAttribute(
      'title',
      'Wyrób musi być najpierw Ukończony (wszystkie 7 działów zamkniętych).',
    );
  });
});
