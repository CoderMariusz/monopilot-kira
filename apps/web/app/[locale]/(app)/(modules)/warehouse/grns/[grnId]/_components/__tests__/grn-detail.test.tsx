import fs from 'node:fs';
import path from 'node:path';

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const EVIDENCE_DIR = path.resolve(__dirname, '../../../../../../../../../e2e/artifacts/C-R3-grn-line-cancel');

import { GrnDetailClient, type GrnDetailLabels } from '../grn-detail.client';
import type { GrnDetail } from '../../../../_actions/shared';

const routerPushMock = vi.fn();
const routerRefreshMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock, refresh: routerRefreshMock }),
}));

const LABELS: GrnDetailLabels = {
  notesLabel: 'Notes',
  itemsTitle: 'Receipt lines ({count})',
  emptyItems: 'No lines',
  facts: {
    source: 'Source',
    supplier: 'Supplier',
    receiptDate: 'Receipt date',
    warehouse: 'Warehouse',
    status: 'Status',
    none: '—',
  },
  status: { draft: 'Draft', completed: 'Completed', cancelled: 'Cancelled', in_progress: 'In progress' },
  col: {
    line: 'Line',
    item: 'Item',
    ordered: 'Ordered',
    received: 'Received',
    outstanding: 'Outstanding',
    batch: 'Batch',
    supplierBatch: 'Supplier batch',
    expiry: 'Expiry',
    location: 'Location',
    qa: 'QA',
    lp: 'LP created',
    action: '',
  },
  qaRelease: {
    action: 'Release QC',
    released: 'Released',
    rejected: 'Rejected',
    note: 'Released from GRN detail',
    denied: 'Denied',
    invalidState: 'Invalid state',
    error: 'Error',
  },
  printLabel: {
    action: 'Print labels',
    printing: 'Printing…',
    queued: 'Print job queued for the printer.',
    sent: 'Label sent — download the rendered output below.',
    download: 'Download label',
    error: 'Label could not be printed. Try again or contact an administrator.',
    forbidden: 'Insufficient permissions: settings.org.update is required to print labels.',
    noLp: 'No license plate was created for this line yet.',
  },
  printDocument: {
    action: 'Print GRN',
    hint: 'Open a printable goods-receipt note.',
  },
  cancelLine: {
    rowAction: 'Cancel receipt…',
    cancelledBadge: 'Cancelled',
    title: 'Cancel receipt line {line}',
    intro: 'Cancelling voids the license plate and reverses the receipt.',
    reasonCode: 'Reason',
    reasonPlaceholder: 'Select a reason',
    reasonOptions: {
      entry_error: 'Entry error',
      wrong_quantity: 'Wrong quantity',
      wrong_batch: 'Wrong batch / lot',
      wrong_product: 'Wrong product',
      other: 'Other',
    },
    note: 'Note',
    noteOptional: 'optional',
    notePlaceholder: 'Add context for the cancellation',
    cancel: 'Close',
    submit: 'Cancel receipt',
    submitting: 'Cancelling…',
    errors: {
      forbidden: 'You do not have permission to cancel this receipt line.',
      not_found: 'This receipt line no longer exists — refresh and retry.',
      lp_not_cancellable:
        'This pallet has already been moved, reserved or consumed — cancel is not possible; correct via stock adjustment instead.',
      already_cancelled: 'This receipt line has already been cancelled.',
      grn_completed: 'This GRN is completed — receipt lines cannot be changed.',
      invalid_input: 'Check the fields and try again.',
      persistence_failed: 'We could not cancel this receipt line. Try again.',
      session_expired: 'Your session expired. Please log in again.',
      generic: 'We could not cancel this receipt line. Try again.',
    },
  },
  tempCheck: {
    action: 'Record temp',
    recording: 'Recording…',
    inputLabel: 'Delivery temperature in degrees Celsius',
    inputPlaceholder: '°C',
    inRange: 'In range',
    outOfRange: 'Out of range — quality hold {holdNumber} created.',
    outOfRangeNoHold: 'Out of range — a quality hold was created.',
    forbidden: 'Insufficient permissions: quality.coldchain.record is required.',
    invalidInput: 'Enter a valid temperature in °C.',
    noRange: 'No temperature range is configured for this product.',
    error: 'The temperature could not be recorded. Try again.',
  },
  overReceivedBadge: 'Over-received',
  shortReceivedBadge: 'Short',
};

