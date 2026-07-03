'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { PageHead, Section, SelectField, Toggle } from '../_components';
import {
  GATE_CODES,
  type CategoryCode,
  type ChecklistTemplateItem,
  type ChecklistTemplatesByGate,
  type GateCode,
} from './_actions/checklist-template-schema';
import {
  addChecklistTemplateItem,
  deleteChecklistTemplateItem,
  reorderChecklistTemplateItem,
  updateChecklistTemplateItem,
} from './_actions/checklist-template-mutations';
import { propagateChecklistTemplates } from './_actions/propagate-checklist-templates';

export type NpdChecklistScreenLabels = {
  title: string;
  subtitle: string;
  readOnlyNotice: string;
  forbidden: string;
  loadError: string;
  propagate: string;
  propagating: string;
  propagateSuccess: string;
  propagateError: string;
  addItem: string;
  addItemTitle: string;
  deleteItem: string;
  deleteItemTitle: string;
  deleteItemBody: string;
  deleteConfirm: string;
  deleteCancel: string;
  deleting: string;
  save: string;
  cancel: string;
  create: string;
  saving: string;
  actionError: string;
  emptyGate: string;
  columnText: string;
  columnCategory: string;
  columnRequired: string;
  columnActions: string;
  fieldGate: string;
  fieldCategory: string;
  fieldText: string;
  fieldRequired: string;
  requiredYes: string;
  requiredNo: string;
  moveUp: string;
  moveDown: string;
  editText: string;
  validationTextRequired: string;
  gateLabels: Record<GateCode, string>;
  categoryLabels: Record<CategoryCode, string>;
};

type MutationAction = (input: unknown) => Promise<{ ok: boolean; code?: string }>;
type PropagateAction = (
  input?: unknown,
) => Promise<
  | { ok: true; projectsTouched: number; itemsInserted: number; itemsUpdated: number; itemsDeleted: number }
  | { ok: false; code?: string }
>;

export type NpdChecklistScreenProps = {
  templates: ChecklistTemplatesByGate;
  canEdit: boolean;
  labels: NpdChecklistScreenLabels;
  addAction?: MutationAction;
  updateAction?: MutationAction;
  deleteAction?: MutationAction;
  reorderAction?: MutationAction;
  propagateAction?: PropagateAction;
};

type AddDialogState = { open: true; gateCode: GateCode } | { open: false };

type DeleteDialogState =
  | { open: true; item: ChecklistTemplateItem }
  | { open: false };

type EditDraft = {
  itemText: string;
  categoryCode: CategoryCode;
  required: boolean;
};

function itemKey(item: Pick<ChecklistTemplateItem, 'gateCode' | 'sequence' | 'templateId'>): string {
  return `${item.templateId}:${item.gateCode}:${item.sequence}`;
}

