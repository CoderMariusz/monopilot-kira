import { createRequire } from 'node:module';
import { expect } from 'vitest';

const require = createRequire(import.meta.url);
const { axe, toHaveNoViolations } = require('jest-axe') as {
  axe: (html: Element | DocumentFragment, options?: Record<string, unknown>) => Promise<unknown>;
  toHaveNoViolations: Record<string, unknown>;
};

expect.extend(toHaveNoViolations as never);

export async function assertModalA11y(container: HTMLElement) {
  const dialogElement = container.querySelector('[role="dialog"]');

  // Role and aria-modal
  expect(dialogElement).toBeDefined();
  if (!dialogElement) throw new Error('Modal element with role="dialog" not found');

  expect(dialogElement).toHaveAttribute('role', 'dialog');
  expect(dialogElement).toHaveAttribute('aria-modal', 'true');

  // aria-labelledby
  expect(dialogElement).toHaveAttribute('aria-labelledby');
  const labelledById = dialogElement.getAttribute('aria-labelledby');
  const labelElement = labelledById
    ? Array.from(container.querySelectorAll('[id]')).find((element) => element.id === labelledById)
    : undefined;
  expect(labelElement).toBeDefined();

  // Radix installs [data-radix-focus-guard] in document.body while a focus scope is mounted; fake dialogs have neither marker.
  const hasTrapMarker = dialogElement.getAttribute('data-focus-trap') === 'radix-dialog';
  const hasRadixFocusGuards = document.querySelectorAll('[data-radix-focus-guard]').length >= 2;
  if (!hasTrapMarker || !hasRadixFocusGuards) {
    throw new Error('Modal focus trap is not demonstrably installed');
  }

  // Axe accessibility scan
  const results = await axe(container);
  (expect(results) as unknown as { toHaveNoViolations: () => void }).toHaveNoViolations();
}
