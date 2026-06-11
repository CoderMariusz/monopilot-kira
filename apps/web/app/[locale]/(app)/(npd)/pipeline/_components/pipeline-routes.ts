/**
 * Locale-aware route builder for the pipeline components (Codex batch-D F3).
 *
 * Every app route lives under /[locale]/… — a bare router.push('/pipeline/…')
 * or <Link href="/pipeline/…"> drops the locale prefix and lands outside the
 * localized tree. Convention mirrors the sibling components (fa-list-table,
 * fa-create-modal-host, dashboard-screen): the locale is the first pathname
 * segment when it is a known locale, '' otherwise (defensive — the i18n
 * middleware always prefixes in practice).
 */

const LOCALES = ['en', 'pl', 'ro', 'uk'];

export function localePrefixFrom(pathname: string | null): string {
  const segment = (pathname ?? '/').split('/')[1] ?? '';
  return LOCALES.includes(segment) ? `/${segment}` : '';
}

/** /{locale}/pipeline/{projectId}[?modal=…] */
export function projectRoute(
  pathname: string | null,
  projectId: string,
  modal?: string,
): string {
  const base = `${localePrefixFrom(pathname)}/pipeline/${projectId}`;
  return modal ? `${base}?modal=${modal}` : base;
}
