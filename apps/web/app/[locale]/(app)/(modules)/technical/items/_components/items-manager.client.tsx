'use client';

/**
 * Lane A — 03-technical Items Master client island.
 *
 * Renders the "+ New item" CTA (and per-row Edit / Deactivate) from the
 * Materials/Items master prototype
 * (prototypes/design/Monopilot Design System/technical/other-screens.jsx:304-352
 * — `MaterialsListScreen`, TEC-003: "+ New material" PageHeader action + Code /
 * Name / Type / UoM / Cost / Status table) as shadcn-style Modal dialogs calling
 * the real createItem / updateItem / deactivateItem Server Actions under
 * withOrgContext + RLS.
 *
 * Local Dialog primitive (not the Radix-backed @monopilot/ui Modal): the
 * workspace ships a React 18 peer @radix-ui/react-dialog while apps/web runs
 * React 19, so mounting Radix in the jsdom unit test crashes with a dual-React
 * useRef null. Production semantics (role="dialog", aria-modal, focus on open,
 * Escape + backdrop close, labelled title) are preserved. This is the exact
 * established deviation used by settings/units/_components/UnitsManager.tsx.
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { Select } from '@monopilot/ui/Select';

import { createItem } from '../_actions/create-item';
import { deactivateItem } from '../_actions/deactivate-item';
import {
  ITEM_STATUSES,
  ITEM_TYPES,
  type ItemListItem,
  type ItemsActionError,
  WEIGHT_MODES,
} from '../_actions/shared';
import { updateItem } from '../_actions/update-item';

const ITEM_TYPE_LABELS: Record<(typeof ITEM_TYPES)[number], string> = {
  rm: 'Raw material',
  intermediate: 'Intermediate',
  fg: 'Finished good',
  co_product: 'Co-product',
  byproduct: 'By-product',
};

const STATUS_LABELS: Record<(typeof ITEM_STATUSES)[number], string> = {
  draft: 'Draft',
  active: 'Active',
  deprecated: 'Deprecated',
  blocked: 'Blocked',
};

const WEIGHT_MODE_LABELS: Record<(typeof WEIGHT_MODES)[number], string> = {
  fixed: 'Fixed weight',
  catch: 'Catch weight',
};

const TYPE_OPTIONS = ITEM_TYPES.map((value) => ({ value, label: ITEM_TYPE_LABELS[value] }));
const STATUS_OPTIONS = ITEM_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] }));
const WEIGHT_MODE_OPTIONS = WEIGHT_MODES.map((value) => ({ value, label: WEIGHT_MODE_LABELS[value] }));

function errorLabel(error: ItemsActionError): string {
  switch (error) {
    case 'already_exists':
      return 'An item with that code already exists in this organization.';
    case 'forbidden':
      return 'You do not have permission to perform this action.';
    case 'invalid_input':
      return 'Please check the values and try again.';
    case 'not_found':
      return 'That item no longer exists.';
    default:
      return 'Could not save. Please try again.';
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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-24"
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
        className="w-full max-w-lg rounded-xl border bg-white p-5 text-sm shadow-lg outline-none"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id={titleId} className="text-lg font-semibold tracking-tight">
            {title}
          </h2>
          <button type="button" aria-label="Close" className="text-muted-foreground" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
        <div className="mt-4 flex justify-end gap-2">{footer}</div>
      </div>
    </div>
  );
}

type ItemFormState = {
  itemCode: string;
  name: string;
  itemType: (typeof ITEM_TYPES)[number];
  status: (typeof ITEM_STATUSES)[number];
  uomBase: string;
  weightMode: (typeof WEIGHT_MODES)[number];
};

function emptyForm(): ItemFormState {
  return { itemCode: '', name: '', itemType: 'rm', status: 'active', uomBase: 'kg', weightMode: 'fixed' };
}

function ItemFields({
  value,
  onChange,
  codeReadOnly,
  formId,
  onSubmit,
}: {
  value: ItemFormState;
  onChange: (next: ItemFormState) => void;
  codeReadOnly: boolean;
  formId: string;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form id={formId} className="space-y-3" onSubmit={onSubmit}>
      <label className="block text-sm font-medium text-slate-700">
        Item code
        <Input
          name="itemCode"
          required
          maxLength={64}
          className="font-mono"
          readOnly={codeReadOnly}
          value={value.itemCode}
          onChange={(event) => onChange({ ...value, itemCode: event.currentTarget.value })}
        />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Name
        <Input
          name="name"
          required
          maxLength={256}
          value={value.name}
          onChange={(event) => onChange({ ...value, name: event.currentTarget.value })}
        />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Type
        <Select
          value={value.itemType}
          onValueChange={(v) => onChange({ ...value, itemType: v as ItemFormState['itemType'] })}
          options={TYPE_OPTIONS}
          aria-label="Item type"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-medium text-slate-700">
          Status
          <Select
            value={value.status}
            onValueChange={(v) => onChange({ ...value, status: v as ItemFormState['status'] })}
            options={STATUS_OPTIONS}
            aria-label="Status"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Weight mode
          <Select
            value={value.weightMode}
            onValueChange={(v) => onChange({ ...value, weightMode: v as ItemFormState['weightMode'] })}
            options={WEIGHT_MODE_OPTIONS}
            aria-label="Weight mode"
          />
        </label>
      </div>
      <label className="block text-sm font-medium text-slate-700">
        Base UoM
        <Input
          name="uomBase"
          required
          maxLength={32}
          value={value.uomBase}
          onChange={(event) => onChange({ ...value, uomBase: event.currentTarget.value })}
        />
      </label>
    </form>
  );
}

export function NewItemButton() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<ItemFormState>(emptyForm);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function close() {
    setOpen(false);
    setForm(emptyForm());
    setError(null);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createItem(form);
      if (result.ok) {
        close();
        router.refresh();
      } else {
        setError(errorLabel(result.error));
      }
    });
  }

  return (
    <>
      <Button type="button" className="btn-primary" data-modal-id="TEC-ITEM-ADD" onClick={() => setOpen(true)}>
        + New item
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title="New item"
        footer={
          <>
            <Button type="button" className="btn-secondary" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" className="btn-primary" form="technical-items-create-form" disabled={pending}>
              Save item
            </Button>
          </>
        }
      >
        <ItemFields
          value={form}
          onChange={setForm}
          codeReadOnly={false}
          formId="technical-items-create-form"
          onSubmit={onSubmit}
        />
        {error ? (
          <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </Dialog>
    </>
  );
}

export function ItemRowActions({
  item,
  canEdit,
  canDeactivate,
}: {
  item: ItemListItem;
  canEdit: boolean;
  canDeactivate: boolean;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = React.useState(false);
  const [form, setForm] = React.useState<ItemFormState>(() => ({
    itemCode: item.itemCode,
    name: item.name,
    itemType: item.itemType,
    status: item.status,
    uomBase: item.uomBase,
    weightMode: item.weightMode,
  }));
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function onEditSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateItem({
        id: item.id,
        name: form.name,
        itemType: form.itemType,
        status: form.status,
        uomBase: form.uomBase,
        weightMode: form.weightMode,
      });
      if (result.ok) {
        setEditOpen(false);
        router.refresh();
      } else {
        setError(errorLabel(result.error));
      }
    });
  }

  function onDeactivate() {
    startTransition(async () => {
      const result = await deactivateItem({ id: item.id });
      if (result.ok) {
        router.refresh();
      } else {
        setError(errorLabel(result.error));
      }
    });
  }

  if (!canEdit && !canDeactivate) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <span className="flex justify-end gap-2">
      {canEdit ? (
        <button
          type="button"
          className="font-medium text-blue-600 underline-offset-4 hover:underline"
          onClick={() => setEditOpen(true)}
        >
          Edit
        </button>
      ) : null}
      {canDeactivate && item.status !== 'blocked' ? (
        <button
          type="button"
          className="font-medium text-red-600 underline-offset-4 hover:underline disabled:opacity-50"
          disabled={pending}
          onClick={onDeactivate}
        >
          Deactivate
        </button>
      ) : null}
      {canEdit ? (
        <Dialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          title={`Edit ${item.itemCode}`}
          footer={
            <>
              <Button type="button" className="btn-secondary" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="btn-primary"
                form={`technical-items-edit-form-${item.id}`}
                disabled={pending}
              >
                Save changes
              </Button>
            </>
          }
        >
          <ItemFields
            value={form}
            onChange={setForm}
            codeReadOnly
            formId={`technical-items-edit-form-${item.id}`}
            onSubmit={onEditSubmit}
          />
          {error ? (
            <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
        </Dialog>
      ) : null}
    </span>
  );
}

export { ITEM_TYPE_LABELS, STATUS_LABELS };
