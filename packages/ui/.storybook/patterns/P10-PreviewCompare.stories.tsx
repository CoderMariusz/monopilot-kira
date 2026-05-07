/**
 * P10-PreviewCompare — MODAL-SCHEMA pattern template.
 *
 * Composition: Modal split into before/after panels (left/right) with Summary
 * primitive on the right and DryRunButton in the footer driving an idle →
 * loading → result/error state machine.
 *
 * Prototype ref: prototypes/design/Monopilot Design System/settings/modals.jsx:18-69
 * (rule_dry_run_modal).
 */
import type { Meta, StoryObj } from '@storybook/react';
import React, { useState } from 'react';
import Modal from '../../src/Modal';
import Summary from '../../src/Summary';
import { DryRunButton } from '../../src/DryRunButton';

type DryRunState = 'idle' | 'loading' | 'result' | 'error';

interface P10Props {
  initialState?: DryRunState;
  shouldFail?: boolean;
}

function P10PreviewCompareImpl({
  initialState = 'idle',
  shouldFail = false,
}: P10Props) {
  const [open, setOpen] = useState(true);
  const [state, setState] = useState<DryRunState>(initialState);

  const summaryRows = [
    { label: 'Status', after: 'RELEASED', before: 'PLANNED', status: 'changed' as const },
    { label: 'Owner', after: 'Operator A', status: 'unchanged' as const },
    { label: 'Sites', after: '3', before: '2', status: 'changed' as const },
  ];

  const runDryRun = () => {
    setState('loading');
    setTimeout(() => {
      setState(shouldFail ? 'error' : 'result');
    }, 200);
  };

  return (
    <Modal open={open} onOpenChange={setOpen} size="xl">
      <Modal.Header title="Dry run — rule preview" />
      <Modal.Body>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div data-testid="preview-left">
            <h3>Before</h3>
            <pre style={{ background: '#f3f4f6', padding: 10, fontSize: 11 }}>
              {JSON.stringify(
                { wo_id: 'WO-2026-00412', from: 'PLANNED', to: 'RELEASED' },
                null,
                2,
              )}
            </pre>
            {state === 'idle' && (
              <p data-testid="dry-run-state-idle">
                Click &ldquo;Dry Run&rdquo; to preview the evaluation.
              </p>
            )}
            {state === 'loading' && (
              <p data-testid="dry-run-state-loading">Evaluating…</p>
            )}
            {state === 'result' && (
              <p data-testid="dry-run-state-result">PASS</p>
            )}
            {state === 'error' && (
              <p data-testid="dry-run-state-error">Dry-run failed.</p>
            )}
          </div>
          <div data-testid="preview-right">
            <h3>After (summary)</h3>
            <Summary rows={summaryRows} />
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" onClick={() => setOpen(false)}>
          Close
        </button>
        <DryRunButton onClick={runDryRun} />
      </Modal.Footer>
    </Modal>
  );
}

const meta: Meta = { title: 'Patterns/P10-PreviewCompare' };
export default meta;

export const Default: StoryObj = {
  render: () => <P10PreviewCompareImpl />,
};

export const ErrorState: StoryObj = {
  render: () => <P10PreviewCompareImpl initialState="error" shouldFail={true} />,
};
