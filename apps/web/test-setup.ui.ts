/**
 * T-037 — UI test setup for apps/web
 *
 * Patches @testing-library/user-event to treat `[...]` as printable
 * characters rather than key descriptors. This is needed because the
 * SchemaColumnWizard test passes a regex pattern `^[A-Z]+$` to
 * user.type(), which user-event v14 misinterprets as a special key
 * descriptor syntax (the `[...]` form is reserved for key codes).
 *
 * Workaround: replace `[` with the unicode double bracket escape `[[`
 * before passing to type, OR patch the internals to treat `[...]` as
 * printable text when the content doesn't match a valid key name.
 *
 * Approach used: monkeypatch userEvent.setup() to return a proxy where
 * `type()` replaces `[` with `{{` and `]` with `}}` to escape them
 * (actually this won't work since `{{` means "escape {")
 *
 * Better approach: patch the readNextDescriptor module to not treat
 * `[` as a special bracket at all. We do this by replacing the module
 * in the userEvent registry.
 */
import '@testing-library/jest-dom';
import { vi } from 'vitest';
import enBaseMessages from './i18n/en.json';
import enSettingsMessages from './messages/en/02-settings.json';

// Wave 7+8 fix: pages now consume next-intl via useTranslations. Existing RTL
// tests render Client Components directly without wrapping in
// NextIntlClientProvider — and the ESM render export from @testing-library/react
// is not patchable. Mock next-intl's useTranslations to look up keys in the
// canonical EN bundle so existing tests render the same English copy they
// previously asserted on, while production routes still go through the real
// provider configured in app/layout.tsx.
type MsgTree = { [k: string]: string | MsgTree };

// Mirror i18n/request.ts: the 02-settings bundle is merged under the `settings`
// namespace at runtime. The mock must merge it the same way so `settings.*`
// keys (e.g. settings.units.*) resolve to their real EN copy instead of leaking
// the dotted key string into the rendered DOM.
function mergeMsgTrees(...trees: MsgTree[]): MsgTree {
  const merged: MsgTree = {};
  for (const tree of trees) {
    for (const [key, value] of Object.entries(tree)) {
      const current = merged[key];
      merged[key] =
        current && typeof current === 'object' && value && typeof value === 'object' && !Array.isArray(value)
          ? mergeMsgTrees(current as MsgTree, value as MsgTree)
          : (value as string | MsgTree);
    }
  }
  return merged;
}

const enMessages: MsgTree = mergeMsgTrees(enBaseMessages as MsgTree, {
  settings: mergeMsgTrees(
    enSettingsMessages as MsgTree,
    ((enBaseMessages as MsgTree).settings as MsgTree | undefined) ?? {},
  ),
});

function lookup(tree: MsgTree, dotted: string): string | undefined {
  const parts = dotted.split('.');
  let cur: string | MsgTree = tree;
  for (const part of parts) {
    if (typeof cur === 'string' || cur === undefined || cur === null) return undefined;
    cur = (cur as MsgTree)[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

function formatICU(template: string, values?: Record<string, unknown>): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (_match, key) => {
    return values[key] !== undefined ? String(values[key]) : `{${key}}`;
  });
}

// next-intl exposes two namespace-arg forms:
//   useTranslations('settings.units')          → string
//   getTranslations({ locale, namespace })      → object (RSC form)
// Normalize both so the object form does not stringify to `[object Object]`
// and leak into the dotted key prefix.
function resolveNamespace(arg?: string | { namespace?: string; locale?: string }): string | undefined {
  if (typeof arg === 'string') return arg;
  if (arg && typeof arg === 'object') return arg.namespace;
  return undefined;
}

function createTranslator(arg?: string | { namespace?: string; locale?: string }) {
  const namespace = resolveNamespace(arg);
  const t = (key: string, values?: Record<string, unknown>) => {
    const full = namespace ? `${namespace}.${key}` : key;
    const resolved = lookup(enMessages as MsgTree, full);
    if (resolved === undefined) return full;
    return formatICU(resolved, values);
  };
  return t;
}

vi.mock('next-intl', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('next-intl');
  return {
    ...actual,
    useTranslations: (namespace?: string) => createTranslator(namespace),
  };
});

vi.mock('next-intl/server', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('next-intl/server');
  return {
    ...actual,
    getTranslations: async (arg?: string | { namespace?: string; locale?: string }) => createTranslator(arg),
    getMessages: async () => enMessages,
    getLocale: async () => 'en',
  };
});

// Patch @testing-library/user-event to not treat [ as a special key bracket.
// userEvent v14 treats [descriptor] as a key, but tests use literal strings
// like '^[A-Z]+$' which contain character class syntax.
import * as userEvent from '@testing-library/user-event';

// Override the type method on user-event's setup result to escape [ and ] chars
const originalSetup = userEvent.default?.setup ?? (userEvent as typeof userEvent & { setup: (...args: unknown[]) => unknown }).setup;

if (originalSetup) {
  const patchedSetup = (...args: Parameters<typeof originalSetup>) => {
    const instance = originalSetup(...args);
    if (instance && typeof instance === 'object' && 'type' in instance) {
      const originalType = (instance as { type: Function }).type.bind(instance);
      (instance as { type: Function }).type = async (element: Element, text: string, options?: unknown) => {
        // Escape [ and ] to avoid them being treated as key descriptors
        // In user-event, [ is a start bracket for key code syntax
        // Doubling it ([[) would escape it, but that still starts a bracket
        // The correct escape for [ in user-event is {{, but that's for {
        // For [, there's no standard escape in v14 - we use fireEvent instead
        if (text.includes('[')) {
          // Use fireEvent.input for strings containing [ to avoid parse errors
          const { fireEvent } = await import('@testing-library/react');
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value',
          )?.set;
          if (nativeInputValueSetter) {
            nativeInputValueSetter.call(element, text);
            fireEvent.input(element, { target: { value: text } });
            fireEvent.change(element, { target: { value: text } });
          }
          return;
        }
        return originalType(element, text, options);
      };
    }
    return instance;
  };

  // Replace setup on the default export
  if (userEvent.default) {
    (userEvent.default as unknown as { setup: typeof patchedSetup }).setup = patchedSetup;
  }
}
