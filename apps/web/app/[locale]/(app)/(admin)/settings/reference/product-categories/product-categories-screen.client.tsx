"use client";

import React from 'react';

import { Button } from '@monopilot/ui/Button';
import Modal from '@monopilot/ui/Modal';
import { Switch } from '@monopilot/ui/Switch';

export type ProductCategoryRow = {
  id: string;
  code: string;
  label: string;
  is_active: boolean;
  display_order: number;
};

export type ProductCategoriesScreenLabels = {
  breadcrumbSettings: string;
  breadcrumbReferenceTables: string;
  breadcrumbProductCategories: string;
  setReference: string;
  title: string;
  subtitle: string;
  notice: string;
  loading: string;
  error: string;
  permissionDenied: string;
  addNew: string;
  showInactive: string;
  columnCode: string;
  columnLabel: string;
  columnDisplayOrder: string;
  columnStatus: string;
  columnActions: string;
  statusActive: string;
  statusInactive: string;
  editCategory: string;
  deactivateCategory: string;
  activateCategory: string;
  empty: string;
  addDialogTitle: string;
  fieldCode: string;
  fieldLabel: string;
  fieldDisplayOrder: string;
  fieldActive: string;
  create: string;
  creating: string;
  duplicateCode: string;
  createFailed: string;
  cancel: string;
  editDialogTitle: string;
  save: string;
  saving: string;
  updateFailed: string;
  immutableField: string;
  deactivateDialogTitle: string;
  deactivateDialogBody: string;
  activateDialogTitle: string;
  activateDialogBody: string;
  confirmDeactivate: string;
  confirmActivate: string;
  toggling: string;
  toggleFailed: string;
};

export type ProductCategoriesScreenProps = {
  categories?: ProductCategoryRow[];
  labels: ProductCategoriesScreenLabels;
  showInactive?: boolean;
  createCategory?: (input: {
    code: string;
    label: string;
    displayOrder: number;
    isActive: boolean;
  }) => Promise<{ ok: true; data: ProductCategoryRow } | { ok: false; error?: string }>;
  updateCategory?: (input: {
    id: string;
    label?: string;
    displayOrder?: number;
    isActive?: boolean;
  }) => Promise<{ ok: true; data: ProductCategoryRow } | { ok: false; error?: string }>;
  isLoading?: boolean;
  error?: string | null;
  canManage?: boolean;
};

function sortRows(rows: ProductCategoryRow[]) {
  return [...rows].sort((a, b) => a.display_order - b.display_order || a.label.localeCompare(b.label));
}

