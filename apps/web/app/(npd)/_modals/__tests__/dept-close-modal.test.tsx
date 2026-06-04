/**
 * @vitest-environment jsdom
 *
 * T-022 — Dept Close modal RED tests.
 *
 * Prototype source (literal anchor, verified with `wc -l`):
 *   prototypes/design/Monopilot Design System/npd/modals.jsx:143-191 (DeptCloseModal)
 *
 * Parity checklist (structural + visual + interaction):
 *   - dept-scoped title ("Close <Dept> section") + FA subtitle (code · product name)
 *   - required-field checklist: one row per field, label + pass/fail icon (✓ green / ✗ red)
 *   - all-pass success banner / cannot-close warning banner
 *   - optional closing-note Textarea (shadcn Textarea slot, RHF-bound)
 *   - Cancel + Confirm close footer buttons; Confirm disabled until allPass
 *
 * RED scope: tests assert the behavior + i18n + a11y contract before/against impl.
 */
import React from 'react';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RequiredFieldsForDept } from '../../fa/actions/get-required-fields-for-dept';

// ── i18n stub (mirrors the repo convention: mock next-intl useTranslations) ──
const deptCloseLabels: Record<string, string> = {
  titleClose: 'Close {dept} section',
  subtitle: 'FA {faCode} · {productName}',
  requiredCheckHeader: 'V05 · Required field check',
  fieldPass: '{name} — filled',
  fieldFail: '{name} — missing',
  allPassBanner: 'All required fields filled — safe to close.',
  cannotCloseBanner: 'Cannot close: fill all required fields before closing this section.',
  noteLabel: 'Closing note (optional)',
  notePlaceholder: 'Add a comment for the audit trail…',
  cancel: 'Cancel',
  confirm: 'Confirm close',
  loading: 'Checking required fields…',
  empty: 'No required fields configured for this department.',
  error: 'Unable to load the required-field checklist. Try again.',
  forbidden: 'You do not have permission to close this department.',
  submitting: 'Closing…',
  noteTooShort: 'The closing note must be at least 10 characters.',
};

function tDeptClose(key: string, values?: Record<string, string | number>) {
  return (deptCloseLabels[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) =>
    String(values?.[name] ?? `{${name}}`),
  );
}

vi.mock('next-intl', () => ({
  useTranslations: () => tDeptClose,
}));

// Mock the @monopilot/ui Modal so the test renders dialog content directly.
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
      <div role="dialog" aria-modal="true" aria-labelledby="dept-close-title" data-modal-id={modalId}>
        {children}
      </div>
    );
  }
  Modal.Header = ({ title }: { title: string }) => <h2 id="dept-close-title">{title}</h2>;
  Modal.Body = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  Modal.Footer = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;

  return { default: Modal };
});

// Lazy import after mocks so the component picks them up.
async function loadModal() {
  const mod = await import('../dept-close-modal');
  return mod.DeptCloseModal;
}

const sampleFa = { faCode: 'FA7421', productName: 'Smoked Almond Yoghurt' };

function ready(dept = 'Core'): RequiredFieldsForDept {
  return {
    dept: dept as RequiredFieldsForDept['dept'],
    fields: [
      { key: 'product_name', name: 'Product Name', ok: true },
      { key: 'pack_size', name: 'Pack Size', ok: true },
    ],
    allPass: true,
  };
}

