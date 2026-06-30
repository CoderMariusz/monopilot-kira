'use client';

import type { ReactNode } from 'react';

export function DialogShell({
  titleId,
  title,
  children,
  onCancel,
}: {
  titleId: string;
  title: string;
  children: ReactNode;
  onCancel: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-lg font-semibold text-slate-950">
            {title}
          </h2>
          <button type="button" className="btn btn-secondary" aria-label="×" onClick={onCancel}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
