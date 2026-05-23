/**
 * T-057 / SM-11 — RefRowEditModal RED tests.
 * Source of truth: prototypes/design/Monopilot Design System/settings/modals.jsx:535-572
 * RED scope: tests only; production component is intentionally not implemented here.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assertModalA11y } from '../../../../../packages/ui/test/assertModalA11y';

type RefColumnType = 'text' | 'number' | 'boolean' | 'enum';

type RefSchemaColumn = {
  columnCode: string;
  label: string;
  type: RefColumnType;
  required?: boolean;
  readOnlyWhenEditing?: boolean;
  help?: string;
  options?: Array<{ value: string; label: string }>;
};

type RefRow = {
  tableCode: string;
  rowKey: string;
  values: Record<string, string | number | boolean | null>;
};

type UpsertReferenceRowResult =
  | { ok: true; tableCode: string; rowKey: string; revalidatedPath: '/settings/reference' }
  | { ok: false; error: string };

type RefRowEditModalProps = {
  open: boolean;
  tableCode: string;
  tableLabel?: string;
  row?: RefRow | null;
  columns: RefSchemaColumn[];
  loading?: boolean;
  error?: string | null;
  upsertReferenceRow: (input: {
    tableCode: string;
    rowKey: string;
    values: Record<string, string | number | boolean | null>;
  }) => Promise<UpsertReferenceRowResult>;
  onOpenChange: (open: boolean) => void;
  onSaved: (result: { tableCode: string; rowKey: string; revalidatedPath: '/settings/reference' }) => void;
};

const prototypeAllergenColumns: RefSchemaColumn[] = [
  {
    columnCode: 'row_key',
    label: 'Row key',
    type: 'text',
    required: true,
    readOnlyWhenEditing: true,
    help: 'Uppercase, min 2 chars. Unique in table.',
  },
  { columnCode: 'name_en', label: 'Name (EN)', type: 'text', required: true },
  { columnCode: 'name_pl', label: 'Name (PL)', type: 'text' },
  { columnCode: 'active', label: 'Active', type: 'boolean' },
];

const currentAllergenSchemaColumns: RefSchemaColumn[] = [
  ...prototypeAllergenColumns,
  { columnCode: 'sort_order', label: 'Sort order', type: 'number' },
  {
    columnCode: 'declaration_class',
    label: 'Declaration class',
    type: 'enum',
    options: [
      { value: 'major', label: 'Major allergen' },
      { value: 'trace', label: 'Trace only' },
    ],
  },
];

const milkRow: RefRow = {
  tableCode: 'allergens_reference',
  rowKey: 'MILK',
  values: {
    name_en: 'Milk',
    name_pl: 'Mleko',
    active: true,
    sort_order: 10,
    declaration_class: 'major',
  },
};

async function loadRefRowEditModal() {
  const target = './ref-row-edit-modal';
  const module = await import(/* @vite-ignore */ target).catch(() => null);

  expect(
    module,
    'apps/web/components/settings/modals/ref-row-edit-modal.tsx should exist and export SM-11 RefRowEditModal',
  ).not.toBeNull();

  const component = module?.RefRowEditModal ?? module?.default;
  expect(component, 'RefRowEditModal must be exported as a renderable React component').toEqual(
    expect.any(Function),
  );
  return component as React.ComponentType<RefRowEditModalProps>;
}

async function renderRefRowEditModal(overrides: Partial<RefRowEditModalProps> = {}) {
  const RefRowEditModal = await loadRefRowEditModal();
  const props: RefRowEditModalProps = {
    open: true,
    tableCode: 'allergens_reference',
    tableLabel: 'Allergens reference',
    row: milkRow,
    columns: prototypeAllergenColumns,
    upsertReferenceRow: vi.fn().mockResolvedValue({
      ok: true,
      tableCode: 'allergens_reference',
      rowKey: 'MILK',
      revalidatedPath: '/settings/reference',
    } satisfies UpsertReferenceRowResult),
    onOpenChange: vi.fn(),
    onSaved: vi.fn(),
    ...overrides,
  };

  const rtl = render(<RefRowEditModal {...props} />);
  return { ...rtl, props };
}

