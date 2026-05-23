/**
 * T-049 / SM-03 — SchemaViewModal RED tests.
 * Source of truth: prototypes/design/Monopilot Design System/settings/modals.jsx:111-138
 * RED scope: tests only; production component is intentionally not implemented here.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assertModalA11y } from '../../../../../packages/ui/test/assertModalA11y';

type SchemaColumnTier = 'L1' | 'L2' | 'L3';

type SchemaColumnSummary = {
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

type SchemaViewModalProps = {
  open: boolean;
  column?: SchemaColumnSummary | null;
  loading?: boolean;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
};

const l1Column: SchemaColumnSummary = {
  col: 'fg_item_id',
  label: 'Finished good item',
  table: 'products',
  dept: 'Technical',
  type: 'uuid',
  tier: 'L1',
  storage: 'Postgres',
  req: true,
  status: 'Active',
  version: 7,
};

async function loadSchemaViewModal() {
  const target = './schema-view-modal';
  const module = await import(/* @vite-ignore */ target).catch(() => null);

  expect(
    module,
    'apps/web/components/settings/modals/schema-view-modal.tsx should exist and export SM-03 SchemaViewModal',
  ).not.toBeNull();

  const component = module?.SchemaViewModal ?? module?.default;
  expect(component, 'SchemaViewModal must be exported as a renderable React component').toEqual(
    expect.any(Function),
  );
  return component as React.ComponentType<SchemaViewModalProps>;
}

async function renderSchemaViewModal(overrides: Partial<SchemaViewModalProps> = {}) {
  const SchemaViewModal = await loadSchemaViewModal();
  const props: SchemaViewModalProps = {
    open: true,
    column: l1Column,
    onOpenChange: vi.fn(),
    ...overrides,
  };

  const rtl = render(<SchemaViewModal {...props} />);
  return { ...rtl, props };
}

function getDialog() {
  return screen.getByRole('dialog', { name: /column — fg_item_id/i });
}

function visibleFooterButtonNames(dialog: HTMLElement) {
  return within(dialog)
    .getAllByRole('button')
    .map((button: HTMLElement) => button.textContent?.trim() || '')
    .filter(Boolean);
}

function summaryRowValue(dialog: HTMLElement, label: string) {
  const term = within(dialog).getByText(label, { selector: 'dt,[data-summary-label]' });
  const row = term.closest('[data-summary-row]') ?? term.parentElement;
  expect(row, `${label} summary row should be grouped for screen readers`).toBeTruthy();
  return within(row as HTMLElement).getByTestId(`schema-summary-value-${label.toLowerCase().replace(/\s+/g, '-')}`);
}

function modalOutline(dialog: HTMLElement) {
  const scoped = within(dialog);
  const labels = [
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
  ];

  return {
    modalId: dialog.getAttribute('data-modal-id'),
    testId: dialog.getAttribute('data-testid'),
    size: dialog.getAttribute('data-size'),
    title: scoped.getByRole('heading', { name: /column — fg_item_id/i }).textContent,
    subtitle: scoped.getByText('Finished good item (products)').textContent,
    sectionOrder: ['summary', 'tier-alert', 'footer'],
    summaryLabels: labels,
    summaryValues: labels.map((label) => summaryRowValue(dialog, label).textContent),
    footerButtons: visibleFooterButtonNames(dialog),
    primitiveSlots: {
      dialog: dialog.getAttribute('data-slot'),
      closeButton: scoped.getByRole('button', { name: /^close$/i }).closest('[data-slot="button"]')?.getAttribute('data-slot'),
      rawInputs: dialog.querySelectorAll('input, textarea, select').length,
    },
  };
}

describe('SM-03 SchemaViewModal prototype parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches the read-only SM-03 summary structure, shadcn/Radix primitives, footer order, L1 alert, focus order, and a11y contract', async () => {
    const user = userEvent.setup();
    const { container, props } = await renderSchemaViewModal();

    const dialog = getDialog();
    expect(modalOutline(dialog)).toMatchInlineSnapshot(`
      {
        "footerButtons": [
          "Close",
        ],
        "modalId": "SM-03",
        "primitiveSlots": {
          "closeButton": "button",
          "dialog": "dialog-content",
          "rawInputs": 0,
        },
        "sectionOrder": [
          "summary",
          "tier-alert",
          "footer",
        ],
        "size": "wide",
        "subtitle": "Finished good item (products)",
        "summaryLabels": [
          "Column code",
          "Label",
          "Table",
          "Dept",
          "Data type",
          "Tier",
          "Storage",
          "Required",
          "Status",
          "Schema version",
        ],
        "summaryValues": [
          "fg_item_id",
          "Finished good item",
          "products",
          "Technical",
          "uuid",
          "L1",
          "Postgres",
          "Yes",
          "Active",
          "v7",
        ],
        "testId": "schema-view-modal",
        "title": "Column — fg_item_id",
      }
    `);

    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Edit not available — open promotion request',
    );

    const close = within(dialog).getByRole('button', { name: /^close$/i });
    expect(close).toHaveFocus();
    await user.click(close);
    expect(props.onOpenChange).toHaveBeenCalledWith(false);

    await assertModalA11y(container);
  });

  it('renders loading, empty, and error states loudly instead of silently falling back to prototype globals', async () => {
    const { rerender, props } = await renderSchemaViewModal({ column: null, loading: true });

    let dialog = screen.getByRole('dialog', { name: /column schema/i });
    expect(within(dialog).getByRole('status', { name: /loading schema column/i })).toBeInTheDocument();
    expect(within(dialog).queryByText('fg_item_id')).not.toBeInTheDocument();

    const SchemaViewModal = await loadSchemaViewModal();
    rerender(<SchemaViewModal {...props} loading={false} column={null} />);
    dialog = screen.getByRole('dialog', { name: /column schema/i });
    expect(within(dialog).getByRole('alert')).toHaveTextContent('No schema column selected');

    rerender(<SchemaViewModal {...props} loading={false} column={null} error="Schema registry unavailable" />);
    dialog = screen.getByRole('dialog', { name: /column schema/i });
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Schema registry unavailable');
  });
});