export default function NpdChecklistScreen({
  templates,
  canEdit,
  labels,
  addAction = addChecklistTemplateItem,
  updateAction = updateChecklistTemplateItem,
  deleteAction = deleteChecklistTemplateItem,
  reorderAction = reorderChecklistTemplateItem,
  propagateAction = propagateChecklistTemplates,
}: NpdChecklistScreenProps) {
  const router = useRouter();
  const [addDialog, setAddDialog] = useState<AddDialogState>({ open: false });
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>({ open: false });
  const [addGate, setAddGate] = useState<GateCode>('G0');
  const [addCategory, setAddCategory] = useState<CategoryCode>('business');
  const [addText, setAddText] = useState('');
  const [addRequired, setAddRequired] = useState(true);
  const [addValidationError, setAddValidationError] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [propagateMessage, setPropagateMessage] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const categoryOptions = useMemo(
    () =>
      (['business', 'technical', 'compliance'] as const).map((value) => ({
        value,
        label: labels.categoryLabels[value],
      })),
    [labels.categoryLabels],
  );

  const gateOptions = useMemo(
    () =>
      GATE_CODES.map((value) => ({
        value,
        label: labels.gateLabels[value],
      })),
    [labels.gateLabels],
  );

  function refresh() {
    startTransition(() => {
      router.refresh();
    });
  }

  function openAddDialog(gateCode: GateCode) {
    setAddGate(gateCode);
    setAddCategory('business');
    setAddText('');
    setAddRequired(true);
    setAddValidationError(null);
    setAddDialog({ open: true, gateCode });
  }

  async function handleAddSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canEdit || isPending) return;
    if (addText.trim().length === 0) {
      setAddValidationError(labels.validationTextRequired);
      return;
    }
    setAddValidationError(null);
    setBannerError(null);
    const result = await addAction({
      gateCode: addGate,
      categoryCode: addCategory,
      itemText: addText.trim(),
      required: addRequired,
    });
    if (!result.ok) {
      setBannerError(labels.actionError);
      return;
    }
    setAddDialog({ open: false });
    refresh();
  }

  function startInlineEdit(item: ChecklistTemplateItem) {
    setEditingKey(itemKey(item));
    setEditDraft({
      itemText: item.itemText,
      categoryCode: item.categoryCode,
      required: item.required,
    });
    setRowError(null);
  }

  async function saveInlineEdit(item: ChecklistTemplateItem) {
    if (!editDraft || !canEdit || isPending) return;
    if (editDraft.itemText.trim().length === 0) {
      setRowError(labels.validationTextRequired);
      return;
    }
    const result = await updateAction({
      gateCode: item.gateCode,
      sequence: item.sequence,
      templateId: item.templateId,
      itemText: editDraft.itemText.trim(),
      categoryCode: editDraft.categoryCode,
      required: editDraft.required,
    });
    if (!result.ok) {
      setRowError(labels.actionError);
      return;
    }
    setEditingKey(null);
    setEditDraft(null);
    refresh();
  }

  async function handleReorder(item: ChecklistTemplateItem, direction: 'up' | 'down') {
    if (!canEdit || isPending) return;
    setBannerError(null);
    const result = await reorderAction({
      gateCode: item.gateCode,
      sequence: item.sequence,
      templateId: item.templateId,
      direction,
    });
    if (!result.ok && result.code !== 'boundary') {
      setBannerError(labels.actionError);
      return;
    }
    if (result.ok) {
      refresh();
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteDialog.open || !canEdit || isPending) return;
    const item = deleteDialog.item;
    const result = await deleteAction({
      gateCode: item.gateCode,
      sequence: item.sequence,
      templateId: item.templateId,
    });
    if (!result.ok) {
      setBannerError(labels.actionError);
      return;
    }
    setDeleteDialog({ open: false });
    refresh();
  }

  async function handlePropagate() {
    if (!canEdit || isPending) return;
    setBannerError(null);
    setPropagateMessage(null);
    const result = await propagateAction({});
    if (!result.ok) {
      setBannerError(labels.propagateError);
      return;
    }
    setPropagateMessage(
      labels.propagateSuccess
        .replace('{projects}', String(result.projectsTouched))
        .replace('{inserted}', String(result.itemsInserted))
        .replace('{updated}', String(result.itemsUpdated))
        .replace('{deleted}', String(result.itemsDeleted)),
    );
    refresh();
  }

  return (
    <main aria-label={labels.title} className="mx-auto grid max-w-5xl gap-3 p-6">
      <PageHead title={labels.title} sub={labels.subtitle} />

      {!canEdit ? (
        <div className="alert alert-amber" role="status" data-testid="npd-checklist-read-only">
          {labels.readOnlyNotice}
        </div>
      ) : null}

      {bannerError ? (
        <div className="alert alert-red" role="alert" data-testid="npd-checklist-error">
          {bannerError}
        </div>
      ) : null}

      {propagateMessage ? (
        <div className="alert alert-green" role="status" data-testid="npd-checklist-propagate-result">
          {propagateMessage}
        </div>
      ) : null}

      <Section
        sub={labels.subtitle}
        action={
          canEdit ? (
            <button
              type="button"
              className="btn btn-primary"
              data-testid="npd-checklist-propagate"
              disabled={isPending}
              onClick={() => void handlePropagate()}
            >
              {isPending ? labels.propagating : labels.propagate}
            </button>
          ) : null
        }
      >
        <div className="grid gap-4" data-testid="npd-checklist-gates">
          {GATE_CODES.map((gateCode) => {
            const items = templates[gateCode];
            return (
              <section key={gateCode} aria-label={labels.gateLabels[gateCode]} data-testid={`npd-checklist-gate-${gateCode}`}>
                <div className="flex items-center justify-between gap-3" style={{ marginBottom: 8 }}>
                  <h3 className="card-title" style={{ margin: 0 }}>
                    {labels.gateLabels[gateCode]}
                  </h3>
                  {canEdit ? (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      data-testid={`npd-checklist-add-${gateCode}`}
                      onClick={() => openAddDialog(gateCode)}
                    >
                      {labels.addItem}
                    </button>
                  ) : null}
                </div>

                {items.length === 0 ? (
                  <div className="muted" role="status" data-testid={`npd-checklist-empty-${gateCode}`}>
                    {labels.emptyGate}
                  </div>
                ) : (
                  <table data-testid={`npd-checklist-table-${gateCode}`}>
                    <thead>
                      <tr>
                        <th>{labels.columnText}</th>
                        <th>{labels.columnCategory}</th>
                        <th>{labels.columnRequired}</th>
                        {canEdit ? <th>{labels.columnActions}</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, index) => {
                        const key = itemKey(item);
                        const isEditing = editingKey === key && editDraft !== null;
                        return (
                          <tr key={key} data-testid={`npd-checklist-row-${gateCode}-${item.sequence}`}>
                            <td>
                              {isEditing ? (
                                <input
                                  className="input"
                                  aria-label={labels.editText}
                                  value={editDraft.itemText}
                                  onChange={(event) =>
                                    setEditDraft((draft) =>
                                      draft ? { ...draft, itemText: event.target.value } : draft,
                                    )
                                  }
                                />
                              ) : (
                                <span>{item.itemText}</span>
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <SelectField
                                  id={`npd-checklist-category-${key}`}
                                  label={labels.fieldCategory}
                                  value={editDraft.categoryCode}
                                  options={categoryOptions}
                                  onChange={(value) =>
                                    setEditDraft((draft) =>
                                      draft ? { ...draft, categoryCode: value as CategoryCode } : draft,
                                    )
                                  }
                                />
                              ) : (
                                labels.categoryLabels[item.categoryCode]
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <Toggle
                                  aria-label={`${item.itemText} ${labels.fieldRequired}`}
                                  checked={editDraft.required}
                                  onChange={(value) =>
                                    setEditDraft((draft) => (draft ? { ...draft, required: value } : draft))
                                  }
                                />
                              ) : (
                                <span
                                  className={`badge ${item.required ? 'badge-green' : 'badge-gray'}`}
                                  data-testid={`npd-checklist-required-${gateCode}-${item.sequence}`}
                                >
                                  {item.required ? labels.requiredYes : labels.requiredNo}
                                </span>
                              )}
                            </td>
                            {canEdit ? (
                              <td>
                                <div className="flex flex-wrap gap-2">
                                  {isEditing ? (
                                    <>
                                      <button
                                        type="button"
                                        className="btn btn-primary"
                                        disabled={isPending}
                                        onClick={() => void saveInlineEdit(item)}
                                      >
                                        {labels.save}
                                      </button>
                                      <button
                                        type="button"
                                        className="btn btn-secondary"
                                        disabled={isPending}
                                        onClick={() => {
                                          setEditingKey(null);
                                          setEditDraft(null);
                                          setRowError(null);
                                        }}
                                      >
                                        {labels.cancel}
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={() => startInlineEdit(item)}
                                      >
                                        {labels.editText}
                                      </button>
                                      <button
                                        type="button"
                                        className="btn btn-secondary"
                                        aria-label={labels.moveUp}
                                        disabled={index === 0 || isPending}
                                        onClick={() => void handleReorder(item, 'up')}
                                      >
                                        ↑
                                      </button>
                                      <button
                                        type="button"
                                        className="btn btn-secondary"
                                        aria-label={labels.moveDown}
                                        disabled={index === items.length - 1 || isPending}
                                        onClick={() => void handleReorder(item, 'down')}
                                      >
                                        ↓
                                      </button>
                                      <button
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={() => setDeleteDialog({ open: true, item })}
                                      >
                                        {labels.deleteItem}
                                      </button>
                                    </>
                                  )}
                                </div>
                                {isEditing && rowError ? (
                                  <div className="alert alert-red" role="alert">
                                    {rowError}
                                  </div>
                                ) : null}
                              </td>
                            ) : null}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </section>
            );
          })}
        </div>
      </Section>

      {addDialog.open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={labels.addItemTitle}
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4"
          data-testid="npd-checklist-add-dialog"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-lg">
            <h2 className="text-lg font-semibold text-slate-950">{labels.addItemTitle}</h2>
            <form className="mt-4 grid gap-3" onSubmit={(event) => void handleAddSubmit(event)}>
              <SelectField
                id="npd-checklist-add-gate"
                label={labels.fieldGate}
                value={addGate}
                options={gateOptions}
                onChange={(value) => setAddGate(value as GateCode)}
              />
              <SelectField
                id="npd-checklist-add-category"
                label={labels.fieldCategory}
                value={addCategory}
                options={categoryOptions}
                onChange={(value) => setAddCategory(value as CategoryCode)}
              />
              <label className="grid gap-1">
                <span>{labels.fieldText}</span>
                <input
                  className="input"
                  value={addText}
                  onChange={(event) => setAddText(event.target.value)}
                  data-testid="npd-checklist-add-text"
                />
              </label>
              <div className="flex items-center gap-2">
                <Toggle
                  aria-label={labels.fieldRequired}
                  checked={addRequired}
                  onChange={setAddRequired}
                />
                <span>{labels.fieldRequired}</span>
              </div>
              {addValidationError ? (
                <div className="alert alert-red" role="alert" data-testid="npd-checklist-add-validation">
                  {addValidationError}
                </div>
              ) : null}
              <div className="flex justify-end gap-2">
                <button type="button" className="btn btn-secondary" onClick={() => setAddDialog({ open: false })}>
                  {labels.cancel}
                </button>
                <button type="submit" className="btn btn-primary" data-testid="npd-checklist-add-submit">
                  {labels.create}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deleteDialog.open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={labels.deleteItemTitle}
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4"
          data-testid="npd-checklist-delete-dialog"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-lg">
            <h2 className="text-lg font-semibold text-slate-950">{labels.deleteItemTitle}</h2>
            <p className="mt-2 text-sm text-slate-700">{labels.deleteItemBody}</p>
            <p className="mt-2 font-medium">{deleteDialog.item.itemText}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn btn-secondary" onClick={() => setDeleteDialog({ open: false })}>
                {labels.deleteCancel}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                data-testid="npd-checklist-delete-confirm"
                disabled={isPending}
                onClick={() => void handleDeleteConfirm()}
              >
                {isPending ? labels.deleting : labels.deleteConfirm}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