export default function ProductCategoriesScreen({
  categories = [],
  labels,
  showInactive = false,
  createCategory,
  updateCategory,
  isLoading = false,
  error = null,
  canManage = true,
}: ProductCategoriesScreenProps) {
  const [orderedRows, setOrderedRows] = React.useState(() => sortRows(categories));
  const [includeInactive, setIncludeInactive] = React.useState(showInactive);
  const [addDialogOpen, setAddDialogOpen] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<ProductCategoryRow | null>(null);
  const [editError, setEditError] = React.useState<string | null>(null);
  const [updating, setUpdating] = React.useState(false);
  const [toggleTarget, setToggleTarget] = React.useState<ProductCategoryRow | null>(null);
  const [toggleError, setToggleError] = React.useState<string | null>(null);
  const [toggling, setToggling] = React.useState(false);
  const previousCategories = React.useRef(categories);

  React.useEffect(() => {
    if (previousCategories.current !== categories) {
      previousCategories.current = categories;
      setOrderedRows(sortRows(categories));
    }
  }, [categories]);

  const visibleRows = orderedRows.filter((row) => includeInactive || row.is_active);
  const canMutate = canManage && Boolean(createCategory && updateCategory);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!createCategory) return;
    const form = new FormData(event.currentTarget);
    const payload = {
      code: String(form.get('code') ?? '').trim().toLowerCase(),
      label: String(form.get('label') ?? '').trim(),
      displayOrder: Number(form.get('displayOrder') ?? visibleRows.length + 1),
      isActive: form.get('isActive') === 'on',
    };
    setCreating(true);
    setCreateError(null);
    const result = await createCategory(payload);
    setCreating(false);
    if (result.ok) {
      setOrderedRows((current) => sortRows([...current, result.data]));
      setAddDialogOpen(false);
      return;
    }
    if (result.error === 'duplicate_code') setCreateError(labels.duplicateCode);
    else setCreateError(labels.createFailed);
  }

  async function handleUpdate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!updateCategory || !editTarget) return;
    const form = new FormData(event.currentTarget);
    const payload = {
      id: editTarget.id,
      label: String(form.get('label') ?? '').trim(),
      displayOrder: Number(form.get('displayOrder') ?? editTarget.display_order),
      isActive: form.get('isActive') === 'on',
    };
    setUpdating(true);
    setEditError(null);
    const result = await updateCategory(payload);
    setUpdating(false);
    if (result.ok) {
      setOrderedRows((current) => sortRows(current.map((row) => (row.id === result.data.id ? result.data : row))));
      setEditTarget(null);
      return;
    }
    setEditError(result.error === 'immutable_field' ? labels.immutableField : labels.updateFailed);
  }

  async function handleToggleActive() {
    if (!updateCategory || !toggleTarget) return;
    setToggling(true);
    setToggleError(null);
    const result = await updateCategory({ id: toggleTarget.id, isActive: !toggleTarget.is_active });
    setToggling(false);
    if (result.ok) {
      setOrderedRows((current) => sortRows(current.map((row) => (row.id === result.data.id ? result.data : row))));
      setToggleTarget(null);
      return;
    }
    setToggleError(labels.toggleFailed);
  }

  return (
    <main aria-labelledby="product-categories-heading" className="settings-reference-page" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <nav aria-label={labels.breadcrumbSettings} className="muted" style={{ fontSize: 11, display: 'flex', gap: 6 }}>
        <ol style={{ display: 'flex', gap: 6, listStyle: 'none', margin: 0, padding: 0 }}>
          <li>{labels.breadcrumbSettings}</li>
          <li aria-hidden="true">/</li>
          <li>{labels.breadcrumbReferenceTables}</li>
          <li aria-hidden="true">/</li>
          <li>{labels.breadcrumbProductCategories}</li>
        </ol>
      </nav>

      <header data-region="page-head">
        <p className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{labels.setReference}</p>
        <h1 id="product-categories-heading">{labels.title}</h1>
        <p className="muted">{labels.subtitle}</p>
      </header>

      <div className="alert alert-blue" aria-label={labels.title} style={{ fontSize: 12 }}>
        {labels.notice}
      </div>

      {isLoading ? <div role="status" aria-label={labels.loading} className="empty-state">{labels.loading}</div> : null}
      {error ? <div role="alert" aria-label={labels.error} className="alert alert-red" style={{ fontSize: 12 }}>{error}</div> : null}
      {!canManage ? (
        <div role="note" aria-label={labels.permissionDenied} className="alert alert-amber" style={{ fontSize: 12 }}>
          {labels.permissionDenied}
        </div>
      ) : null}

      <section aria-label={labels.columnActions} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <Button type="button" className="btn-primary btn-sm" onClick={() => { setCreateError(null); setAddDialogOpen(true); }} disabled={!canMutate}>
          {labels.addNew}
        </Button>
        <label htmlFor="product-categories-show-inactive" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginLeft: 'auto' }}>
          <Switch
            aria-label={labels.showInactive}
            checked={includeInactive}
            id="product-categories-show-inactive"
            onCheckedChange={setIncludeInactive}
          />
          {labels.showInactive}
        </label>
      </section>

      <table className="table" aria-label={labels.title}>
        <thead>
          <tr>
            <th scope="col">{labels.columnCode}</th>
            <th scope="col">{labels.columnLabel}</th>
            <th scope="col">{labels.columnDisplayOrder}</th>
            <th scope="col">{labels.columnStatus}</th>
            <th scope="col">{labels.columnActions}</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => {
            const status = row.is_active ? labels.statusActive : labels.statusInactive;
            return (
              <tr key={row.id}>
                <td className="mono">{row.code}</td>
                <td style={{ fontWeight: 500 }}>{row.label}</td>
                <td className="mono num">{row.display_order}</td>
                <td>
                  <span className={row.is_active ? 'badge badge-green' : 'badge badge-gray'} aria-label={status}>
                    {status}
                  </span>
                </td>
                <td>
                  <Button type="button" className="btn-secondary btn-sm" onClick={() => { setEditError(null); setEditTarget(row); }} disabled={!canMutate}>
                    {labels.editCategory.replace('{category}', row.label)}
                  </Button>{' '}
                  <Button type="button" className="btn-secondary btn-sm" onClick={() => { setToggleError(null); setToggleTarget(row); }} disabled={!canMutate}>
                    {row.is_active
                      ? labels.deactivateCategory.replace('{category}', row.label)
                      : labels.activateCategory.replace('{category}', row.label)}
                  </Button>
                </td>
              </tr>
            );
          })}
          {visibleRows.length === 0 && !isLoading ? (
            <tr>
              <td colSpan={5}>
                <div className="empty-state">
                  <div className="empty-state-icon" aria-hidden="true">🏷️</div>
                  <div className="empty-state-body">{labels.empty}</div>
                </div>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <Modal open={addDialogOpen} onOpenChange={setAddDialogOpen} size="md" modalId="product-categories-add">
        <Modal.Header title={labels.addDialogTitle} />
        <form onSubmit={handleCreate}>
          <Modal.Body>
            {createError ? <div role="alert" className="alert alert-red">{createError}</div> : null}
            <div className="ff">
              <label htmlFor="pc-code">{labels.fieldCode}</label>
              <input id="pc-code" className="form-input mono" name="code" required pattern="[a-z0-9][a-z0-9_]{0,63}" />
            </div>
            <div className="ff">
              <label htmlFor="pc-label">{labels.fieldLabel}</label>
              <input id="pc-label" className="form-input" name="label" required maxLength={120} />
            </div>
            <div className="ff">
              <label htmlFor="pc-order">{labels.fieldDisplayOrder}</label>
              <input id="pc-order" className="form-input" name="displayOrder" type="number" min={0} max={9999} defaultValue={visibleRows.length + 1} required />
            </div>
            <label htmlFor="pc-active" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <input id="pc-active" name="isActive" type="checkbox" defaultChecked />
              {labels.fieldActive}
            </label>
          </Modal.Body>
          <Modal.Footer>
            <Button type="button" className="btn-secondary btn-sm" onClick={() => setAddDialogOpen(false)}>{labels.cancel}</Button>
            <Button type="submit" className="btn-primary btn-sm" disabled={creating}>{creating ? labels.creating : labels.create}</Button>
          </Modal.Footer>
        </form>
      </Modal>

      <Modal open={editTarget !== null} onOpenChange={(open) => { if (!open) setEditTarget(null); }} size="md" modalId="product-categories-edit">
        <Modal.Header title={labels.editDialogTitle} />
        {editTarget ? (
          <form onSubmit={handleUpdate}>
            <Modal.Body>
              {editError ? <div role="alert" className="alert alert-red">{editError}</div> : null}
              <p className="muted" style={{ fontSize: 11 }}>{labels.immutableField}</p>
              <div className="ff">
                <label htmlFor="pc-edit-code">{labels.fieldCode}</label>
                <input id="pc-edit-code" className="form-input mono" value={editTarget.code} readOnly aria-readonly="true" />
              </div>
              <div className="ff">
                <label htmlFor="pc-edit-label">{labels.fieldLabel}</label>
                <input id="pc-edit-label" className="form-input" name="label" maxLength={120} defaultValue={editTarget.label} required />
              </div>
              <div className="ff">
                <label htmlFor="pc-edit-order">{labels.fieldDisplayOrder}</label>
                <input id="pc-edit-order" className="form-input" name="displayOrder" type="number" min={0} max={9999} defaultValue={editTarget.display_order} required />
              </div>
              <label htmlFor="pc-edit-active" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <input id="pc-edit-active" name="isActive" type="checkbox" defaultChecked={editTarget.is_active} />
                {labels.fieldActive}
              </label>
            </Modal.Body>
            <Modal.Footer>
              <Button type="button" className="btn-secondary btn-sm" onClick={() => setEditTarget(null)}>{labels.cancel}</Button>
              <Button type="submit" className="btn-primary btn-sm" disabled={updating}>{updating ? labels.saving : labels.save}</Button>
            </Modal.Footer>
          </form>
        ) : null}
      </Modal>

      <Modal
        open={toggleTarget !== null}
        onOpenChange={(open) => { if (!open) setToggleTarget(null); }}
        size="md"
        modalId="product-categories-toggle"
      >
        <Modal.Header title={toggleTarget?.is_active ? labels.deactivateDialogTitle : labels.activateDialogTitle} />
        <Modal.Body>
          {toggleError ? <div role="alert" className="alert alert-red">{toggleError}</div> : null}
          <p>
            {(toggleTarget?.is_active ? labels.deactivateDialogBody : labels.activateDialogBody).replace(
              '{category}',
              toggleTarget?.label ?? '',
            )}
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" className="btn-secondary btn-sm" onClick={() => setToggleTarget(null)}>{labels.cancel}</Button>
          <Button type="button" className={toggleTarget?.is_active ? 'btn-danger btn-sm' : 'btn-primary btn-sm'} onClick={handleToggleActive} disabled={toggling}>
            {toggling ? labels.toggling : toggleTarget?.is_active ? labels.confirmDeactivate : labels.confirmActivate}
          </Button>
        </Modal.Footer>
      </Modal>
    </main>
  );
}
