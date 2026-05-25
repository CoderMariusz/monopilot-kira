import { expect, test } from '@playwright/test';

test.describe('settings reference UI-SET-006 modal CRUD parity', () => {
  test('settings reference route renders live reference table and shared edit/delete modal flows', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (['error', 'warning'].includes(message.type())) consoleErrors.push(`${message.type()}: ${message.text()}`);
    });
    page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

    const baseURL = process.env.PLAYWRIGHT_BASE_URL || process.env.BASE_URL;
    expect(
      baseURL,
      'Set PLAYWRIGHT_BASE_URL (authenticated app server) before running the UI-SET-006 browser parity smoke; do not silently skip authenticated /en/settings/reference evidence.',
    ).toBeTruthy();

    await page.goto(new URL('/en/settings/reference', baseURL).toString());

    await expect(
      page.getByTestId('settings-reference-data-screen'),
      'Authenticated /en/settings/reference must render the prototype-backed Reference Data screen, not a login redirect, scaffold, or load-error page.',
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Reference data$/ })).toBeVisible();
    await expect(page.getByTestId('reference-table-card-grid')).toBeVisible();
    await expect(page.getByRole('table', { name: /Allergens reference/i })).toBeVisible();

    await page.getByRole('button', { name: /Edit .+/i }).first().click();
    await expect(page.getByTestId('ref-row-edit-modal')).toBeVisible();
    await expect(page.getByTestId('ref-row-edit-modal')).toHaveAttribute('data-modal-id', 'SM-11');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: /Delete .+/i }).first().click();
    await expect(page.getByTestId('delete-reference-data-modal')).toBeVisible();
    await expect(page.getByTestId('delete-reference-data-modal')).toHaveAttribute('data-modal-id', 'SM-10');
    await expect(page.getByLabel(/type DELETE to confirm/i)).toBeVisible();

    expect(consoleErrors, 'settings reference route must have no browser console warnings/errors during modal CRUD parity smoke').toEqual([]);
  });
});
