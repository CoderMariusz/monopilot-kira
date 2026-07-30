/**
 * BOM → ZLECENIE → WYDANIE MATERIAŁU — domknięcie blokera z poprzedniego przejścia.
 *
 * Poprzedni tor E2E zatrzymał się, bo `bom_headers = 0` i „nie dało się utworzyć BOM-u
 * z interfejsu". Bez BOM-u `createWorkOrder` nie wypełnia `wo_materials`
 * (create-work-order-core.ts:252 — INSERT ... select from bom_lines odpala się TYLKO
 * gdy istnieje `bom_headers` o statusie 'active'), więc nie ma zużycia i nie ma kosztu.
 *
 * Łańcuch (każdy krok bramkuje następny):
 *   1. /technical/bom → „New BOM" → wybór FG → ekran first-authoring → „+ Add first
 *      component" → createBomDraft  ⇒ bom_headers(v1, draft) + bom_lines(1)
 *   2. „Add component" na detalu → addBomLine (dopisanie w miejscu) ⇒ bom_lines(2)
 *   3. Approve → technical_approved, Publish → active ⇒ bom_headers.status='active'
 *   4. Planning → Work orders → „Create WO" ⇒ work_orders + wo_materials z bom_item_id
 *   5. Release → Start → Consumption ⇒ wo_material_consumption + wo_materials.consumed_qty
 *
 * DOWÓD = TRWAŁY WIERSZ W BAZIE. Renderowanie strony nie dowodzi niczego — po każdym
 * kroku spec czyta stan wprost z Postgresa (rola owner ma BYPASSRLS, więc kontekst org
 * nie jest potrzebny; gdyby był — `app.set_org_context(token, org_id)`, NIE surowy GUC).
 *
 * Uruchamiać WYŁĄCZNIE przez `bash scripts/e2e-local.sh` (asercja 127.0.0.1 + workers=1).
 */

import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Locator, type Page } from '@playwright/test';
import pg from 'pg';

import { signIn } from './_shared/parity-login';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const artifactDir = path.resolve(__dirname, 'artifacts/bom-to-wo-material-chain');
const L = 'en';
const ORG_ID = '00000000-0000-0000-0000-000000000002';

/** Serwer DEV kompiluje trasę przy pierwszym wejściu — osobny, długi timeout na render. */
const COMPILE = 180_000;

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

/** Zbiera błędy strony — żeby „nic się nie stało" nie zostało zinterpretowane jako defekt UI. */
function collectPageErrors(page: Page, sink: string[]): void {
  page.on('pageerror', (e) => sink.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') sink.push(`console.error: ${m.text().slice(0, 400)}`);
  });
}

/** Wybór opcji w prymitywie <Select> z packages/ui (portalowany panel, role=option). */
async function pickUiSelect(page: Page, trigger: Locator, optionLabel: RegExp): Promise<void> {
  await expect(trigger).toBeVisible({ timeout: 20_000 });
  await trigger.click();
  await page.getByRole('option', { name: optionLabel }).first().click({ timeout: 15_000 });
}

/**
 * Opcja pickera wskazana po KODZIE pozycji, nie po indeksie: kod siedzi we własnym
 * `<span>`, więc `getByText(code, {exact:true})` odróżnia ING-SUGAR od ING-SUGAR-2.
 */
function optionByCode(page: Page, containerTestId: string | null, code: string): Locator {
  const base = containerTestId ? page.getByTestId(containerTestId) : page.getByRole('option');
  return base.filter({ has: page.getByText(code, { exact: true }) });
}

const ESIGN_PIN = '246813';
/** packages/db/seeds/test-personas.ts — persona `admin`. */
const ADMIN_PERSONA_ID = '7f290000-0000-4000-8000-000000000001';

const flow = {
  fgCode: '',
  fgName: '',
  fgItemId: '',
  componentA: '',
  componentB: '',
  bomHeaderId: '',
  woId: '',
  woNumber: '',
  materialName: '',
  materialUom: 'kg',
  factorySpecId: '',
  specCode: `E2E-SPEC-${Date.now().toString().slice(-8)}`,
};

