import type { ReactNode } from 'react';

export default function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_600px_at_15%_-10%,#dbeafe_0%,transparent_60%),radial-gradient(900px_500px_at_110%_110%,#e0f2fe_0%,transparent_55%),linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)] flex items-center justify-center px-6 py-10 text-slate-950">
      <div className="w-full max-w-[480px]">{children}</div>
    </div>
  );
}
