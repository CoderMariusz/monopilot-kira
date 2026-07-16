import { expect, test } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3100';
const routeUrl = (route: string) => new URL(route, baseURL).toString();

test.describe('Scanner login — auth error a11y + layout (W8-SCAN1)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test('invalid PIN error is role=alert and does not overlap the action footer', async ({
    page,
  }) => {
    await page.route('**/api/scanner/login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'invalid_pin' }),
      });
    });

    await page.goto(routeUrl('/en/scanner/login'), { waitUntil: 'networkidle' });
    await expect(page.getByTestId('scanner-frame')).toBeVisible();

    const email = page.locator('#scanner-login-email');
    await email.click();
    await email.fill('operator@apex.pl');
    await expect(email).toHaveValue('operator@apex.pl');

    const scanner = page.getByRole('application', { name: 'MonoPilot Scanner' });
    for (const digit of '1234') {
      await scanner.getByRole('button', { name: digit, exact: true }).click();
    }

    const submit = page.getByRole('button', { name: 'Sign in →' });
    await expect(submit).toBeEnabled();
    await submit.click();

    const alert = scanner.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/Invalid email or PIN/i);
    await expect(alert).toHaveAttribute('aria-live', 'assertive');

    const emailField = page.getByLabel('Email / Login');
    await expect(emailField).toHaveAttribute('aria-invalid', 'true');
    const errId = await alert.getAttribute('id');
    expect(errId).toBeTruthy();
    await expect(emailField).toHaveAttribute('aria-describedby', errId!);

    const alertBox = await alert.boundingBox();
    const submitBox = await submit.boundingBox();
    expect(alertBox, 'error alert must have a bounding box').not.toBeNull();
    expect(submitBox, 'submit button must have a bounding box').not.toBeNull();
    expect(
      alertBox!.y + alertBox!.height,
      'error alert bottom must sit above the footer submit button',
    ).toBeLessThanOrEqual(submitBox!.y);
  });
});
