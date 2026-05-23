import type { ReactNode } from "react";

// TASK-000600 / T-134: scanner route group is intentionally isolated from the AppShell route group.
export default function ScannerRouteGroupLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen overflow-auto bg-slate-950 px-0 py-0 sm:grid sm:place-items-center sm:px-6 sm:py-8">
      {children}
    </main>
  );
}
