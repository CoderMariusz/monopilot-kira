/**
 * @vitest-environment jsdom
 *
 * T-085 — TEC-014 Bulk Import CSV (spec-driven): RTL structure + interaction +
 * pure parse/diff tests.
 *
 * Spec-driven layout-primitive prototype:
 *   prototypes/design/Monopilot Design System/technical/spec-driven-screens.jsx:25-218
 *   (`bulk_import_csv_screen`, 4-step wizard upload → validate → diff → confirm).
 * PRD §6.5 + 03-TECHNICAL-UX.md are canonical; this asserts the spec-driven
 * structure (4-step wizard, scope select, validation table, diff table, audit
 * note) + interaction (preview action drives step transition; apply is gated on a
 * ≥10-char reason + zero errors) + the Technical red-line overlay (no FA type, no
 * D365 dependency, supplier_specs warning).
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BulkImportWizard, type BulkImportLabels } from '../_components/bulk-import-wizard.client';
import {
  diffItemsAgainstExisting,
  parseItemsCsv,
} from '../../../../../../../../lib/import/parse-items-csv';
import type { ItemImportPreview } from '../../../../../../../../lib/import/parse-items-csv';

afterEach(cleanup);

const LABELS: BulkImportLabels = {
  stepUpload: 'Upload',
  stepValidate: 'Validate rows',
  stepDiff: 'Diff preview',
  stepConfirm: 'Confirm + audit',
  scopeLabel: 'Import scope',
  scopeFg: 'FG catalog',
  scopeWip: 'WIP / intermediates',
  scopeRm: 'RM',
  scopeRmSupplier: 'RM + supplier_specs',
  fileLabel: 'CSV file',
  filePlaceholder: 'filename.csv',
  orgScopedNote: 'Imports are org-scoped. No D365 dependency.',
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
  reasonPlaceholder: 'Q2 refresh…',
  reasonHelp: 'Min 10 chars.',
  applied: 'Import applied',
  forbidden: 'You cannot import items.',
  parseFailed: 'Could not parse the CSV.',
  supplierBlocker: 'supplier_specs upload required first.',
  invalidStatusTransition:
    "Invalid status change {from}→{to} — change status via the item's deactivate/activate flow, not import.",
};

const PREVIEW: ItemImportPreview = {
  scope: 'rm_supplier_specs',
  rowsInFile: 2,
  counts: { create: 1, update: 1, noop: 0, errors: 0, warnings: 1 },
  rows: [
    {
      rowNumber: 2,
      itemCode: 'RM-1014',
      op: 'create',
      field: '—',
      before: '—',
      after: 'Salt',
      parsed: { itemCode: 'RM-1014', name: 'Salt', itemType: 'rm', uomBase: 'kg' },
      issues: [{ kind: 'warning', column: 'supplier', message: 'supplier S-202 requires a supplier_spec upload' }],
    },
    {
      rowNumber: 3,
      itemCode: 'FG5101',
      op: 'update',
      field: 'name',
      before: 'Old',
      after: 'New',
      parsed: { itemCode: 'FG5101', name: 'New', itemType: 'fg', uomBase: 'ea' },
      issues: [],
    },
  ],
};

describe('TEC-014 Bulk Import wizard (spec: spec-driven-screens.jsx:25-218)', () => {
  it('renders the 4-step wizard with a scope select on the upload step', () => {
    render(<BulkImportWizard labels={LABELS} previewAction={vi.fn()} commitAction={vi.fn()} />);
    const stepper = screen.getByTestId('bulk-import-stepper');
    ['Upload', 'Validate rows', 'Diff preview', 'Confirm + audit'].forEach((s) => {
      expect(stepper).toHaveTextContent(s);
    });
    expect(screen.getByLabelText('Import scope')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-import-file')).toBeInTheDocument();
  });

  it('calls the preview action and advances to the validate step on upload', async () => {
    const previewAction = vi.fn().mockResolvedValue({ ok: true, preview: PREVIEW });
    render(<BulkImportWizard labels={LABELS} previewAction={previewAction} commitAction={vi.fn()} />);

    const csv = 'item_code,name,item_type,uom_base\nRM-1014,Salt,rm,kg';
    const file = new File([csv], 'rm.csv', { type: 'text/csv' });
    // jsdom's File does not implement .text(); a real browser File does. Stub it.
    Object.defineProperty(file, 'text', { value: () => Promise.resolve(csv) });
    fireEvent.change(screen.getByTestId('bulk-import-file'), { target: { files: [file] } });

    await waitFor(() => expect(screen.getByTestId('bulk-import-validate-cta')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('bulk-import-validate-cta'));

    await waitFor(() => expect(previewAction).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('bulk-import-validate-kpis')).toBeInTheDocument());
    // Warning row surfaced (supplier_specs blocker).
    expect(screen.getByTestId('bulk-import-issue-row')).toHaveTextContent('supplier');
  });

  it('renders the create/update diff and gates Apply on a >=10 char reason', async () => {
    render(
      <BulkImportWizard
        labels={LABELS}
        previewAction={vi.fn()}
        commitAction={vi.fn()}
        initialStep="diff"
        initialPreview={PREVIEW}
      />,
    );
    expect(screen.getAllByTestId('bulk-import-diff-row')).toHaveLength(2);
    expect(screen.getByText('supplier_specs upload required first.')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('bulk-import-confirm-cta'));
    const apply = screen.getByTestId('bulk-import-apply-cta');
    expect(apply).toBeDisabled(); // reason empty
    fireEvent.change(screen.getByTestId('bulk-import-reason'), { target: { value: 'short' } });
    expect(apply).toBeDisabled(); // < 10 chars
    fireEvent.change(screen.getByTestId('bulk-import-reason'), { target: { value: 'Q2 refresh import note' } });
    expect(apply).not.toBeDisabled();
  });

  it('calls commit with scope + reason and shows the applied summary', async () => {
    const commitAction = vi
      .fn()
      .mockResolvedValue({ ok: true, committed: { created: 1, updated: 1, skipped: 0, errors: 0 }, rowErrors: [] });
    render(
      <BulkImportWizard
        labels={LABELS}
        previewAction={vi.fn()}
        commitAction={commitAction}
        initialStep="confirm"
        initialPreview={PREVIEW}
      />,
    );
    fireEvent.change(screen.getByTestId('bulk-import-reason'), { target: { value: 'Q2 refresh import note' } });
    fireEvent.click(screen.getByTestId('bulk-import-apply-cta'));
    await waitFor(() => expect(commitAction).toHaveBeenCalledWith('rm_supplier_specs', expect.any(String), 'Q2 refresh import note'));
    await waitFor(() => expect(screen.getByTestId('bulk-import-applied')).toBeInTheDocument());
  });
});

describe('TEC-014 pure parse + diff (org-scoped, Technical red-lines)', () => {
  it('rejects a header-mismatched CSV', () => {
    const res = parseItemsCsv('rm', 'foo,bar\n1,2');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('header_mismatch');
  });

  it('flags a legacy FA item_type and FA-prefixed code as errors', () => {
    const parse = parseItemsCsv('fg', 'item_code,name,item_type,uom_base\nFA-9001,Legacy,fa,ea');
    expect(parse.ok).toBe(true);
    if (!parse.ok) return;
    const diff = diffItemsAgainstExisting('fg', parse.rows, new Map());
    expect(diff.counts.errors).toBe(1);
    const errors = diff.rows[0]!.issues.filter((i) => i.kind === 'error');
    expect(errors.some((e) => /FA-prefixed/.test(e.message))).toBe(true);
    expect(errors.some((e) => /legacy/.test(e.message))).toBe(true);
  });

  it('classifies create vs update vs no-op against existing items', () => {
    const parse = parseItemsCsv(
      'rm',
      'item_code,name,item_type,uom_base\nRM-1,New name,rm,kg\nRM-2,Same,rm,kg\nRM-3,Brand new,rm,kg',
    );
    expect(parse.ok).toBe(true);
    if (!parse.ok) return;
    const existing = new Map([
      ['RM-1', { itemType: 'rm', name: 'Old name' }],
      ['RM-2', { itemType: 'rm', name: 'Same' }],
    ]);
    const diff = diffItemsAgainstExisting('rm', parse.rows, existing);
    expect(diff.counts.update).toBe(1);
    expect(diff.counts.noop).toBe(1);
    expect(diff.counts.create).toBe(1);
  });

  it('raises a supplier_specs warning on RM rows with a supplier (no hard block)', () => {
    const parse = parseItemsCsv(
      'rm_supplier_specs',
      'item_code,name,item_type,uom_base,supplier\nRM-9,Pepper,rm,kg,S-202',
    );
    expect(parse.ok).toBe(true);
    if (!parse.ok) return;
    const diff = diffItemsAgainstExisting('rm_supplier_specs', parse.rows, new Map());
    expect(diff.counts.warnings).toBe(1);
    expect(diff.counts.errors).toBe(0);
  });
});

describe('commitItemsImport status-transition errors', () => {
  it('returns invalid_status_transition row errors and does not update the item', async () => {
    vi.resetModules();
    vi.doMock('server-only', () => ({}));
    vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
    vi.doMock('../../_actions/create-item', () => ({
      createItem: vi.fn(async () => ({ ok: true, data: { id: 'created-id', itemCode: 'RM-NEW' } })),
    }));

    const item = {
      id: '33333333-3333-4333-8333-333333333333',
      item_code: 'RM-1',
      item_type: 'rm',
      name: 'Existing item',
      status: 'active',
    };
    const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
    const normalizeSql = (sql: string) => sql.replace(/\s+/g, ' ').trim().toLowerCase();
    const client = {
      async query<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []) {
        calls.push({ sql, params });
        const normalized = normalizeSql(sql);
        if (normalized.includes('from public.user_roles')) return { rows: [{ ok: true }] as T[], rowCount: 1 };
        if (normalized === 'select id, item_code, item_type, name, status from public.items where org_id = app.current_org_id()') {
          return { rows: [item] as T[], rowCount: 1 };
        }
        if (normalized.startsWith('select name, item_type, status, uom_base')) {
          return {
            rows: [
              {
                name: item.name,
                item_type: item.item_type,
                status: item.status,
                uom_base: 'kg',
                weight_mode: 'fixed',
                nominal_weight: null,
                tare_weight: null,
                gross_weight_max: null,
                gs1_gtin: null,
                output_uom: 'base',
                net_qty_per_each: null,
                each_per_box: null,
                boxes_per_pallet: null,
                list_price_gbp: null,
              },
            ] as T[],
            rowCount: 1,
          };
        }
        if (normalized.startsWith('update public.items')) {
          item.name = String(params[1]);
          item.item_type = String(params[2]);
          item.status = String(params[3]);
          return { rows: [{ id: item.id }] as T[], rowCount: 1 };
        }
        if (normalized.startsWith('insert into public.audit_log')) return { rows: [] as T[], rowCount: 1 };
        return { rows: [] as T[], rowCount: 0 };
      },
    };

    vi.doMock('../../../../../../../../lib/auth/with-org-context', () => ({
      withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) =>
        action({
          userId: '22222222-2222-4222-8222-222222222222',
          orgId: '11111111-1111-4111-8111-111111111111',
          client,
        }),
      ),
    }));

    const { commitItemsImport } = await import('../_actions/commit-import');
    const { INVALID_STATUS_TRANSITION_IMPORT_ERROR } = await import('../_actions/import-error-codes');

    const result = await commitItemsImport(
      'rm',
      'item_code,name,item_type,uom_base,status\nRM-1,Imported name,rm,kg,draft',
      'Q2 refresh import note',
    );

    expect(result).toMatchObject({
      ok: true,
      committed: { created: 0, updated: 0, skipped: 0, errors: 1 },
      rowErrors: [
        {
          rowNumber: 2,
          itemCode: 'RM-1',
          column: 'status',
          code: INVALID_STATUS_TRANSITION_IMPORT_ERROR,
          from: 'active',
          to: 'draft',
        },
      ],
    });
    expect(result.ok && result.rowErrors[0]?.code).not.toBe('invalid_input');
    expect(calls.some((call) => normalizeSql(call.sql).startsWith('update public.items'))).toBe(false);
    expect(item).toMatchObject({ name: 'Existing item', status: 'active' });
  });
});
