import { expect, test } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';
const routeUrl = (route: string) => new URL(route, baseURL).toString();

const shell = {
  root: '[data-testid="app-shell"]',
  topbar: '[data-testid="app-topbar"]',
  sidebar: '[data-testid="app-sidebar"]',
  main: '[data-testid="app-shell-main"]',
};

async function expectNoShellMarkup(body: string) {
  expect(body, 'response body must not contain AppShell root markup').not.toContain('data-testid="app-shell"');
  expect(body, 'response body must not contain AppSidebar markup').not.toContain('data-testid="app-sidebar"');
  expect(body, 'response body must not contain AppTopbar markup').not.toContain('data-testid="app-topbar"');
}

test.describe('UI-131 AppShell route-group behavior', () => {
  test('authenticated /en/ renders AppShell chrome and keeps existing page content in shell main', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const response = await page.goto(routeUrl('/en/'), { waitUntil: 'domcontentloaded' });

    expect(response?.status(), 'authenticated /en/ should render the app page, not redirect to login').toBe(200);
    expect(new URL(page.url()).pathname, 'authenticated /en/ should stay on /en/').toBe('/en/');

    await expect(page.locator(shell.root), 'AppShell root should render for authenticated /en/').toBeVisible();
    await expect(page.locator(shell.topbar), 'AppTopbar should render for authenticated /en/').toBeVisible();
    await expect(page.locator(shell.sidebar), 'AppSidebar should render for authenticated /en/').toBeVisible();
    await expect(page.locator(shell.main), 'AppShell main slot should render for authenticated /en/').toBeVisible();
    await expect(page.locator(shell.main), 'existing page content must remain inside shell main').toContainText(/MonoPilot|Redirect po logowaniu|application/i);

    const topbarBox = await page.locator(shell.topbar).boundingBox();
    const sidebarBox = await page.locator(shell.sidebar).boundingBox();
    expect(Math.round(topbarBox?.height ?? 0), 'topbar height should resolve from --shell-topbar-h').toBe(56);
    expect(Math.round(sidebarBox?.width ?? 0), 'sidebar width should resolve from --shell-sidebar-w').toBe(280);
  });

  test('unauthenticated /en/ redirects to /en/login without streaming AppShell markup', async ({ request }) => {
    const response = await request.get(routeUrl('/en/'), { maxRedirects: 0 });
    expect([302, 307], 'unauthenticated /en/ should redirect before rendering the app shell').toContain(response.status());

    const location = response.headers()['location'];
    expect(location, 'unauthenticated redirect should target the locale login route').toBeTruthy();
    expect(new URL(location!, baseURL).pathname).toBe('/en/login');

    await expectNoShellMarkup(await response.text());
  });

  test('/en/login response never includes AppShell chrome', async ({ page }) => {
    const response = await page.goto(routeUrl('/en/login'), { waitUntil: 'domcontentloaded' });
    expect(response?.status(), '/en/login should remain publicly renderable').toBe(200);

    await expect(page.locator(shell.root), '/en/login must not render AppShell').toHaveCount(0);
    await expect(page.locator(shell.sidebar), '/en/login must not render AppSidebar').toHaveCount(0);
    await expect(page.locator(shell.topbar), '/en/login must not render AppTopbar').toHaveCount(0);
    await expectNoShellMarkup(await page.locator('body').innerHTML());
  });
});
