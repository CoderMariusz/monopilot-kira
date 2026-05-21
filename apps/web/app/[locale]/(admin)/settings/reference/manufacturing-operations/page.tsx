'use client';

import React from 'react';
import { Button } from '@monopilot/ui/Button';

type IndustryCode = 'bakery' | 'pharma' | 'fmcg' | 'generic' | 'custom';
type IndustryFilter = IndustryCode | 'all';

type ManufacturingOperation = {
  id: string;
  operation_name: string;
  process_suffix: string;
  operation_seq: number;
  industry_code: IndustryCode;
  is_active: boolean;
  description?: string;
};

type ManufacturingOperationsPageProps = {
  operations?: ManufacturingOperation[];
  industryFilter?: IndustryFilter;
  showInactive?: boolean;
  reorderOperations?: (rows: Array<{ id: string; operation_seq: number }>) => Promise<unknown> | unknown;
  resetToSeed?: () => Promise<unknown> | unknown;
  onAddOperation?: () => void;
  onEditOperation?: (operation: ManufacturingOperation) => void;
  onDeactivateOperation?: (operation: ManufacturingOperation) => void;
  isLoading?: boolean;
  error?: string | null;
  canManage?: boolean;
};

const industryOptions: Array<{ value: IndustryFilter; label: string }> = [
  { value: 'all', label: 'All industries' },
  { value: 'bakery', label: 'Bakery' },
  { value: 'pharma', label: 'Pharma' },
  { value: 'fmcg', label: 'FMCG' },
  { value: 'generic', label: 'Generic' },
  { value: 'custom', label: 'Custom' },
];

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

export default function ManufacturingOperationsPage(props: any) {
  const {
    operations = defaultOperations,
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
  } = props as ManufacturingOperationsPageProps;

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
    void resetToSeed?.();
  };

  return (
    <main aria-labelledby="manufacturing-operations-heading" className="settings-reference-page">
      <nav aria-label="Breadcrumb">
        <ol>
          <li>Settings</li>
          <li>Reference Tables</li>
          <li>Manufacturing Operations</li>
        </ol>
      </nav>

      <header data-region="page-head">
        <p>SET-055 / PRD §8.9.4</p>
        <h1 id="manufacturing-operations-heading">Manufacturing Operations</h1>
        <p>
          Configure tenant-specific operation names, process suffixes, industry seed sets, active state,
          and recipe sequence order.
        </p>
      </header>

      <section aria-label="Manufacturing operations notice">
        <p>
          Operations are referenced by routings, line assignments, and WIP code generators. The process suffix is
          immutable after creation.
        </p>
      </section>

      {isLoading ? (
        <section aria-label="Loading manufacturing operations">Loading manufacturing operations…</section>
      ) : null}

      {error ? (
        <section role="alert" aria-label="Manufacturing operations error">
          {error}
        </section>
      ) : null}

      {!canManage ? (
        <section role="note" aria-label="Manufacturing operations permission">
          You do not have permission to manage manufacturing operations.
        </section>
      ) : null}

      <section aria-label="Manufacturing operations toolbar">
        <Button type="button" onClick={() => onAddOperation?.()} disabled={!canManage}>
          Add New Operation
        </Button>
        <Button type="button" onClick={() => setResetDialogOpen(true)} disabled={!canManage}>
          Reset to seed data
        </Button>
        <Button type="button" disabled={!canManage}>
          Delete inactive rows
        </Button>

        <label>
          Industry
          <select
            aria-label="Industry"
            value={selectedIndustry}
            onChange={(event) => setSelectedIndustry(event.target.value as IndustryFilter)}
          >
            {industryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <input
            aria-label="Show inactive"
            checked={includeInactive}
            role="switch"
            type="checkbox"
            onChange={(event) => setIncludeInactive(event.target.checked)}
          />
          Show inactive
        </label>
      </section>

      <table aria-label="Manufacturing Operations">
        <thead>
          <tr>
            <th scope="col">Operation Name</th>
            <th scope="col">Process Suffix</th>
            <th scope="col">Sequence</th>
            <th scope="col">Industry Code</th>
            <th scope="col">Status</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {visibleOperations.map((operation) => {
            const status = operation.is_active ? 'Active' : 'Inactive';
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
                  <Button type="button" onClick={() => onEditOperation?.(operation)} disabled={!canManage}>
                    Edit {operation.operation_name}
                  </Button>
                  <Button type="button" onClick={() => onDeactivateOperation?.(operation)} disabled={!canManage}>
                    Delete {operation.operation_name}
                  </Button>
                </td>
              </tr>
            );
          })}
          {visibleOperations.length === 0 && !isLoading ? (
            <tr>
              <td colSpan={6}>No manufacturing operations match the current filters.</td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {resetDialogOpen ? (
        <div role="dialog" aria-modal="true" aria-labelledby="reset-seed-title">
          <h2 id="reset-seed-title">Reset to industry seed data</h2>
          <p>
            This will replace all current operations with the selected industry seed data. Existing operation order,
            suffixes, and inactive rows will be reset.
          </p>
          <div>
            <Button type="button" onClick={() => setResetDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={confirmResetToSeed}>
              Reset
            </Button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
