import { expect, test } from '@playwright/test';

const CACHED_ROUTE = '/';
const UNCACHED_ROUTE = `/__offline-e2e-${Date.now()}`;

async function waitForServiceWorkerReady(page: import('@playwright/test').Page) {
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          if (!('serviceWorker' in navigator)) {
            return 'unsupported';
          }

          const registration = await navigator.serviceWorker.ready;
          return registration.active?.state ?? 'missing-active-worker';
        }),
      { message: 'service worker should install and activate before offline navigation', timeout: 30_000 },
    )
    .toBe('activated');

  if (await page.evaluate(() => navigator.serviceWorker.controller === null)) {
    await page.reload({ waitUntil: 'networkidle' });
  }

  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          if (!('serviceWorker' in navigator)) {
            return 'unsupported';
          }

          return navigator.serviceWorker.controller?.state ?? 'missing-controller';
        }),
      { message: 'service worker should control the page before offline navigation', timeout: 30_000 },
    )
    .toBe('activated');
}

test.describe('PWA offline navigation', () => {
  test('serves the cached app shell and offline fallback in Chromium', async ({ page }) => {
    await page.goto(CACHED_ROUTE, { waitUntil: 'networkidle' });
    await waitForServiceWorkerReady(page);

    await page.goto(CACHED_ROUTE, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: /monopilot kira/i })).toBeVisible();

    await page.context().setOffline(true);

    await page.goto(CACHED_ROUTE, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /monopilot kira/i })).toBeVisible();

    await page.goto(UNCACHED_ROUTE, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('offline-fallback')).toBeVisible();
  });
});
