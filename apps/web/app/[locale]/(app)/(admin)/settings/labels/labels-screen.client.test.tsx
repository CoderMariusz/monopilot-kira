import '@testing-library/jest-dom/vitest';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import enSettings from '../../../../../../messages/en/02-settings.json';
import LabelsScreen, { type LabelsScreenLabels } from './labels-screen.client';
import type { LabelTemplate, LabelTemplateRow } from './_actions/label-templates';

/**
 * Label templates list + visual Label Editor RTL tests.
 * Prototype source: prototypes/design/Monopilot Design System/settings/editor-tweaks.jsx:3-257.
 *
 * Labels are built from the real shipped EN copy (settings.labels in
 * messages/en/02-settings.json) so the tests assert the actual translations,
 * matching the page's getTranslations('settings.labels') resolution.
 */
const m = (enSettings as { labels: Record<string, unknown> }).labels;

function buildLabels(): LabelsScreenLabels {
  const e = m.editor as Record<string, string>;
  return {
    title: m.title as string,
    subtitle: m.subtitle as string,
    importZpl: m.import_zpl as string,
    newTemplate: m.new_template as string,
    tableTitle: m.table_title as string,
    duplicate: m.duplicate as string,
    open: m.open as string,
    emptyTitle: m.empty_title as string,
    emptyBody: m.empty_body as string,
    loadError: m.load_error as string,
    permissionDenied: m.permission_denied as string,
    actionError: m.action_error as string,
    columns: {
      id: m.column_id as string,
      name: m.column_name as string,
      size: m.column_size as string,
      usedOn: m.column_used_on as string,
      updated: m.column_updated as string,
      status: m.column_status as string,
    },
    statusActive: m.status_active as string,
    statusDraft: m.status_draft as string,
    statusArchived: m.status_archived as string,
    newTemplateName: m.new_template_name as string,
    newTemplateSize: m.new_template_size as string,
    editor: {
      breadcrumbSettings: e.breadcrumb_settings,
      breadcrumbList: e.breadcrumb_list,
      breadcrumbEdit: e.breadcrumb_edit,
      back: e.back,
      preview: e.preview,
      testPrint: e.test_print,
      save: e.save,
      saving: e.saving,
      saved: e.saved,
      saveError: e.save_error,
      permissionDenied: e.permission_denied,
      addElement: e.add_element,
      paletteText: e.palette_text,
      paletteBarcode: e.palette_barcode,
      paletteQr: e.palette_qr,
      paletteBox: e.palette_box,
      dataFields: e.data_fields,
      canvas: e.canvas,
      canvasHint: e.canvas_hint,
      elementText: e.element_text,
      elementBarcode: e.element_barcode,
      elementQr: e.element_qr,
      elementBox: e.element_box,
      delete: e.delete,
      posX: e.pos_x,
      posY: e.pos_y,
      width: e.width,
      height: e.height,
      dataField: e.data_field,
      previewValue: e.preview_value,
      fontSize: e.font_size,
      weight: e.weight,
      weightRegular: e.weight_regular,
      weightBold: e.weight_bold,
      monospace: e.monospace,
      symbology: e.symbology,
      templateSettings: e.template_settings,
      widthMm: e.width_mm,
      heightMm: e.height_mm,
      targetPrinter: e.target_printer,
      usedOn: e.used_on,
      inspectorEmptyHint: e.inspector_empty_hint,
      lastSaved: e.last_saved,
      deleteTemplate: e.delete_template,
      deleting: e.deleting,
      deleteError: e.delete_error,
      deleteConfirmTitle: e.delete_confirm_title,
      deleteConfirmBody: e.delete_confirm_body,
      deleteConfirmCancel: e.delete_confirm_cancel,
      deleteConfirmConfirm: e.delete_confirm_confirm,
    },
  };
}

const ROWS: LabelTemplateRow[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Product retail label · 60×40mm',
    size: '60×40mm',
    used_on: 'Finished goods',
    updated_at: '2025-11-20T10:00:00.000Z',
    status: 'active',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Sample / retained · 60×40mm',
    size: '60×40mm',
    used_on: '',
    updated_at: '2025-07-30T10:00:00.000Z',
    status: 'draft',
  },
];

