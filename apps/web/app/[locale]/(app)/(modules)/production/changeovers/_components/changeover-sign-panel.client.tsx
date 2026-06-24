'use client';

/**
 * B-2 — Dual-sign panel + e-sign password modal (client island).
 *
 * Prototype parity (1:1):
 *   prototypes/design/Monopilot Design System/production/other-screens.jsx:364-385
 *     (ChangeoverScreen step 4 "Dual sign-off · Shift Lead + Quality") — two
 *     signature slots showing the signer name + meta;
 *   production/modals.jsx:315-336 (ChangeoverGateModal "sign gate") — the
 *     sign-&-advance gate with per-slot signer + credential field.
 *
 * DEVIATION (red-line, mirrors spec-sign-modal / hold-release-modal): the
 * prototype's 4-digit numeric PIN (`maxLength={4}` boxes, modals.jsx:332) is
 * replaced by the backend's account-PASSWORD signature (signChangeover verifies
 * the password). Signer identity + server time are resolved server-side; the
 * client never fakes them. Slot eligibility (wrong_role / same_user) is enforced
 * SERVER-side in signChangeover — this island never trusts a client flag and
 * surfaces the slot-aware error code mapped to copy.
 *
 * Reuses the e-sign password-modal pattern from the quality holds-release /
 * spec-sign modals (Modal + password Input + verbatim error banner).
 */

import { useState, useTransition } from 'react';

import { Badge } from '@monopilot/ui/Badge';
import Modal from '@monopilot/ui/Modal';

import type {
  ChangeoverListRow,
  SignChangeoverError,
  SignChangeoverFn,
} from './changeovers-contract';
import type { ChangeoverSignLabels } from './labels';

type Slot = 'first' | 'second';

// `signedAt` is a server-derived timestamp string. Guard before formatting so a
// non-standard / unparseable value can't throw `RangeError` from `toISOString()`
// during render and blank the panel — matches the production-module date idiom
// (`if (Number.isNaN(d.getTime())) return '—'`).
function formatSignedAt(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

function SignatureSlot({
  title,
  signer,
  labels,
}: {
  title: string;
  signer: ChangeoverListRow['firstSigner'];
  labels: ChangeoverSignLabels;
}) {
  return (
    <div
      data-testid={`changeover-sign-slot`}
      className={`rounded-md border px-3 py-3 ${
        signer ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50'
      }`}
    >
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
        {title} {signer ? <span aria-hidden className="text-emerald-600">✓</span> : null}
      </h4>
      {signer ? (
        <div className="mt-1 text-sm">
          <div className="font-medium text-slate-800">{signer.name}</div>
          <div className="text-[11px] text-slate-500">
            {labels.signedAt}: {formatSignedAt(signer.signedAt)}
          </div>
        </div>
      ) : (
        <div className="mt-1 text-sm text-slate-400">{labels.awaiting}</div>
      )}
    </div>
  );
}

export function ChangeoverSignPanel({
  row,
  labels,
  signChangeoverAction,
  onSigned,
}: {
  row: ChangeoverListRow;
  labels: ChangeoverSignLabels;
  signChangeoverAction: SignChangeoverFn;
  onSigned?: () => void;
}) {
  const [openSlot, setOpenSlot] = useState<Slot | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isComplete = row.dualSignOffStatus === 'complete';
  // First slot is signable until the first signature lands; second slot opens
  // only after the first is signed (server re-checks state regardless).
  const canSignFirst = !row.firstSigner && !isComplete;
  const canSignSecond = Boolean(row.firstSigner) && !row.secondSigner && !isComplete;

  function mapError(code: SignChangeoverError): string {
    switch (code) {
      case 'forbidden':
        return labels.errors.forbidden;
      case 'wrong_role':
        return labels.errors.wrong_role;
      case 'same_user':
        return labels.errors.same_user;
      case 'invalid_state':
        return labels.errors.invalid_state;
      case 'esign_failed':
        return labels.errors.esign_failed;
      default:
        return labels.errors.generic;
    }
  }

  function close() {
    setOpenSlot(null);
    setPassword('');
    setError(null);
  }

  function submit() {
    setError(null);
    if (password.length === 0) {
      setError(labels.esign.passwordRequired);
      return;
    }
    startTransition(async () => {
      const result = await signChangeoverAction({
        changeoverId: row.id,
        signature: { password },
      });
      if (!result.ok) {
        setError(mapError(result.error));
        return;
      }
      close();
      onSigned?.();
    });
  }

  return (
    <section
      data-testid={`changeover-sign-panel-${row.id}`}
      className="rounded-xl border border-slate-200 bg-white p-4"
    >
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">{labels.title}</h3>
        <Badge
          variant={isComplete ? 'success' : row.firstSigner ? 'warning' : 'muted'}
          data-testid={`changeover-sign-status-${row.id}`}
        >
          {labels.subtitle}
        </Badge>
      </header>

      {isComplete ? (
        <div
          role="status"
          data-testid={`changeover-sign-complete-${row.id}`}
          className="mb-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800"
        >
          ✓ {labels.completeBanner}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <SignatureSlot title={labels.firstSlot} signer={row.firstSigner} labels={labels} />
        <SignatureSlot title={labels.secondSlot} signer={row.secondSigner} labels={labels} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {canSignFirst ? (
          <button
            type="button"
            data-testid={`changeover-sign-first-${row.id}`}
            onClick={() => {
              setError(null);
              setPassword('');
              setOpenSlot('first');
            }}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            {labels.signFirst}
          </button>
        ) : null}
        {canSignSecond ? (
          <button
            type="button"
            data-testid={`changeover-sign-second-${row.id}`}
            onClick={() => {
              setError(null);
              setPassword('');
              setOpenSlot('second');
            }}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            {labels.signSecond}
          </button>
        ) : null}
      </div>

      <Modal
        open={openSlot !== null}
        onOpenChange={(n) => (n ? undefined : close())}
        size="sm"
        modalId="changeover_sign_modal"
        dismissible={!pending}
      >
        <Modal.Header title={openSlot === 'second' ? labels.signSecond : labels.signFirst} />
        <Modal.Body>
          <div data-testid="changeover-sign-form" className="flex flex-col gap-4 text-sm">
            <div
              role="note"
              className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800"
            >
              ⓘ {labels.esign.meaning}
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {labels.esign.title}
              </div>
              <label className="mt-2 flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-700">
                  {labels.esign.password} <span aria-hidden className="text-red-500">*</span>
                </span>
                <input
                  type="password"
                  data-testid="changeover-sign-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={labels.esign.passwordPlaceholder}
                  autoComplete="current-password"
                  className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
                />
              </label>
              <p className="mt-1 text-[10px] leading-snug text-slate-400">{labels.esign.passwordHelp}</p>
            </div>
            {error ? (
              <p role="alert" data-testid="changeover-sign-error" className="text-sm text-red-600">
                {error}
              </p>
            ) : null}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            data-testid="changeover-sign-cancel"
            onClick={close}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50"
          >
            {labels.esign.cancel}
          </button>
          <button
            type="button"
            data-testid="changeover-sign-submit"
            disabled={password.length === 0 || pending}
            onClick={submit}
            className="rounded-md bg-indigo-700 px-3 py-1.5 text-sm font-medium text-white transition enabled:hover:bg-indigo-800 disabled:opacity-50"
          >
            {pending ? labels.esign.submitting : labels.esign.submit}
          </button>
        </Modal.Footer>
      </Modal>
    </section>
  );
}
