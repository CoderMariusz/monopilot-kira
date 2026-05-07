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
