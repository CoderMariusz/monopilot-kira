/**
 * Wave E3 — CCP Monitoring client islands: RTL parity + state + i18n + RBAC tests.
 *
 * Prototype: prototypes/design/Monopilot Design System/quality/
 *   haccp-screens.jsx:108-226 (QaCcpMonitoring) — KPI summary, "+ Record reading",
 *   per-CCP cards with hazard badge + critical limits + latest reading + IN/OUT
 *   badge.
 *
 * The page is an async RSC that reads Supabase via listCcps + listMonitoringLog
 * (and renders the denied / error / loading panels there); these tests exercise
 * the presentational client islands directly. The recordMonitoring Server Action
 * is injected as a vi.fn() prop so we assert the EXACT payload wired against the
 * reviewed signature ({ ccpId, measuredValue, note? }).
 *
 * Covers: parity (codes/badges/limits/last reading — never a UUID), empty state
 * + CTA, optimistic record (in-limit closes; out-of-limit surfaces the auto-NCR
 * breach inline with a deep-link), value validation, action-error verbatim,
 * RBAC (record action's forbidden surfaced), and i18n (en + pl resolve every
 * label, no leaked dotted key).
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import en from '../../../../../../../../i18n/en.json';
import pl from '../../../../../../../../i18n/pl.json';

import { CcpBoardClient } from '../ccp-board.client';
import { buildCcpBoardLabels, buildCcpRecordLabels, buildCcpCreateLabels, type Translator } from '../labels';
import type { CcpBoardItem, CcpRow } from '../ccp-contracts';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

/** A live-catalog-backed translator scoped to quality.ccpMonitoring. */
function makeT(locale: 'en' | 'pl'): Translator {
  const ns = (locale === 'pl' ? pl : en).quality.ccpMonitoring as Record<string, unknown>;
  return (key: string, values?: Record<string, string | number>) => {
    let cur: unknown = ns;
    for (const part of key.split('.')) {
      cur = cur && typeof cur === 'object' ? (cur as Record<string, unknown>)[part] : undefined;
    }
    let raw = typeof cur === 'string' ? cur : key;
    if (values) raw = raw.replace(/\{(\w+)\}/g, (_m, k: string) => (values[k] !== undefined ? String(values[k]) : `{${k}}`));
    return raw;
  };
}

const tEn = makeT('en');
const tPl = makeT('pl');
const BOARD_LABELS = buildCcpBoardLabels(tEn);
const RECORD_LABELS = buildCcpRecordLabels(tEn);
const CREATE_LABELS = buildCcpCreateLabels(tEn);

/** A minimal CcpRow the upsertCcp action returns on success. */
function makeCcpRow(over: Partial<CcpRow> = {}): CcpRow {
  return {
    id: over.id ?? 'new-ccp-1',
    ccpCode: over.ccpCode ?? 'CCP-02',
    name: over.name ?? 'Chilling temperature',
    processStep: over.processStep ?? 'Chilling',
    hazardType: over.hazardType ?? 'biological',
    criticalLimitMin: over.criticalLimitMin ?? null,
    criticalLimitMax: over.criticalLimitMax ?? '4',
    unit: over.unit ?? '°C',
    monitoringFrequency: over.monitoringFrequency ?? 'Each batch',
    correctiveAction: over.correctiveAction ?? '',
    lineId: over.lineId ?? null,
    isActive: over.isActive ?? true,
    createdAt: over.createdAt ?? '2026-06-18T10:00:00.000Z',
    updatedAt: over.updatedAt ?? '2026-06-18T10:00:00.000Z',
  };
}

function makeItem(over: Partial<CcpBoardItem>): CcpBoardItem {
  return {
    id: over.id ?? 'c-1',
    ccpCode: over.ccpCode ?? 'CCP-01',
    name: over.name ?? 'Cooking temperature',
    processStep: over.processStep ?? 'Cooking',
    hazardType: over.hazardType ?? 'biological',
    criticalLimitMin: over.criticalLimitMin ?? '72',
    criticalLimitMax: over.criticalLimitMax ?? null,
    unit: over.unit ?? '°C',
    monitoringFrequency: over.monitoringFrequency ?? 'Each batch',
    lastValue: 'lastValue' in over ? (over.lastValue ?? null) : '75.0',
    lastAt: 'lastAt' in over ? (over.lastAt ?? null) : '2026-06-18T10:30:00.000Z',
    lastStatus: over.lastStatus ?? 'in_limit',
  };
}

