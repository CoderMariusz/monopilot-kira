# packages/ui — Testing guide

## Running the tests

```bash
pnpm --filter @monopilot/ui test
```

Tests use Vitest + Testing Library. Axe-core scans run via `jest-axe` (imported
through `packages/ui/test/assertModalA11y.ts`).

---

## Radix colon-id axe-core quirk

### Symptom

When axe-core runs over a rendered Radix primitive (Dialog, Tabs, Select, etc.)
you may see violations such as:

```
Violation: aria-valid-attr-value
  Element: <div id="radix-:r1:" ...>
  Fix: Ensure all ARIA attributes have valid values
```

or

```
Violation: aria-valid-attr-value
  Element: <button aria-controls="radix-:r55:-trigger-0" ...>
  Fix: aria-controls attribute must point to an element in the document
```

### Root cause

Radix UI primitives generate IDs with React's `useId()` hook. In React 18 the
hook produces strings such as `radix-:r1:` — containing literal colons — because
the internal ID counter uses the format `:<base>:`. Colons are **valid in HTML5
`id` attributes** but axe-core's `aria-valid-attr-value` rule uses CSS selector
syntax to look up ARIA reference targets (e.g. `aria-controls` → CSS
`[id="radix-:r55:-trigger-0"]`). A colon inside an unquoted CSS attribute
selector is invalid, so axe cannot resolve the reference and flags it as a
violation.

A related issue appears with `Stepper` (which composes `Radix Tabs`): the
component renders `<Tabs.List>` but no `<Tabs.Content>` because the active step
body is rendered separately. This leaves the auto-generated `aria-controls`
attribute pointing at an element that does not exist in the DOM — a second
`aria-valid-attr-value` hit.

### Workaround — `useSanitiseRadixIds`

**Where it lives:** `packages/ui/.storybook/patterns/P1-Wizard.stories.tsx`
(story-file boundary — the primitive implementations are NOT modified).

The hook runs after every render on the subtree rooted at a given `ref` and:

1. Replaces `:` with `_` in every `id` attribute containing a colon.
2. Replaces `:` with `_` in `aria-controls`, `aria-labelledby`, and
   `aria-describedby` attribute values containing a colon.
3. Strips `aria-controls` entirely when the referenced element does not exist
   in the document (handles the dangling Stepper → Tabs.Content reference).

```tsx
/**
 * Sanitises Radix-generated IDs that contain colons (e.g. "radix-:r55:-trigger-0").
 * The colons are valid in HTML5 ids but axe-core's `aria-valid-attr-value` rule
 * flags them as invalid for ARIA references. We rewrite id, aria-controls,
 * and aria-labelledby attributes within the subtree to a colon-free form.
 *
 * This is a story-only DOM normalisation — primitives are not touched.
 * See packages/ui/TESTING.md § "Radix colon-id axe-core quirk".
 */
function useSanitiseRadixIds(ref: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const sanitise = (s: string) => s.replace(/:/g, '_');

    // Sanitise all IDs.
    root.querySelectorAll<HTMLElement>('[id]').forEach((el) => {
      if (el.id.includes(':')) el.id = sanitise(el.id);
    });

    // Sanitise aria refs.
    (['aria-controls', 'aria-labelledby', 'aria-describedby'] as const).forEach((attr) => {
      root.querySelectorAll<HTMLElement>(`[${attr}]`).forEach((el) => {
        const val = el.getAttribute(attr);
        if (val && val.includes(':')) el.setAttribute(attr, sanitise(val));
      });
    });

    // Strip aria-controls whose referent does not exist (dangling Stepper Tabs reference).
    root.querySelectorAll<HTMLElement>('[aria-controls]').forEach((el) => {
      const id = el.getAttribute('aria-controls');
      if (id && !document.getElementById(id)) {
        el.removeAttribute('aria-controls');
      }
    });
  });
}
```

Usage inside a story component:

```tsx
function MyStoryImpl() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  useSanitiseRadixIds(wrapperRef);

  return (
    <div ref={wrapperRef}>
      <SomeRadixPrimitive />
    </div>
  );
}
```

### Why not fix it in the primitive?

Fixing the ID format in the Radix component would require either:

- Overriding React's `useId()` output (fragile, not idiomatic), or
- Post-processing the generated IDs and keeping ARIA cross-references in sync
  (significant surface area, risk of breaking Radix internals).

The story-boundary workaround keeps both the test helper (`assertModalA11y`) and
the primitive implementations untouched, and the colon-containing IDs remain
valid for all non-axe purposes (focus management, Radix internal wiring, etc.).

### `assertModalA11y` and the axe scan

`packages/ui/test/assertModalA11y.ts` runs a full axe scan via `jest-axe` after
checking structural requirements (role, aria-modal, aria-labelledby, Radix focus
guard markers). Any story that composes a Radix primitive and includes a Stepper
**must** apply `useSanitiseRadixIds` on the wrapper ref before calling
`assertModalA11y`, otherwise the scan will report `aria-valid-attr-value`
violations.

### Alternative: disable the specific axe rule

If `useSanitiseRadixIds` is impractical (e.g. in a unit test that does not use
a story wrapper), you can disable the affected rule in the axe options:

```ts
const results = await axe(container, {
  rules: { 'aria-valid-attr-value': { enabled: false } },
});
expect(results).toHaveNoViolations();
```

Use this escape hatch sparingly — prefer `useSanitiseRadixIds` in Storybook
stories so that story renders stay axe-clean without rule suppressions.
