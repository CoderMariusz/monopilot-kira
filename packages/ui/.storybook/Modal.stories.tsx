/**
 * Modal stories — covers the Radix Dialog wrapper used for Invite User and
 * other access-screen flows. See packages/ui/src/Modal.tsx.
 */
import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import Modal, { type ModalSize } from '../src/Modal';

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

function InviteModalStory({ size }: { size: ModalSize }) {
  const [open, setOpen] = React.useState(true);
  return (
    <div style={{ padding: '2rem' }}>
      <button type="button" onClick={() => setOpen(true)}>
        Open invite modal
      </button>
      <Modal open={open} onOpenChange={setOpen} size={size}>
        <Modal.Header title="Invite user" />
        <Modal.Body>
          <div className="field">
            <label htmlFor={`invite-email-${size}`}>Email address</label>
            <input id={`invite-email-${size}`} type="email" />
          </div>
          <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <div className="field">
              <label htmlFor={`invite-role-${size}`}>Role</label>
              <select id={`invite-role-${size}`}>
                <option>Manager</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor={`invite-site-${size}`}>Site</label>
              <select id={`invite-site-${size}`}>
                <option>Kraków HQ</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor={`invite-message-${size}`}>Personal message (optional)</label>
            <textarea id={`invite-message-${size}`} rows={2} />
          </div>
          <div className="alert alert-blue">They&apos;ll receive an email with a magic link.</div>
        </Modal.Body>
        <Modal.Footer>
          <button className="btn btn-secondary" type="button" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button className="btn btn-primary" type="button">
            Send invitation
          </button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

export const Small: Story = {
  render: () => <InviteModalStory size="sm" />,
};

export const Medium: Story = {
  render: () => <InviteModalStory size="md" />,
};

export const Large: Story = {
  render: () => <InviteModalStory size="lg" />,
};

export const ExtraLarge: Story = {
  render: () => <InviteModalStory size="xl" />,
};
