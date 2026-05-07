/**
 * P5-OverrideWithReason — MODAL-SCHEMA pattern template.
 *
 * Composition: Modal + ReasonInput + Footer Override (destructive-styled).
 * Prototype ref: prototypes/design/Monopilot Design System/settings/modals.jsx:72-108
 */
import type { Meta, StoryObj } from '@storybook/react';
import React, { useState } from 'react';
import Modal from '../../src/Modal';
import ReasonInput from '../../src/ReasonInput';

function P5OverrideImpl() {
  const [open, setOpen] = useState(true);

  return (
    <Modal open={open} onOpenChange={setOpen} size="md">
      <Modal.Header title="Override threshold" />
      <Modal.Body>
        <p>Provide a reason to override the system-suggested threshold.</p>
        <label>
          <span>Override reason</span>
          <ReasonInput name="overrideReason" minLength={10} placeholder="Why is this override needed?" />
        </label>
        <button type="submit" data-action="override" onClick={() => setOpen(false)}>
          Override
        </button>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </Modal.Footer>
    </Modal>
  );
}

const meta: Meta = { title: 'Patterns/P5-OverrideWithReason' };
export default meta;

export const Default: StoryObj = {
  render: () => <P5OverrideImpl />,
};
