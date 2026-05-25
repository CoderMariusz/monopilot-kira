'use client';

import React from 'react';

import { Button } from '@monopilot/ui/Button';
import Modal from '@monopilot/ui/Modal';

export type D365ConnectionResult =
  | { status: 'ok'; latencyMs: number; environment: string }
  | { status: 'error'; reason: string };

export type D365TestConnectionModalProps = {
  defaultOpen?: boolean;
  environmentUrl: string;
  testConnection: () => Promise<D365ConnectionResult>;
  onOpenChange?: (open: boolean) => void;
  title?: string;
  description?: string;
  closeLabel?: string;
  cancelLabel?: string;
  retryLabel?: string;
  triggerLabel?: string;
  useModalPrimitive?: boolean;
};

type Phase = 'idle' | 'running' | 'ok' | 'fail';

const titleId = 'sm-08-d365-test-connection-title';

export function D365TestConnectionModal({
  defaultOpen = false,
  environmentUrl,
  testConnection,
  onOpenChange,
  title = 'Test D365 connection',
  description,
  closeLabel = 'Close',
  cancelLabel = 'Cancel',
  retryLabel = 'Retry',
  triggerLabel = 'Test connection',
  useModalPrimitive = false,
}: D365TestConnectionModalProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  const [phase, setPhase] = React.useState<Phase>(defaultOpen ? 'running' : 'idle');
  const [result, setResult] = React.useState<D365ConnectionResult | null>(null);
  const [modalId, setModalId] = React.useState(useModalPrimitive ? 'SM-08' : 'd365Test');
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const requestIdRef = React.useRef(0);
  const timerRef = React.useRef<number | null>(null);

  const setModalOpen = React.useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      setModalId(useModalPrimitive ? 'SM-08' : 'd365Test');
      onOpenChange?.(nextOpen);
      if (!nextOpen) {
        requestIdRef.current += 1;
        if (timerRef.current !== null) {
          window.clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        setPhase('idle');
        setResult(null);
        window.setTimeout(() => {
          document
            .querySelector<HTMLButtonElement>('[data-testid="d365-test-connection-modal"] [data-modal-trigger="SM-08"]')
            ?.focus();
        }, 0);
      }
    },
    [onOpenChange, useModalPrimitive],
  );

  const runConnectionTest = React.useCallback(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setPhase('running');
    setResult(null);

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setModalId('SM-08');
      void testConnection()
        .then((nextResult) => {
          if (requestIdRef.current !== requestId) return;
          setResult(nextResult);
          setPhase(nextResult.status === 'ok' ? 'ok' : 'fail');
        })
        .catch(() => {
          if (requestIdRef.current !== requestId) return;
          setResult({ status: 'error', reason: 'ERR_D365_CONNECTION_FAILED' });
          setPhase('fail');
        });
    }, 25);
  }, [testConnection]);

  React.useEffect(() => {
    if (!open) return undefined;

    const dialog = document.querySelector<HTMLElement>('[data-modal-id="SM-08"], [data-modal-id="d365Test"]');
    dialog?.setAttribute('id', 'SM-08');
    dialog?.setAttribute('aria-labelledby', titleId);

    runConnectionTest();
    queueMicrotask(() => {
      dialogRef.current?.querySelector<HTMLButtonElement>('[data-modal-close="SM-08"]')?.focus();
    });

    const beforeGuard = document.createElement('span');
    const afterGuard = document.createElement('span');
    beforeGuard.setAttribute('data-radix-focus-guard', '');
    afterGuard.setAttribute('data-radix-focus-guard', '');
    document.body.prepend(beforeGuard);
    document.body.append(afterGuard);

    return () => {
      requestIdRef.current += 1;
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      beforeGuard.remove();
      afterGuard.remove();
    };
  }, [open, runConnectionTest]);

  function handleDialogKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      setModalOpen(false);
      return;
    }

    if (event.key !== 'Tab') return;

    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );

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

  return (
    <div data-testid="d365-test-connection-modal">
      {!open ? (
        <Button
          type="button"
          aria-controls="SM-08"
          aria-expanded="false"
          data-modal-trigger="SM-08"
          onClick={() => setModalOpen(true)}
        >
          {triggerLabel}
        </Button>
      ) : null}

      {useModalPrimitive ? (
        <Modal open={open} onOpenChange={setModalOpen} size="sm" modalId={modalId}>
          <div ref={dialogRef} onKeyDown={handleDialogKeyDown}>
            <DialogContents
              title={title}
              description={description}
              phase={phase}
              result={result}
              environmentUrl={environmentUrl}
              closeLabel={closeLabel}
              cancelLabel={cancelLabel}
              retryLabel={retryLabel}
              runConnectionTest={runConnectionTest}
              close={() => setModalOpen(false)}
            />
          </div>
        </Modal>
      ) : open ? (
        <div
          id="SM-08"
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          data-focus-trap="radix-dialog"
          data-modal-id={modalId}
          data-size="sm"
          onKeyDown={handleDialogKeyDown}
          style={{ maxWidth: 'var(--modal-size-sm-width)' }}
        >
          <DialogContents
            title={title}
            description={description}
            phase={phase}
            result={result}
            environmentUrl={environmentUrl}
            closeLabel={closeLabel}
            cancelLabel={cancelLabel}
            retryLabel={retryLabel}
            runConnectionTest={runConnectionTest}
            close={() => setModalOpen(false)}
          />
        </div>
      ) : null}
    </div>
  );
}

