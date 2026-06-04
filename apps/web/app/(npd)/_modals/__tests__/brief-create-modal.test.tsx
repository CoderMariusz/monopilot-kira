/**
 * @vitest-environment jsdom
 *
 * T-035 — BriefCreateModal RTL tests (RED-first).
 *
 * Prototype source (literal anchor, verified with `wc -l` = 766 lines):
 *   prototypes/design/Monopilot Design System/npd/modals.jsx:46-86 (BriefCreateModal)
 *
 * Parity checklist (structural + visual + interaction):
 *   - Title "New brief" + subtitle stating it creates a linked NPD project at G0 (2026-05-03 patch).
 *   - Template radiogroup with TWO cards (single / multi component) — keyboard + click selectable.
 *   - Dev Code Input with V08 format validation (mirrors createBrief schema).
 *   - Cancel + Create footer buttons; Create disabled until the form is valid.
 *   - Info note about the linked project (patched copy — no "Convert to FA", no D365).
 *   - createBrief Server Action invoked with (template, devCode) on submit.
 *   - i18n: every visible string comes from labels (no inline copy).
 *   - a11y: role=dialog, role=radiogroup/radio, labeled fields, role=alert on errors.
 */
import React from 'react';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BriefCreateModal, type BriefCreateLabels } from '../brief-create-modal';

// Mock @monopilot/ui/Modal so dialog content renders directly into the container.
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
      <div role="dialog" aria-modal="true" aria-labelledby="brief-create-title" data-modal-id={modalId}>
        {children}
      </div>
    );
  }
  Modal.Header = ({ title }: { title: string }) => <h2 id="brief-create-title">{title}</h2>;
  Modal.Body = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  Modal.Footer = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  return { default: Modal };
});

const labels: BriefCreateLabels = {
  title: 'New brief',
  subtitle: 'Creates a Brief and a linked NPD project at G0.',
  templateLabel: 'Template',
  templateSingle: 'Single component',
  templateSingleHint: 'One Finish Meat / one component',
  templateMulti: 'Multi component',
  templateMultiHint: 'Platters, mixed packs (2+ components)',
  fieldDevCode: 'Dev Code',
  fieldDevCodeHint: 'V08 · Format DEV<YY><MM>-<seq>',
  projectNote: 'A Brief creates a linked NPD project at G0. FG mapping happens later at G3.',
  cancel: 'Cancel',
  create: 'Create brief',
  creating: 'Creating…',
  errorDevCode: 'Invalid Dev Code format (e.g. DEV26-052).',
  errorGeneric: 'Could not create the brief. Try again.',
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('BriefCreateModal — T-035 (prototype modals.jsx:46-86)', () => {
  it('parity: renders title, patched project subtitle, template radiogroup (2 cards), Dev Code input, and footer buttons', () => {
    render(<BriefCreateModal open labels={labels} createBriefAction={vi.fn()} onCreated={vi.fn()} onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('New brief')).toBeInTheDocument();
    // patched copy: subtitle + info note both explain the linked NPD project at G0
    expect(within(dialog).getByText('Creates a Brief and a linked NPD project at G0.')).toBeInTheDocument();
    expect(within(dialog).getByTestId('brief-create-project-note')).toHaveTextContent(/linked NPD project at G0/);

    const radiogroup = within(dialog).getByRole('radiogroup', { name: 'Template' });
    const radios = within(radiogroup).getAllByRole('radio');
    expect(radios).toHaveLength(2);
    expect(within(radiogroup).getByText('Single component')).toBeInTheDocument();
    expect(within(radiogroup).getByText('Multi component')).toBeInTheDocument();

    expect(within(dialog).getByLabelText(/Dev Code/)).toBeInTheDocument();
    expect(within(dialog).getByText('Cancel')).toBeInTheDocument();
    expect(within(dialog).getByText('Create brief')).toBeInTheDocument();

    // patched red-line: never "Convert to FA" / D365 in the create modal
    expect(within(dialog).queryByText(/Convert to FA/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/D365/i)).not.toBeInTheDocument();
  });

  it('interaction: Create stays disabled until a valid Dev Code is entered, then calls createBrief with (template, devCode)', async () => {
    const user = userEvent.setup();
    const createBrief = vi.fn().mockResolvedValue({
      ok: true as const,
      briefId: 'b-1',
      npdProjectId: 'p-1',
      devCode: 'DEV26-052',
    });
    const onCreated = vi.fn();

    render(
      <BriefCreateModal open labels={labels} createBriefAction={createBrief} onCreated={onCreated} onClose={vi.fn()} />,
    );

    const createBtn = screen.getByRole('button', { name: 'Create brief' });
    expect(createBtn).toBeDisabled();

    // select multi-component template via click
    await user.click(screen.getByRole('radio', { name: /Multi component/ }));

    // invalid then valid dev code
    const devInput = screen.getByLabelText(/Dev Code/);
    await user.type(devInput, 'bad');
    expect(await screen.findByText('Invalid Dev Code format (e.g. DEV26-052).')).toBeInTheDocument();
    expect(createBtn).toBeDisabled();

    await user.clear(devInput);
    await user.type(devInput, 'DEV26-052');
    expect(createBtn).toBeEnabled();

    await user.click(createBtn);
    expect(createBrief).toHaveBeenCalledWith('multi_component', 'DEV26-052');
    expect(onCreated).toHaveBeenCalledWith({ briefId: 'b-1', npdProjectId: 'p-1' });
  });

  it('error state: surfaces a generic error (role=alert) when the action rejects', async () => {
    const user = userEvent.setup();
    const createBrief = vi.fn().mockRejectedValue(new Error('boom'));
    render(
      <BriefCreateModal open labels={labels} createBriefAction={createBrief} onCreated={vi.fn()} onClose={vi.fn()} />,
    );

    await user.type(screen.getByLabelText(/Dev Code/), 'DEV26-052');
    await user.click(screen.getByRole('button', { name: 'Create brief' }));

    const alert = await screen.findByText('Could not create the brief. Try again.');
    expect(alert).toBeInTheDocument();
    expect(alert.closest('[role="alert"]')).not.toBeNull();
  });

  it('parity evidence: writes a DOM snapshot artifact', () => {
    const { container } = render(
      <BriefCreateModal open labels={labels} createBriefAction={vi.fn()} onCreated={vi.fn()} onClose={vi.fn()} />,
    );
    const dir = resolve(process.cwd(), 'e2e/parity-evidence/T-035');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'brief-create-modal.dom.html'), container.innerHTML, 'utf8');
    expect(container.querySelector('[data-modal-id="briefCreate"]')).not.toBeNull();
  });
});
