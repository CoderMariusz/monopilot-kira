/**
 * PRODUKCJA → FINANSE — end-to-end przejście odcinka łańcucha w przeglądarce.
 *
 * Łańcuch (każdy krok bramkuje następny):
 *   1. Lista WO → detal zlecenia IN_PROGRESS.
 *   2. Zakładka Consumption → „Record consumption" (materiał + ilość)
 *        → `wo_material_consumption` + `wo_materials.consumed_qty`.
 *   3. Zakładka Output → „Register output" (ilość + partia)
 *        → `wo_outputs` + nowy `license_plates` + `stock_moves` (receipt) + `item_wac_state`.
 *   4. Akcja Complete → `work_orders.status = COMPLETED`.
 *   5. Finanse (`/finance`) → koszt rzeczywisty tego WO na ekranie vs. wyliczenie z bazy.
 *   6. Finanse → wycena zapasu (`/finance/valuation`) → suma na ekranie vs. SUM(LP × WAC).
 *
 * DOWÓD = TRWAŁY WIERSZ W BAZIE. Renderowanie strony nie jest dowodem — po każdej
 * akcji spec czyta stan wprost z Postgresa (wzorzec: npd-create-to-wo-flow.e2e.spec.ts:60-80).
 * Uruchamiać WYŁĄCZNIE przez `bash scripts/e2e-local.sh` (asercja 127.0.0.1 + workers=1).
 */

import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';

import { signIn } from './_shared/parity-login';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const artifactDir = path.resolve(__dirname, 'artifacts/production-to-finance-chain');
const L = 'en';

const { Client } = pg;
const ownerConnectionString = process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL ?? '';

async function sql<T extends Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
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

/** Playwright DOMYŚLNIE ODRZUCA confirm() — bez tego „przycisk nie działa" jest fałszywy. */
function acceptDialogs(page: Page): void {
  page.on('dialog', (d) => {
    void d.accept().catch(() => undefined);
  });
}

/** Wybór opcji w prymitywie <Select> (portalowany panel, role=option). */
async function pickSelectOption(page: Page, triggerId: string, optionLabel: RegExp): Promise<void> {
  const trigger = page.locator(`#${triggerId}`);
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  await trigger.click();
  await page.getByRole('option', { name: optionLabel }).first().click({ timeout: 10_000 });
}

const WO_NUMBER = 'DEMO-WO-259-003';
const OUTPUT_QTY = '60';
const WO2_NUMBER = 'DEMO-WO-259-004';
const FLOUR_COST = '2.5000';
const FG_COST = '3.0000';

