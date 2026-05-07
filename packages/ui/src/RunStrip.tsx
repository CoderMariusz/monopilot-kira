import React from 'react';

export type RunStatus = 'idle' | 'running' | 'passed' | 'failed';

export interface RunStripProps {
  statuses: RunStatus[];
}

export function RunStrip({ statuses }: RunStripProps) {
  return (
    <ul className="run-strip" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', gap: '0.5rem' }}>
      {statuses.map((status, index) => (
        <li
          key={index}
          data-status={status}
          className={`run-strip__pill run-strip__pill--${status}`}
        >
          {status}
        </li>
      ))}
    </ul>
  );
}
