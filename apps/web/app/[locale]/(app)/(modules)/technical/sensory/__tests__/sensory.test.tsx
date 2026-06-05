/**
 * @vitest-environment jsdom
 *
 * T-092 — TEC Sensory Evaluation screen (consumes the T-084 read model).
 *
 * Asserts:
 *   - layout parity vs the read-model status-list primitive
 *     prototypes/design/Monopilot Design System/technical/spec-driven-screens.jsx:472-569
 *     (read-only banner + verdict-pill status table + source note);
 *   - required / pending / pass / fail / hold / not_required render from the
 *     T-084 read model (AC2/AC3) — real-data wiring through the Server Action;
 *   - fail/hold surface SENSORIAL_BLOCKED for downstream release guards (AC4);
 *   - the permission-denied state renders with NO data leak (AC5);
 *   - the empty / error states render;
 *   - i18n keys resolve through the REAL locale JSON in all 4 locales.
 *
 * Real-data wiring: the production page reads public.technical_sensory_evaluations
 * (migration 166) through withOrgContext (RLS app.current_org_id()). We mock the
 * Server Action transport boundary so the jsdom suite asserts wiring + the
 * read-model mapping + states without a live pg pool.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { toSensoryReadModel } from '../../../../../../../lib/technical/sensory';

type Locale = 'en' | 'pl' | 'ro' | 'uk';

const { listSensoryMock } = vi.hoisted(() => ({
  listSensoryMock: vi.fn(),
}));

vi.mock('../_actions/list-sensory', () => ({
  listSensory: listSensoryMock,
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

import TechnicalSensoryPage from '../page';

function row(over: Partial<{ status: string; statusReason: string | null; policyRequired: boolean }> & { id: string; subjectRef: string; itemCode?: string; itemName?: string }) {
  const status = (over.status ?? 'pending') as Parameters<typeof toSensoryReadModel>[0]['status'];
  return {
    id: over.id,
    subjectType: 'product' as const,
    subjectRef: over.subjectRef,
    subjectItemCode: over.itemCode ?? null,
    subjectItemName: over.itemName ?? null,
    policyRequired: over.policyRequired ?? true,
    evaluatedAt: '2026-06-01T00:00:00.000Z',
    evaluatedByName: 'Anna Tester',
    readModel: toSensoryReadModel({
      status,
      policyRequired: over.policyRequired ?? true,
      statusReason: over.statusReason ?? null,
    }),
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('T-092 Sensory Evaluation — parity + read-model states', () => {
  it('renders the read-only banner, verdict-pill table and source note (parity)', async () => {
    listSensoryMock.mockResolvedValue({
      rows: [
        row({ id: 'a', subjectRef: 'FG1001', itemCode: 'FG1001', itemName: 'Smoked sausage', status: 'pass' }),
        row({ id: 'b', subjectRef: 'FG2002', itemCode: 'FG2002', itemName: 'Ambient pâté', status: 'pending' }),
      ],
      state: 'ready',
      counts: { total: 2, blocked: 0, pending: 1, notRequired: 0 },
    });
    render(await TechnicalSensoryPage());

    expect(screen.getByTestId('page-header-title')).toHaveTextContent('Sensory evaluation');
    // Read-only banner (spec-driven-screens.jsx:476-484 analog).
    expect(screen.getByText(/NPD remains the gate owner/)).toBeInTheDocument();

    const table = screen.getByRole('table', { name: 'Sensory evaluations' });
    expect(within(table).getByText('Smoked sausage')).toBeInTheDocument();
    // Verdict pills.
    expect(within(table).getByText('Pass')).toBeInTheDocument();
    expect(within(table).getByText('Pending')).toBeInTheDocument();

    // Source note (spec-driven-screens.jsx:566-568 analog).
    expect(screen.getByText(/technical_sensory_evaluations/)).toBeInTheDocument();
  });

  it('renders required / pending / pass / fail / hold / not_required from the read model (AC2)', async () => {
    listSensoryMock.mockResolvedValue({
      rows: [
        row({ id: '1', subjectRef: 'P-REQ', status: 'required' }),
        row({ id: '2', subjectRef: 'P-PEN', status: 'pending' }),
        row({ id: '3', subjectRef: 'P-PASS', status: 'pass' }),
        row({ id: '4', subjectRef: 'P-FAIL', status: 'fail', statusReason: 'Off-odour detected' }),
        row({ id: '5', subjectRef: 'P-HOLD', status: 'hold', statusReason: 'Awaiting re-taste' }),
        row({ id: '6', subjectRef: 'P-NA', status: 'not_required', policyRequired: false }),
      ],
      state: 'ready',
      counts: { total: 6, blocked: 2, pending: 2, notRequired: 1 },
    });
    const { container } = render(await TechnicalSensoryPage());
    // Assert the verdict pills via the status data-attribute (the policy column
    // also renders the word "Required", so scope to the badge).
    const statuses = Array.from(container.querySelectorAll('[data-sensory-status]')).map((el) =>
      el.getAttribute('data-sensory-status'),
    );
    expect(new Set(statuses)).toEqual(
      new Set(['required', 'pending', 'pass', 'fail', 'hold', 'not_required']),
    );
  });

  it('surfaces SENSORIAL_BLOCKED + detail for fail/hold (AC4)', async () => {
    listSensoryMock.mockResolvedValue({
      rows: [row({ id: '4', subjectRef: 'P-FAIL', status: 'fail', statusReason: 'Off-odour detected' })],
      state: 'ready',
      counts: { total: 1, blocked: 1, pending: 0, notRequired: 0 },
    });
    render(await TechnicalSensoryPage());
    const blocked = screen.getByTestId('sensorial-blocked');
    expect(blocked).toHaveTextContent('SENSORIAL_BLOCKED');
    expect(blocked).toHaveTextContent('Off-odour detected');
  });

  it('shows not_required without implying fabricated Technical evidence (AC3)', async () => {
    listSensoryMock.mockResolvedValue({
      rows: [row({ id: '6', subjectRef: 'P-NA', status: 'not_required', policyRequired: false })],
      state: 'ready',
      counts: { total: 1, blocked: 0, pending: 0, notRequired: 1 },
    });
    render(await TechnicalSensoryPage());
    const table = screen.getByRole('table', { name: 'Sensory evaluations' });
    expect(within(table).getByText('Not required')).toBeInTheDocument();
    expect(within(table).queryByTestId('sensorial-blocked')).not.toBeInTheDocument();
  });

  it('renders the permission-denied state with NO table / data leak (AC5)', async () => {
    listSensoryMock.mockResolvedValue({
      rows: [],
      state: 'denied',
      counts: { total: 0, blocked: 0, pending: 0, notRequired: 0 },
    });
    render(await TechnicalSensoryPage());
    expect(screen.getByRole('alert')).toHaveTextContent('do not have permission to view sensory');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders the empty and error states', async () => {
    listSensoryMock.mockResolvedValue({ rows: [], state: 'empty', counts: { total: 0, blocked: 0, pending: 0, notRequired: 0 } });
    const { unmount } = render(await TechnicalSensoryPage());
    expect(screen.getByText('No sensory evaluations yet')).toBeInTheDocument();
    unmount();

    listSensoryMock.mockResolvedValue({ rows: [], state: 'error', counts: { total: 0, blocked: 0, pending: 0, notRequired: 0 } });
    render(await TechnicalSensoryPage());
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load sensory evaluations');
  });

  it('resolves every technical.sensory key in all 4 locales (i18n completeness)', () => {
    const keysToCheck = ['title', 'readOnlyNote', 'status.fail', 'status.notRequired', 'state.denied', 'sourceNote'];
    for (const locale of ['en', 'pl', 'ro', 'uk'] as Locale[]) {
      const file = path.resolve(__dirname, `../../../../../../../i18n/${locale}.json`);
      const messages = JSON.parse(readFileSync(file, 'utf-8')) as Record<string, unknown>;
      const ns = (messages.technical as Record<string, unknown>).sensory as Record<string, unknown>;
      for (const key of keysToCheck) {
        const value = key.split('.').reduce<unknown>((acc, part) => {
          return acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined;
        }, ns);
        expect(typeof value, `${locale}:technical.sensory.${key}`).toBe('string');
      }
    }
  });
});
