'use client';

/**
 * N1-A — status filter pills.
 *
 * Prototype parity:
 *   prototypes/design/Monopilot Design System/technical/other-screens.jsx:139-145
 *   (`EcoScreen` `.pills` strip: "Open / Closed / All" with inline counts). Here
 *   the pills map to the canonical server status machine
 *   (All / Draft / Approved / Implementing / Closed) so each filter is a real
 *   `status` query the list action understands. Counts come from the server
 *   GROUP BY (never client-derived). Navigation is via the `?status=` query
 *   param so the filter is server-rendered and shareable.
 */

import React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import type { EcoStatus } from '../_actions/shared';
import { ECO_FILTERS, type EcoFilter, makeFallback } from './eco-ui';

export function EcoFilterPills({
  active,
  counts,
}: {
  active: EcoFilter;
  counts: Record<EcoStatus, number> & { all: number };
}) {
  const t = useTranslations('Technical.eco');
  const tt = React.useMemo(() => makeFallback(t), [t]);

  const labels: Record<EcoFilter, string> = {
    all: tt('filter.all', 'All'),
    draft: tt('status.draft', 'Draft'),
    approved: tt('status.approved', 'Approved'),
    implementing: tt('status.implementing', 'Implementing'),
    closed: tt('status.closed', 'Closed'),
  };

  return (
    <div className="pills" role="tablist" aria-label={tt('filter.label', 'Filter by status')}>
      {ECO_FILTERS.map((f) => {
        const href = f === 'all' ? '?' : `?status=${f}`;
        const count = f === 'all' ? counts.all : counts[f];
        return (
          <Link
            key={f}
            href={href}
            role="tab"
            aria-selected={active === f}
            className={`pill ${active === f ? 'on' : ''}`}
          >
            {labels[f]} <span style={{ opacity: 0.5, marginLeft: 4 }}>{count}</span>
          </Link>
        );
      })}
    </div>
  );
}
