/**
 * BOM component row actions + item→BOM deep link — parity evidence (Playwright stub).
 *
 * Self-contained harness that mounts the design-system regions this lane adds,
 * using the SAME class family the production screens translate to. No app server
 * / DB needed — captures the per-state screenshot artifacts the
 * UI-PROTOTYPE-PARITY-POLICY requires while the live authenticated click-through
 * is performed separately on the Vercel preview.
 *
 * Regions mirrored:
 *   1. BOM detail Components tab — per-row Edit (✎) + Delete (🗑) actions
 *      (production: bom-detail-screen.tsx Components table + bom-line-row-actions.tsx).
 *   2. Edit-line modal — prefilled qty / uom / notes
 *      (production: bom-line-row-actions.tsx ComponentAddModal-style Dialog).
 *   3. Delete confirm modal.
 *   4. Disabled-on-active row actions (clone-on-write red-line; honest title).
 *   5. Item detail BOM tab — per-row "Open BOM →" deep-link
 *      (production: item-data-tabs.tsx BomTab).
 *
 * Artifacts → apps/web/e2e/artifacts/TECHNICAL-BOM-ROW-ACTIONS/*.png
 */

import { mkdirSync } from 'node:fs';
import http, { type Server } from 'node:http';
import path from 'node:path';

import { expect, test } from '@playwright/test';

const evidenceDir = path.join(__dirname, 'artifacts/TECHNICAL-BOM-ROW-ACTIONS');
const viewport = { width: 1440, height: 1000 };

