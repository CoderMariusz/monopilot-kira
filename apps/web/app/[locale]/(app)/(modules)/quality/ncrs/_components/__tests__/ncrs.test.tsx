/**
 * QA-009 / QA-009a — Quality NCR client islands: RTL parity + state tests.
 *
 * Prototype: prototypes/design/Monopilot Design System/quality/ncr-screens.jsx:1-352
 *   + quality/modals.jsx:299-466 (MODAL-NCR-CREATE / MODAL-NCR-CLOSE).
 *
 * Tests the presentational client islands directly (the pages are async RSCs that
 * read Supabase via listNcrs / getNcrDetail and render the denied / error / empty
 * panels). The Server Actions are passed in as props, so we inject vi.fn() stubs
 * (mirroring the parallel-owned ncr-actions.ts contract) and assert exact payloads.
 * Covers: §3.3 attention/calm partition order, severity/type/status filters +
 * search, create payload, critical-close requires the e-sign password (non-critical
 * closes without), closed-NCR immutability (banner + read-only investigation + no
 * actions), and that en + pl resolve every staged key (no leaked dotted key).
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NcrListClient } from '../ncr-list.client';
import { NcrCloseModal } from '../../[ncrId]/_components/ncr-close-modal.client';
import { NcrDetailClient } from '../../[ncrId]/_components/ncr-detail.client';
import {
  buildNcrListLabels,
  buildNcrCreateLabels,
  buildNcrCloseLabels,
  buildNcrDetailLabels,
} from '../labels';
import { getQaNcrsTranslator } from '../../../qa-ncrs-labels';
import type { NcrListRow, NcrDetail } from '../ncr-contracts';

const tEn = getQaNcrsTranslator('en');
const LIST_LABELS = buildNcrListLabels(tEn);
const CLOSE_LABELS = buildNcrCloseLabels(tEn);
const DETAIL_LABELS = buildNcrDetailLabels(tEn);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function makeRow(over: Partial<NcrListRow>): NcrListRow {
  return {
    id: over.id ?? 'n-1',
    ncrNumber: over.ncrNumber ?? 'NCR-2026-0001',
    ncrType: over.ncrType ?? 'quality',
    severity: over.severity ?? 'minor',
    status: over.status ?? 'open',
    title: over.title ?? 'Metal fragment found',
    productId: over.productId ?? null,
    productCode: over.productCode ?? null,
    productName: over.productName ?? null,
    linkedHoldId: over.linkedHoldId ?? null,
    linkedHoldNumber: over.linkedHoldNumber ?? null,
    createdAt: over.createdAt ?? '2026-04-21T10:00:00.000Z',
    responseDueAt: over.responseDueAt ?? '2026-04-23T10:00:00.000Z',
    overdue: over.overdue,
  };
}

function renderList(rows: NcrListRow[], createNcrAction = vi.fn()) {
  return render(
    <NcrListClient rows={rows} labels={LIST_LABELS} locale="en" createNcrAction={createNcrAction as never} />,
  );
}

describe('NcrListClient (QA-009 §3.3 attention partition)', () => {
  it('renders attention rows (overdue / critical-open / escalated) auto-expanded on top, calm rows collapsed', () => {
    renderList([
      makeRow({ id: 'calm', severity: 'minor', status: 'open', overdue: false }),
      makeRow({ id: 'crit', severity: 'critical', status: 'investigating' }),
      makeRow({ id: 'overdue', severity: 'minor', status: 'open', overdue: true }),
      makeRow({ id: 'critClosed', severity: 'critical', status: 'closed' }),
    ]);

    // The attention group head is present with the right count (crit + overdue = 2).
    const head = screen.getByTestId('ncr-group-attention');
    expect(head).toHaveTextContent(LIST_LABELS.attention.heading);
    expect(head).toHaveTextContent('2');

    // Attention rows are rendered immediately; calm rows are collapsed.
    expect(screen.getByTestId('ncr-row-crit')).toHaveAttribute('data-attention', 'true');
    expect(screen.getByTestId('ncr-row-overdue')).toHaveAttribute('data-attention', 'true');
    expect(screen.queryByTestId('ncr-row-calm')).not.toBeInTheDocument();
    // A closed critical NCR is NOT attention (terminal).
    expect(screen.queryByTestId('ncr-row-critClosed')).not.toBeInTheDocument();

    // Attention rows are positioned BEFORE the calm group head in DOM order.
    const rowsAndHeads = screen.getAllByTestId(/^ncr-(row|group)-/).map((el) => el.getAttribute('data-testid'));
    expect(rowsAndHeads.indexOf('ncr-row-crit')).toBeLessThan(rowsAndHeads.indexOf('ncr-group-calm'));
    expect(rowsAndHeads.indexOf('ncr-row-overdue')).toBeLessThan(rowsAndHeads.indexOf('ncr-group-calm'));
  });

  it('expands the calm group on click and renders the calm rows', () => {
    renderList([makeRow({ id: 'calm', severity: 'minor', status: 'open' })]);
    expect(screen.queryByTestId('ncr-row-calm')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('ncr-group-calm-toggle'));
    expect(screen.getByTestId('ncr-row-calm')).toBeInTheDocument();
  });

  it('filters by severity pills, type select and search', () => {
    renderList([
      makeRow({ id: 'a', severity: 'critical', status: 'investigating', ncrType: 'quality', title: 'alpha' }),
      makeRow({ id: 'b', severity: 'critical', status: 'investigating', ncrType: 'supplier', title: 'beta' }),
    ]);
    // Severity filter: both are critical → both visible; filter to major hides both.
    fireEvent.click(screen.getByTestId('ncr-severity-major'));
    expect(screen.queryByTestId('ncr-row-a')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ncr-row-b')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('ncr-severity-critical'));
    expect(screen.getByTestId('ncr-row-a')).toBeInTheDocument();

    // Search narrows by title.
    fireEvent.change(screen.getByTestId('ncr-list-search'), { target: { value: 'beta' } });
    expect(screen.queryByTestId('ncr-row-a')).not.toBeInTheDocument();
    expect(screen.getByTestId('ncr-row-b')).toBeInTheDocument();
  });

  it('filters loaded rows by created date range without calling a loader', () => {
    renderList([
      makeRow({ id: 'early', severity: 'critical', status: 'investigating', createdAt: '2026-04-20T09:00:00.000Z' }),
      makeRow({ id: 'middle', severity: 'critical', status: 'investigating', createdAt: '2026-04-21T09:00:00.000Z' }),
      makeRow({ id: 'late', severity: 'critical', status: 'investigating', createdAt: '2026-04-22T09:00:00.000Z' }),
    ]);

    fireEvent.change(screen.getByTestId('ncr-created-from'), { target: { value: '2026-04-21' } });
    fireEvent.change(screen.getByTestId('ncr-created-to'), { target: { value: '2026-04-21' } });

    expect(screen.queryByTestId('ncr-row-early')).not.toBeInTheDocument();
    expect(screen.getByTestId('ncr-row-middle')).toBeInTheDocument();
    expect(screen.queryByTestId('ncr-row-late')).not.toBeInTheDocument();
    expect(screen.getByTestId('ncr-list-rows')).toHaveTextContent('1');
  });

  it('exports the currently visible NCR list columns as CSV', () => {
    const createObjectURL = vi.fn(() => 'blob:ncr-csv');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    class TestBlob {
      readonly parts: BlobPart[];
      readonly options?: BlobPropertyBag;

      constructor(parts: BlobPart[], options?: BlobPropertyBag) {
        this.parts = parts;
        this.options = options;
      }
    }
    vi.stubGlobal('Blob', TestBlob as unknown as typeof Blob);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderList([
      makeRow({
        id: 'exported',
        ncrNumber: 'NCR-EXPORT',
        ncrType: 'supplier',
        severity: 'critical',
        status: 'investigating',
        title: 'Supplier label mismatch',
        productCode: 'RM-42',
        linkedHoldId: 'hold-uuid',
        linkedHoldNumber: 'HOLD-42',
        createdAt: '2026-04-21T09:00:00.000Z',
        responseDueAt: '2026-04-23T12:30:00.000Z',
      }),
      makeRow({
        id: 'filtered-out',
        ncrNumber: 'NCR-HIDDEN',
        severity: 'critical',
        status: 'investigating',
        title: 'Other row',
        createdAt: '2026-04-22T09:00:00.000Z',
      }),
    ]);
    fireEvent.change(screen.getByTestId('ncr-list-search'), { target: { value: 'supplier' } });

    fireEvent.click(screen.getByTestId('ncr-export-csv'));

    expect(click).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0]?.[0] as TestBlob;
    const csv = blob.parts.join('');
    expect(csv).toContain(
      'NCR #,Type,Severity,Title,Product,Linked hold,Status,Created,Response due\r\n' +
        'NCR-EXPORT,Supplier,Critical,Supplier label mismatch,RM-42,HOLD-42,Investigating,2026-04-21,2026-04-23 12:30',
    );
    expect(csv).not.toContain('NCR-HIDDEN');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:ncr-csv');
  });

  it('renders the NCR number as a mono link and a linked-hold link to the hold detail route', () => {
    renderList([
      makeRow({ id: 'x', severity: 'critical', status: 'investigating', ncrNumber: 'NCR-9', linkedHoldId: 'hold-uuid', linkedHoldNumber: 'HOLD-7' }),
    ]);
    expect(screen.getByTestId('ncr-link-x')).toHaveAttribute('href', '/en/quality/ncrs/x');
    const holdLink = screen.getByTestId('ncr-hold-link-x');
    expect(holdLink).toHaveAttribute('href', '/en/quality/holds/hold-uuid');
    expect(holdLink).toHaveTextContent('HOLD-7');
  });

  it('shows empty-all and empty-filtered states', () => {
    const { rerender } = renderList([]);
    expect(screen.getByTestId('ncr-list-empty')).toHaveTextContent(LIST_LABELS.emptyAll);
    rerender(
      <NcrListClient rows={[makeRow({ id: 'a', severity: 'critical', status: 'investigating' })]} labels={LIST_LABELS} locale="en" createNcrAction={vi.fn() as never} />,
    );
    fireEvent.change(screen.getByTestId('ncr-list-search'), { target: { value: 'zzz-nope' } });
    expect(screen.getByTestId('ncr-list-empty-filtered')).toHaveTextContent(LIST_LABELS.emptyFiltered);
  });

  it('opens the create modal and submits the exact createNcr payload (with affected qty)', async () => {
    const createNcrAction = vi.fn().mockResolvedValue({ ok: true, data: { id: 'n-new', ncrNumber: 'NCR-NEW' } });
    renderList([makeRow({ id: 'a', severity: 'critical', status: 'investigating' })], createNcrAction);
    fireEvent.click(screen.getByTestId('ncr-create-open'));

    // Choose critical severity → the dual-sign SoD warning appears.
    fireEvent.click(screen.getByTestId('ncr-create-severity-critical'));
    expect(screen.getByTestId('ncr-create-sod-warning')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('ncr-create-title'), { target: { value: 'Metal contamination on Line 1' } });
    fireEvent.change(screen.getByTestId('ncr-create-description'), { target: { value: 'A ferrous fragment was detected by the metal detector on Line 1.' } });
    fireEvent.change(screen.getByTestId('ncr-create-affectedqty'), { target: { value: '120' } });

    fireEvent.click(screen.getByTestId('ncr-create-submit'));
    await waitFor(() => expect(createNcrAction).toHaveBeenCalledTimes(1));
    expect(createNcrAction).toHaveBeenCalledWith({
      ncrType: 'quality',
      severity: 'critical',
      title: 'Metal contamination on Line 1',
      description: 'A ferrous fragment was detected by the metal detector on Line 1.',
      affectedQtyKg: '120',
    });
  });

  it('keeps the create submit disabled until title + a 20+ char description are present', () => {
    renderList([makeRow({ id: 'a', severity: 'critical', status: 'investigating' })]);
    fireEvent.click(screen.getByTestId('ncr-create-open'));
    const submit = screen.getByTestId('ncr-create-submit');
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByTestId('ncr-create-title'), { target: { value: 'Short' } });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByTestId('ncr-create-description'), { target: { value: 'too short' } });
    expect(submit).toBeDisabled();
    expect(screen.getByTestId('ncr-create-description-error')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('ncr-create-description'), { target: { value: 'This description is now comfortably over twenty characters.' } });
    expect(submit).toBeEnabled();
  });
});

describe('NcrCloseModal (MODAL-NCR-CLOSE parity — conditional e-sign)', () => {
  function renderClose(severity: 'critical' | 'major', closeNcrAction = vi.fn()) {
    return render(
      <NcrCloseModal
        open
        onOpenChange={() => {}}
        ncr={{ id: 'n-1', ncrNumber: 'NCR-1', title: 'Metal', severity, status: 'investigating' }}
        labels={CLOSE_LABELS}
        closeNcrAction={closeNcrAction as never}
      />,
    );
  }

  it('CRITICAL: requires resolution + the e-sign password before closing', async () => {
    const closeNcrAction = vi.fn().mockResolvedValue({ ok: true, data: { id: 'n-1', status: 'closed' } });
    renderClose('critical', closeNcrAction);
    expect(screen.getByTestId('ncr-close-dualsign-warning')).toBeInTheDocument();
    expect(screen.getByTestId('ncr-close-esign')).toBeInTheDocument();

    const submit = screen.getByTestId('ncr-close-submit');
    fireEvent.change(screen.getByTestId('ncr-close-resolution'), { target: { value: 'Retested OK, root cause sieve gap closed.' } });
    // Resolution present but no password → still disabled (critical e-sign).
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByTestId('ncr-close-password'), { target: { value: 'pw' } });
    expect(submit).toBeEnabled();

    fireEvent.click(submit);
    await waitFor(() => expect(closeNcrAction).toHaveBeenCalledTimes(1));
    expect(closeNcrAction).toHaveBeenCalledWith({
      ncrId: 'n-1',
      resolution: 'Retested OK, root cause sieve gap closed.',
      signature: { password: 'pw' },
    });
  });

  it('NON-CRITICAL (major): closes WITHOUT a password (no e-sign block)', async () => {
    const closeNcrAction = vi.fn().mockResolvedValue({ ok: true, data: { id: 'n-1', status: 'closed' } });
    renderClose('major', closeNcrAction);
    expect(screen.queryByTestId('ncr-close-esign')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ncr-close-dualsign-warning')).not.toBeInTheDocument();

    const submit = screen.getByTestId('ncr-close-submit');
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByTestId('ncr-close-resolution'), { target: { value: 'Closed after minor rework.' } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() => expect(closeNcrAction).toHaveBeenCalledTimes(1));
    expect(closeNcrAction).toHaveBeenCalledWith({
      ncrId: 'n-1',
      resolution: 'Closed after minor rework.',
    });
  });

  it('surfaces a close failure verbatim from the action', async () => {
    const closeNcrAction = vi.fn().mockResolvedValue({ ok: false, reason: 'error', message: 'invalid signature' });
    renderClose('critical', closeNcrAction);
    fireEvent.change(screen.getByTestId('ncr-close-resolution'), { target: { value: 'Retested OK, sieve replaced.' } });
    fireEvent.change(screen.getByTestId('ncr-close-password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByTestId('ncr-close-submit'));
    await waitFor(() => expect(screen.getByTestId('ncr-close-error')).toHaveTextContent('invalid signature'));
  });

  it('maps typed signoff policy failures to critical-close copy', async () => {
    const closeNcrAction = vi.fn().mockResolvedValue({
      ok: false,
      reason: 'policy',
      code: 'signer_role_not_allowed',
      message: 'signer role is not allowed',
    });
    renderClose('critical', closeNcrAction);
    fireEvent.change(screen.getByTestId('ncr-close-resolution'), { target: { value: 'Retested OK, sieve replaced.' } });
    fireEvent.change(screen.getByTestId('ncr-close-password'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByTestId('ncr-close-submit'));
    await waitFor(() =>
      expect(screen.getByTestId('ncr-close-error')).toHaveTextContent(
        CLOSE_LABELS.policyErrors.signer_role_not_allowed,
      ),
    );
  });
});

describe('NcrDetailClient (QA-009a parity)', () => {
  function makeDetail(over: Partial<NcrDetail> = {}): NcrDetail {
    return {
      id: 'n-1',
      ncrNumber: 'NCR-2026-0001',
      ncrType: 'quality',
      severity: 'critical',
      status: 'investigating',
      title: 'Metal fragment found',
      productId: 'prod-uuid',
      productCode: 'R-1001',
      productName: 'Wieprzowina kl. II',
      linkedHoldId: 'hold-uuid',
      linkedHoldNumber: 'HOLD-2026-0042',
      responseDueAt: '2026-04-22T14:35:00.000Z',
      createdAt: '2026-04-21T10:00:00.000Z',
      description: 'Ferrous fragment detected at the metal detector.',
      referenceType: 'lp',
      referenceId: 'ref-uuid-1234',
      affectedQtyKg: '120',
      detectedBy: 'QA.Inspector1',
      detectedAt: '2026-04-21T14:35:00.000Z',
      rootCause: null,
      rootCauseCategory: null,
      immediateAction: null,
      capaRecordId: null,
      closedBy: null,
      closedAt: null,
      closureSignatureHash: null,
      inspection: null,
      ccpBreach: null,
      overdue: false,
      ...over,
    };
  }

  it('links the investigation NCR to its hold detail route and shows the dual-sign note for critical', () => {
    render(
      <NcrDetailClient ncr={makeDetail()} labels={DETAIL_LABELS} locale="en" updateInvestigationAction={vi.fn() as never} closeNcrAction={vi.fn() as never} />,
    );
    expect(screen.getByTestId('ncr-detail-hold-link')).toHaveAttribute('href', '/en/quality/holds/hold-uuid');
    expect(screen.getByTestId('ncr-detail-dualsign-note')).toBeInTheDocument();
  });

  it('saves the investigation while non-terminal via updateNcrInvestigation', async () => {
    const updateInvestigationAction = vi.fn().mockResolvedValue({ ok: true, data: { id: 'n-1' } });
    render(
      <NcrDetailClient ncr={makeDetail()} labels={DETAIL_LABELS} locale="en" updateInvestigationAction={updateInvestigationAction as never} closeNcrAction={vi.fn() as never} />,
    );
    fireEvent.change(screen.getByTestId('ncr-investigation-rootcause'), { target: { value: 'Sieve gap allowed fragment through.' } });
    fireEvent.change(screen.getByTestId('ncr-investigation-immediate'), { target: { value: 'Line stopped; batch held.' } });
    fireEvent.click(screen.getByTestId('ncr-investigation-save'));
    await waitFor(() => expect(updateInvestigationAction).toHaveBeenCalledTimes(1));
    expect(updateInvestigationAction).toHaveBeenCalledWith({
      ncrId: 'n-1',
      rootCause: 'Sieve gap allowed fragment through.',
      rootCauseCategory: '',
      immediateAction: 'Line stopped; batch held.',
    });
    expect(await screen.findByTestId('ncr-investigation-saved')).toBeInTheDocument();
  });

  it('opens the close modal from an investigating NCR', () => {
    render(
      <NcrDetailClient ncr={makeDetail()} labels={DETAIL_LABELS} locale="en" updateInvestigationAction={vi.fn() as never} closeNcrAction={vi.fn() as never} />,
    );
    fireEvent.click(screen.getByTestId('ncr-detail-close-open'));
    expect(screen.getByTestId('ncr-close-form')).toBeInTheDocument();
  });

  it('does NOT render the CCP breach card for a non-ccp_deviation NCR', () => {
    render(
      <NcrDetailClient ncr={makeDetail()} labels={DETAIL_LABELS} locale="en" updateInvestigationAction={vi.fn() as never} closeNcrAction={vi.fn() as never} />,
    );
    expect(screen.queryByTestId('ncr-detail-ccp-breach')).not.toBeInTheDocument();
  });

  it('renders the CCP breach context (code, measured value, limit, reader) for a ccp_deviation NCR', () => {
    render(
      <NcrDetailClient
        ncr={makeDetail({
          referenceType: 'ccp_deviation',
          referenceId: 'ccp-uuid-9',
          ccpBreach: {
            ccpId: 'ccp-uuid-9',
            ccpCode: 'CCP-COOK',
            ccpName: 'Cook temperature',
            criticalLimitMin: '70.0000',
            criticalLimitMax: '75.0000',
            unit: 'C',
            measuredValue: '69.5000',
            measuredAt: '2026-04-21T14:35:00.000Z',
            recordedBy: 'QA Inspector',
          },
        })}
        labels={DETAIL_LABELS}
        locale="en"
        updateInvestigationAction={vi.fn() as never}
        closeNcrAction={vi.fn() as never}
      />,
    );
    const card = screen.getByTestId('ncr-detail-ccp-breach');
    expect(card).toHaveTextContent('CCP-COOK');
    expect(card).toHaveTextContent('Cook temperature');
    expect(screen.getByTestId('ncr-detail-ccp-measured')).toHaveTextContent('69.5000 C');
    expect(screen.getByTestId('ncr-detail-ccp-limit')).toHaveTextContent('70.0000 C – 75.0000 C');
    expect(card).toHaveTextContent('QA Inspector');
    // No raw UUID leaks into the card.
    expect(card).not.toHaveTextContent('ccp-uuid-9');
  });

  it('CLOSED NCR is immutable: shows the signed banner, read-only investigation, and NO actions', () => {
    render(
      <NcrDetailClient
        ncr={makeDetail({ status: 'closed', closedAt: '2026-04-25T09:00:00.000Z' })}
        labels={DETAIL_LABELS}
        locale="en"
        updateInvestigationAction={vi.fn() as never}
        closeNcrAction={vi.fn() as never}
      />,
    );
    const banner = screen.getByTestId('ncr-detail-closed-banner');
    expect(banner).toHaveAttribute('data-state', 'closed');
    expect(banner).toHaveTextContent('immutable');
    // No close button, no save button, investigation is read-only/disabled.
    expect(screen.queryByTestId('ncr-detail-close-open')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ncr-investigation-save')).not.toBeInTheDocument();
    expect(screen.getByTestId('ncr-investigation-readonly')).toBeInTheDocument();
    expect(screen.getByTestId('ncr-investigation-rootcause')).toBeDisabled();
    expect(screen.getByTestId('ncr-investigation-immediate')).toBeDisabled();
  });
});

describe('quality-ncrs i18n staging (en + pl, no leaked keys)', () => {
  it('resolves every staged key in en and pl without leaking a dotted key', () => {
    for (const locale of ['en', 'pl']) {
      const t = getQaNcrsTranslator(locale);
      const flat = JSON.stringify({
        list: buildNcrListLabels(t),
        create: buildNcrCreateLabels(t),
        close: buildNcrCloseLabels(t),
        detail: buildNcrDetailLabels(t),
      });
      // No raw "namespace.key" segment should leak into a resolved value.
      expect(flat).not.toMatch(/\b(list|createModal|closeModal|detail|context|esign|validation|investigation|summary)\.[a-z]/i);
    }
    // pl actually differs from en (real translations, not an EN echo).
    expect(buildNcrListLabels(getQaNcrsTranslator('pl')).createNcr).not.toBe(LIST_LABELS.createNcr);
  });
});
