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
};

const industryOptions: Array<{ value: IndustryFilter; label: string }> = [
  { value: 'all', label: 'All industries' },
  { value: 'bakery', label: 'Bakery' },
  { value: 'pharma', label: 'Pharma' },
  { value: 'fmcg', label: 'FMCG' },
  { value: 'generic', label: 'Generic' },
  { value: 'custom', label: 'Custom' },
];

function sortBySequence(operations: ManufacturingOperation[]) {
  return [...operations].sort((a, b) => a.operation_seq - b.operation_seq || a.operation_name.localeCompare(b.operation_name));
}

function reorderBefore(
  rows: ManufacturingOperation[],
  draggedId: string,
  targetId: string,
): ManufacturingOperation[] {
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

export default function ManufacturingOperationsPage({
  operations,
  industryFilter = 'all',
  showInactive = false,
  reorderOperations,
  resetToSeed,
  onAddOperation,
  onEditOperation,
  onDeactivateOperation,
}: ManufacturingOperationsPageProps) {
  const operationsUnavailable = operations === undefined;
  const operationsList = operations ?? [];
  const [selectedIndustry, setSelectedIndustry] = React.useState<IndustryFilter>(industryFilter);
  const [includeInactive, setIncludeInactive] = React.useState(showInactive);
  const [orderedOperations, setOrderedOperations] = React.useState(() => sortBySequence(operationsList));
  const [draggedId, setDraggedId] = React.useState<string | null>(null);
  const previousOperations = React.useRef(operationsList);

  React.useEffect(() => {
    if (previousOperations.current !== operationsList) {
      previousOperations.current = operationsList;
      setOrderedOperations(sortBySequence(operationsList));
    }
  }, [operationsList]);

  if (operationsUnavailable) {
    return (
      <main aria-labelledby="manufacturing-operations-heading" className="settings-reference-page p-6">
        <header>
          <p>SET-055 / PRD §8.9.4</p>
          <h1 id="manufacturing-operations-heading">Manufacturing Operations</h1>
        </header>
        <div role="alert" data-testid="settings-manufacturing-operations-unavailable" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Manufacturing operations are not available.</strong>
          <p>The manufacturing_operations server loader has not been wired in this environment. No seed data is shown.</p>
        </div>
      </main>
    );
  }

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

  return (
    <main aria-labelledby="manufacturing-operations-heading" className="settings-reference-page">
      <nav aria-label="Breadcrumb">
        <ol>
          <li>Settings</li>
          <li>Reference Tables</li>
          <li>Manufacturing Operations</li>
        </ol>
      </nav>

      <header>
        <p>SET-055 / PRD §8.9.4</p>
        <h1 id="manufacturing-operations-heading">Manufacturing Operations</h1>
        <p>
          Configure tenant-specific operation names, process suffixes, industry seed sets, active state,
          and recipe sequence order.
        </p>
      </header>

      <section aria-label="Manufacturing operations toolbar">
        <Button type="button" onClick={() => onAddOperation?.()}>
          Add New Operation
        </Button>
        <Button type="button" onClick={() => resetToSeed?.()}>
          Reset to seed data
        </Button>
        <Button type="button">Delete inactive rows</Button>

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
                draggable
                onDragStart={(event) => {
                  setDraggedId(operation.id);
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', operation.id);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  handleDrop(operation.id);
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
                  <Button type="button" onClick={() => onEditOperation?.(operation)}>
                    Edit {operation.operation_name}
                  </Button>
                  <Button type="button" onClick={() => onDeactivateOperation?.(operation)}>
                    Deactivate {operation.operation_name}
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
