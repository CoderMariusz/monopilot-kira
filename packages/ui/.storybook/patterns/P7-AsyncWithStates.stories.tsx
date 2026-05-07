/**
 * P7-AsyncWithStates — MODAL-SCHEMA pattern template.
 *
 * Composition: Modal whose primary action steps through idle → loading → success | error.
 */
import type { Meta, StoryObj } from '@storybook/react';
import React, { useState } from 'react';
import Modal from '../../src/Modal';

type AsyncState = 'idle' | 'loading' | 'success' | 'error';

function P7AsyncImpl({ initialState = 'idle' as AsyncState }) {
  const [open, setOpen] = useState(true);
  const [state, setState] = useState<AsyncState>(initialState);

  const run = () => {
    setState('loading');
    setTimeout(() => setState('success'), 200);
  };

  return (
    <Modal open={open} onOpenChange={setOpen} size="md">
      <Modal.Header title="Sync data" />
      <Modal.Body>
        {state === 'idle' && <p data-testid="async-state-idle">Click Run to start.</p>}
        {state === 'loading' && <p data-testid="async-state-loading">Working…</p>}
        {state === 'success' && <p data-testid="async-state-success">Done.</p>}
        {state === 'error' && <p data-testid="async-state-error">Something went wrong.</p>}
      </Modal.Body>
      <Modal.Footer>
        <button type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button type="button" onClick={run} aria-disabled={state === 'loading' ? 'true' : undefined}>
          Run
        </button>
      </Modal.Footer>
    </Modal>
  );
}

const meta: Meta = { title: 'Patterns/P7-AsyncWithStates' };
export default meta;

export const Default: StoryObj = {
  render: () => <P7AsyncImpl />,
};

export const ErrorStory: StoryObj = {
  render: () => <P7AsyncImpl initialState="error" />,
};
