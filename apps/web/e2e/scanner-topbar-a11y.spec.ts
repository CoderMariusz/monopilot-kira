import { expect, test } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3100';
const routeUrl = (route: string) => new URL(route, baseURL).toString();

test.describe('Scanner topbar — offline badge + Back touch target (W8-SCAN2)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test('sync badge shows OFFLINE when network is offline and ONLINE after reconnect', async ({
    page,
    context,
  }) => {
    await page.goto(routeUrl('/en/scanner/login'), { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('scanner-frame')).toBeVisible();
    const badge = page.getByTestId('scanner-sync-badge');

    await expect(badge).toHaveText('ONLINE');

    await context.setOffline(true);
    await expect(badge).toHaveText('OFFLINE');
    await expect(badge).toHaveAttribute('aria-label', /OFFLINE/i);

    await context.setOffline(false);
    await expect(badge).toHaveText('ONLINE');
    await expect(badge).toHaveAttribute('aria-label', /ONLINE/i);
  });

  test('Back button on pin-setup has at least 44×44px touch target', async ({ page }) => {
    await page.goto(routeUrl('/en/scanner/login/pin-setup'), { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('scanner-frame')).toBeVisible();
    const back = page.getByRole('button', { name: 'Back' });
    await expect(back).toBeVisible();

    const box = await back.boundingBox();
    expect(box, 'Back button must have a measurable bounding box').not.toBeNull();
    expect(box!.width, 'Back width must be ≥44px').toBeGreaterThanOrEqual(44);
    expect(box!.height, 'Back height must be ≥44px').toBeGreaterThanOrEqual(44);
  });
});
