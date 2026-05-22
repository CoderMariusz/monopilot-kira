import type { ReactNode } from 'react';

// TASK-000563 / T-133: pass-through app route group until UI-131 AppShell follow-on wires the shared shell.
export default function AppRouteGroupLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