const FULL_TEMPLATE: LabelTemplate = {
  id: ROWS[0].id,
  org_id: 'org-1',
  name: ROWS[0].name,
  size: ROWS[0].size,
  used_on: ROWS[0].used_on,
  status: 'active',
  created_at: '2025-11-01T10:00:00.000Z',
  updated_at: ROWS[0].updated_at,
  elements: {
    width_mm: 60,
    height_mm: 40,
    printer: 'zebra-zd420',
    elements: [
      { id: 'el-1', type: 'text', x: 3, y: 3, w: 54, h: 6, field: 'product_name', value: 'Sliced Ham 200g', fontSize: 14, bold: true },
      { id: 'el-2', type: 'barcode', x: 3, y: 18, w: 36, h: 12, field: 'ean', value: '5901234567890', symbology: 'ean13' },
    ],
  },
};

const labels = buildLabels();

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('Label templates list (LabelTemplatesScreen parity)', () => {
  it('renders the prototype list columns + status badges from injected rows', () => {
    render(
      <LabelsScreen
        rows={ROWS}
        state="ready"
        canEdit
        labels={labels}
        createTemplate={vi.fn()}
        duplicateTemplate={vi.fn()}
        getTemplate={vi.fn()}
      />,
    );

    const root = screen.getByTestId('label-templates-screen');
    expect(root).toHaveAttribute('data-route', '/settings/labels');
    expect(root).toHaveAttribute(
      'data-prototype-source',
      'prototypes/design/Monopilot Design System/settings/editor-tweaks.jsx:3-257',
    );

    const table = screen.getByTestId('label-templates-table');
    for (const header of ['ID', 'Name', 'Size', 'Used on', 'Updated', 'Status']) {
      expect(within(table).getByRole('columnheader', { name: header })).toBeInTheDocument();
    }
    expect(screen.getAllByTestId('label-templates-row')).toHaveLength(2);
    expect(screen.getByText('Product retail label · 60×40mm')).toBeInTheDocument();
    expect(screen.getByText('✓ Active')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /import zpl/i })).toBeInTheDocument();
    expect(screen.getByTestId('label-templates-new')).toBeEnabled();
  });

  it('renders an empty state when there are no templates', () => {
    render(<LabelsScreen rows={[]} state="empty" canEdit labels={labels} />);

    expect(screen.getByTestId('label-templates-empty')).toBeInTheDocument();
    expect(screen.getByText('No label templates yet')).toBeInTheDocument();
    expect(screen.queryByTestId('label-templates-table')).not.toBeInTheDocument();
  });

  it('opens the editor from a row through the getTemplate loader', async () => {
    const user = userEvent.setup();
    const getTemplate = vi.fn(async () => FULL_TEMPLATE);

    render(
      <LabelsScreen
        rows={ROWS}
        state="ready"
        canEdit
        labels={labels}
        getTemplate={getTemplate}
        updateTemplate={vi.fn()}
      />,
    );

    await user.click(screen.getAllByTestId('label-templates-open')[0]);

    expect(getTemplate).toHaveBeenCalledWith(ROWS[0].id);
    expect(await screen.findByTestId('label-editor-screen')).toBeInTheDocument();
    expect(screen.getByTestId('label-editor-canvas')).toBeInTheDocument();
  });
});

