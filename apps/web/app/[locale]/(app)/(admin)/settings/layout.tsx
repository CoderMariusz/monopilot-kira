import type { ReactNode } from 'react';

import { SettingsSubNav } from '../../../../../components/shell/settings-subnav';

type SettingsLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function SettingsLayout({ children, params }: SettingsLayoutProps) {
  const { locale } = await params;

  return (
    <div
      data-testid="settings-layout"
      className="grid min-h-full bg-slate-50"
      style={{ gridTemplateColumns: 'var(--shell-subnav-w) minmax(0, 1fr)' }}
    >
      <SettingsSubNav locale={locale} />
      <main data-testid="settings-main" className="min-w-0 overflow-auto px-8 py-6">
        {children}
      </main>
    </div>
  );
}
