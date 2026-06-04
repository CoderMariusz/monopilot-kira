/**
 * @vitest-environment jsdom
 *
 * T-035 — BriefCompleteModal RTL tests (RED-first).
 *
 * Prototype compatibility source (literal anchor, `wc -l` = 766):
 *   prototypes/design/Monopilot Design System/npd/modals.jsx:89-140 (BriefConvertModal)
 *
 * 2026-05-03 E2E spine patch (asserted as red-lines):
 *   - User-facing copy is "Complete brief for project" — NEVER "Convert to FA".
 *   - No FA/FG code availability blocker; Complete is NOT gated on any code (G3 owns FG mapping).
 *   - No D365 export/build CTA.
 *
 * Parity checklist (structural + visual + interaction):
 *   - read-only summary table (FA field → value from brief).
 *   - gate-checks status banner + amber locking warning (role=alert).
 *   - optional legacy-alias input (compatibility only, never a blocker).
 *   - Cancel + Complete footer buttons; Complete enabled when summary is ready (no code needed).
 *   - 5 states: loading, empty, error, forbidden, ready.
 *   - convertBriefToFa (completeBriefForProject) invoked with (briefId, legacyAlias|null) on submit.
 */
import React from 'react';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BriefCompleteModal,
  type BriefCompleteLabels,
  type BriefCompleteSummary,
} from '../brief-complete-modal';

vi.mock('@monopilot/ui/Modal', async () => {
  const ReactModule = await import('react');
  function Modal({
    children,
    open,
    onOpenChange,
    modalId,
  }: {
    children: React.ReactNode;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    modalId?: string;
  }) {
    ReactModule.useEffect(() => {
      if (!open) return undefined;
      const onEsc = (event: KeyboardEvent) => {
        if (event.key === 'Escape') onOpenChange(false);
      };
      document.addEventListener('keydown', onEsc);
      return () => document.removeEventListener('keydown', onEsc);
    }, [onOpenChange, open]);
    if (!open) return null;
    return (
      <div role="dialog" aria-modal="true" aria-labelledby="brief-complete-title" data-modal-id={modalId}>
        {children}
      </div>
    );
  }
  Modal.Header = ({ title }: { title: string }) => <h2 id="brief-complete-title">{title}</h2>;
  Modal.Body = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  Modal.Footer = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  return { default: Modal };
});

const labels: BriefCompleteLabels = {
  title: 'Complete brief for project',
  subtitle: 'Gate checks pass — the brief is complete and required fields are filled.',
  gateChecksTitle: 'Gate checks',
  gateCheckStatus: 'Brief status = complete',
  gateCheckRequired: 'All required fields filled',
  gateCheckDevCode: 'Dev code format valid (V08)',
  summaryHeader: 'Brief evidence carried to the project',
  colField: 'Field',
  colValue: 'Value from brief',
  legacyAliasLabel: 'Legacy alias (optional)',
  legacyAliasHint: 'Compatibility only — not an approved FG. FG mapping happens at G3.',
  errorLegacyAlias: 'Legacy alias is too long (max 80).',
  lockingWarning: 'The brief will be set to Converted and locked. Project evidence remains editable.',
  emptyValue: '—',
  cancel: 'Cancel',
  complete: 'Complete brief for project',
  completing: 'Completing…',
  loading: 'Loading brief summary…',
  empty: 'No summary available for this brief.',
  error: 'Unable to load the brief summary. Try again.',
  forbidden: 'You do not have permission to complete this brief.',
  errorGeneric: 'Could not complete the brief. Try again.',
};

