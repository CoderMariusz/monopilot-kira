/**
 * Tests for the `useSanitiseRadixIds` hook pattern.
 *
 * The hook itself lives in story files (story-only DOM normalisation — the
 * primitive implementations are not touched). See the canonical documentation
 * and worked example in:
 *
 *   packages/ui/TESTING.md § "Radix colon-id axe-core quirk"
 *
 * That section explains:
 *   - Symptom: axe-core `aria-valid-attr-value` violations on Radix IDs
 *     containing colons (e.g. "radix-:r1:").
 *   - Root cause: React 18's `useId()` emits colon-delimited strings that are
 *     valid HTML5 ids but break CSS selector resolution in axe-core.
 *   - Workaround: `useSanitiseRadixIds(ref)` rewrites `:` → `_` in `id`,
 *     `aria-controls`, `aria-labelledby`, and `aria-describedby` attributes
 *     within the ref subtree, and strips dangling `aria-controls` references.
 *   - Where it lives: `packages/ui/.storybook/patterns/P1-Wizard.stories.tsx`.
 *
 * T-031 carry-forward: hook is story-boundary only; primitives are untouched.
 * See `_meta/atomic-tasks/00-foundation/notes/T-031.md` for full rationale.
 */

import { describe, it } from 'vitest';

// Placeholder: the hook is story-only (no exportable module to unit-test).
// If a shared exportable hook is ever extracted from the story boundary into
// packages/ui/src/hooks/use-sanitise-radix-ids.ts, add import + real
// assertions here and remove this describe.todo block.
describe('useSanitiseRadixIds (story-only hook)', () => {
  it.todo(
    'should replace colons in Radix-generated ids with underscores — ' +
      'extract hook to packages/ui/src/hooks/ to enable unit tests here; ' +
      'see packages/ui/TESTING.md § "Radix colon-id axe-core quirk"',
  );
});
