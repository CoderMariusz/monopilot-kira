/**
 * P9-ConfirmDestructiveReason — MODAL-SCHEMA pattern template.
 *
 * Composition: Modal + ReasonInput + destructive button.
 */
import type { Meta, StoryObj } from '@storybook/react';
import React, { useState } from 'react';
import Modal from '../../src/Modal';
import ReasonInput from '../../src/ReasonInput';

function P9ConfirmReasonImpl() {
  const [open, setOpen] = useState(true);

  return (
    <Modal open={open} onOpenChange={setOpen} size="md">
      <Modal.Header title="Delete with reason" />
      <Modal.Body>
        <p>This destructive action requires an audit reason (minimum 10 chars).</p>
        <label>
          <span>Audit reason</span>
          <ReasonInput name="deleteReason" minLength={10} placeholder="Why is this being deleted?" />
        </label>
        <button
          type="submit"
          data-variant="destructive"
          onClick={() => setOpen(false)}
        >
          Delete
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

const meta: Meta = { title: 'Patterns/P9-ConfirmDestructiveReason' };
export default meta;

export const Default: StoryObj = {
  render: () => <P9ConfirmReasonImpl />,
};