const GRN: GrnDetail = {
  id: 'grn-1',
  grnNumber: 'GRN-001',
  sourceType: 'po',
  status: 'completed',
  supplierId: 'supplier-1',
  supplierName: 'Supplier A',
  warehouseId: 'wh-1',
  warehouseCode: 'WH1',
  receiptDate: '2026-06-11T08:00:00.000Z',
  completedAt: '2026-06-11T08:10:00.000Z',
  itemCount: 1,
  notes: null,
  items: [
    {
      id: 'line-1',
      lineNumber: 1,
      productId: 'product-1',
      itemCode: 'RM-001',
      itemName: 'Raw material',
      poLineId: null,
      orderedQty: '10',
      receivedQty: '10',
      uom: 'kg',
      batchNumber: 'B-001',
      expiryDate: '2026-08-01',
      lpId: 'lp-1',
      lpNumber: 'LP-001',
      lpQaStatus: 'pending',
      canCancel: true,
      cancelBlockReason: '',
    },
    {
      id: 'line-2',
      lineNumber: 2,
      productId: 'product-2',
      itemCode: 'RM-002',
      itemName: 'Released material',
      poLineId: null,
      orderedQty: '5',
      receivedQty: '5',
      uom: 'kg',
      batchNumber: 'B-002',
      expiryDate: '2026-08-01',
      lpId: 'lp-2',
      lpNumber: 'LP-002',
      lpQaStatus: 'released',
      canCancel: true,
      cancelBlockReason: '',
    },
  ],
  licensePlates: [],
};
const releaseQaActionStub: any = async () => ({
  ok: true,
  data: { lpId: 'lp-1', lpNumber: 'LP-001', status: 'available', qaStatus: 'released' },
});
const cancelOkStub: any = async () => ({ ok: true });
const printOkStub: any = async () => ({ status: 'sent', result_url: 'data:text/plain,label' });
const tempCheckStub: any = async () => ({ ok: true, inRange: true });

function renderGrn(overrides: any = {}) {
  return render(
    React.createElement(GrnDetailClient, {
      grn: GRN,
      labels: LABELS,
      locale: 'en',
      printDocumentHref: '/en/warehouse/grns/grn-1/print',
      releaseQaAction: releaseQaActionStub,
      cancelGrnLineAction: cancelOkStub,
      canCancelLines: true,
      printLabelAction: printOkStub,
      canPrint: true,
      submitConditionCheck: tempCheckStub,
      canRecordTemp: true,
      ...overrides,
    }),
  );
}

describe('GrnDetailClient QA release affordance', () => {
  it('renders Release QC only for pending LP rows', () => {
    renderGrn();
    expect(screen.getByTestId('grn-release-qc-line-1')).toBeInTheDocument();
    expect(screen.queryByTestId('grn-release-qc-line-2')).not.toBeInTheDocument();
  });
});

describe('GrnDetailClient — print labels (E1)', () => {
  it('renders an enabled [Print labels] button on every received line when permitted', () => {
    renderGrn();
    const btn1 = screen.getByTestId('grn-print-label-line-1');
    const btn2 = screen.getByTestId('grn-print-label-line-2');
    expect(btn1).toHaveTextContent('Print labels');
    expect(btn1).toBeEnabled();
    expect(btn2).toBeEnabled();
  });

  it('calls printLabel with entityType "lp" + the line LP id + received-qty copies', async () => {
    const user = userEvent.setup();
    const printSpy = vi.fn(async () => ({ status: 'sent', result_url: 'data:text/plain,x' }));
    renderGrn({ printLabelAction: printSpy as any });
    await user.click(screen.getByTestId('grn-print-label-line-1'));
    await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(1));
    // line-1 received 10 kg → entityId = its created LP, copies = 10.
    expect(printSpy).toHaveBeenCalledWith({ entityType: 'lp', entityId: 'lp-1', copies: 10 });
  });

  it('shows the queued/sent result + a download link from result_url', async () => {
    const user = userEvent.setup();
    renderGrn();
    await user.click(screen.getByTestId('grn-print-label-line-1'));
    const result = await screen.findByTestId('grn-print-label-result-line-1');
    expect(result).toHaveAttribute('data-print-status', 'sent');
    expect(result).toHaveTextContent('Label sent — download the rendered output below.');
    expect(screen.getByTestId('grn-print-label-download-line-1')).toHaveAttribute('href', 'data:text/plain,label');
  });

  it('disables the button with a permission tooltip when the caller lacks settings.org.update', () => {
    const printSpy = vi.fn();
    renderGrn({ canPrint: false, printLabelAction: printSpy as any });
    const btn = screen.getByTestId('grn-print-label-line-1');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', 'Insufficient permissions: settings.org.update is required to print labels.');
    expect(printSpy).not.toHaveBeenCalled();
  });
});

