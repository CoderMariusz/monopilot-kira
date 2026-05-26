'use client';

import React from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardContent } from '@monopilot/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import { DeleteReferenceDataModal } from '../../../../../../components/settings/modals/delete-reference-data-modal';
import { RefRowEditModal } from '../../../../../../components/settings/modals/ref-row-edit-modal';

export type ReferenceColumn = {
  key: string;
  label: string;
  type: 'text' | 'boolean' | 'badge';
};

export type ReferenceTable = {
  code: string;
  name: string;
  desc: string;
  marker: 'UNIVERSAL' | 'TENANT';
  rows: number;
  updated: string;
  columns: ReferenceColumn[];
};

export type ReferenceRow = {
  rowId: string;
  rowKey: string;
  version?: number;
  values: Record<string, string | boolean | number | null>;
};

export type ReferenceDataLabels = {
  title: string;
  subtitle: string;
  importCsv: string;
  exportCsv: string;
  addRow: string;
  edit: string;
  delete: string;
  rowsSuffix: string;
  updatedPrefix: string;
  loading: string;
  empty: string;
  error: string;
  permissionDenied?: string;
  actions: string;
  enabled: string;
  disabled: string;
  yes: string;
  no: string;
  rowKey: string;
  rowKeyHelp: string;
  modal?: {
    edit?: React.ComponentProps<typeof RefRowEditModal>['labels'];
    delete?: React.ComponentProps<typeof DeleteReferenceDataModal>['labels'];
  };
};

type UpsertReferenceRowInput = {
  tableCode: string;
  rowKey: string;
  rowData: Record<string, unknown>;
  expectedVersion?: number;
};

type SoftDeleteReferenceRowInput = {
  tableCode: string;
  rowKey: string;
  expectedVersion: number;
};

export type ReferenceDataScreenProps = {
  tables: ReferenceTable[];
  selectedTableCode: string;
  rowsByTable: Record<string, ReferenceRow[]>;
  labels: ReferenceDataLabels;
  state?: 'ready' | 'loading' | 'empty' | 'error';
  canEditReferenceData?: boolean;
  upsertReferenceRow?: (input: UpsertReferenceRowInput) => Promise<{ ok: boolean; data?: unknown; error?: string }>;
  softDeleteReferenceRow?: (input: SoftDeleteReferenceRowInput) => Promise<{ ok: boolean; data?: unknown; error?: string }>;
  onReferenceDataChanged?: () => void;
  e2eHarnessOpenModals?: boolean;
};

type DialogState =
  | { kind: 'add'; tableCode: string }
  | { kind: 'edit'; tableCode: string; row: ReferenceRow }
  | { kind: 'delete'; tableCode: string; row: ReferenceRow }
  | null;

type ModalColumn = {
  columnCode: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'enum';
  required?: boolean;
  readOnlyWhenEditing?: boolean;
  help?: string;
};

type ModalRow = {
  tableCode: string;
  rowKey: string;
  values: Record<string, string | number | boolean | null>;
};

function rowLabel(row: ReferenceRow) {
  return row.rowKey || row.rowId;
}