function harnessHtml(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
  :root{--border:#e2e5ea;--muted:#6b7280;--radius:8px;--blue:#2563eb;--red:#dc2626;--amber:#d97706;--green:#16a34a;--gray:#6b7280;}
  *{box-sizing:border-box;font-family:Inter,system-ui,sans-serif;}
  body{margin:0;background:#f6f7f9;color:#111;padding:24px;}
  .page-title{font-size:22px;font-weight:600;margin:0;}
  .helper{color:var(--muted);font-size:13px;}
  .btn{border:1px solid var(--border);border-radius:6px;padding:6px 12px;font-size:13px;cursor:pointer;background:#fff;}
  .btn-primary{background:var(--blue);color:#fff;border-color:var(--blue);}
  .btn-danger{background:var(--red);color:#fff;border-color:var(--red);}
  .btn-secondary{background:#fff;}
  .btn-icon{padding:4px 8px;}
  .btn:disabled{opacity:.45;cursor:not-allowed;}
  .card{background:#fff;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;}
  table{width:100%;border-collapse:collapse;}
  th,td{text-align:left;padding:10px 16px;font-size:13px;border-bottom:1px solid var(--border);}
  th{color:var(--muted);font-weight:600;font-size:12px;}
  .mono{font-family:ui-monospace,monospace;}
  .badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;}
  .badge-gray{background:#f1f3f5;color:var(--gray);}
  .badge-blue{background:#e7efff;color:var(--blue);}
  .badge-green{background:#e7f7ec;color:var(--green);}
  .row-actions{display:flex;gap:6px;justify-content:flex-end;}
  .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:flex-start;justify-content:center;padding-top:60px;}
  .modal-box{background:#fff;border-radius:var(--radius);width:560px;max-width:92vw;}
  .modal-head,.modal-foot{display:flex;justify-content:space-between;align-items:flex-start;padding:16px 20px;}
  .modal-head{border-bottom:1px solid var(--border);}
  .modal-foot{border-top:1px solid var(--border);gap:8px;justify-content:flex-end;}
  .modal-body{padding:20px;}
  .modal-title{font-size:17px;font-weight:600;margin:0;}
  .ff{margin-bottom:12px;display:flex;flex-direction:column;gap:4px;}
  .ff label{font-size:12px;font-weight:600;}
  .form-input{border:1px solid var(--border);border-radius:6px;padding:7px 10px;font-size:13px;}
  </style></head><body>
  <main data-screen="technical-bom-detail">
    <nav class="helper">BOMs &amp; recipes / <span class="mono">FG1234</span></nav>
    <header style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
      <div style="display:flex;gap:10px;align-items:center;">
        <h1 class="page-title">Smoked Ham</h1>
        <span class="badge badge-gray">Draft</span><span class="badge badge-blue">v1</span>
      </div>
    </header>
    <div class="card" style="margin-top:14px;" id="components">
      <table aria-label="Components"><thead><tr>
        <th>#</th><th>Component</th><th>Type</th><th style="text-align:right">Qty</th><th>UoM</th>
        <th style="text-align:right">Scrap</th><th>Operation</th><th style="text-align:right">Actions</th>
      </tr></thead><tbody id="lines">
        <tr data-testid="bom-line-row"><td class="mono">1</td><td class="mono">RM-001</td><td>RM</td>
          <td class="mono" style="text-align:right">1.5</td><td class="mono">kg</td>
          <td class="mono" style="text-align:right">1.0%</td><td>Mixing</td>
          <td><div class="row-actions" data-testid="bom-line-row-actions">
            <button class="btn btn-secondary btn-icon" data-testid="bom-line-edit" title="Edit" aria-label="Edit">✎</button>
            <button class="btn btn-danger btn-icon" data-testid="bom-line-delete" title="Delete" aria-label="Delete">🗑</button>
          </div></td></tr>
        <tr data-testid="bom-line-row"><td class="mono">2</td><td class="mono">RM-002</td><td>RM</td>
          <td class="mono" style="text-align:right">0.4</td><td class="mono">kg</td>
          <td class="mono" style="text-align:right">2.0%</td><td>Curing</td>
          <td><div class="row-actions">
            <button class="btn btn-secondary btn-icon" title="Edit" aria-label="Edit">✎</button>
            <button class="btn btn-danger btn-icon" title="Delete" aria-label="Delete">🗑</button>
          </div></td></tr>
      </tbody></table>
    </div>
  </main>

  <!-- Edit-line modal -->
  <div class="modal-overlay" id="edit-modal" style="display:none;">
    <div class="modal-box" role="dialog" aria-modal="true" aria-label="Edit component line">
      <div class="modal-head"><div><h2 class="modal-title">Edit component line</h2>
        <p class="helper" style="margin-top:4px;">Update the quantity, unit of measure or notes for RM-001.</p></div>
        <button class="btn" id="edit-close">✕</button></div>
      <div class="modal-body">
        <div class="ff"><label>Quantity *</label><input class="form-input" type="number" value="1.5"></div>
        <div class="ff"><label>Unit of measure</label><input class="form-input mono" value="kg"></div>
        <div class="ff"><label>Notes</label><input class="form-input" value="mix slowly"></div>
      </div>
      <div class="modal-foot"><button class="btn btn-secondary">Cancel</button>
        <button class="btn btn-primary">Save changes</button></div>
    </div>
  </div>

  <!-- Delete confirm modal -->
  <div class="modal-overlay" id="delete-modal" style="display:none;">
    <div class="modal-box" role="dialog" aria-modal="true" aria-label="Remove component line">
      <div class="modal-head"><h2 class="modal-title">Remove component line</h2>
        <button class="btn" id="delete-close">✕</button></div>
      <div class="modal-body"><p style="font-size:13px;">Remove RM-001 from this BOM version? This cannot be undone.</p></div>
      <div class="modal-foot"><button class="btn btn-secondary">Cancel</button>
        <button class="btn btn-danger" data-testid="bom-line-delete-confirm">Remove component</button></div>
    </div>
  </div>

  <!-- Disabled-on-active view -->
  <div class="card" id="active-view" style="display:none;margin-top:14px;">
    <table aria-label="Components (active)"><thead><tr><th>#</th><th>Component</th><th style="text-align:right">Actions</th></tr></thead>
      <tbody><tr><td class="mono">1</td><td class="mono">RM-001</td>
        <td><div class="row-actions">
          <button class="btn btn-secondary btn-icon" disabled title="This BOM version is approved or active — its components can no longer be edited." aria-label="Edit">✎</button>
          <button class="btn btn-danger btn-icon" disabled title="This BOM version is approved or active — its components can no longer be edited." aria-label="Delete">🗑</button>
        </div></td></tr></tbody>
    </table>
  </div>

  <!-- Item detail BOM tab — Open BOM deep-link -->
  <div class="card" id="item-bom-tab" style="display:none;margin-top:14px;" data-testid="bom-tab">
    <div class="helper" style="padding:10px 14px;border-bottom:1px solid var(--border);"><strong>BOM versions</strong></div>
    <table aria-label="BOM versions"><thead><tr>
      <th>Version</th><th>Status</th><th>Effective from</th><th>Lines</th><th></th>
    </tr></thead><tbody>
      <tr><td class="mono">v3</td><td><span class="badge badge-gray">draft</span></td><td class="mono">2026-04-14</td><td class="mono">2</td>
        <td style="text-align:right"><a href="/technical/bom/FG1234?v=3" data-testid="item-bom-open-link" style="color:var(--blue)">Open BOM →</a></td></tr>
      <tr><td class="mono">v2</td><td><span class="badge badge-green">active</span></td><td class="mono">2026-03-01</td><td class="mono">2</td>
        <td style="text-align:right"><a href="/technical/bom/FG1234?v=2" style="color:var(--blue)">Open BOM →</a></td></tr>
    </tbody></table>
  </div>

  <script>
    document.querySelector('[data-testid=bom-line-edit]').addEventListener('click',()=>{document.getElementById('edit-modal').style.display='flex';});
    document.getElementById('edit-close').addEventListener('click',()=>{document.getElementById('edit-modal').style.display='none';});
    document.querySelector('[data-testid=bom-line-delete]').addEventListener('click',()=>{document.getElementById('delete-modal').style.display='flex';});
    document.getElementById('delete-close').addEventListener('click',()=>{document.getElementById('delete-modal').style.display='none';});
    window.__showActive=()=>{document.getElementById('components').style.display='none';document.getElementById('active-view').style.display='block';};
    window.__showItemTab=()=>{document.getElementById('components').style.display='none';document.getElementById('item-bom-tab').style.display='block';};
  </script>
  </body></html>`;
}

function serveHarness(): Promise<{ server: Server; url: string }> {
  const html = harnessHtml();
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ server, url: `http://127.0.0.1:${port}/` });
    });
  });
}

test.describe('Technical BOM row actions parity evidence', () => {
  test('captures row actions, edit modal, delete confirm, disabled-on-active, and item deep-link', async ({ page }) => {
    mkdirSync(evidenceDir, { recursive: true });
    await page.setViewportSize(viewport);
    const { server, url } = await serveHarness();
    try {
      await page.goto(url);

      // 1) Components tab with per-row edit/delete actions (ready).
      await expect(page.getByTestId('bom-line-row-actions')).toBeVisible();
      await expect(page.getByTestId('bom-line-edit')).toBeVisible();
      await expect(page.getByTestId('bom-line-delete')).toBeVisible();
      await page.screenshot({ path: path.join(evidenceDir, '01-components-row-actions.png'), fullPage: true });

      // 2) Edit-line modal (prefilled qty/uom/notes).
      await page.getByTestId('bom-line-edit').click();
      await expect(page.getByRole('dialog', { name: 'Edit component line' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible();
      await page.screenshot({ path: path.join(evidenceDir, '02-edit-line-modal.png'), fullPage: true });
      await page.locator('#edit-close').click();

      // 3) Delete confirm.
      await page.getByTestId('bom-line-delete').click();
      await expect(page.getByTestId('bom-line-delete-confirm')).toBeVisible();
      await page.screenshot({ path: path.join(evidenceDir, '03-delete-confirm.png'), fullPage: true });
      await page.locator('#delete-close').click();

      // 4) Disabled-on-active (clone-on-write red-line; honest title).
      await page.evaluate(() => (window as unknown as { __showActive: () => void }).__showActive());
      const disabledEdit = page.locator('#active-view [aria-label="Edit"]');
      await expect(disabledEdit).toBeDisabled();
      await expect(disabledEdit).toHaveAttribute('title', /can no longer be edited/);
      await page.screenshot({ path: path.join(evidenceDir, '04-disabled-on-active.png'), fullPage: true });

      // 5) Item detail BOM tab — per-row "Open BOM →" deep-link.
      await page.evaluate(() => (window as unknown as { __showItemTab: () => void }).__showItemTab());
      const openLink = page.getByTestId('item-bom-open-link');
      await expect(openLink).toBeVisible();
      await expect(openLink).toHaveAttribute('href', '/technical/bom/FG1234?v=3');
      await page.screenshot({ path: path.join(evidenceDir, '05-item-open-bom-link.png'), fullPage: true });
    } finally {
      server.close();
    }
  });
});
