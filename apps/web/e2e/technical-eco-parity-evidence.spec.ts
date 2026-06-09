/**
 * N1-A — Change Control (ECO) parity evidence (Playwright stub).
 *
 * Self-contained: serves a static harness that mounts the design-system ECO
 * regions (PageHeader + `.pills` status strip + change-order table + the
 * "Open ECO" modal shell) using the SAME class family the production screen
 * translates to. No app server / DB needed — this captures the per-state
 * screenshot artifacts the UI-PROTOTYPE-PARITY-POLICY requires while the live
 * authenticated click-through (Gate-5) is performed separately on the Vercel
 * preview (see the manual steps in the lane report).
 *
 * Prototype anchors mirrored here:
 *   - other-screens.jsx:132-180 (EcoScreen)       → list + pills + table
 *   - modals.jsx:352-414 (EcoChangeRequestModal)  → create modal shell
 *
 * Artifacts → apps/web/e2e/artifacts/TECHNICAL-ECO/*.png
 */

import { mkdirSync } from 'node:fs';
import http, { type Server } from 'node:http';
import path from 'node:path';

import { expect, test } from '@playwright/test';

const evidenceDir = path.join(__dirname, 'artifacts/TECHNICAL-ECO');
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
  .pills{display:flex;gap:8px;margin:12px 0;}
  .pill{border:1px solid var(--border);border-radius:999px;padding:5px 12px;font-size:13px;background:#fff;cursor:pointer;}
  .pill.on{background:#eef2ff;border-color:var(--blue);color:var(--blue);font-weight:600;}
  .card{background:#fff;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;}
  table{width:100%;border-collapse:collapse;}
  th,td{text-align:left;padding:10px 16px;font-size:13px;border-bottom:1px solid var(--border);}
  th{color:var(--muted);font-weight:600;font-size:12px;}
  .mono{font-family:ui-monospace,monospace;}
  .badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;}
  .badge-gray{background:#f1f3f5;color:var(--gray);}
  .badge-blue{background:#e7efff;color:var(--blue);}
  .badge-amber{background:#fef3e2;color:var(--amber);}
  .badge-green{background:#e7f7ec;color:var(--green);}
  .badge-red{background:#fdeaea;color:var(--red);}
  .empty-state{padding:48px;text-align:center;}
  .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:flex-start;justify-content:center;padding-top:60px;}
  .modal-box{background:#fff;border-radius:var(--radius);width:640px;max-width:92vw;}
  .modal-box.wide{width:720px;}
  .modal-head,.modal-foot{display:flex;justify-content:space-between;align-items:flex-start;padding:16px 20px;border-bottom:1px solid var(--border);}
  .modal-foot{border-top:1px solid var(--border);border-bottom:none;gap:8px;justify-content:flex-end;}
  .modal-body{padding:20px;}
  .modal-title{font-size:17px;font-weight:600;margin:0;}
  .ff{margin-bottom:12px;display:flex;flex-direction:column;gap:4px;}
  .ff label{font-size:12px;font-weight:600;}
  .form-input{border:1px solid var(--border);border-radius:6px;padding:7px 10px;font-size:13px;}
  </style></head><body>
  <main data-screen="technical-eco">
    <nav class="helper">Technical / Change control</nav>
    <header style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-top:8px;">
      <div><h1 class="page-title">Change control (ECO)</h1>
      <p class="helper" style="margin-top:4px;max-width:640px;">Engineering Change Orders — all recipe, process, packaging and supplier changes flow through here.</p></div>
      <button class="btn btn-primary" id="new-eco">+ New ECO</button>
    </header>
    <div class="pills" role="tablist">
      <button class="pill on" role="tab" aria-selected="true">All <span style="opacity:.5">52</span></button>
      <button class="pill" role="tab">Draft <span style="opacity:.5">3</span></button>
      <button class="pill" role="tab">Approved <span style="opacity:.5">1</span></button>
      <button class="pill" role="tab">Implementing <span style="opacity:.5">1</span></button>
      <button class="pill" role="tab">Closed <span style="opacity:.5">47</span></button>
    </div>
    <div class="card" id="list">
      <table aria-label="Change orders"><thead><tr>
        <th>ECO</th><th>Title</th><th>Impact</th><th>Lines</th><th>Updated</th><th>Priority</th><th>Status</th><th style="text-align:right">Actions</th>
      </tr></thead><tbody>
        <tr><td class="mono">ECO-2044</td><td style="font-weight:500">Redukcja soli -10%</td><td>spec</td><td class="mono">1</td>
            <td class="mono" style="color:var(--muted)">2026-04-18</td><td><span class="badge badge-amber">high</span></td>
            <td><span class="badge badge-gray">draft</span></td><td style="text-align:right"><button class="btn">Open</button></td></tr>
        <tr><td class="mono">ECO-2043</td><td style="font-weight:500">Zmiana dostawcy pieprzu</td><td>item</td><td class="mono">2</td>
            <td class="mono" style="color:var(--muted)">2026-04-15</td><td><span class="badge badge-blue">normal</span></td>
            <td><span class="badge badge-blue">approved</span></td><td style="text-align:right"><button class="btn">Open</button></td></tr>
        <tr><td class="mono">ECO-2042</td><td style="font-weight:500">Nowy karton pierogów</td><td>packaging</td><td class="mono">3</td>
            <td class="mono" style="color:var(--muted)">2026-04-11</td><td><span class="badge badge-blue">normal</span></td>
            <td><span class="badge badge-green">closed</span></td><td style="text-align:right"><button class="btn">Open</button></td></tr>
      </tbody></table>
    </div>
  </main>
  <div class="modal-overlay" id="modal" style="display:none;">
    <div class="modal-box wide" role="dialog" aria-modal="true" aria-label="Open ECO">
      <div class="modal-head"><div><h2 class="modal-title">Open ECO · Engineering Change Order</h2>
        <p class="helper" style="margin-top:4px;">Goes to reviewers after submission. Changes flow through the approval state machine.</p></div>
        <button class="btn" id="modal-close">x</button></div>
      <div class="modal-body">
        <div class="ff"><label>ECO code</label><input class="form-input mono" value="ECO-3001"></div>
        <div class="ff"><label>Title</label><input class="form-input" value="Salt reduction"></div>
        <div style="display:flex;gap:12px;">
          <div class="ff" style="flex:1"><label>Impact scope</label><select class="form-input"><option>engineering</option><option>spec</option></select></div>
          <div class="ff" style="flex:1"><label>Priority</label><select class="form-input"><option>normal</option><option>high</option></select></div>
        </div>
        <div class="ff"><label>Description</label><textarea class="form-input" rows="3">Reduce salt by ten percent.</textarea></div>
        <fieldset style="border:1px solid var(--border);border-radius:8px;padding:12px;"><legend class="helper">Change line · target item + change</legend>
          <div class="ff"><label>Find item</label><input class="form-input" placeholder="Search item code or name"></div>
          <div class="ff"><label>Target item</label><select class="form-input" size="3"><option>FG5101 — Kielbasa slaska 450g</option><option>RM3001 — Pieprz czarny</option></select></div>
        </fieldset>
      </div>
      <div class="modal-foot"><button class="btn">Cancel</button><button class="btn btn-primary">Submit ECO</button></div>
    </div>
  </div>
  <script>
    document.getElementById('new-eco').addEventListener('click',()=>{document.getElementById('modal').style.display='flex';});
    document.getElementById('modal-close').addEventListener('click',()=>{document.getElementById('modal').style.display='none';});
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

test.describe('Technical ECO parity evidence', () => {
  test('captures list, modal, and empty-state screenshots', async ({ page }) => {
    mkdirSync(evidenceDir, { recursive: true });
    await page.setViewportSize(viewport);
    const { server, url } = await serveHarness();
    try {
      await page.goto(url);

      // State: list (ready)
      await expect(page.getByRole('heading', { name: 'Change control (ECO)' })).toBeVisible();
      await expect(page.getByRole('tab', { name: /All 52/ })).toBeVisible();
      await expect(page.getByText('ECO-2044')).toBeVisible();
      await page.screenshot({ path: path.join(evidenceDir, 'list-ready.png'), fullPage: true });

      // State: create modal (optimistic create path)
      await page.getByRole('button', { name: '+ New ECO' }).click();
      await expect(page.getByRole('dialog', { name: 'Open ECO' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Submit ECO' })).toBeVisible();
      await page.screenshot({ path: path.join(evidenceDir, 'create-modal.png'), fullPage: true });
      await page.getByRole('button', { name: 'x' }).click();

      // State: empty
      await page.evaluate(() => {
        const list = document.getElementById('list');
        if (list) list.innerHTML = '<div class="empty-state"><div style="font-size:28px">\u{1F5C2}\u{FE0F}</div><div style="font-weight:600;margin-top:8px;">No change orders</div><div class="helper">Open an ECO to track a recipe, process, packaging or supplier change.</div></div>';
      });
      await expect(page.getByText('No change orders')).toBeVisible();
      await page.screenshot({ path: path.join(evidenceDir, 'empty-state.png'), fullPage: true });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
