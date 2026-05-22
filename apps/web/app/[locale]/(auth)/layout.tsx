import type { ReactNode } from 'react';

// TASK-000563 / T-133: pass-through auth route group so login stays outside the UI-131 AppShell follow-on.
export default function AuthRouteGroupLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
