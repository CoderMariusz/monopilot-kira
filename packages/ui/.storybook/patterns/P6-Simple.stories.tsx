/**
 * P6-Simple — MODAL-SCHEMA pattern template.
 *
 * Composition: Modal + content + single Close action.
 */
import type { Meta, StoryObj } from '@storybook/react';
import React, { useState } from 'react';
import Modal from '../../src/Modal';

function P6SimpleImpl() {
  const [open, setOpen] = useState(true);

  return (
    <Modal open={open} onOpenChange={setOpen} size="sm">
      <Modal.Header title="About this feature" />
      <Modal.Body>
        <p>
          This feature allows you to manage your settings centrally. All changes
          are audit-logged and can be reverted within 24 hours.
        </p>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" onClick={() => setOpen(false)}>
          Close
        </button>
      </Modal.Footer>
    </Modal>
  );
}

const meta: Meta = { title: 'Patterns/P6-Simple' };
export default meta;

export const Default: StoryObj = {
  render: () => <P6SimpleImpl />,
};
