import React from 'react';

export interface ActivityRow {
  id: string;
  timestamp: string;
  user: string;
  text: string;
}

export interface CompactActivityProps {
  rows: ActivityRow[];
}

export function CompactActivity({ rows }: CompactActivityProps) {
  return (
    <ul className="compact-activity" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {rows.map((row) => (
        <li key={row.id} className="compact-activity__row">
          <time className="compact-activity__timestamp" dateTime={row.timestamp}>
            {row.timestamp}
          </time>
          <span className="compact-activity__user">{row.user}</span>
          <span className="compact-activity__text">{row.text}</span>
        </li>
      ))}
    </ul>
  );
}
