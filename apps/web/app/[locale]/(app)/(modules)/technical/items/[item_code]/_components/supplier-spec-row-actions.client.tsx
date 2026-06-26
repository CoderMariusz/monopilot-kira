'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

import Input from '@monopilot/ui/Input';

import type { SupplierSpecRow } from '../_actions/list-supplier-specs';
import type {
  DeactivateItemSupplierSpecResult,
  SupplierSpecActionError,
  UpdateItemSupplierSpecResult,
} from '../../_actions/supplier-spec-actions';

export type SupplierSpecRowActionsLabels = {
  edit: string;
  deactivate: string;
  editTitle: string;
  editSubtitle: string;
  specVersion: string;
  issuedDate: string;
  effectiveFrom: string;
  expiryDate: string;
  approveNow: string;
  submit: string;
  submitting: string;
  cancel: string;
  success: string;
  deactivateTitle: string;
  deactivateBody: string;
  deactivateWarnActive: string;
  deactivateConfirm: string;
  deactivateCancel: string;
  deactivateSuccess: string;
  errors: Record<SupplierSpecActionError, string>;
};

export interface SupplierSpecRowActionsProps {
  spec: SupplierSpecRow;
  labels: SupplierSpecRowActionsLabels;
  updateSpec: (input: unknown) => Promise<UpdateItemSupplierSpecResult>;
  deactivateSpec: (specId: unknown) => Promise<DeactivateItemSupplierSpecResult>;
}

function asDateInput(value: string | null): string {
  return value ? value.slice(0, 10) : '';
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="ff" style={{ display: 'block', marginBottom: 10 }}>
      <span className="ff-label">{label}</span>
      {children}
    </label>
  );
}

function Modal({
  onClose,
  title,
  subtitle,
  children,
  footer,
  testId,
}: {
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  testId: string;
}) {
  const titleId = React.useId();
  const contentRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    contentRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="modal-box outline-none"
        onMouseDown={(event) => event.stopPropagation()}
        data-testid={testId}
      >
        <div className="modal-head">
          <div>
            <div id={titleId} className="modal-title">
              {title}
            </div>
            {subtitle ? (
              <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                {subtitle}
              </div>
            ) : null}
          </div>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-foot">{footer}</div>
      </div>
    </div>
  );
}

