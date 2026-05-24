/**
 * T-078 / SET-056 — ManufacturingOperationEditModal RED tests.
 * Source of truth: docs/prd/02-SETTINGS-PRD.md §8.9.4 and V-SET-MFG-01.
 * Adjacent prototype references are pattern-only; this test pins Manufacturing Operations semantics.
 * RED scope: tests only; production component is intentionally not implemented here.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assertModalA11y } from '../../../../../packages/ui/test/assertModalA11y';

type IndustryCode = 'bakery' | 'pharma' | 'fmcg' | 'generic' | 'custom';
type ManufacturingOperation = {
  id: string;
  operation_name: string;
  process_suffix: string;
  description?: string | null;
  industry_code: IndustryCode;
  operation_seq: number;
  is_active: boolean;
};

type SaveManufacturingOperationResult =
  | { ok: true; operationId: string; revalidatedPath: '/settings/reference/manufacturing-operations' }
  | { ok: false; error: string };

type ManufacturingOperationEditModalProps = {
  open: boolean;
  mode: 'create' | 'edit';
  operation?: ManufacturingOperation | null;
  existingOperations?: ManufacturingOperation[];
  loading?: boolean;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
  saveManufacturingOperation: (input: {
    operationId?: string;
    operation_name: string;
    process_suffix: string;
    description?: string | null;
    industry_code: IndustryCode;
    operation_seq: number;
    is_active: boolean;
  }) => Promise<SaveManufacturingOperationResult>;
  onSaved: (result: { operationId: string; revalidatedPath: '/settings/reference/manufacturing-operations' }) => void;
};

type ManufacturingOperationEditModule = {
  ManufacturingOperationEditModal?: React.ComponentType<ManufacturingOperationEditModalProps>;
  default?: React.ComponentType<ManufacturingOperationEditModalProps>;
  manufacturingOperationEditSchema?: {
    safeParse: (value: unknown) => { success: boolean; error?: { issues?: Array<{ path?: Array<string | number>; message?: string }> } };
  };
};

const mixOperation: ManufacturingOperation = {
  id: 'mfg-op-mix',
  operation_name: 'Mix',
  process_suffix: 'MX',
  description: 'Mixing dry ingredients for dough',
  industry_code: 'bakery',
  operation_seq: 1,
  is_active: true,
};

async function loadManufacturingOperationEditModule() {
  const target = './manufacturing-operation-edit-modal';
  const module = (await import(/* @vite-ignore */ target).catch(() => null)) as ManufacturingOperationEditModule | null;

  expect(
    module,
    'apps/web/components/settings/modals/manufacturing-operation-edit-modal.tsx should exist and export SET-056 ManufacturingOperationEditModal',
  ).not.toBeNull();

  const component = module?.ManufacturingOperationEditModal ?? module?.default;
  expect(component, 'ManufacturingOperationEditModal must be exported as a renderable React component').toEqual(
    expect.any(Function),
  );

  return { module: module as ManufacturingOperationEditModule, Component: component as React.ComponentType<ManufacturingOperationEditModalProps> };
}

async function renderManufacturingOperationEditModal(overrides: Partial<ManufacturingOperationEditModalProps> = {}) {
  const { Component, module } = await loadManufacturingOperationEditModule();
  const props: ManufacturingOperationEditModalProps = {
    open: true,
    mode: 'edit',
    operation: mixOperation,
    existingOperations: [mixOperation],
    onOpenChange: vi.fn(),
    saveManufacturingOperation: vi.fn().mockResolvedValue({
      ok: true,
      operationId: mixOperation.id,
      revalidatedPath: '/settings/reference/manufacturing-operations',
    } satisfies SaveManufacturingOperationResult),
    onSaved: vi.fn(),
    ...overrides,
  };

  const rtl = render(<Component {...props} />);
  return { ...rtl, props, module };
}

function getDialog(name = /edit operation/i) {
  return screen.getByRole('dialog', { name });
}

function getFooterButtonNames(dialog: HTMLElement) {
  return within(dialog)
    .getAllByRole('button')
    .map((button: HTMLElement) => button.textContent?.trim() || button.getAttribute('aria-label') || '')
    .filter((name) => name && !/^close$/i.test(name));
}

describe('SET-056 ManufacturingOperationEditModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders edit mode with operation_name and process_suffix as locked read-only text, not inputs', async () => {
    const { container } = await renderManufacturingOperationEditModal();

    const dialog = getDialog();
    expect(dialog).toHaveAttribute('data-testid', 'manufacturing-operation-edit-modal');
    expect(dialog).toHaveAttribute('data-slot', 'dialog-content');

    const scoped = within(dialog);
    expect(scoped.getByText('Mix')).toBeVisible();
    expect(scoped.getByText('MX')).toBeVisible();
    expect(scoped.queryByRole('textbox', { name: /operation name/i })).not.toBeInTheDocument();
    expect(scoped.queryByRole('textbox', { name: /process suffix/i })).not.toBeInTheDocument();
    expect(scoped.getAllByText(/read-only after creation|locked|immutable/i).length).toBeGreaterThanOrEqual(2);

    expect(scoped.getByRole('textbox', { name: /description/i })).toBeEnabled();
    expect(scoped.getByRole('combobox', { name: /industry code/i })).toBeEnabled();
    expect(scoped.getByRole('spinbutton', { name: /sequence order/i })).toBeEnabled();
    expect(scoped.getByRole('switch', { name: /active/i })).toBeEnabled();
    expect(getFooterButtonNames(dialog)).toEqual(['Cancel', 'Save changes']);
    expect(dialog.querySelectorAll('select')).toHaveLength(0);

    await assertModalA11y(container);
  });

  it("rejects process_suffix='M1@' with V-SET-MFG-01 and does not call the save action", async () => {
    const user = userEvent.setup();
    const { module, props } = await renderManufacturingOperationEditModal({
      mode: 'create',
      operation: null,
      existingOperations: [],
    });

    expect(
      module.manufacturingOperationEditSchema,
      'SET-056 must expose the Zod schema used by the modal so V-SET-MFG-01 is tested directly',
    ).toBeDefined();

    const zodResult = module.manufacturingOperationEditSchema?.safeParse({
      operation_name: 'Mix',
      process_suffix: 'M1@',
      description: 'Mixing dry ingredients for dough',
      industry_code: 'bakery',
      operation_seq: 1,
      is_active: true,
    });
    expect(zodResult?.success).toBe(false);
    expect(zodResult?.error?.issues?.some((issue) => issue.path?.join('.') === 'process_suffix')).toBe(true);

    const dialog = getDialog(/add manufacturing operation/i);
    const scoped = within(dialog);
    await user.type(scoped.getByRole('textbox', { name: /operation name/i }), 'Mix');
    await user.type(scoped.getByRole('textbox', { name: /process suffix/i }), 'M1@');
    await user.click(scoped.getByRole('button', { name: /create operation|save changes/i }));

    expect(props.saveManufacturingOperation).not.toHaveBeenCalled();
    expect(scoped.getByRole('alert')).toHaveTextContent(/V-SET-MFG-01|uppercase alphanumeric|2.?4/i);
  });
});
