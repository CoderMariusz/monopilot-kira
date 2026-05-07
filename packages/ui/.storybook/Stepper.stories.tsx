/**
 * Stepper.stories.tsx — T-026 GREEN phase story
 *
 * Replicates modals.jsx:141-259 (EmailTemplateEditModal — SM-04 3-step wizard)
 * as a Storybook story.
 *
 * NOTE: Storybook config is a T-056 carry-forward. This file may not render
 * until that task is complete. The file is created here as required by T-026.
 */

import type { Meta, StoryObj } from '@storybook/react';
import React, { useState } from 'react';
import Stepper, { type StepDef } from '../src/Stepper';

const meta: Meta<typeof Stepper> = {
  title: 'Stepper/8-step-wizard',
  component: Stepper,
};

export default meta;
type Story = StoryObj<typeof Stepper>;

// ---------------------------------------------------------------------------
// 3-step wizard — parity with modals.jsx:141-259 EmailTemplateEditModal
// ---------------------------------------------------------------------------

const THREE_STEPS: StepDef[] = [
  { id: 'meta',   label: 'Metadata' },
  { id: 'body',   label: 'Subject + body' },
  { id: 'review', label: 'Review' },
];

function ThreeStepWizard() {
  const [currentStep, setCurrentStep] = useState(0);

  const stepContent = [
    <div key="meta">
      <h3>Step 1: Metadata</h3>
      <label>
        Template name
        <input type="text" placeholder="e.g. Welcome email" />
      </label>
      <label>
        Category
        <select>
          <option>Onboarding</option>
          <option>Transactional</option>
          <option>Marketing</option>
        </select>
      </label>
    </div>,
    <div key="body">
      <h3>Step 2: Subject + Body</h3>
      <label>
        Subject line
        <input type="text" placeholder="e.g. Welcome to Monopilot" />
      </label>
      <label>
        Body
        <textarea rows={6} placeholder="Email body content..." />
      </label>
    </div>,
    <div key="review">
      <h3>Step 3: Review</h3>
      <p>Please review your template before saving.</p>
      <dl>
        <dt>Template name</dt><dd>Welcome email</dd>
        <dt>Category</dt><dd>Onboarding</dd>
        <dt>Subject</dt><dd>Welcome to Monopilot</dd>
      </dl>
    </div>,
  ];

  return (
    <div style={{ maxWidth: 640, padding: '2rem', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}>
      <h2 style={{ marginTop: 0 }}>Edit Email Template</h2>
      <Stepper
        wizardId="email-template-wizard"
        steps={THREE_STEPS}
        currentStep={currentStep}
        onChange={setCurrentStep}
        cancelSlot={
          <button type="button" onClick={() => alert('Cancelled')}>
            Cancel
          </button>
        }
        onEscape={() => alert('ESC pressed — close modal')}
      >
        {stepContent[currentStep]}
      </Stepper>
    </div>
  );
}

export const ThreeStepEmailTemplateWizard: Story = {
  render: () => <ThreeStepWizard />,
  name: '3-step email template wizard (modals.jsx parity)',
};

// ---------------------------------------------------------------------------
// 8-step wizard — maximum scale test
// ---------------------------------------------------------------------------

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

function EightStepWizard() {
  const [currentStep, setCurrentStep] = useState(0);

  return (
    <div style={{ maxWidth: 800, padding: '2rem', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}>
      <h2 style={{ marginTop: 0 }}>8-Step Wizard</h2>
      <Stepper
        wizardId="eight-step-wizard"
        steps={EIGHT_STEPS}
        currentStep={currentStep}
        onChange={setCurrentStep}
        cancelSlot={
          <button type="button" onClick={() => alert('Cancelled')}>
            Cancel
          </button>
        }
      >
        <p>Content for step {currentStep + 1} of 8.</p>
      </Stepper>
    </div>
  );
}

export const EightStepWizard_: Story = {
  render: () => <EightStepWizard />,
  name: '8-step-wizard',
};

// ---------------------------------------------------------------------------
// canEnter guard — step 3 locked until steps 1+2 completed
// ---------------------------------------------------------------------------

const LOCKED_STEPS: StepDef[] = [
  { id: 'meta',   label: 'Metadata' },
  { id: 'body',   label: 'Subject + body' },
  { id: 'review', label: 'Review', canEnter: () => false },
];

function LockedStepWizard() {
  const [currentStep, setCurrentStep] = useState(0);

  return (
    <div style={{ maxWidth: 640, padding: '2rem', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}>
      <h2 style={{ marginTop: 0 }}>Wizard with Locked Step</h2>
      <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
        The &ldquo;Review&rdquo; tab is locked (canEnter=false) — clicking it does nothing.
      </p>
      <Stepper
        wizardId="locked-step-wizard"
        steps={LOCKED_STEPS}
        currentStep={currentStep}
        onChange={setCurrentStep}
        cancelSlot={
          <button type="button">Cancel</button>
        }
      >
        <p>Content for step {currentStep + 1}.</p>
      </Stepper>
    </div>
  );
}

export const LockedStepWizardStory: Story = {
  render: () => <LockedStepWizard />,
  name: 'locked-step (canEnter=false)',
};

// ---------------------------------------------------------------------------
// hasErrors — Next disabled when form has validation errors
// ---------------------------------------------------------------------------

function HasErrorsWizard() {
  const [currentStep, setCurrentStep] = useState(0);
  const [hasErrors, setHasErrors] = useState(true);

  return (
    <div style={{ maxWidth: 640, padding: '2rem', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}>
      <h2 style={{ marginTop: 0 }}>Wizard with Validation Errors</h2>
      <label style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={hasErrors}
          onChange={(e) => setHasErrors(e.target.checked)}
        />
        Has errors (disables Next)
      </label>
      <Stepper
        wizardId="has-errors-wizard"
        steps={THREE_STEPS}
        currentStep={currentStep}
        onChange={setCurrentStep}
        hasErrors={hasErrors}
        cancelSlot={<button type="button">Cancel</button>}
      >
        <p>{hasErrors ? 'Fix the errors above to proceed.' : 'No errors — Next is enabled.'}</p>
      </Stepper>
    </div>
  );
}

export const HasErrorsWizardStory: Story = {
  render: () => <HasErrorsWizard />,
  name: 'hasErrors — Next disabled on validation errors',
};
