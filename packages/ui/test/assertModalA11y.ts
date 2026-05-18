import { expect } from 'vitest';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

/**
 * Assertion helper for Modal a11y compliance
 * Verifies: role='dialog', aria-modal='true', aria-labelledby set, focus trap
 */
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

  // Focus-trap proof: the shared Modal primitive marks the Radix focus scope on
  // Dialog.Content, and Radix installs focus guards in document.body while the
  // focus scope is mounted. A fake ARIA-only dialog has neither proof.
  const hasTrapMarker = dialogElement.getAttribute('data-focus-trap') === 'radix-dialog';
  const hasRadixFocusGuards = document.querySelectorAll('[data-radix-focus-guard]').length >= 2;
  if (!hasTrapMarker || !hasRadixFocusGuards) {
    throw new Error('Modal focus trap is not demonstrably installed');
  }

  // Axe accessibility scan
  const results = await axe(container);
  expect(results).toHaveNoViolations();
}
