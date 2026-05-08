/**
 * Modal stories — covers the Radix Dialog wrapper used for Invite User and
 * other access-screen flows. See packages/ui/src/Modal.tsx.
 */
import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import Modal from '../src/Modal';

const meta: Meta<typeof Modal> = {
  title: 'UI/Modal',
  component: Modal,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;

type Story = StoryObj<typeof Modal>;

export const Default: Story = {
  render: () => {
    const [open, setOpen] = React.useState(true);
    return (
      <Modal open={open} onOpenChange={setOpen}>
        <Modal.Header title="Invite user" />
        <Modal.Body>
          <p>Send an invitation email to a new team member.</p>
        </Modal.Body>
        <Modal.Footer>
          <button className="btn btn-secondary" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button className="btn btn-primary">Send invite</button>
        </Modal.Footer>
      </Modal>
    );
  },
};

export const Large: Story = {
  render: () => {
    const [open, setOpen] = React.useState(true);
    return (
      <Modal open={open} onOpenChange={setOpen} size="lg">
        <Modal.Header title="Schema column wizard" />
        <Modal.Body>
          <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <input type="text" placeholder="Field 1" />
            <input type="text" placeholder="Field 2" />
          </div>
        </Modal.Body>
        <Modal.Footer>
          <button className="btn btn-secondary" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button className="btn btn-primary">Confirm</button>
        </Modal.Footer>
      </Modal>
    );
  },
};