export function SupplierSpecRowActions({
  spec,
  labels,
  updateSpec,
  deactivateSpec,
}: SupplierSpecRowActionsProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = React.useState(false);
  const [deactivateOpen, setDeactivateOpen] = React.useState(false);
  const [specVersion, setSpecVersion] = React.useState(spec.specVersion);
  const [issuedDate, setIssuedDate] = React.useState(asDateInput(spec.issuedDate));
  const [effectiveFrom, setEffectiveFrom] = React.useState(asDateInput(spec.effectiveFrom));
  const [expiryDate, setExpiryDate] = React.useState(asDateInput(spec.expiryDate));
  const [approveNow, setApproveNow] = React.useState(
    spec.reviewStatus === 'approved' && spec.lifecycleStatus === 'active',
  );
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const canDeactivate = !['superseded', 'blocked', 'expired'].includes(spec.lifecycleStatus);

  function resetEdit() {
    setSpecVersion(spec.specVersion);
    setIssuedDate(asDateInput(spec.issuedDate));
    setEffectiveFrom(asDateInput(spec.effectiveFrom));
    setExpiryDate(asDateInput(spec.expiryDate));
    setApproveNow(spec.reviewStatus === 'approved' && spec.lifecycleStatus === 'active');
    setError(null);
    setSuccess(null);
  }

  function closeEdit() {
    setEditOpen(false);
    resetEdit();
  }

  function closeDeactivate() {
    setDeactivateOpen(false);
    setError(null);
    setSuccess(null);
  }

  function submitEdit() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await updateSpec({
        specId: spec.id,
        specVersion: specVersion.trim() || undefined,
        issuedDate: issuedDate || undefined,
        effectiveFrom: effectiveFrom || undefined,
        expiryDate: expiryDate || undefined,
        approveNow,
      });
      if (!result.ok) {
        setError(labels.errors[result.error] ?? labels.errors.persistence_failed);
        return;
      }
      setSuccess(labels.success);
      router.refresh();
      window.setTimeout(() => closeEdit(), 1200);
    });
  }

  function submitDeactivate() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await deactivateSpec(spec.id);
      if (!result.ok) {
        setError(labels.errors[result.error] ?? labels.errors.persistence_failed);
        return;
      }
      setSuccess(labels.deactivateSuccess);
      router.refresh();
      window.setTimeout(() => closeDeactivate(), 1200);
    });
  }

  return (
    <>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => {
            resetEdit();
            setEditOpen(true);
          }}
        >
          {labels.edit}
        </button>
        {canDeactivate ? (
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={() => {
              setError(null);
              setSuccess(null);
              setDeactivateOpen(true);
            }}
          >
            {labels.deactivate}
          </button>
        ) : null}
      </div>

      {editOpen ? (
        <Modal
          onClose={closeEdit}
          title={labels.editTitle}
          subtitle={labels.editSubtitle}
          testId="supplier-spec-edit-modal"
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={closeEdit} disabled={pending}>
                {labels.cancel}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={submitEdit}
                disabled={pending}
                data-testid="supplier-spec-edit-submit"
              >
                {pending ? labels.submitting : labels.submit}
              </button>
            </>
          }
        >
          {error ? (
            <div role="alert" className="alert alert-red" style={{ marginBottom: 10 }}>
              <div className="alert-title">{error}</div>
            </div>
          ) : null}
          {success ? (
            <div role="status" className="alert alert-green" style={{ marginBottom: 10 }}>
              <div className="alert-title">{success}</div>
            </div>
          ) : null}

          <Field label={labels.specVersion}>
            <Input
              value={specVersion}
              onChange={(e) => setSpecVersion(e.target.value)}
              aria-label={labels.specVersion}
            />
          </Field>
          <Field label={labels.issuedDate}>
            <Input
              type="date"
              value={issuedDate}
              onChange={(e) => setIssuedDate(e.target.value)}
              aria-label={labels.issuedDate}
            />
          </Field>
          <div className="ff-inline">
            <Field label={labels.effectiveFrom}>
              <Input
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
                aria-label={labels.effectiveFrom}
              />
            </Field>
            <Field label={labels.expiryDate}>
              <Input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                aria-label={labels.expiryDate}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2" style={{ marginTop: 4, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={approveNow}
              onChange={(e) => setApproveNow(e.target.checked)}
              data-testid="supplier-spec-edit-approve"
            />
            <span>{labels.approveNow}</span>
          </label>
        </Modal>
      ) : null}

      {deactivateOpen ? (
        <Modal
          onClose={closeDeactivate}
          title={labels.deactivateTitle}
          testId="supplier-spec-deactivate-modal"
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={closeDeactivate} disabled={pending}>
                {labels.deactivateCancel}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={submitDeactivate}
                disabled={pending}
                data-testid="supplier-spec-deactivate-submit"
              >
                {pending ? labels.submitting : labels.deactivateConfirm}
              </button>
            </>
          }
        >
          {error ? (
            <div role="alert" className="alert alert-red" style={{ marginBottom: 10 }}>
              <div className="alert-title">{error}</div>
            </div>
          ) : null}
          {success ? (
            <div role="status" className="alert alert-green" style={{ marginBottom: 10 }}>
              <div className="alert-title">{success}</div>
            </div>
          ) : null}
          <p className="text-sm" style={{ marginBottom: 10 }}>
            {labels.deactivateBody}
          </p>
          {spec.lifecycleStatus === 'active' && spec.reviewStatus === 'approved' ? (
            <div role="alert" className="alert alert-amber">
              <div className="alert-title">{labels.deactivateWarnActive}</div>
            </div>
          ) : null}
        </Modal>
      ) : null}
    </>
  );
}
