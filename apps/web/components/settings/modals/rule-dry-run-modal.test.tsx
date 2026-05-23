/**
 * T-047 / SM-01 — RuleDryRunModal RED tests.
 * Source of truth: prototypes/design/Monopilot Design System/settings/modals.jsx:18-69
 * RED scope: tests only; production component is intentionally not implemented here.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assertModalA11y } from '../../../../../packages/ui/test/assertModalA11y';

type RuleDryRunStatus = 'pass' | 'fail';

type RuleDryRunResult = {
  status: RuleDryRunStatus;
  warnings: string[];
  trace: string[];
  evaluatedAt: string;
};

type RuleDryRunModalProps = {
  defaultOpen?: boolean;
  rule?: {
    code: string;
    name?: string;
    description?: string;
  };
  initialSampleInput?: Record<string, unknown>;
  runDryRun: (input: {
    ruleCode: string;
    sampleInput: Record<string, unknown>;
  }) => Promise<RuleDryRunResult>;
  onOpenChange?: (open: boolean) => void;
};

const sampleRule = {
  code: 'wo_release_guard',
  name: 'WO release guard',
  description: 'Requires reservation and crew checks before release.',
};

const sampleInput = {
  wo_id: 'WO-2026-00412',
  from: 'PLANNED',
  to: 'RELEASED',
};

const passingResult: RuleDryRunResult = {
  status: 'pass',
  warnings: ['crew_assigned uses fallback shift calendar'],
  trace: [
    'guard: reservation_green → ✓',
    'guard: crew_assigned → ✓',
    'transition: PLANNED → RELEASED applied',
  ],
  evaluatedAt: '2026-05-23T12:34:00.000Z',
};

async function loadRuleDryRunModal() {
  const target = './rule-dry-run-modal';
  const module = await import(/* @vite-ignore */ target).catch(() => null);

  expect(
    module,
    'apps/web/components/settings/modals/rule-dry-run-modal.tsx should exist and export SM-01 RuleDryRunModal',
  ).not.toBeNull();

  const component = module?.RuleDryRunModal ?? module?.default;
  expect(component, 'RuleDryRunModal must be exported as a renderable React component').toEqual(
    expect.any(Function),
  );

  return component as React.ComponentType<RuleDryRunModalProps>;
}

async function renderRuleDryRunModal(overrides: Partial<RuleDryRunModalProps> = {}) {
  const RuleDryRunModal = await loadRuleDryRunModal();
  const props: RuleDryRunModalProps = {
    defaultOpen: true,
    rule: sampleRule,
    initialSampleInput: sampleInput,
    runDryRun: vi.fn().mockResolvedValue(passingResult),
    onOpenChange: vi.fn(),
    ...overrides,
  };

  const rtl = render(<RuleDryRunModal {...props} />);
  return { ...rtl, props };
}

function getDialog() {
  return screen.getByRole('dialog', { name: /dry-run — wo_release_guard/i });
}

function visibleFooterButtonNames(dialog: HTMLElement) {
  return within(dialog)
    .getAllByRole('button')
    .filter((button) => button.textContent?.trim() || button.getAttribute('aria-label') !== 'Close')
    .map((button) => button.textContent?.trim() || button.getAttribute('aria-label') || '');
}

function getFooterButton(dialog: HTMLElement, name: RegExp) {
  const match = within(dialog)
    .getAllByRole('button', { name })
    .find((button) => button.textContent?.trim().match(name));

  expect(match, `Expected footer button matching ${name}`).toBeTruthy();
  return match as HTMLButtonElement;
}

function parseResultJson(dialog: HTMLElement) {
  const result = within(dialog).getByTestId('rule-dry-run-result-json');
  return JSON.parse(result.textContent || '{}') as RuleDryRunResult;
}

