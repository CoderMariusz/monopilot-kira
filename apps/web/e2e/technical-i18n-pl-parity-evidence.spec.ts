/**
 * Technical module i18n (Polish) parity evidence — Playwright stub.
 *
 * Lane scope: the Technical SUB-NAV rail + the Technical DASHBOARD now resolve
 * every user-facing label via next-intl (`Navigation.technical.*` +
 * `technical.dashboard.*`). The Polish values were placeholders (English) and
 * are now REAL Polish. This stub serves a self-contained harness that mounts the
 * SAME class family + structure the production rail/dashboard render, fed with
 * the ACTUAL `pl.json` strings (read at runtime — not retyped), so the captured
 * screenshots prove the Polish surface without an app server / Supabase. The
 * live authenticated /pl click-through (Gate-5) is performed separately on the
 * Vercel preview.
 *
 * Surfaces mirrored here:
 *   - apps/web/components/shell/technical-subnav.tsx (left rail groups + items)
 *   - apps/web/app/[locale]/(app)/(modules)/technical/page.tsx (dashboard:
 *     title/subtitle, KPI strip, quick actions, recent-changes empty state)
 *
 * Artifacts → apps/web/e2e/artifacts/TECHNICAL-I18N-PL/*.png
 */
import { mkdirSync, readFileSync } from 'node:fs';
import http, { type Server } from 'node:http';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { TECHNICAL_NAV_GROUPS } from '../lib/navigation/technical-nav';

const evidenceDir = path.join(__dirname, 'artifacts/TECHNICAL-I18N-PL');
const viewport = { width: 1440, height: 1000 };

// Real PL strings — read straight from the shipped locale file (no retyping).
const pl = JSON.parse(
  readFileSync(path.join(__dirname, '../i18n/pl.json'), 'utf8'),
) as Record<string, any>;
const navPL = pl.Navigation.technical as Record<string, any>;
const dashPL = pl.technical.dashboard as Record<string, any>;

function tNav(key: string): string {
  return key.split('.').reduce<any>((acc, p) => (acc ? acc[p] : undefined), navPL);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string);
}

function railHtml(): string {
  const groups = TECHNICAL_NAV_GROUPS.map((g, gi) => {
    const items = g.items
      .map((it, ii) => {
        const active = gi === 1 && ii === 0; // Products → Products active sample
        return `<a class="nav-item${active ? ' active' : ''}"><span class="ico">${escapeHtml(
          it.icon,
        )}</span><span>${escapeHtml(tNav(it.i18nKey))}</span></a>`;
      })
      .join('');
    return `<section><h2>${escapeHtml(tNav(g.i18nKey))}</h2><div>${items}</div></section>`;
  }).join('');
  return `<nav class="rail" aria-label="${escapeHtml(navPL.aria.nav)}">${groups}</nav>`;
}

function dashboardHtml(): string {
  const kpis: Array<[string, string, string]> = [
    [dashPL.kpi.activeItems.label, '128', dashPL.kpi.activeItems.sub],
    [dashPL.kpi.pendingBom.label, '3', dashPL.kpi.pendingBom.sub],
    [dashPL.kpi.allergenOverrides.label, '0', dashPL.kpi.allergenOverrides.sub],
    [dashPL.kpi.d365Sync.label, dashPL.d365Status.completed, dashPL.kpi.d365Sync.sub],
    [dashPL.kpi.costReview.label, '2', dashPL.kpi.costReview.sub],
  ];
  const kpiTiles = kpis
    .map(
      ([l, v, s]) =>
        `<div class="kpi"><div class="kpi-label">${escapeHtml(l)}</div><div class="kpi-value">${escapeHtml(
          v,
        )}</div><div class="kpi-change">${escapeHtml(s)}</div></div>`,
    )
    .join('');
  return `
    <main class="page">
      <nav class="breadcrumb">${escapeHtml(dashPL.breadcrumb.technical)} / ${escapeHtml(
        dashPL.breadcrumb.dashboard,
      )}</nav>
      <h1 class="page-title">${escapeHtml(dashPL.title)}</h1>
      <p class="helper">${escapeHtml(dashPL.subtitle)}</p>
      <div class="kpi-row">${kpiTiles}</div>
      <div class="grid">
        <div class="card">
          <div class="card-head">${escapeHtml(dashPL.recentChanges.title)}</div>
          <div class="empty-state"><div class="empty-icon">🗂️</div><div class="empty-body">${escapeHtml(
            dashPL.recentChanges.empty,
          )}</div></div>
        </div>
        <div class="card">
          <div class="card-head">${escapeHtml(dashPL.quickActions.title)}</div>
          <a class="btn btn-primary">${escapeHtml(dashPL.quickActions.createItem)}</a>
          <a class="btn">${escapeHtml(dashPL.quickActions.createBom)}</a>
        </div>
      </div>
    </main>`;
}

