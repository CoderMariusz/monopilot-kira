"use client";

import React from 'react';

import { Button } from '@monopilot/ui/Button';
import Modal from '@monopilot/ui/Modal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';
import { Switch } from '@monopilot/ui/Switch';

export type IndustryCode = 'bakery' | 'pharma' | 'fmcg' | 'generic' | 'custom';
export type IndustryFilter = IndustryCode | 'all';

export type ManufacturingOperation = {
  id: string;
  operation_name: string;
  process_suffix: string;
  operation_seq: number;
  industry_code: IndustryCode;
  is_active: boolean;
  description?: string | null;
};

export type ManufacturingOperationsScreenLabels = {
  breadcrumbSettings: string;
  breadcrumbReferenceTables: string;
  breadcrumbManufacturingOperations: string;
  setReference: string;
  title: string;
  subtitle: string;
  notice: string;
  loading: string;
  error: string;
  permissionDenied: string;
  addNewOperation: string;
  resetToSeedData: string;
  deleteInactiveRows: string;
  industryLabel: string;
  showInactive: string;
  industryAll: string;
  industryBakery: string;
  industryPharma: string;
  industryFmcg: string;
  industryGeneric: string;
  industryCustom: string;
  columnOperationName: string;
  columnProcessSuffix: string;
  columnSequence: string;
  columnIndustryCode: string;
  columnStatus: string;
  columnActions: string;
  statusActive: string;
  statusInactive: string;
  editOperation: string;
  deleteOperation: string;
  empty: string;
  resetDialogTitle: string;
  resetDialogBody: string;
  addDialogTitle: string;
  fieldOperationName: string;
  fieldProcessSuffix: string;
  fieldDescription: string;
  fieldSequence: string;
  fieldActive: string;
  fieldIndustry: string;
  create: string;
  creating: string;
  duplicateOperationName: string;
  duplicateProcessSuffix: string;
  createFailed: string;
  cancel: string;
  reset: string;
  editDialogTitle: string;
  save: string;
  saving: string;
  updateFailed: string;
  immutableField: string;
  deleteDialogTitle: string;
  deleteDialogBody: string;
  confirmDelete: string;
  deleting: string;
  deleteFailed: string;
};

export type ManufacturingOperationsScreenProps = {
  operations?: ManufacturingOperation[];
  labels: ManufacturingOperationsScreenLabels;
  industryFilter?: IndustryFilter;
  showInactive?: boolean;
  reorderOperations?: (rows: Array<{ id: string; operation_seq: number }>) => Promise<unknown> | unknown;
  resetToSeed?: (industryCode: IndustryCode) => Promise<unknown> | unknown;
  createOperation?: (input: {
    operationName: string;
    processSuffix: string;
    description: string | null;
    operationSeq: number;
    industryCode: IndustryCode;
    isActive: boolean;
  }) => Promise<{ ok: true; data: ManufacturingOperation } | { ok: false; error?: string }> | { ok: true; data: ManufacturingOperation } | { ok: false; error?: string };
  updateOperation?: (input: {
    id: string;
    description?: string | null;
    operationSeq?: number;
    industryCode?: IndustryCode;
    isActive?: boolean;
  }) => Promise<{ ok: true; data: ManufacturingOperation } | { ok: false; error?: string }>;
  deactivateOperation?: (input: {
    id: string;
    confirmDeactivateWarning?: boolean;
    confirmReferenced?: boolean;
  }) => Promise<
    | { ok: true; data: ManufacturingOperation; warning?: { code: string; message: string } }
    | { ok: false; error?: string; warning?: { code: string; message: string } }
  >;
  onAddOperation?: () => void;
  onEditOperation?: (operation: ManufacturingOperation) => void;
  onDeactivateOperation?: (operation: ManufacturingOperation) => void;
  isLoading?: boolean;
  error?: string | null;
  canManage?: boolean;
};

const defaultOperations: ManufacturingOperation[] = [];

function sortBySequence(operations: ManufacturingOperation[]) {
  return [...operations].sort((a, b) => a.operation_seq - b.operation_seq || a.operation_name.localeCompare(b.operation_name));
}

