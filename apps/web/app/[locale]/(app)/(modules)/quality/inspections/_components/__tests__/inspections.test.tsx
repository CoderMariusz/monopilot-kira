/**
 * QA-005 / QA-005a — Quality inspections client islands: RTL parity + state tests.
 *
 * Prototype: prototypes/design/Monopilot Design System/quality/
 *   inspection-screens.jsx:3-97 (QaIncomingList) + 100-297 (QaInspectionDetail).
 *
 * Tests the presentational client islands directly (the pages are async RSCs that
 * read Supabase via listInspections / getInspectionDetail and render the denied /
 * error / empty panels). The Server Actions are passed in as props, so we inject
 * vi.fn() stubs and assert the exact payloads. Covers: status tabs + counts + search
 * + empty / empty-filtered (list), create-modal payload + reference-required
 * validation, editable parameter rows + overall result auto-computation + decision
 * e-sign payload (detail), decided-inspection immutability (banner + no editable
 * inputs / decision buttons), permission-denied (canDecide=false hides decision
 * buttons), and that en + pl resolve every staged key (no leaked dotted key).
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { InspectionsListClient } from '../inspections-list.client';
import { InspectionDetailClient } from '../../[inspectionId]/_components/inspection-detail.client';
import {
  buildInspectionsListLabels,
  buildInspectionCreateLabels,
  buildInspectionDetailLabels,
} from '../labels';
import { getQaInspectionsTranslator } from '../../../qa-inspections-labels';
import type { InspectionDetail, InspectionListRow } from '../inspection-contracts';

const navigationMocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: navigationMocks.refresh }) }));

const tEn = getQaInspectionsTranslator('en');
const tPl = getQaInspectionsTranslator('pl');
const LIST_LABELS = buildInspectionsListLabels(tEn);
const CREATE_LABELS = buildInspectionCreateLabels(tEn);
const DETAIL_LABELS = buildInspectionDetailLabels(tEn);

function makeRow(over: Partial<InspectionListRow>): InspectionListRow {
  return {
    id: over.id ?? 'i-1',
    inspectionNumber: over.inspectionNumber ?? 'INS-2026-0001',
    referenceType: over.referenceType ?? 'lp',
    referenceId: over.referenceId ?? 'ref-1',
    referenceDisplay: over.referenceDisplay ?? 'LP-4820',
    productCode: over.productCode ?? 'RM-1001',
    productName: over.productName ?? 'Beef trim',
    status: over.status ?? 'pending',
    assignedTo:
      over.assignedTo ?? { id: 'u-1', email: 'qa.inspector@co', name: 'QA Inspector' },
    dueDate: over.dueDate ?? '2026-05-01',
    createdAt: over.createdAt ?? '2026-04-21T10:00:00.000Z',
  };
}

const LP_ID = '44444444-4444-4444-8444-444444444444';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const LP1 = { id: LP_ID, lpNumber: 'LP-000123', itemCode: 'RM-BEEF-01', qty: '12.5', uom: 'kg', status: 'available' };
const USER1 = { id: USER_ID, name: 'QA Inspector', email: 'qa.inspector@co' };

function renderList(
  rows: InspectionListRow[],
  createInspectionAction = vi.fn(async () => ({ ok: true as const, data: { id: 'new', inspectionNumber: 'INS-NEW' } })),
  pickers?: {
    searchLps?: ReturnType<typeof vi.fn>;
    resolveGrn?: ReturnType<typeof vi.fn>;
    resolveWoOutput?: ReturnType<typeof vi.fn>;
    searchAssignees?: ReturnType<typeof vi.fn>;
  },
) {
  const searchLps = pickers?.searchLps ?? vi.fn(async () => ({ ok: true as const, data: [LP1] }));
  const resolveGrn = pickers?.resolveGrn ?? vi.fn(async () => ({ ok: true as const, data: { id: 'grn1', display: 'GRN-1' } }));
  const resolveWoOutput =
    pickers?.resolveWoOutput ?? vi.fn(async () => ({ ok: true as const, data: { id: 'woo1', display: 'WO-1 / BATCH-1' } }));
  const searchAssignees = pickers?.searchAssignees ?? vi.fn(async () => ({ ok: true as const, data: [USER1] }));
  render(
    <InspectionsListClient
      rows={rows}
      labels={LIST_LABELS}
      createLabels={CREATE_LABELS}
      locale="en"
      createInspectionAction={createInspectionAction as never}
      searchLpsAction={searchLps as never}
      resolveGrnAction={resolveGrn as never}
      resolveWoOutputAction={resolveWoOutput as never}
      searchAssigneesAction={searchAssignees as never}
    />,
  );
  return { createInspectionAction, searchLps, resolveGrn, resolveWoOutput, searchAssignees };
}

describe('InspectionsListClient (QA-005 parity)', () => {
  it('renders status tabs with counts and defaults to All', () => {
    renderList([
      makeRow({ id: 'a', status: 'pending' }),
      makeRow({ id: 'b', status: 'in_progress' }),
      makeRow({ id: 'c', status: 'passed' }),
    ]);
    expect(screen.getByTestId('inspection-tab-all')).toHaveAttribute('aria-selected', 'true');
    expect(within(screen.getByTestId('inspection-tab-all')).getByText('3')).toBeInTheDocument();
    expect(within(screen.getByTestId('inspection-tab-pending')).getByText('1')).toBeInTheDocument();
    expect(within(screen.getByTestId('inspection-tab-in_progress')).getByText('1')).toBeInTheDocument();
  });

  it('filters rows by status tab and by search', () => {
    renderList([
      makeRow({ id: 'a', inspectionNumber: 'INS-AAA', status: 'pending' }),
      makeRow({ id: 'b', inspectionNumber: 'INS-BBB', status: 'failed', referenceDisplay: 'LP-9' }),
    ]);
    fireEvent.click(screen.getByTestId('inspection-tab-failed'));
    expect(screen.getByTestId('inspection-row-b')).toBeInTheDocument();
    expect(screen.queryByTestId('inspection-row-a')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('inspection-tab-all'));
    fireEvent.change(screen.getByTestId('inspections-list-search'), { target: { value: 'aaa' } });
    expect(screen.getByTestId('inspection-row-a')).toBeInTheDocument();
    expect(screen.queryByTestId('inspection-row-b')).not.toBeInTheDocument();
  });

  it('renders product names in the list and searches by product name', () => {
    renderList([
      makeRow({ id: 'a', productCode: 'RM-1001', productName: 'Beef trim' }),
      makeRow({ id: 'b', productCode: 'RM-2002', productName: 'Pork shoulder' }),
    ]);
    expect(screen.getByTestId('inspection-row-a')).toHaveTextContent('RM-1001 · Beef trim');

    fireEvent.change(screen.getByTestId('inspections-list-search'), { target: { value: 'shoulder' } });
    expect(screen.queryByTestId('inspection-row-a')).not.toBeInTheDocument();
    expect(screen.getByTestId('inspection-row-b')).toBeInTheDocument();
  });

  it('shows the empty state when there are no inspections', () => {
    renderList([]);
    expect(screen.getByTestId('inspections-list-empty')).toHaveAttribute('data-state', 'empty');
  });

  it('shows the filtered-empty state when filters exclude every row', () => {
    renderList([makeRow({ id: 'a', status: 'pending' })]);
    fireEvent.change(screen.getByTestId('inspections-list-search'), { target: { value: 'zzz' } });
    expect(screen.getByTestId('inspections-list-empty-filtered')).toBeInTheDocument();
  });

  it('create modal: requires a reference, then submits the RESOLVED LP uuid (no raw-UUID input)', async () => {
    const { createInspectionAction, searchLps } = renderList([makeRow({ id: 'a' })]);
    fireEvent.click(screen.getByTestId('inspection-create-open'));
    // submit disabled until a reference is picked.
    expect(screen.getByTestId('inspection-create-submit')).toBeDisabled();
    // No raw reference text input for lp — the live LP search box is shown.
    expect(screen.getByTestId('inspection-create-lp-search')).toBeInTheDocument();
    expect(screen.queryByTestId('inspection-create-reference')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('inspection-create-lp-search'), { target: { value: 'LP-0001' } });
    await waitFor(() => expect(searchLps).toHaveBeenCalledWith({ query: 'LP-0001', limit: 10 }));
    fireEvent.click(await screen.findByTestId(`inspection-create-lp-result-${LP_ID}`));
    // Confirmation chip shows the picked LP, submit now enabled.
    expect(screen.getByTestId('inspection-create-lp-chip')).toHaveTextContent('LP-000123');

    fireEvent.click(screen.getByTestId('inspection-create-submit'));
    await waitFor(() => expect(createInspectionAction).toHaveBeenCalledTimes(1));
    const payload = (createInspectionAction as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.referenceType).toBe('lp');
    expect(payload.referenceId).toBe(LP_ID); // the UUID, NOT "LP-0001"
  });

  it('create modal: assignee picker resolves a typed name to the user uuid', async () => {
    const { createInspectionAction, searchLps, searchAssignees } = renderList([makeRow({ id: 'a' })]);
    fireEvent.click(screen.getByTestId('inspection-create-open'));

    fireEvent.change(screen.getByTestId('inspection-create-lp-search'), { target: { value: 'LP-0001' } });
    await waitFor(() => expect(searchLps).toHaveBeenCalled());
    fireEvent.click(await screen.findByTestId(`inspection-create-lp-result-${LP_ID}`));

    // No free-text email — a searchable user picker.
    fireEvent.change(screen.getByTestId('inspection-create-assignee'), { target: { value: 'QA' } });
    await waitFor(() => expect(searchAssignees).toHaveBeenCalledWith({ query: 'QA', limit: 10 }));
    fireEvent.click(await screen.findByTestId(`inspection-create-assignee-result-${USER_ID}`));
    expect(screen.getByTestId('inspection-create-assignee-chip')).toHaveTextContent('QA Inspector');

    fireEvent.click(screen.getByTestId('inspection-create-submit'));
    await waitFor(() => expect(createInspectionAction).toHaveBeenCalledTimes(1));
    expect(createInspectionAction).toHaveBeenCalledWith(
      expect.objectContaining({ referenceType: 'lp', referenceId: LP_ID, assignedTo: USER_ID }),
    );
  });

  it('create modal refreshes the list after a successful create', async () => {
    navigationMocks.refresh.mockClear();
    const { createInspectionAction, searchLps } = renderList([makeRow({ id: 'a' })]);
    fireEvent.click(screen.getByTestId('inspection-create-open'));

    fireEvent.change(screen.getByTestId('inspection-create-lp-search'), { target: { value: 'LP-0001' } });
    await waitFor(() => expect(searchLps).toHaveBeenCalled());
    fireEvent.click(await screen.findByTestId(`inspection-create-lp-result-${LP_ID}`));

    fireEvent.click(screen.getByTestId('inspection-create-submit'));
    await waitFor(() => expect(createInspectionAction).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(navigationMocks.refresh).toHaveBeenCalledTimes(1));
  });

  it('create modal: grn reference resolves the typed NUMBER to a uuid on submit', async () => {
    const { createInspectionAction, resolveGrn } = renderList([makeRow({ id: 'a' })]);
    fireEvent.click(screen.getByTestId('inspection-create-open'));

    // Switch reference type to grn via the shadcn Select combobox (no raw <select>).
    fireEvent.click(within(screen.getByTestId('inspection-create-reftype')).getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: CREATE_LABELS.refTypeOptions.grn }));

    // grn → honest number input (not the LP search).
    expect(screen.queryByTestId('inspection-create-lp-search')).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('inspection-create-reference'), { target: { value: 'GRN-000001' } });
    fireEvent.click(screen.getByTestId('inspection-create-submit'));

    await waitFor(() => expect(resolveGrn).toHaveBeenCalledWith({ grnNumber: 'GRN-000001' }));
    await waitFor(() => expect(createInspectionAction).toHaveBeenCalled());
    const payload = (createInspectionAction as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload).toMatchObject({ referenceType: 'grn', referenceId: 'grn1' });
  });

  it('create modal: an unresolvable grn number blocks submit and shows the inline error', async () => {
    const resolveGrn = vi.fn(async () => ({ ok: true as const, data: null }));
    const { createInspectionAction } = renderList([makeRow({ id: 'a' })], undefined, { resolveGrn });
    fireEvent.click(screen.getByTestId('inspection-create-open'));

    fireEvent.click(within(screen.getByTestId('inspection-create-reftype')).getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: CREATE_LABELS.refTypeOptions.grn }));

    fireEvent.change(screen.getByTestId('inspection-create-reference'), { target: { value: 'GRN-NOPE' } });
    fireEvent.click(screen.getByTestId('inspection-create-submit'));

    await waitFor(() => expect(resolveGrn).toHaveBeenCalled());
    expect(await screen.findByTestId('inspection-create-error')).toHaveTextContent('GRN-NOPE');
    expect(createInspectionAction).not.toHaveBeenCalled();
  });

  it('create modal: a failing createInspection result shows an inline error and keeps the modal open', async () => {
    const createInspectionAction = vi.fn(async () => ({
      ok: false as const,
      reason: 'error',
      message: 'no_active_site',
    }));
    const createLabels = {
      ...CREATE_LABELS,
      siteErrors: {
        no_active_site: 'Select a site before creating an inspection.',
        ambiguous_site: 'Select a site in the top bar before creating an inspection.',
      },
    };
    const searchLps = vi.fn(async () => ({ ok: true as const, data: [LP1] }));
    render(
      <InspectionsListClient
        rows={[makeRow({ id: 'a' })]}
        labels={LIST_LABELS}
        createLabels={createLabels}
        locale="en"
        createInspectionAction={createInspectionAction as never}
        searchLpsAction={searchLps as never}
        resolveGrnAction={vi.fn() as never}
        resolveWoOutputAction={vi.fn() as never}
        searchAssigneesAction={vi.fn() as never}
      />,
    );

    fireEvent.click(screen.getByTestId('inspection-create-open'));
    fireEvent.change(screen.getByTestId('inspection-create-lp-search'), { target: { value: 'LP-0001' } });
    await waitFor(() => expect(searchLps).toHaveBeenCalled());
    fireEvent.click(await screen.findByTestId(`inspection-create-lp-result-${LP_ID}`));
    fireEvent.click(screen.getByTestId('inspection-create-submit'));

    await waitFor(() => expect(createInspectionAction).toHaveBeenCalled());
    expect(await screen.findByTestId('inspection-create-error')).toHaveTextContent(/select a site before creating/i);
    expect(screen.getByTestId('inspection-create-form')).toBeInTheDocument();
  });
});

function makeDetail(over: Partial<InspectionDetail>): InspectionDetail {
  return {
    id: over.id ?? 'i-1',
    inspectionNumber: over.inspectionNumber ?? 'INS-2026-0474',
    referenceType: over.referenceType ?? 'lp',
    referenceId: over.referenceId ?? 'ref-1',
    referenceDisplay: over.referenceDisplay ?? 'LP-4820',
    productCode: over.productCode ?? 'RM-1001',
    productName: over.productName ?? 'Beef trim',
    status: over.status ?? 'in_progress',
    assignedTo:
      over.assignedTo ?? { id: 'u-1', email: 'qa.inspector@co', name: 'QA Inspector' },
    dueDate: over.dueDate ?? '2026-05-01',
    createdAt: over.createdAt ?? '2026-04-21T10:00:00.000Z',
    parameters:
      over.parameters ?? [
        { name: 'Core temp', expected: '0–4 °C', actual: '', pass: false },
        { name: 'pH', expected: '5.4–5.8', actual: '', pass: false },
      ],
    resultNotes: over.resultNotes ?? null,
    decidedBy: over.decidedBy ?? null,
    decidedAt: over.decidedAt ?? null,
    holdId: over.holdId ?? null,
  };
}

function renderDetail(
  detail: InspectionDetail,
  canDecide = true,
  actions?: { record?: ReturnType<typeof vi.fn>; submit?: ReturnType<typeof vi.fn> },
) {
  const record = actions?.record ?? vi.fn(async () => ({ ok: true as const, data: { id: detail.id, status: detail.status } }));
  const submit =
    actions?.submit ?? vi.fn(async () => ({ ok: true as const, data: { id: detail.id, status: 'passed' as const } }));
  render(
    <InspectionDetailClient
      inspection={detail}
      canDecide={canDecide}
      labels={DETAIL_LABELS}
      locale="en"
      recordResultAction={record as never}
      submitDecisionAction={submit as never}
    />,
  );
  return { record, submit };
}

describe('InspectionDetailClient (QA-005a parity)', () => {
  it('overall result is PENDING with no parameters, and auto-computes FAIL/PASS from toggles', () => {
    // empty parameters → overall pending (a freshly opened inspection)
    const { unmount } = render(
      <InspectionDetailClient
        inspection={makeDetail({ parameters: [] })}
        canDecide
        labels={DETAIL_LABELS}
        locale="en"
        recordResultAction={vi.fn() as never}
        submitDecisionAction={vi.fn() as never}
      />,
    );
    expect(screen.getByTestId('inspection-overall')).toHaveAttribute('data-overall', 'pending');
    unmount();

    // two seeded rows: toggling pass/fail recomputes the banner.
    renderDetail(makeDetail({}));
    fireEvent.click(screen.getByTestId('inspection-param-pass-0'));
    fireEvent.click(screen.getByTestId('inspection-param-fail-1'));
    expect(screen.getByTestId('inspection-overall')).toHaveAttribute('data-overall', 'fail');

    fireEvent.click(screen.getByTestId('inspection-param-pass-1'));
    expect(screen.getByTestId('inspection-overall')).toHaveAttribute('data-overall', 'pass');
  });

  it('records results via recordInspectionResult with the edited parameters', async () => {
    const { record } = renderDetail(makeDetail({}));
    fireEvent.change(screen.getByTestId('inspection-param-actual-0'), { target: { value: '2.1' } });
    fireEvent.click(screen.getByTestId('inspection-param-pass-0'));
    fireEvent.click(screen.getByTestId('inspection-result-save'));
    await waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        inspectionId: 'i-1',
        parameters: expect.arrayContaining([
          expect.objectContaining({ name: 'Core temp', actual: '2.1', pass: true }),
        ]),
      }),
    );
  });

  it('decision e-sign: Pass opens the password modal and submits the decision payload', async () => {
    const { submit } = renderDetail(makeDetail({}));
    fireEvent.click(screen.getByTestId('inspection-decision-pass'));
    // password required → submit disabled
    expect(screen.getByTestId('inspection-esign-submit')).toBeDisabled();
    fireEvent.change(screen.getByTestId('inspection-esign-password'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByTestId('inspection-esign-submit'));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ inspectionId: 'i-1', decision: 'pass', signature: { password: 'secret' } }),
    );
  });

  it('surfaces an e-sign failure verbatim and keeps the modal open', async () => {
    const submit = vi.fn(async () => ({ ok: false as const, reason: 'bad_signature', message: 'Invalid password' }));
    renderDetail(makeDetail({}), true, { submit });
    fireEvent.click(screen.getByTestId('inspection-decision-fail'));
    fireEvent.change(screen.getByTestId('inspection-esign-password'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByTestId('inspection-esign-submit'));
    await waitFor(() => expect(screen.getByTestId('inspection-esign-error')).toHaveTextContent('Invalid password'));
  });

  it('decided inspection is immutable: signed banner, no editable inputs, no decision buttons', () => {
    renderDetail(
      makeDetail({
        status: 'passed',
        decidedBy: 'qa.lead@co',
        decidedAt: '2026-04-22T09:00:00.000Z',
        parameters: [{ name: 'Core temp', expected: '0–4 °C', actual: '2.1', pass: true }],
      }),
    );
    expect(screen.getByTestId('inspection-detail-signed-banner')).toBeInTheDocument();
    expect(screen.getByTestId('inspection-param-actual-0')).toBeDisabled();
    expect(screen.queryByTestId('inspection-decision-buttons')).not.toBeInTheDocument();
    expect(screen.getByTestId('inspection-decision-result')).toHaveTextContent(DETAIL_LABELS.decision.passed);
  });

  it('held inspection deep-links to the resolved hold when getInspectionDetail returned a holdId', () => {
    renderDetail(
      makeDetail({ status: 'on_hold', decidedAt: '2026-04-22T09:00:00.000Z', holdId: 'hold-77' }),
    );
    const link = screen.getByTestId('inspection-decision-hold-link');
    expect(link).toHaveAttribute('href', '/en/quality/holds/hold-77');
  });

  it('held inspection falls back to the holds list when no holdId resolved', () => {
    renderDetail(
      makeDetail({ status: 'on_hold', decidedAt: '2026-04-22T09:00:00.000Z', holdId: null }),
    );
    const link = screen.getByTestId('inspection-decision-hold-link');
    expect(link).toHaveAttribute('href', '/en/quality/holds');
  });

  it('shows product code and name in the reference context', () => {
    renderDetail(makeDetail({ productCode: 'RM-1001', productName: 'Beef trim' }));
    expect(screen.getByTestId('inspection-detail-context')).toHaveTextContent('RM-1001 · Beef trim');
  });

  it('permission-denied: canDecide=false hides editable inputs and decision buttons', () => {
    renderDetail(makeDetail({}), false);
    expect(screen.queryByTestId('inspection-decision-buttons')).not.toBeInTheDocument();
    expect(screen.getByTestId('inspection-decision-denied')).toBeInTheDocument();
    // parameter inputs are disabled (not editable) when canDecide is false.
    expect(screen.getByTestId('inspection-param-actual-0')).toBeDisabled();
  });
});

describe('i18n (no leaked dotted keys)', () => {
  it('resolves every list/create/detail label in en and pl', () => {
    for (const t of [tEn, tPl]) {
      const list = buildInspectionsListLabels(t);
      const create = buildInspectionCreateLabels(t);
      const detail = buildInspectionDetailLabels(t);
      const flat = JSON.stringify([list, create, detail]);
      // a leaked key would look like "list.columns.due" — a dotted lowerCamel path.
      expect(flat).not.toMatch(/[a-z]+\.[a-z]+\.[a-zA-Z]/);
    }
  });
});
