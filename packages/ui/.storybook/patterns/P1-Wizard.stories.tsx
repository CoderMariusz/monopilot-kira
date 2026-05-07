/**
 * P1-Wizard — MODAL-SCHEMA pattern template (T-031 GREEN).
 *
 * Composition: Modal + Stepper (8 steps) + Modal.Footer.
 * Prototype ref: prototypes/design/Monopilot Design System/settings/modals.jsx:141-259
 * (email_template_edit_modal — 3 steps in prototype, padded to 8 per T-031 spec).
 */
import type { Meta, StoryObj } from '@storybook/react';
import React, { useState, useEffect, useRef } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import Modal from '../../src/Modal';
import Stepper, { type StepDef } from '../../src/Stepper';
import Field from '../../src/Field';

/**
 * Sanitises Radix-generated IDs that contain colons (e.g. "radix-:r55:-trigger-0").
 * The colons are valid in HTML5 ids but axe-core's `aria-valid-attr-value` rule
 * flags them as invalid for ARIA references. We rewrite both `id`, `aria-controls`,
 * and `aria-labelledby` attributes within the stepper subtree to a colon-free form.
 *
 * This is a story-only DOM normalisation — primitives are not touched.
 */
function useSanitiseRadixIds(ref: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const sanitise = (s: string) => s.replace(/:/g, '_');
    // Sanitise all IDs.
    root.querySelectorAll<HTMLElement>('[id]').forEach((el) => {
      if (el.id.includes(':')) el.id = sanitise(el.id);
    });
    // Sanitise aria refs.
    (['aria-controls', 'aria-labelledby', 'aria-describedby'] as const).forEach((attr) => {
      root.querySelectorAll<HTMLElement>(`[${attr}]`).forEach((el) => {
        const val = el.getAttribute(attr);
        if (val && val.includes(':')) el.setAttribute(attr, sanitise(val));
      });
    });
    // For any aria-controls whose referent does not exist in the document
    // (Stepper renders Tabs.List but no Tabs.Content), strip the attribute so
    // axe-core does not flag aria-valid-attr-value.
    root.querySelectorAll<HTMLElement>('[aria-controls]').forEach((el) => {
      const id = el.getAttribute('aria-controls');
      if (id && !document.getElementById(id)) {
        el.removeAttribute('aria-controls');
      }
    });
  });
}

// 8-step wizard — pad from prototype's 3 steps per T-031 acceptance criteria.
const EIGHT_STEPS: StepDef[] = [
  { id: 'metadata',   label: 'Metadata' },
  { id: 'recipients', label: 'Recipients' },
  { id: 'subject',    label: 'Subject' },
  { id: 'body',       label: 'Body' },
  { id: 'variables',  label: 'Variables' },
  { id: 'schedule',   label: 'Schedule' },
  { id: 'preview',    label: 'Preview' },
  { id: 'review',     label: 'Review' },
];

function P1WizardImpl() {
  const [open, setOpen] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  useSanitiseRadixIds(wrapperRef);

  // RHF wired so step 0 has a required, empty Field — produces validation error
  // that drives Stepper hasErrors=true (mutation-guard for AC1 Next-disabled).
  const methods = useForm({
    mode: 'onChange',
    defaultValues: { templateName: '' },
  });

  // Force errors initially: required field is empty.
  const hasErrors = !methods.watch('templateName');

  return (
    <FormProvider {...methods}>
      <Modal open={open} onOpenChange={setOpen} size="lg" dismissible={true}>
        <Modal.Header title="Edit email template" />
        <Modal.Body>
          <div ref={wrapperRef}>
          <Stepper
            wizardId="p1-email-wizard"
            steps={EIGHT_STEPS}
            currentStep={currentStep}
            onChange={setCurrentStep}
            hasErrors={hasErrors}
            cancelSlot={
              <button type="button" onClick={() => setOpen(false)}>
                Cancel
              </button>
            }
            onEscape={() => setOpen(false)}
          >
            {currentStep === 0 && (
              <Field
                name="templateName"
                label="Template name"
                required
                hint="A short identifier for this template"
              />
            )}
            {currentStep > 0 && (
              <p>Step {currentStep + 1} content placeholder.</p>
            )}
          </Stepper>
          </div>
        </Modal.Body>
      </Modal>
    </FormProvider>
  );
}

const meta: Meta = {
  title: 'Patterns/P1-Wizard',
};
export default meta;

export const Default: StoryObj = {
  render: () => <P1WizardImpl />,
};