function renderBoard(
  items: CcpBoardItem[],
  recordAction = vi.fn(async () => ({ ok: true as const, data: { withinLimits: true, ncrId: null, outboxEmitted: false } })),
  opts: { canEdit?: boolean; upsertAction?: ReturnType<typeof vi.fn> } = {},
) {
  const canEdit = opts.canEdit ?? true;
  const upsertAction =
    opts.upsertAction ?? vi.fn(async () => ({ ok: true as const, data: makeCcpRow() }));
  render(
    <CcpBoardClient
      items={items}
      labels={BOARD_LABELS}
      recordLabels={RECORD_LABELS}
      createLabels={CREATE_LABELS}
      locale="en"
      recordMonitoringAction={recordAction as never}
      upsertCcpAction={upsertAction as never}
      canEdit={canEdit}
      setupHref="/en/quality"
    />,
  );
  return { recordAction, upsertAction };
}

describe('CcpBoardClient (E3 parity)', () => {
  it('renders one card per CCP with code, hazard badge, critical limit and latest reading + IN-LIMIT badge', () => {
    renderBoard([
      makeItem({ id: 'a', ccpCode: 'CCP-01', criticalLimitMin: '72', criticalLimitMax: null, lastValue: '75.0', lastStatus: 'in_limit' }),
    ]);
    expect(screen.getByTestId('ccp-code-a')).toHaveTextContent('CCP-01');
    expect(screen.getByTestId('ccp-hazard-a')).toHaveTextContent(BOARD_LABELS.hazardType.biological);
    expect(screen.getByTestId('ccp-limit-a')).toHaveTextContent('72');
    expect(screen.getByTestId('ccp-last-a')).toHaveTextContent('75.0');
    expect(screen.getByTestId('ccp-status-a')).toHaveTextContent(BOARD_LABELS.status.inLimit);
  });

  it('shows an OUT-OF-LIMIT badge for a breached latest reading and NO data badge when none recorded', () => {
    renderBoard([
      makeItem({ id: 'out', lastStatus: 'out_of_limit', lastValue: '60.0' }),
      makeItem({ id: 'none', lastStatus: 'no_data', lastValue: null, lastAt: null }),
    ]);
    expect(screen.getByTestId('ccp-status-out')).toHaveTextContent(BOARD_LABELS.status.outOfLimit);
    expect(screen.getByTestId('ccp-status-none')).toHaveTextContent(BOARD_LABELS.status.noData);
    expect(screen.getByTestId('ccp-last-none')).toHaveTextContent(BOARD_LABELS.board.noReading);
  });

  it('never renders a raw UUID in the board (rule 0.11)', () => {
    const { container } = render(
      <CcpBoardClient
        items={[makeItem({ id: '11111111-2222-4333-8444-555555555555' })]}
        labels={BOARD_LABELS}
        recordLabels={RECORD_LABELS}
        createLabels={CREATE_LABELS}
        locale="en"
        recordMonitoringAction={vi.fn() as never}
        upsertCcpAction={vi.fn() as never}
        canEdit
        setupHref="/en/quality"
      />,
    );
    // No visible text node looks like a UUID.
    expect(container.textContent ?? '').not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  it('summary KPIs count active / in-limit / out-of-limit CCPs', () => {
    renderBoard([
      makeItem({ id: 'a', lastStatus: 'in_limit' }),
      makeItem({ id: 'b', lastStatus: 'in_limit' }),
      makeItem({ id: 'c', lastStatus: 'out_of_limit' }),
    ]);
    expect(within(screen.getByTestId('ccp-summary-active')).getByText('3')).toBeInTheDocument();
    expect(within(screen.getByTestId('ccp-summary-inlimit')).getByText('2')).toBeInTheDocument();
    expect(within(screen.getByTestId('ccp-summary-outlimit')).getByText('1')).toBeInTheDocument();
  });

  it('EMPTY state: no CCPs renders the create CTA (opens the create modal) and a disabled record button', () => {
    renderBoard([]);
    const empty = screen.getByTestId('ccp-board-empty');
    expect(empty).toHaveAttribute('data-state', 'empty');
    expect(empty).toHaveTextContent(BOARD_LABELS.empty.title);
    // FIX 1: the empty CTA is now a create button (no longer a link to /quality).
    const cta = screen.getByTestId('ccp-board-empty-cta');
    expect(cta).not.toHaveAttribute('href');
    expect(cta).toHaveTextContent(BOARD_LABELS.empty.cta);
    // there is still no reading to record on an empty board.
    expect(screen.getByTestId('ccp-record-open')).toBeDisabled();
    // clicking the CTA opens the create modal.
    fireEvent.click(cta);
    expect(screen.getByTestId('ccp-create-form')).toBeInTheDocument();
  });

  it('EMPTY state without plan_edit: CTA is disabled with the permission tooltip (rule 0.13c)', () => {
    renderBoard([], undefined, { canEdit: false });
    const cta = screen.getByTestId('ccp-board-empty-cta');
    expect(cta).toBeDisabled();
    expect(cta).toHaveAttribute('title', BOARD_LABELS.empty.ctaDisabled);
    // clicking does nothing — no create modal.
    fireEvent.click(cta);
    expect(screen.queryByTestId('ccp-create-form')).not.toBeInTheDocument();
  });

  it('ADD CCP button: present + enabled with plan_edit, opens the create modal', () => {
    renderBoard([makeItem({ id: 'a' })]);
    const add = screen.getByTestId('ccp-create-open');
    expect(add).not.toBeDisabled();
    expect(add).toHaveTextContent(BOARD_LABELS.addCcp);
    fireEvent.click(add);
    expect(screen.getByTestId('ccp-create-form')).toBeInTheDocument();
  });

  it('ADD CCP button gated (rule 0.13c): disabled + tooltip without plan_edit', () => {
    renderBoard([makeItem({ id: 'a' })], undefined, { canEdit: false });
    const add = screen.getByTestId('ccp-create-open');
    expect(add).toBeDisabled();
    expect(add).toHaveAttribute('title', BOARD_LABELS.addCcpDisabled);
    fireEvent.click(add);
    expect(screen.queryByTestId('ccp-create-form')).not.toBeInTheDocument();
  });

  it('CREATE CCP: submits the EXACT upsertCcp payload (snake_case, decimal-string limits) and closes', async () => {
    const upsertAction = vi.fn(async () => ({ ok: true as const, data: makeCcpRow() }));
    renderBoard([makeItem({ id: 'a' })], undefined, { upsertAction });
    fireEvent.click(screen.getByTestId('ccp-create-open'));

    fireEvent.change(screen.getByTestId('ccp-create-code'), { target: { value: 'CCP-02' } });
    fireEvent.change(screen.getByTestId('ccp-create-name'), { target: { value: 'Chilling temperature' } });
    fireEvent.change(screen.getByTestId('ccp-create-step'), { target: { value: 'Chilling' } });
    // hazard type via the shadcn Select (no raw <select>).
    fireEvent.click(within(screen.getByTestId('ccp-create-hazard')).getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: CREATE_LABELS.hazardTypeOptions.biological }));
    fireEvent.change(screen.getByTestId('ccp-create-limit-max'), { target: { value: '4' } });
    fireEvent.change(screen.getByTestId('ccp-create-unit'), { target: { value: '°C' } });
    fireEvent.change(screen.getByTestId('ccp-create-frequency'), { target: { value: 'Each batch' } });

    fireEvent.click(screen.getByTestId('ccp-create-submit'));

    await waitFor(() => expect(upsertAction).toHaveBeenCalledTimes(1));
    expect(upsertAction).toHaveBeenCalledWith({
      ccp_code: 'CCP-02',
      name: 'Chilling temperature',
      process_step: 'Chilling',
      hazard_type: 'biological',
      critical_limit_min: null,
      critical_limit_max: '4',
      unit: '°C',
      monitoring_frequency: 'Each batch',
      is_active: true,
    });
    // success closes the modal.
    await waitFor(() => expect(screen.queryByTestId('ccp-create-form')).not.toBeInTheDocument());
  });

  it('CREATE CCP validation: submit disabled until required fields present; min>max rejected inline', async () => {
    renderBoard([makeItem({ id: 'a' })]);
    fireEvent.click(screen.getByTestId('ccp-create-open'));
    expect(screen.getByTestId('ccp-create-submit')).toBeDisabled();

    fireEvent.change(screen.getByTestId('ccp-create-code'), { target: { value: 'CCP-03' } });
    fireEvent.change(screen.getByTestId('ccp-create-name'), { target: { value: 'Metal detection' } });
    fireEvent.change(screen.getByTestId('ccp-create-step'), { target: { value: 'Detection' } });
    fireEvent.click(within(screen.getByTestId('ccp-create-hazard')).getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: CREATE_LABELS.hazardTypeOptions.physical }));
    // required fields filled → enabled.
    expect(screen.getByTestId('ccp-create-submit')).not.toBeDisabled();

    // min > max → inline order error on submit.
    fireEvent.change(screen.getByTestId('ccp-create-limit-min'), { target: { value: '10' } });
    fireEvent.change(screen.getByTestId('ccp-create-limit-max'), { target: { value: '2' } });
    fireEvent.click(screen.getByTestId('ccp-create-submit'));
    expect(await screen.findByTestId('ccp-create-error')).toHaveTextContent(CREATE_LABELS.validation.limitOrder);
  });

  it('CREATE CCP error: a forbidden/error upsertCcp result surfaces the action message verbatim', async () => {
    const upsertAction = vi.fn(async () => ({ ok: false as const, reason: 'forbidden' as const, message: 'forbidden' }));
    renderBoard([makeItem({ id: 'a' })], undefined, { upsertAction });
    fireEvent.click(screen.getByTestId('ccp-create-open'));
    fireEvent.change(screen.getByTestId('ccp-create-code'), { target: { value: 'CCP-04' } });
    fireEvent.change(screen.getByTestId('ccp-create-name'), { target: { value: 'Cooling' } });
    fireEvent.change(screen.getByTestId('ccp-create-step'), { target: { value: 'Cooling' } });
    fireEvent.click(within(screen.getByTestId('ccp-create-hazard')).getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: CREATE_LABELS.hazardTypeOptions.biological }));
    fireEvent.click(screen.getByTestId('ccp-create-submit'));

    await waitFor(() => expect(upsertAction).toHaveBeenCalled());
    expect(await screen.findByTestId('ccp-create-error')).toHaveTextContent('forbidden');
    expect(screen.getByTestId('ccp-create-form')).toBeInTheDocument();
  });

  it('OPTIMISTIC in-limit: records via recordMonitoring with the EXACT payload, then closes the modal', async () => {
    const { recordAction } = renderBoard([makeItem({ id: 'a', ccpCode: 'CCP-01', name: 'Cooking temperature' })]);
    fireEvent.click(screen.getByTestId('ccp-record-open'));
    expect(screen.getByTestId('ccp-record-form')).toBeInTheDocument();

    // Pick the CCP via the shadcn Select (no raw <select>).
    fireEvent.click(within(screen.getByTestId('ccp-record-ccp-select')).getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: 'CCP-01 — Cooking temperature' }));

    fireEvent.change(screen.getByTestId('ccp-record-value'), { target: { value: '75.2' } });
    fireEvent.click(screen.getByTestId('ccp-record-submit'));

    await waitFor(() => expect(recordAction).toHaveBeenCalledTimes(1));
    expect(recordAction).toHaveBeenCalledWith({ ccpId: 'a', measuredValue: '75.2' });
    // in-limit → modal closes.
    await waitFor(() => expect(screen.queryByTestId('ccp-record-form')).not.toBeInTheDocument());
  });

  it('OPTIMISTIC out-of-limit: surfaces the auto-NCR breach inline with a deep-link to the NCR', async () => {
    const recordAction = vi.fn(async () => ({
      ok: true as const,
      data: { withinLimits: false, ncrId: 'ncr-77', outboxEmitted: true },
    }));
    renderBoard([makeItem({ id: 'a', ccpCode: 'CCP-09', name: 'Metal detection' })], recordAction);
    fireEvent.click(screen.getByTestId('ccp-record-open'));
    fireEvent.click(within(screen.getByTestId('ccp-record-ccp-select')).getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: 'CCP-09 — Metal detection' }));
    fireEvent.change(screen.getByTestId('ccp-record-value'), { target: { value: '5' } });
    fireEvent.click(screen.getByTestId('ccp-record-submit'));

    await waitFor(() => expect(recordAction).toHaveBeenCalled());
    const breach = await screen.findByTestId('ccp-record-breach');
    expect(breach).toHaveTextContent('CCP-09');
    expect(screen.getByTestId('ccp-record-breach-ncr-link')).toHaveAttribute('href', '/en/quality/ncrs/ncr-77');
    // breach keeps the modal open so the user sees the NCR.
    expect(screen.getByTestId('ccp-record-form')).toBeInTheDocument();
  });

  it('validation: submit is disabled without a CCP + numeric value, and a non-numeric value is rejected', async () => {
    renderBoard([makeItem({ id: 'a', ccpCode: 'CCP-01', name: 'Cooking temperature' })]);
    fireEvent.click(screen.getByTestId('ccp-record-open'));
    expect(screen.getByTestId('ccp-record-submit')).toBeDisabled();

    fireEvent.click(within(screen.getByTestId('ccp-record-ccp-select')).getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: 'CCP-01 — Cooking temperature' }));
    // letters → still disabled (not a decimal).
    fireEvent.change(screen.getByTestId('ccp-record-value'), { target: { value: 'abc' } });
    expect(screen.getByTestId('ccp-record-submit')).toBeDisabled();
    // valid decimal → enabled.
    fireEvent.change(screen.getByTestId('ccp-record-value'), { target: { value: '4.2' } });
    expect(screen.getByTestId('ccp-record-submit')).not.toBeDisabled();
  });

  it('RBAC / error: a forbidden recordMonitoring result surfaces the action message verbatim', async () => {
    const recordAction = vi.fn(async () => ({ ok: false as const, reason: 'forbidden' as const, message: 'forbidden' }));
    renderBoard([makeItem({ id: 'a', ccpCode: 'CCP-01', name: 'Cooking temperature' })], recordAction);
    fireEvent.click(screen.getByTestId('ccp-record-open'));
    fireEvent.click(within(screen.getByTestId('ccp-record-ccp-select')).getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: 'CCP-01 — Cooking temperature' }));
    fireEvent.change(screen.getByTestId('ccp-record-value'), { target: { value: '75' } });
    fireEvent.click(screen.getByTestId('ccp-record-submit'));

    await waitFor(() => expect(recordAction).toHaveBeenCalled());
    expect(await screen.findByTestId('ccp-record-error')).toHaveTextContent('forbidden');
    expect(screen.getByTestId('ccp-record-form')).toBeInTheDocument();
  });
});

describe('i18n (no leaked dotted keys)', () => {
  it('resolves every board + record + create label in en and pl', () => {
    for (const t of [tEn, tPl]) {
      const board = buildCcpBoardLabels(t);
      const record = buildCcpRecordLabels(t);
      const create = buildCcpCreateLabels(t);
      const flat = JSON.stringify([board, record, create]);
      // a leaked key would look like "record.breach.title" — a dotted lowerCamel path.
      expect(flat).not.toMatch(/[a-z]+\.[a-z]+\.[a-zA-Z]/);
    }
  });

  it('en + pl differ (real translations, not an en clone)', () => {
    expect(tPl('title')).not.toBe(tEn('title'));
    expect(tPl('status.outOfLimit')).not.toBe(tEn('status.outOfLimit'));
    expect(tPl('create.titleCreate')).not.toBe(tEn('create.titleCreate'));
    expect(tPl('addCcp')).not.toBe(tEn('addCcp'));
  });
});
