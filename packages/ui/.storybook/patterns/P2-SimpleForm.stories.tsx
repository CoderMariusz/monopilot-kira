/**
 * P2-SimpleForm — MODAL-SCHEMA pattern template.
 *
 * Composition: Modal + Field rows + Footer (Cancel, Save).
 */
import type { Meta, StoryObj } from '@storybook/react';
import React, { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import Modal from '../../src/Modal';
import Field from '../../src/Field';

function P2SimpleFormImpl() {
  const [open, setOpen] = useState(true);
  const methods = useForm({ defaultValues: { name: '', description: '' } });

  return (
    <FormProvider {...methods}>
      <Modal open={open} onOpenChange={setOpen} size="md">
        <Modal.Header title="Create resource" />
        <Modal.Body>
          <form>
            <Field name="name" label="Name" required hint="Resource display name" />
            <Field name="description" label="Description" hint="Optional details" />
          </form>
        </Modal.Body>
        <Modal.Footer>
          <button type="button" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button type="button" onClick={() => setOpen(false)}>
            Save
          </button>
        </Modal.Footer>
      </Modal>
    </FormProvider>
  );
}

const meta: Meta = { title: 'Patterns/P2-SimpleForm' };
export default meta;

export const Default: StoryObj = {
  render: () => <P2SimpleFormImpl />,
};
