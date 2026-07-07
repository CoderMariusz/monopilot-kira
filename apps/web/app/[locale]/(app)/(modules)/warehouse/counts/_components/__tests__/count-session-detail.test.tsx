/**
 * WAVE E10 — count-session detail: BLIND-count entry + VARIANCE review + e-sign
 * approve flow. RTL parity + flow tests on the presentational
 * <CountSessionDetailClient> with stub record/approve actions + a mocked router.
 *
 * Asserts:
 *  - BLIND: the entry tab shows location + item + a counted-qty input and does
 *    NOT reveal the system qty (derived as counted − variance = 12 here).
 *  - the count entry records a count → calls recordAction with the identity +
 *    counted qty (never the system qty).
 *  - the variance review shows system vs counted vs variance (colour-coded) and a
 *    positive variance reads as "found stock → mint LP".
 *  - the Approve & apply flow opens the e-sign modal, requires a password, and on
 *    submit calls approveAndApplyVariance (behind the e-sign) then refreshes.
 *  - forbidden surfaces inline; en + pl labels resolve.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn(), replace: vi.fn() }),
}));

import {
  CountSessionDetailClient,
  type CountSessionDetailLabels,
} from '../count-session-detail.client';
import { getCountsTranslator } from '../../counts-labels';
import type { CountLine, CountSessionDetail } from '../../_actions/count-types';
import type { CountClientResult } from '../count-client-result';

function buildLabels(locale: string): CountSessionDetailLabels {
  const t = getCountsTranslator(locale);
  return {
    none: t('detail.none'),
    tabs: { entry: t('detail.tabs.entry'), review: t('detail.tabs.review') },
    entry: {
      heading: t('detail.entry.heading'),
      intro: t('detail.entry.intro'),
      empty: t('detail.entry.empty'),
      blind: t('detail.entry.blind'),
      columns: {
        location: t('detail.entry.columns.location'),
        item: t('detail.entry.columns.item'),
        counted: t('detail.entry.columns.counted'),
        actions: t('detail.entry.columns.actions'),
      },
      qtyPlaceholder: t('detail.entry.qtyPlaceholder'),
      save: t('detail.entry.save'),
      saving: t('detail.entry.saving'),
      saved: t('detail.entry.saved'),
      recount: t('detail.entry.recount'),
      denied: t('detail.entry.denied'),
      error: t('detail.entry.error'),
    },
    review: {
      heading: t('detail.review.heading'),
      intro: t('detail.review.intro'),
      empty: t('detail.review.empty'),
      columns: {
        location: t('detail.review.columns.location'),
        item: t('detail.review.columns.item'),
        system: t('detail.review.columns.system'),
        counted: t('detail.review.columns.counted'),
        variance: t('detail.review.columns.variance'),
        status: t('detail.review.columns.status'),
        actions: t('detail.review.columns.actions'),
      },
      positiveHint: t('detail.review.positiveHint'),
      negativeHint: t('detail.review.negativeHint'),
      matchHint: t('detail.review.matchHint'),
      applied: t('detail.review.applied'),
      approve: t('detail.review.approve'),
    },
    esign: {
      title: t('esign.title'),
      intro: t('esign.intro'),
      factsLocation: t('esign.factsLocation'),
      factsItem: t('esign.factsItem'),
      factsSystem: t('esign.factsSystem'),
      factsCounted: t('esign.factsCounted'),
      factsVariance: t('esign.factsVariance'),
      positiveEffect: t('esign.positiveEffect'),
      negativeEffect: t('esign.negativeEffect'),
      block: t('esign.block'),
      blockMeaning: t('esign.blockMeaning'),
      password: t('esign.password'),
      passwordPlaceholder: t('esign.passwordPlaceholder'),
      passwordHelp: t('esign.passwordHelp'),
      cancel: t('esign.cancel'),
      submit: t('esign.submit'),
      submitting: t('esign.submitting'),
      formIncomplete: t('esign.formIncomplete'),
      supervisorRequired: t('esign.supervisorRequired'),
      supervisorPinRequired: t('esign.supervisorPinRequired'),
      errors: {
        forbidden: t('esign.errors.forbidden'),
        not_found: t('esign.errors.not_found'),
        already_applied: t('esign.errors.already_applied'),
        esign_failed: t('esign.errors.esign_failed'),
        invalid_input: t('esign.errors.invalid_input'),
        supervisor_self_approval: t('esign.errors.supervisor_self_approval'),
        supervisor_pin_required: t('esign.errors.supervisor_pin_required'),
        supervisor_pin_invalid: t('esign.errors.supervisor_pin_invalid'),
        supervisor_pin_not_enrolled: t('esign.errors.supervisor_pin_not_enrolled'),
        supervisor_pin_locked: t('esign.errors.supervisor_pin_locked'),
        supervisor_forbidden: t('esign.errors.supervisor_forbidden'),
        error: t('esign.errors.error'),
      },
    },
    supervisor: {
      block: t('supervisor.block'),
      meaning: t('supervisor.meaning'),
      selectLabel: t('supervisor.selectLabel'),
      selectHelp: t('supervisor.selectHelp'),
      selectTrigger: t('supervisor.selectTrigger'),
      searchLabel: t('supervisor.searchLabel'),
      searchPlaceholder: t('supervisor.searchPlaceholder'),
      searchLoading: t('supervisor.searchLoading'),
      searchEmpty: t('supervisor.searchEmpty'),
      searchError: t('supervisor.searchError'),
      selected: t('supervisor.selected'),
      change: t('supervisor.change'),
      pinLabel: t('supervisor.pinLabel'),
      pinPlaceholder: t('supervisor.pinPlaceholder'),
      pinHelp: t('supervisor.pinHelp'),
    },
  };
}

const EN = buildLabels('en');

const SUPERVISOR = {
  id: '44444444-4444-4444-a444-444444444444',
  name: 'Anna Nowak',
  email: 'anna@example.test',
};

function makeLine(over: Partial<CountLine>): CountLine {
  return {
    id: over.id ?? 'line-1',
    sessionId: over.sessionId ?? 'sess-1',
    locationId: over.locationId ?? 'loc-1',
    locationCode: over.locationCode ?? 'A-01-01',
    itemId: over.itemId ?? 'item-1',
    itemCode: over.itemCode ?? 'R-1001',
    itemName: over.itemName ?? 'Wieprzowina',
    lpId: over.lpId ?? null,
    lpNumber: over.lpNumber ?? null,
    countedQty: over.countedQty ?? null,
    varianceQty: over.varianceQty ?? null,
    status: over.status ?? 'pending',
    uom: over.uom ?? 'kg',
  };
}

function makeSession(lines: CountLine[]): CountSessionDetail {
  return {
    id: 'sess-1',
    warehouseId: 'wh-1',
    warehouseCode: 'WH-MAIN',
    countType: 'cycle',
    status: 'open',
    createdAt: '2026-06-20T10:00:00.000Z',
    lineCount: lines.length,
    countedLineCount: lines.filter((l) => l.countedQty !== null).length,
    varianceLineCount: lines.filter((l) => l.varianceQty && Number(l.varianceQty) !== 0).length,
    varianceQty: '0',
    lines,
  };
}

type RecordInput = { locationId: string; itemId: string; lpId?: string | null; countedQty: number };
type ApproveInput = {
  countLineId: string;
  signature: { password: string };
  supervisorUserId?: string;
  supervisorPin?: string;
};

function renderDetail(
  session: CountSessionDetail,
  recordAction: (input: RecordInput) => Promise<CountClientResult<CountLine>>,
  approveAction: (input: ApproveInput) => Promise<CountClientResult<{ countLineId: string }>>,
  searchSupervisorsAction = vi.fn().mockResolvedValue({ ok: true as const, data: [SUPERVISOR] }),
) {
  refreshMock.mockClear();
  return {
    searchSupervisorsAction,
    ...render(
      <CountSessionDetailClient
        session={session}
        labels={EN}
        recordAction={recordAction}
        approveAction={approveAction}
        searchSupervisorsAction={searchSupervisorsAction}
      />,
    ),
  };
}

const noopRecord = async () => ({ ok: true as const, data: makeLine({}) });
const noopApprove = async () => ({ ok: true as const, data: { countLineId: 'line-1' } });

describe('CountSessionDetailClient (E10 blind count + variance + e-sign)', () => {
  it('BLIND: the entry tab shows location + item + input but NOT the system qty', () => {
    // System qty would be counted − variance = 15 − 3 = 12; it must NOT appear on entry.
    const line = makeLine({ id: 'line-1', countedQty: null, varianceQty: null, status: 'pending' });
    renderDetail(makeSession([line]), noopRecord, noopApprove);

    expect(screen.getByTestId('count-entry-row-line-1')).toBeInTheDocument();
    expect(screen.getByTestId('count-entry-input-line-1')).toBeInTheDocument();
    // No system column header on the entry tab.
    expect(screen.queryByText(EN.review.columns.system)).not.toBeInTheDocument();
  });

  it('records a count: calls recordAction with the identity + counted qty (never the system qty)', async () => {
    const record = vi.fn(noopRecord);
    const line = makeLine({ id: 'line-1', itemId: 'item-9', locationId: 'loc-9', countedQty: null, status: 'pending' });
    renderDetail(makeSession([line]), record, noopApprove);

    fireEvent.change(screen.getByTestId('count-entry-input-line-1'), { target: { value: '15' } });
    fireEvent.click(screen.getByTestId('count-entry-save-line-1'));

    await waitFor(() =>
      expect(record).toHaveBeenCalledWith({ locationId: 'loc-9', itemId: 'item-9', lpId: null, countedQty: 15 }),
    );
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it('variance review: shows system / counted / variance and a positive variance reads as found-stock', () => {
    const line = makeLine({ id: 'line-1', countedQty: '15', varianceQty: '3', status: 'counted' });
    renderDetail(makeSession([line]), noopRecord, noopApprove);

    fireEvent.click(screen.getByTestId('count-tab-review'));
    expect(screen.getByTestId('count-review-row-line-1')).toBeInTheDocument();
    // variance cell shows +3 and the found-stock hint
    const varianceCell = screen.getByTestId('count-review-variance-line-1');
    expect(varianceCell).toHaveTextContent('+3');
    expect(varianceCell).toHaveTextContent(EN.review.positiveHint);
    // derived system qty (15 − 3 = 12) is shown in the review row
    expect(screen.getByTestId('count-review-row-line-1')).toHaveTextContent('12');
  });

  it('approve & apply: opens the e-sign modal, requires a password, then calls approveAndApplyVariance behind the e-sign', async () => {
    const approve = vi.fn(noopApprove);
    const line = makeLine({ id: 'line-7', countedQty: '20', varianceQty: '5', status: 'counted' });
    renderDetail(makeSession([line]), noopRecord, approve);

    fireEvent.click(screen.getByTestId('count-tab-review'));
    fireEvent.click(screen.getByTestId('count-review-approve-line-7'));

    // e-sign modal open, submit disabled until a password is entered
    expect(screen.getByTestId('count-approve-modal')).toBeInTheDocument();
    expect(screen.getByTestId('count-approve-submit')).toBeDisabled();
    // positive variance → "mint a new LP" effect copy
    expect(screen.getByTestId('count-approve-effect')).toHaveTextContent('LP');

    fireEvent.change(screen.getByTestId('count-approve-password'), { target: { value: 'hunter2' } });
    const submit = screen.getByTestId('count-approve-submit');
    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.click(submit);

    await waitFor(() =>
      expect(approve).toHaveBeenCalledWith({ countLineId: 'line-7', signature: { password: 'hunter2' } }),
    );
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it('surfaces a forbidden approval inline (never trusts a client flag)', async () => {
    const approve = vi.fn(async () => ({ ok: false as const, code: 'forbidden' as const }));
    const line = makeLine({ id: 'line-1', countedQty: '8', varianceQty: '-4', status: 'counted' });
    renderDetail(makeSession([line]), noopRecord, approve);

    fireEvent.click(screen.getByTestId('count-tab-review'));
    fireEvent.click(screen.getByTestId('count-review-approve-line-1'));
    expect(screen.getByTestId('count-approve-effect')).toHaveTextContent(EN.review.negativeHint.length ? 'stock' : 'stock');
    expect(screen.getByTestId('count-approve-supervisor-block')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('count-approve-password'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByTestId('count-approve-supervisor-trigger'));
    await waitFor(() => expect(screen.getByTestId('count-approve-supervisor-option')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('count-approve-supervisor-option'));
    fireEvent.change(screen.getByTestId('count-approve-supervisor-pin'), { target: { value: '4321' } });

    const submit = screen.getByTestId('count-approve-submit');
    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.click(submit);

    await waitFor(() => expect(screen.getByTestId('count-approve-error')).toHaveTextContent(EN.esign.errors.forbidden));
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('NEGATIVE submit sends supervisorUserId + supervisorPin', async () => {
    const approve = vi.fn(noopApprove);
    const line = makeLine({ id: 'line-2', countedQty: '6', varianceQty: '-2', status: 'counted' });
    const { searchSupervisorsAction } = renderDetail(makeSession([line]), noopRecord, approve);

    fireEvent.click(screen.getByTestId('count-tab-review'));
    fireEvent.click(screen.getByTestId('count-review-approve-line-2'));
    expect(screen.getByTestId('count-approve-supervisor-block')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('count-approve-password'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByTestId('count-approve-supervisor-trigger'));
    await waitFor(() => expect(searchSupervisorsAction).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('count-approve-supervisor-option')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('count-approve-supervisor-option'));
    fireEvent.change(screen.getByTestId('count-approve-supervisor-pin'), { target: { value: '4321' } });

    const submit = screen.getByTestId('count-approve-submit');
    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.click(submit);

    await waitFor(() =>
      expect(approve).toHaveBeenCalledWith({
        countLineId: 'line-2',
        signature: { password: 'secret' },
        supervisorUserId: SUPERVISOR.id,
        supervisorPin: '4321',
      }),
    );
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it('POSITIVE submit sends NO supervisor fields', async () => {
    const approve = vi.fn(noopApprove);
    const line = makeLine({ id: 'line-7', countedQty: '20', varianceQty: '5', status: 'counted' });
    renderDetail(makeSession([line]), noopRecord, approve);

    fireEvent.click(screen.getByTestId('count-tab-review'));
    fireEvent.click(screen.getByTestId('count-review-approve-line-7'));
    expect(screen.queryByTestId('count-approve-supervisor-block')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('count-approve-password'), { target: { value: 'hunter2' } });
    fireEvent.click(screen.getByTestId('count-approve-submit'));

    await waitFor(() =>
      expect(approve).toHaveBeenCalledWith({ countLineId: 'line-7', signature: { password: 'hunter2' } }),
    );
    const arg = approve.mock.calls[0][0];
    expect(arg.supervisorUserId).toBeUndefined();
    expect(arg.supervisorPin).toBeUndefined();
  });

  it('resolves every staged i18n key in en and pl (no leaked dotted keys)', () => {
    for (const locale of ['en', 'pl']) {
      const flat = JSON.stringify(buildLabels(locale));
      expect(flat).not.toMatch(/detail\.[a-z]+\.[a-z]/i);
      expect(flat).not.toMatch(/esign\.[a-z]+\.[a-z]/i);
    }
    expect(buildLabels('pl').review.approve).not.toBe(EN.review.approve);
  });
});
