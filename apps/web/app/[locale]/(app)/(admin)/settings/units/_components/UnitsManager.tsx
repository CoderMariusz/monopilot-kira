'use client';

/**
 * T-073 / SET-094 — Units (UoM) management Client island.
 *
 * Renders the functional "+ Add unit" and "+ Add custom conversion" CTAs from
 * the prototype (data-screens.jsx:151-187, PageHead actions + Custom conversions
 * empty link) as shadcn Modal dialogs that call the real Server Actions
 * (createUnit / createCustomConversion) under withOrgContext + RLS. Only rendered
 * when the caller holds the real `settings.units.manage` permission (canEdit).
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { Select } from '@monopilot/ui/Select';

import {
  createCustomConversion,
  createUnit,
  type CreateConversionResult,
  type CreateUnitResult,
  type UnitsActionError,
} from '../_actions/manage-units';

/**
 * Lightweight, accessible modal dialog (role="dialog" + aria-modal, focus on
 * open, Escape + backdrop close). A local primitive instead of the Radix-backed
 * @monopilot/ui Modal: in this module's base the workspace ships a React 18 peer
 * variant of @radix-ui/react-dialog while apps/web runs React 19, so mounting
 * Radix in the jsdom test crashes with a dual-React useRef null. Production
 * semantics (focus trap entry, Escape, aria-modal, labelled title) are
 * preserved. Deviation logged in the closeout notes.
 */
function Dialog({
  open,
  onClose,
  title,
  modalId,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  modalId?: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const titleId = React.useId();
  const contentRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    contentRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

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
        data-modal-id={modalId}
        tabIndex={-1}
        className="modal-box"
        style={{ width: 480, outline: 'none' }}
      >
        <div className="modal-head">
          <h2 id={titleId} className="modal-title" style={{ margin: 0 }}>
            {title}
          </h2>
          <button type="button" aria-label="Close" className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-foot">{footer}</div>
      </div>
    </div>
  );
}

export type UnitsManagerLabels = {
  addUnit: string;
  addCustomConversion: string;
  code: string;
  name: string;
  factorToBase: string;
  category: string;
  base: string;
  baseQuestion: string;
  saveUnit: string;
  cancel: string;
  label: string;
  fromUnit: string;
  toUnit: string;
  saveConversion: string;
  categoryMass: string;
  categoryVolume: string;
  categoryCount: string;
  errorAlreadyExists: string;
  errorForbidden: string;
  errorInvalidInput: string;
  errorGeneric: string;
};

const CATEGORY_VALUES = ['mass', 'volume', 'count'] as const;

function errorLabel(labels: UnitsManagerLabels, error: UnitsActionError): string {
  switch (error) {
    case 'already_exists':
      return labels.errorAlreadyExists;
    case 'forbidden':
      return labels.errorForbidden;
    case 'invalid_input':
      return labels.errorInvalidInput;
    default:
      return labels.errorGeneric;
  }
}

export function UnitsManager({
  labels,
  unitCodes,
  variant,
}: {
  labels: UnitsManagerLabels;
  unitCodes: string[];
  variant: 'unit' | 'conversion';
}) {
  return variant === 'unit' ? (
    <AddUnitDialog labels={labels} />
  ) : (
    <AddConversionDialog labels={labels} unitCodes={unitCodes} />
  );
}