function getDialog(name = /edit row — MILK/i) {
  return screen.getByRole('dialog', { name });
}

function visibleFooterButtonNames(dialog: HTMLElement) {
  return within(dialog)
    .getAllByRole('button')
    .map((button: HTMLElement) => button.textContent?.trim() || button.getAttribute('aria-label') || '')
    .filter((name) => name && !/^close$/i.test(name));
}

function inputFor(dialog: HTMLElement, label: string) {
  return within(dialog).getByLabelText(label) as HTMLInputElement;
}

function modalOutline(dialog: HTMLElement) {
  const scoped = within(dialog);
  const fieldLabels = ['Row key', 'Name (EN)', 'Name (PL)', 'Active'];
  return {
    modalId: dialog.getAttribute('data-modal-id'),
    testId: dialog.getAttribute('data-testid'),
    size: dialog.getAttribute('data-size'),
    title: scoped.getByRole('heading', { name: /edit row — MILK/i }).textContent,
    subtitle: scoped.getByText('Reference table · allergens_reference').textContent,
    sectionOrder: ['row-key', 'name-en', 'name-pl', 'active', 'footer'],
    fieldLabels,
    fieldRoles: fieldLabels.map((label) => {
      if (label === 'Active') return scoped.getByRole('switch', { name: label }).getAttribute('role');
      return inputFor(dialog, label).getAttribute('type') ?? 'text';
    }),
    footerButtons: visibleFooterButtonNames(dialog),
    primitiveSlots: {
      dialog: dialog.getAttribute('data-slot'),
      rowKey: inputFor(dialog, 'Row key').closest('[data-slot="input"]')?.getAttribute('data-slot'),
      nameEn: inputFor(dialog, 'Name (EN)').closest('[data-slot="input"]')?.getAttribute('data-slot'),
      active: scoped.getByRole('switch', { name: 'Active' }).closest('[data-slot="switch"]')?.getAttribute('data-slot'),
      cancel: scoped.getByRole('button', { name: /^cancel$/i }).closest('[data-slot="button"]')?.getAttribute('data-slot'),
      save: scoped.getByRole('button', { name: /^save$/i }).closest('[data-slot="button"]')?.getAttribute('data-slot'),
      rawSelectCount: dialog.querySelectorAll('select').length,
    },
    initialValues: {
      rowKey: inputFor(dialog, 'Row key').value,
      rowKeyReadOnly: inputFor(dialog, 'Row key').readOnly,
      nameEn: inputFor(dialog, 'Name (EN)').value,
      namePl: inputFor(dialog, 'Name (PL)').value,
      active: scoped.getByRole('switch', { name: 'Active' }).getAttribute('aria-checked'),
      saveDisabled: scoped.getByRole('button', { name: /^save$/i }).hasAttribute('disabled'),
    },
  };
}