function cellText(value: string | boolean | number | null, column: ReferenceColumn, labels: ReferenceDataLabels) {
  if (typeof value === 'boolean') {
    if (/enabled|active/i.test(column.label)) return value ? labels.enabled : labels.disabled;
    return value ? labels.yes : labels.no;
  }
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

function renderCell(value: string | boolean | number | null | undefined, column: ReferenceColumn, labels: ReferenceDataLabels) {
  const normalized = value ?? '—';
  const text = cellText(normalized, column, labels);

  if (column.type === 'boolean') {
    return (
      <Badge variant={normalized === true ? 'success' : 'muted'} aria-label={text}>
        {text}
      </Badge>
    );
  }

  if (column.type === 'badge') {
    return <Badge variant="secondary">{text}</Badge>;
  }

  return text;
}

function modalColumns(labels: ReferenceDataLabels, table?: ReferenceTable): ModalColumn[] {
  const rowKeyColumn: ModalColumn = {
    columnCode: 'row_key',
    label: labels.rowKey,
    type: 'text',
    required: true,
    readOnlyWhenEditing: true,
    help: labels.rowKeyHelp,
  };

  const dataColumns = (table?.columns ?? []).map((column) => ({
    columnCode: column.key,
    label: column.label,
    type: column.type === 'boolean' ? 'boolean' : 'text',
    required: /name|display|code/i.test(column.key),
  } satisfies ModalColumn));

  return [rowKeyColumn, ...dataColumns];
}

function modalRow(tableCode: string, row: ReferenceRow): ModalRow {
  return {
    tableCode,
    rowKey: row.rowKey,
    values: row.values,
  };
}

function emptyUpsertResult(): Promise<{ ok: false; error: string }> {
  return Promise.resolve({ ok: false, error: 'permission_denied' });
}

function emptyDeleteResult(): Promise<{ ok: false; error: string }> {
  return Promise.resolve({ ok: false, error: 'permission_denied' });
}

function friendlyActionError(error: string | undefined, labels: ReferenceDataLabels, fallback: string) {
  if (!error) return fallback;
  if (/^(forbidden|permission_denied|PERMISSION_DENIED)$/i.test(error)) {
    return labels.permissionDenied ?? fallback;
  }
  if (/^[A-Z0-9_]+$/.test(error)) return fallback;
  return error;
}

export function ReferenceDataScreen({
  tables,
  selectedTableCode,
  rowsByTable,
  labels,
  state = 'ready',
  canEditReferenceData = false,
  upsertReferenceRow,
  softDeleteReferenceRow,
  onReferenceDataChanged,
  e2eHarnessOpenModals = false,
}: ReferenceDataScreenProps) {
  const initialTable = tables.some((table) => table.code === selectedTableCode) ? selectedTableCode : tables[0]?.code ?? '';
  const [activeTableCode, setActiveTableCode] = React.useState(initialTable);
  const [dialog, setDialog] = React.useState<DialogState>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const selectedTable = tables.find((table) => table.code === activeTableCode) ?? tables[0];
  const selectedRows = selectedTable ? rowsByTable[selectedTable.code] ?? [] : [];
  const tableState = state === 'loading' || state === 'error' ? state : selectedRows.length === 0 ? 'empty' : 'ready';
  const selectedModalColumns = React.useMemo(() => modalColumns(labels, selectedTable), [labels, selectedTable]);

  function notifyChanged() {
    onReferenceDataChanged?.();
  }

  async function handleModalUpsert(input: { tableCode: string; rowKey: string; values: Record<string, string | number | boolean | null> }) {
    if (!canEditReferenceData || !upsertReferenceRow) return emptyUpsertResult();
    const expectedVersion = dialog?.kind === 'edit' ? dialog.row.version : undefined;
    const result = await upsertReferenceRow({
      tableCode: input.tableCode,
      rowKey: input.rowKey,
      rowData: input.values,
      ...(expectedVersion !== undefined ? { expectedVersion } : {}),
    });
    if (result.ok) {
      setActionError(null);
      return { ok: true as const, tableCode: input.tableCode, rowKey: input.rowKey, revalidatedPath: '/settings/reference' as const };
    }
    const error = friendlyActionError(result.error, labels, labels.modal?.edit?.saveFailed ?? 'Unable to save reference row.');
    setActionError(error);
    return { ok: false as const, error };
  }

  async function handleModalDelete() {
    if (!canEditReferenceData || !softDeleteReferenceRow || dialog?.kind !== 'delete') return emptyDeleteResult();
    const result = await softDeleteReferenceRow({
      tableCode: dialog.tableCode,
      rowKey: dialog.row.rowKey,
      expectedVersion: dialog.row.version ?? 1,
    });
    if (result.ok) {
      setActionError(null);
      notifyChanged();
      return { ok: true as const };
    }
    const error = friendlyActionError(result.error, labels, labels.modal?.delete?.submitFailed ?? 'Unable to delete reference data.');
    setActionError(error);
    return { ok: false as const, error };
  }

  const editDialogRow = dialog?.kind === 'edit' ? modalRow(dialog.tableCode, dialog.row) : null;
  const harnessDialogRow = e2eHarnessOpenModals && selectedTable && selectedRows[0] ? modalRow(selectedTable.code, selectedRows[0]) : null;
  const deleteDialog = dialog?.kind === 'delete' ? dialog : null;
  const deleteDialogRow = deleteDialog
    ? {
        id: deleteDialog.row.rowId,
        code: deleteDialog.row.rowKey,
        name: cellText(deleteDialog.row.values.display_name ?? deleteDialog.row.values.name_en ?? deleteDialog.row.values.name ?? deleteDialog.row.rowKey, { key: 'name', label: labels.rowKey, type: 'text' }, labels),
      }
    : harnessDialogRow && selectedRows[0]
      ? {
          id: selectedRows[0].rowId,
          code: selectedRows[0].rowKey,
          name: cellText(selectedRows[0].values.display_name ?? selectedRows[0].values.name_en ?? selectedRows[0].values.name ?? selectedRows[0].rowKey, { key: 'name', label: labels.rowKey, type: 'text' }, labels),
        }
      : null;

  return (
    <main data-testid="settings-reference-data-screen" aria-labelledby="reference-data-heading" className="settings-reference-data-screen space-y-4">
      <header className="flex items-start justify-between gap-4" data-region="page-head">
        <div>
          <h1 id="reference-data-heading">{labels.title}</h1>
          <p>{labels.subtitle}</p>
        </div>
        <div data-testid="reference-data-actions" className="flex items-center gap-2">
          <a className="btn" href={`/settings/reference/${activeTableCode}/import`}>
            {labels.importCsv}
          </a>
          <Button type="button">{labels.exportCsv}</Button>
          <Button
            type="button"
            disabled={!canEditReferenceData}
            title={!canEditReferenceData ? labels.permissionDenied : undefined}
            onClick={() => {
              setActionError(null);
              setDialog({ kind: 'add', tableCode: activeTableCode });
            }}
          >
            {labels.addRow}
          </Button>
        </div>
      </header>

      {!canEditReferenceData ? (
        <div role="status" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {labels.permissionDenied ?? 'You do not have permission to edit reference data.'}
        </div>
      ) : null}

      {actionError ? (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {actionError}
        </div>
      ) : null}

      <div data-testid="reference-table-card-grid" className="sg-card-grid grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {tables.map((table) => (
          <Button
            key={table.code}
            type="button"
            onClick={() => setActiveTableCode(table.code)}
            aria-pressed={activeTableCode === table.code}
            className="text-left"
          >
            <Card className={activeTableCode === table.code ? 'active border-blue-500' : undefined}>
              <CardContent>
                <div className="sg-card-title font-semibold">{table.name}</div>
                <div className="sg-card-desc text-sm text-muted-foreground">{table.desc}</div>
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <Badge variant={table.marker === 'UNIVERSAL' ? 'info' : 'warning'}>{table.marker}</Badge>
                  <span>{table.rows} {labels.rowsSuffix}</span>
                  <span className="ml-auto">{labels.updatedPrefix} {table.updated}</span>
                </div>
              </CardContent>
            </Card>
          </Button>
        ))}
      </div>

      {selectedTable ? (
        <section role="region" aria-labelledby="reference-table-heading" className="rounded-lg border bg-white p-4">
          <h2 id="reference-table-heading">{selectedTable.name}</h2>
          <p>{selectedTable.desc}</p>

          {tableState === 'loading' ? (
            <div role="status">{labels.loading}</div>
          ) : tableState === 'error' ? (
            <div role="alert">{labels.error}</div>
          ) : tableState === 'empty' ? (
            <div role="status">{labels.empty}</div>
          ) : (
            <Table aria-label={selectedTable.name}>
              <TableHeader>
                <TableRow>
                  {selectedTable.columns.map((column) => (
                    <TableHead scope="col" key={column.key}>{column.label}</TableHead>
                  ))}
                  <TableHead scope="col">{labels.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedRows.map((row) => (
                  <TableRow key={row.rowId}>
                    {selectedTable.columns.map((column) => (
                      <TableCell key={column.key}>{renderCell(row.values[column.key], column, labels)}</TableCell>
                    ))}
                    <TableCell>
                      <Button
                        type="button"
                        disabled={!canEditReferenceData}
                        aria-label={`${labels.edit} ${rowLabel(row)}`}
                        onClick={() => {
                          setActionError(null);
                          setDialog({ kind: 'edit', tableCode: selectedTable.code, row });
                        }}
                      >
                        {labels.edit}
                      </Button>{' '}
                      <Button
                        type="button"
                        disabled={!canEditReferenceData}
                        aria-label={`${labels.delete} ${rowLabel(row)}`}
                        onClick={() => {
                          setActionError(null);
                          setDialog({ kind: 'delete', tableCode: selectedTable.code, row });
                        }}
                      >
                        {labels.delete}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      ) : null}

      <RefRowEditModal
        open={Boolean(harnessDialogRow) || dialog?.kind === 'add' || dialog?.kind === 'edit'}
        tableCode={harnessDialogRow?.tableCode ?? (dialog?.kind === 'add' || dialog?.kind === 'edit' ? dialog.tableCode : activeTableCode)}
        tableLabel={selectedTable?.name}
        row={harnessDialogRow ?? editDialogRow}
        columns={selectedModalColumns}
        labels={labels.modal?.edit}
        upsertReferenceRow={handleModalUpsert}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        onSaved={notifyChanged}
      />

      {deleteDialogRow ? (
        <DeleteReferenceDataModal
          open={true}
          table={deleteDialog?.tableCode ?? selectedTable?.code ?? activeTableCode}
          row={deleteDialogRow}
          labels={labels.modal?.delete}
          precheckDeleteReferenceData={async () => ({ affected_count: 0 })}
          deleteReferenceData={handleModalDelete}
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
        />
      ) : null}
    </main>
  );
}

export default ReferenceDataScreen;
