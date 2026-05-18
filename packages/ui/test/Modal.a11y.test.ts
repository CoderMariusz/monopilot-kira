import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import AxeBuilder from '@axe-core/playwright';
import { chromium, type Browser, type Page } from 'playwright';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const uiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const staticDir = path.join(uiRoot, 'storybook-static');
let storybookBaseUrl = process.env.STORYBOOK_URL || '';
let server: http.Server | undefined;

const stories = [
  { id: 'ui-modal--small', size: 'sm' },
  { id: 'ui-modal--medium', size: 'md' },
  { id: 'ui-modal--large', size: 'lg' },
  { id: 'ui-modal--extra-large', size: 'xl' },
] as const;

const contentTypes: Record<string, string> = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

async function openStory(page: Page, id: string, size: string) {
  await page.goto(`${storybookBaseUrl}/iframe.html?id=${id}&viewMode=story`, { waitUntil: 'networkidle' });
  await page.waitForSelector(`[role="dialog"][data-size="${size}"]`, { timeout: 15_000 });
}

const hasStorybookTarget = Boolean(storybookBaseUrl) || fs.existsSync(path.join(staticDir, 'iframe.html'));

describe.skipIf(!hasStorybookTarget)('Modal Storybook axe-core coverage', () => {
  beforeAll(async () => {
    if (storybookBaseUrl) return;

    server = http.createServer((request, response) => {
      const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
      const safePath = path.normalize(decodeURIComponent(requestUrl.pathname)).replace(/^\.\.(\/|\\|$)/, '');
      const filePath = path.join(staticDir, safePath === '/' ? 'index.html' : safePath);
      if (!filePath.startsWith(staticDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        response.writeHead(404);
        response.end('Not found');
        return;
      }
      response.writeHead(200, { 'content-type': contentTypes[path.extname(filePath)] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(response);
    });

    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Unable to start Storybook static server');
    storybookBaseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (!server) return;
    await new Promise<void>((resolve, reject) => server!.close((error) => (error ? reject(error) : resolve())));
  });

  it.each(stories)('has no serious or critical accessibility violations for $size', async ({ id, size }) => {
    let browser: Browser | undefined;
    try {
      browser = await chromium.launch();
      const context = await browser.newContext();
      const page = await context.newPage();
      await openStory(page, id, size);
      const results = await new AxeBuilder({ page }).analyze();
      const seriousOrCritical = results.violations.filter((violation) =>
        violation.impact === 'serious' || violation.impact === 'critical',
      );
      expect(seriousOrCritical).toEqual([]);
    } finally {
      await browser?.close();
    }
  }, 30_000);
});
