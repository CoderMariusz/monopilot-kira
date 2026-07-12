import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * B3e — each items mutation must revalidate the list route. Pinned at the
 * source level: if the safeRevalidatePath('/technical/items') call is removed
 * from a mutation action, this fails. (A full mocked-flow test would need the
 * whole withOrgContext/DB harness; this pins the regression cheaply and honestly.)
 */
const ACTIONS = ['create-item.ts', 'update-item.ts', 'deactivate-item.ts'];

describe('technical items list revalidation (B3e)', () => {
  for (const file of ACTIONS) {
    it(`${file} revalidates /technical/items after a successful mutation`, () => {
      const src = readFileSync(join(__dirname, file), 'utf8');
      expect(src).toMatch(/safeRevalidatePath\(\s*['"]\/technical\/items['"]/);
    });
  }
});
