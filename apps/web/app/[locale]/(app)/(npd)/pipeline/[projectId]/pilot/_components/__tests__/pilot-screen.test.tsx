/**
 * @vitest-environment jsdom
 * NPD PILOT stage — PilotScreen component test.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/other-stages.jsx:352-409 (PilotScreen)
 *
 * Asserts the parity checklist: blue "Scheduled pilot" info bar, the 4-field
 * "Pilot run plan" (LINE / BATCH SIZE / EXPECTED YIELD / DURATION), the
 * "Material reservation" table with a green "✓ Reserved" / amber "⚠ Short"
 * status badge + the amber short callout, and the "Pilot checklist" (Checkbox
 * primitive — NEVER a raw <input type="checkbox"> — with strikethrough when
 * checked). Plus the five UI states (loading / empty / ready / error /
 * permission-denied), the optimistic toggle, and that all visible strings come
 * from injected i18n labels (no default leak), and there is NO legacy banner.
 *
 * REWORK (this task): the user no longer types derived data. Asserts the new
 * contract:
 *   - the "Line" field in the run-plan modal is a Select (combobox), NOT a
 *     free-text <input>;
 *   - the ingredient rows come from the recipe loader (recipeMaterials prop),
 *     one row per recipe ingredient — NOT manually-added rows;
 *   - Required / Available / Reserved are READ-ONLY display cells (no inputs
 *     anywhere in the materials table);
 *   - there is NO "+ Add material" / per-row "Edit material" affordance;
 *   - changing the line re-calls onLoadRecipeMaterials and re-renders the table.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  PilotScreen,
  type PilotLabels,
  type PilotRecipeMaterialView,
  type PilotScreenData,
  type ProductionLineOption,
} from '../pilot-screen';

afterEach(() => cleanup());

const LABELS: PilotLabels = {
  title: 'Pilot production',
  breadcrumb: 'NPD / Pilot production',
  scheduledPilot: 'Scheduled pilot:',
  scheduledPilotBody: '{date} · {line} · {batch} batch · Supervisor: {supervisor}',
  supervisorLabel: 'Supervisor',
  noSupervisor: 'Unassigned',
  planTitle: 'Pilot run plan',
  colLine: 'Line',
  colBatchSize: 'Batch size',
  colExpectedYield: 'Expected yield',
  colDuration: 'Duration',
  unitKg: 'kg',
  unitPct: '%',
  unitHours: 'h',
  materialTitle: 'Material reservation',
  colIngredient: 'Ingredient',
  colRequired: 'Required',
  colAvailable: 'Available',
  colReserved: 'Reserved',
  colStatus: 'Status',
  statusReserved: '✓ Reserved',
  statusShort: '⚠ Short {shortBy}',
  shortCallout: 'Materials short by {shortBy}. Raise a PO or reduce the batch size.',
  checklistTitle: 'Pilot checklist',
  loading: 'Loading pilot data…',
  empty: 'No pilot run planned yet',
  emptyBody: 'A pilot run is scheduled once the formulation and trials are complete.',
  error: 'Unable to load pilot data.',
  forbidden: 'You do not have permission to view the pilot stage.',
  notSet: '—',
  planPilotRun: '+ Plan pilot run',
  editPlan: 'Edit plan',
  fieldPlannedDate: 'Planned date',
  fieldLine: 'Line',
  linePlaceholder: 'Select a line…',
  noLines: 'No production lines configured.',
  selectLineHint: 'Select a line to see ingredient availability.',
  fieldBatchSize: 'Batch size (kg)',
  fieldExpectedYield: 'Expected yield (%)',
  fieldDuration: 'Duration (hours)',
  fieldSupervisor: 'Supervisor',
  fieldStatus: 'Status',
  statusPlanned: 'Planned',
  statusInProgress: 'In progress',
  statusCompleted: 'Completed',
  save: 'Save',
  saving: 'Saving…',
  cancel: 'Cancel',
  saveError: 'Could not save. Check the values and try again.',
};

const LINES: ProductionLineOption[] = [
  { id: 'l1', code: 'LINE2', name: 'Slicing/MAP', warehouseId: 'wh-2' },
  { id: 'l2', code: 'LINE3', name: 'Cooking', warehouseId: 'wh-3' },
];

// Two recipe ingredients (mirrors a 2-ingredient formulation): one fully
// reserved (green), one short (amber). These come from the recipe loader, NOT
// from manually-entered rows.
const RECIPE_MATERIALS: PilotRecipeMaterialView[] = [
  {
    ingredientCode: 'RM-PORK',
    ingredientName: 'Pork Ham, trimmed',
    requiredKg: '410.0000',
    availableKg: '850.0000',
    reservedKg: '410.0000',
    status: 'reserved',
  },
  {
    ingredientCode: 'RM-SPICE',
    ingredientName: 'Spice Mix (Ham blend)',
    requiredKg: '4.5000',
    availableKg: '3.2000',
    reservedKg: '3.2000',
    status: 'short',
  },
];

const DATA: PilotScreenData = {
  run: {
    id: 'run-1',
    projectId: 'project-1',
    plannedDate: '2025-12-20',
    line: 'LINE2',
    batchSizeKg: '500.0000',
    expectedYieldPct: '78.00',
    durationHours: '6.00',
    supervisorUserId: 'u-1',
    supervisorName: 'M. Johnson',
    status: 'planned',
  },
  checklist: [
    { id: 'c1', label: 'Recipe approved (v0.3)', isChecked: true, displayOrder: 1 },
    { id: 'c2', label: 'Materials reserved', isChecked: false, displayOrder: 2 },
  ],
  supervisors: [
    { id: 'u-1', name: 'M. Johnson' },
    { id: 'u-2', name: 'A. Smith' },
  ],
  canWrite: true,
  lines: LINES,
  recipeMaterials: RECIPE_MATERIALS,
};

function renderReady(extra?: Partial<React.ComponentProps<typeof PilotScreen>>) {
  return render(<PilotScreen state="ready" data={DATA} labels={LABELS} {...extra} />);
}

describe('PilotScreen — parity', () => {
  it('renders the blue "Scheduled pilot" info bar with date · line · batch · supervisor', () => {
    renderReady();
    const bar = screen.getByTestId('pilot-info-bar');
    expect(bar).toHaveTextContent('Scheduled pilot:');
    const body = within(bar).getByTestId('pilot-info-body').textContent ?? '';
    expect(body).toContain('2025-12-20');
    // Line CODE is resolved to "code — name" for display.
    expect(body).toContain('LINE2 — Slicing/MAP');
    expect(body).toContain('500 kg');
    expect(body).toContain('M. Johnson');
  });

  it('renders the 4-field Pilot run plan (line / batch / yield / duration)', () => {
    renderReady();
    const card = screen.getByTestId('pilot-plan-card');
    expect(within(card).getByText(LABELS.colLine)).toBeInTheDocument();
    expect(within(card).getByTestId('pilot-plan-line')).toHaveTextContent('LINE2 — Slicing/MAP');
    expect(within(card).getByText('500 kg')).toBeInTheDocument();
    expect(within(card).getByText('78 %')).toBeInTheDocument();
    expect(within(card).getByText('6 h')).toBeInTheDocument();
  });

  it('renders the material reservation table with green Reserved / amber Short badges', () => {
    renderReady();
    const rows = screen.getAllByTestId('pilot-material-row');
    expect(rows).toHaveLength(2);

    const reserved = rows.find((r) => r.dataset.status === 'reserved')!;
    expect(within(reserved).getByTestId('pilot-material-status')).toHaveClass('badge-green');
    expect(within(reserved).getByTestId('pilot-material-status')).toHaveTextContent('✓ Reserved');

    const short = rows.find((r) => r.dataset.status === 'short')!;
    const badge = within(short).getByTestId('pilot-material-status');
    expect(badge).toHaveClass('badge-amber');
    expect(badge).toHaveTextContent('⚠ Short 1.3 kg');
  });

  it('renders the amber short callout when materials are short', () => {
    renderReady();
    const callout = screen.getByTestId('pilot-short-callout');
    expect(callout).toHaveClass('alert-amber');
    expect(callout).toHaveTextContent('Materials short by 1.3 kg');
  });

  it('renders the checklist with the Slider/Checkbox primitive — NOT a raw <input type=checkbox>', () => {
    const { container } = renderReady();
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
  });

  it('strikes through checked checklist items only', () => {
    renderReady();
    const items = screen.getAllByTestId('pilot-checklist-item');
    const checked = items.find((i) => i.dataset.checked === 'true')!;
    const unchecked = items.find((i) => i.dataset.checked === 'false')!;
    expect(within(checked).getByTestId('pilot-checklist-label')).toHaveClass('line-through');
    expect(within(unchecked).getByTestId('pilot-checklist-label')).not.toHaveClass('line-through');
  });

  it('NEVER renders a LEGACY deprecation banner (live screen)', () => {
    renderReady();
    expect(screen.queryByText(/legacy/i)).toBeNull();
    expect(screen.queryByText(/deprecation/i)).toBeNull();
  });
});

describe('PilotScreen — recipe-driven materials (no manual entry)', () => {
  it('drives ingredient rows from the recipe loader — one row per recipe ingredient', () => {
    renderReady();
    const rows = screen.getAllByTestId('pilot-material-row');
    expect(rows).toHaveLength(RECIPE_MATERIALS.length); // 2 in the recipe → 2 rows
    expect(within(rows[0]!).getByText('RM-PORK')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Pork Ham, trimmed')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('RM-SPICE')).toBeInTheDocument();
  });

  it('prefers the explicit recipeMaterials prop over data.recipeMaterials', () => {
    renderReady({
      recipeMaterials: [
        {
          ingredientCode: 'RM-ONLY',
          ingredientName: 'Single ingredient',
          requiredKg: '1.0000',
          availableKg: '5.0000',
          reservedKg: '1.0000',
          status: 'reserved',
        },
      ],
    });
    const rows = screen.getAllByTestId('pilot-material-row');
    expect(rows).toHaveLength(1);
    expect(within(rows[0]!).getByText('RM-ONLY')).toBeInTheDocument();
  });

  it('renders Required / Available / Reserved as READ-ONLY cells — NO inputs in the table', () => {
    renderReady();
    const table = screen.getByTestId('pilot-material-table');
    // Read-only display: no text/number inputs and no editable controls.
    expect(table.querySelector('input')).toBeNull();
    expect(table.querySelector('textarea')).toBeNull();
    expect(table.querySelector('[contenteditable="true"]')).toBeNull();
    // The qty cells are plain text.
    const required = within(table).getAllByTestId('pilot-material-required');
    expect(required[0]).toHaveTextContent('410 kg');
    const available = within(table).getAllByTestId('pilot-material-available');
    expect(available[0]).toHaveTextContent('850 kg');
    const reserved = within(table).getAllByTestId('pilot-material-reserved');
    expect(reserved[0]).toHaveTextContent('410 kg');
  });

  it('NEVER renders a "+ Add material" or per-row "Edit material" affordance', () => {
    renderReady();
    expect(screen.queryByTestId('add-pilot-material-button')).toBeNull();
    expect(screen.queryByTestId('edit-pilot-material-button')).toBeNull();
    expect(screen.queryByTestId('pilot-material-form')).toBeNull();
  });

  it('shows Available/Reserved as "—" and a "select a line" hint when no line is selected', () => {
    const noLine: PilotScreenData = {
      ...DATA,
      run: { ...DATA.run, line: null },
      recipeMaterials: RECIPE_MATERIALS.map((m) => ({ ...m, availableKg: '0', reservedKg: '0' })),
    };
    render(<PilotScreen state="ready" data={noLine} labels={LABELS} />);
    expect(screen.getByTestId('pilot-select-line-hint')).toHaveTextContent(LABELS.selectLineHint);
    // Required (from the recipe) is still shown.
    expect(within(screen.getByTestId('pilot-material-table')).getAllByTestId('pilot-material-required')[0]).toHaveTextContent('410 kg');
    // Available / Reserved fall back to the "—" placeholder.
    expect(screen.getAllByTestId('pilot-material-available')[0]).toHaveTextContent('—');
    expect(screen.getAllByTestId('pilot-material-reserved')[0]).toHaveTextContent('—');
    // No short callout when no line is chosen (availability is unknown).
    expect(screen.queryByTestId('pilot-short-callout')).toBeNull();
  });
});

describe('PilotScreen — UI states', () => {
  it('loading', () => {
    render(<PilotScreen state="loading" data={null} labels={LABELS} />);
    expect(screen.getByRole('status')).toHaveTextContent(LABELS.loading);
  });
  it('empty', () => {
    render(<PilotScreen state="empty" data={null} labels={LABELS} />);
    expect(screen.getByText(LABELS.empty)).toBeInTheDocument();
  });
  it('error', () => {
    render(<PilotScreen state="error" data={null} labels={LABELS} />);
    expect(screen.getByRole('alert')).toHaveTextContent(LABELS.error);
  });
  it('permission_denied', () => {
    render(<PilotScreen state="permission_denied" data={null} labels={LABELS} />);
    expect(screen.getByRole('alert')).toHaveTextContent(LABELS.forbidden);
  });
});

describe('PilotScreen — optimistic toggle', () => {
  it('optimistically flips a checklist item and calls the Server Action', async () => {
    const onToggle = vi.fn().mockResolvedValue({ ok: true });
    renderReady({ onToggleChecklistItem: onToggle });

    const items = screen.getAllByTestId('pilot-checklist-item');
    const unchecked = items.find((i) => i.dataset.checked === 'false')!;
    fireEvent.click(within(unchecked).getByRole('checkbox'));

    expect(onToggle).toHaveBeenCalledWith({ itemId: 'c2', isChecked: true });
    await waitFor(() => {
      const after = screen
        .getAllByTestId('pilot-checklist-item')
        .find((i) => within(i).getByTestId('pilot-checklist-label').textContent === 'Materials reserved')!;
      expect(after.dataset.checked).toBe('true');
    });
  });

  it('rolls back the optimistic toggle when the Server Action fails', async () => {
    const onToggle = vi.fn().mockResolvedValue({ ok: false, error: 'forbidden' });
    renderReady({ onToggleChecklistItem: onToggle });

    const items = screen.getAllByTestId('pilot-checklist-item');
    const unchecked = items.find((i) => i.dataset.checked === 'false')!;
    fireEvent.click(within(unchecked).getByRole('checkbox'));

    await waitFor(() => {
      const after = screen
        .getAllByTestId('pilot-checklist-item')
        .find((i) => within(i).getByTestId('pilot-checklist-label').textContent === 'Materials reserved')!;
      expect(after.dataset.checked).toBe('false');
    });
  });
});

describe('PilotScreen — run-plan edit affordance', () => {
  it('shows "+ Plan pilot run" in the writable empty state and opens the modal', () => {
    const onUpsertRun = vi.fn().mockResolvedValue({ ok: true });
    render(
      <PilotScreen
        state="empty"
        data={null}
        labels={LABELS}
        canWrite
        supervisors={DATA.supervisors}
        lines={LINES}
        onUpsertRun={onUpsertRun}
      />,
    );
    const button = screen.getByTestId('plan-pilot-run-button');
    expect(button).toHaveTextContent(LABELS.planPilotRun);
    fireEvent.click(button);
    expect(screen.getByTestId('pilot-run-form')).toBeInTheDocument();
  });

  it('does NOT show the planner CTA in the empty state when the caller cannot write', () => {
    render(<PilotScreen state="empty" data={null} labels={LABELS} canWrite={false} />);
    expect(screen.queryByTestId('plan-pilot-run-button')).toBeNull();
  });

  it('renders the modal "Line" field as a Select (combobox) — NOT a free-text input', () => {
    const onUpsertRun = vi.fn().mockResolvedValue({ ok: true });
    renderReady({ onUpsertRun });

    fireEvent.click(screen.getByTestId('edit-pilot-plan-button'));
    const form = screen.getByTestId('pilot-run-form');
    const lineField = within(form).getByTestId('pilot-line-field');
    // The "Line" control is a Select trigger (combobox), not an <input>.
    expect(within(lineField).getByRole('combobox')).toBeInTheDocument();
    expect(lineField.querySelector('input')).toBeNull();
    // The trigger shows the resolved "code — name" for the persisted CODE.
    expect(within(lineField).getByRole('combobox')).toHaveTextContent('LINE2 — Slicing/MAP');
  });

  it('submits the line CODE (not free text) to onUpsertRun', async () => {
    const onUpsertRun = vi.fn().mockResolvedValue({ ok: true });
    renderReady({ onUpsertRun });

    fireEvent.click(screen.getByTestId('edit-pilot-plan-button'));
    const form = screen.getByTestId('pilot-run-form');
    fireEvent.submit(form);
    await waitFor(() => expect(onUpsertRun).toHaveBeenCalledTimes(1));
    expect(onUpsertRun).toHaveBeenCalledWith(
      expect.objectContaining({ pilotRunId: 'run-1', line: 'LINE2', supervisorUserId: 'u-1' }),
    );
  });

  it('re-derives the materials via onLoadRecipeMaterials when the line changes', async () => {
    const onUpsertRun = vi.fn().mockResolvedValue({ ok: true });
    const onLoad = vi.fn().mockResolvedValue([
      {
        ingredientCode: 'RM-PORK',
        ingredientName: 'Pork Ham, trimmed',
        requiredKg: '410.0000',
        availableKg: '12.0000',
        reservedKg: '12.0000',
        status: 'short',
      },
    ]);
    renderReady({ onUpsertRun, onLoadRecipeMaterials: onLoad });

    fireEvent.click(screen.getByTestId('edit-pilot-plan-button'));
    const form = screen.getByTestId('pilot-run-form');
    const lineField = within(form).getByTestId('pilot-line-field');
    // Open the Line dropdown and pick LINE3.
    fireEvent.click(within(lineField).getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'LINE3 — Cooking' }));

    await waitFor(() => expect(onLoad).toHaveBeenCalledWith({ lineCode: 'LINE3' }));
    // Table re-rendered with the recomputed availability for the new line.
    await waitFor(() => {
      const reserved = screen.getAllByTestId('pilot-material-reserved');
      expect(reserved[0]).toHaveTextContent('12 kg');
    });
  });

  it('hides the edit-plan button when the caller cannot write', () => {
    render(<PilotScreen state="ready" data={{ ...DATA, canWrite: false }} labels={LABELS} />);
    expect(screen.queryByTestId('edit-pilot-plan-button')).toBeNull();
  });
});
