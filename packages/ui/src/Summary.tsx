import React from 'react';

// Import CSS for side-effects — class definitions reference var(--color-warning).
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
import './Summary.module.css';

export interface SummaryRow {
  label: string;
  before?: React.ReactNode;
  after: React.ReactNode;
  status?: 'unchanged' | 'added' | 'changed' | 'removed';
}

export interface SummaryProps {
  rows: SummaryRow[];
  emptyState?: React.ReactNode;
}

/** Visually hidden span so screen readers hear the status word. */
function VisuallyHidden({ children }: { children: React.ReactNode }) {
  return (
    <span className="summary-status-label">
      {children}
    </span>
  );
}

export default function Summary({ rows, emptyState }: SummaryProps): React.JSX.Element {
  if (rows.length === 0) {
    if (emptyState !== undefined) {
      return <>{emptyState}</>;
    }
    return (
      <p role="status">No changes</p>
    );
  }

  return (
    <dl>
      {rows.map((row, index) => {
        const className = row.status ? `summary-row--${row.status}` : undefined;

        return (
          <div
            key={index}
            data-summary-row
            className={className}
          >
            <dt>
              {row.label}
              {row.status && (
                <VisuallyHidden> ({row.status})</VisuallyHidden>
              )}
            </dt>
            <dd>{row.after}</dd>
          </div>
        );
      })}
    </dl>
  );
}
