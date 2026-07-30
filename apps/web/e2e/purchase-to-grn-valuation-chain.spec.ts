/**
 * PRZÓD ŁAŃCUCHA PIENIĘŻNEGO — zamówienie zakupu → przyjęcie (GRN) → nośnik zapasu
 * (license plate) → wycena zapasu (WAC).
 *
 * Ten odcinek nie był dotąd przechodzony klikaniem. Istniejący
 * `purchasing-chain-e2e.spec.ts` degraduje się „miękko" (loguje notatkę zamiast
 * failować) i nie sprawdza ŻADNEJ liczby — tu wszystko jest twarde.
 *
 * DOWÓD = AKCJA W UI + TRWAŁY WIERSZ W POSTGRESIE. Po każdym kroku spec czyta stan
 * wprost z bazy rolą `monopilot` (BYPASSRLS — patrz `pg_roles.rolbypassrls`), więc
 * kontekst org nie jest potrzebny; gdyby był, to `app.set_org_context(token, org)`,
 * NIGDY surowy GUC `app.current_org_id`.
 *
 * Łańcuch (każdy krok bramkuje następny):
 *   T1  PO w EUR → „Submit" ⇒ bramka `unsupported_currency`, status BEZ zmiany
 *   T2  linia w `pcs` bez masy bazowej → „Receive" ⇒ `wac_unresolved_uom`,
 *       ZERO nowych wierszy (GRN/LP) — nic nie wchodzi na stan po cichu
 *   T3  dostawca EUR → GBP przez UI (jedyna droga do zamówienia w GBP)
 *   T4  utworzenie PO w GBP (100 kg × £1.50)
 *   T5  Submit → Confirm (oba za `window.confirm`)
 *   T6  przyjęcie 100 kg ⇒ grns / grn_items / license_plates / item_wac_state
 *       + kontrola `site_id` na KAŻDYM utworzonym wierszu
 *   T7  ekran wyceny vs. `item_wac_state` — liczba na ekranie == liczba w bazie
 *
 * Uruchamiać WYŁĄCZNIE przez `bash scripts/e2e-local.sh` (asercja 127.0.0.1 + workers=1).
 */
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Locator, type Page } from '@playwright/test';
import pg from 'pg';

import { signIn } from './_shared/parity-login';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const artifactDir = path.resolve(__dirname, 'artifacts/purchase-to-grn-valuation-chain');
const L = 'en';

/** Serwer DEV kompiluje trasę przy pierwszym wejściu — render dostaje własny, długi budżet. */
const COMPILE = 180_000;

const { Client } = pg;
const ownerConnectionString = process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL ?? '';

async function sql<T extends Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const client = new Client({ connectionString: ownerConnectionString });
  await client.connect();
  try {
    const { rows } = await client.query<T>(text, params);
    return rows;
  } finally {
    await client.end();
  }
}

function ensureDir(): void {
  if (!existsSync(artifactDir)) mkdirSync(artifactDir, { recursive: true });
}

function url(route: string): string {
  return `${baseURL}${route}`;
}

async function shot(page: Page, name: string): Promise<void> {
  ensureDir();
  await page.screenshot({ path: path.join(artifactDir, `${name}.png`), fullPage: true });
}

/** Playwright DOMYŚLNIE ODRZUCA confirm() — bez tego każde przejście statusu to cichy no-op. */
function acceptDialogs(page: Page): void {
  page.on('dialog', (d) => {
    void d.accept();
  });
}

/** Zbiera błędy strony, żeby „nic się nie stało" nie zostało wzięte za defekt UI. */
function collectPageErrors(page: Page, sink: string[]): void {
  page.on('pageerror', (e) => sink.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') sink.push(`console.error: ${m.text().slice(0, 300)}`);
  });
}

/** Wybór w prymitywie <Select> z packages/ui — portalowany panel, opcje jako role=option. */
async function pickSelect(page: Page, trigger: Locator, optionLabel: RegExp): Promise<void> {
  await expect(trigger).toBeVisible({ timeout: 30_000 });
  await trigger.click();
  await page.getByRole('option', { name: optionLabel }).first().click({ timeout: 20_000 });
}