describe('SM-01 RuleDryRunModal prototype parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches the Pattern-10 two-column structure, shadcn primitives, footer order, focus order, RTL snapshot, and a11y contract', async () => {
    const user = userEvent.setup();
    const { container } = await renderRuleDryRunModal();

    const dialog = getDialog();
    const scoped = within(dialog);
    const sampleInputField = scoped.getByRole('textbox', { name: /sample input \(json\)/i });
    const resultRegion = scoped.getByRole('region', { name: /^result$/i });
    const closeButton = getFooterButton(dialog, /^close$/i);
    const runButton = scoped.getByRole('button', { name: /^run dry-run$/i });

    expect(dialog.closest('[data-testid="rule-dry-run-modal"]')).toBeTruthy();
    expect(dialog).toHaveAttribute('data-modal-id', 'SM-01');
    expect(scoped.getByText(/preview the rule evaluation against sample input without persisting/i)).toBeInTheDocument();
    expect(sampleInputField.closest('[data-slot="textarea"]')).toBeTruthy();
    expect(sampleInputField).toHaveClass(/font-mono|mono/);
    expect(resultRegion).toHaveTextContent(/run the rule to see the result/i);
    expect(closeButton.closest('[data-slot="button"]')).toBeTruthy();
    expect(runButton.closest('[data-slot="button"]')).toBeTruthy();
    expect(dialog.querySelectorAll('select,dialog').length).toBe(0);

    expect({
      testId: dialog.closest('[data-testid="rule-dry-run-modal"]')?.getAttribute('data-testid'),
      modalId: dialog.getAttribute('data-modal-id'),
      title: scoped.getByRole('heading', { name: /dry-run — wo_release_guard/i }).textContent,
      fieldLabels: ['Sample input (JSON)', 'Result'],
      fieldRoles: ['textbox[textarea]', 'region'],
      layout: dialog.querySelector('[data-testid="rule-dry-run-grid"]')?.getAttribute('data-layout'),
      footerButtons: visibleFooterButtonNames(dialog),
      runDisabledUntilJsonValidOrIdle: runButton.hasAttribute('disabled'),
      emptyResultCopy: resultRegion.textContent?.trim(),
    }).toMatchInlineSnapshot(`
      {
        "emptyResultCopy": "Run the rule to see the result.",
        "fieldLabels": [
          "Sample input (JSON)",
          "Result",
        ],
        "fieldRoles": [
          "textbox[textarea]",
          "region",
        ],
        "footerButtons": [
          "Close",
          "Run dry-run",
        ],
        "layout": "two-column",
        "modalId": "SM-01",
        "runDisabledUntilJsonValidOrIdle": false,
        "testId": "rule-dry-run-modal",
        "title": "Dry-run — wo_release_guard",
      }
    `);

    expect(sampleInputField).toHaveFocus();
    await user.tab();
    expect(closeButton).toHaveFocus();
    await user.tab();
    expect(runButton).toHaveFocus();

    await assertModalA11y(container);
  });

  it('disables Run dry-run for invalid JSON and renders a loud validation error without calling the action', async () => {
    const user = userEvent.setup();
    const runDryRun = vi.fn().mockResolvedValue(passingResult);
    await renderRuleDryRunModal({ runDryRun });

    const dialog = getDialog();
    const scoped = within(dialog);
    const sampleInputField = scoped.getByRole('textbox', { name: /sample input \(json\)/i });
    const runButton = scoped.getByRole('button', { name: /^run dry-run$/i });

    await user.clear(sampleInputField);
    await user.type(sampleInputField, '{{"wo_id":');

    expect(sampleInputField).toHaveAttribute('aria-invalid', 'true');
    expect(scoped.getByRole('alert')).toHaveTextContent('Invalid JSON');
    expect(runButton).toBeDisabled();

    await user.click(runButton);
    expect(runDryRun).not.toHaveBeenCalled();
  });

  it('runs the dry-run action with parsed sample input and shows pass/fail/warnings JSON within 5 seconds', async () => {
    const user = userEvent.setup();
    const runDryRun = vi.fn().mockResolvedValue(passingResult);
    await renderRuleDryRunModal({ runDryRun });

    const dialog = getDialog();
    const scoped = within(dialog);
    const runButton = scoped.getByRole('button', { name: /^run dry-run$/i });

    await user.click(runButton);

    expect(runButton).toBeDisabled();
    expect(scoped.getByRole('status', { name: /evaluating rule dry-run/i })).toHaveTextContent(/evaluating/i);
    await waitFor(
      () =>
        expect(runDryRun).toHaveBeenCalledWith({
          ruleCode: 'wo_release_guard',
          sampleInput,
        }),
      { timeout: 5000 },
    );

    await waitFor(
      () => expect(scoped.getByTestId('rule-dry-run-result-json')).toBeInTheDocument(),
      { timeout: 5000 },
    );

    const resultJson = parseResultJson(dialog);
    expect(resultJson).toEqual(passingResult);
    expect(scoped.getByText('PASS')).toHaveClass(/badge|green|success/i);
    expect(scoped.getByTestId('rule-dry-run-result-json')).toHaveTextContent('warnings');
  });

  it('opens from the SM-01 trigger when closed and reports async failure in the Result panel', async () => {
    const user = userEvent.setup();
    const runDryRun = vi.fn().mockResolvedValue({
      ...passingResult,
      status: 'fail' as const,
      warnings: ['reservation is not green'],
      trace: ['guard: reservation_green → ✗'],
    });
    await renderRuleDryRunModal({ defaultOpen: false, runDryRun });

    const trigger = screen.getByRole('button', { name: /dry-run/i });
    expect(trigger).toHaveAttribute('aria-controls', 'SM-01');

    await user.click(trigger);
    const dialog = getDialog();
    await user.click(within(dialog).getByRole('button', { name: /^run dry-run$/i }));

    await waitFor(
      () => expect(within(dialog).getByTestId('rule-dry-run-result-json')).toHaveTextContent('reservation is not green'),
      { timeout: 5000 },
    );
    expect(within(dialog).getByText('FAIL')).toHaveClass(/badge|red|destructive/i);
  });
});
