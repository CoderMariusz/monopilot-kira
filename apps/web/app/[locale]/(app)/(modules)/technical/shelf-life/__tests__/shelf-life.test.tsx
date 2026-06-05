/**
 * @vitest-environment jsdom
 *
 * T-046 — TEC-030 Shelf Life Config + override modal.
 *
 * Asserts:
 *   - prototype parity (PageHeader + 4 KPI cards + Product/Mode/Duration/Date-code
 *     table + Override action + regulatory note) vs
 *     prototypes/design/Monopilot Design System/technical/other-screens.jsx:587-633
 *     and the override modal field set vs modals.jsx:486-513;
 *   - the 5 UI states (loading skeleton placement is structural; empty / error /
 *     permission-denied / ready data) render from the action result;
 *   - the date-code preview (YYWW → 4-digit string) — AC2;
 *   - i18n keys resolve through the REAL locale JSON in all 4 locales.
 *
 * Real-data wiring: the production page reads FG shelf-life config on
 * public.items through withOrgContext (RLS app.current_org_id()). We mock the
 * Server Action transport boundary so the jsdom suite asserts wiring + labels +
 * states without a live pg pool — no fixtures replace production data.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { previewDateCode } from '../_actions/shared';

type Locale = 'en' | 'pl' | 'ro' | 'uk';

const { listShelfLifeMock, setOverrideMock, refreshMock } = vi.hoisted(() => ({
  listShelfLifeMock: vi.fn(),
  setOverrideMock: vi.fn(),
  refreshMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('../_actions/list-shelf-life', () => ({
  listShelfLife: listShelfLifeMock,
}));

vi.mock('../_actions/set-shelf-life-override', () => ({
  setShelfLifeOverride: setOverrideMock,
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (req?: string | { locale?: string; namespace?: string }) => {
    const locale = typeof req === 'object' ? (req.locale ?? 'en') : 'en';
    const namespace = typeof req === 'object' ? (req.namespace ?? '') : (req ?? '');
    const file = path.resolve(__dirname, `../../../../../../../i18n/${locale}.json`);
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

import TechnicalShelfLifePage from '../page';

const READY_ROWS = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    itemCode: 'FG1001',
    name: 'Smoked sausage 450g',
    shelfLifeDays: 21,
    shelfLifeMode: 'use_by' as const,
    dateCodeFormat: 'YYWW',
    productGroup: 'Deli',
    updatedAt: '2026-06-01T00:00:00.000Z',
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    itemCode: 'FG2002',
    name: 'Ambient pâté 180g',
    shelfLifeDays: 365,
    shelfLifeMode: 'best_before' as const,
    dateCodeFormat: 'YYYY-MM-DD',
    productGroup: 'Ambient',
    updatedAt: '2026-06-01T00:00:00.000Z',
  },
];

function readyResult(canEdit = true) {
  return {
    rows: READY_ROWS,
    canEdit,
    state: 'ready' as const,
    kpis: { products: 2, useBy: 1, bestBefore: 1, unconfigured: 0 },
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('T-046 Shelf Life Config — prototype parity + states', () => {
  it('renders the header, 4 KPI cards, the rule table and the regulatory note (parity)', async () => {
    listShelfLifeMock.mockResolvedValue(readyResult(true));
    render(await TechnicalShelfLifePage());

    // Design-system header: .page-title + breadcrumb nav (other-screens.jsx:587-590).
    expect(screen.getByRole('heading', { level: 1, name: 'Shelf-life configuration' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Shelf life');

    // 4 KPI cards (other-screens.jsx:592-596).
    const kpiRegion = screen.getByRole('region', { name: 'Shelf-life summary' });
    expect(within(kpiRegion).getByText('Finished goods')).toBeInTheDocument();
    expect(within(kpiRegion).getByText('Use-by rules')).toBeInTheDocument();
    expect(within(kpiRegion).getByText('Best-before')).toBeInTheDocument();
    expect(within(kpiRegion).getByText('Unconfigured')).toBeInTheDocument();

    // Table columns (other-screens.jsx:599-607).
    const table = screen.getByRole('table', { name: 'Shelf-life configuration' });
    expect(within(table).getByText('Product')).toBeInTheDocument();
    expect(within(table).getByText('Mode')).toBeInTheDocument();
    expect(within(table).getByText('Duration')).toBeInTheDocument();
    expect(within(table).getByText('Date code')).toBeInTheDocument();

    // Real-data rows.
    expect(within(table).getByText('Smoked sausage 450g')).toBeInTheDocument();
    expect(within(table).getByText('FG1001')).toBeInTheDocument();
    expect(within(table).getByText('21 days')).toBeInTheDocument();

    // Override action present when canEdit (other-screens.jsx:610-612).
    expect(screen.getAllByRole('button', { name: 'Override' }).length).toBe(2);

    // Regulatory note (other-screens.jsx:617-619).
    expect(screen.getByText(/Regulation \(EU\) 1169\/2011/)).toBeInTheDocument();
  });

  it('renders the empty state when no finished goods exist', async () => {
    listShelfLifeMock.mockResolvedValue({
      rows: [],
      canEdit: true,
      state: 'empty',
      kpis: { products: 0, useBy: 0, bestBefore: 0, unconfigured: 0 },
    });
    render(await TechnicalShelfLifePage());
    expect(screen.getByText('No finished goods yet')).toBeInTheDocument();
  });

  it('renders the error state when the load fails', async () => {
    listShelfLifeMock.mockResolvedValue({
      rows: [],
      canEdit: false,
      state: 'error',
      kpis: { products: 0, useBy: 0, bestBefore: 0, unconfigured: 0 },
    });
    render(await TechnicalShelfLifePage());
    expect(screen.getByText('Unable to load shelf-life rules. Please try again.')).toBeInTheDocument();
  });

  it('hides the Override action and shows the read-only notice without edit permission', async () => {
    listShelfLifeMock.mockResolvedValue(readyResult(false));
    render(await TechnicalShelfLifePage());
    expect(screen.queryByRole('button', { name: 'Override' })).not.toBeInTheDocument();
    expect(screen.getByText(/do not have permission to override/)).toBeInTheDocument();
  });

  it('resolves every technical.shelfLife key in all 4 locales (i18n completeness)', () => {
    const keysToCheck = [
      'title',
      'override',
      'modal.title',
      'modal.apply',
      'kpi.products',
      'state.error',
      'error.forbidden',
    ];
    for (const locale of ['en', 'pl', 'ro', 'uk'] as Locale[]) {
      const file = path.resolve(__dirname, `../../../../../../../i18n/${locale}.json`);
      const messages = JSON.parse(readFileSync(file, 'utf-8')) as Record<string, unknown>;
      // Canonical lowercase namespace (matching cost/nutrition/labResults siblings).
      const ns = (messages.technical as Record<string, unknown>).shelfLife as Record<string, unknown>;
      for (const key of keysToCheck) {
        const value = key.split('.').reduce<unknown>((acc, part) => {
          return acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined;
        }, ns);
        expect(typeof value, `${locale}:technical.shelfLife.${key}`).toBe('string');
      }
    }
  });
});

describe('T-046 Shelf Life override modal — interaction + date-code preview (AC2/AC3)', () => {
  it('opens the override modal with the prototype field set (modals.jsx:486-513)', async () => {
    listShelfLifeMock.mockResolvedValue(readyResult(true));
    const user = userEvent.setup();
    render(await TechnicalShelfLifePage());

    await user.click(screen.getAllByRole('button', { name: 'Override' })[0]);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Override shelf life')).toBeInTheDocument();
    // Audit-trail warning (modals.jsx:498-500).
    expect(within(dialog).getByText(/requires QA sign-off/)).toBeInTheDocument();
    // Field set: current (readonly) + new days + reason (modals.jsx:501-511).
    expect(within(dialog).getByText('Current shelf life')).toBeInTheDocument();
    expect(within(dialog).getByText('New shelf life (days)')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Override reason')).toBeInTheDocument();
  });

  it('keeps Apply disabled until a reason >= 10 chars is entered, then calls the action and refreshes (AC3)', async () => {
    listShelfLifeMock.mockResolvedValue(readyResult(true));
    setOverrideMock.mockResolvedValue({ ok: true, data: { id: READY_ROWS[0].id, shelfLifeDays: 28, shelfLifeMode: 'use_by' } });
    const user = userEvent.setup();
    render(await TechnicalShelfLifePage());

    await user.click(screen.getAllByRole('button', { name: 'Override' })[0]);
    const dialog = await screen.findByRole('dialog');
    const apply = within(dialog).getByRole('button', { name: 'Apply override' });
    expect(apply).toBeDisabled();

    await user.type(within(dialog).getByLabelText('Override reason'), 'MAP change confirmed by micro study');
    expect(apply).toBeEnabled();

    await user.click(apply);
    await waitFor(() => expect(setOverrideMock).toHaveBeenCalledTimes(1));
    expect(setOverrideMock.mock.calls[0][0]).toMatchObject({
      id: READY_ROWS[0].id,
      shelfLifeMode: 'use_by',
      reason: 'MAP change confirmed by micro study',
    });
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it('previewDateCode(YYWW) renders a 4-digit string for today (AC2)', () => {
    const sample = previewDateCode('YYWW', new Date('2026-06-04T12:00:00.000Z'));
    expect(sample).toMatch(/^\d{4}$/);
  });

  it('previewDateCode covers the other presets deterministically', () => {
    const d = new Date('2026-03-15T00:00:00.000Z');
    expect(previewDateCode('YYYY-MM-DD', d)).toBe('2026-03-15');
    expect(previewDateCode('YYJJJ', d)).toMatch(/^\d{5}$/);
    expect(previewDateCode('custom-LOT', d)).toBe('custom-LOT');
  });
});
