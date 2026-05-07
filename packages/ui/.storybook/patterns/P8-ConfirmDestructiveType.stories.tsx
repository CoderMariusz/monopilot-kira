/**
 * P8-ConfirmDestructiveType — MODAL-SCHEMA pattern template.
 *
 * Composition: Modal + Field requiring exact-text confirmation + destructive button.
 */
import type { Meta, StoryObj } from '@storybook/react';
import React, { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import Modal from '../../src/Modal';
import Field from '../../src/Field';

const RESOURCE_NAME = 'production-db';

function P8ConfirmTypeImpl() {
  const [open, setOpen] = useState(true);
  const methods = useForm({ defaultValues: { confirmText: '' } });

  const typed = methods.watch('confirmText');
  const matches = typed === RESOURCE_NAME;

  return (
    <FormProvider {...methods}>
      <Modal open={open} onOpenChange={setOpen} size="md">
        <Modal.Header title="Delete resource" />
        <Modal.Body>
          <p>
            This will permanently delete <strong>{RESOURCE_NAME}</strong>. Type the
            resource name to confirm.
          </p>
          <Field
            name="confirmText"
            label="Resource name"
            required
            hint={`Type "${RESOURCE_NAME}" to enable the delete button`}
          />
        </Modal.Body>
        <Modal.Footer>
          <button type="button" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button
            type="button"
            data-variant="destructive"
            aria-disabled={!matches ? 'true' : undefined}
            onClick={() => setOpen(false)}
          >
            Delete
          </button>
        </Modal.Footer>
      </Modal>
    </FormProvider>
  );
}

const meta: Meta = { title: 'Patterns/P8-ConfirmDestructiveType' };
export default meta;

export const Default: StoryObj = {
  render: () => <P8ConfirmTypeImpl />,
};
