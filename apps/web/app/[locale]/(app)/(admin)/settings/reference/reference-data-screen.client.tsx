'use client';

import React from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardContent } from '@monopilot/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

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
  values: Record<string, string | boolean>;
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
};

export type ReferenceDataScreenProps = {
  tables: ReferenceTable[];
  selectedTableCode: string;
  rowsByTable: Record<string, ReferenceRow[]>;
  labels: ReferenceDataLabels;
  state?: 'ready' | 'loading' | 'empty' | 'error';
};

type DialogState =
  | { kind: 'add'; tableCode: string }
  | { kind: 'edit'; tableCode: string; row: ReferenceRow }
  | { kind: 'delete'; tableCode: string; row: ReferenceRow }
  | null;

function rowLabel(row: ReferenceRow) {
  return row.rowKey || row.rowId;
}

function cellText(value: string | boolean, column: ReferenceColumn) {
  if (typeof value === 'boolean') {
    if (/enabled|active/i.test(column.label)) return value ? 'Enabled' : 'Disabled';
    return value ? 'Yes' : 'No';
  }
  return value;
}

function renderCell(value: string | boolean | undefined, column: ReferenceColumn) {
  const normalized = value ?? '—';
  const text = cellText(normalized, column);

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

function ReferenceDialog({ dialog, labels, onOpenChange }: { dialog: DialogState; labels: ReferenceDataLabels; onOpenChange: (open: boolean) => void }) {
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const returnFocusTo = React.useRef<HTMLElement | null>(null);
  const isDelete = dialog?.kind === 'delete';
  const modalId = isDelete ? 'SM-10' : 'SM-11';
  const title = dialog?.kind === 'add'
    ? 'Reference row'
    : dialog?.kind === 'edit'
      ? `Edit row ${rowLabel(dialog.row)}`
      : dialog?.kind === 'delete'
        ? `Delete ${rowLabel(dialog.row)}`
        : 'Reference row';

  React.useEffect(() => {
    if (!dialog) return undefined;
    returnFocusTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const timer = window.setTimeout(() => dialogRef.current?.querySelector<HTMLElement>('button')?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', onKeyDown);
      if (returnFocusTo.current?.isConnected) returnFocusTo.current.focus();
    };
  }, [dialog, onOpenChange]);

  function trapTab(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab') return;
    const focusables = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex="0"]') ?? []);
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!dialog) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40" data-testid="reference-dialog-backdrop">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="reference-dialog-title" data-modal-id={modalId} className="rounded-lg border bg-white p-4 shadow-xl" onKeyDown={trapTab}>
        <div className="flex items-center justify-between gap-4">
          <h2 id="reference-dialog-title">{title}</h2>
          <Button type="button" aria-label="Close" onClick={() => onOpenChange(false)}>
            ×
          </Button>
        </div>
        <div>
          {dialog.kind === 'delete' ? (
            <p>Confirm deletion of {rowLabel(dialog.row)} from {dialog.tableCode}.</p>
          ) : (
            <p>Schema-driven reference row editor for {dialog.tableCode}.</p>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            {isDelete ? labels.delete : labels.edit}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ReferenceDataScreen({
  tables,
  selectedTableCode,
  rowsByTable,
  labels,
  state = 'ready',
}: ReferenceDataScreenProps) {
  const initialTable = tables.some((table) => table.code === selectedTableCode) ? selectedTableCode : tables[0]?.code ?? '';
  const [activeTableCode, setActiveTableCode] = React.useState(initialTable);
  const [dialog, setDialog] = React.useState<DialogState>(null);
  const selectedTable = tables.find((table) => table.code === activeTableCode) ?? tables[0];
  const selectedRows = selectedTable ? rowsByTable[selectedTable.code] ?? [] : [];
  const tableState = state === 'loading' || state === 'error' ? state : selectedRows.length === 0 ? 'empty' : 'ready';

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
          <Button type="button" onClick={() => setDialog({ kind: 'add', tableCode: activeTableCode })}>
            {labels.addRow}
          </Button>
        </div>
      </header>

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
                <div className="sg-card-title font-semibold">{table.name} </div>
                <div className="sg-card-desc text-sm text-muted-foreground">{table.desc} </div>
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <Badge variant={table.marker === 'UNIVERSAL' ? 'info' : 'warning'}>{table.marker}</Badge>{' '}
                  <span>{table.rows} {labels.rowsSuffix}</span>{' '}
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
                  <TableHead scope="col">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedRows.map((row) => (
                  <TableRow key={row.rowId}>
                    {selectedTable.columns.map((column) => (
                      <TableCell key={column.key}>{renderCell(row.values[column.key], column)}</TableCell>
                    ))}
                    <TableCell>
                      <Button type="button" aria-label={`${labels.edit} ${rowLabel(row)}`} onClick={() => setDialog({ kind: 'edit', tableCode: selectedTable.code, row })}>
                        {labels.edit}
                      </Button>{' '}
                      <Button type="button" aria-label={`${labels.delete} ${rowLabel(row)}`} onClick={() => setDialog({ kind: 'delete', tableCode: selectedTable.code, row })}>
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

      <ReferenceDialog dialog={dialog} labels={labels} onOpenChange={(open) => { if (!open) setDialog(null); }} />
    </main>
  );
}

export default ReferenceDataScreen;