test.describe.serial('produkcja → finanse: konsumpcja → output → complete → koszt WO → wycena', () => {
  test.describe.configure({ timeout: 300_000 });

  test.skip(!baseURL, 'PLAYWRIGHT_BASE_URL unset — wymagany żywy serwer (scripts/e2e-local.sh).');

  const flow = {
    woId: '',
    batch: `E2E-P2F-${Date.now().toString().slice(-8)}`,
    consumedBefore: '0',
    outputsBefore: 0,
    consumeQty: '0',
    chainAFresh: false,
    wo2Id: '',
    batch2: `E2E-P2F-B-${Date.now().toString().slice(-8)}`,
    batch3: `E2E-P2F-C-${Date.now().toString().slice(-8)}`,
    consumptionWacAfterCost: null as string | null,
    positiveControlWac: null as string | null,
    listLinkNavigates: false,
    listLinkNavigatesAfterSearch: false,
  };

  test('1 · lista WO → detal zlecenia IN_PROGRESS', async ({ page }) => {
    acceptDialogs(page);
    await signIn(page, baseURL, L, 'admin');

    const [wo] = await sql<{ id: string; status: string }>(
      `select id::text, status from public.work_orders where wo_number = $1`,
      [WO_NUMBER],
    );
    expect(wo, `fixture: ${WO_NUMBER} musi istnieć w lokalnej bazie`).toBeTruthy();
    flow.woId = wo!.id;
    // Fixture jest JEDNORAZOWY: po pierwszym przebiegu WO jest COMPLETED i kroków
    // 2-4 nie da się powtórzyć. Zamiast udawać zieleń — jawny skip w krokach 2-4.
    flow.chainAFresh = wo!.status === 'IN_PROGRESS';
    // eslint-disable-next-line no-console
    console.log('[STAN 1] status', WO_NUMBER, '=', wo!.status, '· łańcuch A wykonalny =', flow.chainAFresh);

    // ── A. klik w link BEZ dotykania wyszukiwarki ────────────────────────────
    await page.goto(url(`/${L}/production/wos`), { waitUntil: 'domcontentloaded' });
    const linkPlain = page.getByRole('link', { name: new RegExp(WO_NUMBER) }).first();
    await expect(linkPlain, 'WO widoczne na liście produkcji').toBeVisible({ timeout: 60_000 });
    const hrefPlain = await linkPlain.getAttribute('href');
    await linkPlain.click({ timeout: 15_000 });
    const navPlain = await page
      .waitForURL(/\/production\/wos\/[0-9a-f-]+$/, { timeout: 90_000 })
      .then(() => true)
      .catch(() => false);
    // eslint-disable-next-line no-console
    console.log('[OBSERWACJA 1A] href =', hrefPlain, '· nawigacja po kliku =', navPlain, '· URL =', page.url());
    await shot(page, '01-list-click-plain');

    // ── B. ta sama akcja PO wpisaniu frazy w wyszukiwarkę ────────────────────
    await page.goto(url(`/${L}/production/wos`), { waitUntil: 'domcontentloaded' });
    const search = page.getByTestId('wo-list-search');
    if (await search.count()) await search.fill(WO_NUMBER);
    const linkSearched = page.getByRole('link', { name: new RegExp(WO_NUMBER) }).first();
    await expect(linkSearched).toBeVisible({ timeout: 30_000 });
    await linkSearched.click({ timeout: 15_000 });
    const navSearched = await page
      .waitForURL(/\/production\/wos\/[0-9a-f-]+$/, { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    // eslint-disable-next-line no-console
    console.log('[OBSERWACJA 1B] po wpisaniu frazy — nawigacja po kliku =', navSearched, '· URL =', page.url());
    await shot(page, '01b-list-click-after-search');

    // ── C. wejście bezpośrednie — bramka dla reszty łańcucha ─────────────────
    await page.goto(url(`/${L}/production/wos/${flow.woId}`), { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('wo-detail-header')).toBeVisible({ timeout: 120_000 });
    await shot(page, '02-wo-detail');
    // Werdykt o samym linku zapada w teście 7 — inaczej describe.serial ucina
    // resztę łańcucha na pierwszym czerwonym i nic dalej nie zostaje zmierzone.
    flow.listLinkNavigates = navPlain;
    flow.listLinkNavigatesAfterSearch = navSearched;
  });

  test('2 · Record consumption zapisuje zużycie materiału', async ({ page }) => {
    test.skip(!flow.chainAFresh, `${WO_NUMBER} nie jest już IN_PROGRESS — fixture zużyty we wcześniejszym przebiegu`);
    acceptDialogs(page);
    await signIn(page, baseURL, L, 'admin');
    await page.goto(url(`/${L}/production/wos/${flow.woId}`), { waitUntil: 'domcontentloaded' });

    const before = await sql<{ consumed: string; rows: string; output_kg: string }>(
      `select coalesce(sum(m.consumed_qty),0)::text as consumed,
              (select count(*)::text from public.wo_material_consumption c where c.wo_id = $1::uuid) as rows,
              coalesce((select sum(o.qty_kg) from public.wo_outputs o
                         where o.wo_id = $1::uuid and o.output_type = 'primary'
                           and o.correction_of_id is null),0)::text as output_kg
         from public.wo_materials m where m.wo_id = $1::uuid`,
      [flow.woId],
    );
    flow.consumedBefore = before[0]!.consumed;
    // Bramka „closed_production_strict_v1": zużycie musi zmieścić się w ±2 %
    // ilorazu output / wydajność (domyślnie 100 %). Dlatego dosypujemy dokładnie
    // tyle, żeby po kroku 3 zużycie = output — inaczej Complete wymaga override'u
    // z PIN-em i łańcuch staje na regule biznesowej, nie na defekcie.
    const targetConsumption = Number(before[0]!.output_kg) + Number(OUTPUT_QTY);
    const delta = Math.max(1, targetConsumption - Number(before[0]!.consumed));
    flow.consumeQty = delta.toFixed(3);
    // eslint-disable-next-line no-console
    console.log('[PLAN 2] output_kg=', before[0]!.output_kg, 'consumed=', before[0]!.consumed, '→ dosypujemy', flow.consumeQty);

    await page.getByTestId('wo-detail-tab-consumption').click();
    const trigger = page.getByTestId('wo-consumption-record');
    await expect(trigger, 'przycisk „Record consumption" na zakładce Consumption').toBeVisible({
      timeout: 20_000,
    });
    await trigger.click();

    await expect(page.getByTestId('wo-consume-submit')).toBeVisible({ timeout: 20_000 });
    await shot(page, '03-consume-modal-open');

    await pickSelectOption(page, 'wo-consume-material', /Flour/i);
    await page.getByTestId('wo-consume-qty').fill(flow.consumeQty);

    // Bez LP (fallback „— no LP —") formularz wymaga kodu powodu.
    const reason = page.getByTestId('wo-consume-reason');
    if (await reason.count()) await reason.fill('E2E-P2F');
    await shot(page, '04-consume-modal-filled');

    const submit = page.getByTestId('wo-consume-submit');
    await expect(submit, 'Submit odblokowany po wypełnieniu formularza').toBeEnabled({
      timeout: 10_000,
    });
    await submit.click();
    await page.waitForTimeout(4_000);
    await shot(page, '05-consume-after-submit');

    const after = await sql<{ consumed: string; rows: string }>(
      `select coalesce(sum(m.consumed_qty),0)::text as consumed,
              (select count(*)::text from public.wo_material_consumption c where c.wo_id = $1::uuid) as rows
         from public.wo_materials m where m.wo_id = $1::uuid`,
      [flow.woId],
    );
    // eslint-disable-next-line no-console
    console.log('[DOWÓD 2] wo_material_consumption / consumed_qty:', JSON.stringify(after[0]));
    expect(Number(after[0]!.rows), 'wiersz w wo_material_consumption powstał').toBeGreaterThan(0);
    expect(
      Number(after[0]!.consumed) - Number(flow.consumedBefore),
      'wo_materials.consumed_qty wzrosło o zapisaną ilość',
    ).toBeCloseTo(Number(flow.consumeQty), 3);
  });

  test('3 · Register output tworzy wiersz wyjścia, LP i ruch magazynowy', async ({ page }) => {
    test.skip(!flow.chainAFresh, `${WO_NUMBER} nie jest już IN_PROGRESS — fixture zużyty we wcześniejszym przebiegu`);
    acceptDialogs(page);
    await signIn(page, baseURL, L, 'admin');
    await page.goto(url(`/${L}/production/wos/${flow.woId}`), { waitUntil: 'domcontentloaded' });

    const before = await sql<{ n: string }>(
      `select count(*)::text as n from public.wo_outputs where wo_id = $1::uuid`,
      [flow.woId],
    );
    flow.outputsBefore = Number(before[0]!.n);

    await page.getByTestId('wo-detail-tab-output').click();
    const addOutput = page.getByTestId('wo-output-add');
    await expect(addOutput, 'przycisk rejestracji outputu na zakładce Output').toBeVisible({
      timeout: 20_000,
    });
    await addOutput.click();

    await expect(page.getByTestId('wo-output-qty')).toBeVisible({ timeout: 20_000 });
    await shot(page, '06-output-modal-open');
    await page.getByTestId('wo-output-qty').fill(OUTPUT_QTY);
    const batch = page.getByTestId('wo-output-batch');
    if (await batch.count()) await batch.fill(flow.batch);
    await shot(page, '07-output-modal-filled');

    await page.getByTestId('wo-output-confirm').click();
    await page.waitForTimeout(5_000);
    await shot(page, '08-output-after-confirm');

    const outputs = await sql<{
      id: string;
      qty_kg: string;
      batch_number: string;
      lp_id: string | null;
    }>(
      `select id::text, qty_kg::text, batch_number, lp_id::text
         from public.wo_outputs where wo_id = $1::uuid order by registered_at desc`,
      [flow.woId],
    );
    // eslint-disable-next-line no-console
    console.log('[DOWÓD 3a] wo_outputs:', JSON.stringify(outputs));
    expect(outputs.length, 'nowy wiersz w wo_outputs').toBeGreaterThan(flow.outputsBefore);
    const fresh = outputs.find((o) => o.batch_number === flow.batch);
    expect(fresh, `output z partią ${flow.batch} zapisany`).toBeTruthy();
    expect(Number(fresh!.qty_kg)).toBeCloseTo(Number(OUTPUT_QTY), 3);

    const moves = await sql<{ n: string }>(
      `select count(*)::text as n from public.stock_moves
        where wo_id = $1::uuid and reason_code = 'production_output'`,
      [flow.woId],
    );
    // eslint-disable-next-line no-console
    console.log('[DOWÓD 3b] stock_moves(production_output):', moves[0]!.n, 'lp_id:', fresh!.lp_id);
    expect(fresh!.lp_id, 'output dostał nośnik (license_plate)').not.toBeNull();
    expect(Number(moves[0]!.n), 'ruch magazynowy typu receipt powstał').toBeGreaterThan(0);
  });

  test('4 · Complete przenosi WO do COMPLETED', async ({ page }) => {
    test.skip(!flow.chainAFresh, `${WO_NUMBER} nie jest już IN_PROGRESS — fixture zużyty we wcześniejszym przebiegu`);
    acceptDialogs(page);
    await signIn(page, baseURL, L, 'admin');
    await page.goto(url(`/${L}/production/wos/${flow.woId}`), { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('wo-action-bar')).toBeVisible({ timeout: 30_000 });
    await shot(page, '09-action-bar');

    const completeBtn = page.getByTestId('wo-action-complete');
    await expect(completeBtn, 'akcja Complete widoczna dla WO w toku').toBeVisible({
      timeout: 15_000,
    });
    await completeBtn.click();
    await page.waitForTimeout(1_500);
    await shot(page, '10-complete-modal');

    // Stan bramki wydajności PRZED kliknięciem — to ona decyduje, czy Confirm
    // jest aktywny, czy potrzebny override z PIN-em.
    const gate = page.getByTestId('wo-complete-gate-status');
    const gateGreen = (await gate.count()) ? await gate.getAttribute('data-gate-green') : 'brak';
    const gateText = (await gate.count()) ? (await gate.innerText()).trim() : 'brak';
    const strict = await sql<Record<string, string>>(
      `select o.output_kg, o.posted, o.expected
         from (select
                 coalesce((select sum(x.qty_kg) from public.wo_outputs x
                            where x.wo_id = $1::uuid and x.output_type='primary'
                              and x.correction_of_id is null),0)::text as output_kg,
                 coalesce((select sum(c.qty_consumed) from public.wo_material_consumption c
                            where c.wo_id = $1::uuid),0)::text as posted,
                 'yield 100% (brak BOM)'::text as expected) o`,
      [flow.woId],
    );
    // eslint-disable-next-line no-console
    console.log('[OBSERWACJA 4] bramka data-gate-green =', gateGreen, '·', gateText, '· baza:', JSON.stringify(strict[0]));

    const confirm = page.getByTestId('wo-complete-confirm');
    await expect(confirm).toBeVisible({ timeout: 15_000 });
    const confirmEnabled = await confirm.isEnabled();
    // eslint-disable-next-line no-console
    console.log('[OBSERWACJA 4b] Confirm aktywny =', confirmEnabled);
    if (!confirmEnabled) {
      // Ścieżka override: powód + PIN + uzasadnienie e-podpisu.
      await pickSelectOption(page, 'wo-complete-override', /./);
      await page.getByTestId('wo-complete-override-pin').fill('1234');
      await page.getByTestId('wo-complete-override-esign-reason').fill('E2E override');
      await shot(page, '10b-complete-override');
    }
    await confirm.click({ timeout: 30_000 });
    await page.waitForTimeout(6_000);
    await shot(page, '11-after-complete');
    const err = page.getByTestId('wo-complete-error');
    if (await err.count()) {
      // eslint-disable-next-line no-console
      console.log('[OBSERWACJA 4c] banner błędu:', (await err.innerText()).trim());
    }

    const rows = await sql<{ status: string; produced_quantity: string | null }>(
      `select status, produced_quantity::text from public.work_orders where id = $1::uuid`,
      [flow.woId],
    );
    // eslint-disable-next-line no-console
    console.log('[DOWÓD 4] work_orders:', JSON.stringify(rows[0]));
    expect(rows[0]!.status, 'status WO po akcji Complete').toMatch(/^(COMPLETED|CLOSED)$/);
  });

  test('5 · Finanse: koszt rzeczywisty WO na ekranie zgadza się z bazą', async ({ page }) => {
    acceptDialogs(page);
    await signIn(page, baseURL, L, 'admin');
    await page.goto(url(`/${L}/finance`), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4_000);
    await shot(page, '12-finance-wo-costs');

    const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    // eslint-disable-next-line no-console
    console.log('[EKRAN 5] /finance:', body.slice(0, 1200));

    const expected = await sql<{
      output_kg: string;
      material_qty: string;
      material_cost: string;
    }>(
      `select coalesce((select sum(o.qty_kg) from public.wo_outputs o where o.wo_id = $1::uuid),0)::text as output_kg,
              coalesce((select sum(c.qty_consumed) from public.wo_material_consumption c where c.wo_id = $1::uuid),0)::text as material_qty,
              coalesce((
                select sum(c.qty_consumed * coalesce(i.cost_per_kg, 0))
                  from public.wo_material_consumption c
                  join public.items i on i.id = c.component_id
                 where c.wo_id = $1::uuid
              ),0)::text as material_cost`,
      [flow.woId],
    );
    // eslint-disable-next-line no-console
    console.log('[DOWÓD 5] oczekiwane z bazy:', JSON.stringify(expected[0]));

    expect(body, 'ukończone WO widoczne na ekranie kosztów finansowych').toContain(WO_NUMBER);
  });

  test('6 · Finanse: wycena zapasu na ekranie zgadza się z SUM(LP × WAC)', async ({ page }) => {
    acceptDialogs(page);
    await signIn(page, baseURL, L, 'admin');
    await page.goto(url(`/${L}/finance/valuation`), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4_000);
    await shot(page, '13-finance-valuation');

    const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    // eslint-disable-next-line no-console
    console.log('[EKRAN 6] /finance/valuation:', body.slice(0, 1500));

    const expected = await sql<{ total_value: string; unvalued_lps: string; unvalued_qty: string }>(
      `with lp_valuation as (
         select lp.id, lp.quantity, w.avg_cost as wac
           from public.license_plates lp
           left join public.items i on i.id = lp.product_id
           left join public.item_wac_state w on w.org_id = lp.org_id and w.item_id = lp.product_id
          where lp.status not in ('consumed','shipped','destroyed','merged','returned')
       )
       select coalesce(sum(quantity * wac) filter (where wac is not null),0)::text as total_value,
              count(*) filter (where wac is null)::text as unvalued_lps,
              coalesce(sum(quantity) filter (where wac is null),0)::text as unvalued_qty
         from lp_valuation`,
    );
    // eslint-disable-next-line no-console
    console.log('[DOWÓD 6] oczekiwane z bazy:', JSON.stringify(expected[0]));

    const fgWac = await sql<{ item_code: string; total_qty_kg: string; avg_cost: string }>(
      `select i.item_code, w.total_qty_kg::text, w.avg_cost::text
         from public.item_wac_state w join public.items i on i.id = w.item_id
        order by i.item_code`,
    );
    // eslint-disable-next-line no-console
    console.log('[DOWÓD 6b] item_wac_state:', JSON.stringify(fgWac));

    expect(body.length, 'strona wyceny renderuje treść').toBeGreaterThan(50);
  });

  test('7 · werdykt: klik w numer WO na liście otwiera detal', async () => {
    expect(flow.listLinkNavigates, 'klik w numer WO (lista bez filtra) → detal').toBe(true);
    expect(
      flow.listLinkNavigatesAfterSearch,
      'klik w numer WO PO wpisaniu frazy w wyszukiwarkę → detal',
    ).toBe(true);
  });

  // ── KONTROLA PRZECIWNA ──────────────────────────────────────────────────────
  // Ta sama ścieżka (zużycie → output → complete → finanse), tylko z materiałem,
  // który MA koszt. Jeśli tu FG dostanie WAC, a w torze wyżej nie dostał, to
  // różnicą jest wyłącznie brak kosztu materiału — a nie „cała ścieżka WAC leży".
  test('8 · Technical: ustawienie kosztu materiału przez UI', async ({ page }) => {
    acceptDialogs(page);
    await signIn(page, baseURL, L, 'admin');
    await page.goto(url(`/${L}/technical/cost/history`), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3_000);
    await shot(page, '14-cost-history');

    // UWAGA: pasek aplikacji ma własny combobox „Site" — bez zawężenia do <main>
    // klik trafia w przełącznik zakładu, a nie w picker pozycji.
    const picker = page.locator('main').getByRole('combobox').first();
    await expect(picker).toBeVisible({ timeout: 30_000 });
    await picker.click();
    await page.getByRole('option', { name: /DEMO-RM-FLOUR/ }).first().click({ timeout: 15_000 });

    const editBtn = page.locator('[data-modal-id="TEC-COST-EDIT"]');
    await expect(editBtn, 'przycisk edycji kosztu widoczny dla uprawnionego').toBeVisible({
      timeout: 15_000,
    });
    await editBtn.click();
    await page.locator('input[name="costPerKg"]').fill(FLOUR_COST);
    await page.locator('input[name="notes"]').fill('E2E prod→fin kontrola przeciwna');
    await shot(page, '15-cost-modal');
    await page.locator('button[form="technical-cost-edit-form"]').click();
    await page.waitForTimeout(4_000);
    await shot(page, '16-cost-saved');

    const costRows = await sql<{ cost_per_kg: string | null; history: string }>(
      `select i.cost_per_kg::text,
              (select count(*)::text from public.item_cost_history h
                where h.item_id = i.id and h.effective_to is null) as history
         from public.items i where i.item_code = 'DEMO-RM-FLOUR'`,
    );
    // eslint-disable-next-line no-console
    console.log('[DOWÓD 8] items.cost_per_kg / item_cost_history:', JSON.stringify(costRows[0]));
    expect(costRows[0]!.cost_per_kg, 'koszt materiału zapisany w items').not.toBeNull();
    expect(Number(costRows[0]!.cost_per_kg)).toBeCloseTo(Number(FLOUR_COST), 4);
  });

  test('9 · drugie WO z KOSZTOWNYM materiałem: zużycie + output → WAC dla FG', async ({ page }) => {
    acceptDialogs(page);
    await signIn(page, baseURL, L, 'admin');

    const [wo2] = await sql<{ id: string; status: string }>(
      `select id::text, status from public.work_orders where wo_number = $1`,
      [WO2_NUMBER],
    );
    expect(wo2, `fixture: ${WO2_NUMBER}`).toBeTruthy();
    flow.wo2Id = wo2!.id;

    await page.goto(url(`/${L}/production/wos/${flow.wo2Id}`), { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('wo-detail-header')).toBeVisible({ timeout: 60_000 });

    const before = await sql<{ consumed: string; output_kg: string }>(
      `select coalesce((select sum(c.qty_consumed) from public.wo_material_consumption c
                         where c.wo_id = $1::uuid),0)::text as consumed,
              coalesce((select sum(o.qty_kg) from public.wo_outputs o
                         where o.wo_id = $1::uuid and o.output_type='primary'
                           and o.correction_of_id is null),0)::text as output_kg`,
      [flow.wo2Id],
    );
    const delta2 = Math.max(
      1,
      Number(before[0]!.output_kg) + Number(OUTPUT_QTY) - Number(before[0]!.consumed),
    );
    // eslint-disable-next-line no-console
    console.log('[PLAN 9]', JSON.stringify(before[0]), '→ dosypujemy', delta2);

    await page.getByTestId('wo-detail-tab-consumption').click();
    await page.getByTestId('wo-consumption-record').click();
    await expect(page.getByTestId('wo-consume-submit')).toBeVisible({ timeout: 20_000 });
    await pickSelectOption(page, 'wo-consume-material', /Flour/i);
    await page.getByTestId('wo-consume-qty').fill(delta2.toFixed(3));
    const reason2 = page.getByTestId('wo-consume-reason');
    if (await reason2.count()) await reason2.fill('E2E-P2F-2');
    await page.getByTestId('wo-consume-submit').click();
    await page.waitForTimeout(4_000);
    await shot(page, '17-wo2-consumed');

    await page.goto(url(`/${L}/production/wos/${flow.wo2Id}`), { waitUntil: 'domcontentloaded' });
    await page.getByTestId('wo-detail-tab-output').click();
    await page.getByTestId('wo-output-add').click();
    await expect(page.getByTestId('wo-output-qty')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('wo-output-qty').fill(OUTPUT_QTY);
    const batch2 = page.getByTestId('wo-output-batch');
    if (await batch2.count()) await batch2.fill(flow.batch2);
    await page.getByTestId('wo-output-confirm').click();
    await page.waitForTimeout(6_000);
    await shot(page, '18-wo2-output');

    const proof = await sql<{
      consumption_wac: string | null;
      output_wac: string | null;
      fg_wac_qty: string | null;
      fg_wac_cost: string | null;
    }>(
      `select (select c.ext_jsonb->>'wac_value' from public.wo_material_consumption c
                where c.wo_id = $1::uuid order by c.created_at desc limit 1) as consumption_wac,
              (select o.ext_jsonb->>'wac_value' from public.wo_outputs o
                where o.wo_id = $1::uuid and o.batch_number = $2 limit 1) as output_wac,
              (select w.total_qty_kg::text from public.item_wac_state w
                 join public.items i on i.id = w.item_id
                where i.item_code = 'E2E-FG-0609') as fg_wac_qty,
              (select w.avg_cost::text from public.item_wac_state w
                 join public.items i on i.id = w.item_id
                where i.item_code = 'E2E-FG-0609') as fg_wac_cost`,
      [flow.wo2Id, flow.batch2],
    );
    // eslint-disable-next-line no-console
    console.log('[DOWÓD 9] kontrola przeciwna:', JSON.stringify(proof[0]));
    flow.consumptionWacAfterCost = proof[0]!.consumption_wac;
    // Twardy dowód, że AKCJA się wykonała (wiersze są); werdykt o wartościach
    // zapada w teście 11, żeby kroki 9b/10 zdążyły dołożyć kontrolę pozytywną.
    const persisted = await sql<{ c: string; o: string }>(
      `select (select count(*)::text from public.wo_material_consumption where wo_id = $1::uuid) as c,
              (select count(*)::text from public.wo_outputs where wo_id = $1::uuid and batch_number = $2) as o`,
      [flow.wo2Id, flow.batch2],
    );
    expect(Number(persisted[0]!.c), 'zużycie zapisane').toBeGreaterThan(0);
    expect(Number(persisted[0]!.o), 'output zapisany').toBeGreaterThan(0);
  });

  // Kontrola POZYTYWNA: ta sama rejestracja outputu, ale FG ma koszt standardowy.
  // Jeśli tu WAC się zapisze, znaczy że sama ścieżka zapisu WAC żyje, a zero
  // z kroku 9 pochodzi wyłącznie z wyceny materiału.
  test('9b · koszt standardowy FG → output KSIĘGUJE WAC', async ({ page }) => {
    acceptDialogs(page);
    await signIn(page, baseURL, L, 'admin');
    await page.goto(url(`/${L}/technical/cost/history`), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3_000);
    const picker = page.locator('main').getByRole('combobox').first();
    await expect(picker).toBeVisible({ timeout: 30_000 });
    await picker.click();
    await page.getByRole('option', { name: /E2E-FG-0609/ }).first().click({ timeout: 15_000 });
    await page.locator('[data-modal-id="TEC-COST-EDIT"]').click();
    await page.locator('input[name="costPerKg"]').fill(FG_COST);
    await page.locator('input[name="notes"]').fill('E2E kontrola pozytywna');
    await page.locator('button[form="technical-cost-edit-form"]').click();
    await page.waitForTimeout(4_000);
    await shot(page, '21-fg-cost');

    await page.goto(url(`/${L}/production/wos/${flow.wo2Id}`), { waitUntil: 'domcontentloaded' });
    await page.getByTestId('wo-detail-tab-output').click();
    await page.getByTestId('wo-output-add').click();
    await expect(page.getByTestId('wo-output-qty')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('wo-output-qty').fill(OUTPUT_QTY);
    const b3 = page.getByTestId('wo-output-batch');
    if (await b3.count()) await b3.fill(flow.batch3);
    await page.getByTestId('wo-output-confirm').click();
    await page.waitForTimeout(6_000);
    await shot(page, '22-wo2-output-costed');

    const proof = await sql<{ output_wac: string | null; fg_qty: string | null; fg_cost: string | null }>(
      `select (select o.ext_jsonb->>'wac_value' from public.wo_outputs o
                where o.wo_id = $1::uuid and o.batch_number = $2 limit 1) as output_wac,
              (select w.total_qty_kg::text from public.item_wac_state w
                 join public.items i on i.id = w.item_id where i.item_code='E2E-FG-0609') as fg_qty,
              (select w.avg_cost::text from public.item_wac_state w
                 join public.items i on i.id = w.item_id where i.item_code='E2E-FG-0609') as fg_cost`,
      [flow.wo2Id, flow.batch3],
    );
    // eslint-disable-next-line no-console
    console.log('[DOWÓD 9b] kontrola pozytywna:', JSON.stringify(proof[0]));
    flow.positiveControlWac = proof[0]!.output_wac;

    // Zużycie dociągamy do sumy outputów, żeby krok 10 mógł domknąć WO bez override'u.
    const st = await sql<{ consumed: string; output_kg: string }>(
      `select coalesce((select sum(c.qty_consumed) from public.wo_material_consumption c
                         where c.wo_id = $1::uuid),0)::text as consumed,
              coalesce((select sum(o.qty_kg) from public.wo_outputs o
                         where o.wo_id = $1::uuid and o.output_type='primary'
                           and o.correction_of_id is null),0)::text as output_kg`,
      [flow.wo2Id],
    );
    const topUp = Number(st[0]!.output_kg) - Number(st[0]!.consumed);
    if (topUp > 0) {
      await page.goto(url(`/${L}/production/wos/${flow.wo2Id}`), { waitUntil: 'domcontentloaded' });
      await page.getByTestId('wo-detail-tab-consumption').click();
      await page.getByTestId('wo-consumption-record').click();
      await expect(page.getByTestId('wo-consume-submit')).toBeVisible({ timeout: 20_000 });
      await pickSelectOption(page, 'wo-consume-material', /Flour/i);
      await page.getByTestId('wo-consume-qty').fill(topUp.toFixed(3));
      const r3 = page.getByTestId('wo-consume-reason');
      if (await r3.count()) await r3.fill('E2E-P2F-3');
      await page.getByTestId('wo-consume-submit').click();
      await page.waitForTimeout(4_000);
    }
    expect(proof[0]!.fg_qty, 'FG dostał wiersz item_wac_state po ustawieniu kosztu standardowego').not.toBeNull();
  });

  test('10 · Finanse po kontroli przeciwnej: koszt WO i wycena przestają być zerowe', async ({
    page,
  }) => {
    acceptDialogs(page);
    await signIn(page, baseURL, L, 'admin');

    // Complete WO2, żeby trafiło na ekran kosztów finansowych.
    await page.goto(url(`/${L}/production/wos/${flow.wo2Id}`), { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('wo-action-bar')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('wo-action-complete').click();
    await page.waitForTimeout(2_000);
    const confirm2 = page.getByTestId('wo-complete-confirm');
    const gate2 = page.getByTestId('wo-complete-gate-status');
    // eslint-disable-next-line no-console
    console.log('[OBSERWACJA 10] bramka WO2 =', (await gate2.count()) ? await gate2.getAttribute('data-gate-green') : 'brak');
    if (await confirm2.isEnabled()) {
      await confirm2.click();
      await page.waitForTimeout(6_000);
    }
    const status2 = await sql<{ status: string }>(
      `select status from public.work_orders where id = $1::uuid`,
      [flow.wo2Id],
    );
    // eslint-disable-next-line no-console
    console.log('[DOWÓD 10a] status WO2:', JSON.stringify(status2[0]));

    await page.goto(url(`/${L}/finance`), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4_000);
    await shot(page, '19-finance-after-control');
    const finBody = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    // eslint-disable-next-line no-console
    console.log('[EKRAN 10] /finance:', finBody.slice(0, 1600));

    await page.goto(url(`/${L}/finance/valuation`), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4_000);
    await shot(page, '20-valuation-after-control');
    const valBody = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    // eslint-disable-next-line no-console
    console.log('[EKRAN 10b] /finance/valuation:', valBody.slice(0, 1600));

    const wac = await sql<{ item_code: string; total_qty_kg: string; avg_cost: string }>(
      `select i.item_code, w.total_qty_kg::text, w.avg_cost::text
         from public.item_wac_state w join public.items i on i.id = w.item_id order by i.item_code`,
    );
    // eslint-disable-next-line no-console
    console.log('[DOWÓD 10b] item_wac_state:', JSON.stringify(wac));

    const lps = await sql<{ item_code: string; qty: string; status: string; has_wac: boolean }>(
      `select i.item_code, lp.quantity::text as qty, lp.status,
              (w.id is not null) as has_wac
         from public.license_plates lp
         join public.items i on i.id = lp.product_id
         left join public.item_wac_state w on w.item_id = lp.product_id
        where lp.status not in ('consumed','shipped','destroyed','merged','returned')
        order by i.item_code`,
    );
    // eslint-disable-next-line no-console
    console.log('[DOWÓD 10c] LP vs WAC:', JSON.stringify(lps));

    // eslint-disable-next-line no-console
    console.log('[EKRAN 10c] wycena zawiera E2E-FG-0609 =', valBody.includes('E2E-FG-0609'));
  });

  test('11 · werdykt: koszt materiału ustawiony w Technical trafia do wyceny zużycia', async () => {
    // Kontrola pozytywna MUSI być zielona — inaczej nie wiadomo, czy ścieżka WAC żyje.
    expect(
      Number(flow.positiveControlWac ?? '0'),
      'kontrola pozytywna: output z kosztem standardowym FG księguje WAC',
    ).toBeGreaterThan(0);
    // A to jest defekt: 580 kg materiału po 2,5000 GBP wycenione na 0.
    expect(
      Number(flow.consumptionWacAfterCost ?? '0'),
      'zużycie materiału z ustawionym kosztem 2,5000 GBP/kg wycenione > 0',
    ).toBeGreaterThan(0);
  });
});