function reorderBefore(rows: ManufacturingOperation[], draggedId: string, targetId: string): ManufacturingOperation[] {
  if (draggedId === targetId) {
    return rows;
  }

  const next = [...rows];
  const draggedIndex = next.findIndex((row) => row.id === draggedId);
  const targetIndex = next.findIndex((row) => row.id === targetId);

  if (draggedIndex === -1 || targetIndex === -1) {
    return rows;
  }

  const [dragged] = next.splice(draggedIndex, 1);
  const insertionIndex = next.findIndex((row) => row.id === targetId);
  next.splice(insertionIndex, 0, dragged);
  return next;
}

function labelForIndustry(labels: ManufacturingOperationsScreenLabels, industry: IndustryFilter): string {
  const byIndustry: Record<IndustryFilter, string> = {
    all: labels.industryAll,
    bakery: labels.industryBakery,
    pharma: labels.industryPharma,
    fmcg: labels.industryFmcg,
    generic: labels.industryGeneric,
    custom: labels.industryCustom,
  };
  return byIndustry[industry];
}

const industryValues: IndustryFilter[] = ['all', 'bakery', 'pharma', 'fmcg', 'generic', 'custom'];
const industryCodeValues: IndustryCode[] = ['bakery', 'pharma', 'fmcg', 'generic', 'custom'];