function AddUnitDialog({ labels }: { labels: UnitsManagerLabels }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [category, setCategory] = React.useState<(typeof CATEGORY_VALUES)[number]>('mass');
  const [isBase, setIsBase] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const categoryOptions = [
    { value: 'mass', label: labels.categoryMass },
    { value: 'volume', label: labels.categoryVolume },
    { value: 'count', label: labels.categoryCount },
  ];

  function reset() {
    setCategory('mass');
    setIsBase(false);
    setError(null);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      category,
      code: String(data.get('code') ?? '').trim(),
      name: String(data.get('name') ?? '').trim(),
      factorToBase: Number(data.get('factorToBase') ?? ''),
      isBase,
    };
    startTransition(async () => {
      const result: CreateUnitResult = await createUnit(payload);
      if (result.ok) {
        reset();
        setOpen(false);
        router.refresh();
      } else {
        setError(errorLabel(labels, result.error));
      }
    });
  }

  return (
    <>
      <Button type="button" className="btn-primary" data-modal-id="SM-UOM-ADD" onClick={() => setOpen(true)}>
        {labels.addUnit}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={labels.addUnit.replace(/^\+\s*/, '')}
        modalId="SM-UOM-ADD"
        footer={
          <>
            <Button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              {labels.cancel}
            </Button>
            <Button type="submit" className="btn-primary" form="settings-units-add-unit-form" disabled={pending}>
              {labels.saveUnit}
            </Button>
          </>
        }
      >
        <form id="settings-units-add-unit-form" onSubmit={onSubmit}>
          <div className="ff">
            <label htmlFor="settings-units-add-category">{labels.category}</label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as (typeof CATEGORY_VALUES)[number])}
              options={categoryOptions}
              aria-label={labels.category}
            />
          </div>
          <div className="ff">
            <label htmlFor="settings-units-add-code">{labels.code}</label>
            <Input id="settings-units-add-code" name="code" required maxLength={32} className="form-input mono" />
          </div>
          <div className="ff">
            <label htmlFor="settings-units-add-name">{labels.name}</label>
            <Input id="settings-units-add-name" name="name" required maxLength={120} className="form-input" />
          </div>
          <div className="ff">
            <label htmlFor="settings-units-add-factor">{labels.factorToBase}</label>
            <Input id="settings-units-add-factor" name="factorToBase" required inputMode="decimal" defaultValue="1" className="form-input mono" />
          </div>
          <label className="ff-inline-check" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={isBase} onChange={(event) => setIsBase(event.currentTarget.checked)} />
            {labels.baseQuestion}
          </label>
          {error ? (
            <p role="alert" className="alert alert-red" style={{ fontSize: 12, marginTop: 8 }}>
              {error}
            </p>
          ) : null}
        </form>
      </Dialog>
    </>
  );
}

function AddConversionDialog({ labels, unitCodes }: { labels: UnitsManagerLabels; unitCodes: string[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [fromUnit, setFromUnit] = React.useState(unitCodes[0] ?? '');
  const [toUnit, setToUnit] = React.useState(unitCodes[1] ?? unitCodes[0] ?? '');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const unitOptions = unitCodes.map((code) => ({ value: code, label: code }));

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);
    const payload = {
      label: String(data.get('label') ?? '').trim(),
      fromUnitCode: fromUnit,
      toUnitCode: toUnit,
      factor: Number(data.get('factor') ?? ''),
    };
    startTransition(async () => {
      const result: CreateConversionResult = await createCustomConversion(payload);
      if (result.ok) {
        setError(null);
        setOpen(false);
        router.refresh();
      } else {
        setError(errorLabel(labels, result.error));
      }
    });
  }

  return (
    <>
      {/* Prototype renders the custom-conversion CTA as a text link
          (data-screens.jsx:183). Keep the link role for parity while wiring it
          to open the functional dialog. */}
      <a
        href="#add-custom-conversion"
        data-modal-id="SM-UOM-CONV-ADD"
        className="font-medium text-blue-600 underline-offset-4 hover:underline"
        onClick={(event) => {
          event.preventDefault();
          setOpen(true);
        }}
      >
        {labels.addCustomConversion}
      </a>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={labels.addCustomConversion.replace(/^\+\s*/, '')}
        modalId="SM-UOM-CONV-ADD"
        footer={
          <>
            <Button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              {labels.cancel}
            </Button>
            <Button type="submit" className="btn-primary" form="settings-units-add-conversion-form" disabled={pending}>
              {labels.saveConversion}
            </Button>
          </>
        }
      >
        <form id="settings-units-add-conversion-form" onSubmit={onSubmit}>
          <div className="ff">
            <label htmlFor="settings-units-conv-label">{labels.label}</label>
            <Input id="settings-units-conv-label" name="label" required maxLength={120} className="form-input" />
          </div>
          <div className="ff">
            <label htmlFor="settings-units-conv-from">{labels.fromUnit}</label>
            <Select value={fromUnit} onValueChange={setFromUnit} options={unitOptions} aria-label={labels.fromUnit} />
          </div>
          <div className="ff">
            <label htmlFor="settings-units-conv-to">{labels.toUnit}</label>
            <Select value={toUnit} onValueChange={setToUnit} options={unitOptions} aria-label={labels.toUnit} />
          </div>
          <div className="ff">
            <label htmlFor="settings-units-conv-factor">{labels.factorToBase}</label>
            <Input id="settings-units-conv-factor" name="factor" required inputMode="decimal" className="form-input mono" />
          </div>
          {error ? (
            <p role="alert" className="alert alert-red" style={{ fontSize: 12, marginTop: 8 }}>
              {error}
            </p>
          ) : null}
        </form>
      </Dialog>
    </>
  );
}
