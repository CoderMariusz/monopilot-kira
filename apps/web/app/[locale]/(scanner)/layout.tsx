import type { ReactNode } from 'react';

// TASK-000563 / T-133: pass-through scanner route group reserved for the T-134 ScannerFrame follow-on.
export default function ScannerRouteGroupLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
