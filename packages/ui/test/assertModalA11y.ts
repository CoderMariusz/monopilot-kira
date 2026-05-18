import { expect } from 'vitest';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

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
  expect(results).toHaveNoViolations();
}
