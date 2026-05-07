/**
 * P3-DualPath — MODAL-SCHEMA pattern template.
 *
 * Composition: Modal with two distinct primary actions (Save Draft / Publish).
 */
import type { Meta, StoryObj } from '@storybook/react';
import React, { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import Modal from '../../src/Modal';
import Field from '../../src/Field';

function P3DualPathImpl() {
  const [open, setOpen] = useState(true);
  const methods = useForm({ defaultValues: { title: '' } });

  return (
    <FormProvider {...methods}>
      <Modal open={open} onOpenChange={setOpen} size="md">
        <Modal.Header title="Publish article" />
        <Modal.Body>
          <Field name="title" label="Article title" required />
        </Modal.Body>
        <Modal.Footer>
          <button type="button" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button type="button" data-action="save-draft" onClick={() => setOpen(false)}>
            Save Draft
          </button>
          <button type="button" data-action="publish" onClick={() => setOpen(false)}>
            Publish
          </button>
        </Modal.Footer>
      </Modal>
    </FormProvider>
  );
}

const meta: Meta = { title: 'Patterns/P3-DualPath' };
export default meta;

export const Default: StoryObj = {
  render: () => <P3DualPathImpl />,
};
