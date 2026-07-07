/**
 * CI guard: `'use server'` modules may export ONLY async functions.
 * Types/consts/enums pass tsc but break `next build` (server-reference generation).
 *
 * D1a regression targets are hard-fail. Repo-wide ESLint (`monopilot/no-export-type-in-use-server`)
 * catches new violations elsewhere on `pnpm lint`.
 */
import { describe, expect, it } from 'vitest';

import {
  D1A_USE_SERVER_REGRESSION_FILES,
  scanD1aRegressionTargets,
} from './lib/use-server-export-analyzer';

describe('use server export contract (D1a regression)', () => {
  const violations = scanD1aRegressionTargets();

  it('covers all nine D1a target modules', () => {
    expect(D1A_USE_SERVER_REGRESSION_FILES).toHaveLength(9);
  });

  it('D1a targets export only async functions', () => {
    if (violations.length > 0) {
      const detail = violations.map((v) => `${v.file}:${v.line} → ${v.exportLine}`).join('\n');
      expect.fail(`'use server' non-async export(s) in D1a targets:\n${detail}`);
    }
    expect(violations).toEqual([]);
  });
});
