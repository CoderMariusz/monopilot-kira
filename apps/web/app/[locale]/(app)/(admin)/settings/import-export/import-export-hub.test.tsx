/**
 * @vitest-environment jsdom
 * Settings master-data Import/Export hub — RTL coverage.
 *
 * Renders ImportExportHub (import-export-hub.client.tsx) with REAL-shaped rows
 * (ImportableEntityRow[] + ImportJobRow[], the exact types produced by
 * _actions/master-data.ts → getImportableEntities) and exercises:
 *   - entity table (counts + last-import) + filter chips
 *   - recent-jobs list
 *   - empty state
 *   - drawer open + the three wizard steps (upload → map → preview)
 *
 * Canonical design: prototypes/design/Monopilot Design System/settings/import-export.jsx:60-144
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import ImportExportHub, { type MasterDataHubLabels } from './import-export-hub.client';
import type { ImportableEntityRow, ImportJobRow } from './_actions/master-data';

const labels: MasterDataHubLabels = {
  title: 'Import / Export',
  subtitle: 'Bulk-move data in and out of MonoPilot using CSV.',
  filters: { all: 'All entities', importable: 'Importable only', masterData: 'Master data' },
  table: {
    entity: 'Entity', records: 'Records', lastImport: 'Last import', recordsUnit: 'records',
    never: 'Never', export: 'Export', import: 'Import', readOnly: 'read-only',
  },
  empty: 'No master-data entities are available for import or export.',
  error: 'Unable to load master-data entities.',
  jobs: {
    title: 'Recent jobs', viewAll: 'View all in audit log', rowsUnit: 'rows',
    statusCompleted: 'Completed', statusRunning: 'Running', statusQueued: 'Queued', statusFailed: 'Failed',
    kindImport: 'Import', kindExport: 'Export', none: 'No import jobs yet.',
  },
  drawer: {
    importKicker: 'Import CSV', recordsLabel: 'records', close: 'Close',
    stepUpload: 'Upload file', stepMap: 'Map fields', stepReview: 'Review & run',
    dropTitle: 'Drop CSV or Excel file here', dropHint: 'or click to browse · max 50 MB', chooseFile: 'Choose file…',
    helpTitle: 'First time importing {entity}?', helpBody: 'Download our template.', downloadTemplate: 'Download template',
    uploadedRows: '{rows} data rows · {cols} columns', replace: 'Replace', mapTitle: 'Map columns to fields',
    csvColumn: 'CSV column', monopilotField: 'MonoPilot field', sample: 'Sample', skipColumn: 'Skip column', autoMatched: 'Auto-matched',
    behaviourTitle: 'Import behaviour', behaviourUpsert: 'Upsert (recommended)', behaviourUpsertDesc: 'Update by key.',
    behaviourCreate: 'Create only', behaviourCreateDesc: 'Skip existing.', behaviourReplace: 'Replace all', behaviourReplaceDesc: 'Dangerous.',
    validationTitle: 'Validation summary', validationReady: 'Ready to import', validationOverwrite: 'Will overwrite existing', validationErrors: 'Errors',
    previewTitle: 'Preview · first 5 rows', previewStatusUpdate: 'Update', previewStatusCreate: 'Create',
    cancel: 'Cancel', back: 'Back', continue: 'Continue', nextReview: 'Next: Review', runImport: 'Run import ({rows} rows)',
    notWiredTitle: 'Import processing not available yet', notWiredBody: 'TODO: wire master-data import action.',
  },
};

const entities: ImportableEntityRow[] = [
  { key: 'finished_goods', label: 'Finished goods', row_count: 248, last_imported_at: '2026-05-12T10:00:00.000Z' },
  { key: 'components', label: 'Components', row_count: 1340, last_imported_at: null },
  { key: 'boms', label: 'BOMs', row_count: 412, last_imported_at: '2026-05-08T08:00:00.000Z' },
  { key: 'suppliers', label: 'Suppliers', row_count: 156, last_imported_at: null },
];

const recentJobs: ImportJobRow[] = [
  {
    id: 'JOB-2486', entity_key: 'finished_goods', entity_label: 'Finished goods', status: 'completed',
    rows_processed: 248, rows_total: 248, source_file_name: 'finished-goods.csv',
    created_at: '2026-05-13T14:22:00.000Z', completed_at: '2026-05-13T14:23:00.000Z',
  },
  {
    id: 'JOB-2485', entity_key: 'components', entity_label: 'Components', status: 'failed',
    rows_processed: 0, rows_total: 32, source_file_name: 'components.csv',
    created_at: '2026-05-13T11:08:00.000Z', completed_at: null,
  },
];

function renderHub(overrides: Partial<React.ComponentProps<typeof ImportExportHub>> = {}) {
  return render(
    <ImportExportHub entities={entities} recentJobs={recentJobs} labels={labels} {...overrides} />,
  );
}

function hub() {
  return screen.getByTestId('settings-import-export-hub');
}

afterEach(() => cleanup());

describe('master-data Import/Export hub', () => {
  it('renders the entity table with real record counts and last-import timestamps', () => {
    renderHub();
    const table = within(hub()).getByRole('table', { name: 'Import / Export' });
    expect(table).toHaveTextContent('Finished goods');
    expect(table).toHaveTextContent('1,340'); // localized count for Components
    expect(table).toHaveTextContent('248');
    // null last_imported_at → Never
    expect(within(hub()).getAllByText('Never').length).toBeGreaterThanOrEqual(2);
  });

  it('carries the canonical prototype-source anchor', () => {
    renderHub();
    expect(hub()).toHaveAttribute(
      'data-prototype-source',
      'prototypes/design/Monopilot Design System/settings/import-export.jsx:60-144',
    );
  });

  it('renders the filter chips and toggles active state', () => {
    renderHub();
    const all = screen.getByRole('button', { name: 'All entities' });
    const importable = screen.getByRole('button', { name: 'Importable only' });
    expect(all).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(importable);
    expect(importable).toHaveAttribute('aria-pressed', 'true');
    expect(all).toHaveAttribute('aria-pressed', 'false');
    // all 4 master-data entities remain visible (all are importable)
    expect(within(hub()).getAllByRole('row').length).toBe(5); // header + 4
  });

  it('renders the recent-jobs list with status + file name', () => {
    renderHub();
    const jobs = within(hub()).getByTestId('master-data-hub-jobs');
    expect(jobs).toHaveTextContent('JOB-2486');
    expect(jobs).toHaveTextContent('finished-goods.csv');
    expect(jobs).toHaveTextContent('✓ Completed');
    expect(jobs).toHaveTextContent('✕ Failed');
  });

  it('renders the empty state when no entities exist', () => {
    renderHub({ entities: [], recentJobs: [] });
    expect(within(hub()).getByTestId('master-data-hub-empty')).toHaveTextContent(
      'No master-data entities are available',
    );
    expect(within(hub()).getByTestId('master-data-hub-jobs-empty')).toHaveTextContent('No import jobs yet.');
  });

  it('renders an error banner when the loader returns ok:false', () => {
    renderHub({ ok: false, entities: [], recentJobs: [] });
    expect(within(hub()).getByTestId('master-data-hub-error')).toHaveTextContent(
      'Unable to load master-data entities.',
    );
  });

  it('opens the drawer wizard and steps through upload → map → preview', async () => {
    renderHub();
    // Open the drawer for the first entity.
    fireEvent.click(within(hub()).getAllByRole('button', { name: /Import$/ })[0]);

    const drawer = await screen.findByTestId('master-data-hub-drawer');
    const dialog = within(drawer).getByRole('dialog', { name: 'Finished goods' });
    expect(within(dialog).getByText('Import CSV')).toBeInTheDocument();

    // Step 1: upload — functional file picker. Upload a CSV and assert it parses
    // and advances to step 2 (map).
    expect(within(dialog).getByTestId('master-data-hub-step-upload')).toBeInTheDocument();
    const fileInput = within(dialog).getByLabelText('Choose file…') as HTMLInputElement;
    const csv = 'fg_code,description,uom\nFG-001,Cookie,EA\nFG-002,Cake,EA\n';
    const file = new File([csv], 'fg.csv', { type: 'text/csv' });
    // jsdom's File.text() can resolve empty; stub it so the in-browser CSV parse
    // path is deterministic for this assertion.
    Object.defineProperty(file, 'text', { value: () => Promise.resolve(csv) });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(within(dialog).getByTestId('master-data-hub-step-map')).toBeInTheDocument();
    });
    // Mapping step shows the uploaded file name + parsed columns.
    expect(within(dialog).getByText('fg.csv')).toBeInTheDocument();
    expect(within(dialog).getByText(/2 data rows .* 3 columns/)).toBeInTheDocument();
    // The CSV column header cell (not the <option> echoes) carries the parsed column name.
    expect(
      within(dialog).getAllByText('fg_code').some((el) => el.classList.contains('impex-csv-col')),
    ).toBe(true);
    // 3 mapping rows for the 3 parsed columns.
    expect(dialog.querySelectorAll('.impex-mapping-row').length).toBe(3);

    // Advance to step 3: review & run.
    fireEvent.click(within(dialog).getByRole('button', { name: /Next: Review/ }));
    expect(within(dialog).getByTestId('master-data-hub-step-review')).toBeInTheDocument();
    expect(within(dialog).getByText('Import behaviour')).toBeInTheDocument();
    // Validation summary reflects the 2 parsed data rows.
    expect(within(dialog).getByText('Ready to import')).toBeInTheDocument();
    // FLAG: run-import is stubbed (no master-data import action) — banner shown.
    expect(within(dialog).getByTestId('master-data-hub-not-wired')).toBeInTheDocument();

    // Stepper shows step 3 active.
    const stepper = within(dialog).getByTestId('master-data-hub-stepper');
    expect(within(stepper).getByText('Review & run').closest('.impex-step')).toHaveAttribute(
      'aria-current',
      'step',
    );

    // Closing the drawer removes it.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => {
      expect(screen.queryByTestId('master-data-hub-drawer')).not.toBeInTheDocument();
    });
  });
});
