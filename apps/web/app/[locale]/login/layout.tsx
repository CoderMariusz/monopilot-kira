import type { ReactNode } from 'react';

export default function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4 py-10 text-slate-950">
      {children}
    </div>
  );
}
