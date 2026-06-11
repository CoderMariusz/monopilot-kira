import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { GrnDetailClient, type GrnDetailLabels } from '../grn-detail.client';
import type { GrnDetail } from '../../../../_actions/shared';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
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
    },
  ],
  licensePlates: [],
};
const releaseQaActionStub: any = async () => ({
  ok: true,
  data: { lpId: 'lp-1', lpNumber: 'LP-001', status: 'available', qaStatus: 'released' },
});

describe('GrnDetailClient QA release affordance', () => {
  it('renders Release QC only for pending LP rows', () => {
    render(
      React.createElement(GrnDetailClient, {
        grn: GRN,
        labels: LABELS,
        locale: 'en',
        releaseQaAction: releaseQaActionStub,
      }),
    );

    expect(screen.getByTestId('grn-release-qc-line-1')).toBeInTheDocument();
    expect(screen.queryByTestId('grn-release-qc-line-2')).not.toBeInTheDocument();
  });
});
