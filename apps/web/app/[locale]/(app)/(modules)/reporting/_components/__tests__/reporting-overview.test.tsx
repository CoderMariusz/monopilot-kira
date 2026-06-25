/**
 * W9-M3 — 12-Reporting overview client: RTL parity + state tests.
 *
 * Prototype: prototypes/design/Monopilot Design System/reporting/
 * kpi-screens.jsx:5-175 (KPI row + dense table + EmptyState vocabulary).
 * Tests the presentational <ReportingOverviewClient> directly (the page is an
 * async RSC that reads Supabase via the four read actions and is exercised
 * live). Asserts:
 *   - all four sections render with their KPI tiles and tables,
 *   - per-section CSV export goes through the shared download helper (mocked),
 *   - CSV buttons render DISABLED (with explanatory title) without rpt.export.csv,
 *   - honest NULL rendering: confirmed→GRN KPI shows the n/a placeholder,
 *   - per-section empty states when a summary has no rows,
 *   - i18n: en + pl staged bundles resolve every label (no leaked dotted key).
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ReportingOverviewClient,
  type ReportingLabels,
} from '../reporting-overview.client';
import { getRptTranslator } from '../../rpt-labels';
import type {
  InventorySnapshot,
  ProcurementSummary,
  ProductionSummary,
  QualitySummary,
  ReceiptsSummary,
} from '../../_actions/shared';

const downloadCsvMock = vi.fn((_content: string, filename: string) => filename);
const exportProductionSummaryCsvMock = vi.fn(async () => ({
  csv: 'WO #,Item,Planned,Actual,UoM,Yield %,Completed\nWO-0002,FG001 Meat Box,100.000,90.000,kg,90.00,2026-06-10T10:00:00.000Z',
  filename: 'reporting-production-2026-06-24.csv',
}));

vi.mock('../../../../../../../lib/shared/download', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../../../lib/shared/download')>();
  return {
    ...actual,
    downloadCsv: (content: string, filename: string) => downloadCsvMock(content, filename),
  };
});

vi.mock('../../_actions/report-read-actions', () => ({
  exportProductionSummaryCsv: (input: unknown) => exportProductionSummaryCsvMock(input),
}));

// Mirrors the page's label builder (kept local to avoid importing the RSC page,
// which transitively pulls the 'use server' action module into the jsdom test).
function buildLabels(locale: string): ReportingLabels {
  const t = getRptTranslator(locale);
  return {
    page: {
      exportCsv: t('page.exportCsv'),
      exportCsvDenied: t('page.exportCsvDenied'),
      windowDays: t('page.windowDays', { days: 7 }),
      asOfNow: t('page.asOfNow'),
      notAvailable: t('page.notAvailable'),
    },
    production: {
      title: t('production.title'),
      window: t('page.windowDays', { days: 7 }),
      kpi: {
        wosCompleted: t('production.kpi.wosCompleted'),
        outputKg: t('production.kpi.outputKg'),
        wasteKg: t('production.kpi.wasteKg'),
        wastePct: t('production.kpi.wastePct'),
        avgYieldPct: t('production.kpi.avgYieldPct'),
        downtimeMinutes: t('production.kpi.downtimeMinutes'),
      },
      downtimeNote: t('production.downtimeNote'),
      columns: {
        wo: t('production.columns.wo'),
        item: t('production.columns.item'),
        planned: t('production.columns.planned'),
        actual: t('production.columns.actual'),
        uom: t('production.columns.uom'),
        yield: t('production.columns.yield'),
        completedAt: t('production.columns.completedAt'),
      },
      empty: t('production.empty'),
    },
    inventory: {
      title: t('inventory.title'),
      window: t('page.asOfNow'),
      kpi: {
        lpCount: t('inventory.kpi.lpCount'),
        qtyKg: t('inventory.kpi.qtyKg'),
        blockedLpCount: t('inventory.kpi.blockedLpCount'),
        expiredCount: t('inventory.kpi.expiredCount'),
        expiring7dCount: t('inventory.kpi.expiring7dCount'),
      },
      qtyNote: t('inventory.qtyNote'),
      columns: {
        warehouse: t('inventory.columns.warehouse'),
        lps: t('inventory.columns.lps'),
        active: t('inventory.columns.active'),
        blocked: t('inventory.columns.blocked'),
        qtyKg: t('inventory.columns.qtyKg'),
        qtyByUom: t('inventory.columns.qtyByUom'),
        expired: t('inventory.columns.expired'),
        expiring7d: t('inventory.columns.expiring7d'),
      },
      empty: t('inventory.empty'),
    },
    quality: {
      title: t('quality.title'),
      window: t('page.windowDays', { days: 30 }),
      kpi: {
        openHolds: t('quality.kpi.openHolds'),
        inspections: t('quality.kpi.inspections'),
        ncrOpen: t('quality.kpi.ncrOpen'),
        ncrClosed: t('quality.kpi.ncrClosed'),
      },
      entity: {
        hold: t('quality.entity.hold'),
        inspection: t('quality.entity.inspection'),
        ncr: t('quality.entity.ncr'),
      },
      status: {
        open: t('quality.status.open'),
        pending: t('quality.status.pending'),
        passed: t('quality.status.passed'),
        failed: t('quality.status.failed'),
        on_hold: t('quality.status.on_hold'),
        closed_in_window: t('quality.status.closed_in_window'),
      },
      columns: {
        entity: t('quality.columns.entity'),
        status: t('quality.columns.status'),
        count: t('quality.columns.count'),
      },
      empty: t('quality.empty'),
    },
    procurement: {
      title: t('procurement.title'),
      window: t('page.windowDays', { days: 30 }),
      kpi: {
        posInWindow: t('procurement.kpi.posInWindow'),
        confirmedToGrn: t('procurement.kpi.confirmedToGrn'),
        createdToGrn: t('procurement.kpi.createdToGrn'),
        openTos: t('procurement.kpi.openTos'),
      },
      confirmedToGrnNote: t('procurement.confirmedToGrnNote'),
      createdToGrnNote: t('procurement.createdToGrnNote'),
      status: {
        cancelled: t('procurement.status.cancelled'),
        draft: t('procurement.status.draft'),
        partially_received: t('procurement.status.partially_received'),
        received: t('procurement.status.received'),
        sent: t('procurement.status.sent'),
        confirmed: t('procurement.status.confirmed'),
      },
      columns: {
        status: t('procurement.columns.status'),
        count: t('procurement.columns.count'),
      },
      empty: t('procurement.empty'),
    },
    receipts: {
      title: t('receipts.title'),
      window: t('page.windowDays', { days: 7 }),
      kpi: {
        grnCount: t('receipts.kpi.grnCount'),
        completedGrnCount: t('receipts.kpi.completedGrnCount'),
        itemLineCount: t('receipts.kpi.itemLineCount'),
        receivedQty: t('receipts.kpi.receivedQty'),
      },
      qtyNote: t('receipts.qtyNote'),
      status: {
        draft: t('receipts.status.draft'),
        completed: t('receipts.status.completed'),
        cancelled: t('receipts.status.cancelled'),
        posted: t('receipts.status.posted'),
      },
      columns: {
        grn: t('receipts.columns.grn'),
        supplier: t('receipts.columns.supplier'),
        warehouse: t('receipts.columns.warehouse'),
        status: t('receipts.columns.status'),
        lines: t('receipts.columns.lines'),
        qtyByUom: t('receipts.columns.qtyByUom'),
        receiptDate: t('receipts.columns.receiptDate'),
      },
      empty: t('receipts.empty'),
    },
  };
}

const production: ProductionSummary = {
  days: 7,
  wosCompleted: 3,
  outputKg: '80.000',
  wasteKg: '20.000',
  wastePct: '20.00',
  avgYieldPct: '91.25',
  downtimeMinutes: 45,
  rows: [
    {
      woNumber: 'WO-0002',
      itemCode: 'FG001',
      itemName: 'Meat Box',
      plannedQty: '100.000',
      actualQty: '90.000',
      uom: 'kg',
      yieldPct: '90.00',
      completedAt: '2026-06-10T10:00:00.000Z',
    },
  ],
};

const inventory: InventorySnapshot = {
  totals: {
    lpCount: 15,
    activeLpCount: 13,
    blockedLpCount: 2,
    qtyKg: '120.500',
    expiredCount: 1,
    expiring7dCount: 3,
  },
  rows: [
    {
      warehouseId: 'wh-1',
      warehouseCode: 'WH1',
      warehouseName: 'Main',
      lpCount: 15,
      activeLpCount: 13,
      blockedLpCount: 2,
      qtyKg: '120.500',
      qtyByUom: [
        { uom: 'box', qty: '20.000' },
        { uom: 'kg', qty: '120.500' },
      ],
      expiredCount: 1,
      expiring7dCount: 3,
    },
  ],
};

const quality: QualitySummary = {
  days: 30,
  openHolds: 3,
  inspectionsByStatus: [
    { status: 'pending', count: 4 },
    { status: 'passed', count: 6 },
  ],
  ncrOpen: 3,
  ncrClosedInWindow: 5,
  rows: [
    { entity: 'hold', status: 'open', count: 2 },
    { entity: 'hold', status: 'investigating', count: 1 },
    { entity: 'inspection', status: 'pending', count: 4 },
    { entity: 'inspection', status: 'passed', count: 6 },
    { entity: 'ncr', status: 'open', count: 3 },
    { entity: 'ncr', status: 'closed_in_window', count: 5 },
  ],
};

const procurement: ProcurementSummary = {
  days: 30,
  posByStatus: [
    { status: 'confirmed', count: 2 },
    { status: 'draft', count: 1 },
  ],
  avgConfirmedToFirstGrnDays: null,
  avgCreatedToFirstGrnDays: '3.0',
  openToCount: 4,
};

const receipts: ReceiptsSummary = {
  days: 7,
  totals: {
    grnCount: 2,
    completedGrnCount: 1,
    cancelledGrnCount: 0,
    itemLineCount: 3,
    receivedQtyByUom: [
      { uom: 'box', qty: '5.000' },
      { uom: 'kg', qty: '136.000' },
    ],
  },
  rows: [
    {
      grnId: 'grn-1',
      grnNumber: 'GRN-2026-00002',
      sourceType: 'po',
      poId: 'po-1',
      toId: null,
      supplierId: 'sup-1',
      supplierName: 'Acme Supplies',
      warehouseId: 'wh-1',
      warehouseCode: 'WH1',
      warehouseName: 'Main',
      status: 'completed',
      itemLineCount: 2,
      receivedQtyByUom: [
        { uom: 'box', qty: '5.000000' },
        { uom: 'kg', qty: '125.250000' },
      ],
      receiptDate: '2026-06-10T09:30:00.000Z',
      completedAt: '2026-06-10T10:00:00.000Z',
    },
  ],
};

const emptyReceipts: ReceiptsSummary = {
  days: 7,
  totals: { grnCount: 0, completedGrnCount: 0, cancelledGrnCount: 0, itemLineCount: 0, receivedQtyByUom: [] },
  rows: [],
};

const emptyProduction: ProductionSummary = {
  days: 7,
  wosCompleted: 0,
  outputKg: '0.000',
  wasteKg: '0.000',
  wastePct: null,
  avgYieldPct: null,
  downtimeMinutes: 0,
  rows: [],
};

const emptyInventory: InventorySnapshot = {
  totals: { lpCount: 0, activeLpCount: 0, blockedLpCount: 0, qtyKg: '0.000', expiredCount: 0, expiring7dCount: 0 },
  rows: [],
};

const emptyQuality: QualitySummary = {
  days: 30,
  openHolds: 0,
  inspectionsByStatus: [],
  ncrOpen: 0,
  ncrClosedInWindow: 0,
  rows: [
    { entity: 'ncr', status: 'open', count: 0 },
    { entity: 'ncr', status: 'closed_in_window', count: 0 },
  ],
};

const emptyProcurement: ProcurementSummary = {
  days: 30,
  posByStatus: [],
  avgConfirmedToFirstGrnDays: null,
  avgCreatedToFirstGrnDays: null,
  openToCount: 0,
};

function renderOverview(overrides: Partial<React.ComponentProps<typeof ReportingOverviewClient>> = {}) {
  return render(
    <ReportingOverviewClient
      production={production}
      inventory={inventory}
      quality={quality}
      procurement={procurement}
      receipts={receipts}
      canExportCsv
      labels={buildLabels('en')}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  downloadCsvMock.mockClear();
  exportProductionSummaryCsvMock.mockClear();
});

describe('ReportingOverviewClient', () => {
  it('renders all five report sections with KPI tiles and tables', () => {
    renderOverview();

    const prod = within(screen.getByTestId('rpt-section-production'));
    expect(prod.getByText('Production summary')).toBeInTheDocument();
    expect(prod.getByText('WOs completed')).toBeInTheDocument();
    expect(prod.getByText('80.000')).toBeInTheDocument();
    expect(prod.getByText('20.00')).toBeInTheDocument(); // waste %
    expect(prod.getByText('91.25')).toBeInTheDocument(); // avg yield %
    expect(prod.getByText('WO-0002')).toBeInTheDocument();
    expect(prod.getByText('FG001 — Meat Box')).toBeInTheDocument();

    const inv = within(screen.getByTestId('rpt-section-inventory'));
    expect(inv.getByText('Inventory snapshot')).toBeInTheDocument();
    expect(inv.getByText('On-hand LPs')).toBeInTheDocument();
    expect(inv.getByText('WH1')).toBeInTheDocument();

    const qa = within(screen.getByTestId('rpt-section-quality'));
    expect(qa.getByText('Quality summary')).toBeInTheDocument();
    expect(qa.getByText('Open holds')).toBeInTheDocument();
    expect(qa.getByText('investigating')).toBeInTheDocument();

    const proc = within(screen.getByTestId('rpt-section-procurement'));
    expect(proc.getByText('Procurement summary')).toBeInTheDocument();
    expect(proc.getByText('Confirmed')).toBeInTheDocument();

    const rec = within(screen.getByTestId('rpt-section-receipts'));
    expect(rec.getByText('Receipts (GRN) summary')).toBeInTheDocument();
    expect(rec.getByText('GRNs received (window)')).toBeInTheDocument();
    expect(rec.getByText('GRN-2026-00002')).toBeInTheDocument();
    expect(rec.getByText('Acme Supplies')).toBeInTheDocument();
    expect(rec.getByText('5.000000 box · 125.250000 kg')).toBeInTheDocument();
  });

  it('renders the honest n/a placeholder for the not-computable confirmed→GRN KPI', () => {
    renderOverview();
    const proc = within(screen.getByTestId('rpt-section-procurement'));
    const tile = proc.getByText('Confirmed → first GRN (days)').closest('[data-testid="rpt-kpi"]');
    expect(tile).not.toBeNull();
    expect(within(tile as HTMLElement).getByText('—')).toBeInTheDocument();
    expect(
      within(tile as HTMLElement).getByText(
        'Not computable — purchase orders do not record a confirmation timestamp',
      ),
    ).toBeInTheDocument();
  });

  it('exports each section as CSV through the shared download helper', async () => {
    renderOverview();

    fireEvent.click(screen.getByTestId('rpt-export-production'));
    await waitFor(() => expect(downloadCsvMock).toHaveBeenCalledTimes(1));
    const [prodCsv, prodName] = downloadCsvMock.mock.calls[0];
    expect(prodName).toMatch(/^reporting-production-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(prodCsv).toContain('WO #,Item,Planned,Actual,UoM,Yield %,Completed');
    expect(prodCsv).toContain('WO-0002,FG001 Meat Box,100.000,90.000,kg,90.00');

    fireEvent.click(screen.getByTestId('rpt-export-inventory'));
    expect(downloadCsvMock.mock.calls[1][1]).toMatch(/^reporting-inventory-/);
    expect(downloadCsvMock.mock.calls[1][0]).toContain(
      'WH1,15,13,2,120.500,20.000 box · 120.500 kg,1,3',
    );

    fireEvent.click(screen.getByTestId('rpt-export-quality'));
    expect(downloadCsvMock.mock.calls[2][1]).toMatch(/^reporting-quality-/);
    expect(downloadCsvMock.mock.calls[2][0]).toContain('Hold,Open,2');

    fireEvent.click(screen.getByTestId('rpt-export-procurement'));
    expect(downloadCsvMock.mock.calls[3][1]).toMatch(/^reporting-procurement-/);
    expect(downloadCsvMock.mock.calls[3][0]).toContain('Confirmed,2');
  });

  it('disables CSV buttons (with explanatory title) without rpt.export.csv', () => {
    renderOverview({ canExportCsv: false });
    for (const id of [
      'rpt-export-production',
      'rpt-export-inventory',
      'rpt-export-quality',
      'rpt-export-procurement',
    ]) {
      const btn = screen.getByTestId(id);
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute('title', 'Requires the rpt.export.csv permission');
    }
    fireEvent.click(screen.getByTestId('rpt-export-production'));
    expect(downloadCsvMock).not.toHaveBeenCalled();
  });

  it('renders the per-section empty states on an empty org', () => {
    renderOverview({
      production: emptyProduction,
      inventory: emptyInventory,
      quality: emptyQuality,
      procurement: emptyProcurement,
    });
    expect(screen.getByTestId('rpt-empty-production')).toHaveTextContent(
      'No work orders were completed in this window.',
    );
    expect(screen.getByTestId('rpt-empty-inventory')).toHaveTextContent('No on-hand license plates.');
    expect(screen.getByTestId('rpt-empty-quality')).toHaveTextContent('No quality records in this window.');
    expect(screen.getByTestId('rpt-empty-procurement')).toHaveTextContent(
      'No purchase orders were created in this window.',
    );
  });

  it('resolves real PL labels from the staged bundle (no leaked dotted keys)', () => {
    render(
      <ReportingOverviewClient
        production={production}
        inventory={inventory}
        quality={quality}
        procurement={procurement}
        receipts={receipts}
        canExportCsv
        labels={buildLabels('pl')}
      />,
    );
    expect(screen.getByText('Podsumowanie produkcji')).toBeInTheDocument();
    expect(screen.getByText('Stan zapasów')).toBeInTheDocument();
    expect(screen.getByText('Podsumowanie jakości')).toBeInTheDocument();
    expect(screen.getByText('Podsumowanie zaopatrzenia')).toBeInTheDocument();
    expect(screen.getByText('Przyjęcia (GRN) — podsumowanie')).toBeInTheDocument();
    const exportButtons = [
      'rpt-export-production',
      'rpt-export-inventory',
      'rpt-export-quality',
      'rpt-export-procurement',
      'rpt-export-receipts',
    ].map((id) => screen.getByTestId(id));
    for (const btn of exportButtons) expect(btn).toHaveTextContent('Eksportuj CSV');
    // no raw dotted key anywhere
    expect(document.body.textContent).not.toMatch(/\b(production|inventory|quality|procurement|receipts)\.kpi\./);
  });
});
