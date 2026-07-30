/**
 * The one way to fetch a message whose placeholders are substituted DOWNSTREAM (client-side
 * `.replace('{rows}', n)` / `interpolate(label, {...})`), instead of by next-intl itself.
 *
 * `t('x')` on a message that still holds an unfilled ICU placeholder raises FORMATTING_ERROR
 * and returns the dotted KEY PATH — never the template. Screens that substitute themselves
 * therefore print `settings.users_screen.invitation_sent` at the user, in every language
 * including English. The usual `translated !== key` guard compares that path against the BARE
 * key, so it lets the leak straight through.
 *
 * `t.raw()` yields the template. It is optional here on purpose: tree-backed test translators
 * and the loader-style `t` used by a few screens have no `.raw` and already return the template,
 * and a bare `t.raw(...)` call blows those suites up with "t.raw is not a function".
 *
 * Enforced for every call site by i18n/__tests__/icu-template-key-leak.test.ts.
 */
export type TemplateTranslator = ((key: string) => string) & { raw?: (key: string) => unknown };

export function messageTemplate(t: TemplateTranslator, key: string): string {
  const raw = t.raw?.(key);
  return typeof raw === 'string' ? raw : t(key);
}
