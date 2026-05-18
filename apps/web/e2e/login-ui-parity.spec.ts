import { expect, test } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';
const routes = ['/en/login', '/en/login/forgot-password', '/en/login/mfa?factorId=red-contract'];
const routeUrl = (route: string) => new URL(route, baseURL).toString();

test.describe('AUTH-UI-PARITY-001 login computed-style parity', () => {
  for (const route of routes) {
    test(`${route} renders with generated Tailwind utilities, not browser defaults`, async ({ page }) => {
      await page.goto(routeUrl(route));
      await expect(page.getByText(/MonoPilot/i).first()).toBeVisible();
      await expect(page.locator('main').first()).toBeVisible();

      const styles = await page.evaluate(() => {
        const body = window.getComputedStyle(document.body);
        const card = document.querySelector('section');
        const cardStyle = card ? window.getComputedStyle(card) : null;
        const input = document.querySelector('input:not([type="hidden"])');
        const inputStyle = input ? window.getComputedStyle(input) : null;
        return {
          bodyFontFamily: body.fontFamily,
          bodyBackgroundImage: body.backgroundImage,
          bodyBackgroundColor: body.backgroundColor,
          cardWidth: card ? card.getBoundingClientRect().width : 0,
          cardBorderRadius: cardStyle?.borderRadius ?? '',
          inputHeight: input ? input.getBoundingClientRect().height : 0,
          inputBorderRadius: inputStyle?.borderRadius ?? '',
        };
      });

      expect(styles.bodyFontFamily).not.toMatch(/Times New Roman|serif/i);
      expect(styles.bodyBackgroundImage, 'prototype uses layered radial/linear gradients').toContain('gradient');
      expect(styles.bodyBackgroundColor).not.toMatch(/rgb\(255, 255, 255\)|rgba\(0, 0, 0, 0\)/);
      expect(styles.cardWidth, 'prototype card column is 480px at desktop').toBeGreaterThanOrEqual(470);
      expect(styles.cardWidth).toBeLessThanOrEqual(500);
      expect(Number.parseFloat(styles.cardBorderRadius), 'prototype card radius is 12px').toBeGreaterThanOrEqual(10);
      expect(Number.parseFloat(styles.cardBorderRadius)).toBeLessThanOrEqual(14);
      expect(styles.inputHeight, 'prototype inputs are 40px high').toBeGreaterThanOrEqual(38);
      expect(Number.parseFloat(styles.inputBorderRadius), 'prototype inputs have a 6px radius').toBeGreaterThanOrEqual(5);
    });
  }

  test('/en/login exposes prototype footer and sign-in affordances', async ({ page }) => {
    await page.goto(routeUrl('/en/login'));

    await expect(page.getByLabel(/Work email/i)).toBeVisible();
    await expect(page.getByLabel(/Remember me for 30 days/i)).toBeChecked();
    await expect(page.getByText(/Contact your admin/i)).toBeVisible();
    await expect(page.getByText(/Privacy/i)).toBeVisible();
    await expect(page.getByText(/Terms/i)).toBeVisible();
    await expect(page.getByText(/Status/i)).toBeVisible();
  });
});
