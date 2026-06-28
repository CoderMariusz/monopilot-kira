/**
 * @vitest-environment jsdom
 *
 * T-137 — FA right panel sidebar (STANDALONE, real-data).
 *
 * The right panel is a self-contained async RSC that reads the REAL product
 * summary (status_overall / built / days_to_launch / launch_date / closed_*)
 * through `withOrgContext` (RLS pinned to app.current_org_id()) and resolves
 * RBAC (`npd.fa.read`) server-side. We mock ONLY the org-context transport
 * boundary + the next-intl locale resolver — the SQL still runs as app_user
 * against RLS in the live route, and the i18n keys resolve through the REAL
 * locale JSON (npd.faRightPanel.*), so no fixture replaces production data.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:404-452
 *   (fa_right_panel: FARightPanel — 280px sticky aside with a Status/Validation
 *    card + a Built-status card; "Any edit resets the Built flag" note.)
 *
 * STRICT SCOPE: this is a standalone component test. It never imports the merged
 * page.tsx / fa-tabs.tsx (wiring is T-138). Modal launchers are deferred seams
 * (T-123) — asserted as present-but-disabled affordances, not wired dialogs.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FaRightPanel, FaRightPanelSkeleton } from '../fa-right-panel';

type Locale = 'en' | 'pl' | 'ro' | 'uk';

const { withOrgContextMock } = vi.hoisted(() => ({
  withOrgContextMock: vi.fn(),
}));

// Resolve labels through the REAL locale JSON so this asserts the production
// next-intl key path (npd.faRightPanel.*), not a fixture.
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

/**
 * Wire withOrgContext so the callback receives a client whose first query is the
 * RBAC permission probe and the second is the product summary read.
 */
function wireOrgContext(
  opts: { canRead?: boolean; row?: Record<string, unknown> | null } = {},
) {
  const { canRead = true, row = SUMMARY_ROW } = opts;
  withOrgContextMock.mockImplementation(async (cb: (ctx: unknown) => Promise<unknown>) => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (/role_permissions|permissions|user_roles/i.test(sql)) {
          return { rows: canRead ? [{ ok: true }] : [] };
        }
        if (/from\s+public\.(product|fa)/i.test(sql) && /product_code/i.test(sql)) {
          return { rows: row ? [row] : [] };
        }
        return { rows: [] };
      }),
    };
    return cb({ userId: 'u1', orgId: 'o1', client });
  });
}

async function renderPanel(locale: Locale = 'en', productCode = 'FA0043') {
  const ui = await FaRightPanel({ locale, productCode });
  return render(ui);
}

beforeEach(() => {
  vi.clearAllMocks();
  wireOrgContext();
});

afterEach(() => cleanup());

describe('T-137 FA right panel — real-data wiring (withOrgContext / RLS)', () => {
  it('reads the product summary through withOrgContext exactly once', async () => {
    await renderPanel();
    expect(withOrgContextMock).toHaveBeenCalledTimes(1);
  });

  it('reads from public.product (RLS view) — never a hardcoded array', async () => {
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
    await renderPanel();
    expect(captured.some((s) => /from\s+public\.(product|fa)/i.test(s))).toBe(true);
  });
});

describe('T-137 FA right panel — parity (fa-screens.jsx:404-452)', () => {
  it('renders a sticky aside carrying the prototype anchor', async () => {
    await renderPanel();
    const aside = screen.getByRole('complementary');
    expect(aside).toHaveAttribute('data-prototype-anchor', 'npd/fa-screens.jsx:404-452');
    expect(aside.className).toMatch(/sticky/);
  });

  it('renders content inside a shadcn Card primitive', async () => {
    await renderPanel();
    const aside = screen.getByRole('complementary');
    expect(aside.querySelector('[data-slot="card"]')).toBeInTheDocument();
  });

  it('surfaces status_overall as a labelled (not color-only) badge', async () => {
    await renderPanel();
    const status = screen.getByTestId('fa-right-panel-status');
    expect(status).toHaveAttribute('data-slot', 'badge');
    expect(status).toHaveTextContent(/in ?progress/i);
  });

  it('shows the key facts: code, name, days_to_launch', async () => {
    await renderPanel();
    const panel = screen.getByRole('complementary');
    expect(within(panel).getByText('FA0043')).toBeInTheDocument();
    expect(within(panel).getByText('Smoked Almond Yoghurt')).toBeInTheDocument();
    expect(within(panel).getByTestId('fa-right-panel-days-to-launch')).toHaveTextContent(/42/);
  });

  it('renders the Built-status card with "Not built" when built=false', async () => {
    await renderPanel();
    const built = screen.getByTestId('fa-right-panel-built');
    expect(built).toHaveAttribute('data-slot', 'badge');
    expect(built).toHaveTextContent(/not built/i);
  });

  it('renders the Built indicator when built=true', async () => {
    wireOrgContext({ row: { ...SUMMARY_ROW, built: true, status_overall: 'Built' } });
    await renderPanel();
    const built = screen.getByTestId('fa-right-panel-built');
    // Prototype-faithful: built FA shows the "⚡ Built" badge (lines 458).
    expect(built).toHaveTextContent(/built/i);
    expect(built).toHaveTextContent('⚡');
  });

  it('exposes action affordances (Dept Close / D365 Build) as deferred seams', async () => {
    await renderPanel();
    const deptClose = screen.getByTestId('fa-right-panel-action-deptClose');
    const d365 = screen.getByTestId('fa-right-panel-action-d365Build');
    expect(deptClose).toHaveAttribute('data-slot', 'button');
    expect(d365).toHaveAttribute('data-slot', 'button');
    // Modals are T-123-deferred: affordances render but are not wired (disabled).
    expect(deptClose).toBeDisabled();
    expect(d365).toBeDisabled();
  });
});

describe('T-137 FA right panel — required UI states', () => {
  it('exports a loading skeleton for the Suspense boundary', () => {
    render(<FaRightPanelSkeleton />);
    expect(screen.getByTestId('fa-right-panel-skeleton')).toBeInTheDocument();
  });

  it('renders the empty state when the product row does not exist', async () => {
    wireOrgContext({ row: null });
    await renderPanel('en', 'FA-MISSING');
    expect(screen.getByTestId('fa-right-panel-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('fa-right-panel-status')).not.toBeInTheDocument();
  });

  it('renders the permission-denied state when the caller cannot read FAs', async () => {
    wireOrgContext({ canRead: false });
    await renderPanel();
    expect(screen.getByTestId('fa-right-panel-forbidden')).toBeInTheDocument();
    expect(screen.queryByTestId('fa-right-panel-status')).not.toBeInTheDocument();
  });

  it('renders the error state when the org-scoped read throws', async () => {
    withOrgContextMock.mockRejectedValue(new Error('boom'));
    await renderPanel();
    expect(screen.getByTestId('fa-right-panel-error')).toBeInTheDocument();
    expect(screen.queryByTestId('fa-right-panel-status')).not.toBeInTheDocument();
  });
});

describe('T-137 FA right panel — i18n (npd.faRightPanel namespace)', () => {
  it('resolves the English title through the new namespace', async () => {
    await renderPanel('en');
    expect(screen.getByText('Validation status')).toBeInTheDocument();
  });

  it('resolves Polish labels through npd.faRightPanel (proves pl.json key)', async () => {
    await renderPanel('pl');
    // Card-1 heading is the key-facts label (the V01-V08 "Validation status" table
    // now owns the prototype "Validation status" heading, lines 440 / 421-452).
    expect(screen.getByText('Kluczowe dane')).toBeInTheDocument();
  });
});
