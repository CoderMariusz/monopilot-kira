/**
 * Technical module i18n (Polish) parity evidence — live app harness.
 *
 * Asserts the Technical sub-nav rail + dashboard resolve user-facing labels via
 * next-intl on the REAL /pl/technical screen (not a self-contained HTML stub).
 *
 * Surfaces under test:
 *   - apps/web/components/shell/technical-subnav.tsx
 *   - apps/web/app/[locale]/(app)/(modules)/technical/page.tsx
 *
 * Artifacts → apps/web/e2e/artifacts/TECHNICAL-I18N-PL/*.png
 */
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { TECHNICAL_NAV_GROUPS } from '../lib/navigation/technical-nav';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const evidenceDir = path.join(__dirname, 'artifacts/TECHNICAL-I18N-PL');
const viewport = { width: 1440, height: 1000 };

const pl = JSON.parse(
  readFileSync(path.join(__dirname, '../i18n/pl.json'), 'utf8'),
) as Record<string, unknown>;
const navPL = (pl.Navigation as Record<string, unknown>).technical as Record<string, unknown>;
const dashPL = (pl.technical as Record<string, unknown>).dashboard as Record<string, unknown>;

function tNav(key: string): string {
  return key.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && part in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, navPL) as string;
}

test.describe('Technical PL i18n parity evidence', () => {
  test.skip(
    !baseURL,
    'PLAYWRIGHT_BASE_URL unset — live authenticated server required; RTL/i18n unit tests are the fallback evidence.',
  );

  test('Technical rail + dashboard render real Polish (i18n parity evidence)', async ({ page }) => {
    mkdirSync(evidenceDir, { recursive: true });
    await page.setViewportSize(viewport);
    await page.goto(`${baseURL}/pl/technical`, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('[data-screen="technical-dashboard"]')).toBeVisible({ timeout: 12_000 });

    const subnav = page.getByTestId('technical-subnav');
    await expect(subnav).toBeVisible();
    await expect(subnav).toHaveAttribute('aria-label', String(navPL.aria?.nav ?? ''));

    const overviewKey = TECHNICAL_NAV_GROUPS[0].i18nKey;
    const costTraceKey = TECHNICAL_NAV_GROUPS.find((g) => g.id === 'cost-trace')!.i18nKey;
    await expect(page.getByText(tNav(overviewKey), { exact: true })).toBeVisible();
    await expect(page.getByText(tNav(costTraceKey), { exact: true })).toBeVisible();
    await expect(page.getByText(tNav('items.boms'), { exact: true }).first()).toBeVisible();
    await expect(page.getByText(tNav('items.traceability'), { exact: true })).toBeVisible();

    const dashTitle = String((dashPL as { title?: string }).title ?? '');
    await expect(page.getByRole('heading', { name: dashTitle })).toBeVisible();
    await expect(
      page.getByText(String((dashPL as { kpi?: { activeItems?: { label?: string } } }).kpi?.activeItems?.label ?? ''), {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(
        String((dashPL as { quickActions?: { createItem?: string } }).quickActions?.createItem ?? ''),
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByText(String((dashPL as { recentChanges?: { empty?: string } }).recentChanges?.empty ?? ''), {
        exact: true,
      }),
    ).toBeVisible();

    await page.screenshot({ path: path.join(evidenceDir, 'technical-pl-full.png'), fullPage: true });
    await subnav.screenshot({ path: path.join(evidenceDir, 'technical-pl-subnav.png') });
  });
});