describe('Visual Label Editor (LabelEditor parity)', () => {
  function renderEditor(
    overrides: { updateTemplate?: ReturnType<typeof vi.fn>; deleteTemplate?: ReturnType<typeof vi.fn> } = {},
  ) {
    const getTemplate = vi.fn(async () => FULL_TEMPLATE);
    const updateTemplate =
      overrides.updateTemplate ??
      vi.fn(async (_id: string, _input: unknown) => ({ ok: true as const, template: FULL_TEMPLATE }));
    const deleteTemplate =
      overrides.deleteTemplate ?? vi.fn(async (id: string) => ({ ok: true as const, id }));
    const utils = render(
      <LabelsScreen
        rows={ROWS}
        state="ready"
        canEdit
        labels={labels}
        getTemplate={getTemplate}
        updateTemplate={updateTemplate}
        deleteTemplate={deleteTemplate}
      />,
    );
    return { ...utils, getTemplate, updateTemplate, deleteTemplate };
  }

  async function openEditor(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getAllByTestId('label-templates-open')[0]);
    await screen.findByTestId('label-editor-screen');
  }

  it('renders the 3-column palette / canvas / inspector with the template elements', async () => {
    const user = userEvent.setup();
    renderEditor();
    await openEditor(user);

    // palette
    expect(screen.getByRole('button', { name: /text \/ field/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^barcode$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /qr code/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /box \/ line/i })).toBeInTheDocument();
    // canvas with the two persisted elements
    expect(screen.getByTestId('label-editor-canvas')).toBeInTheDocument();
    expect(screen.getAllByTestId('label-editor-element')).toHaveLength(2);
    // inspector for the first (auto-selected) element
    expect(screen.getByTestId('label-editor-inspector')).toBeInTheDocument();
    expect(screen.getByLabelText('Preview value')).toHaveValue('Sliced Ham 200g');
  });

  it('adds a new element via the palette and selects it', async () => {
    const user = userEvent.setup();
    renderEditor();
    await openEditor(user);

    expect(screen.getAllByTestId('label-editor-element')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: /text \/ field/i }));

    expect(screen.getAllByTestId('label-editor-element')).toHaveLength(3);
    // newly added element is selected → inspector shows its default value
    expect(screen.getByLabelText('Preview value')).toHaveValue('New text');
  });

  it('edits a selected element property (preview value)', async () => {
    const user = userEvent.setup();
    renderEditor();
    await openEditor(user);

    const valueInput = screen.getByLabelText('Preview value');
    await user.clear(valueInput);
    await user.type(valueInput, 'Sliced Ham 250g');
    expect(valueInput).toHaveValue('Sliced Ham 250g');
  });

  it('saves the canvas (elements jsonb) through updateLabelTemplate', async () => {
    const user = userEvent.setup();
    const updateTemplate = vi.fn(async (_id: string, _input: unknown) => ({
      ok: true as const,
      template: FULL_TEMPLATE,
    }));
    renderEditor({ updateTemplate });
    await openEditor(user);

    // mutate then save
    const valueInput = screen.getByLabelText('Preview value');
    await user.clear(valueInput);
    await user.type(valueInput, 'Edited value');
    await user.click(screen.getByTestId('label-editor-save'));

    await waitFor(() => expect(updateTemplate).toHaveBeenCalledTimes(1));
    const [id, payload] = updateTemplate.mock.calls[0];
    expect(id).toBe(FULL_TEMPLATE.id);
    expect(payload).toMatchObject({
      elements: {
        width_mm: 60,
        height_mm: 40,
        printer: 'zebra-zd420',
      },
    });
    const sentElements = (payload as { elements: { elements: Array<{ value?: string }> } }).elements.elements;
    expect(sentElements.some((el) => el.value === 'Edited value')).toBe(true);
    expect(await screen.findByTestId('label-editor-saved')).toBeInTheDocument();
  });

  it('shows a Delete button in the edit view', async () => {
    const user = userEvent.setup();
    renderEditor();
    await openEditor(user);

    const deleteButton = screen.getByTestId('label-editor-delete');
    expect(deleteButton).toBeInTheDocument();
    expect(deleteButton).toHaveTextContent('Delete template');
    expect(deleteButton).toHaveClass('btn-danger');
    expect(deleteButton).toBeEnabled();
  });

  it('deletes through confirm → deleteLabelTemplate → returns to the list', async () => {
    const user = userEvent.setup();
    const deleteTemplate = vi.fn(async (id: string) => ({ ok: true as const, id }));
    renderEditor({ deleteTemplate });
    await openEditor(user);

    // Delete is guarded by a confirm step — the action is not called on first click.
    await user.click(screen.getByTestId('label-editor-delete'));
    expect(deleteTemplate).not.toHaveBeenCalled();

    // Confirm dialog is shown for the open template.
    expect(await screen.findByTestId('label-editor-delete-confirm-body')).toHaveTextContent(
      FULL_TEMPLATE.name,
    );

    await user.click(screen.getByTestId('label-editor-delete-confirm'));

    await waitFor(() => expect(deleteTemplate).toHaveBeenCalledTimes(1));
    expect(deleteTemplate).toHaveBeenCalledWith(FULL_TEMPLATE.id);

    // Returns to the list and the deleted row is gone.
    expect(await screen.findByTestId('label-templates-table')).toBeInTheDocument();
    expect(screen.queryByTestId('label-editor-screen')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('label-templates-row')).toHaveLength(1);
    expect(screen.queryByText(FULL_TEMPLATE.name)).not.toBeInTheDocument();
  });

  it('can cancel the delete confirm without calling the action', async () => {
    const user = userEvent.setup();
    const deleteTemplate = vi.fn(async (id: string) => ({ ok: true as const, id }));
    renderEditor({ deleteTemplate });
    await openEditor(user);

    await user.click(screen.getByTestId('label-editor-delete'));
    await screen.findByTestId('label-editor-delete-confirm-body');
    await user.click(screen.getByTestId('label-editor-delete-cancel'));

    expect(deleteTemplate).not.toHaveBeenCalled();
    // Still in the editor.
    expect(screen.getByTestId('label-editor-screen')).toBeInTheDocument();
  });
});
