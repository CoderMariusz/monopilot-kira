/**
 * @vitest-environment jsdom
 *
 * Parity-evidence emitter (T-053 / T-085 / T-086). Renders each new screen + its
 * key states and writes DOM snapshots to
 * _meta/parity-evidence/technical-T053-T085-T086/.
 *
 * This is the documented RTL/DOM-snapshot fallback for the UI-PROTOTYPE-PARITY
 * policy: Playwright against a live authenticated Vercel+Supabase preview is not
 * runnable from this isolated worktree (no dev server / no auth session), so the
 * parity artifact is the rendered DOM of each component vs its prototype anchor.
 * The structural/interaction assertions live in the dedicated *.test.tsx files.
 */
import React from 'react';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, it, vi } from 'vitest';

import { ToolingList, type ToolingListLabels } from '../tooling/_components/tooling-list.client';
import type { ToolingSetupRow } from '../tooling/_actions/shared';
import { BulkImportWizard, type BulkImportLabels } from '../items/import/_components/bulk-import-wizard.client';
import type { ItemImportPreview } from '../../../../../../../lib/import/parse-items-csv';
import { SnapshotsViewer, type SnapshotsViewerLabels } from '../boms/snapshots/_components/snapshots-viewer.client';
import type { SnapshotRow } from '../boms/snapshots/_actions/shared';

const OUT = resolve(__dirname, '../../../../../../../../_meta/parity-evidence/technical-T053-T085-T086');

function snap(name: string, html: string) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, `${name}.html`), `<!doctype html><meta charset="utf-8">\n${html}\n`);
}

afterEach(cleanup);

const TOOLING_LABELS: ToolingListLabels = {
  searchPlaceholder: 'Search setups',
  createCta: 'Author in routings',
  filterAll: 'All',
  filterMachine: 'Machine',
  filterLine: 'Line',
  colCode: 'Code',
  colName: 'Name',
  colType: 'Type',
  colResource: 'Resource',
  colItem: 'Item',
  colSetup: 'Setup',
  colCostPerHour: 'Cost / hr',
  colUpdated: 'Updated',
  colStatus: 'Status',
  noMatches: 'No setups match the current filter.',
  typeMachine: 'Machine',
  typeLine: 'Line',
  setupUnit: 'min',
};

const TOOLING_ROWS: ToolingSetupRow[] = [
  {
    id: '1',
    opCode: 'OP-10',
    opName: 'Mixing setup',
    manufacturingOperationName: 'Mixing',
    setupTimeMin: 15,
    costPerHour: '42.5000',
    resourceKind: 'machine',
    resourceCode: 'MX-01',
    resourceName: 'Mixer 200L',
    itemCode: 'FG5101',
    itemName: 'Sausage 450g',
    routingVersion: 2,
    routingStatus: 'active',
    updatedAt: '2026-04-19T14:22:00.000Z',
  },
];

const PREVIEW: ItemImportPreview = {
  scope: 'rm_supplier_specs',
  rowsInFile: 1,
  counts: { create: 1, update: 0, noop: 0, errors: 0, warnings: 1 },
  rows: [
    {
      rowNumber: 2,
      itemCode: 'RM-1014',
      op: 'create',
      field: '—',
      before: '—',
      after: 'Salt',
      parsed: { itemCode: 'RM-1014', name: 'Salt', itemType: 'rm', uomBase: 'kg' },
      issues: [{ kind: 'warning', column: 'supplier', message: 'supplier_spec upload required first' }],
    },
  ],
};

const IMPORT_LABELS: BulkImportLabels = {
  stepUpload: 'Upload',
  stepValidate: 'Validate rows',
  stepDiff: 'Diff preview',
  stepConfirm: 'Confirm + audit',
  scopeLabel: 'Import scope',
  scopeFg: 'FG',
  scopeWip: 'WIP',
  scopeRm: 'RM',
  scopeRmSupplier: 'RM + supplier_specs',
  fileLabel: 'CSV file',
  filePlaceholder: 'filename.csv',
  orgScopedNote: 'Org-scoped. No D365 dependency.',
  validateCta: 'Validate rows',
  diffCta: 'Diff preview',
  confirmCta: 'Confirm + audit',
  applyCta: 'Apply import',
  backCta: 'Back',
  cancelCta: 'Cancel',
  rowsInFile: 'Rows in file',
  errorsKpi: 'Errors',
  warningsKpi: 'Warnings',
  createKpi: 'Create',
  updateKpi: 'Update',
  noopKpi: 'No-op',
  colRow: 'Row',
  colSeverity: 'Severity',
  colColumn: 'Column',
  colIssue: 'Issue',
  colCode: 'Code',
  colOp: 'Op',
  colField: 'Field',
  colChange: 'Before → After',
  noIssues: 'No issues',
  reasonLabel: 'Audit note',
  reasonPlaceholder: 'note…',
  reasonHelp: 'Min 10 chars.',
  applied: 'Import applied',
  forbidden: 'forbidden',
  parseFailed: 'parse failed',
  supplierBlocker: 'supplier_specs upload required first.',
};

