import React, { useEffect } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { useStepperStore } from './stepper-store';

export interface StepDef {
  id: string;
  label: string;
  canEnter?: () => boolean;
}

interface StepperProps {
  wizardId: string;
  steps: StepDef[];
  currentStep: number;
  onChange: (nextStep: number) => void;
  hasErrors?: boolean;
  cancelSlot?: React.ReactNode;
  onEscape?: () => void;
  children?: React.ReactNode;
}

function Stepper({
  wizardId,
  steps,
  currentStep,
  onChange,
  hasErrors = false,
  cancelSlot,
  onEscape,
  children,
}: StepperProps) {
  const setStep = useStepperStore((s) => s.setStep);

  // Seed store whenever currentStep prop changes
  useEffect(() => {
    setStep(wizardId, currentStep);
  }, [wizardId, currentStep, setStep]);

  const isBackDisabled = currentStep === 0;
  const isNextDisabled = hasErrors;

  function handleBack() {
    if (isBackDisabled) return;
    onChange(currentStep - 1);
  }

  function handleNext() {
    if (isNextDisabled) return;
    if (currentStep < steps.length - 1) {
      onChange(currentStep + 1);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      onEscape?.();
      // Do NOT call e.stopPropagation() — let the event bubble for Modal contract
    }
  }

  // Radix Tabs controlled value is the string index of currentStep
  function handleTabValueChange(value: string) {
    const targetIndex = parseInt(value, 10);
    const step = steps[targetIndex];
    if (!step) return;
    // canEnter absent = implicitly enterable
    if (step.canEnter && !step.canEnter()) return;
    onChange(targetIndex);
  }

  return (
    <div
      data-testid="stepper-root"
      data-density="default"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
    >
      <Tabs.Root
        value={String(currentStep)}
        onValueChange={handleTabValueChange}
        activationMode="manual"
      >
        <Tabs.List
          aria-label="Wizard steps"
          style={{ display: 'flex', gap: 'var(--space-2)' }}
        >
          {steps.map((step, index) => {
            const isLocked = step.canEnter ? !step.canEnter() : false;
            const isCurrent = index === currentStep;

            return (
              <Tabs.Trigger
                key={step.id}
                value={String(index)}
                aria-current={isCurrent ? 'step' : undefined}
                aria-disabled={isLocked ? 'true' : undefined}
                onClick={(e) => {
                  if (isLocked) {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                }}
                style={{ cursor: isLocked ? 'not-allowed' : 'pointer' }}
              >
                {step.label}
              </Tabs.Trigger>
            );
          })}
        </Tabs.List>
      </Tabs.Root>

      <div data-testid="stepper-body">
        {children}
      </div>

      <div
        data-testid="stepper-footer"
        style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}
      >
        <button
          type="button"
          aria-disabled={isBackDisabled ? 'true' : undefined}
          onClick={handleBack}
        >
          Back
        </button>

        {cancelSlot}

        <button
          type="button"
          aria-disabled={isNextDisabled ? 'true' : undefined}
          onClick={handleNext}
        >
          Next
        </button>
      </div>
    </div>
  );
}

export default Stepper;
