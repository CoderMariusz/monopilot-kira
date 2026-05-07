/**
 * T-031 — RED phase tests for the 10 MODAL-SCHEMA pattern templates (P1..P10).
 *
 * Strategy:
 *   1. Each pattern story file (packages/ui/.storybook/patterns/P{1..10}-*.stories.tsx)
 *      is imported. These imports MUST fail at module-resolution time because
 *      the story files do not exist yet — that is the RED state.
 *   2. AC1 (P1 Wizard) and AC2 (P10 Preview-compare) tests render the story's
 *      Default export render() function and assert structural / interactional
 *      contracts derived from prototypes/design/Monopilot Design System/settings/modals.jsx.
 *   3. AC3 loops over all 10 patterns and invokes assertModalA11y(container).
 *
 * Prototype refs:
 *   - P1  Wizard:          modals.jsx:141-259 (email_template_edit_modal — 8-step per T-031.json)
 *   - P5/P9 Reason:        modals.jsx:72-108  (flag_edit_modal)
 *   - P10 Preview-compare: modals.jsx:18-69   (rule_dry_run_modal)
 *
 * MODAL-SCHEMA.md: present at _shared/MODAL-SCHEMA.md (§4 pattern catalog).
 *
 * RED expectation:
 *   `pnpm --filter @monopilot/ui test src/__tests__/patterns.test.tsx`
 *   → "Failed to resolve import '../../.storybook/patterns/P1-Wizard.stories'"
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { assertModalA11y } from '../../test/assertModalA11y';

// ──────────────────────────────────────────────────────────────────────────────
// Story imports — MUST fail until GREEN phase creates these files.
// ──────────────────────────────────────────────────────────────────────────────
import * as P1Wizard from '../../.storybook/patterns/P1-Wizard.stories';
import * as P2SimpleForm from '../../.storybook/patterns/P2-SimpleForm.stories';
import * as P3DualPath from '../../.storybook/patterns/P3-DualPath.stories';
import * as P4Picker from '../../.storybook/patterns/P4-Picker.stories';
import * as P5OverrideWithReason from '../../.storybook/patterns/P5-OverrideWithReason.stories';
import * as P6Simple from '../../.storybook/patterns/P6-Simple.stories';
import * as P7AsyncWithStates from '../../.storybook/patterns/P7-AsyncWithStates.stories';
import * as P8ConfirmDestructiveType from '../../.storybook/patterns/P8-ConfirmDestructiveType.stories';
import * as P9ConfirmDestructiveReason from '../../.storybook/patterns/P9-ConfirmDestructiveReason.stories';
import * as P10PreviewCompare from '../../.storybook/patterns/P10-PreviewCompare.stories';

/**
 * Helper — every story file must export a `Default` story (StoryObj) whose
 * `render()` returns the rendered pattern. This is the contract the GREEN-phase
 * implementer must satisfy.
 */
type StoryModule = { Default?: { render?: () => React.ReactElement } };

function renderStory(mod: StoryModule): React.ReactElement {
  if (!mod.Default || typeof mod.Default.render !== 'function') {
    throw new Error(
      'Story module must export a `Default` story object with a `render()` function.',
    );
  }
  return mod.Default.render();
}