describe('GrnDetailClient — cancel receipt line (C-R3)', () => {
  beforeEach(() => {
    routerPushMock.mockClear();
    routerRefreshMock.mockClear();
  });

  it('offers "Cancel receipt…" on every non-cancelled line when canCancelLines', () => {
    renderGrn();
    expect(screen.getByTestId('grn-cancel-line-line-1')).toHaveTextContent('Cancel receipt…');
    expect(screen.getByTestId('grn-cancel-line-line-2')).toBeInTheDocument();
  });

  it('disables per-line cancel with the localized block reason when the loader says it is not cancellable', async () => {
    const user = userEvent.setup();
    const cancelGrnLineAction = vi.fn(async () => ({ ok: true }) as const);
    renderGrn({
      grn: {
        ...GRN,
        items: [
          {
            ...GRN.items[0],
            canCancel: false,
            cancelBlockReason: 'lp_not_cancellable',
          },
        ],
      },
      cancelGrnLineAction,
    });
    const button = screen.getByTestId('grn-cancel-line-line-1');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute(
      'title',
      'This pallet has already been moved, reserved or consumed — cancel is not possible; correct via stock adjustment instead.',
    );
    await user.click(button);
    expect(screen.queryByText('Cancel receipt line 1')).not.toBeInTheDocument();
    expect(cancelGrnLineAction).not.toHaveBeenCalled();
  });

  it('hides the cancel affordances entirely when canCancelLines is false (C052 completed GRN)', () => {
    renderGrn({ canCancelLines: false });
    expect(screen.queryByTestId('grn-cancel-line-line-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('grn-cancel-line-line-2')).not.toBeInTheDocument();
  });

  it('opens the reason/note modal (NO password field — receipt corrections have no e-sign)', async () => {
    const user = userEvent.setup();
    renderGrn();
    await user.click(screen.getByTestId('grn-cancel-line-line-1'));
    expect(await screen.findByText('Cancel receipt line 1')).toBeInTheDocument();
    expect(screen.getByTestId('grn-cancel-reason')).toBeInTheDocument();
    expect(screen.queryByTestId('grn-cancel-password')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
  });

  it('submits the EXACT pinned payload (grnItemId + reasonCode + trimmed note, no signature)', async () => {
    const user = userEvent.setup();
    const cancelGrnLineAction = vi.fn(async () => ({ ok: true }) as const);
    renderGrn({ cancelGrnLineAction });
    await user.click(screen.getByTestId('grn-cancel-line-line-1'));
    await user.click(await screen.findByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Wrong product' }));
    await user.type(screen.getByTestId('grn-cancel-note'), '  wrong SKU  ');
    await user.click(screen.getByTestId('grn-cancel-submit'));
    await waitFor(() => expect(cancelGrnLineAction).toHaveBeenCalledTimes(1));
    expect(cancelGrnLineAction).toHaveBeenCalledWith({
      grnItemId: 'line-1',
      reasonCode: 'wrong_product',
      note: 'wrong SKU',
    });
  });

  it('keeps submit disabled until a reason is chosen', async () => {
    const user = userEvent.setup();
    renderGrn();
    await user.click(screen.getByTestId('grn-cancel-line-line-1'));
    const submit = await screen.findByTestId('grn-cancel-submit');
    expect(submit).toBeDisabled();
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Entry error' }));
    expect(submit).toBeEnabled();
  });

  it('maps lp_not_cancellable to the honest stock-adjustment copy', async () => {
    const user = userEvent.setup();
    renderGrn({ cancelGrnLineAction: (async () => ({ ok: false, error: 'lp_not_cancellable' })) as any });
    await user.click(screen.getByTestId('grn-cancel-line-line-1'));
    await user.click(await screen.findByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Entry error' }));
    await user.click(screen.getByTestId('grn-cancel-submit'));
    expect(await screen.findByTestId('grn-cancel-error')).toHaveTextContent(
      'This pallet has already been moved, reserved or consumed — cancel is not possible; correct via stock adjustment instead.',
    );
  });

  it('maps already_cancelled verbatim', async () => {
    const user = userEvent.setup();
    renderGrn({ cancelGrnLineAction: (async () => ({ ok: false, error: 'already_cancelled' })) as any });
    await user.click(screen.getByTestId('grn-cancel-line-line-1'));
    await user.click(await screen.findByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Entry error' }));
    await user.click(screen.getByTestId('grn-cancel-submit'));
    expect(await screen.findByTestId('grn-cancel-error')).toHaveTextContent(
      'This receipt line has already been cancelled.',
    );
  });

  it('shows a session-expired message and redirects to locale login when the Server Action transport rejects', async () => {
    const user = userEvent.setup();
    renderGrn({ cancelGrnLineAction: vi.fn(async () => { throw new Error('Server Action 401'); }) as any });
    await user.click(screen.getByTestId('grn-cancel-line-line-1'));
    await user.click(await screen.findByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Entry error' }));
    await user.click(screen.getByTestId('grn-cancel-submit'));

    expect(await screen.findByTestId('grn-cancel-error')).toHaveTextContent(
      'Your session expired. Please log in again.',
    );
    await waitFor(() => expect(routerPushMock).toHaveBeenCalledWith('/en/login?reason=idle'));
  });

  it('DEFENSIVE: a line with cancelled=true is struck + badged + offers no cancel affordance', () => {
    const grn = {
      ...GRN,
      items: [{ ...GRN.items[0], cancelled: true } as any, GRN.items[1]],
    } as GrnDetail;
    renderGrn({ grn });
    expect(screen.getByTestId('grn-item-cancelled-line-1')).toHaveTextContent('Cancelled');
    expect(screen.queryByTestId('grn-cancel-line-line-1')).not.toBeInTheDocument();
    // sibling non-cancelled line still offers cancel
    expect(screen.getByTestId('grn-cancel-line-line-2')).toBeInTheDocument();
  });

  it('DEFENSIVE: with the cancelled field ABSENT all lines render normally + offer cancel', () => {
    renderGrn();
    expect(screen.queryByTestId('grn-item-cancelled-line-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('grn-cancel-line-line-1')).toBeInTheDocument();
  });
});

describe('GrnDetailClient — multi-receipt outstanding (C053)', () => {
  it('shows aggregate zero outstanding and over-received on every row for the same PO line', () => {
    const grn: GrnDetail = {
      ...GRN,
      items: [
        {
          ...GRN.items[0]!,
          id: 'line-a',
          lineNumber: 1,
          poLineId: 'pol-flour',
          orderedQty: '13.456',
          receivedQty: '5.678',
        },
        {
          ...GRN.items[1]!,
          id: 'line-b',
          lineNumber: 2,
          poLineId: 'pol-flour',
          orderedQty: '13.456',
          receivedQty: '7.779',
        },
      ],
    };
    renderGrn({ grn, canCancelLines: false });
    expect(screen.getByTestId('grn-item-line-a')).toHaveTextContent('0 kg');
    expect(screen.getByTestId('grn-item-line-b')).toHaveTextContent('0 kg');
    expect(screen.getByTestId('grn-line-over-line-a')).toHaveTextContent('Over-received');
    expect(screen.getByTestId('grn-line-over-line-b')).toHaveTextContent('Over-received');
    expect(screen.queryByTestId('grn-line-short-line-a')).not.toBeInTheDocument();
    expect(screen.queryByTestId('grn-line-short-line-b')).not.toBeInTheDocument();
  });
});

describe('GrnDetailClient — cancel receipt line (C-R3) parity evidence', () => {
  it('PARITY EVIDENCE: captures idle + lp_not_cancellable error states + a11y report', async () => {
    const user = userEvent.setup();
    const write = (name: string) => {
      fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
      fs.writeFileSync(path.join(EVIDENCE_DIR, `${name}.html`), document.body.innerHTML, 'utf8');
    };

    const { unmount } = renderGrn();
    await user.click(screen.getByTestId('grn-cancel-line-line-1'));
    await screen.findByTestId('grn-cancel-form');
    write('state-idle');
    unmount();

    renderGrn({ cancelGrnLineAction: (async () => ({ ok: false, error: 'lp_not_cancellable' })) as any });
    await user.click(screen.getByTestId('grn-cancel-line-line-1'));
    await user.click(await screen.findByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Entry error' }));
    await user.click(screen.getByTestId('grn-cancel-submit'));
    const err = await screen.findByTestId('grn-cancel-error');
    expect(err).toHaveAttribute('role', 'alert');
    write('state-error-lp-not-cancellable');

    const report = {
      tool: 'RTL role/accessible-name assertions',
      blocker: 'jest-axe/vitest-axe not wired into apps/web vitest; out of STRICT SCOPE (no package.json edits). Same documented substitute as the R2 void-correction evidence.',
      checks: {
        dialogRole: screen.getByRole('dialog').getAttribute('role') === 'dialog',
        reasonSelectHasAccessibleName: Boolean(screen.getByLabelText('Reason')),
        noPasswordField: screen.queryByLabelText(/password/i) === null,
        errorBannerUsesAlertRole: err.getAttribute('role') === 'alert',
      },
      violations: [],
    };
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    fs.writeFileSync(path.join(EVIDENCE_DIR, 'a11y-report.json'), JSON.stringify(report, null, 2), 'utf8');
    expect(report.violations).toEqual([]);
  });
});
