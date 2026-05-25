# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/settings-reference.spec.ts >> settings reference UI-SET-006 modal CRUD parity >> settings reference route renders live reference table and shared edit/delete modal flows
- Location: apps/web/e2e/settings-reference.spec.ts:4:7

# Error details

```
Error: Authenticated /en/settings/reference must render the prototype-backed Reference Data screen, not a login redirect, scaffold, or load-error page.

expect(locator).toBeVisible() failed

Locator: getByTestId('settings-reference-data-screen')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Authenticated /en/settings/reference must render the prototype-backed Reference Data screen, not a login redirect, scaffold, or load-error page. with timeout 5000ms
  - waiting for getByTestId('settings-reference-data-screen')

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e3]:
    - main [ref=e4]:
      - region "Welcome back" [ref=e5]:
        - generic [ref=e7]:
          - generic [ref=e8]:
            - generic [ref=e9]: M
            - generic [ref=e10]: MonoPilot
          - heading "Welcome back" [level=1] [ref=e11]
          - paragraph [ref=e12]: Sign in to your MES workspace
          - status [ref=e13]: Enter your credentials to continue securely.
          - generic [ref=e14]:
            - generic [ref=e15]:
              - generic [ref=e16]: Work email
              - textbox "Work email" [active] [ref=e18]:
                - /placeholder: you@company.com
            - generic [ref=e19]:
              - generic [ref=e20]: Password
              - textbox "Password" [ref=e22]:
                - /placeholder: ••••••••
            - generic [ref=e23]:
              - generic [ref=e24] [cursor=pointer]:
                - checkbox "Remember me for 30 days" [checked] [ref=e25]
                - text: Remember me for 30 days
              - link "Forgot password?" [ref=e26] [cursor=pointer]:
                - /url: /en/login/forgot-password
            - button "Sign in" [ref=e27]
          - generic [ref=e30]: or
          - button "SSO sign-in coming soon" [disabled] [ref=e32]
          - generic [ref=e33]:
            - text: Do not have an account?
            - link "Contact your admin" [ref=e34] [cursor=pointer]:
              - /url: mailto:admin@monopilot.app
    - contentinfo [ref=e35]:
      - text: © 2026 MonoPilot MES·
      - link "Privacy" [ref=e36] [cursor=pointer]:
        - /url: "#privacy"
      - text: ·
      - link "Terms" [ref=e37] [cursor=pointer]:
        - /url: "#terms"
      - text: ·
      - link "Status" [ref=e38] [cursor=pointer]:
        - /url: "#status"
      - text: ·v3.1.0
  - button "Open Next.js Dev Tools" [ref=e44] [cursor=pointer]:
    - img [ref=e45]
  - alert [ref=e48]
```

# Test source

```ts
  1  | import { expect, test } from '@playwright/test';
  2  | 
  3  | test.describe('settings reference UI-SET-006 modal CRUD parity', () => {
  4  |   test('settings reference route renders live reference table and shared edit/delete modal flows', async ({ page }) => {
  5  |     const consoleErrors: string[] = [];
  6  |     page.on('console', (message) => {
  7  |       if (['error', 'warning'].includes(message.type())) consoleErrors.push(`${message.type()}: ${message.text()}`);
  8  |     });
  9  |     page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
  10 | 
  11 |     const baseURL = process.env.PLAYWRIGHT_BASE_URL || process.env.BASE_URL;
  12 |     expect(
  13 |       baseURL,
  14 |       'Set PLAYWRIGHT_BASE_URL (authenticated app server) before running the UI-SET-006 browser parity smoke; do not silently skip authenticated /en/settings/reference evidence.',
  15 |     ).toBeTruthy();
  16 | 
  17 |     await page.goto(new URL('/en/settings/reference', baseURL).toString());
  18 | 
  19 |     await expect(
  20 |       page.getByTestId('settings-reference-data-screen'),
  21 |       'Authenticated /en/settings/reference must render the prototype-backed Reference Data screen, not a login redirect, scaffold, or load-error page.',
> 22 |     ).toBeVisible();
     |       ^ Error: Authenticated /en/settings/reference must render the prototype-backed Reference Data screen, not a login redirect, scaffold, or load-error page.
  23 |     await expect(page.getByRole('heading', { name: /^Reference data$/ })).toBeVisible();
  24 |     await expect(page.getByTestId('reference-table-card-grid')).toBeVisible();
  25 |     await expect(page.getByRole('table', { name: /Allergens reference/i })).toBeVisible();
  26 | 
  27 |     await page.getByRole('button', { name: /Edit .+/i }).first().click();
  28 |     await expect(page.getByTestId('ref-row-edit-modal')).toBeVisible();
  29 |     await expect(page.getByTestId('ref-row-edit-modal')).toHaveAttribute('data-modal-id', 'SM-11');
  30 |     await page.keyboard.press('Escape');
  31 | 
  32 |     await page.getByRole('button', { name: /Delete .+/i }).first().click();
  33 |     await expect(page.getByTestId('delete-reference-data-modal')).toBeVisible();
  34 |     await expect(page.getByTestId('delete-reference-data-modal')).toHaveAttribute('data-modal-id', 'SM-10');
  35 |     await expect(page.getByLabel(/type DELETE to confirm/i)).toBeVisible();
  36 | 
  37 |     expect(consoleErrors, 'settings reference route must have no browser console warnings/errors during modal CRUD parity smoke').toEqual([]);
  38 |   });
  39 | });
  40 | 
```