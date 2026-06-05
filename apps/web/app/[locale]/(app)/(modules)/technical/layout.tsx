import type { ReactNode } from 'react';

import { TechnicalSubNav } from '../../../../../components/shell/technical-subnav';

type TechnicalLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function TechnicalLayout({ children, params }: TechnicalLayoutProps) {
  const { locale } = await params;

  return (
    <div
      data-testid="technical-layout"
      className="grid min-h-full bg-slate-50"
      style={{ gridTemplateColumns: 'var(--shell-subnav-w) minmax(0, 1fr)' }}
    >
      <TechnicalSubNav locale={locale} />
      {/* Pages own their own padding (px-6 py-6) — keep the layout main padding-less. */}
      <main data-testid="technical-main" className="min-w-0 overflow-auto">
        {children}
      </main>
    </div>
  );
}
