'use client';

import React from 'react';

function pillTone(value: string) {
  if (/admin/i.test(value)) return 'border-red-200 bg-red-50 text-red-800';
  if (/manager|planner|lead/i.test(value)) return 'border-blue-200 bg-blue-50 text-blue-800';
  if (/operator|active/i.test(value)) return 'border-green-200 bg-green-50 text-green-800';
  if (/invited/i.test(value)) return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

export function Pill({ children, toneKey }: { children: React.ReactNode; toneKey: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${pillTone(toneKey)}`}>
      {children}
    </span>
  );
}
