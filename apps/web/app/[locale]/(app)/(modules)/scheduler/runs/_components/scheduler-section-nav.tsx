import Link from 'next/link';

/**
 * F4 — in-module links between the scheduler board and the three new read routes.
 * Kept under runs/ so F4 stays within its NEW-files scope; capacity/settings import it.
 */
const LINKS = [
  { href: '/scheduler', label: 'Board', testId: 'scheduler-nav-board' },
  { href: '/scheduler/runs', label: 'Runs', testId: 'scheduler-nav-runs' },
  { href: '/scheduler/capacity', label: 'Capacity', testId: 'scheduler-nav-capacity' },
  { href: '/scheduler/settings', label: 'Settings', testId: 'scheduler-nav-settings' },
  {
    href: '/scheduler/changeover-matrix',
    label: 'Changeover matrix',
    testId: 'scheduler-nav-matrix',
  },
] as const;

export function SchedulerSectionNav({
  locale,
  active,
}: {
  locale: string;
  active: 'board' | 'runs' | 'capacity' | 'settings' | 'matrix';
}) {
  return (
    <nav
      aria-label="Scheduler sections"
      data-testid="scheduler-section-nav"
      className="flex flex-wrap gap-2"
    >
      {LINKS.map((link) => {
        const key = link.href.replace('/scheduler', '').replace(/^\//, '') || 'board';
        const isActive =
          (active === 'board' && key === 'board') ||
          (active === 'runs' && key === 'runs') ||
          (active === 'capacity' && key === 'capacity') ||
          (active === 'settings' && key === 'settings') ||
          (active === 'matrix' && key === 'changeover-matrix');
        return (
          <Link
            key={link.href}
            href={`/${locale}${link.href}`}
            data-testid={link.testId}
            aria-current={isActive ? 'page' : undefined}
            className={
              isActive
                ? 'rounded-lg border border-slate-900 bg-slate-900 px-3 py-1.5 text-sm font-medium text-white'
                : 'rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:border-slate-300'
            }
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