const SNAPSHOT_LABELS: SnapshotsViewerLabels = {
  immutableBanner: 'Immutable. A snapshot is the BOM frozen at WO release.',
  orphanedNote: 'Orphaned = canonical BOM version deleted; snapshot stays read-only.',
  searchPlaceholder: 'Filter by WO',
  filterAll: 'All',
  filterInUse: 'In use',
  filterClosed: 'Closed',
  filterOrphaned: 'Orphaned',
  colSnapshot: 'Snapshot ID',
  colVersion: 'Ver.',
  colWo: 'WO',
  colFg: 'Finished good',
  colLines: 'Lines',
  colTaken: 'Taken',
  colStatus: 'Status',
  diffCta: 'Diff vs current',
  noMatches: 'No snapshots match',
  modalTitle: 'Snapshot diff',
  modalReadOnly: 'Read-only. Snapshot is immutable.',
  diffColKind: 'Kind',
  diffColPath: 'Path',
  diffColFrozen: 'Snapshot (frozen)',
  diffColCurrent: 'Current BOM',
  diffLoading: 'Computing diff…',
  diffError: 'Could not compute the diff.',
  diffEmpty: 'No differences.',
  close: 'Close',
  noWo: '—',
};

const SNAPSHOTS: SnapshotRow[] = [
  {
    id: 'SNAP-1',
    workOrderId: 'WO-12044',
    bomHeaderId: 'h1',
    bomVersion: 7,
    productId: 'FG5101',
    productName: 'Sausage 450g',
    lineCount: 11,
    snapshotAt: '2026-04-19T14:22:00.000Z',
    status: 'in_use',
  },
  {
    id: 'SNAP-2',
    workOrderId: 'WO-12012',
    bomHeaderId: 'h2',
    bomVersion: 6,
    productId: 'FG5101',
    productName: 'Sausage 450g',
    lineCount: 11,
    snapshotAt: '2026-04-12T11:55:00.000Z',
    status: 'orphaned',
  },
];

describe('Parity evidence — T-053 / T-085 / T-086 DOM snapshots', () => {
  it('T-053 tooling list (populated)', () => {
    const { container } = render(
      <ToolingList setups={TOOLING_ROWS} canWrite routingsHref="../routings" labels={TOOLING_LABELS} />,
    );
    snap('T053-tooling-populated', container.innerHTML);
  });

  it('T-053 tooling list (permission-denied: no create CTA)', () => {
    const { container } = render(
      <ToolingList setups={TOOLING_ROWS} canWrite={false} routingsHref="../routings" labels={TOOLING_LABELS} />,
    );
    snap('T053-tooling-permission-denied', container.innerHTML);
  });

  it('T-085 bulk import wizard (upload step)', () => {
    const { container } = render(
      <BulkImportWizard labels={IMPORT_LABELS} previewAction={vi.fn()} commitAction={vi.fn()} />,
    );
    snap('T085-bulk-import-upload', container.innerHTML);
  });

  it('T-085 bulk import wizard (diff step)', () => {
    const { container } = render(
      <BulkImportWizard
        labels={IMPORT_LABELS}
        previewAction={vi.fn()}
        commitAction={vi.fn()}
        initialStep="diff"
        initialPreview={PREVIEW}
      />,
    );
    snap('T085-bulk-import-diff', container.innerHTML);
  });

  it('T-086 snapshots viewer (list + orphaned flag)', () => {
    const { container } = render(<SnapshotsViewer snapshots={SNAPSHOTS} diffAction={vi.fn()} labels={SNAPSHOT_LABELS} />);
    snap('T086-snapshots-list', container.innerHTML);
  });
});