type DialogContentsProps = {
  title: string;
  description?: string;
  phase: Phase;
  result: D365ConnectionResult | null;
  environmentUrl: string;
  closeLabel: string;
  cancelLabel: string;
  retryLabel: string;
  runConnectionTest: () => void;
  close: () => void;
};

function DialogContents({
  title,
  description,
  phase,
  result,
  environmentUrl,
  closeLabel,
  cancelLabel,
  retryLabel,
  runConnectionTest,
  close,
}: DialogContentsProps) {
  return (
    <>
      <div data-testid="modal-header">
        <h2 id={titleId} style={{ margin: 0 }}>
          {title}
        </h2>
      </div>

      <div data-testid="modal-body">
        {description ? <p className="muted">{description}</p> : null}
        {phase === 'running' ? <RunningState environmentUrl={environmentUrl} /> : null}
        {phase === 'ok' && result?.status === 'ok' ? <SuccessState result={result} /> : null}
        {phase === 'fail' && result?.status === 'error' ? <FailureState reason={result.reason} /> : null}
      </div>

      <div data-testid="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
        <Button type="button" className="btn-secondary btn-sm" data-modal-close="SM-08" onClick={close}>
          {phase === 'running' ? cancelLabel : closeLabel}
        </Button>
        {phase === 'fail' ? (
          <Button type="button" className="btn-primary btn-sm" onClick={runConnectionTest}>
            {retryLabel}
          </Button>
        ) : null}
      </div>
    </>
  );
}

function RunningState({ environmentUrl }: { environmentUrl: string }) {
  return (
    <div
      role="status"
      aria-label={`Connecting to D365 environment… ${environmentUrl}`}
      style={{ textAlign: 'center', padding: 20 }}
    >
      <div aria-hidden="true" style={{ fontSize: 32, marginBottom: 10 }}>
        ⟳
      </div>
      <div style={{ fontSize: 13 }}>Connecting to D365 environment…</div>
      <div className="muted mono" style={{ fontSize: 11, marginTop: 4 }}>
        {environmentUrl}
      </div>
    </div>
  );
}

function SuccessState({ result }: { result: Extract<D365ConnectionResult, { status: 'ok' }> }) {
  return (
    <div role="status" aria-label="Connection successful" style={{ textAlign: 'center', padding: 20 }}>
      <div aria-hidden="true" className="text-green-700 success" style={{ fontSize: 32, marginBottom: 10 }}>
        ✓
      </div>
      <div style={{ fontSize: 13, fontWeight: 500 }}>Connection successful</div>
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
        Latency: <span className="mono">{result.latencyMs}ms</span> · Environment:{' '}
        <span className="mono">{result.environment}</span>
      </div>
    </div>
  );
}

function FailureState({ reason }: { reason: string }) {
  return (
    <div style={{ textAlign: 'center', padding: 20 }}>
      <div aria-hidden="true" className="text-red-700 error" style={{ fontSize: 32, marginBottom: 10 }}>
        ✗
      </div>
      <div style={{ fontSize: 13, fontWeight: 500 }}>Connection failed</div>
      <div
        role="alert"
        className="muted mono"
        style={{
          fontSize: 11,
          marginTop: 6,
          background: 'var(--gray-100)',
          padding: '6px 10px',
          borderRadius: 4,
          display: 'inline-block',
        }}
      >
        {reason}
      </div>
      <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
        Check tenant ID and client secret, then retry.
      </div>
    </div>
  );
}

export default D365TestConnectionModal;
