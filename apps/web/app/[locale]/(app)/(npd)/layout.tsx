import type { ReactNode } from 'react';

import { NpdSubNav } from '../../../../components/shell/npd-subnav';

type NpdLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

/**
 * 01-npd module layout. Mounts the horizontal sub-navigation tab bar above the
 * page content so it persists across pipeline / formulations / npd / fa / briefs.
 *
 * Design SSOT: prototypes/design/Monopilot Design System/npd/chrome.jsx:76-121
 * (SubNav) placed below the topbar (app.jsx:178). The subnav is a self-contained
 * client component that reads usePathname itself — no function props cross the
 * RSC boundary (Next.js 16 non-serializable-prop crash guard).
 */
export default async function NpdLayout({ children, params }: NpdLayoutProps) {
  const { locale } = await params;

  return (
    <div data-testid="npd-layout" className="flex min-h-full flex-col bg-slate-50">
      <NpdSubNav locale={locale} />
      {/* Pages own their own padding — keep the layout main padding-less. */}
      <main data-testid="npd-main" className="min-w-0 flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
