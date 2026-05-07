// Type declarations for modules without bundled types

declare module 'jest-axe' {
  import { AxeResults } from 'axe-core';

  export interface JestAxeConfigureOptions {
    globalOptions?: Record<string, unknown>;
    impactLevels?: string[];
  }

  export function axe(html: Element | string, options?: Record<string, unknown>): Promise<AxeResults>;
  export function configureAxe(options: JestAxeConfigureOptions): typeof axe;
  export const toHaveNoViolations: {
    toHaveNoViolations(results: AxeResults): { pass: boolean; message(): string };
  };
}

// Augment vitest matchers with jest-axe's toHaveNoViolations
import type { AxeResults } from 'axe-core';

declare module 'vitest' {
  interface Assertion<R = unknown> {
    toHaveNoViolations(): R;
  }
  interface AsymmetricMatchersContaining {
    toHaveNoViolations(): unknown;
  }
}