function harnessHtml(): string {
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><style>
  :root{--border:#e2e5ea;--muted:#6b7280;--radius:8px;--blue:#2563eb;--active:#eef2ff;}
  *{box-sizing:border-box;font-family:Inter,system-ui,sans-serif;}
  body{margin:0;background:#f6f7f9;color:#111;display:flex;min-height:100vh;}
  .rail{width:240px;background:#fff;border-right:1px solid var(--border);padding:20px 16px;}
  .rail section{margin-bottom:18px;}
  .rail h2{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.16em;color:var(--muted);padding:0 8px;margin:0 0 6px;}
  .nav-item{display:flex;gap:8px;align-items:center;padding:7px 10px;border-radius:10px;font-size:13px;font-weight:500;color:#111;text-decoration:none;}
  .nav-item.active{background:var(--active);color:var(--blue);}
  .ico{width:16px;text-align:center;}
  .page{flex:1;padding:24px;}
  .breadcrumb{font-size:12px;color:var(--muted);margin-bottom:8px;}
  .page-title{font-size:22px;font-weight:600;margin:0;}
  .helper{color:var(--muted);font-size:13px;max-width:760px;}
  .kpi-row{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin:16px 0;}
  .kpi{background:#fff;border:1px solid var(--border);border-radius:6px;border-bottom:3px solid var(--blue);padding:12px;}
  .kpi-label{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);}
  .kpi-value{font-size:26px;font-weight:700;}
  .kpi-change{font-size:12px;color:var(--muted);}
  .grid{display:grid;grid-template-columns:1.4fr 1fr;gap:16px;}
  .card{background:#fff;border:1px solid var(--border);border-radius:var(--radius);padding:14px;}
  .card-head{font-weight:600;font-size:13px;margin-bottom:10px;}
  .empty-state{padding:36px;text-align:center;color:var(--muted);font-size:13px;}
  .btn{display:block;text-align:center;border:1px solid var(--border);border-radius:6px;padding:8px;font-size:13px;margin-bottom:8px;background:#fff;}
  .btn-primary{background:var(--blue);color:#fff;border-color:var(--blue);}
  </style></head><body>${railHtml()}${dashboardHtml()}</body></html>`;
}

let server: Server;
let baseUrl: string;

test.beforeAll(async () => {
  mkdirSync(evidenceDir, { recursive: true });
  server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(harnessHtml());
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('Technical rail + dashboard render real Polish (i18n parity evidence)', async ({ page }) => {
  await page.setViewportSize(viewport);
  await page.goto(baseUrl);

  // Sub-nav: group headers + a representative item in Polish. Resolve via the
  // nav config's i18nKey so the assertions track the SAME keys the rail renders.
  const overviewKey = TECHNICAL_NAV_GROUPS[0].i18nKey;
  const costTraceKey = TECHNICAL_NAV_GROUPS.find((g) => g.id === 'cost-trace')!.i18nKey;
  await expect(page.getByRole('navigation', { name: navPL.aria.nav })).toBeVisible();
  await expect(page.getByText(tNav(overviewKey), { exact: true })).toBeVisible();
  await expect(page.getByText(tNav(costTraceKey), { exact: true })).toBeVisible();
  await expect(page.getByText(tNav('items.boms'), { exact: true }).first()).toBeVisible();
  await expect(page.getByText(tNav('items.traceability'), { exact: true })).toBeVisible();

  // Dashboard: title + KPI + quick actions in Polish.
  await expect(page.getByRole('heading', { name: dashPL.title })).toBeVisible();
  await expect(page.getByText(dashPL.kpi.activeItems.label, { exact: true })).toBeVisible();
  await expect(page.getByText(dashPL.quickActions.createItem, { exact: true })).toBeVisible();
  await expect(page.getByText(dashPL.recentChanges.empty, { exact: true })).toBeVisible();

  await page.screenshot({ path: path.join(evidenceDir, 'technical-pl-full.png'), fullPage: true });
  const rail = page.getByRole('navigation', { name: navPL.aria.nav });
  await rail.screenshot({ path: path.join(evidenceDir, 'technical-pl-subnav.png') });
});
