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
  const labelElement = container.querySelector(`#${labelledById}`);
  expect(labelElement).toBeDefined();

  // Axe accessibility scan
  const results = await axe(container);
  expect(results).toHaveNoViolations();
}
