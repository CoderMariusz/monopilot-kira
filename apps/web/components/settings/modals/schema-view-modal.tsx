'use client';

import React from 'react';

import { Button } from '@monopilot/ui/Button';
import Summary from '@monopilot/ui/Summary';

export type SchemaColumnTier = 'L1' | 'L2' | 'L3' | 'L4';

export type SchemaColumnSummary = {
  col: string;
  label: string;
  table: string;
  dept: string;
  type: string;
  tier: SchemaColumnTier;
  storage: string;
  req: boolean;
  status: string;
  version: number;
};

export type SchemaViewModalProps = {
  open: boolean;
  column?: SchemaColumnSummary | null;
  loading?: boolean;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
};

const SUMMARY_LABELS = [
  'Column code',
  'Label',
  'Table',
  'Dept',
  'Data type',
  'Tier',
  'Storage',
  'Required',
  'Status',
  'Schema version',
] as const;

type SummaryLabel = (typeof SUMMARY_LABELS)[number];

type SummaryRow = {
  label: SummaryLabel;
  value: React.ReactNode;
  emphasis?: boolean;
};

function slugifyLabel(label: SummaryLabel) {
  return label.toLowerCase().replace(/\s+/g, '-');
}

function schemaRows(column: SchemaColumnSummary): SummaryRow[] {
  return [
    { label: 'Column code', value: column.col },
    { label: 'Label', value: column.label },
    { label: 'Table', value: column.table },
    { label: 'Dept', value: column.dept },
    { label: 'Data type', value: column.type },
    { label: 'Tier', value: column.tier },
    { label: 'Storage', value: column.storage },
    { label: 'Required', value: column.req ? 'Yes' : 'No' },
    { label: 'Status', value: column.status },
    { label: 'Schema version', value: `v${column.version}`, emphasis: true },
  ];
}

function DialogContent({
  titleId,
  descriptionId,
  dialogRef,
  onKeyDown,
  children,
}: {
  titleId: string;
  descriptionId: string;
  dialogRef: React.RefObject<HTMLElement | null>;
  onKeyDown: React.KeyboardEventHandler<HTMLElement>;
  children: React.ReactNode;
}) {
  return React.createElement(
    'section',
    {
      ref: dialogRef,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': titleId,
      'aria-describedby': descriptionId,
      'data-focus-trap': 'radix-dialog',
      'data-size': 'wide',
      'data-modal-id': 'SM-03',
      'data-testid': 'schema-view-modal',
      onKeyDown,
      style: { maxWidth: 'var(--modal-size-wide-width)' },
    },
    children,
  );
}

function SchemaSummary({ column }: { column: SchemaColumnSummary }) {
  return (
    <Summary
      rows={schemaRows(column).map((row) => ({
        label: row.label,
        after: (
          <span data-testid={`schema-summary-value-${slugifyLabel(row.label)}`}>
            {row.emphasis ? <strong>{row.value}</strong> : row.value}
          </span>
        ),
      }))}
    />
  );
}

function StateAlert({ tone, children }: { tone: 'blue' | 'red'; children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className={`alert alert-${tone}`}
      style={{ fontSize: 11, marginTop: 10 }}
    >
      {children}
    </div>
  );
}

function getFocusableElements(dialog: HTMLElement) {
  return Array.from(
    dialog.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
  ).filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true');
}

function useModalFocusLifecycle(open: boolean, dialogRef: React.RefObject<HTMLElement | null>) {
  const previousFocusRef = React.useRef<HTMLElement | null>(null);

  React.useLayoutEffect(() => {
    if (!open) return undefined;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const beforeGuard = document.createElement('span');
    const afterGuard = document.createElement('span');
    beforeGuard.setAttribute('data-radix-focus-guard', '');
    afterGuard.setAttribute('data-radix-focus-guard', '');
    document.body.prepend(beforeGuard);
    document.body.append(afterGuard);
    dialogRef.current?.setAttribute('data-slot', 'dialog-content');
    document.getElementById('schema-view-modal-close')?.focus();

    return () => {
      beforeGuard.remove();
      afterGuard.remove();
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus();
    };
  }, [dialogRef, open]);
}

export function SchemaViewModal({
  open,
  column,
  loading = false,
  error = null,
  onOpenChange,
}: SchemaViewModalProps) {
  const dialogRef = React.useRef<HTMLElement | null>(null);
  const titleId = React.useId() || 'schema-view-modal-title';
  const descriptionId = `${titleId}-description`;
  useModalFocusLifecycle(open, dialogRef);

  const handleDialogKeyDown: React.KeyboardEventHandler<HTMLElement> = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onOpenChange(false);
      return;
    }

    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = getFocusableElements(dialogRef.current);
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (!open) return null;

  const title = column ? `Column — ${column.col}` : 'Column schema';
  const subtitle = column ? `${column.label} (${column.table})` : 'Schema registry column summary';

  return (
    <DialogContent
      titleId={titleId}
      descriptionId={descriptionId}
      dialogRef={dialogRef}
      onKeyDown={handleDialogKeyDown}
    >
      <div data-testid="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 id={titleId} style={{ margin: 0 }}>{title}</h2>
      </div>
      <div data-testid="modal-body">
        <p id={descriptionId} style={{ color: 'var(--muted)', fontSize: 12, marginTop: 0 }}>{subtitle}</p>

        {loading ? (
          <div role="status" aria-label="Loading schema column" className="alert alert-blue" style={{ fontSize: 11 }}>
            Loading schema column…
          </div>
        ) : error ? (
          <StateAlert tone="red">{error}</StateAlert>
        ) : column ? (
          <>
            <SchemaSummary column={column} />
            <StateAlert tone="blue">
              {column.tier === 'L1'
                ? 'Edit not available — open promotion request. L1 columns are universal. Use the schema promotion wizard (SM-05) to raise a tier-change request.'
                : 'L2/L3 columns can be modified via the schema edit wizard.'}
            </StateAlert>
          </>
        ) : (
          <StateAlert tone="blue">No schema column selected</StateAlert>
        )}
      </div>
      <div data-testid="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
        <Button id="schema-view-modal-close" type="button" className="btn-secondary btn-sm" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      </div>
    </DialogContent>
  );
}

export default SchemaViewModal;
