'use client';

import React from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import Textarea from '@monopilot/ui/Textarea';

type RuleDryRunStatus = 'pass' | 'fail';

export type RuleDryRunResult = {
  status: RuleDryRunStatus;
  warnings: string[];
  trace: string[];
  evaluatedAt: string;
};

export type RuleDryRunModalProps = {
  defaultOpen?: boolean;
  rule?: {
    code: string;
    name?: string;
    description?: string;
  };
  initialSampleInput?: Record<string, unknown>;
  runDryRun: (input: {
    ruleCode: string;
    sampleInput: Record<string, unknown>;
  }) => Promise<RuleDryRunResult>;
  onOpenChange?: (open: boolean) => void;
};

const DEFAULT_RULE = {
  code: 'rule',
  name: 'Rule',
};

const DEFAULT_SAMPLE_INPUT = {
  wo_id: 'WO-2026-00412',
  from: 'PLANNED',
  to: 'RELEASED',
};

function prettyJson(value: Record<string, unknown>) {
  return JSON.stringify(value, null, 2);
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function RuleDryRunModal({
  defaultOpen = false,
  rule = DEFAULT_RULE,
  initialSampleInput = DEFAULT_SAMPLE_INPUT,
  runDryRun,
  onOpenChange,
}: RuleDryRunModalProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  const [input, setInput] = React.useState(() => prettyJson(initialSampleInput));
  const [running, setRunning] = React.useState(false);
  const [result, setResult] = React.useState<RuleDryRunResult | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const sampleInputRef = React.useRef<HTMLTextAreaElement>(null);
  const titleId = 'sm-01-rule-dry-run-title';
  const subtitleId = 'sm-01-rule-dry-run-subtitle';
  const inputId = 'sm-01-rule-dry-run-sample-input';
  const inputErrorId = 'sm-01-rule-dry-run-input-error';
  const resultId = 'sm-01-rule-dry-run-result';

  const parsedInput = React.useMemo(() => parseJsonObject(input), [input]);
  const valid = parsedInput !== null;
  const runDisabled = !valid || running;

  React.useEffect(() => {
    if (!open) return undefined;

    queueMicrotask(() => sampleInputRef.current?.focus());

    const beforeGuard = document.createElement('span');
    const afterGuard = document.createElement('span');
    beforeGuard.setAttribute('data-radix-focus-guard', '');
    afterGuard.setAttribute('data-radix-focus-guard', '');
    document.body.prepend(beforeGuard);
    document.body.append(afterGuard);

    return () => {
      beforeGuard.remove();
      afterGuard.remove();
    };
  }, [open]);

  function setModalOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }

  function handleDialogKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      setModalOpen(false);
      return;
    }

    if (event.key !== 'Tab') return;

    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    ).filter((node) => !node.hasAttribute('aria-hidden'));

    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleRunDryRun() {
    if (!parsedInput || running) return;

    const sampleInput = parsedInput;
    setRunning(true);
    setResult(null);
    setActionError(null);

    window.setTimeout(() => {
      void runDryRun({ ruleCode: rule.code, sampleInput })
        .then((nextResult) => {
          setResult(nextResult);
        })
        .catch(() => {
          setActionError('Unable to run dry-run.');
        })
        .finally(() => {
          setRunning(false);
        });
    }, 25);
  }

  return (
    <div data-testid="rule-dry-run-modal">
      {!open ? (
        <Button type="button" aria-controls="SM-01" aria-expanded="false" onClick={() => setModalOpen(true)}>
          Dry-run
        </Button>
      ) : null}

      {open ? (
        <div
          id="SM-01"
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={subtitleId}
          data-focus-trap="radix-dialog"
          data-modal-id="SM-01"
          data-size="wide"
          onKeyDown={handleDialogKeyDown}
          style={{ maxWidth: 'var(--modal-size-wide-width)' }}
        >
          <div data-testid="modal-header">
            <h2 id={titleId} style={{ margin: 0 }}>
              Dry-run — {rule.code}
            </h2>
            <p id={subtitleId}>Preview the rule evaluation against sample input without persisting.</p>
          </div>

          <div
            data-testid="rule-dry-run-grid"
            data-layout="two-column"
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}
          >
            <div>
              <label htmlFor={inputId}>
                Sample input (JSON) <span aria-hidden="true">*</span>
              </label>
              <Textarea
                ref={sampleInputRef}
                id={inputId}
                value={input}
                onChange={(event) => {
                  setInput(event.target.value);
                  setResult(null);
                  setActionError(null);
                }}
                aria-invalid={!valid ? 'true' : undefined}
                aria-describedby={!valid ? inputErrorId : undefined}
                className="font-mono mono"
                style={{ minHeight: 220, fontFamily: 'var(--font-mono)', fontSize: 11 }}
              />
              {!valid ? (
                <div id={inputErrorId} role="alert">
                  Invalid JSON
                </div>
              ) : null}
            </div>

            <div>
              <label id={`${resultId}-label`}>Result</label>
              <section
                id={resultId}
                role="region"
                aria-labelledby={`${resultId}-label`}
                aria-live="polite"
                aria-busy={running ? 'true' : undefined}
              >
                {!result && !running && !actionError ? (
                  <div
                    style={{
                      padding: 20,
                      textAlign: 'center',
                      background: 'var(--gray-050)',
                      borderRadius: 6,
                    }}
                  >
                    Run the rule to see the result.
                  </div>
                ) : null}

                {running ? (
                  <div role="status" aria-label="Evaluating rule dry-run" style={{ padding: 20, textAlign: 'center' }}>
                    ⟳ Evaluating…
                  </div>
                ) : null}

                {actionError ? <div role="alert">{actionError}</div> : null}

                {result ? (
                  <div>
                    <div style={{ marginBottom: 8 }}>
                      <Badge
                        variant={result.status === 'pass' ? 'success' : 'destructive'}
                        className={result.status === 'pass' ? 'badge-green success' : 'badge-red destructive'}
                      >
                        {result.status === 'pass' ? 'PASS' : 'FAIL'}
                      </Badge>
                      <span className="muted mono" style={{ marginLeft: 8, fontSize: 11 }}>
                        {result.evaluatedAt}
                      </span>
                    </div>
                    <pre
                      data-testid="rule-dry-run-result-json"
                      className="mono"
                      style={{ background: 'var(--gray-100)', padding: 10, borderRadius: 6, fontSize: 11, margin: 0 }}
                    >
                      {JSON.stringify(result, null, 2)}
                    </pre>
                  </div>
                ) : null}
              </section>
            </div>
          </div>

          <div data-testid="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <Button type="button" onClick={() => setModalOpen(false)}>
              Close
            </Button>
            <Button type="button" variant="dry-run" disabled={runDisabled} onClick={handleRunDryRun}>
              Run dry-run
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default RuleDryRunModal;
