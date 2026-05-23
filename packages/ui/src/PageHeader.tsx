import type { ReactNode } from 'react';

type BreadcrumbItem = {
  label: string;
  href?: string;
};

export type PageHeaderProps = {
  title: string;
  subtitle?: string;
  breadcrumb?: BreadcrumbItem[];
  actions?: ReactNode;
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function PageHeader({ title, subtitle, breadcrumb, actions }: PageHeaderProps) {
  const hasBreadcrumb = Boolean(breadcrumb?.length);

  return (
    <header
      data-testid="page-header"
      className="sg-head flex items-end justify-between gap-6 border-b border-slate-200 pb-4"
    >
      <div className="min-w-0 space-y-2">
        {hasBreadcrumb ? (
          <nav data-testid="page-header-breadcrumb" aria-label="Breadcrumb" className="text-xs text-slate-500">
            <ol className="flex flex-wrap items-center gap-2">
              {breadcrumb?.map((item, index) => {
                const isLast = index === breadcrumb.length - 1;
                return (
                  <li key={`${item.label}-${index}`} className="inline-flex items-center gap-2">
                    {index > 0 ? <span aria-hidden="true">/</span> : null}
                    {item.href ? (
                      <a href={item.href} aria-current={isLast ? 'page' : undefined} className={cx('hover:text-slate-900', isLast && 'font-medium text-slate-700')}>
                        {item.label}
                      </a>
                    ) : (
                      <span aria-current={isLast ? 'page' : undefined} className={cx(isLast && 'font-medium text-slate-700')}>
                        {item.label}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        ) : null}

        <div>
          <h1 data-testid="page-header-title" className="sg-title text-2xl font-semibold tracking-tight text-slate-950">
            {title}
          </h1>
          {subtitle ? (
            <p data-testid="page-header-subtitle" className="sg-sub mt-1 text-sm text-slate-500">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>

      {actions ? (
        <div data-testid="page-header-actions" className="flex shrink-0 items-center gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  );
}

export default PageHeader;
