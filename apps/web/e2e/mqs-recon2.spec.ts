/**
 * RECON 2 — detail pages + create-modal field maps for warehouse / quality /
 * shipping / maintenance. Same rationale as mqs-recon.spec.ts: one pass that opens
 * every "create" affordance and dumps its form fields, so the action specs are
 * written against facts instead of guesses.
 *
 * Output: apps/web/e2e/artifacts/mqs-recon/recon2.json
 * Run: bash scripts/e2e-local.sh apps/web/e2e/mqs-recon2.spec.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { test, type Page } from '@playwright/test';

import { signIn } from './_shared/parity-login';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const artifactDir = path.resolve(__dirname, 'artifacts/mqs-recon');
const L = 'en';

const LP_ID = 'f8885537-c12f-43d1-84da-2c40f001afce';
const PO_ID = '2996caa5-cfbf-4ff2-8fdf-61703604d070';
const SO_ID = 'ac745787-b468-4991-ac8c-2c291b12029a';

type Target = { name: string; route: string; click?: string };

const TARGETS: Target[] = [
  { name: 'lp-detail', route: `/warehouse/license-plates/${LP_ID}` },
  { name: 'receive-po', route: `/warehouse/receive-po/${PO_ID}` },
  { name: 'counts-new', route: '/warehouse/counts', click: 'count-session-new' },
  { name: 'so-detail', route: `/shipping/${SO_ID}` },
  { name: 'so-pick', route: `/shipping/${SO_ID}/pick` },
  { name: 'inspection-new', route: '/quality/inspections', click: 'text=New inspection' },
  { name: 'hold-new', route: '/quality/holds', click: 'text=Create hold' },
  { name: 'ncr-new', route: '/quality/ncrs', click: 'text=Create NCR' },
  { name: 'spec-new', route: '/quality/specifications', click: 'text=Create specification' },
  { name: 'mwo-new', route: '/maintenance', click: 'text=New MWO' },
  { name: 'asset-new', route: '/maintenance/assets', click: 'text=Add asset' },
  { name: 'instrument-new', route: '/maintenance/calibration', click: 'text=Add instrument' },
  { name: 'calibration-record', route: '/maintenance/calibration', click: 'text=Record calibration' },
];

async function dump(page: Page, name: string, route: string, click?: string) {
  const consoleErrors: string[] = [];
  const onConsole = (m: { type: () => string; text: () => string }) => {
    const t = m.text();
    if (m.type() === 'error' && !t.includes('unread notifications') && !t.includes('m ago'))
      consoleErrors.push(t.slice(0, 250));
  };
  page.on('console', onConsole);
  let status: number | null = null;
  let clickError: string | null = null;
  try {
    const resp = await page.goto(`${baseURL}/${L}${route}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    status = resp?.status() ?? null;
    await page.waitForTimeout(1000);
    if (click) {
      const loc = click.startsWith('text=')
        ? page.getByRole('button', { name: new RegExp(click.slice(5), 'i') }).first()
        : page.getByTestId(click).first();
      await loc.click({ timeout: 10_000 });
      await page.waitForTimeout(1200);
    }
  } catch (error) {
    clickError = (error as Error).message.slice(0, 250);
  }

  const data = await page.evaluate(() => {
    const text = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    const vis = (el: Element) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const scope =
      document.querySelector('[role="dialog"]') ??
      document.querySelector('[data-testid="app-shell-main"]') ??
      document.body;
    return {
      dialogOpen: !!document.querySelector('[role="dialog"]'),
      heading: [...scope.querySelectorAll('h1,h2,h3')].filter(vis).map(text).slice(0, 6),
      fields: [...scope.querySelectorAll('input,select,textarea')].map((f) => ({
        tag: f.tagName.toLowerCase(),
        type: (f as HTMLInputElement).type ?? null,
        name: f.getAttribute('name'),
        testid: f.getAttribute('data-testid'),
        id: f.id || null,
        required: (f as HTMLInputElement).required || f.getAttribute('aria-required') === 'true',
        disabled: (f as HTMLInputElement).disabled,
        label:
          (f.id && text(document.querySelector(`label[for="${CSS.escape(f.id)}"]`) ?? document.createElement('i'))) ||
          f.getAttribute('aria-label') ||
          f.getAttribute('placeholder') ||
          null,
        options:
          f.tagName === 'SELECT'
            ? [...(f as HTMLSelectElement).options].map((o) => `${o.value}::${o.text}`).slice(0, 20)
            : undefined,
      })),
      buttons: [...scope.querySelectorAll('button,[role="button"]')]
        .filter(vis)
        .map((b) => ({
          text: text(b).slice(0, 60),
          disabled:
            (b as HTMLButtonElement).disabled === true || b.getAttribute('aria-disabled') === 'true',
          testid: b.getAttribute('data-testid'),
        }))
        .filter((b) => b.text || b.testid)
        .slice(0, 45),
      testids: [...scope.querySelectorAll('[data-testid]')]
        .map((e) => e.getAttribute('data-testid') ?? '')
        .filter((h, i, a) => h && a.indexOf(h) === i)
        .slice(0, 80),
      alerts: [...scope.querySelectorAll('[role="alert"],[data-error],[class*="error"]')]
        .filter(vis)
        .map(text)
        .filter(Boolean)
        .slice(0, 6),
      bodyText: text(scope).slice(0, 900),
    };
  });

  page.off('console', onConsole);
  return { name, route, click: click ?? null, status, clickError, console: consoleErrors.slice(0, 4), ...data };
}

test.describe('MQS recon 2', () => {
  test.skip(!baseURL, 'needs PLAYWRIGHT_BASE_URL (scripts/e2e-local.sh)');
  test.setTimeout(15 * 60_000);

  test('open every create affordance and dump its form', async ({ page }) => {
    await signIn(page, baseURL, L);
    const out = [];
    for (const t of TARGETS) {
      const r = await dump(page, t.name, t.route, t.click);
      out.push(r);
      // eslint-disable-next-line no-console
      console.log(
        `\n### ${t.name} ${t.route} status=${r.status} dialog=${r.dialogOpen} clickErr=${r.clickError ?? '-'}\n` +
          `  heading: ${r.heading.join(' / ')}\n` +
          `  fields: ${r.fields.map((f) => `${f.testid ?? f.name ?? f.id}(${f.tag}${f.type ? ':' + f.type : ''}${f.required ? '*' : ''}${f.disabled ? ' DISABLED' : ''})`).join(', ')}\n` +
          `  buttons: ${r.buttons.map((b) => `${b.text}${b.disabled ? '[X]' : ''}`).join(' | ')}\n` +
          `  alerts: ${r.alerts.join(' ~ ')}\n` +
          `  console: ${r.console.join(' ~ ')}`,
      );
    }
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(path.join(artifactDir, 'recon2.json'), JSON.stringify(out, null, 2));
  });
});
