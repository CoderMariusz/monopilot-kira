"use client";

import React from 'react';

import { Button } from '@monopilot/ui/Button';
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
  cancel: string;
  reset: string;
};

export type ManufacturingOperationsScreenProps = {
  operations?: ManufacturingOperation[];
  labels: ManufacturingOperationsScreenLabels;
  industryFilter?: IndustryFilter;
  showInactive?: boolean;
  reorderOperations?: (rows: Array<{ id: string; operation_seq: number }>) => Promise<unknown> | unknown;
  resetToSeed?: (industryCode: IndustryCode) => Promise<unknown> | unknown;
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

export default function ManufacturingOperationsScreen({
  operations = defaultOperations,
  labels,
  industryFilter = 'all',
  showInactive = false,
  reorderOperations,
  resetToSeed,
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
  const canAddOperation = canManage && Boolean(onAddOperation);
  const canEditOperation = canManage && Boolean(onEditOperation);
  const canDeactivateOperation = canManage && Boolean(onDeactivateOperation);

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

  return (
    <main aria-labelledby="manufacturing-operations-heading" className="settings-reference-page">
      <nav aria-label={labels.breadcrumbSettings}>
        <ol>
          <li>{labels.breadcrumbSettings}</li>
          <li>{labels.breadcrumbReferenceTables}</li>
          <li>{labels.breadcrumbManufacturingOperations}</li>
        </ol>
      </nav>

      <header data-region="page-head">
        <p>{labels.setReference}</p>
        <h1 id="manufacturing-operations-heading">{labels.title}</h1>
        <p>{labels.subtitle}</p>
      </header>

      <section aria-label={labels.title}>
        <p>{labels.notice}</p>
      </section>

      {isLoading ? <section aria-label={labels.loading}>{labels.loading}</section> : null}

      {error ? (
        <section role="alert" aria-label={labels.error}>
          {error}
        </section>
      ) : null}

      {!canManage ? (
        <section role="note" aria-label={labels.permissionDenied}>
          {labels.permissionDenied}
        </section>
      ) : null}

      <section aria-label={labels.columnActions}>
        <Button type="button" onClick={() => onAddOperation?.()} disabled={!canAddOperation}>
          {labels.addNewOperation}
        </Button>
        <Button type="button" onClick={() => setResetDialogOpen(true)} disabled={!canManage || !resetToSeed}>
          {labels.resetToSeedData}
        </Button>
        <Button type="button" disabled>
          {labels.deleteInactiveRows}
        </Button>

        <div>
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

        <label htmlFor="manufacturing-operations-show-inactive">
          <Switch
            aria-label={labels.showInactive}
            checked={includeInactive}
            id="manufacturing-operations-show-inactive"
            onCheckedChange={setIncludeInactive}
          />
          {labels.showInactive}
        </label>
      </section>

      <table aria-label={labels.title}>
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
                <td>{operation.operation_name}</td>
                <td>{operation.process_suffix}</td>
                <td>{operation.operation_seq}</td>
                <td>{operation.industry_code}</td>
                <td>
                  <span aria-label={status}>{status}</span>
                </td>
                <td>
                  <Button type="button" onClick={() => onEditOperation?.(operation)} disabled={!canEditOperation}>
                    {labels.editOperation.replace('{operation}', operation.operation_name)}
                  </Button>
                  <Button type="button" onClick={() => onDeactivateOperation?.(operation)} disabled={!canDeactivateOperation}>
                    {labels.deleteOperation.replace('{operation}', operation.operation_name)}
                  </Button>
                </td>
              </tr>
            );
          })}
          {visibleOperations.length === 0 && !isLoading ? (
            <tr>
              <td colSpan={6}>{labels.empty}</td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {resetDialogOpen ? (
        <div role="dialog" aria-modal="true" aria-labelledby="reset-seed-title">
          <h2 id="reset-seed-title">{labels.resetDialogTitle}</h2>
          <p>{labels.resetDialogBody}</p>
          <div>
            <Button type="button" onClick={() => setResetDialogOpen(false)}>
              {labels.cancel}
            </Button>
            <Button type="button" onClick={confirmResetToSeed}>
              {labels.reset}
            </Button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