/** Opcja ItemPickera wskazana po ID pozycji (data-item-id), NIE po indeksie. */
async function pickItem(page: Page, scope: Locator, itemId: string, query: string): Promise<void> {
  await scope.getByTestId('item-picker-trigger').click();
  await expect(page.getByTestId('item-picker-panel')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('item-picker-panel').getByRole('combobox').fill(query);
  const option = page.locator(`[data-testid="item-picker-option"][data-item-id="${itemId}"]`);
  await option.click({ timeout: 30_000 });
}

const ORG_ID = '00000000-0000-0000-0000-000000000002';

/** Stan współdzielony między krokami (describe.serial). */
const flow = {
  sugarItemId: '',
  eurPoId: '',
  pcsPoId: '',
  pcsLineId: '',
  supplierId: '',
  newPoId: '',
  newPoNumber: '',
  newPoLineId: '',
  grnItemId: '',
  lpId: '',
  uiFeedback: { success: 0, error: 0, form: 0, dialog: 0 },
  reconcile: { wacQty: 0, lpQty: 0 },
};

const QTY = '100';
const PRICE = '1.50';
const EXPECTED_VALUE = 150; // 100 kg × £1.50/kg

test.describe('Zakup → przyjęcie → nośnik → wycena', () => {
  // Łańcuch — każdy krok bramkuje następny, więc tryb szeregowy.
  test.describe.configure({ mode: 'serial' });
  test.skip(!baseURL, 'PLAYWRIGHT_BASE_URL nieustawiony — uruchom przez scripts/e2e-local.sh.');

  test.beforeAll(async () => {
    const items = await sql<{ id: string }>(
      `select id::text from public.items where org_id = $1::uuid and item_code = 'ING-SUGAR'`,
      [ORG_ID],
    );
    expect(items, 'ING-SUGAR musi istnieć w masterze pozycji').toHaveLength(1);
    flow.sugarItemId = items[0]!.id;

    const eur = await sql<{ id: string; currency: string; status: string }>(
      `select id::text, currency, status from public.purchase_orders
        where org_id = $1::uuid and currency <> 'GBP' and status = 'draft' limit 1`,
      [ORG_ID],
    );
    expect(eur, 'potrzebne PO w walucie innej niż GBP i w stanie draft').toHaveLength(1);
    flow.eurPoId = eur[0]!.id;

    const pcs = await sql<{ po_id: string; line_id: string }>(
      `select pol.po_id::text, pol.id::text as line_id
         from public.purchase_order_lines pol
         join public.purchase_orders po on po.id = pol.po_id and po.org_id = pol.org_id
         join public.items i on i.id = pol.item_id and i.org_id = pol.org_id
        where pol.org_id = $1::uuid
          and lower(pol.uom) = 'pcs'
          and i.net_qty_per_each is null
          and po.status in ('confirmed', 'partially_received')
        order by pol.line_no asc
        limit 1`,
      [ORG_ID],
    );
    expect(pcs, 'potrzebna linia w pcs bez net_qty_per_each na PO gotowym do przyjęcia').toHaveLength(1);
    flow.pcsPoId = pcs[0]!.po_id;
    flow.pcsLineId = pcs[0]!.line_id;
  });

  test.beforeEach(async ({ page }) => {
    acceptDialogs(page);
    await signIn(page, baseURL, L);
  });

  // ── T1 ── Bramka walutowa na wysyłce zamówienia ─────────────────────────────
  test('T1 PO w walucie innej niż GBP nie da się wysłać, status zostaje draft', async ({ page }) => {
    test.setTimeout(300_000);
    const errors: string[] = [];
    collectPageErrors(page, errors);

    const before = await sql<{ status: string; currency: string }>(
      `select status, currency from public.purchase_orders where id = $1::uuid`,
      [flow.eurPoId],
    );
    expect(before[0]!.status).toBe('draft');
    expect(before[0]!.currency).not.toBe('GBP');

    await page.goto(url(`/${L}/planning/purchase-orders/${flow.eurPoId}`), { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('po-detail-view')).toBeVisible({ timeout: COMPILE });

    const send = page.getByTestId('po-transition-sent');
    await expect(send, 'przycisk Submit musi być dostępny na draftcie').toBeVisible({ timeout: 30_000 });
    await send.click();

    const banner = page.getByTestId('po-detail-error');
    await expect(banner, 'bramka walutowa musi pokazać komunikat').toBeVisible({ timeout: 60_000 });
    await expect(banner).toContainText(/GBP/i);
    await shot(page, 'T1-unsupported-currency');

    const after = await sql<{ status: string }>(
      `select status from public.purchase_orders where id = $1::uuid`,
      [flow.eurPoId],
    );
    expect(after[0]!.status, 'status NIE MOŻE się zmienić po odrzuceniu').toBe('draft');
    console.log(`[T1] komunikat = ${(await banner.innerText()).slice(0, 200)}`);
    console.log(`[T1] błędy strony: ${errors.length ? errors.join(' | ') : 'brak'}`);
  });

  // ── T2 ── Linia w pcs bez masy bazowej: przyjęcie zablokowane, ZERO wierszy ──
  test('T2 przyjęcie linii w pcs bez masy bazowej jest blokowane i nic nie wchodzi na stan', async ({ page }) => {
    test.setTimeout(300_000);
    const errors: string[] = [];
    collectPageErrors(page, errors);

    const [before] = await sql<{ grns: string; grn_items: string; lps: string; moves: string }>(
      `select (select count(*) from public.grns where org_id = $1::uuid)::text as grns,
              (select count(*) from public.grn_items where org_id = $1::uuid)::text as grn_items,
              (select count(*) from public.license_plates where org_id = $1::uuid)::text as lps,
              (select count(*) from public.stock_moves where org_id = $1::uuid)::text as moves`,
      [ORG_ID],
    );

    await page.goto(url(`/${L}/planning/purchase-orders/${flow.pcsPoId}`), { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('po-detail-view')).toBeVisible({ timeout: COMPILE });

    const receive = page.getByTestId(`po-line-receive-${flow.pcsLineId}`);
    await expect(receive, 'linia niedobrana musi mieć przycisk Receive').toBeVisible({ timeout: 30_000 });
    await receive.click();
    await expect(page.getByTestId('po-receive-form')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('po-receive-submit').click();

    const err = page.getByTestId('po-receive-error');
    await expect(err, 'przyjęcie musi zostać odrzucone komunikatem').toBeVisible({ timeout: 60_000 });
    await expect(err).toContainText(/kg/i);
    await shot(page, 'T2-wac-unresolved-uom');

    const [after] = await sql<{ grns: string; grn_items: string; lps: string; moves: string }>(
      `select (select count(*) from public.grns where org_id = $1::uuid)::text as grns,
              (select count(*) from public.grn_items where org_id = $1::uuid)::text as grn_items,
              (select count(*) from public.license_plates where org_id = $1::uuid)::text as lps,
              (select count(*) from public.stock_moves where org_id = $1::uuid)::text as moves`,
      [ORG_ID],
    );
    console.log(`[T2] komunikat = ${(await err.innerText()).slice(0, 250)}`);
    console.log(`[T2] przed=${JSON.stringify(before)} po=${JSON.stringify(after)}`);
    expect(after, 'odrzucone przyjęcie NIE MOŻE zostawić żadnego wiersza').toEqual(before);
    console.log(`[T2] błędy strony: ${errors.length ? errors.join(' | ') : 'brak'}`);
  });

  // ── T3 ── Waluta dostawcy: EUR → GBP (jedyna droga do zamówienia w GBP) ─────
  test('T3 waluta dostawcy da się zmienić na GBP z interfejsu', async ({ page }) => {
    test.setTimeout(300_000);
    const errors: string[] = [];
    collectPageErrors(page, errors);

    const suppliers = await sql<{ id: string; name: string; currency: string }>(
      `select s.id::text, s.name, s.currency
         from public.suppliers s
        where s.org_id = $1::uuid
          and s.status = 'active'
          and exists (select 1 from public.supplier_specs ss
                       where ss.supplier_id = s.id and ss.item_id = $2::uuid)
        limit 1`,
      [ORG_ID, flow.sugarItemId],
    );
    expect(suppliers, 'potrzebny aktywny dostawca powiązany z ING-SUGAR').toHaveLength(1);
    flow.supplierId = suppliers[0]!.id;
    console.log(`[T3] dostawca ${suppliers[0]!.name} waluta przed = ${suppliers[0]!.currency}`);

    await page.goto(url(`/${L}/planning/suppliers/${flow.supplierId}`), { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('supplier-detail-view')).toBeVisible({ timeout: COMPILE });
    await page.getByTestId('supplier-edit-open').click();

    const form = page.getByTestId('edit-supplier-form');
    await expect(form).toBeVisible({ timeout: 30_000 });
    await pickSelect(page, form.getByRole('combobox', { name: /currency/i }), /^GBP/);
    await shot(page, 'T3-supplier-currency-gbp');
    await page.getByTestId('edit-supplier-submit').click();

    await expect
      .poll(
        async () => {
          const rows = await sql<{ currency: string }>(
            `select currency from public.suppliers where id = $1::uuid`,
            [flow.supplierId],
          );
          return rows[0]?.currency;
        },
        { timeout: 60_000, message: 'waluta dostawcy musi zostać zapisana w bazie' },
      )
      .toBe('GBP');
    console.log(`[T3] błędy strony: ${errors.length ? errors.join(' | ') : 'brak'}`);
  });

  // ── T4 ── Utworzenie zamówienia w GBP ───────────────────────────────────────
  test('T4 utworzenie PO w GBP z linią 100 kg × 1.50', async ({ page }) => {
    test.setTimeout(300_000);
    const errors: string[] = [];
    collectPageErrors(page, errors);

    const [{ name: supplierName }] = await sql<{ name: string }>(
      `select name from public.suppliers where id = $1::uuid`,
      [flow.supplierId],
    );

    await page.goto(url(`/${L}/planning/purchase-orders`), { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('po-list-view')).toBeVisible({ timeout: COMPILE });
    await page.getByTestId('po-list-create').click();

    const form = page.getByTestId('create-po-form');
    await expect(form).toBeVisible({ timeout: 30_000 });

    await pickSelect(page, form.getByRole('combobox', { name: /supplier/i }), new RegExp(escapeRx(supplierName)));
    await expect(
      form.getByTestId('create-po-currency'),
      'waluta zamówienia jest pochodną dostawcy — po T3 musi być GBP',
    ).toHaveValue('GBP', { timeout: 30_000 });

    // Wiersz linii wskazany po WŁASNYM data-testid (create-po-line-<klucz>), nie po indeksie:
    // po wyborze pozycji ItemPicker znika z DOM, więc filtr „has: item-picker-trigger" by się rozjechał.
    const lineRows = form.getByTestId('create-po-lines').locator('tr[data-testid^="create-po-line-"]');
    await expect(lineRows, 'świeży formularz zaczyna od dokładnie jednej pustej linii').toHaveCount(1);
    const lineTestId = await lineRows.first().getAttribute('data-testid');
    expect(lineTestId).toBeTruthy();
    const lineRow = form.locator(`[data-testid="${lineTestId}"]`);

    await pickItem(page, lineRow, flow.sugarItemId, 'ING-SUGAR');
    await expect(lineRow.getByTestId('create-po-line-item')).toBeVisible({ timeout: 30_000 });

    const uomTrigger = lineRow.getByRole('combobox', { name: /uom/i });
    await expect(uomTrigger, 'UoM linii musi wyjść z bazowej jednostki pozycji (kg)').toContainText(/kg/i, {
      timeout: 30_000,
    });

    await lineRow.getByTestId('create-po-line-qty').fill(QTY);
    // Cena bywa podpowiadana asynchronicznie po wyborze pozycji — wpisujemy ją na końcu
    // i potwierdzamy wartość tuż przed wysyłką, żeby podpowiedź nas nie nadpisała.
    await lineRow.getByTestId('create-po-line-price').fill(PRICE);
    await expect(lineRow.getByTestId('create-po-line-price')).toHaveValue(PRICE, { timeout: 15_000 });
    await shot(page, 'T4-create-po-form');

    // Znacznik czasu z BAZY (nie z hosta) — bez niego kolejny przebieg trafiłby na PO
    // z poprzedniego uruchomienia i „zielone" nie dotyczyłoby tej akcji.
    const [{ t: marker }] = await sql<{ t: string }>(`select now()::text as t`);
    await page.getByTestId('create-po-submit').click();

    await expect
      .poll(
        async () => {
          const rows = await sql<{ n: string }>(
            `select count(*)::text as n from public.purchase_orders
              where org_id = $1::uuid and supplier_id = $2::uuid and created_at > $3::timestamptz`,
            [ORG_ID, flow.supplierId, marker],
          );
          return Number(rows[0]!.n);
        },
        { timeout: 90_000, message: 'nowe PO musi powstać w bazie' },
      )
      .toBe(1);

    const [po] = await sql<{
      id: string;
      po_number: string;
      status: string;
      currency: string;
      site_id: string | null;
    }>(
      `select id::text, po_number, status, currency, site_id::text
         from public.purchase_orders
        where org_id = $1::uuid and supplier_id = $2::uuid and created_at > $3::timestamptz`,
      [ORG_ID, flow.supplierId, marker],
    );
    flow.newPoId = po.id;
    flow.newPoNumber = po.po_number;
    console.log(`[T4] utworzone PO = ${JSON.stringify(po)}`);

    expect(po.status, 'nowe PO może się urodzić TYLKO jako draft').toBe('draft');
    expect(po.currency).toBe('GBP');
    expect(po.site_id, 'PO musi mieć zakład').not.toBeNull();

    const lines = await sql<{ id: string; qty: string; uom: string; unit_price: string }>(
      `select id::text, qty::text, uom, unit_price::text from public.purchase_order_lines where po_id = $1::uuid`,
      [flow.newPoId],
    );
    console.log(`[T4] linie = ${JSON.stringify(lines)}`);
    expect(lines).toHaveLength(1);
    flow.newPoLineId = lines[0]!.id;
    expect(Number(lines[0]!.qty)).toBe(Number(QTY));
    expect(lines[0]!.uom.toLowerCase()).toBe('kg');
    expect(Number(lines[0]!.unit_price)).toBe(Number(PRICE));
    console.log(`[T4] błędy strony: ${errors.length ? errors.join(' | ') : 'brak'}`);
  });

  // ── T5 ── Submit → Confirm ──────────────────────────────────────────────────
  test('T5 PO w GBP przechodzi draft → sent → confirmed', async ({ page }) => {
    test.setTimeout(300_000);
    const errors: string[] = [];
    collectPageErrors(page, errors);

    await page.goto(url(`/${L}/planning/purchase-orders/${flow.newPoId}`), { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('po-detail-view')).toBeVisible({ timeout: COMPILE });

    await page.getByTestId('po-transition-sent').click();
    await expect
      .poll(async () => (await sql<{ status: string }>(`select status from public.purchase_orders where id = $1::uuid`, [flow.newPoId]))[0]?.status, {
        timeout: 60_000,
        message: 'PO musi przejść w sent',
      })
      .toBe('sent');

    await expect(page.getByTestId('po-transition-confirmed')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('po-transition-confirmed').click();
    await expect
      .poll(async () => (await sql<{ status: string }>(`select status from public.purchase_orders where id = $1::uuid`, [flow.newPoId]))[0]?.status, {
        timeout: 60_000,
        message: 'PO musi przejść w confirmed',
      })
      .toBe('confirmed');
    await shot(page, 'T5-confirmed');
    console.log(`[T5] błędy strony: ${errors.length ? errors.join(' | ') : 'brak'}`);
  });

  // ── T6 ── Przyjęcie: GRN + nośnik + wycena, z kontrolą site_id ──────────────
  test('T6 przyjęcie 100 kg tworzy GRN, nośnik i wpis wyceny — z zakładem na każdym wierszu', async ({ page }) => {
    test.setTimeout(300_000);
    const errors: string[] = [];
    collectPageErrors(page, errors);

    const [wacBefore] = await sql<{ qty: string; value: string }>(
      `select coalesce(sum(total_qty_kg), 0)::text as qty, coalesce(sum(total_value), 0)::text as value
         from public.item_wac_state where org_id = $1::uuid and item_id = $2::uuid`,
      [ORG_ID, flow.sugarItemId],
    );
    const [movesBefore] = await sql<{ n: string }>(
      `select count(*)::text as n from public.stock_moves where org_id = $1::uuid`,
      [ORG_ID],
    );
    console.log(`[T6] WAC przed = ${JSON.stringify(wacBefore)}; stock_moves przed = ${movesBefore.n}`);

    await page.goto(url(`/${L}/planning/purchase-orders/${flow.newPoId}`), { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('po-detail-view')).toBeVisible({ timeout: COMPILE });

    const receive = page.getByTestId(`po-line-receive-${flow.newPoLineId}`);
    await expect(receive, 'na potwierdzonym PO linia musi mieć Receive').toBeVisible({ timeout: 30_000 });
    await receive.click();
    await expect(page.getByTestId('po-receive-form')).toBeVisible({ timeout: 30_000 });

    const qtyField = page.getByTestId('po-receive-qty');
    const prefilled = await qtyField.inputValue();
    console.log(`[T6] ilość podpowiedziana przez formularz = ${prefilled}`);
    expect(Number(prefilled), 'formularz musi podpowiedzieć pozostałą ilość').toBe(Number(QTY));
    await page.getByTestId('po-receive-batch').fill('E2E-GRN-BATCH');
    await page.getByTestId('po-receive-submit').click();

    // Najpierw: czy akcja w ogóle się wykonała (dowód = wiersz w bazie), a DOPIERO POTEM
    // co widzi użytkownik. Odwrotna kolejność myliłaby „brak komunikatu" z „brak akcji".
    await expect
      .poll(
        async () => {
          const rows = await sql<{ n: string }>(
            `select count(*)::text as n from public.grn_items where org_id = $1::uuid and po_line_id = $2::uuid`,
            [ORG_ID, flow.newPoLineId],
          );
          return Number(rows[0]!.n);
        },
        { timeout: 90_000, message: 'przyjęcie musi zapisać pozycję GRN' },
      )
      .toBe(1);

    // Stan ekranu w chwili, gdy przyjęcie JEST już w bazie.
    flow.uiFeedback = {
      success: await page.getByTestId('po-receive-success').count(),
      error: await page.getByTestId('po-receive-error').count(),
      form: await page.getByTestId('po-receive-form').count(),
      dialog: await page.getByRole('dialog').count(),
    };
    console.log(`[T6] co widzi użytkownik po udanym przyjęciu = ${JSON.stringify(flow.uiFeedback)}`);
    if (flow.uiFeedback.error > 0) {
      console.log(`[T6] treść błędu = ${await page.getByTestId('po-receive-error').innerText()}`);
    }
    if (flow.uiFeedback.success > 0) {
      console.log(`[T6] treść potwierdzenia = ${await page.getByTestId('po-receive-success').innerText()}`);
    }
    await shot(page, 'T6-po-submit');

    // ── dowód w bazie ─────────────────────────────────────────────────────────
    const grnItems = await sql<{
      id: string;
      site_id: string | null;
      received_qty: string;
      uom: string;
      lp_id: string;
      ext_jsonb: unknown;
      grn_id: string;
    }>(
      `select gi.id::text, gi.site_id::text, gi.received_qty::text, gi.uom, gi.lp_id::text,
              gi.ext_jsonb, gi.grn_id::text
         from public.grn_items gi
        where gi.org_id = $1::uuid and gi.po_line_id = $2::uuid`,
      [ORG_ID, flow.newPoLineId],
    );
    console.log(`[T6] grn_items = ${JSON.stringify(grnItems)}`);
    expect(grnItems, 'przyjęcie musi zapisać pozycję GRN').toHaveLength(1);
    flow.grnItemId = grnItems[0]!.id;
    flow.lpId = grnItems[0]!.lp_id;
    expect(Number(grnItems[0]!.received_qty)).toBe(Number(QTY));

    const [grn] = await sql<{ id: string; grn_number: string; site_id: string | null; status: string }>(
      `select id::text, grn_number, site_id::text, status from public.grns where id = $1::uuid`,
      [grnItems[0]!.grn_id],
    );
    console.log(`[T6] grns = ${JSON.stringify(grn)}`);
    expect(grn.site_id, 'nagłówek GRN musi mieć zakład').not.toBeNull();

    const [lp] = await sql<{
      id: string;
      site_id: string | null;
      quantity: string;
      uom: string;
      status: string;
      qa_status: string;
      warehouse_id: string | null;
    }>(
      `select id::text, site_id::text, quantity::text, uom, status, qa_status, warehouse_id::text
         from public.license_plates where id = $1::uuid`,
      [flow.lpId],
    );
    console.log(`[T6] license_plates = ${JSON.stringify(lp)}`);
    expect(lp.site_id, 'nośnik zapasu MUSI mieć zakład').not.toBeNull();
    expect(Number(lp.quantity)).toBe(Number(QTY));
    expect(lp.uom.toLowerCase()).toBe('kg');

    const [movesAfter] = await sql<{ n: string }>(
      `select count(*)::text as n from public.stock_moves where org_id = $1::uuid`,
      [ORG_ID],
    );
    console.log(`[T6] stock_moves po = ${movesAfter.n} (delta ${Number(movesAfter.n) - Number(movesBefore.n)})`);

    const [wacAfter] = await sql<{ qty: string; value: string }>(
      `select coalesce(sum(total_qty_kg), 0)::text as qty, coalesce(sum(total_value), 0)::text as value
         from public.item_wac_state where org_id = $1::uuid and item_id = $2::uuid`,
      [ORG_ID, flow.sugarItemId],
    );
    console.log(`[T6] WAC po = ${JSON.stringify(wacAfter)}`);
    expect(Number(wacAfter.qty) - Number(wacBefore.qty), 'wycena musi urosnąć o przyjęte kilogramy').toBeCloseTo(
      Number(QTY),
      3,
    );
    expect(Number(wacAfter.value) - Number(wacBefore.value), 'wycena musi urosnąć o wartość przyjęcia').toBeCloseTo(
      EXPECTED_VALUE,
      2,
    );

    const wacRows = await sql<{ site_id: string | null; total_qty_kg: string; total_value: string; avg_cost: string }>(
      `select site_id::text, total_qty_kg::text, total_value::text, avg_cost::text
         from public.item_wac_state where org_id = $1::uuid and item_id = $2::uuid`,
      [ORG_ID, flow.sugarItemId],
    );
    console.log(`[T6] item_wac_state = ${JSON.stringify(wacRows)}`);
    console.log(`[T6] błędy strony: ${errors.length ? errors.join(' | ') : 'brak'}`);
  });

  // ── T7 ── Ekran wyceny vs. baza ─────────────────────────────────────────────
  test('T7 liczba na ekranie wyceny zgadza się z item_wac_state', async ({ page }) => {
    test.setTimeout(300_000);
    const errors: string[] = [];
    collectPageErrors(page, errors);

    const [db] = await sql<{ qty: string; value: string; avg: string }>(
      `select total_qty_kg::text as qty, total_value::text as value, avg_cost::text as avg
         from public.item_wac_state where org_id = $1::uuid and item_id = $2::uuid
        order by total_qty_kg desc limit 1`,
      [ORG_ID, flow.sugarItemId],
    );
    console.log(`[T7] baza (item_wac_state) = ${JSON.stringify(db)}`);

    // Ta sama pula policzona przez zapytanie strony wyceny (LP → base_qty_kg × avg_cost).
    const readSide = await sql<{ on_hand: string; value: string; unvalued: string }>(
      `select coalesce(sum(case when conv.base_qty_kg is not null then conv.base_qty_kg end), 0)::text as on_hand,
              coalesce(sum(case when conv.base_qty_kg is not null then conv.base_qty_kg * coalesce(w.avg_cost, 0) end), 0)::text as value,
              coalesce(sum(case when conv.base_qty_kg is null then lp.quantity end), 0)::text as unvalued
         from public.license_plates lp
         join public.items i on i.id = lp.product_id and i.org_id = lp.org_id
         left join public.item_wac_state w on w.org_id = lp.org_id and w.item_id = lp.product_id
         cross join lateral (
           select case
             when lower(lp.uom) = 'kg' then lp.quantity
             when lower(lp.uom) = 'base' and lower(coalesce(i.uom_base, '')) = 'kg' then lp.quantity
             when lower(lp.uom) = lower(coalesce(i.uom_base, '')) and lower(coalesce(i.uom_base, '')) = 'kg' then lp.quantity
             when lower(lp.uom) = 'each' and i.net_qty_per_each is not null then lp.quantity * i.net_qty_per_each
             when lower(lp.uom) = 'box' and i.net_qty_per_each is not null and i.each_per_box is not null
               then lp.quantity * i.each_per_box::numeric * i.net_qty_per_each
             else null
           end as base_qty_kg
         ) conv
        where lp.org_id = $1::uuid and lp.product_id = $2::uuid and lp.quantity > 0`,
      [ORG_ID, flow.sugarItemId],
    );
    console.log(`[T7] strona czytająca (LP → kg) = ${JSON.stringify(readSide[0])}`);

    await page.goto(url(`/${L}/finance/valuation`), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: COMPILE });
    await shot(page, 'T7-valuation');

    const body = await page.locator('body').innerText();
    console.log(`[T7] ekran zawiera ING-SUGAR: ${/ING-SUGAR/i.test(body)}`);
    const sugarLine = body.split('\n').filter((l) => /ING-SUGAR|Sugar/i.test(l)).join(' ⏎ ');
    console.log(`[T7] wiersz na ekranie = ${sugarLine.slice(0, 400)}`);
    console.log(`[T7] błędy strony: ${errors.length ? errors.join(' | ') : 'brak'}`);

    expect(body, 'pozycja przyjęta na stan musi być widoczna na ekranie wyceny').toMatch(/ING-SUGAR/i);

    // Liczba NA EKRANIE vs. to samo zapytanie policzone wprost w bazie.
    const onScreenQty = /ING-SUGAR[^\n]*?\s(\d+\.\d+)\s/.exec(sugarLine)?.[1];
    console.log(`[T7] ilość odczytana z ekranu = ${onScreenQty}`);
    expect(onScreenQty, 'ekran musi pokazać ilość dla ING-SUGAR').toBeTruthy();
    expect(Number(onScreenQty), 'ekran musi zgadzać się z własnym zapytaniem').toBeCloseTo(
      Number(readSide[0]!.on_hand),
      3,
    );

    // Rozjazd rejestru wyceny i sumy nośników trafia do osobnego, końcowego testu.
    flow.reconcile = { wacQty: Number(db.qty), lpQty: Number(readSide[0]!.on_hand) };
  });

  // ── T10 ── Przeliczenie gramów na kilogramy (polowanie na błąd tysiąckrotny) ─
  test('T10 linia w gramach przelicza się na kilogramy', async ({ page }) => {
    test.setTimeout(300_000);
    const made = await createPoWithLine(page, { qty: '5000', uomLabel: /^g\b|^g —/, price: '0.002' });
    await sendAndConfirm(page, made.poId);
    await receiveLine(page, made.poId, made.lineId);

    const [item] = await sql<{ qty_kg: string; value: string; uom: string }>(
      `select (ext_jsonb ->> 'wac_qty_kg') as qty_kg, (ext_jsonb ->> 'wac_value') as value, uom
         from public.grn_items where org_id = $1::uuid and po_line_id = $2::uuid`,
      [ORG_ID, made.lineId],
    );
    console.log(`[T10] linia 5000 g @ 0.002 → zaksięgowano ${JSON.stringify(item)}`);
    expect(item.uom.toLowerCase()).toBe('g');
    expect(Number(item.qty_kg), '5000 g to 5 kg, nie 5000 kg').toBeCloseTo(5, 6);
    expect(Number(item.value), '5000 × 0.002 = 10.00').toBeCloseTo(10, 2);
  });

  // ── T11 ── Przeliczenie kartonów na kilogramy ───────────────────────────────
  test('T11 linia w kartonach przelicza się na kilogramy po konfiguracji pozycji', async ({ page }) => {
    test.setTimeout(300_000);

    // 1. Konfiguracja pozycji zgodnie z podpowiedzią z komunikatu blokującego:
    //    masa bazowa kg + jednostka wyjściowa Box + zawartość netto + sztuk w kartonie.
    await page.goto(url(`/${L}/technical/items?q=ING-SUGAR`), { waitUntil: 'domcontentloaded' });
    const row = page.locator('tr').filter({ has: page.getByRole('link', { name: 'ING-SUGAR' }) }).first();
    await expect(row, 'lista pozycji musi pokazać ING-SUGAR').toBeVisible({ timeout: COMPILE });
    await row.getByRole('button', { name: /edit/i }).click();

    // Pola zawartości netto są ODSŁANIANE dopiero po wybraniu jednostki wyjściowej
    // innej niż bazowa (item-create-wizard.tsx: `form.outputUom !== 'base'`).
    const packaging = page.locator('[data-section="packaging"]');
    for (let hop = 0; hop < 5 && !(await packaging.isVisible()); hop += 1) {
      await page.locator('[data-action="next"]').click();
    }
    await expect(packaging, 'krok z opakowaniem musi być osiągalny w edycji pozycji').toBeVisible({ timeout: 30_000 });

    await pickSelect(page, packaging.getByRole('combobox', { name: /output unit/i }), /^Box/);
    const netField = page.locator('#wiz-net-per-each');
    await expect(netField, 'po wyborze Box muszą odsłonić się pola zawartości').toBeVisible({ timeout: 15_000 });
    await netField.fill('0.5');
    await page.locator('#wiz-each-per-box').fill('10');
    await shot(page, 'T11-item-packaging');

    // ING-SUGAR ma w bazie `shelf_life_mode` bez `shelf_life_days`; formularz uznaje
    // taki stan za niekompletny i nie przepuszcza dalej, więc uzupełniamy dni.
    const shelfDays = page.locator('#wiz-shelf-days');
    if (await shelfDays.isVisible()) await shelfDays.fill('365');

    const save = page.locator('[data-action="submit"]');
    for (let hop = 0; hop < 5 && !(await save.isVisible()); hop += 1) {
      await page.locator('[data-action="next"]').click();
      const alert = page.getByRole('alert');
      if (await alert.count()) console.log(`[T11] kreator blokuje: ${await alert.first().innerText()}`);
    }
    await expect(save, 'zapis edycji pozycji musi być osiągalny').toBeVisible({ timeout: 30_000 });
    await save.click();

    await expect
      .poll(
        async () => {
          const rows = await sql<{ output_uom: string; net: string; per_box: string }>(
            `select output_uom, net_qty_per_each::text as net, each_per_box::text as per_box
               from public.items where id = $1::uuid`,
            [flow.sugarItemId],
          );
          return `${rows[0]?.output_uom}/${rows[0]?.net}/${rows[0]?.per_box}`;
        },
        { timeout: 60_000, message: 'konfiguracja opakowania musi zapisać się w bazie' },
      )
      .toBe('box/0.500000/10');

    // 2. Zamówienie 2 kartonów = 2 × 10 sztuk × 0.5 kg = 10 kg.
    const made = await createPoWithLine(page, { qty: '2', uomLabel: /^box\b|^box —/, price: '10.00' });
    await sendAndConfirm(page, made.poId);
    await receiveLine(page, made.poId, made.lineId);

    const [item] = await sql<{ qty_kg: string; value: string; uom: string }>(
      `select (ext_jsonb ->> 'wac_qty_kg') as qty_kg, (ext_jsonb ->> 'wac_value') as value, uom
         from public.grn_items where org_id = $1::uuid and po_line_id = $2::uuid`,
      [ORG_ID, made.lineId],
    );
    console.log(`[T11] linia 2 box @ 10.00 → zaksięgowano ${JSON.stringify(item)}`);
    expect(item.uom.toLowerCase()).toBe('box');
    expect(Number(item.qty_kg), '2 kartony × 10 sztuk × 0.5 kg = 10 kg').toBeCloseTo(10, 6);
    expect(Number(item.value), '2 × 10.00 = 20.00').toBeCloseTo(20, 2);
  });

  // ── T9 ── Potwierdzenie przyjęcia w interfejsie ────────────────────────────
  test('T9 udane przyjęcie pokazuje użytkownikowi potwierdzenie', async () => {
    console.log(`[T9] stan ekranu zarejestrowany w T6 = ${JSON.stringify(flow.uiFeedback)}`);
    expect(
      flow.uiFeedback.success + flow.uiFeedback.error,
      'po zapisanym przyjęciu ekran musi pokazać potwierdzenie albo błąd — nie może milczeć',
    ).toBeGreaterThan(0);
  });

});

/**
 * Kontrole niezależne od siebie — NIE szeregowo, żeby porażka jednej nie ukryła
 * wyniku drugiej. Czytają stan zbudowany przez łańcuch powyżej (ten sam worker).
 */
test.describe('Kontrole stanu po przejściu łańcucha', () => {
  test.skip(!baseURL, 'PLAYWRIGHT_BASE_URL nieustawiony — uruchom przez scripts/e2e-local.sh.');

  test.beforeEach(async ({ page }) => {
    acceptDialogs(page);
    await signIn(page, baseURL, L);
  });

  // ── T12 ── Uzgodnienie rejestru wyceny z sumą nośników ──────────────────────
  test('T12 rejestr wyceny uzgadnia się z sumą nośników zapasu', async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto(url(`/${L}/finance/valuation`), { waitUntil: 'domcontentloaded' });
    const unvalued = page.getByTestId('finance-valuation-unvalued');
    await expect(page.locator('table').first()).toBeVisible({ timeout: COMPILE });
    if (await unvalued.count()) {
      console.log(`[T12] blok „bez wyceny" na ekranie = ${(await unvalued.innerText()).replace(/\n/g, ' ⏎ ')}`);
    }

    const [grams] = await sql<{ n: string; qty: string }>(
      `select count(*)::text as n, coalesce(sum(quantity), 0)::text as qty
         from public.license_plates
        where org_id = $1::uuid and lower(uom) = 'g'
          and status not in ('consumed', 'shipped', 'destroyed', 'merged', 'returned')`,
      [ORG_ID],
    );
    console.log(`[T12] nośniki w gramach pominięte przez wycenę: ${grams.n} szt., ${grams.qty} g`);
    console.log(`[T12] item_wac_state=${flow.reconcile.wacQty} kg vs suma nośników=${flow.reconcile.lpQty} kg`);

    expect(
      flow.reconcile.lpQty,
      'ekran wyceny liczy kilogramy z nośników, a koszt jednostkowy z osobnego rejestru — muszą się zgadzać',
    ).toBeCloseTo(flow.reconcile.wacQty, 3);
  });

  // ── T8 ── Zakład na pozycji GRN (świeżo naprawiany obszar: migracje 551/557) ─
  test('T8 pozycja GRN utworzona przez przyjęcie ma zakład', async () => {
    const rows = await sql<{ id: string; site_id: string | null; grn_site: string | null }>(
      `select gi.id::text, gi.site_id::text, g.site_id::text as grn_site
         from public.grn_items gi
         join public.grns g on g.id = gi.grn_id and g.org_id = gi.org_id
        where gi.id = $1::uuid`,
      [flow.grnItemId],
    );
    console.log(`[T8] grn_items.site_id vs grns.site_id = ${JSON.stringify(rows)}`);

    const orphans = await sql<{ n: string }>(
      `select count(*)::text as n from public.grn_items where org_id = $1::uuid and site_id is null`,
      [ORG_ID],
    );
    console.log(`[T8] pozycje GRN bez zakładu w całej organizacji = ${orphans[0]!.n}`);

    expect(
      rows[0]!.site_id,
      'pozycja GRN MUSI mieć zakład: nagłówek GRN go ma (trigger), a pozycja nie — ' +
        'wstawka w receive-po-line-core.ts nie wymienia kolumny site_id',
    ).not.toBeNull();
  });

});

function escapeRx(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Nowe PO na ING-SUGAR u dostawcy GBP, z jedną linią w podanej jednostce. */
async function createPoWithLine(
  page: Page,
  input: { qty: string; uomLabel: RegExp; price: string },
): Promise<{ poId: string; lineId: string }> {
  const [{ name: supplierName }] = await sql<{ name: string }>(
    `select name from public.suppliers where id = $1::uuid`,
    [flow.supplierId],
  );

  await page.goto(url(`/${L}/planning/purchase-orders`), { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('po-list-view')).toBeVisible({ timeout: COMPILE });
  await page.getByTestId('po-list-create').click();

  const form = page.getByTestId('create-po-form');
  await expect(form).toBeVisible({ timeout: 30_000 });
  await pickSelect(page, form.getByRole('combobox', { name: /supplier/i }), new RegExp(escapeRx(supplierName)));

  const lineRows = form.getByTestId('create-po-lines').locator('tr[data-testid^="create-po-line-"]');
  await expect(lineRows).toHaveCount(1);
  const lineTestId = await lineRows.first().getAttribute('data-testid');
  const lineRow = form.locator(`[data-testid="${lineTestId}"]`);

  await pickItem(page, lineRow, flow.sugarItemId, 'ING-SUGAR');
  await expect(lineRow.getByTestId('create-po-line-item')).toBeVisible({ timeout: 30_000 });
  await pickSelect(page, lineRow.getByRole('combobox', { name: /uom/i }), input.uomLabel);
  await lineRow.getByTestId('create-po-line-qty').fill(input.qty);
  await lineRow.getByTestId('create-po-line-price').fill(input.price);
  await expect(lineRow.getByTestId('create-po-line-price')).toHaveValue(input.price, { timeout: 15_000 });

  const [{ t: marker }] = await sql<{ t: string }>(`select now()::text as t`);
  await page.getByTestId('create-po-submit').click();

  await expect
    .poll(
      async () => {
        const rows = await sql<{ n: string }>(
          `select count(*)::text as n from public.purchase_orders
            where org_id = $1::uuid and supplier_id = $2::uuid and created_at > $3::timestamptz`,
          [ORG_ID, flow.supplierId, marker],
        );
        return Number(rows[0]!.n);
      },
      { timeout: 90_000, message: 'nowe PO musi powstać w bazie' },
    )
    .toBe(1);

  const [po] = await sql<{ id: string }>(
    `select id::text from public.purchase_orders
      where org_id = $1::uuid and supplier_id = $2::uuid and created_at > $3::timestamptz`,
    [ORG_ID, flow.supplierId, marker],
  );
  const [line] = await sql<{ id: string; uom: string }>(
    `select id::text, uom from public.purchase_order_lines where po_id = $1::uuid`,
    [po.id],
  );
  console.log(`[helper] PO ${po.id} linia ${line.id} w jednostce ${line.uom}`);
  return { poId: po.id, lineId: line.id };
}

async function sendAndConfirm(page: Page, poId: string): Promise<void> {
  await page.goto(url(`/${L}/planning/purchase-orders/${poId}`), { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('po-detail-view')).toBeVisible({ timeout: COMPILE });
  for (const target of ['sent', 'confirmed'] as const) {
    await expect(page.getByTestId(`po-transition-${target}`)).toBeVisible({ timeout: 60_000 });
    await page.getByTestId(`po-transition-${target}`).click();
    await expect
      .poll(
        async () =>
          (await sql<{ status: string }>(`select status from public.purchase_orders where id = $1::uuid`, [poId]))[0]
            ?.status,
        { timeout: 60_000, message: `PO musi przejść w ${target}` },
      )
      .toBe(target);
  }
}

async function receiveLine(page: Page, poId: string, lineId: string): Promise<void> {
  await page.goto(url(`/${L}/planning/purchase-orders/${poId}`), { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('po-detail-view')).toBeVisible({ timeout: COMPILE });
  await page.getByTestId(`po-line-receive-${lineId}`).click();
  await expect(page.getByTestId('po-receive-form')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('po-receive-submit').click();

  const failure = page.getByTestId('po-receive-error');
  await expect
    .poll(
      async () => {
        if (await failure.count()) throw new Error(`przyjęcie odrzucone: ${await failure.innerText()}`);
        const rows = await sql<{ n: string }>(
          `select count(*)::text as n from public.grn_items where org_id = $1::uuid and po_line_id = $2::uuid`,
          [ORG_ID, lineId],
        );
        return Number(rows[0]!.n);
      },
      { timeout: 90_000, message: 'przyjęcie musi zapisać pozycję GRN' },
    )
    .toBe(1);
}
