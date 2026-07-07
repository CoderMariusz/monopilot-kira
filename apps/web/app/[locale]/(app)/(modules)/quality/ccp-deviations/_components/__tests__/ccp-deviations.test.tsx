/**
 * Wave E3 — CCP Deviations client islands: RTL parity + state + i18n + RBAC tests.
 *
 * Prototype: prototypes/design/Monopilot Design System/quality/
 *   haccp-screens.jsx:229-299 (QaCcpDeviations) — status filter + dense
 *   deviations table + per-open-row resolve; the resolve MODAL conforms to
 *   modals.jsx:554-594 (corrective action + e-sign PIN).
 *
 * The page is an async RSC that reads Supabase via listCcpDeviations (and renders
 * the denied / error / empty / loading panels there); these tests exercise the
 * presentational client islands directly. The resolveCcpDeviation Server Action
 * is injected as a vi.fn() prop so we assert the EXACT payload wired against the
 * reviewed signature — resolveCcpDeviation(id, { actionTaken, disposition,
 * signature:{password} }).
 *
 * Covers: parity (CCP code/name, reading+uom, status badge open=red/resolved=
 * green, opened_at, hold deep-link — never a UUID), the status filter, the
 * filtered-empty state, the Resolve modal exposing actionTaken + disposition +
 * PIN (type=password) and submitting the exact payload, action-error verbatim,
 * RBAC (Resolve gated by the server-resolved canResolve flag → disabled +
 * tooltip), no UUID leak, and i18n (en + pl resolve every label, no leaked key).
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import en from '../../../../../../../../i18n/en.json';
import pl from '../../../../../../../../i18n/pl.json';

import { DeviationsListClient } from '../deviations-list.client';
import {
  buildDeviationListLabels,
  buildDeviationResolveLabels,
  type Translator,
} from '../labels';
import type { DeviationRow } from '../ccp-deviations-contracts';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

/** A live-catalog-backed translator scoped to quality.ccpDeviations. */
function makeT(locale: 'en' | 'pl'): Translator {
  const ns = (locale === 'pl' ? pl : en).quality.ccpDeviations as Record<string, unknown>;
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
const LIST_LABELS = buildDeviationListLabels(tEn);
const RESOLVE_LABELS = buildDeviationResolveLabels(tEn);

function makeRow(over: Partial<DeviationRow> = {}): DeviationRow {
  return {
    id: over.id ?? 'dev-1',
    status: over.status ?? 'open',
    ccpCode: over.ccpCode ?? 'CCP-01',
    ccpName: over.ccpName ?? 'Cooking temperature',
    measuredValue: 'measuredValue' in over ? (over.measuredValue ?? null) : '60.0',
    uom: 'uom' in over ? (over.uom ?? null) : '°C',
    actionTaken: over.actionTaken ?? null,
    disposition: over.disposition ?? null,
    hold: 'hold' in over ? (over.hold ?? null) : null,
    openedAt: over.openedAt ?? '2026-06-18T10:30:00.000Z',
  };
}

function renderList(
  rows: DeviationRow[],
  opts: { canResolve?: boolean; resolveAction?: ReturnType<typeof vi.fn> } = {},
) {
  const canResolve = opts.canResolve ?? true;
  const resolveAction =
    opts.resolveAction ?? vi.fn(async () => ({ ok: true as const, data: makeRow({ status: 'resolved' }) }));
  render(
    <DeviationsListClient
      rows={rows}
      labels={LIST_LABELS}
      resolveLabels={RESOLVE_LABELS}
      locale="en"
      canResolve={canResolve}
      resolveAction={resolveAction as never}
    />,
  );
  return { resolveAction };
}

describe('DeviationsListClient (E3 parity)', () => {
  it('renders one row per deviation with CCP code + name, reading + uom and opened date (never a UUID)', () => {
    renderList([
      makeRow({ id: 'a', ccpCode: 'CCP-01', ccpName: 'Cooking temperature', measuredValue: '60.0', uom: '°C' }),
    ]);
    expect(screen.getByTestId('deviation-ccp-a')).toHaveTextContent('CCP-01');
    expect(screen.getByTestId('deviation-row-a')).toHaveTextContent('Cooking temperature');
    expect(screen.getByTestId('deviation-reading-a')).toHaveTextContent('60.0 °C');
    // opened date rendered as a yyyy-mm-dd slice.
    expect(screen.getByTestId('deviation-row-a')).toHaveTextContent('2026-06-18');
  });

  it('OPEN status badge is danger (red) and RESOLVED is success (green)', () => {
    renderList([
      makeRow({ id: 'o', status: 'open' }),
      makeRow({ id: 'r', status: 'resolved' }),
    ]);
    // 'all' filter so both are visible.
    fireEvent.click(screen.getByTestId('deviation-filter-all'));
    expect(screen.getByTestId('deviation-status-o')).toHaveTextContent(LIST_LABELS.status.open);
    expect(screen.getByTestId('deviation-status-o')).toHaveAttribute('data-variant', 'danger'); // red
    expect(screen.getByTestId('deviation-status-r')).toHaveTextContent(LIST_LABELS.status.resolved);
    expect(screen.getByTestId('deviation-status-r')).toHaveAttribute('data-variant', 'success'); // green
  });

  it('renders the linked hold as a deep-link to /quality/holds/{id} showing the hold NUMBER, never the id', () => {
    renderList([
      makeRow({
        id: 'a',
        hold: { id: 'hold-uuid-123', holdNumber: 'HOLD-2026-007', referenceDisplay: 'LP-9', status: 'open' },
      }),
    ]);
    const link = screen.getByTestId('deviation-hold-link-a');
    expect(link).toHaveAttribute('href', '/en/quality/holds/hold-uuid-123');
    expect(link).toHaveTextContent('HOLD-2026-007');
    // the hold id is in the href ONLY, never rendered as visible text.
    expect(link.textContent).not.toContain('hold-uuid-123');
  });

  it('shows the no-hold placeholder when a deviation has no linked hold', () => {
    renderList([makeRow({ id: 'a', hold: null })]);
    expect(screen.getByTestId('deviation-hold-none-a')).toHaveTextContent(LIST_LABELS.noHold);
    expect(screen.queryByTestId('deviation-hold-link-a')).not.toBeInTheDocument();
  });

  it('STATUS FILTER (parity haccp-screens.jsx:263-266): open is default; switching filters the rows + updates counts', () => {
    renderList([
      makeRow({ id: 'o1', status: 'open' }),
      makeRow({ id: 'o2', status: 'open' }),
      makeRow({ id: 'r1', status: 'resolved' }),
    ]);
    // default = open → 2 rows, resolved hidden.
    expect(screen.getByTestId('deviation-row-o1')).toBeInTheDocument();
    expect(screen.queryByTestId('deviation-row-r1')).not.toBeInTheDocument();
    expect(screen.getByTestId('deviations-list-rows')).toHaveTextContent('2');
    // resolved filter.
    fireEvent.click(screen.getByTestId('deviation-filter-resolved'));
    expect(screen.queryByTestId('deviation-row-o1')).not.toBeInTheDocument();
    expect(screen.getByTestId('deviation-row-r1')).toBeInTheDocument();
    // all filter → 3 rows.
    fireEvent.click(screen.getByTestId('deviation-filter-all'));
    expect(screen.getByTestId('deviations-list-rows')).toHaveTextContent('3');
  });

  it('FILTERED-EMPTY state: a filter matching no rows renders the empty-filtered copy', () => {
    renderList([makeRow({ id: 'o1', status: 'open' })]);
    fireEvent.click(screen.getByTestId('deviation-filter-resolved'));
    expect(screen.getByTestId('deviations-list-empty-filtered')).toHaveTextContent(LIST_LABELS.emptyFiltered);
  });

  it('never renders a raw UUID in the list (rule 0.11)', () => {
    const { container } = render(
      <DeviationsListClient
        rows={[
          makeRow({
            id: '11111111-2222-4333-8444-555555555555',
            hold: { id: '99999999-8888-4777-8666-555555555555', holdNumber: 'HOLD-2026-001', referenceDisplay: null, status: 'open' },
          }),
        ]}
        labels={LIST_LABELS}
        resolveLabels={RESOLVE_LABELS}
        locale="en"
        canResolve
        resolveAction={vi.fn() as never}
      />,
    );
    // No VISIBLE text node looks like a UUID (the hold id lives only in an href attribute).
    expect(container.textContent ?? '').not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  it('RBAC (rule 0.13c): without deviation-override the per-row Resolve button is disabled with the permission tooltip', () => {
    renderList([makeRow({ id: 'a', status: 'open' })], { canResolve: false });
    const btn = screen.getByTestId('deviation-resolve-open-a');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', LIST_LABELS.resolveDisabled);
    // clicking does nothing — no resolve modal.
    fireEvent.click(btn);
    expect(screen.queryByTestId('deviation-resolve-form')).not.toBeInTheDocument();
  });

  it('a resolved row exposes NO Resolve button (only open rows are resolvable)', () => {
    renderList([makeRow({ id: 'r', status: 'resolved' })]);
    fireEvent.click(screen.getByTestId('deviation-filter-all'));
    expect(screen.queryByTestId('deviation-resolve-open-r')).not.toBeInTheDocument();
  });
});

describe('DeviationResolveModal (E3 — e-sign resolve)', () => {
  it('opens from an OPEN row and exposes the actionTaken + disposition Select + PIN (type=password) fields', () => {
    renderList([makeRow({ id: 'a', ccpCode: 'CCP-09' })]);
    fireEvent.click(screen.getByTestId('deviation-resolve-open-a'));
    expect(screen.getByTestId('deviation-resolve-form')).toBeInTheDocument();
    expect(screen.getByTestId('deviation-resolve-action')).toBeInTheDocument();
    expect(screen.getByTestId('deviation-resolve-disposition')).toBeInTheDocument();
    const pin = screen.getByTestId('deviation-resolve-password');
    expect(pin).toHaveAttribute('type', 'password');
    expect(screen.getByTestId('modal-header')).toHaveTextContent('CCP-09');
  });

  it('shows a linked-hold prompt with deep-link when resolving a deviation that has a hold', () => {
    renderList([
      makeRow({
        id: 'a',
        hold: { id: 'hold-uuid-123', holdNumber: 'HOLD-2026-007', referenceDisplay: 'LP-9', status: 'open' },
      }),
    ]);
    fireEvent.click(screen.getByTestId('deviation-resolve-open-a'));
    expect(screen.getByTestId('deviation-resolve-hold-prompt')).toBeInTheDocument();
    const link = screen.getByTestId('deviation-resolve-hold-link');
    expect(link).toHaveAttribute('href', '/en/quality/holds/hold-uuid-123');
    expect(link).toHaveTextContent('HOLD-2026-007');
  });

  it('submit is disabled until actionTaken + disposition + PIN are all present', () => {
    renderList([makeRow({ id: 'a' })]);
    fireEvent.click(screen.getByTestId('deviation-resolve-open-a'));
    const submit = screen.getByTestId('deviation-resolve-submit');
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByTestId('deviation-resolve-action'), { target: { value: 'Reworked the batch' } });
    expect(submit).toBeDisabled();
    fireEvent.click(within(screen.getByTestId('deviation-resolve-disposition')).getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: RESOLVE_LABELS.dispositionOptions.corrected }));
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByTestId('deviation-resolve-password'), { target: { value: '1234' } });
    expect(submit).not.toBeDisabled();
  });

  it('submits the EXACT resolveCcpDeviation payload — (id, { actionTaken, disposition, signature:{password} }) — and closes', async () => {
    const { resolveAction } = renderList([makeRow({ id: 'dev-77' })]);
    fireEvent.click(screen.getByTestId('deviation-resolve-open-dev-77'));

    fireEvent.change(screen.getByTestId('deviation-resolve-action'), { target: { value: '  Recooked to 75°C  ' } });
    fireEvent.click(within(screen.getByTestId('deviation-resolve-disposition')).getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: RESOLVE_LABELS.dispositionOptions.corrected }));
    fireEvent.change(screen.getByTestId('deviation-resolve-password'), { target: { value: 'secret-pin' } });
    fireEvent.click(screen.getByTestId('deviation-resolve-submit'));

    await waitFor(() => expect(resolveAction).toHaveBeenCalledTimes(1));
    expect(resolveAction).toHaveBeenCalledWith('dev-77', {
      actionTaken: 'Recooked to 75°C',
      disposition: 'corrected',
      signature: { password: 'secret-pin' },
    });
    await waitFor(() => expect(screen.queryByTestId('deviation-resolve-form')).not.toBeInTheDocument());
  });

  it('a forbidden / error resolve result surfaces the action message VERBATIM and keeps the modal open', async () => {
    const resolveAction = vi.fn(async () => ({ ok: false as const, reason: 'error' as const, message: 'Invalid signature' }));
    renderList([makeRow({ id: 'a' })], { resolveAction });
    fireEvent.click(screen.getByTestId('deviation-resolve-open-a'));
    fireEvent.change(screen.getByTestId('deviation-resolve-action'), { target: { value: 'Reworked' } });
    fireEvent.click(within(screen.getByTestId('deviation-resolve-disposition')).getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: RESOLVE_LABELS.dispositionOptions.product_held }));
    fireEvent.change(screen.getByTestId('deviation-resolve-password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByTestId('deviation-resolve-submit'));

    await waitFor(() => expect(resolveAction).toHaveBeenCalled());
    expect(await screen.findByTestId('deviation-resolve-error')).toHaveTextContent('Invalid signature');
    expect(screen.getByTestId('deviation-resolve-form')).toBeInTheDocument();
  });
});

describe('i18n (no leaked dotted keys)', () => {
  it('resolves every list + resolve label in en and pl', () => {
    for (const t of [tEn, tPl]) {
      const list = buildDeviationListLabels(t);
      const resolve = buildDeviationResolveLabels(t);
      const flat = JSON.stringify([list, resolve]);
      // a leaked key would look like "resolveModal.esign.title" — a dotted lowerCamel path.
      expect(flat).not.toMatch(/[a-z]+\.[a-z]+\.[a-zA-Z]/);
    }
  });

  it('en + pl differ (real translations, not an en clone)', () => {
    expect(tPl('title')).not.toBe(tEn('title'));
    expect(tPl('status.open')).not.toBe(tEn('status.open'));
    expect(tPl('resolveModal.submit')).not.toBe(tEn('resolveModal.submit'));
    expect(tPl('nav.title')).not.toBe(tEn('nav.title'));
  });
});
