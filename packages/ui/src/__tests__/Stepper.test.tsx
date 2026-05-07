/**
 * Stepper.test.tsx — RED phase tests for T-026
 *
 * Canonical prototype reference:
 *   prototypes/design/Monopilot Design System/settings/modals.jsx:141-259
 *   (EmailTemplateEditModal — SM-04 3-step wizard)
 *
 * AC traceability:
 *   AC1 → describe('AC1: parity vs modals.jsx:141-259')
 *   AC2 → describe('AC2: stepperStore persists step across re-renders')
 *   AC3 → describe('AC3: canEnter=false rejects Jump')
 *   AC4 → describe('AC4: parity evidence / RTL fallback')
 *
 * NOTE FOR IMPLEMENTER:
 *   These tests import from '../Stepper' and '../stepper-store' which do NOT yet exist.
 *   They will fail at the import/module-resolution stage until GREEN phase.
 *   Required new deps (add to packages/ui):
 *     pnpm --filter @monopilot/ui add @radix-ui/react-tabs zustand
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// These imports will FAIL (RED) until Stepper.tsx and stepper-store.ts are created.
import Stepper, { type StepDef } from '../Stepper';
import { useStepperStore } from '../stepper-store';

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const THREE_STEPS: StepDef[] = [
  { id: 'meta',   label: 'Metadata' },
  { id: 'body',   label: 'Subject + body' },
  { id: 'review', label: 'Review' },
];

const EIGHT_STEPS: StepDef[] = [
  { id: 's1', label: 'Step 1' },
  { id: 's2', label: 'Step 2' },
  { id: 's3', label: 'Step 3' },
  { id: 's4', label: 'Step 4' },
  { id: 's5', label: 'Step 5' },
  { id: 's6', label: 'Step 6' },
  { id: 's7', label: 'Step 7' },
  { id: 's8', label: 'Step 8' },
];

// ---------------------------------------------------------------------------
// AC1: Structural parity vs modals.jsx:141-259
// ---------------------------------------------------------------------------

describe('AC1: parity vs modals.jsx:141-259', () => {
  describe('structural — top nav with N step labels', () => {
    it('renders a navigation region with one tab/label per step', () => {
      const { container } = render(
        <Stepper
          wizardId="test-wizard-ac1-nav"
          steps={THREE_STEPS}
          currentStep={0}
          onChange={vi.fn()}
        />
      );

      // Radix Tabs renders a [role="tablist"] for the nav
      const tabList = container.querySelector('[role="tablist"]');
      expect(tabList).not.toBeNull();

      // Each step label is a tab
      const tabs = container.querySelectorAll('[role="tab"]');
      expect(tabs).toHaveLength(THREE_STEPS.length);
    });

    it('marks the current step tab with aria-current="step"', () => {
      const { container } = render(
        <Stepper
          wizardId="test-wizard-ac1-current"
          steps={THREE_STEPS}
          currentStep={1}
          onChange={vi.fn()}
        />
      );

      const tabs = container.querySelectorAll('[role="tab"]');
      // Tab at index 1 (step "body") should be aria-current="step"
      expect(tabs[1]).toHaveAttribute('aria-current', 'step');
      // Others should not
      expect(tabs[0]).not.toHaveAttribute('aria-current', 'step');
      expect(tabs[2]).not.toHaveAttribute('aria-current', 'step');
    });

    it('renders all three label texts from the steps prop', () => {
      render(
        <Stepper
          wizardId="test-wizard-ac1-labels"
          steps={THREE_STEPS}
          currentStep={0}
          onChange={vi.fn()}
        />
      );

      expect(screen.getByText('Metadata')).toBeInTheDocument();
      expect(screen.getByText('Subject + body')).toBeInTheDocument();
      expect(screen.getByText('Review')).toBeInTheDocument();
    });

    it('scales to 8 steps — renders 8 tab labels (wizard parity)', () => {
      const { container } = render(
        <Stepper
          wizardId="test-wizard-ac1-8step"
          steps={EIGHT_STEPS}
          currentStep={0}
          onChange={vi.fn()}
        />
      );

      const tabs = container.querySelectorAll('[role="tab"]');
      expect(tabs).toHaveLength(8);
    });
  });

  describe('structural — body slot', () => {
    it('renders children inside a body slot region', () => {
      const { container } = render(
        <Stepper
          wizardId="test-wizard-ac1-body"
          steps={THREE_STEPS}
          currentStep={0}
          onChange={vi.fn()}
        >
          <div data-testid="step-body-content">Step body here</div>
        </Stepper>
      );

      const bodyRegion = container.querySelector('[data-testid="stepper-body"]');
      expect(bodyRegion).not.toBeNull();
      expect(within(bodyRegion as HTMLElement).getByTestId('step-body-content')).toBeInTheDocument();
    });
  });

  describe('structural — footer Back + Next + Cancel slot', () => {
    it('renders a Back button', () => {
      const { container } = render(
        <Stepper
          wizardId="test-wizard-ac1-footer"
          steps={THREE_STEPS}
          currentStep={1}
          onChange={vi.fn()}
          cancelSlot={<button>Cancel</button>}
        />
      );

      const footer = container.querySelector('[data-testid="stepper-footer"]');
      expect(footer).not.toBeNull();
      expect(within(footer as HTMLElement).getByRole('button', { name: /back/i })).toBeInTheDocument();
    });

    it('renders a Next button', () => {
      const { container } = render(
        <Stepper
          wizardId="test-wizard-ac1-next"
          steps={THREE_STEPS}
          currentStep={0}
          onChange={vi.fn()}
        />
      );

      const footer = container.querySelector('[data-testid="stepper-footer"]');
      expect(footer).not.toBeNull();
      expect(within(footer as HTMLElement).getByRole('button', { name: /next/i })).toBeInTheDocument();
    });

    it('renders Cancel slot content when cancelSlot prop is provided', () => {
      render(
        <Stepper
          wizardId="test-wizard-ac1-cancel"
          steps={THREE_STEPS}
          currentStep={1}
          onChange={vi.fn()}
          cancelSlot={<button>Cancel</button>}
        />
      );

      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    it('footer has Back + Next + Cancel — total 3 footer buttons at middle step', () => {
      const { container } = render(
        <Stepper
          wizardId="test-wizard-ac1-3btns"
          steps={THREE_STEPS}
          currentStep={1}
          onChange={vi.fn()}
          cancelSlot={<button>Cancel</button>}
        />
      );

      const footer = container.querySelector('[data-testid="stepper-footer"]');
      expect(footer).not.toBeNull();
      const buttons = within(footer as HTMLElement).getAllByRole('button');
      // Back + Cancel + Next = 3 buttons in footer
      expect(buttons.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('structural — uses Radix Tabs primitive (NOT raw divs)', () => {
    it('nav wrapper has role="tablist" (Radix Tabs.List)', () => {
      const { container } = render(
        <Stepper
          wizardId="test-wizard-ac1-radix"
          steps={THREE_STEPS}
          currentStep={0}
          onChange={vi.fn()}
        />
      );

      // Radix Tabs renders [role="tablist"] — raw divs do NOT
      const tabList = container.querySelector('[role="tablist"]');
      expect(tabList).not.toBeNull();
    });

    it('each step item has role="tab" (Radix Tabs.Trigger)', () => {
      const { container } = render(
        <Stepper
          wizardId="test-wizard-ac1-tab-role"
          steps={THREE_STEPS}
          currentStep={0}
          onChange={vi.fn()}
        />
      );

      const tabs = container.querySelectorAll('[role="tab"]');
      expect(tabs.length).toBe(THREE_STEPS.length);
    });

    it('does NOT use a native <select> or raw <ul> for step navigation', () => {
      const { container } = render(
        <Stepper
          wizardId="test-wizard-ac1-no-raw"
          steps={THREE_STEPS}
          currentStep={0}
          onChange={vi.fn()}
        />
      );

      expect(container.querySelector('select')).toBeNull();
      // A raw <ul> used as the nav (no role override) would fail this — tablist must be present
      const tabList = container.querySelector('[role="tablist"]');
      expect(tabList).not.toBeNull();
    });
  });

  describe('interactional — Back disabled at step 0', () => {
    it('Back button has aria-disabled="true" on the first step', async () => {
      const onChange = vi.fn();
      render(
        <Stepper
          wizardId="test-wizard-ac1-back-disabled"
          steps={THREE_STEPS}
          currentStep={0}
          onChange={onChange}
          cancelSlot={<button>Cancel</button>}
        />
      );

      const backButton = screen.getByRole('button', { name: /back/i });
      expect(backButton).toHaveAttribute('aria-disabled', 'true');
    });

    it('clicking disabled Back at step 0 does NOT call onChange', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();

      render(
        <Stepper
          wizardId="test-wizard-ac1-back-no-call"
          steps={THREE_STEPS}
          currentStep={0}
          onChange={onChange}
        />
      );

      const backButton = screen.getByRole('button', { name: /back/i });
      await user.click(backButton);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('Back button is NOT aria-disabled at step > 0', () => {
      render(
        <Stepper
          wizardId="test-wizard-ac1-back-enabled"
          steps={THREE_STEPS}
          currentStep={1}
          onChange={vi.fn()}
        />
      );

      const backButton = screen.getByRole('button', { name: /back/i });
      expect(backButton).not.toHaveAttribute('aria-disabled', 'true');
    });
  });

  describe('interactional — Next disabled when current step has validation errors', () => {
    it('Next button has aria-disabled="true" when hasErrors=true', () => {
      render(
        <Stepper
          wizardId="test-wizard-ac1-next-disabled"
          steps={THREE_STEPS}
          currentStep={0}
          onChange={vi.fn()}
          hasErrors={true}
        />
      );

      const nextButton = screen.getByRole('button', { name: /next/i });
      expect(nextButton).toHaveAttribute('aria-disabled', 'true');
    });

    it('clicking disabled Next when hasErrors=true does NOT call onChange', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();

      render(
        <Stepper
          wizardId="test-wizard-ac1-next-no-call"
          steps={THREE_STEPS}
          currentStep={0}
          onChange={onChange}
          hasErrors={true}
        />
      );

      const nextButton = screen.getByRole('button', { name: /next/i });
      await user.click(nextButton);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('Next button is NOT aria-disabled when hasErrors=false (mutation-proof: flipping hasErrors flips the assertion)', () => {
      const { rerender } = render(
        <Stepper
          wizardId="test-wizard-ac1-next-enabled"
          steps={THREE_STEPS}
          currentStep={0}
          onChange={vi.fn()}
          hasErrors={false}
        />
      );

      const nextButton = screen.getByRole('button', { name: /next/i });
      expect(nextButton).not.toHaveAttribute('aria-disabled', 'true');

      // Mutation: flip hasErrors to true → Next must become disabled
      rerender(
        <Stepper
          wizardId="test-wizard-ac1-next-enabled"
          steps={THREE_STEPS}
          currentStep={0}
          onChange={vi.fn()}
          hasErrors={true}
        />
      );
      expect(nextButton).toHaveAttribute('aria-disabled', 'true');
    });

    it('clicking enabled Next with hasErrors=false DOES call onChange', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();

      render(
        <Stepper
          wizardId="test-wizard-ac1-next-calls"
          steps={THREE_STEPS}
          currentStep={0}
          onChange={onChange}
          hasErrors={false}
        />
      );

      const nextButton = screen.getByRole('button', { name: /next/i });
      await user.click(nextButton);
      expect(onChange).toHaveBeenCalledWith(1);
    });
  });

  describe('interactional — ESC follows Modal contract', () => {
    it('calls onEscape when ESC key is pressed within the stepper', async () => {
      const onEscape = vi.fn();
      const user = userEvent.setup();

      const { container } = render(
        <Stepper
          wizardId="test-wizard-ac1-esc"
          steps={THREE_STEPS}
          currentStep={0}
          onChange={vi.fn()}
          onEscape={onEscape}
        />
      );

      const stepperRoot = container.querySelector('[data-testid="stepper-root"]');
      expect(stepperRoot).not.toBeNull();

      // Focus something inside the stepper then press ESC
      (stepperRoot as HTMLElement).focus();
      await user.keyboard('{Escape}');

      expect(onEscape).toHaveBeenCalledTimes(1);
    });
  });
});

// ---------------------------------------------------------------------------
// AC2: stepperStore persists step across re-renders without prop drilling
// ---------------------------------------------------------------------------

describe('AC2: stepperStore persists step across re-renders', () => {
  beforeEach(() => {
    // Reset store state between tests via the store's own reset helper
    useStepperStore.getState().reset?.('wizard-ac2');
  });

  it('stepperStore is keyed by wizardId — two wizards have independent state', () => {
    const storeA = useStepperStore.getState();
    storeA.setStep('wizard-A', 2);
    storeA.setStep('wizard-B', 5);

    expect(useStepperStore.getState().getStep('wizard-A')).toBe(2);
    expect(useStepperStore.getState().getStep('wizard-B')).toBe(5);
  });

  it('stepperStore.setStep updates stored step for the given wizardId', () => {
    const store = useStepperStore.getState();
    store.setStep('wizard-ac2', 0);
    expect(store.getStep('wizard-ac2')).toBe(0);

    store.setStep('wizard-ac2', 3);
    expect(useStepperStore.getState().getStep('wizard-ac2')).toBe(3);
  });

  it('Stepper reads and writes stepperStore — currentStep persists after re-render without prop drilling', () => {
    const onChange = vi.fn();

    const WizardHost = ({ step }: { step: number }) => (
      <Stepper
        wizardId="wizard-persist"
        steps={THREE_STEPS}
        currentStep={step}
        onChange={onChange}
      />
    );

    const { rerender } = render(<WizardHost step={0} />);

    // Check store was seeded at step 0
    expect(useStepperStore.getState().getStep('wizard-persist')).toBe(0);

    // Re-render without changing the prop (simulate parent not updating)
    rerender(<WizardHost step={0} />);

    // Store must still hold the step — no prop drilling needed
    expect(useStepperStore.getState().getStep('wizard-persist')).toBe(0);
  });

  it('two Stepper instances with different wizardIds share NO state', () => {
    render(
      <>
        <Stepper
          wizardId="wizard-X"
          steps={THREE_STEPS}
          currentStep={0}
          onChange={vi.fn()}
        />
        <Stepper
          wizardId="wizard-Y"
          steps={THREE_STEPS}
          currentStep={2}
          onChange={vi.fn()}
        />
      </>
    );

    // Store must hold independent steps per wizardId
    expect(useStepperStore.getState().getStep('wizard-X')).toBe(0);
    expect(useStepperStore.getState().getStep('wizard-Y')).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// AC3: canEnter(step) = false rejects Jump, currentStep unchanged
// ---------------------------------------------------------------------------

describe('AC3: canEnter=false rejects Jump to locked step', () => {
  it('Jump button for a step with canEnter()=false has aria-disabled="true"', () => {
    const steps: StepDef[] = [
      { id: 'meta',   label: 'Metadata' },
      { id: 'body',   label: 'Subject + body' },
      { id: 'review', label: 'Review', canEnter: () => false },
    ];

    const { container } = render(
      <Stepper
        wizardId="test-wizard-ac3-locked"
        steps={steps}
        currentStep={0}
        onChange={vi.fn()}
      />
    );

    // The tab trigger for "review" step must be aria-disabled
    const tabs = container.querySelectorAll('[role="tab"]');
    const reviewTab = tabs[2];
    expect(reviewTab).toHaveAttribute('aria-disabled', 'true');
  });

  it('clicking Jump (tab) for locked step does NOT call onChange', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    const steps: StepDef[] = [
      { id: 'meta',   label: 'Metadata' },
      { id: 'body',   label: 'Subject + body' },
      { id: 'review', label: 'Review', canEnter: () => false },
    ];

    const { container } = render(
      <Stepper
        wizardId="test-wizard-ac3-no-call"
        steps={steps}
        currentStep={0}
        onChange={onChange}
      />
    );

    const tabs = container.querySelectorAll('[role="tab"]');
    const lockedTab = tabs[2];
    await user.click(lockedTab);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('mutation-proof: canEnter()=true allows Jump and DOES call onChange with the target step index', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    const steps: StepDef[] = [
      { id: 'meta',   label: 'Metadata' },
      { id: 'body',   label: 'Subject + body' },
      { id: 'review', label: 'Review', canEnter: () => true },  // NOW unlocked
    ];

    const { container } = render(
      <Stepper
        wizardId="test-wizard-ac3-allowed"
        steps={steps}
        currentStep={0}
        onChange={onChange}
      />
    );

    const tabs = container.querySelectorAll('[role="tab"]');
    const reviewTab = tabs[2];

    // Must NOT be aria-disabled when canEnter returns true
    expect(reviewTab).not.toHaveAttribute('aria-disabled', 'true');

    await user.click(reviewTab);
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('currentStep in store does NOT change after rejected Jump (canEnter=false)', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    const steps: StepDef[] = [
      { id: 'meta',   label: 'Metadata' },
      { id: 'body',   label: 'Subject + body' },
      { id: 'review', label: 'Review', canEnter: () => false },
    ];

    const { container } = render(
      <Stepper
        wizardId="wizard-ac3-store"
        steps={steps}
        currentStep={0}
        onChange={onChange}
      />
    );

    const initialStep = useStepperStore.getState().getStep('wizard-ac3-store');

    const tabs = container.querySelectorAll('[role="tab"]');
    await user.click(tabs[2]); // locked

    // onChange not called, store step unchanged
    expect(onChange).not.toHaveBeenCalled();
    expect(useStepperStore.getState().getStep('wizard-ac3-store')).toBe(initialStep);
  });

  it('steps without canEnter are implicitly enterable (no aria-disabled on tab)', () => {
    const steps: StepDef[] = [
      { id: 'meta',   label: 'Metadata' },
      { id: 'body',   label: 'Subject + body' },
      // no canEnter on review → should be enterable
      { id: 'review', label: 'Review' },
    ];

    const { container } = render(
      <Stepper
        wizardId="test-wizard-ac3-default"
        steps={steps}
        currentStep={0}
        onChange={vi.fn()}
      />
    );

    const tabs = container.querySelectorAll('[role="tab"]');
    expect(tabs[2]).not.toHaveAttribute('aria-disabled', 'true');
  });
});

// ---------------------------------------------------------------------------
// AC4: Parity evidence / RTL fallback documentation
// ---------------------------------------------------------------------------

describe('AC4: parity evidence — RTL fallback (Playwright unavailable)', () => {
  /**
   * AC4 is a closeout-level AC. Playwright / Storybook are not yet configured.
   * Per UI-PROTOTYPE-PARITY-POLICY.md: document the blocker and provide RTL/snapshot fallback.
   *
   * RTL fallback evidence: structural snapshot of Stepper at step 1 of 3.
   * The snapshot captures: tablist, 3 tabs, aria-current on active tab,
   * body region, footer with Back/Next buttons.
   */
  it('RTL fallback: snapshot of Stepper at mid-wizard step captures all structural regions', () => {
    const { container } = render(
      <Stepper
        wizardId="test-wizard-ac4-snapshot"
        steps={THREE_STEPS}
        currentStep={1}
        onChange={vi.fn()}
        cancelSlot={<button>Cancel</button>}
      >
        <p>Step body content</p>
      </Stepper>
    );

    // Structural assertions (parity evidence)
    expect(container.querySelector('[role="tablist"]')).not.toBeNull();
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(3);
    expect(container.querySelector('[role="tab"][aria-current="step"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="stepper-body"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="stepper-footer"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('RTL fallback: Stepper uses tokens.css density vars (data-density attribute or CSS custom property)', () => {
    const { container } = render(
      <Stepper
        wizardId="test-wizard-ac4-density"
        steps={THREE_STEPS}
        currentStep={0}
        onChange={vi.fn()}
      />
    );

    const root = container.querySelector('[data-testid="stepper-root"]');
    expect(root).not.toBeNull();
    // Implementer must set data-density or apply --space-* tokens via className
    // This assertion verifies the root node exists and is identifiable for visual review
    expect(root).toHaveAttribute('data-density', 'default');
  });
});