// ──────────────────────────────────────────────────────────────────────────────
// AC1 — P1 Wizard parity vs modals.jsx:141-259 (email_template_edit_modal)
//   Structural: 8 step labels via Stepper; Stepper composes inside Modal;
//               body slot present; footer Back+Next+Cancel
//   Visual:     Radix Dialog + tokens (data-size attr, role=dialog)
//   Interactional: Back disabled at step 0; Next disabled when step has
//                  validation errors; ESC dismisses only when dismissible=true
// ──────────────────────────────────────────────────────────────────────────────
describe('AC1: P1 Wizard parity (modals.jsx:141-259, 8-step email_template_edit_modal)', () => {
  describe('Structural', () => {
    it('renders Stepper composed INSIDE a Modal (Radix Dialog wrapper)', () => {
      const { container } = render(renderStory(P1Wizard));

      const dialog = container.querySelector('[role="dialog"]');
      expect(dialog).not.toBeNull();
      expect(dialog).toHaveAttribute('aria-modal', 'true');

      const stepperRoot = container.querySelector('[data-testid="stepper-root"]');
      expect(stepperRoot).not.toBeNull();

      // Stepper must be a descendant of the dialog (composed inside, not replacing).
      expect(dialog!.contains(stepperRoot!)).toBe(true);
    });

    it('renders all 8 step labels in the Stepper nav (modals.jsx:141-259 wizard)', () => {
      const { container } = render(renderStory(P1Wizard));

      const tablist = container.querySelector('[role="tablist"]');
      expect(tablist).not.toBeNull();

      const tabs = container.querySelectorAll('[role="tab"]');
      expect(tabs.length).toBe(8);
    });

    it('renders the body slot via Stepper [data-testid="stepper-body"]', () => {
      const { container } = render(renderStory(P1Wizard));

      const body = container.querySelector('[data-testid="stepper-body"]');
      expect(body).not.toBeNull();
    });

    it('renders footer with Back + Next + Cancel actions', () => {
      const { container } = render(renderStory(P1Wizard));

      const footer = container.querySelector('[data-testid="stepper-footer"]');
      expect(footer).not.toBeNull();

      const backBtn = screen.queryByRole('button', { name: /back/i });
      const nextBtn = screen.queryByRole('button', { name: /next/i });
      const cancelBtn = screen.queryByRole('button', { name: /cancel/i });

      expect(backBtn).not.toBeNull();
      expect(nextBtn).not.toBeNull();
      expect(cancelBtn).not.toBeNull();
    });
  });

  describe('Visual (Radix Dialog + tokens)', () => {
    it('uses Radix Dialog (role=dialog), not native <dialog>', () => {
      const { container } = render(renderStory(P1Wizard));

      const radixDialog = container.querySelector('[role="dialog"]');
      expect(radixDialog).not.toBeNull();

      const nativeDialog = container.querySelector('dialog');
      expect(nativeDialog).toBeNull();
    });

    it('reads size from tokens.css (data-size attribute on dialog)', () => {
      const { container } = render(renderStory(P1Wizard));

      const dialog = container.querySelector('[role="dialog"]');
      expect(dialog).not.toBeNull();
      // Per MODAL-SCHEMA.md §5, wizard size = "wide". Implementer may map to
      // any of {sm,md,lg,xl} — the assertion is that data-size is set.
      expect(dialog).toHaveAttribute('data-size');
    });
  });

  describe('Interactional', () => {
    it('Back is aria-disabled="true" at step 0 AND clicking it does NOT advance the step', async () => {
      const user = userEvent.setup();
      const { container } = render(renderStory(P1Wizard));

      const backBtn = screen.getByRole('button', { name: /back/i });
      expect(backBtn).toHaveAttribute('aria-disabled', 'true');

      // Capture which tab is current before the click.
      const currentTabBefore = container.querySelector('[role="tab"][aria-current="step"]');
      expect(currentTabBefore).not.toBeNull();
      const labelBefore = currentTabBefore!.textContent;

      await user.click(backBtn);

      // Mutation guard: if the impl removes the `if (isBackDisabled) return`
      // guard, the current step would change. Assert it does NOT.
      const currentTabAfter = container.querySelector('[role="tab"][aria-current="step"]');
      expect(currentTabAfter).not.toBeNull();
      expect(currentTabAfter!.textContent).toBe(labelBefore);
    });

    it('Next is aria-disabled="true" when the current step has validation errors', () => {
      // The P1-Wizard story must support an initial state where step 0 has
      // validation errors (e.g. an empty required Field). Implementer guidance:
      // wire Stepper's `hasErrors` prop to the active step's RHF validity.
      const { container } = render(renderStory(P1Wizard));

      const nextBtn = screen.getByRole('button', { name: /next/i });
      // Mutation guard: if validation gating is removed, this attribute would
      // not be 'true' on initial render of an empty wizard.
      expect(nextBtn).toHaveAttribute('aria-disabled', 'true');
      void container;
    });

    it('ESC dismisses the modal only when dismissible=true (default story)', async () => {
      const { container } = render(renderStory(P1Wizard));

      const dialog = container.querySelector('[role="dialog"]');
      expect(dialog).not.toBeNull();

      const user = userEvent.setup();
      // Focus the dialog so Escape is dispatched there.
      (dialog as HTMLElement).focus();
      await user.keyboard('{Escape}');

      // Default P1 wizard story is dismissible — after ESC the dialog should
      // either be removed from the DOM OR Radix sets data-state="closed".
      await waitFor(() => {
        const stillOpen = document.querySelector('[role="dialog"][data-state="open"]');
        expect(stillOpen).toBeNull();
      });
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// AC2 — P10 Preview-compare parity vs modals.jsx:18-69 (rule_dry_run_modal)
//   Structural: left/right panels with Summary primitive on the right;
//               DryRunButton in footer
//   Visual:     tokens.css spacing (data-size on dialog)
//   Interactional: DryRunButton click triggers a mocked async with
//                  loading → result/error states
// ──────────────────────────────────────────────────────────────────────────────
describe('AC2: P10 Preview-compare parity (modals.jsx:18-69, rule_dry_run_modal)', () => {
  describe('Structural', () => {
    it('renders inside a Radix Dialog (Modal compound component)', () => {
      const { container } = render(renderStory(P10PreviewCompare));

      const dialog = container.querySelector('[role="dialog"]');
      expect(dialog).not.toBeNull();
      expect(dialog).toHaveAttribute('aria-modal', 'true');
    });

    it('renders left and right panels (data-testid="preview-left" + "preview-right")', () => {
      const { container } = render(renderStory(P10PreviewCompare));

      const left = container.querySelector('[data-testid="preview-left"]');
      const right = container.querySelector('[data-testid="preview-right"]');
      expect(left).not.toBeNull();
      expect(right).not.toBeNull();
    });

    it('renders the Summary primitive on the right panel (<dl> with data-summary-row children)', () => {
      const { container } = render(renderStory(P10PreviewCompare));

      const right = container.querySelector('[data-testid="preview-right"]');
      expect(right).not.toBeNull();

      // Summary primitive renders <dl> for non-empty rows.
      const summaryDl = right!.querySelector('dl');
      expect(summaryDl).not.toBeNull();
    });

    it('renders DryRunButton inside the modal footer', () => {
      const { container } = render(renderStory(P10PreviewCompare));

      const footer = container.querySelector('[data-testid="modal-footer"]');
      expect(footer).not.toBeNull();

      // DryRunButton from packages/ui sets data-variant="dry-run" on its <button>.
      const dryRunBtn = footer!.querySelector('button[data-variant="dry-run"]');
      expect(dryRunBtn).not.toBeNull();
    });
  });

  describe('Visual', () => {
    it('dialog has data-size attribute (tokens.css spacing)', () => {
      const { container } = render(renderStory(P10PreviewCompare));

      const dialog = container.querySelector('[role="dialog"]');
      expect(dialog).toHaveAttribute('data-size');
    });
  });

  describe('Interactional — DryRunButton mocked async (idle → loading → result/error)', () => {
    it('transitions: idle → loading → result on success', async () => {
      const user = userEvent.setup();
      const { container } = render(renderStory(P10PreviewCompare));

      // Idle state: result panel shows the idle placeholder.
      const idleEl = container.querySelector('[data-testid="dry-run-state-idle"]');
      expect(idleEl).not.toBeNull();

      const dryRunBtn = container.querySelector('button[data-variant="dry-run"]');
      expect(dryRunBtn).not.toBeNull();

      await user.click(dryRunBtn as Element);

      // Loading state must appear synchronously after the click. Mutation
      // guard: if the impl removes the loading state, this assertion fails.
      await waitFor(() => {
        const loadingEl = container.querySelector('[data-testid="dry-run-state-loading"]');
        expect(loadingEl).not.toBeNull();
      });

      // Eventually transitions to result state.
      await waitFor(
        () => {
          const resultEl = container.querySelector('[data-testid="dry-run-state-result"]');
          expect(resultEl).not.toBeNull();
        },
        { timeout: 3000 },
      );
    });

    it('exposes an error state element when the mocked async rejects', () => {
      // The P10 story must export an `ErrorState` story (or wire a prop that
      // forces error mode) so this test can render a failing dry-run. The
      // RED-phase implementer guidance: add `Default` (success) AND
      // `ErrorState` (rejection) story exports.
      const errMod = P10PreviewCompare as unknown as StoryModule;
      const ErrorStory = (errMod as unknown as { ErrorState?: { render?: () => React.ReactElement } })
        .ErrorState;
      expect(ErrorStory).toBeTruthy();
      expect(typeof ErrorStory!.render).toBe('function');

      const { container } = render(ErrorStory!.render!());
      const errorEl = container.querySelector('[data-testid="dry-run-state-error"]');
      // The error element may render synchronously (initial error state) or
      // require a click — accept either: presence in initial render is enough
      // to satisfy the structural mutation guard.
      expect(errorEl).not.toBeNull();
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// AC3 — assertModalA11y(container) for ALL 10 patterns
//   Each pattern must render with zero serious or critical axe-core violations
//   AND satisfy role=dialog, aria-modal=true, aria-labelledby wiring.
// ──────────────────────────────────────────────────────────────────────────────
const PATTERNS: ReadonlyArray<readonly [string, StoryModule]> = [
  ['P1 Wizard', P1Wizard],
  ['P2 SimpleForm', P2SimpleForm],
  ['P3 DualPath', P3DualPath],
  ['P4 Picker', P4Picker],
  ['P5 OverrideWithReason', P5OverrideWithReason],
  ['P6 Simple', P6Simple],
  ['P7 AsyncWithStates', P7AsyncWithStates],
  ['P8 ConfirmDestructiveType', P8ConfirmDestructiveType],
  ['P9 ConfirmDestructiveReason', P9ConfirmDestructiveReason],
  ['P10 PreviewCompare', P10PreviewCompare],
];

describe('AC3: assertModalA11y passes for all 10 MODAL-SCHEMA patterns', () => {
  for (const [name, mod] of PATTERNS) {
    describe(name, () => {
      it('renders with zero serious/critical axe-core violations', async () => {
        const { container } = render(renderStory(mod));
        await assertModalA11y(container);
      });
    });
  }
});
