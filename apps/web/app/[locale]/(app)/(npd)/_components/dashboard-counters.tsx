'use client';

import React from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Card, CardContent } from '@monopilot/ui/Card';

export type DashboardCountersSummary = {
  totalFas: number;
  done: number;
  pending: number;
  blocked: number;
  overdueAlerts: number;
};

type CounterTile = {
  title: string;
  value: number;
  badge: string;
  variant?: 'default' | 'secondary' | 'destructive';
  accentClassName: string;
  valueClassName?: string;
};

export type DashboardCountersProps = {
  summary: DashboardCountersSummary;
};

function CounterCard({ tile }: { tile: CounterTile }) {
  return (
    <Card className={`rounded-lg border bg-card text-card-foreground shadow-sm border-b-4 ${tile.accentClassName}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-medium text-muted-foreground">{tile.title}</h3>
          <Badge variant={tile.variant}>{tile.badge}</Badge>
        </div>
        <div
          data-counter-value={tile.title}
          className={`mt-3 text-3xl font-bold tabular-nums ${tile.valueClassName ?? ''}`}
        >
          {tile.value}
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardCounters({ summary }: DashboardCountersProps) {
  const tiles: CounterTile[] = [
    {
      title: 'Total FAs',
      value: summary.totalFas,
      badge: 'All FAs',
      variant: 'default',
      accentClassName: 'border-b-blue-500',
      valueClassName: 'text-blue-700',
    },
    {
      title: 'Done',
      value: summary.done,
      badge: 'Ready',
      variant: 'secondary',
      accentClassName: 'border-b-green-500',
      valueClassName: 'text-green-700',
    },
    {
      title: 'Pending',
      value: summary.pending,
      badge: 'Pending',
      variant: 'secondary',
      accentClassName: 'border-b-amber-500',
      valueClassName: 'text-amber-700',
    },
    {
      title: 'Blocked',
      value: summary.blocked,
      badge: 'Blocked',
      variant: 'secondary',
      accentClassName: 'border-b-slate-500',
      valueClassName: summary.blocked > 0 ? 'text-red-700' : 'text-slate-700',
    },
    {
      title: 'Overdue',
      value: summary.overdueAlerts,
      badge: summary.overdueAlerts > 0 ? 'Overdue alerts' : 'No overdue',
      variant: summary.overdueAlerts > 0 ? 'destructive' : 'secondary',
      accentClassName: summary.overdueAlerts > 0 ? 'border-b-red-500' : 'border-b-green-500',
      valueClassName: summary.overdueAlerts > 0 ? 'text-red-700' : 'text-green-700',
    },
  ];

  return (
    <section
      aria-label="Dashboard KPI counters"
      data-prototype-anchor="npd/fa-screens.jsx:32-174"
      className="grid gap-3 md:grid-cols-5"
    >
      {tiles.map((tile) => (
        <CounterCard key={tile.title} tile={tile} />
      ))}
    </section>
  );
}

export default DashboardCounters;