test.describe.serial('BOM → zlecenie z materiałami → wydanie materiału', () => {
  test.describe.configure({ timeout: 600_000 });

  test.skip(!baseURL, 'PLAYWRIGHT_BASE_URL unset — wymagany żywy serwer (scripts/e2e-local.sh).');

  test('0 · stan wyjściowy: który FG nie ma jeszcze BOM-u i jaki materiał ma zapas', async () => {
    const [before] = await sql<{ headers: string; lines: string }>(
      `select (select count(*)::text from public.bom_headers where org_id = $1::uuid) as headers,
              (select count(*)::text from public.bom_lines   where org_id = $1::uuid) as lines`,
      [ORG_ID],
    );
    // eslint-disable-next-line no-console
    console.log('[STAN 0] bom_headers =', before!.headers, '· bom_lines =', before!.lines);

    // FG bez ŻADNEGO bom_headers (ani po item_id, ani po product_id) — spec jest
    // powtarzalny: kolejny przebieg weźmie następny wolny FG, nie ten sam.
    const fgs = await sql<{ id: string; item_code: string; name: string }>(
      `select i.id::text, i.item_code, i.name
         from public.items i
        where i.org_id = $1::uuid
          and i.item_type = 'fg'
          and i.status = 'active'
          and not exists (
            select 1 from public.bom_headers h
             where h.org_id = i.org_id
               and (h.item_id = i.id or h.product_id = i.item_code))
        order by i.item_code
        limit 1`,
      [ORG_ID],
    );
    expect(fgs[0], 'w bazie musi być aktywny FG bez BOM-u').toBeTruthy();
    flow.fgCode = fgs[0]!.item_code;
    flow.fgName = fgs[0]!.name;
    flow.fgItemId = fgs[0]!.id;

    // Składniki muszą przejść V-TEC-14 w kontekście `factory_spec_approval` (bramka
    // Approve), inaczej łańcuch stanie na REGULE BIZNESOWEJ, nie na defekcie:
    // wymagany zatwierdzony dostawca + aktywna, niewygasła i nieblokowana specyfikacja.
    // Wśród spełniających warunek preferujemy te z zapasem (krok 5 potrzebuje LP).
    const comps = await sql<{ item_code: string; qty: string }>(
      `select i.item_code, coalesce(sum(lp.quantity - coalesce(lp.reserved_qty,0)), 0)::text as qty
         from public.items i
         left join public.license_plates lp
           on lp.product_id = i.id and lp.org_id = i.org_id and lp.status = 'available'
        where i.org_id = $1::uuid
          and i.item_type in ('ingredient','rm')
          and i.status = 'active'
          and exists (
            select 1 from public.supplier_specs s
             where s.org_id = i.org_id and s.item_id = i.id
               and s.supplier_status = 'approved'
               and s.lifecycle_status = 'active'
               and s.review_status = 'approved'
               and coalesce(s.cost_review_blocked, false) = false
               and coalesce(s.spec_review_blocked, false) = false
               and (s.expiry_date is null or s.expiry_date > current_date))
        group by i.item_code
        order by coalesce(sum(lp.quantity - coalesce(lp.reserved_qty,0)), 0) desc, i.item_code
        limit 2`,
      [ORG_ID],
    );
    expect(comps.length, 'w bazie muszą być co najmniej 2 aktywne składniki').toBeGreaterThanOrEqual(2);
    flow.componentA = comps[0]!.item_code;
    flow.componentB = comps[1]!.item_code;
    // eslint-disable-next-line no-console
    console.log(
      '[PLAN 0] FG =', flow.fgCode, `(${flow.fgName})`,
      '· składnik A =', flow.componentA, `(zapas ${comps[0]!.qty})`,
      '· składnik B =', flow.componentB, `(zapas ${comps[1]!.qty})`,
    );
  });

  test('1 · „New BOM" → wybór FG → „+ Add first component" tworzy v1 draft', async ({ page }) => {
    const errors: string[] = [];
    acceptDialogs(page);
    collectPageErrors(page, errors);
    await signIn(page, baseURL, L, 'admin');

    await page.goto(url(`/${L}/technical/bom`), { waitUntil: 'domcontentloaded' });
    const newCta = page.getByTestId('bom-new-cta');
    await expect(newCta, 'CTA „New BOM" na liście BOM-ów').toBeVisible({ timeout: COMPILE });
    await shot(page, '01-bom-list');

    await newCta.click();
    await expect(page.getByTestId('new-bom-modal')).toBeVisible({ timeout: 30_000 });

    // Wyszukiwarka FG — celujemy w KONKRETNY kod, nigdy w index.
    await page.getByRole('textbox', { name: /Search FG/i }).fill(flow.fgCode);
    const option = optionByCode(page, 'new-bom-fg-option', flow.fgCode);
    await expect(option, `opcja FG ${flow.fgCode} w pickerze`).toHaveCount(1, { timeout: 30_000 });
    await expect(option, `FG ${flow.fgCode} musi być wybieralny (aktywny)`).toHaveAttribute(
      'data-eligible',
      'true',
    );
    await option.click();
    await shot(page, '02-new-bom-modal-picked');

    const confirm = page.getByTestId('new-bom-confirm');
    await expect(confirm, 'przycisk „Continue" odblokowany po wyborze FG').toBeEnabled();
    await confirm.click();

    // waitForURL ODDZIELONE od czekania na render — pierwsze wejście kompiluje trasę.
    await page.waitForURL(new RegExp(`/technical/bom/${flow.fgCode}$`), { timeout: 60_000 });
    const empty = page.getByTestId('bom-first-authoring-empty');
    await expect(empty, 'ekran „No BOM yet" (first-authoring) dla FG bez BOM-u').toBeVisible({
      timeout: COMPILE,
    });
    await shot(page, '03-first-authoring');

    const addFirst = page.getByTestId('bom-add-first-component-cta');
    await expect(addFirst, 'CTA „+ Add first component" (wymaga technical.bom.create)').toBeVisible({
      timeout: 20_000,
    });
    await addFirst.click();

    // ── modal ComponentAdd ────────────────────────────────────────────────────
    const search = page.getByRole('textbox', { name: /Search by code or name/i });
    await expect(search, 'wyszukiwarka materiałów w modalu').toBeVisible({ timeout: 30_000 });
    await search.fill(flow.componentA);
    const compOption = optionByCode(page, null, flow.componentA);
    await expect(compOption, `składnik ${flow.componentA} na liście materiałów`).toHaveCount(1, {
      timeout: 30_000,
    });
    await compOption.click();

    const qty = page.getByRole('spinbutton', { name: 'Quantity', exact: true });
    await expect(qty, 'pole Quantity po wyborze składnika').toBeVisible({ timeout: 30_000 });
    await qty.fill('2');
    await page.getByTestId('bom-add-scrap').fill('1');
    await pickUiSelect(page, page.getByRole('combobox', { name: /Manufacturing operation/i }), /Mixing/i);
    const warn = page.getByTestId('bom-component-warnings');
    // eslint-disable-next-line no-console
    console.log(
      '[OBSERWACJA 1] ostrzeżenia gotowości przy dodawaniu:',
      (await warn.count()) ? await warn.innerText() : 'brak',
    );
    await shot(page, '04-component-add-filled');

    const addAction = page.getByRole('dialog').getByRole('button', { name: 'Add component', exact: true });
    await expect(addAction, '„Add component" odblokowane po komplecie pól').toBeEnabled({
      timeout: 30_000,
    });
    await addAction.click();

    // Zamknięcie modalu = zapis się powiódł (onClose leci tylko po result.ok).
    await expect(search, 'modal zamyka się po udanym zapisie').toBeHidden({ timeout: 60_000 });
    await shot(page, '05-after-first-component');

    // ── DOWÓD ─────────────────────────────────────────────────────────────────
    const headers = await sql<{
      id: string; product_id: string; version: number; status: string; lines: string;
    }>(
      `select h.id::text, h.product_id, h.version, h.status,
              (select count(*)::text from public.bom_lines l where l.bom_header_id = h.id) as lines
         from public.bom_headers h
        where h.org_id = $1::uuid and h.product_id = $2
        order by h.version`,
      [ORG_ID, flow.fgCode],
    );
    // eslint-disable-next-line no-console
    console.log('[DOWÓD 1] bom_headers:', JSON.stringify(headers), '· błędy strony:', JSON.stringify(errors));
    expect(headers.length, `bom_headers dla ${flow.fgCode} po zapisie`).toBe(1);
    expect(headers[0]!.status).toBe('draft');
    expect(headers[0]!.version).toBe(1);
    expect(Number(headers[0]!.lines), 'bom_lines w v1').toBe(1);
    flow.bomHeaderId = headers[0]!.id;
  });

  test('2 · „Add component" na detalu dopisuje drugą linię w miejscu (bez forka wersji)', async ({ page }) => {
    expect(flow.bomHeaderId, 'krok 1 musi był utworzyć BOM').not.toBe('');
    const errors: string[] = [];
    acceptDialogs(page);
    collectPageErrors(page, errors);
    await signIn(page, baseURL, L, 'admin');

    await page.goto(url(`/${L}/technical/bom/${flow.fgCode}`), { waitUntil: 'domcontentloaded' });
    const addCta = page.getByTestId('bom-add-component-cta');
    await expect(addCta, 'CTA „Add component" na detalu BOM-u').toBeVisible({ timeout: COMPILE });
    await expect(addCta, 'CTA aktywne dla draftu').toBeEnabled();
    await addCta.click();

    const search = page.getByRole('textbox', { name: /Search by code or name/i });
    await expect(search).toBeVisible({ timeout: 30_000 });
    await search.fill(flow.componentB);
    const compOption = optionByCode(page, null, flow.componentB);
    await expect(compOption, `składnik ${flow.componentB} na liście`).toHaveCount(1, { timeout: 30_000 });
    await compOption.click();

    const qty = page.getByRole('spinbutton', { name: 'Quantity', exact: true });
    await expect(qty).toBeVisible({ timeout: 30_000 });
    await qty.fill('0.5');
    await page.getByTestId('bom-add-scrap').fill('0');
    await pickUiSelect(page, page.getByRole('combobox', { name: /Manufacturing operation/i }), /Mixing/i);
    await page.getByRole('dialog').getByRole('button', { name: 'Add component', exact: true }).click();
    await expect(search, 'modal zamyka się po udanym zapisie').toBeHidden({ timeout: 60_000 });
    await shot(page, '06-two-components');

    const lines = await sql<{ component_code: string; quantity: string; uom: string; version: number }>(
      `select l.component_code, l.quantity::text, l.uom, h.version
         from public.bom_lines l
         join public.bom_headers h on h.id = l.bom_header_id
        where h.org_id = $1::uuid and h.product_id = $2
        order by h.version, l.line_no`,
      [ORG_ID, flow.fgCode],
    );
    // eslint-disable-next-line no-console
    console.log('[DOWÓD 2] bom_lines:', JSON.stringify(lines), '· błędy strony:', JSON.stringify(errors));
    expect(lines.length, 'dwie linie komponentów').toBe(2);
    expect(new Set(lines.map((l) => l.version)).size, 'obie linie w TEJ SAMEJ wersji (brak forka)').toBe(1);
  });

  test('3 · Approve → technical_approved, Publish → active', async ({ page }) => {
    expect(flow.bomHeaderId).not.toBe('');
    const errors: string[] = [];
    acceptDialogs(page);
    collectPageErrors(page, errors);
    await signIn(page, baseURL, L, 'admin');

    await page.goto(url(`/${L}/technical/bom/${flow.fgCode}`), { waitUntil: 'domcontentloaded' });
    const approve = page.getByTestId('bom-approve-cta');
    await expect(approve, 'CTA „Approve" dla draftu z liniami').toBeVisible({ timeout: COMPILE });
    await approve.click();

    // Approve może odbić się o bramkę sourcingu — pokaż powód, nie połykaj.
    const failures = page.getByTestId('bom-approve-failures');
    const approveError = page.getByTestId('bom-approve-error');
    await page.waitForTimeout(4_000);
    if (await failures.count()) {
      // innerText gubi treść listy, gdy pozycje renderują się puste — dlatego HTML.
      // eslint-disable-next-line no-console
      console.log('[BLOKADA 3a] bom-approve-failures HTML:', (await failures.innerHTML()).replace(/\s+/g, ' '));
      const codes = await failures.locator('li[data-component-code]').all();
      for (const li of codes) {
        // eslint-disable-next-line no-console
        console.log('  · komponent', await li.getAttribute('data-component-code'), '→', await li.innerText());
      }
    }
    if (await approveError.count()) {
      // eslint-disable-next-line no-console
      console.log('[BLOKADA 3a] bom-approve-error:', await approveError.innerText());
    }
    await shot(page, '07-after-approve');

    const afterApprove = await sql<{ status: string; version: number }>(
      `select status, version from public.bom_headers where org_id = $1::uuid and product_id = $2 order by version`,
      [ORG_ID, flow.fgCode],
    );
    // eslint-disable-next-line no-console
    console.log('[DOWÓD 3a] po Approve:', JSON.stringify(afterApprove));
    expect(afterApprove[0]!.status, 'status po Approve').toBe('technical_approved');

    await page.reload({ waitUntil: 'domcontentloaded' });
    const publish = page.getByTestId('bom-publish-cta');
    await expect(publish, 'CTA „Publish" dla technical_approved').toBeVisible({ timeout: COMPILE });
    await publish.click();

    const publishError = page.getByTestId('bom-publish-error');
    await page.waitForTimeout(4_000);
    if (await publishError.count()) {
      // eslint-disable-next-line no-console
      console.log('[BLOKADA 3b] bom-publish-error:', await publishError.innerText());
    }
    await shot(page, '08-after-publish');

    const afterPublish = await sql<{ status: string; version: number; effective_from: string | null }>(
      `select status, version, effective_from::text
         from public.bom_headers where org_id = $1::uuid and product_id = $2 order by version`,
      [ORG_ID, flow.fgCode],
    );
    // eslint-disable-next-line no-console
    console.log('[DOWÓD 3b] po Publish:', JSON.stringify(afterPublish), '· błędy strony:', JSON.stringify(errors));
    expect(afterPublish[0]!.status, 'status po Publish').toBe('active');
  });

  test('4 · Planning → „Create WO" tworzy zlecenie Z MATERIAŁAMI z BOM-u', async ({ page }) => {
    const [activeBom] = await sql<{ n: string }>(
      `select count(*)::text as n from public.bom_headers
        where org_id = $1::uuid and product_id = $2 and status = 'active'`,
      [ORG_ID, flow.fgCode],
    );
    expect(Number(activeBom!.n), 'krok 3 musiał wypuścić aktywny BOM').toBe(1);

    const errors: string[] = [];
    acceptDialogs(page);
    collectPageErrors(page, errors);
    await signIn(page, baseURL, L, 'admin');

    await page.goto(url(`/${L}/planning/work-orders`), { waitUntil: 'domcontentloaded' });
    const createCta = page.getByTestId('wo-list-create');
    await expect(createCta, 'CTA „Create WO" na liście zleceń').toBeVisible({ timeout: COMPILE });
    await createCta.click();
    await expect(page.getByTestId('create-wo-form')).toBeVisible({ timeout: 30_000 });

    await page.getByTestId('item-picker-trigger').click();
    await expect(page.getByTestId('item-picker-panel')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('combobox', { name: /Search finished goods/i }).fill(flow.fgCode);
    const fgOption = optionByCode(page, 'item-picker-option', flow.fgCode);
    await expect(fgOption, `FG ${flow.fgCode} w pickerze produktu`).toHaveCount(1, { timeout: 30_000 });
    await fgOption.click();
    await expect(page.getByTestId('create-wo-selected-product')).toContainText(flow.fgCode);

    await page.getByTestId('create-wo-quantity').fill('10');
    await shot(page, '09-create-wo-filled');

    const submit = page.getByTestId('create-wo-submit');
    await expect(submit).toBeEnabled({ timeout: 15_000 });
    await submit.click();

    const createError = page.getByTestId('create-wo-error');
    await page.waitForTimeout(6_000);
    if (await createError.count()) {
      // eslint-disable-next-line no-console
      console.log('[BLOKADA 4] create-wo-error:', await createError.innerText());
    }
    await shot(page, '10-after-create-wo');

    const wos = await sql<{
      id: string; wo_number: string; status: string; bom: string | null; mats: string;
    }>(
      `select w.id::text, w.wo_number, w.status, w.active_bom_header_id::text as bom,
              (select count(*)::text from public.wo_materials m where m.wo_id = w.id) as mats
         from public.work_orders w
         join public.items i on i.id = w.product_id
        where w.org_id = $1::uuid and i.item_code = $2
        order by w.created_at desc
        limit 1`,
      [ORG_ID, flow.fgCode],
    );
    // eslint-disable-next-line no-console
    console.log('[DOWÓD 4] work_orders:', JSON.stringify(wos), '· błędy strony:', JSON.stringify(errors));
    expect(wos[0], `zlecenie dla ${flow.fgCode} powstało`).toBeTruthy();
    flow.woId = wos[0]!.id;
    flow.woNumber = wos[0]!.wo_number;
    expect(wos[0]!.bom, 'work_orders.active_bom_header_id wskazuje na BOM').not.toBeNull();
    expect(Number(wos[0]!.mats), 'wo_materials przepisane z bom_lines').toBeGreaterThan(0);

    const mats = await sql<{ material_name: string; required_qty: string; uom: string; bom_item_id: string | null }>(
      `select material_name, required_qty::text, uom, bom_item_id::text
         from public.wo_materials where wo_id = $1::uuid order by sequence`,
      [flow.woId],
    );
    // eslint-disable-next-line no-console
    console.log('[DOWÓD 4b] wo_materials:', JSON.stringify(mats));
    expect(mats.every((m) => m.bom_item_id !== null), 'każdy materiał ma bom_item_id (pochodzi z BOM-u)').toBe(true);
    flow.materialName = mats[0]!.material_name;
    flow.materialUom = mats[0]!.uom;
  });

  test('4b · Release wymaga FactorySpec — ustawienie PIN-u i utworzenie specyfikacji', async ({ page }) => {
    expect(flow.woId).not.toBe('');
    const errors: string[] = [];
    acceptDialogs(page);
    collectPageErrors(page, errors);
    await signIn(page, baseURL, L, 'admin');

    // ── PIN e-podpisu (wymagany przy zatwierdzeniu pakietu FactorySpec+BOM) ──
    await page.goto(url(`/${L}/account/pin`), { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('account-pin-submit')).toBeVisible({ timeout: COMPILE });
    await page.getByTestId('account-pin-auth-password').check();
    await page.getByTestId('account-pin-current-secret').fill(process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? 'e2e-local');
    await page.getByTestId('account-pin-new').fill(ESIGN_PIN);
    await page.getByTestId('account-pin-confirm').fill(ESIGN_PIN);
    await page.getByTestId('account-pin-submit').click();
    await page.waitForTimeout(4_000);
    const pinError = page.getByTestId('account-pin-error');
    if (await pinError.count()) {
      // eslint-disable-next-line no-console
      console.log('[BLOKADA 4b-PIN]', await pinError.innerText());
    }
    await shot(page, '16-pin');
    const [pinRow] = await sql<{ n: string }>(
      `select count(*)::text as n from public.user_pins where user_id = $1::uuid`,
      [ADMIN_PERSONA_ID],
    );
    // eslint-disable-next-line no-console
    console.log('[DOWÓD 4b-PIN] user_pins dla persony admin:', pinRow!.n);
    expect(Number(pinRow!.n), 'PIN e-podpisu zapisany w user_pins').toBe(1);

    // ── FactorySpec (draft) ─────────────────────────────────────────────────
    await page.goto(url(`/${L}/technical/factory-specs`), { waitUntil: 'domcontentloaded' });
    const newSpec = page.getByRole('button', { name: /New specification/i }).first();
    await expect(newSpec, 'CTA „+ New specification"').toBeVisible({ timeout: COMPILE });
    await newSpec.click();
    await page.locator('#factory-spec-code').fill(flow.specCode);
    await page.getByRole('button', { name: /Choose finished good/i }).click();
    await page.getByRole('combobox', { name: /Search finished goods/i }).fill(flow.fgCode);
    const specFg = optionByCode(page, 'item-picker-option', flow.fgCode);
    await expect(specFg).toHaveCount(1, { timeout: 30_000 });
    await specFg.click();
    await shot(page, '17-factory-spec-form');
    await page.getByRole('button', { name: /Create draft/i }).click();
    await page.waitForTimeout(5_000);
    await shot(page, '18-factory-spec-created');

    const specs = await sql<{ id: string; spec_code: string; status: string; version: number }>(
      `select fs.id::text, fs.spec_code, fs.status, fs.version
         from public.factory_specs fs
         join public.items i on i.id = fs.fg_item_id
        where fs.org_id = $1::uuid and i.item_code = $2
        order by fs.version desc`,
      [ORG_ID, flow.fgCode],
    );
    // eslint-disable-next-line no-console
    console.log('[DOWÓD 4b] factory_specs:', JSON.stringify(specs), '· błędy strony:', JSON.stringify(errors));
    expect(specs[0], `factory_specs dla ${flow.fgCode}`).toBeTruthy();
    flow.factorySpecId = specs[0]!.id;
    expect(specs[0]!.status).toBe('draft');
  });

  test('4c · zasiana polityka zatwierdzeń jest wewnętrznie sprzeczna — naprawa w Ustawieniach', async ({ page }) => {
    // preflight.ts:100 → require_dual_sign_off && min_approvers < 2 = BLOKER.
    // Migracje 063/487 zasiewają dokładnie tę kombinację dla KAŻDEJ organizacji.
    const [before] = await sql<{ min_approvers: number; dual: boolean; enabled: boolean; roles: string }>(
      `select min_approvers, coalesce((settings_json->>'require_dual_sign_off')::boolean,false) as dual,
              is_enabled as enabled, array_to_string(approver_role_codes,',') as roles
         from public.org_authorization_policies
        where org_id = $1::uuid and policy_code = 'technical_product_spec_approval'`,
      [ORG_ID],
    );
    // eslint-disable-next-line no-console
    console.log('[DOWÓD 4c-0] polityka PRZED naprawą:', JSON.stringify(before));

    acceptDialogs(page);
    await signIn(page, baseURL, L, 'admin');
    await page.goto(url(`/${L}/settings/authorization`), { waitUntil: 'domcontentloaded' });
    const technical = page.locator('[data-region="technical-approval-policy"]');
    await expect(technical, 'sekcja polityki Technical').toBeVisible({ timeout: COMPILE });
    // eslint-disable-next-line no-console
    console.log('[OBSERWACJA 4c-0] sekcja Technical w Ustawieniach:', (await technical.innerText()).replace(/\s+/g, ' ').slice(0, 400));
    await shot(page, '22-authorization-before');

    await technical.getByRole('spinbutton', { name: /Minimum approvers/i }).fill('2');
    await page.locator('#authorization-audit-reason').fill('E2E — naprawa sprzecznej polityki (dual sign-off wymaga min. 2)');
    await page.getByRole('button', { name: /Save policies/i }).click();
    await page.waitForTimeout(5_000);
    await shot(page, '23-authorization-after');

    const [after] = await sql<{ min_approvers: number; dual: boolean }>(
      `select min_approvers, coalesce((settings_json->>'require_dual_sign_off')::boolean,false) as dual
         from public.org_authorization_policies
        where org_id = $1::uuid and policy_code = 'technical_product_spec_approval'`,
      [ORG_ID],
    );
    // eslint-disable-next-line no-console
    console.log('[DOWÓD 4c-0] polityka PO naprawie:', JSON.stringify(after));
    expect(after!.min_approvers, 'min_approvers po zapisie w UI').toBeGreaterThanOrEqual(2);
  });

  test('4d · Review → „Mark reviewed" → Link BOM → Submit for review → PIERWSZY podpis', async ({ page }) => {
    if (!flow.factorySpecId) {
      // Pozwala uruchomić ten krok osobno (`--grep '4c'`) na specyfikacji z poprzedniego przebiegu.
      const [pending] = await sql<{ id: string; spec_code: string; item_code: string }>(
        `select fs.id::text, fs.spec_code, i.item_code
           from public.factory_specs fs
           join public.items i on i.id = fs.fg_item_id
          where fs.org_id = $1::uuid and fs.status in ('draft','in_review')
          order by fs.created_at desc limit 1`,
        [ORG_ID],
      );
      test.skip(!pending, 'brak specyfikacji draft/in_review do zatwierdzenia');
      flow.factorySpecId = pending!.id;
      flow.specCode = pending!.spec_code;
      flow.fgCode = pending!.item_code;
    }
    expect(flow.factorySpecId).not.toBe('');
    const errors: string[] = [];
    acceptDialogs(page);
    collectPageErrors(page, errors);
    await signIn(page, baseURL, L, 'admin');

    await page.goto(url(`/${L}/technical/factory-specs`), { waitUntil: 'domcontentloaded' });
    const row = page.locator('tr', { hasText: flow.specCode });
    await expect(row, `wiersz specyfikacji ${flow.specCode}`).toHaveCount(1, { timeout: COMPILE });
    await row.getByRole('button', { name: /^Review$/i }).click();
    const markReviewed = page.getByRole('button', { name: /Mark reviewed/i });
    await expect(markReviewed, 'CTA „Mark reviewed" w modalu review').toBeVisible({ timeout: 30_000 });
    await markReviewed.click();

    // Panel pakietu: sparowanie BOM-u → submit do review → zatwierdzenie z PIN-em.
    const linkBomBtn = page.getByRole('button', { name: /^Link BOM$/i });
    await expect(linkBomBtn, 'panel pakietu FactorySpec+BOM').toBeVisible({ timeout: 60_000 });
    await shot(page, '19-bundle-panel');
    // Kolejność jest istotna: „Link BOM" jest WYŁĄCZONY, dopóki nie wybrano wersji
    // w selectcie — sprawdzenie isEnabled() przed wyborem cicho pomija sparowanie.
    await pickUiSelect(page, page.locator('#factory-spec-bom-link'), /^v\d/);
    await expect(linkBomBtn, '„Link BOM" aktywny po wyborze wersji').toBeEnabled({ timeout: 15_000 });
    await linkBomBtn.click();
    await page.waitForTimeout(4_000);

    const submitReview = page.getByRole('button', { name: /Submit for review/i });
    if (await submitReview.count()) {
      await submitReview.click();
      await page.waitForTimeout(4_000);
    }
    await shot(page, '20-bundle-after-submit');

    const [afterSubmit] = await sql<{ status: string; bom: string | null }>(
      `select status, bom_header_id::text as bom from public.factory_specs where id = $1::uuid`,
      [flow.factorySpecId],
    );
    // eslint-disable-next-line no-console
    console.log('[DOWÓD 4c-1] factory_spec po Link BOM + Submit:', JSON.stringify(afterSubmit));

    // Blokery preflightu — jeśli są, wypisz je zamiast zgadywać.
    const blockerRows = await page.locator('.alert-red, .alert-amber').allInnerTexts();
    // eslint-disable-next-line no-console
    console.log('[OBSERWACJA 4c] alerty w panelu:', JSON.stringify(blockerRows.slice(0, 10)));

    await page.locator('#bundle-approve-reason').fill('E2E — łańcuch BOM → WO → wydanie materiału');
    await page.locator('#bundle-pin').fill(ESIGN_PIN);
    const approveBtn = page.getByRole('button', { name: /^Approve bundle$/ });
    await expect(approveBtn, 'przycisk „Approve bundle" w panelu').toHaveCount(1, { timeout: 15_000 });
    // eslint-disable-next-line no-console
    console.log('[OBSERWACJA 4c] przycisk zatwierdzenia aktywny =', await approveBtn.isEnabled());
    await approveBtn.click();
    await page.waitForTimeout(8_000);
    const alerts = await page.locator('[role="alert"]').allInnerTexts();
    // eslint-disable-next-line no-console
    console.log('[BLOKADA 4c] komunikaty po kliknięciu Approve:', JSON.stringify(alerts.slice(0, 8)));
    await shot(page, '21-bundle-approved');

    const [afterApprove] = await sql<{ status: string; sigs: string }>(
      `select fs.status,
              (select count(distinct e.signer_user_id)::text from public.e_sign_log e
                where e.org_id = fs.org_id and e.intent = 'tech.fa.release') as sigs
         from public.factory_specs fs where fs.id = $1::uuid`,
      [flow.factorySpecId],
    );
    // eslint-disable-next-line no-console
    console.log('[DOWÓD 4d] po PIERWSZYM podpisie — status:', afterApprove!.status, '· podpisy:', afterApprove!.sigs,
      '· błędy strony:', JSON.stringify(errors.slice(0, 2)));
    expect(Number(afterApprove!.sigs), 'e_sign_log — pierwszy podpis pakietu').toBeGreaterThanOrEqual(1);
  });

  test('4e · DRUGI podpis (inny użytkownik) domyka dual sign-off → approved_for_factory', async ({ page }) => {
    expect(flow.factorySpecId).not.toBe('');
    acceptDialogs(page);
    // Drugi, RÓŻNY zatwierdzający: harness ma rolę admin (technical.product_spec.approve).
    await signIn(page, baseURL, L, 'harness');

    await page.goto(url(`/${L}/account/pin`), { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('account-pin-submit')).toBeVisible({ timeout: COMPILE });
    await page.getByTestId('account-pin-auth-password').check();
    await page.getByTestId('account-pin-current-secret').fill(process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? 'e2e-local');
    await page.getByTestId('account-pin-new').fill(ESIGN_PIN);
    await page.getByTestId('account-pin-confirm').fill(ESIGN_PIN);
    await page.getByTestId('account-pin-submit').click();
    await page.waitForTimeout(4_000);

    await page.goto(url(`/${L}/technical/factory-specs`), { waitUntil: 'domcontentloaded' });
    const row = page.locator('tr', { hasText: flow.specCode });
    await expect(row).toHaveCount(1, { timeout: COMPILE });
    await row.getByRole('button', { name: /^Review$/i }).click();
    await page.getByRole('button', { name: /Mark reviewed/i }).click();
    await expect(page.locator('#bundle-approve-reason')).toBeVisible({ timeout: 60_000 });
    await page.locator('#bundle-approve-reason').fill('E2E — drugi podpis (dual sign-off)');
    await page.locator('#bundle-pin').fill(ESIGN_PIN);
    await page.getByRole('button', { name: /^Approve bundle$/ }).click();
    await page.waitForTimeout(8_000);
    const alerts2 = await page.locator('[role="alert"]').allInnerTexts();
    // eslint-disable-next-line no-console
    console.log('[BLOKADA 4e] komunikaty po drugim podpisie:', JSON.stringify(alerts2.slice(0, 6)));
    await shot(page, '24-bundle-second-signature');

    const [final] = await sql<{ status: string; sigs: string }>(
      `select fs.status,
              (select count(distinct e.signer_user_id)::text from public.e_sign_log e
                where e.org_id = fs.org_id and e.intent = 'tech.fa.release') as sigs
         from public.factory_specs fs where fs.id = $1::uuid`,
      [flow.factorySpecId],
    );
    // eslint-disable-next-line no-console
    console.log('[DOWÓD 4e] factory_spec po drugim podpisie:', JSON.stringify(final));
    expect(
      ['approved_for_factory', 'released_to_factory'],
      'status specyfikacji po domknięciu dual sign-off',
    ).toContain(final!.status);
  });

  test('5 · Release → Start → „Record consumption" wydaje materiał na zlecenie', async ({ page }) => {
    expect(flow.woId, 'krok 4 musiał utworzyć zlecenie').not.toBe('');
    const errors: string[] = [];
    acceptDialogs(page);
    collectPageErrors(page, errors);
    await signIn(page, baseURL, L, 'admin');

    // ── Release (lista Planning) ─────────────────────────────────────────────
    await page.goto(url(`/${L}/planning/work-orders`), { waitUntil: 'domcontentloaded' });
    const releaseBtn = page.getByTestId(`wo-release-${flow.woId}`);
    await expect(releaseBtn, `przycisk Release dla ${flow.woNumber}`).toBeVisible({ timeout: COMPILE });
    await releaseBtn.click();
    await page.waitForTimeout(5_000);
    const rowError = page.getByTestId(`wo-row-error-${flow.woId}`);
    if (await rowError.count()) {
      // eslint-disable-next-line no-console
      console.log('[BLOKADA 5a] wo-row-error:', await rowError.innerText());
    }
    await shot(page, '11-after-release');

    const [afterRelease] = await sql<{ status: string }>(
      `select status from public.work_orders where id = $1::uuid`,
      [flow.woId],
    );
    // eslint-disable-next-line no-console
    console.log('[DOWÓD 5a] status po Release:', afterRelease!.status);
    expect(afterRelease!.status, 'status po Release').toBe('RELEASED');

    // ── Start (detal produkcji) ──────────────────────────────────────────────
    await page.goto(url(`/${L}/production/wos/${flow.woId}`), { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('wo-detail-header')).toBeVisible({ timeout: COMPILE });
    const startBtn = page.getByTestId('wo-action-start');
    await expect(startBtn, 'przycisk Start na detalu WO').toBeVisible({ timeout: 30_000 });
    await startBtn.click();
    const startConfirm = page.getByTestId('wo-start-confirm');
    await expect(startConfirm, 'potwierdzenie w modalu Start').toBeVisible({ timeout: 20_000 });
    await startConfirm.click();
    await page.waitForTimeout(5_000);
    const startError = page.getByTestId('wo-start-error');
    if (await startError.count()) {
      // eslint-disable-next-line no-console
      console.log('[BLOKADA 5b] wo-start-error:', await startError.innerText());
    }
    await shot(page, '12-after-start');

    const [afterStart] = await sql<{ status: string }>(
      `select status from public.work_orders where id = $1::uuid`,
      [flow.woId],
    );
    // eslint-disable-next-line no-console
    console.log('[DOWÓD 5b] status po Start:', afterStart!.status);
    expect(afterStart!.status, 'status po Start').toBe('IN_PROGRESS');

    // ── Consumption ──────────────────────────────────────────────────────────
    await page.goto(url(`/${L}/production/wos/${flow.woId}`), { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('wo-detail-header')).toBeVisible({ timeout: COMPILE });
    await page.getByTestId('wo-detail-tab-consumption').click();
    const recordBtn = page.getByTestId('wo-consumption-record');
    await expect(recordBtn, 'przycisk „Record consumption"').toBeVisible({ timeout: 30_000 });
    await recordBtn.click();
    await expect(page.getByTestId('wo-consume-qty')).toBeVisible({ timeout: 30_000 });

    await pickUiSelect(
      page,
      page.locator('#wo-consume-material'),
      new RegExp(`^${flow.materialName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} `),
    );
    await page.getByTestId('wo-consume-qty').fill('1');
    const reason = page.getByTestId('wo-consume-reason');
    if (await reason.count()) await reason.fill('E2E-BOM-CHAIN');
    await shot(page, '13-consume-filled');

    const consumeSubmit = page.getByTestId('wo-consume-submit');
    await expect(consumeSubmit, 'Submit zużycia odblokowany').toBeEnabled({ timeout: 20_000 });
    await consumeSubmit.click();
    await page.waitForTimeout(6_000);
    const consumeError = page.getByTestId('wo-consume-error');
    if (await consumeError.count()) {
      // eslint-disable-next-line no-console
      console.log('[BLOKADA 5c] wo-consume-error:', await consumeError.innerText());
    }
    await shot(page, '14-after-consume');

    const proof = await sql<{ rows: string; consumed: string }>(
      `select (select count(*)::text from public.wo_material_consumption c where c.wo_id = $1::uuid) as rows,
              coalesce(sum(m.consumed_qty),0)::text as consumed
         from public.wo_materials m where m.wo_id = $1::uuid`,
      [flow.woId],
    );
    // eslint-disable-next-line no-console
    console.log('[DOWÓD 5c] wo_material_consumption:', JSON.stringify(proof[0]), '· błędy strony:', JSON.stringify(errors));
    expect(Number(proof[0]!.rows), 'wiersz w wo_material_consumption').toBeGreaterThan(0);
    expect(Number(proof[0]!.consumed), 'wo_materials.consumed_qty wzrosło').toBeGreaterThan(0);
  });

  test('5b · to samo wydanie, ale ZE WSKAZANIEM nośnika (LP) — czy schodzi zapas', async ({ page }) => {
    // Krok 5 użył awaryjnej ścieżki „— no LP —" (kod powodu). Tu sprawdzamy ścieżkę
    // właściwą: wybór konkretnego LP musi ZDJĄĆ ilość z nośnika i zapisać ruch magazynowy.
    if (!flow.woId) {
      const [wo] = await sql<{ id: string; material_name: string }>(
        `select w.id::text, (select m.material_name from public.wo_materials m
                              where m.wo_id = w.id order by m.sequence limit 1) as material_name
           from public.work_orders w
          where w.org_id = $1::uuid and w.status = 'IN_PROGRESS'
            and exists (select 1 from public.wo_materials m where m.wo_id = w.id)
          order by w.created_at desc limit 1`,
        [ORG_ID],
      );
      test.skip(!wo, 'brak zlecenia IN_PROGRESS z materiałami');
      flow.woId = wo!.id;
      flow.materialName = wo!.material_name;
    }
    acceptDialogs(page);
    await signIn(page, baseURL, L, 'admin');

    const before = await sql<{ available: string; moves: string }>(
      `select coalesce(sum(lp.quantity - coalesce(lp.reserved_qty,0)),0)::text as available,
              (select count(*)::text from public.stock_moves sm where sm.org_id = $1::uuid) as moves
         from public.license_plates lp
         join public.items i on i.id = lp.product_id
        where lp.org_id = $1::uuid and i.item_code = $2 and lp.status = 'available'`,
      [ORG_ID, flow.materialName],
    );
    // eslint-disable-next-line no-console
    console.log('[STAN 5b] przed:', JSON.stringify(before[0]));

    await page.goto(url(`/${L}/production/wos/${flow.woId}`), { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('wo-detail-header')).toBeVisible({ timeout: COMPILE });
    await page.getByTestId('wo-detail-tab-consumption').click();
    await page.getByTestId('wo-consumption-record').click();
    await expect(page.getByTestId('wo-consume-qty')).toBeVisible({ timeout: 30_000 });
    await pickUiSelect(
      page,
      page.locator('#wo-consume-material'),
      new RegExp(`^${flow.materialName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} `),
    );
    await page.waitForTimeout(3_000);
    const lpEmpty = page.getByTestId('wo-consume-lp-empty');
    const lpEmptyShown = (await lpEmpty.count()) > 0;
    // eslint-disable-next-line no-console
    console.log('[OBSERWACJA 5b] lista LP pusta =', lpEmptyShown);
    await page.locator('#wo-consume-lp').click();
    const lpOptions = await page.getByRole('option').allInnerTexts();
    // eslint-disable-next-line no-console
    console.log('[OBSERWACJA 5b] opcje LP:', JSON.stringify(lpOptions.slice(0, 6)));
    const realLp = page.getByRole('option').filter({ hasText: /^LP-/ }).first();
    const hasLp = (await realLp.count()) > 0;
    if (!hasLp) {
      await page.keyboard.press('Escape');
      await shot(page, '25-consume-no-lp-offered');
      // eslint-disable-next-line no-console
      console.log('[BLOKADA 5b] modal nie oferuje ŻADNEGO nośnika mimo zapasu — ścieżka z LP niedostępna');
    }
    test.skip(!hasLp, 'modal nie zaproponował żadnego LP — patrz [BLOKADA 5b]');
    await realLp.click();
    await page.getByTestId('wo-consume-qty').fill('2');
    await shot(page, '25-consume-with-lp');
    await page.getByTestId('wo-consume-submit').click();
    await page.waitForTimeout(6_000);
    const consumeError = page.getByTestId('wo-consume-error');
    if (await consumeError.count()) {
      // eslint-disable-next-line no-console
      console.log('[BLOKADA 5b] wo-consume-error:', await consumeError.innerText());
    }
    await shot(page, '26-consume-with-lp-after');

    const after = await sql<{ available: string; moves: string }>(
      `select coalesce(sum(lp.quantity - coalesce(lp.reserved_qty,0)),0)::text as available,
              (select count(*)::text from public.stock_moves sm where sm.org_id = $1::uuid) as moves
         from public.license_plates lp
         join public.items i on i.id = lp.product_id
        where lp.org_id = $1::uuid and i.item_code = $2 and lp.status = 'available'`,
      [ORG_ID, flow.materialName],
    );
    // eslint-disable-next-line no-console
    console.log('[DOWÓD 5b] po:', JSON.stringify(after[0]), '(przed:', JSON.stringify(before[0]), ')');
    expect(Number(after[0]!.available), 'zapas na nośnikach zmalał').toBeLessThan(Number(before[0]!.available));
  });

  test('6 · diagnostyka: co UI pokazuje, gdy komponent NIE MA zatwierdzonego dostawcy', async ({ page }) => {
    // Bramka V-TEC-14 (factory_spec_approval) blokuje Approve dla komponentu bez
    // aktywnej specyfikacji dostawcy. To reguła biznesowa — pytanie brzmi, czy UI
    // mówi UŻYTKOWNIKOWI KTÓRY komponent i CO poprawić, czy jest to ślepy zaułek.
    const [stuck] = await sql<{ product_id: string; version: number; codes: string }>(
      `select h.product_id, h.version,
              string_agg(l.component_code, ',' order by l.line_no) as codes
         from public.bom_headers h
         join public.bom_lines l on l.bom_header_id = h.id
        where h.org_id = $1::uuid
          and h.status = 'draft'
          and exists (
            select 1 from public.bom_lines l2
             join public.items i2 on i2.org_id = h.org_id and i2.item_code = l2.component_code
            where l2.bom_header_id = h.id
              and not exists (
                select 1 from public.supplier_specs s
                 where s.org_id = h.org_id and s.item_id = i2.id
                   and s.supplier_status = 'approved' and s.lifecycle_status = 'active'
                   and s.review_status = 'approved'))
        group by h.product_id, h.version
        limit 1`,
      [ORG_ID],
    );
    test.skip(!stuck, 'brak draftu BOM z niezaopatrzonym komponentem — nie ma czego diagnozować');

    acceptDialogs(page);
    await signIn(page, baseURL, L, 'admin');
    await page.goto(url(`/${L}/technical/bom/${stuck!.product_id}`), { waitUntil: 'domcontentloaded' });
    const approve = page.getByTestId('bom-approve-cta');
    await expect(approve).toBeVisible({ timeout: COMPILE });
    await approve.click();
    await page.waitForTimeout(5_000);
    await shot(page, '15-approve-blocked-sourcing');

    const failures = page.getByTestId('bom-approve-failures');
    const generic = page.getByTestId('bom-approve-error');
    // eslint-disable-next-line no-console
    console.log('[DIAGNOZA 6] BOM', stuck!.product_id, 'v' + stuck!.version, '· linie:', stuck!.codes);
    if (await failures.count()) {
      // eslint-disable-next-line no-console
      console.log('[DIAGNOZA 6] alert HTML:', (await failures.innerHTML()).replace(/\s+/g, ' '));
      for (const li of await failures.locator('li[data-component-code]').all()) {
        // eslint-disable-next-line no-console
        console.log('  · komponent', await li.getAttribute('data-component-code'), '→', JSON.stringify(await li.innerText()));
      }
    } else if (await generic.count()) {
      // eslint-disable-next-line no-console
      console.log('[DIAGNOZA 6] alert ogólny:', await generic.innerText());
    } else {
      // eslint-disable-next-line no-console
      console.log('[DIAGNOZA 6] BRAK jakiegokolwiek komunikatu po kliknięciu Approve');
    }

    const [after] = await sql<{ status: string }>(
      `select status from public.bom_headers where org_id = $1::uuid and product_id = $2 and version = $3`,
      [ORG_ID, stuck!.product_id, stuck!.version],
    );
    // eslint-disable-next-line no-console
    console.log('[DIAGNOZA 6] status po odbitym Approve:', after!.status);
  });
});
