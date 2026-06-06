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
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  PilotScreen,
  type PilotLabels,
  type PilotScreenData,
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
};

const DATA: PilotScreenData = {
  run: {
    id: 'run-1',
    projectId: 'project-1',
    plannedDate: '2025-12-20',
    line: 'Line 2 — Slicing/MAP',
    batchSizeKg: '500.0000',
    expectedYieldPct: '78.00',
    durationHours: '6.00',
    supervisorName: 'M. Johnson',
    status: 'planned',
  },
  materials: [
    {
      id: 'm1',
      ingredientCode: 'Pork Ham, trimmed',
      requiredKg: '410.0000',
      availableKg: '850.0000',
      reservedKg: '410.0000',
      status: 'reserved',
      shortByKg: null,
    },
    {
      id: 'm2',
      ingredientCode: 'Spice Mix (Ham blend)',
      requiredKg: '4.5000',
      availableKg: '3.2000',
      reservedKg: '3.2000',
      status: 'short',
      shortByKg: '1.3000',
    },
  ],
  checklist: [
    { id: 'c1', label: 'Recipe approved (v0.3)', isChecked: true, displayOrder: 1 },
    { id: 'c2', label: 'Materials reserved', isChecked: false, displayOrder: 2 },
  ],
  totalShortKg: '1.3000',
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
    expect(body).toContain('Line 2 — Slicing/MAP');
    expect(body).toContain('500 kg');
    expect(body).toContain('M. Johnson');
  });

  it('renders the 4-field Pilot run plan (line / batch / yield / duration)', () => {
    renderReady();
    const card = screen.getByTestId('pilot-plan-card');
    expect(within(card).getByText(LABELS.colLine)).toBeInTheDocument();
    expect(within(card).getByText('Line 2 — Slicing/MAP')).toBeInTheDocument();
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