describe('SM-11 RefRowEditModal prototype parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches the SM-11 edit modal structure, shadcn/Radix primitives, validation rule, footer order, focus order, and a11y contract', async () => {
    const user = userEvent.setup();
    const { container } = await renderRefRowEditModal();

    const dialog = getDialog();
    expect(modalOutline(dialog)).toMatchInlineSnapshot(`
      {
        "fieldLabels": [
          "Row key",
          "Name (EN)",
          "Name (PL)",
          "Active",
        ],
        "fieldRoles": [
          "text",
          "text",
          "text",
          "switch",
        ],
        "footerButtons": [
          "Cancel",
          "Save",
        ],
        "initialValues": {
          "active": "true",
          "nameEn": "Milk",
          "namePl": "Mleko",
          "rowKey": "MILK",
          "rowKeyReadOnly": true,
          "saveDisabled": false,
        },
        "modalId": "SM-11",
        "primitiveSlots": {
          "active": "switch",
          "cancel": "button",
          "dialog": "dialog-content",
          "nameEn": "input",
          "rawSelectCount": 0,
          "rowKey": "input",
          "save": "button",
        },
        "sectionOrder": [
          "row-key",
          "name-en",
          "name-pl",
          "active",
          "footer",
        ],
        "size": "default",
        "subtitle": "Reference table · allergens_reference",
        "testId": "ref-row-edit-modal",
        "title": "Edit row — MILK",
      }
    `);

    const scoped = within(dialog);
    expect(inputFor(dialog, 'Row key')).toHaveFocus();
    await user.tab();
    expect(inputFor(dialog, 'Name (EN)')).toHaveFocus();
    await user.tab();
    expect(inputFor(dialog, 'Name (PL)')).toHaveFocus();
    await user.tab();
    expect(scoped.getByRole('switch', { name: 'Active' })).toHaveFocus();
    await user.tab();
    expect(scoped.getByRole('button', { name: /^cancel$/i })).toHaveFocus();
    await user.tab();
    expect(scoped.getByRole('button', { name: /^save$/i })).toHaveFocus();

    await user.clear(inputFor(dialog, 'Name (EN)'));
    expect(scoped.getByRole('button', { name: /^save$/i })).toBeDisabled();
    expect(await scoped.findByRole('alert')).toHaveTextContent('Min 2 chars');

    await assertModalA11y(container);
  });

  it('renders loading, empty, and error states loudly instead of silently falling back to prototype globals', async () => {
    const { rerender, props } = await renderRefRowEditModal({ row: null, loading: true });

    let dialog = screen.getByRole('dialog', { name: /reference row/i });
    expect(within(dialog).getByRole('status', { name: /loading reference row/i })).toBeInTheDocument();
    expect(within(dialog).queryByDisplayValue('MILK')).not.toBeInTheDocument();

    const RefRowEditModal = await loadRefRowEditModal();
    rerender(<RefRowEditModal {...props} loading={false} row={null} columns={[]} />);
    dialog = screen.getByRole('dialog', { name: /reference row/i });
    expect(within(dialog).getByRole('alert')).toHaveTextContent('No schema fields available for allergens_reference');

    rerender(<RefRowEditModal {...props} loading={false} row={null} error="Reference schema unavailable" />);
    dialog = screen.getByRole('dialog', { name: /reference row/i });
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Reference schema unavailable');
  });
});

describe('SM-11 RefRowEditModal schema-driven field rendering and save wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the current allergens_reference schema column list and types instead of a hardcoded allergen field list", async () => {
    await renderRefRowEditModal({ columns: currentAllergenSchemaColumns });

    const dialog = getDialog();
    expect(within(dialog).getAllByTestId(/ref-row-field-/)).toHaveLength(currentAllergenSchemaColumns.length);
    expect(inputFor(dialog, 'Sort order')).toHaveAttribute('type', 'number');
    expect(within(dialog).getByRole('combobox', { name: 'Declaration class' })).toBeInTheDocument();
    expect(dialog.querySelector('select')).toBeNull();
  });

  it('calls the reference-row Server Action and reports the revalidated parent table path without a full page reload', async () => {
    const user = userEvent.setup();
    const upsertReferenceRow = vi.fn().mockResolvedValue({
      ok: true,
      tableCode: 'allergens_reference',
      rowKey: 'MILK',
      revalidatedPath: '/settings/reference',
    } satisfies UpsertReferenceRowResult);
    const onOpenChange = vi.fn();
    const onSaved = vi.fn();
    const hrefBeforeSave = window.location.href;

    await renderRefRowEditModal({ upsertReferenceRow, onOpenChange, onSaved });
    const dialog = getDialog();
    await user.clear(inputFor(dialog, 'Name (EN)'));
    await user.type(inputFor(dialog, 'Name (EN)'), 'Milk protein');
    await user.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(upsertReferenceRow).toHaveBeenCalledTimes(1));
    expect(upsertReferenceRow).toHaveBeenCalledWith({
      tableCode: 'allergens_reference',
      rowKey: 'MILK',
      values: expect.objectContaining({ name_en: 'Milk protein', name_pl: 'Mleko', active: true }),
    });
    expect(onSaved).toHaveBeenCalledWith({
      tableCode: 'allergens_reference',
      rowKey: 'MILK',
      revalidatedPath: '/settings/reference',
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(window.location.href).toBe(hrefBeforeSave);
  });
});