function notReady(dept = 'Core'): RequiredFieldsForDept {
  return {
    dept: dept as RequiredFieldsForDept['dept'],
    fields: [
      { key: 'product_name', name: 'Product Name', ok: true },
      { key: 'pack_size', name: 'Pack Size', ok: false },
    ],
    allPass: false,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DeptCloseModal — T-022 (prototype modals.jsx:143-191)', () => {
  it('parity: renders dept title, FA subtitle, required check header, per-field rows with pass/fail icons, and shadcn Textarea', async () => {
    const DeptCloseModal = await loadModal();
    render(
      <DeptCloseModal
        open
        dept="Core"
        fa={sampleFa}
        requiredFields={notReady('Core')}
        status="ready"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog');
    // dept-scoped title + FA subtitle
    expect(within(dialog).getByText('Close Core section')).toBeInTheDocument();
    expect(within(dialog).getByText('FA FA7421 · Smoked Almond Yoghurt')).toBeInTheDocument();
    // required check header
    expect(within(dialog).getByText('V05 · Required field check')).toBeInTheDocument();
    // per-field rows: label present; pass row + fail row
    expect(within(dialog).getByText(/Product Name/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Pack Size/)).toBeInTheDocument();
    // status icons carry accessible text (color not the sole signal)
    expect(within(dialog).getByText('Pack Size — missing')).toBeInTheDocument();
    expect(within(dialog).getByText('Product Name — filled')).toBeInTheDocument();
    // optional closing-note Textarea via shadcn slot
    expect(dialog.querySelector('[data-slot="textarea"]')).not.toBeNull();
    expect(within(dialog).getByText('Closing note (optional)')).toBeInTheDocument();
  });

  it('disabled state: a missing required field disables Confirm and shows the cannot-close warning', async () => {
    const DeptCloseModal = await loadModal();
    render(
      <DeptCloseModal
        open
        dept="Core"
        fa={sampleFa}
        requiredFields={notReady('Core')}
        status="ready"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    const confirm = screen.getByRole('button', { name: /Confirm close/i });
    expect(confirm).toBeDisabled();
    expect(screen.getByText(/Cannot close/)).toBeInTheDocument();
  });

  it('action invocation: allPass + reason >= 10 chars → onConfirm(closeDeptSection caller) is called', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const DeptCloseModal = await loadModal();
    render(
      <DeptCloseModal
        open
        dept="Core"
        fa={sampleFa}
        requiredFields={ready('Core')}
        status="ready"
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    );

    const confirm = screen.getByRole('button', { name: /Confirm close/i });
    expect(confirm).toBeEnabled();

    const textarea = screen.getByRole('textbox', { name: /Closing note/i });
    await userEvent.type(textarea, 'Looks complete and verified.');
    await userEvent.click(confirm);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith({ dept: 'Core', note: 'Looks complete and verified.' });
  });

  it('reason validation: when a note is entered but < 10 chars, Confirm is blocked and a validation message shows', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const DeptCloseModal = await loadModal();
    render(
      <DeptCloseModal
        open
        dept="Core"
        fa={sampleFa}
        requiredFields={ready('Core')}
        status="ready"
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    const textarea = screen.getByRole('textbox', { name: /Closing note/i });
    await userEvent.type(textarea, 'short');
    await userEvent.click(screen.getByRole('button', { name: /Confirm close/i }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(await screen.findByText(/at least 10 characters/i)).toBeInTheDocument();
  });

  it('loading state: shows a checking message while the readiness probe resolves', async () => {
    const DeptCloseModal = await loadModal();
    render(
      <DeptCloseModal
        open
        dept="Planning"
        fa={sampleFa}
        requiredFields={null}
        status="loading"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText('Checking required fields…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Confirm close/i })).toBeDisabled();
  });

  it('error state: shows an error alert and disables Confirm', async () => {
    const DeptCloseModal = await loadModal();
    render(
      <DeptCloseModal
        open
        dept="Planning"
        fa={sampleFa}
        requiredFields={null}
        status="error"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/Unable to load/i);
    expect(screen.getByRole('button', { name: /Confirm close/i })).toBeDisabled();
  });

  it('permission-denied state: shows forbidden copy and no Confirm action', async () => {
    const DeptCloseModal = await loadModal();
    render(
      <DeptCloseModal
        open
        dept="Planning"
        fa={sampleFa}
        requiredFields={null}
        status="forbidden"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText(/do not have permission/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Confirm close/i })).not.toBeInTheDocument();
  });

  it('empty state: dept has no required columns configured', async () => {
    const DeptCloseModal = await loadModal();
    render(
      <DeptCloseModal
        open
        dept="Technical"
        fa={sampleFa}
        requiredFields={{ dept: 'Technical', fields: [], allPass: false }}
        status="ready"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText(/No required fields configured/i)).toBeInTheDocument();
  });

  it('a11y/i18n: dialog is labelled and Cancel closes via onClose', async () => {
    const onClose = vi.fn();
    const DeptCloseModal = await loadModal();
    render(
      <DeptCloseModal
        open
        dept="Core"
        fa={sampleFa}
        requiredFields={ready('Core')}
        status="ready"
        onClose={onClose}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-labelledby', 'dept-close-title');
    await userEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

/**
 * Parity evidence capture (RTL/DOM-snapshot fallback).
 *
 * Playwright + @axe-core/playwright are not runnable for T-022: the modal is a
 * controlled island whose readiness + closeDeptSection caller are injected by a
 * parent server boundary that is OUT OF SCOPE here (no NPD route mounts it yet),
 * and @axe-core/playwright is not installed in this workspace. Per the task's
 * evidence AC ("if Playwright is unavailable, document the blocker and provide
 * RTL/snapshot fallback evidence") this suite renders every required UI state
 * and writes the DOM to apps/web/e2e/parity-evidence/T-022/ for a reviewer to
 * diff structure vs prototype modals.jsx:143-191.
 */
describe('DeptCloseModal — parity evidence (DOM snapshot per state)', () => {
  it('captures DOM for ready/missing/loading/empty/error/permission-denied states', async () => {
    // vitest cwd is apps/web; resolve the canonical evidence dir from there.
    const outDir = resolve(process.cwd(), 'e2e/parity-evidence/T-022');
    mkdirSync(outDir, { recursive: true });
    const DeptCloseModal = await loadModal();

    const states: Array<{ name: string; props: Record<string, unknown> }> = [
      { name: 'ready-allpass', props: { dept: 'Core', requiredFields: ready('Core'), status: 'ready' } },
      { name: 'ready-missing-disabled', props: { dept: 'Core', requiredFields: notReady('Core'), status: 'ready' } },
      { name: 'loading', props: { dept: 'Planning', requiredFields: null, status: 'loading' } },
      {
        name: 'empty',
        props: { dept: 'Technical', requiredFields: { dept: 'Technical', fields: [], allPass: false }, status: 'ready' },
      },
      { name: 'error', props: { dept: 'Planning', requiredFields: null, status: 'error' } },
      { name: 'permission-denied', props: { dept: 'Planning', requiredFields: null, status: 'forbidden' } },
    ];

    const manifest = [
      '# T-022 Dept Close modal — parity evidence (RTL DOM snapshots)',
      '',
      'Prototype anchor: prototypes/design/Monopilot Design System/npd/modals.jsx:143-191',
      'Blocker: Playwright/axe deferred — modal not yet mounted in a route (parent wiring out of scope).',
      '',
    ];

    for (const state of states) {
      const { container, unmount } = render(
        <DeptCloseModal open fa={sampleFa} onClose={() => {}} onConfirm={async () => {}} {...(state.props as never)} />,
      );
      const html = container.innerHTML;
      const file = `T-022-${state.name}.html`;
      writeFileSync(resolve(outDir, file), `<!-- ${state.name} -->\n${html}\n`, 'utf-8');
      manifest.push(`- ${state.name}: ${file} (${html.length} bytes)`);
      expect(html.length).toBeGreaterThan(0);
      unmount();
    }

    writeFileSync(resolve(outDir, 'README.md'), manifest.join('\n') + '\n', 'utf-8');
  });
});