export default function ManufacturingOperationsScreen({
  operations = defaultOperations,
  labels,
  industryFilter = 'all',
  showInactive = false,
  reorderOperations,
  resetToSeed,
  createOperation,
  updateOperation,
  deactivateOperation,
  onAddOperation,
  onEditOperation,
  onDeactivateOperation,
  isLoading = false,
  error = null,
  canManage = true,
}: ManufacturingOperationsScreenProps) {
  const [selectedIndustry, setSelectedIndustry] = React.useState<IndustryFilter>(industryFilter);
  const [includeInactive, setIncludeInactive] = React.useState(showInactive);
  const [orderedOperations, setOrderedOperations] = React.useState(() => sortBySequence(operations));
  const [draggedId, setDraggedId] = React.useState<string | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = React.useState(false);
  const [addDialogOpen, setAddDialogOpen] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  // Industry is required by the table (CHECK constraint) — the create modal
  // previously had NO industry field and silently sent the page filter value,
  // which failed when the filter was "All" (2026-06-11 clickthrough §1).
  const [addIndustry, setAddIndustry] = React.useState<IndustryCode>('generic');
  const [editTarget, setEditTarget] = React.useState<ManufacturingOperation | null>(null);
  const [editIndustry, setEditIndustry] = React.useState<IndustryCode>('generic');
  const [editError, setEditError] = React.useState<string | null>(null);
  const [updating, setUpdating] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<ManufacturingOperation | null>(null);
  const [deleteWarning, setDeleteWarning] = React.useState<string | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const previousOperations = React.useRef(operations);

  React.useEffect(() => {
    if (previousOperations.current !== operations) {
      previousOperations.current = operations;
      setOrderedOperations(sortBySequence(operations));
    }
  }, [operations]);

  const visibleOperations = orderedOperations.filter((operation) => {
    const industryMatches = selectedIndustry === 'all' || operation.industry_code === selectedIndustry;
    const activeMatches = includeInactive || operation.is_active;
    return industryMatches && activeMatches;
  });
  const canAddOperation = canManage && Boolean(createOperation || onAddOperation);
  const canEditOperation = canManage && Boolean(updateOperation || onEditOperation);
  const canDeactivateOperation = canManage && Boolean(deactivateOperation || onDeactivateOperation);

  const handleDrop = (targetId: string) => {
    if (!draggedId) {
      return;
    }

    const reorderedVisibleRows = reorderBefore(visibleOperations, draggedId, targetId);
    const reorderedIds = new Set(reorderedVisibleRows.map((row) => row.id));

    let visibleIndex = 0;
    const reorderedOperations = orderedOperations.map((operation) => {
      if (!reorderedIds.has(operation.id)) {
        return operation;
      }
      const row = reorderedVisibleRows[visibleIndex];
      visibleIndex += 1;
      return row;
    });
    const resequencedOperations = reorderedOperations.map((operation, index) => ({
      ...operation,
      operation_seq: index + 1,
    }));

    setOrderedOperations(resequencedOperations);
    setDraggedId(null);
    void reorderOperations?.(
      resequencedOperations.map((operation) => ({
        id: operation.id,
        operation_seq: operation.operation_seq,
      })),
    );
  };

  const confirmResetToSeed = () => {
    setResetDialogOpen(false);
    const industryCode: IndustryCode = selectedIndustry === 'all' ? 'generic' : selectedIndustry;
    void resetToSeed?.(industryCode);
  };

  function openAddDialog() {
    setCreateError(null);
    setAddIndustry(selectedIndustry === 'all' ? 'generic' : selectedIndustry);
    setAddDialogOpen(true);
  }

  function openEditDialog(operation: ManufacturingOperation) {
    if (!updateOperation) {
      onEditOperation?.(operation);
      return;
    }
    setEditError(null);
    setEditIndustry(operation.industry_code);
    setEditTarget(operation);
  }

  function openDeleteDialog(operation: ManufacturingOperation) {
    if (!deactivateOperation) {
      onDeactivateOperation?.(operation);
      return;
    }
    setDeleteError(null);
    setDeleteWarning(null);
    setDeleteTarget(operation);
  }

  async function handleCreateOperation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!createOperation) {
      onAddOperation?.();
      return;
    }
    const form = new FormData(event.currentTarget);
    const payload = {
      operationName: String(form.get('operationName') ?? ''),
      processSuffix: String(form.get('processSuffix') ?? '').trim().toUpperCase(),
      description: String(form.get('description') ?? '').trim() || null,
      operationSeq: Number(form.get('operationSeq') ?? visibleOperations.length + 1),
      industryCode: addIndustry,
      isActive: form.get('isActive') === 'on',
    };
    setCreating(true);
    setCreateError(null);
    const result = await createOperation(payload);
    setCreating(false);
    if (result.ok) {
      setOrderedOperations((current) => sortBySequence([...current, result.data]));
      setAddDialogOpen(false);
      return;
    }
    if (result.error === 'duplicate_operation_name') setCreateError(labels.duplicateOperationName);
    else if (result.error === 'duplicate_process_suffix') setCreateError(labels.duplicateProcessSuffix);
    else setCreateError(labels.createFailed);
  }

  async function handleUpdateOperation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!updateOperation || !editTarget) return;
    const form = new FormData(event.currentTarget);
    const payload = {
      id: editTarget.id,
      description: String(form.get('description') ?? '').trim() || null,
      operationSeq: Number(form.get('operationSeq') ?? editTarget.operation_seq),
      industryCode: editIndustry,
      isActive: form.get('isActive') === 'on',
    };
    setUpdating(true);
    setEditError(null);
    const result = await updateOperation(payload);
    setUpdating(false);
    if (result.ok) {
      setOrderedOperations((current) => sortBySequence(current.map((op) => (op.id === result.data.id ? { ...op, ...result.data } : op))));
      setEditTarget(null);
      return;
    }
    setEditError(result.error === 'immutable_field' ? labels.immutableField : labels.updateFailed);
  }

  async function handleDeactivateOperation() {
    if (!deactivateOperation || !deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    // Two-step confirm: the first call carries the generic-deactivation consent;
    // when the operation is referenced (FAs/templates) the action answers
    // CONFIRMATION_REQUIRED with a usage warning, which we surface — the next
    // click sends the referenced-consent too.
    const result = await deactivateOperation({
      id: deleteTarget.id,
      confirmDeactivateWarning: true,
      confirmReferenced: deleteWarning !== null,
    });
    setDeleting(false);
    if (result.ok) {
      setOrderedOperations((current) => current.map((op) => (op.id === deleteTarget.id ? { ...op, is_active: false } : op)));
      setDeleteTarget(null);
      setDeleteWarning(null);
      return;
    }
    if (result.error === 'CONFIRMATION_REQUIRED' && result.warning) {
      setDeleteWarning(result.warning.message);
      return;
    }
    setDeleteError(labels.deleteFailed);
  }

  return (
    <main aria-labelledby="manufacturing-operations-heading" className="settings-reference-page" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <nav aria-label={labels.breadcrumbSettings} className="muted" style={{ fontSize: 11, display: 'flex', gap: 6 }}>
        <ol style={{ display: 'flex', gap: 6, listStyle: 'none', margin: 0, padding: 0 }}>
          <li>{labels.breadcrumbSettings}</li>
          <li aria-hidden="true">/</li>
          <li>{labels.breadcrumbReferenceTables}</li>
          <li aria-hidden="true">/</li>
          <li>{labels.breadcrumbManufacturingOperations}</li>
        </ol>
      </nav>

      <header data-region="page-head">
        <p className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{labels.setReference}</p>
        <h1 id="manufacturing-operations-heading">{labels.title}</h1>
        <p className="muted">{labels.subtitle}</p>
      </header>

      <div className="alert alert-blue" aria-label={labels.title} style={{ fontSize: 12 }}>
        {labels.notice}
      </div>

      {isLoading ? (
        <div role="status" aria-label={labels.loading} className="empty-state">{labels.loading}</div>
      ) : null}

      {error ? (
        <div role="alert" aria-label={labels.error} className="alert alert-red" style={{ fontSize: 12 }}>
          {error}
        </div>
      ) : null}

      {!canManage ? (
        <div role="note" aria-label={labels.permissionDenied} className="alert alert-amber" style={{ fontSize: 12 }}>
          {labels.permissionDenied}
        </div>
      ) : null}

      <section aria-label={labels.columnActions} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <Button
          type="button"
          className="btn-primary btn-sm"
          onClick={() => (createOperation ? openAddDialog() : onAddOperation?.())}
          disabled={!canAddOperation}
        >
          {labels.addNewOperation}
        </Button>
        <Button type="button" className="btn-secondary btn-sm" onClick={() => setResetDialogOpen(true)} disabled={!canManage || !resetToSeed}>
          {labels.resetToSeedData}
        </Button>
        <Button type="button" className="btn-secondary btn-sm" disabled>
          {labels.deleteInactiveRows}
        </Button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <span id="manufacturing-operations-industry-label">{labels.industryLabel}</span>
          <Select
            aria-labelledby="manufacturing-operations-industry-label"
            value={selectedIndustry}
            onValueChange={(value) => setSelectedIndustry(value as IndustryFilter)}
            options={industryValues.map((value) => ({ value, label: labelForIndustry(labels, value) }))}
          >
            <SelectTrigger aria-label={labels.industryLabel}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {industryValues.map((value) => (
                <SelectItem key={value} value={value}>
                  {labelForIndustry(labels, value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <label htmlFor="manufacturing-operations-show-inactive" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <Switch
            aria-label={labels.showInactive}
            checked={includeInactive}
            id="manufacturing-operations-show-inactive"
            onCheckedChange={setIncludeInactive}
          />
          {labels.showInactive}
        </label>
      </section>

      <table className="table" aria-label={labels.title}>
        <thead>
          <tr>
            <th scope="col">{labels.columnOperationName}</th>
            <th scope="col">{labels.columnProcessSuffix}</th>
            <th scope="col">{labels.columnSequence}</th>
            <th scope="col">{labels.columnIndustryCode}</th>
            <th scope="col">{labels.columnStatus}</th>
            <th scope="col">{labels.columnActions}</th>
          </tr>
        </thead>
        <tbody>
          {visibleOperations.map((operation) => {
            const status = operation.is_active ? labels.statusActive : labels.statusInactive;
            return (
              <tr
                key={operation.id}
                draggable={canManage}
                onDragStart={(event) => {
                  if (!canManage) {
                    return;
                  }
                  setDraggedId(operation.id);
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', operation.id);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragEnd={() => setDraggedId(null)}
                onDrop={(event) => {
                  event.preventDefault();
                  if (canManage) {
                    handleDrop(operation.id);
                  }
                }}
              >
                <td style={{ fontWeight: 500 }}>{operation.operation_name}</td>
                <td className="mono">{operation.process_suffix}</td>
                <td className="mono num">{operation.operation_seq}</td>
                <td className="mono muted">{operation.industry_code}</td>
                <td>
                  <span
                    className={operation.is_active ? 'badge badge-green' : 'badge badge-gray'}
                    aria-label={status}
                  >
                    {status}
                  </span>
                </td>
                <td>
                  <Button type="button" className="btn-secondary btn-sm" onClick={() => openEditDialog(operation)} disabled={!canEditOperation}>
                    {labels.editOperation.replace('{operation}', operation.operation_name)}
                  </Button>{' '}
                  <Button type="button" className="btn-secondary btn-sm" onClick={() => openDeleteDialog(operation)} disabled={!canDeactivateOperation}>
                    {labels.deleteOperation.replace('{operation}', operation.operation_name)}
                  </Button>
                </td>
              </tr>
            );
          })}
          {visibleOperations.length === 0 && !isLoading ? (
            <tr>
              <td colSpan={6}>
                <div className="empty-state">
                  <div className="empty-state-icon" aria-hidden="true">⚙️</div>
                  <div className="empty-state-body">{labels.empty}</div>
                </div>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <Modal open={resetDialogOpen} onOpenChange={setResetDialogOpen} size="md" modalId="SET-055-reset-seed">
        <Modal.Header title={labels.resetDialogTitle} />
        <Modal.Body>
          <p>{labels.resetDialogBody}</p>
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" className="btn-secondary btn-sm" onClick={() => setResetDialogOpen(false)}>
            {labels.cancel}
          </Button>
          <Button type="button" className="btn-danger btn-sm" onClick={confirmResetToSeed}>
            {labels.reset}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal open={addDialogOpen} onOpenChange={setAddDialogOpen} size="md" modalId="SET-055-add-operation">
        <Modal.Header title={labels.addDialogTitle} />
        <form onSubmit={handleCreateOperation}>
          <Modal.Body>
            {createError ? <div role="alert" className="alert alert-red">{createError}</div> : null}
            <div className="ff">
              <label htmlFor="mfg-op-name">{labels.fieldOperationName}</label>
              <input id="mfg-op-name" className="form-input" name="operationName" required maxLength={50} />
            </div>
            <div className="ff">
              <label htmlFor="mfg-op-suffix">{labels.fieldProcessSuffix}</label>
              <input id="mfg-op-suffix" className="form-input mono" name="processSuffix" required minLength={2} maxLength={4} pattern="[A-Z0-9]{2,4}" />
            </div>
            <div className="ff">
              <label htmlFor="mfg-op-description">{labels.fieldDescription}</label>
              <input id="mfg-op-description" className="form-input" name="description" maxLength={200} />
            </div>
            <div className="ff">
              <label htmlFor="mfg-op-sequence">{labels.fieldSequence}</label>
              <input id="mfg-op-sequence" className="form-input" name="operationSeq" type="number" min={1} max={99} defaultValue={visibleOperations.length + 1} required />
            </div>
            <div className="ff">
              <label id="mfg-op-industry-label" htmlFor="mfg-op-industry">{labels.fieldIndustry}</label>
              <Select
                aria-labelledby="mfg-op-industry-label"
                value={addIndustry}
                onValueChange={(value) => setAddIndustry(value as IndustryCode)}
                options={industryCodeValues.map((value) => ({ value, label: labelForIndustry(labels, value) }))}
              >
                <SelectTrigger id="mfg-op-industry" aria-label={labels.fieldIndustry}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {industryCodeValues.map((value) => (
                    <SelectItem key={value} value={value}>
                      {labelForIndustry(labels, value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label htmlFor="mfg-op-active" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <input id="mfg-op-active" name="isActive" type="checkbox" defaultChecked />
              {labels.fieldActive}
            </label>
          </Modal.Body>
          <Modal.Footer>
            <Button type="button" className="btn-secondary btn-sm" onClick={() => setAddDialogOpen(false)}>
              {labels.cancel}
            </Button>
            <Button type="submit" className="btn-primary btn-sm" disabled={creating}>
              {creating ? labels.creating : labels.create}
            </Button>
          </Modal.Footer>
        </form>
      </Modal>

      <Modal
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        size="md"
        modalId="SET-055-edit-operation"
      >
        <Modal.Header title={labels.editDialogTitle} />
        {editTarget ? (
          <form onSubmit={handleUpdateOperation}>
            <Modal.Body>
              {editError ? <div role="alert" className="alert alert-red">{editError}</div> : null}
              <p className="muted" style={{ fontSize: 11 }}>{labels.immutableField}</p>
              <div className="ff">
                <label htmlFor="mfg-op-edit-name">{labels.fieldOperationName}</label>
                <input id="mfg-op-edit-name" className="form-input" value={editTarget.operation_name} readOnly aria-readonly="true" />
              </div>
              <div className="ff">
                <label htmlFor="mfg-op-edit-suffix">{labels.fieldProcessSuffix}</label>
                <input id="mfg-op-edit-suffix" className="form-input mono" value={editTarget.process_suffix} readOnly aria-readonly="true" />
              </div>
              <div className="ff">
                <label htmlFor="mfg-op-edit-description">{labels.fieldDescription}</label>
                <input id="mfg-op-edit-description" className="form-input" name="description" maxLength={200} defaultValue={editTarget.description ?? ''} />
              </div>
              <div className="ff">
                <label htmlFor="mfg-op-edit-sequence">{labels.fieldSequence}</label>
                <input id="mfg-op-edit-sequence" className="form-input" name="operationSeq" type="number" min={1} max={99} defaultValue={editTarget.operation_seq} required />
              </div>
              <div className="ff">
                <label id="mfg-op-edit-industry-label" htmlFor="mfg-op-edit-industry">{labels.fieldIndustry}</label>
                <Select
                  aria-labelledby="mfg-op-edit-industry-label"
                  value={editIndustry}
                  onValueChange={(value) => setEditIndustry(value as IndustryCode)}
                  options={industryCodeValues.map((value) => ({ value, label: labelForIndustry(labels, value) }))}
                >
                  <SelectTrigger id="mfg-op-edit-industry" aria-label={labels.fieldIndustry}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {industryCodeValues.map((value) => (
                      <SelectItem key={value} value={value}>
                        {labelForIndustry(labels, value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <label htmlFor="mfg-op-edit-active" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <input id="mfg-op-edit-active" name="isActive" type="checkbox" defaultChecked={editTarget.is_active} />
                {labels.fieldActive}
              </label>
            </Modal.Body>
            <Modal.Footer>
              <Button type="button" className="btn-secondary btn-sm" onClick={() => setEditTarget(null)}>
                {labels.cancel}
              </Button>
              <Button type="submit" className="btn-primary btn-sm" disabled={updating}>
                {updating ? labels.saving : labels.save}
              </Button>
            </Modal.Footer>
          </form>
        ) : null}
      </Modal>

      <Modal
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteWarning(null);
          }
        }}
        size="md"
        modalId="SET-055-delete-operation"
      >
        <Modal.Header title={labels.deleteDialogTitle} />
        <Modal.Body>
          {deleteError ? <div role="alert" className="alert alert-red">{deleteError}</div> : null}
          {deleteWarning ? <div role="alert" className="alert alert-amber">{deleteWarning}</div> : null}
          <p>{labels.deleteDialogBody.replace('{operation}', deleteTarget?.operation_name ?? '')}</p>
        </Modal.Body>
        <Modal.Footer>
          <Button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => {
              setDeleteTarget(null);
              setDeleteWarning(null);
            }}
          >
            {labels.cancel}
          </Button>
          <Button type="button" className="btn-danger btn-sm" onClick={handleDeactivateOperation} disabled={deleting}>
            {deleting ? labels.deleting : labels.confirmDelete}
          </Button>
        </Modal.Footer>
      </Modal>
    </main>
  );
}
