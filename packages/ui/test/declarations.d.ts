// Ambient declarations for modules without bundled type definitions

declare module 'jest-axe' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function axe(html: any, options?: Record<string, unknown>): Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const toHaveNoViolations: any;
}

// Augment vitest matchers with jest-axe's toHaveNoViolations
declare module 'vitest' {
  interface Assertion<R = unknown> {
    toHaveNoViolations(): R;
  }
}
