'use client';

import React from 'react';

export function KpiTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div data-testid="users-kpi-tile" className="rounded-xl border bg-white p-4 shadow-sm">
      <div data-testid="users-kpi-label" className="text-xs text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold">{children}</div>
    </div>
  );
}