function summary(): BriefCompleteSummary {
  return {
    briefId: 'br-123',
    devCode: 'DEV26-050',
    productName: 'Duck Rillettes 120g',
    rows: [
      { key: 'product_name', field: 'Product Name', value: 'Duck Rillettes 120g' },
      { key: 'volume', field: 'Volume', value: '1,200' },
      { key: 'dev_code', field: 'Dev Code', value: 'DEV26-050' },
      { key: 'rm_code', field: 'RM Code', value: null },
    ],
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('BriefCompleteModal — T-035 (prototype modals.jsx:89-140, patched)', () => {
  it('parity + red-line: renders read-only summary table, locking warning, Complete copy; never "Convert to FA" or D365', () => {
    render(
      <BriefCompleteModal
        open
        status="ready"
        summary={summary()}
        labels={labels}
        completeBriefAction={vi.fn()}
        onCompleted={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Complete brief for project' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Complete brief for project' })).toBeInTheDocument();

    const table = within(dialog).getByTestId('brief-complete-summary');
    expect(within(table).getByText('Product Name')).toBeInTheDocument();
    expect(within(table).getByText('Duck Rillettes 120g')).toBeInTheDocument();
    expect(within(table).getByText('RM Code')).toBeInTheDocument(); // empty value → em dash

    // amber locking warning (role=alert)
    const warning = within(dialog).getByTestId('brief-complete-locking-warning');
    expect(warning).toHaveAttribute('role', 'alert');

    // red-lines
    expect(within(dialog).queryByText(/Convert to FA/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/D365/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/Convert →/)).not.toBeInTheDocument();
  });

  it('interaction: Complete is NOT gated on a code — enabled with empty legacy alias; calls action with (briefId, null)', async () => {
    const user = userEvent.setup();
    const complete = vi.fn().mockResolvedValue({
      ok: true as const,
      briefId: 'br-123',
      npdProjectId: 'p-1',
      legacyProductCode: null,
      v08Status: 'PASS' as const,
    });
    const onCompleted = vi.fn();

    render(
      <BriefCompleteModal
        open
        status="ready"
        summary={summary()}
        labels={labels}
        completeBriefAction={complete}
        onCompleted={onCompleted}
        onClose={vi.fn()}
      />,
    );

    const completeBtn = screen.getByRole('button', { name: 'Complete brief for project' });
    // no code entered → still enabled (FG code is not a blocker here)
    expect(completeBtn).toBeEnabled();

    await user.click(completeBtn);
    expect(complete).toHaveBeenCalledWith('br-123', null);
    expect(onCompleted).toHaveBeenCalledWith({ briefId: 'br-123', npdProjectId: 'p-1' });
  });

  it('states: renders loading / empty / error / forbidden distinctly', () => {
    const base = {
      summary: null,
      labels,
      onCompleted: vi.fn(),
      onClose: vi.fn(),
    } as const;

    const { rerender } = render(<BriefCompleteModal open status="loading" {...base} />);
    expect(screen.getByText('Loading brief summary…')).toBeInTheDocument();

    rerender(<BriefCompleteModal open status="empty" {...base} />);
    expect(screen.getByText('No summary available for this brief.')).toBeInTheDocument();

    rerender(<BriefCompleteModal open status="error" {...base} />);
    expect(screen.getByText('Unable to load the brief summary. Try again.')).toBeInTheDocument();

    rerender(<BriefCompleteModal open status="forbidden" {...base} />);
    expect(screen.getByText('You do not have permission to complete this brief.')).toBeInTheDocument();
    // forbidden state hides the Complete CTA
    expect(screen.queryByRole('button', { name: 'Complete brief for project' })).not.toBeInTheDocument();
  });

  it('parity evidence: writes a DOM snapshot artifact', () => {
    const { container } = render(
      <BriefCompleteModal
        open
        status="ready"
        summary={summary()}
        labels={labels}
        completeBriefAction={vi.fn()}
        onCompleted={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const dir = resolve(process.cwd(), 'e2e/parity-evidence/T-035');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'brief-complete-modal.dom.html'), container.innerHTML, 'utf8');
    expect(container.querySelector('[data-modal-id="briefComplete"]')).not.toBeNull();
  });
});
