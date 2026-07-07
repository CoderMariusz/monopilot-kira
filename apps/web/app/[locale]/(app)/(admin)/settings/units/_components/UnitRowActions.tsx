'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';

import {
  softDeleteUnit,
  updateUnit,
  type UnitsActionError,
} from '../_actions/manage-units';
import type { UnitsManagerLabels } from './UnitsManager';

export type UnitRowData = {
  id: string;
  code: string;
  name: string;
  factorToBase: number;
  isBase: boolean;
};

function errorLabel(labels: UnitsManagerLabels, error: UnitsActionError): string {
  switch (error) {
    case 'already_exists':
      return labels.errorAlreadyExists;
    case 'forbidden':
      return labels.errorForbidden;
    case 'invalid_input':
      return labels.errorInvalidInput;
    case 'in_use':
      return labels.errorInUse;
    case 'not_found':
      return labels.errorNotFound;
    default:
      return labels.errorGeneric;
  }
}

function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const titleId = React.useId();
  const contentRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    contentRef.current?.focus();
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
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

export function UnitRowActions({ unit, labels }: { unit: UnitRowData; labels: UnitsManagerLabels }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [name, setName] = React.useState(unit.name);
  const [factor, setFactor] = React.useState(String(unit.factorToBase));
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [menuOpen]);

  function openEdit() {
    setMenuOpen(false);
    setName(unit.name);
    setFactor(String(unit.factorToBase));
    setError(null);
    setEditOpen(true);
  }

  function openDelete() {
    setMenuOpen(false);
    setError(null);
    setDeleteOpen(true);
  }

  function onEditSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const factorToBase = Number(factor);
    if (!Number.isFinite(factorToBase) || factorToBase <= 0) {
      setError(labels.errorInvalidInput);
      return;
    }
    startTransition(async () => {
      const result = await updateUnit({ id: unit.id, name: name.trim(), factorToBase });
      if (result.ok) {
        setEditOpen(false);
        router.refresh();
      } else {
        setError(errorLabel(labels, result.error));
      }
    });
  }

  function onDeleteConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await softDeleteUnit({ id: unit.id });
      if (result.ok) {
        setDeleteOpen(false);
        router.refresh();
      } else {
        setError(errorLabel(labels, result.error));
      }
    });
  }

  return (
    <>
      <div ref={menuRef} style={{ position: 'relative', display: 'inline-block' }}>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          aria-label={`${unit.code} actions`}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          data-testid={`unit-actions-${unit.code}`}
          onClick={() => setMenuOpen((open) => !open)}
        >
          ⋮
        </button>
        {menuOpen ? (
          <div
            role="menu"
            data-testid={`unit-actions-menu-${unit.code}`}
            style={{
              position: 'absolute',
              right: 0,
              top: '100%',
              zIndex: 20,
              minWidth: 120,
              background: '#fff',
              border: '1px solid var(--border)',
              borderRadius: 6,
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            }}
          >
            <button type="button" role="menuitem" className="btn btn-ghost btn-sm" style={{ width: '100%' }} onClick={openEdit}>
              {labels.editUnit}
            </button>
            {!unit.isBase ? (
              <button type="button" role="menuitem" className="btn btn-ghost btn-sm" style={{ width: '100%' }} onClick={openDelete}>
                {labels.deleteUnit}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <Dialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={labels.editUnitTitle}
        footer={
          <>
            <Button type="button" className="btn-secondary" onClick={() => setEditOpen(false)}>
              {labels.cancel}
            </Button>
            <Button type="submit" className="btn-primary" form={`settings-units-edit-${unit.id}`} disabled={pending}>
              {labels.saveUnit}
            </Button>
          </>
        }
      >
        <form id={`settings-units-edit-${unit.id}`} onSubmit={onEditSubmit} data-testid={`unit-edit-form-${unit.code}`}>
          <div className="ff">
            <label htmlFor={`settings-units-edit-code-${unit.id}`}>{labels.code}</label>
            <Input id={`settings-units-edit-code-${unit.id}`} value={unit.code} readOnly className="form-input mono" />
          </div>
          <div className="ff">
            <label htmlFor={`settings-units-edit-name-${unit.id}`}>{labels.name}</label>
            <Input
              id={`settings-units-edit-name-${unit.id}`}
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              required
              maxLength={120}
              className="form-input"
            />
          </div>
          <div className="ff">
            <label htmlFor={`settings-units-edit-factor-${unit.id}`}>{labels.factorToBase}</label>
            <Input
              id={`settings-units-edit-factor-${unit.id}`}
              value={factor}
              onChange={(event) => setFactor(event.currentTarget.value)}
              required
              inputMode="decimal"
              className="form-input mono"
            />
          </div>
          {error ? (
            <p role="alert" className="alert alert-red" style={{ fontSize: 12, marginTop: 8 }}>
              {error}
            </p>
          ) : null}
        </form>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={labels.deleteUnit}
        footer={
          <>
            <Button type="button" className="btn-secondary" onClick={() => setDeleteOpen(false)}>
              {labels.cancel}
            </Button>
            <Button type="button" className="btn-primary" onClick={onDeleteConfirm} disabled={pending} data-testid={`unit-delete-confirm-${unit.code}`}>
              {labels.deleteUnit}
            </Button>
          </>
        }
      >
        <p data-testid={`unit-delete-form-${unit.code}`}>{labels.confirmDeleteUnit.replace('{code}', unit.code)}</p>
        {error ? (
          <p role="alert" className="alert alert-red" style={{ fontSize: 12, marginTop: 8 }}>
            {error}
          </p>
        ) : null}
      </Dialog>
    </>
  );
}
