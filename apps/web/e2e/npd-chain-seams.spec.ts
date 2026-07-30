/**
 * SPOINY ŁAŃCUCHA — NPD → technika → planowanie → produkcja → finanse.
 *
 * Trzy tory przeszły dziś ODCINKI (BOM→zlecenie, produkcja→finanse, zakup→przyjęcie).
 * Ten spec mierzy wyłącznie SPOINY — miejsca, w których jeden odcinek ma się skończyć,
 * a następny zacząć:
 *
 *   S1  NPD brief → recipe            (advanceProjectGate / evaluateStageGate)
 *   S2  NPD gate  → handoff/release   (runReleasePreflight wymaga G4)
 *   S3  NPD       → technika (BOM)    (generateProductionBom / materializeNpdBom)
 *   S4  technika  → planowanie (WO)   (createWorkOrder z BOM-u NPD)
 *   S5  planowanie→ produkcja         (releaseWorkOrder + factory_spec z NPD)
 *   S6  produkcja → finanse           (koszt z NPD na zużyciu/outputcie)
 *
 * DOWÓD = TRWAŁY WIERSZ W POSTGRESIE. Render strony nie dowodzi niczego.
 * Odczyt zwrotny rolą owner (BYPASSRLS); gdyby był potrzebny kontekst org —
 * WYŁĄCZNIE `app.set_org_context(token, org_id)`, nigdy surowy GUC.
 *
 * Uruchamiać WYŁĄCZNIE przez `bash scripts/e2e-local.sh` (asercja 127.0.0.1, workers=1).
 */

import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';

import { signIn } from './_shared/parity-login';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const artifactDir = path.resolve(__dirname, 'artifacts/npd-chain-seams');
const L = 'en';

/** Serwer DEV kompiluje trasę przy pierwszym wejściu — osobny, długi budżet na render. */
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

function collectPageErrors(page: Page, sink: string[]): void {
  page.on('pageerror', (e) => sink.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') sink.push(`console.error: ${m.text().slice(0, 300)}`);
  });
}

/**
 * `waitForURL` NIE jest dowodem renderu — serwer DEV kompiluje trasę przy pierwszym
 * wejściu i potrafi przekroczyć timeout, co wygląda jak „martwy link". Rozdzielone.
 */
async function gotoAndRender(page: Page, route: string, testid: string): Promise<void> {
  await page.goto(url(route), { waitUntil: 'domcontentloaded', timeout: COMPILE });
  await expect(page.getByTestId(testid), `${route} → renderuje ${testid}`).toBeVisible({
    timeout: COMPILE,
  });
}

const flow = {
  projectId: '',
  projectCode: '',
  productCode: '',
  bomHeaderId: '',
  woNumber: '',
};

test.describe.serial('SPOINY łańcucha NPD → finanse', () => {
  test.describe.configure({ timeout: 300_000 });
  test.skip(!baseURL, 'PLAYWRIGHT_BASE_URL unset — uruchamiać przez scripts/e2e-local.sh.');

  // ── S1 · spoina NPD brief → recipe ────────────────────────────────────────
  test('S1 · brief → recipe: bramka etapu przy komplecie ptaszków', async ({ page }) => {
    const errors: string[] = [];
    collectPageErrors(page, errors);
    acceptDialogs(page);
    await signIn(page, baseURL, L, 'harness');

    // Projekt z recepturą i opakowaniem — najdalej zaawansowany, jaki jest w bazie.
    const [project] = await sql<{ id: string; code: string; product_code: string; stage: string; gate: string }>(
      `select p.id::text as id, p.code, p.product_code,
              p.current_stage as stage, p.current_gate as gate
         from public.npd_projects p
        where p.code = 'NPD-019'
        limit 1`,
    );
    expect(project, 'projekt NPD-019 istnieje w bazie').toBeTruthy();
    flow.projectId = project.id;
    flow.projectCode = project.code;
    flow.productCode = project.product_code;
    console.log(`[STAN S1] przed: ${JSON.stringify(project)}`);
    expect(project.stage, 'punkt startowy = brief').toBe('brief');

    // ── 1a. odhaczam W INTERFEJSIE wszystkie wymagane pozycje listy bramki G0 ──
    await gotoAndRender(page, `/${L}/pipeline/${flow.projectId}/gate`, 'gate-screen');
    await shot(page, '01-gate-screen');

    // Sekcja bieżącej bramki bywa zwinięta — rozwijam KAŻDĄ, żeby nie wybierać po indeksie.
    const triggers = page.getByTestId('gate-collapsible-trigger');
    const triggerCount = await triggers.count();
    for (let i = 0; i < triggerCount; i += 1) {
      const region = page.getByTestId('gate-collapsible').nth(i).getByTestId('gate-collapsible-region');
      if ((await region.count()) === 0) {
        await triggers.nth(i).click({ timeout: 10_000 });
      }
    }
    await shot(page, '02-gate-expanded');

    const checkboxes = page.getByTestId('gate-checklist-checkbox');
    const total = await checkboxes.count();
    console.log(`[S1] widocznych checkboxów listy bramki: ${total}`);
    let ticked = 0;
    for (let i = 0; i < total; i += 1) {
      const box = checkboxes.nth(i);
      if (await box.isDisabled()) continue;
      if (await box.isChecked()) continue;
      await box.check({ timeout: 15_000 });
      ticked += 1;
      // Server Action + router.refresh() — czekam na utrwalenie, nie na animację.
      await page.waitForTimeout(400);
    }
    console.log(`[S1] odhaczonych: ${ticked}`);
    await shot(page, '03-gate-ticked');

    const g0 = await sql<{ total: string; done: string }>(
      `select count(*) filter (where required)::text as total,
              count(*) filter (where required and completed_at is not null)::text as done
         from public.gate_checklist_items
        where project_id = $1::uuid and gate_code = 'G0'`,
      [flow.projectId],
    );
    console.log(`[DOWÓD S1] gate_checklist_items G0 (wymagane): ${JSON.stringify(g0[0])}`);

    // ── 1b. próba przejścia etapu ─────────────────────────────────────────────
    const advanceBtn = page.getByTestId('project-header-advance');
    await expect(advanceBtn, 'przycisk „Advance" jest na ekranie').toBeVisible({ timeout: 30_000 });
    await advanceBtn.click({ timeout: 20_000 });

    const dialog = page.getByRole('dialog');
    await expect(dialog, 'modal przejścia etapu się otwiera').toBeVisible({ timeout: 30_000 });
    // Modal dociąga gotowość z serwera (readinessLoading) — czekam na rozstrzygnięcie.
    await expect(page.getByTestId('advance-gate-loading')).toHaveCount(0, { timeout: 60_000 });
    await shot(page, '04-advance-modal');

    const hardBlockers = page.getByTestId('advance-gate-required-warning-item');
    const softBlockers = page.getByTestId('advance-gate-soft-block-item');
    const hardTexts = await hardBlockers.allInnerTexts();
    const softTexts = await softBlockers.allInnerTexts();
    console.log(`[DOWÓD S1] blokery twarde (${hardTexts.length}): ${JSON.stringify(hardTexts)}`);
    console.log(`[DOWÓD S1] blokery miękkie (${softTexts.length}): ${JSON.stringify(softTexts)}`);

    const confirm = dialog.getByRole('button', { name: /advance|przejd/i }).last();
    const confirmEnabled = await confirm.isEnabled();
    console.log(`[DOWÓD S1] przycisk potwierdzenia aktywny: ${confirmEnabled}`);

    if (confirmEnabled) {
      await confirm.click({ timeout: 20_000 });
      await page.waitForTimeout(3_000);
      const err = page.getByTestId('advance-gate-error');
      if (await err.count()) console.log(`[DOWÓD S1] błąd serwera: ${await err.innerText()}`);
    }
    await shot(page, '05-advance-result');

    const [after] = await sql<{ stage: string; gate: string }>(
      `select current_stage as stage, current_gate as gate
         from public.npd_projects where id = $1::uuid`,
      [flow.projectId],
    );
    console.log(`[DOWÓD S1] etap po próbie: ${JSON.stringify(after)}`);
    console.log(`[S1] błędy strony: ${JSON.stringify(errors.slice(0, 6))}`);

    // Ten krok jest POMIAREM, nie asercją sukcesu: zapisuję fakt, a werdykt
    // rozstrzyga S1b (kontrola przeciwna odróżniająca „niewypełniony formularz"
    // od „pola, którego nie da się wypełnić").
    expect(after, 'projekt nadal istnieje po próbie przejścia').toBeTruthy();
  });

  // ── S1b · kontrola przeciwna: które pola etapu da się w ogóle wypełnić ─────
  test('S1b · kontrola przeciwna — pola wymagane etapu brief kontra źródło odczytu', async () => {
    // Dosłowne zapytanie z evaluate-stage-gate.ts:104-133 (requiredFieldsMissing).
    // `resolveGateFieldValues` (tamże :42-56) zwraca WYŁĄCZNIE `product_json`,
    // gdy projekt ma product_code — wartości z `npd_projects` są wtedy ignorowane.
    const rows = await sql<{
      field_code: string;
      klucz_w_product: boolean;
      wartosc_product: string | null;
      wartosc_projektu: string | null;
    }>(
      `select distinct
              f.code as field_code,
              (case when p.product_code is not null then to_jsonb(p.*) end) ? lower(f.code) as klucz_w_product,
              (case when p.product_code is not null then to_jsonb(p.*) end) ->> lower(f.code) as wartosc_product,
              to_jsonb(np.*) ->> lower(f.code) as wartosc_projektu
         from public.npd_departments d
         join public.npd_department_field df on df.department_id = d.id and df.org_id = d.org_id
         join public.npd_field_catalog f     on f.id = df.field_id and f.org_id = df.org_id
         join public.npd_projects np         on np.id = $1::uuid
         left join public.product p          on p.org_id = np.org_id and p.product_code = np.product_code
        where d.org_id = np.org_id and d.active and d.stage_code = 'brief'
          and df.visible and df.required and f.active
        order by 1`,
      [flow.projectId],
    );
    for (const r of rows) console.log(`[DOWÓD S1b] ${JSON.stringify(r)}`);

    const unreachable = rows.filter((r) => !r.klucz_w_product);
    console.log(
      `[DOWÓD S1b] pola NIEOSIĄGALNE z odczytywanego źródła: ${JSON.stringify(
        unreachable.map((r) => r.field_code),
      )}`,
    );
    expect(rows.length, 'etap brief ma wymagane pola').toBeGreaterThan(0);
  });

  // ── S1c · KONTROLA PRZECIWNA: wypełniam brakujące pola W INTERFEJSIE ───────
  // Odróżnia „użytkownik nie wypełnił formularza" od „pola nie da się wypełnić".
  test('S1c · ekran Brief zapisuje wolumen i przebiegi — a bramka nadal ich nie widzi', async ({
    page,
  }) => {
    const errors: string[] = [];
    collectPageErrors(page, errors);
    acceptDialogs(page);
    await signIn(page, baseURL, L, 'harness');

    await gotoAndRender(page, `/${L}/pipeline/${flow.projectId}/brief`, 'brief-inline-form');
    await shot(page, '09-brief-form');

    // Wartości ROZPOZNAWALNIE inne od zastanych (1200 / 3), żeby zapis był widoczny.
    const weekly = page.getByTestId('brief-field-weeklyVolumePacks');
    const runs = page.getByTestId('brief-field-runsPerWeek');
    await expect(weekly, 'pole „Weekly volume" jest na ekranie Brief').toBeVisible({ timeout: 30_000 });
    await weekly.fill('1777');
    await runs.fill('7');
    await page.getByTestId('brief-save').click({ timeout: 20_000 });
    await page.waitForTimeout(4_000);
    await shot(page, '10-brief-saved');

    // DOWÓD 1: akcja z przeglądarki utrwaliła się — ale w npd_projects.
    const [proj] = await sql<{ weekly: string | null; runs: string | null }>(
      `select weekly_volume_packs::text as weekly, runs_per_week::text as runs
         from public.npd_projects where id = $1::uuid`,
      [flow.projectId],
    );
    console.log(`[DOWÓD S1c] npd_projects po zapisie z UI: ${JSON.stringify(proj)}`);

    // DOWÓD 2: źródło, z którego czyta bramka etapu, jest nietknięte.
    const [prod] = await sql<{ runs: string | null; ma_kolumne_weekly: boolean }>(
      `select p.runs_per_week::text as runs,
              to_jsonb(p.*) ? 'weekly_volume_packs' as ma_kolumne_weekly
         from public.product p
         join public.npd_projects np on np.product_code = p.product_code and np.org_id = p.org_id
        where np.id = $1::uuid`,
      [flow.projectId],
    );
    console.log(`[DOWÓD S1c] public.product (źródło bramki) po zapisie: ${JSON.stringify(prod)}`);

    // DOWÓD 3: modal przejścia nadal wymienia oba pola jako brakujące.
    await gotoAndRender(page, `/${L}/pipeline/${flow.projectId}/gate`, 'gate-screen');
    await page.getByTestId('project-header-advance').click({ timeout: 30_000 });
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('advance-gate-loading')).toHaveCount(0, { timeout: 60_000 });
    const blockers = await page.getByTestId('advance-gate-required-warning-item').allInnerTexts();
    console.log(`[DOWÓD S1c] blokery PO zapisaniu obu pól z UI: ${JSON.stringify(blockers)}`);
    const confirmStillDisabled = !(await page
      .getByRole('dialog')
      .getByRole('button', { name: /advance|przejd/i })
      .last()
      .isEnabled());
    console.log(`[DOWÓD S1c] potwierdzenie nadal zablokowane: ${confirmStillDisabled}`);
    await shot(page, '11-advance-after-brief-save');
    console.log(`[S1c] błędy strony: ${JSON.stringify(errors.slice(0, 4))}`);

    expect(proj, 'wiersz projektu istnieje').toBeTruthy();
  });

  // ── S3 · spoina NPD → technika: czy z receptury powstaje BOM ───────────────
  test('S3 · handoff → „Generate production BOM" (most receptura → bom_headers)', async ({ page }) => {
    const errors: string[] = [];
    collectPageErrors(page, errors);
    acceptDialogs(page);
    await signIn(page, baseURL, L, 'harness');

    const before = await sql<{ n: string }>(
      `select count(*)::text as n from public.bom_headers where npd_project_id = $1::uuid`,
      [flow.projectId],
    );
    console.log(`[STAN S3] bom_headers dla projektu przed: ${before[0]?.n}`);

    await gotoAndRender(page, `/${L}/pipeline/${flow.projectId}/handoff`, 'handoff-screen');
    await shot(page, '06-handoff');

    // Stan bramek zwolnienia — ekran sam raportuje, czego brakuje.
    const gates = page.getByTestId('handoff-release-gate');
    const gateTexts = await gates.allInnerTexts();
    console.log(`[DOWÓD S3] bramki zwolnienia (${gateTexts.length}):`);
    for (const g of gateTexts) console.log(`   · ${g.replace(/\s+/g, ' ').trim()}`);

    const genBtn = page.getByTestId('handoff-generate-btn');
    const genCount = await genBtn.count();
    console.log(`[DOWÓD S3] przycisk „Generate production BOM" obecny: ${genCount > 0}`);
    if (genCount > 0) {
      console.log(`[DOWÓD S3] przycisk aktywny: ${await genBtn.isEnabled()}`);
      const hint = page.getByTestId('handoff-generate-hint');
      if (await hint.count()) console.log(`[DOWÓD S3] podpowiedź: ${await hint.innerText()}`);
      if (await genBtn.isEnabled()) {
        await genBtn.click({ timeout: 20_000 });
        await page.waitForTimeout(6_000);
        const err = page.getByTestId('handoff-generate-error');
        if (await err.count()) console.log(`[DOWÓD S3] błąd generowania: ${await err.innerText()}`);
        const warn = page.getByTestId('handoff-generate-warnings');
        if (await warn.count()) console.log(`[DOWÓD S3] ostrzeżenia: ${await warn.innerText()}`);
      }
    }
    await shot(page, '07-handoff-after-generate');

    const boms = await sql<{
      id: string;
      product_id: string;
      version: string;
      status: string;
      origin: string;
      lines: string;
    }>(
      `select h.id::text as id, h.product_id, h.version::text as version, h.status,
              h.origin_module as origin,
              (select count(*)::text from public.bom_lines l where l.bom_header_id = h.id) as lines
         from public.bom_headers h
        where h.npd_project_id = $1::uuid
        order by h.created_at desc`,
      [flow.projectId],
    );
    console.log(`[DOWÓD S3] bom_headers po akcji: ${JSON.stringify(boms)}`);
    flow.bomHeaderId = boms[0]?.id ?? '';

    const specs = await sql<{ id: string; code: string; status: string }>(
      `select fs.id::text as id, fs.spec_code as code, fs.status
         from public.factory_specs fs
         join public.items i on i.id = fs.fg_item_id
        where i.item_code = $1`,
      [flow.productCode],
    );
    console.log(`[DOWÓD S3] factory_specs dla ${flow.productCode}: ${JSON.stringify(specs)}`);

    const rel = await sql<{ status: string }>(
      `select release_status as status from public.factory_release_status where project_id = $1::uuid`,
      [flow.projectId],
    );
    console.log(`[DOWÓD S3] factory_release_status: ${JSON.stringify(rel)}`);
    console.log(`[S3] błędy strony: ${JSON.stringify(errors.slice(0, 6))}`);
  });

  // ── S4/S5/S6 · dalsze spoiny — mierzone tylko, jeśli BOM z NPD powstał ─────
  test('S4 · BOM z NPD → zlecenie produkcyjne z materiałami', async ({ page }) => {
    test.skip(!flow.bomHeaderId, 'brak BOM-u z NPD — spoina S3 się nie domknęła (patrz raport).');
    const errors: string[] = [];
    collectPageErrors(page, errors);
    acceptDialogs(page);
    await signIn(page, baseURL, L, 'harness');

    await gotoAndRender(page, `/${L}/planning/work-orders`, 'planning-work-orders');
    await shot(page, '08-planning-wos');

    const before = await sql<{ n: string }>(`select count(*)::text as n from public.work_orders`);
    console.log(`[STAN S4] work_orders przed: ${before[0]?.n}`);
    console.log(`[S4] błędy strony: ${JSON.stringify(errors.slice(0, 6))}`);
  });

  // ── S6 · spoina produkcja → finanse przy NIEZEROWEJ podstawie kosztowej ────
  // Tor „produkcja → finanse" zmierzył ekran kosztów na zleceniu, którego materiał
  // miał WAC = 0 (F-1). Tu biorę zlecenie, którego zużycie JEST wycenione
  // (WO-202607-0008, ING-SUGAR, wac_avg_cost = 0.666653) — kontrola pozytywna
  // rozstrzygająca, czy „ekran pokazuje 0" wynika z F-1, czy jest osobnym defektem.
  test('S6 · produkcja → finanse: czy niezerowy koszt materiału dochodzi do wyrobu', async ({
    page,
  }) => {
    const errors: string[] = [];
    collectPageErrors(page, errors);
    acceptDialogs(page);
    await signIn(page, baseURL, L, 'admin');

    const [wo] = await sql<{
      id: string;
      status: string;
      item_code: string;
      uom: string;
    }>(
      `select w.id::text as id, w.status, i.item_code, w.uom
         from public.work_orders w join public.items i on i.id = w.product_id
        where w.wo_number = 'WO-202607-0008'`,
    );
    console.log(`[STAN S6] zlecenie: ${JSON.stringify(wo)}`);
    test.skip(!wo || wo.status !== 'IN_PROGRESS', 'WO-202607-0008 nie jest IN_PROGRESS — fixture zużyty.');
    flow.woNumber = 'WO-202607-0008';

    const consumed = await sql<{ qty: string; wac: string | null; val: string | null }>(
      `select c.qty_consumed::text as qty,
              c.ext_jsonb->>'wac_avg_cost' as wac,
              c.ext_jsonb->>'wac_value' as val
         from public.wo_material_consumption c where c.wo_id = $1::uuid`,
      [wo.id],
    );
    console.log(`[STAN S6] zużycie z NIEZEROWĄ wyceną: ${JSON.stringify(consumed)}`);

    const wacBefore = await sql<{ code: string; qty: string; value: string }>(
      `select i.item_code as code, s.total_qty_kg::text as qty, s.total_value::text as value
         from public.item_wac_state s join public.items i on i.id = s.item_id
        where i.item_code = $1`,
      [wo.item_code],
    );
    console.log(`[STAN S6] item_wac_state dla ${wo.item_code} przed outputem: ${JSON.stringify(wacBefore)}`);

    await gotoAndRender(page, `/${L}/production/wos/${wo.id}`, 'wo-detail-header');
    await page.getByTestId('wo-detail-tab-output').click({ timeout: 20_000 });
    const addOutput = page.getByTestId('wo-output-add');
    await expect(addOutput, 'przycisk „Register output"').toBeVisible({ timeout: 30_000 });
    await addOutput.click();
    await expect(page.getByTestId('wo-output-qty')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('wo-output-qty').fill('5');
    const batch = page.getByTestId('wo-output-batch');
    const batchNo = `E2E-SEAM-${Date.now().toString().slice(-8)}`;
    if (await batch.count()) await batch.fill(batchNo);
    await shot(page, '12-output-filled');
    await page.getByTestId('wo-output-confirm').click({ timeout: 20_000 });
    await page.waitForTimeout(6_000);
    await shot(page, '13-output-after');

    const outputs = await sql<{
      qty: string;
      batch: string | null;
      wac_value: string | null;
      wac_cost: string | null;
      lp: string | null;
    }>(
      `select o.qty_kg::text as qty, o.batch_number as batch,
              o.ext_jsonb->>'wac_value' as wac_value,
              o.ext_jsonb->>'wac_avg_cost' as wac_cost,
              o.lp_id::text as lp
         from public.wo_outputs o where o.wo_id = $1::uuid order by o.created_at desc`,
      [wo.id],
    );
    console.log(`[DOWÓD S6] wo_outputs po rejestracji: ${JSON.stringify(outputs)}`);

    const wacAfter = await sql<{ code: string; qty: string; value: string; avg: string }>(
      `select i.item_code as code, s.total_qty_kg::text as qty,
              s.total_value::text as value, s.avg_cost::text as avg
         from public.item_wac_state s join public.items i on i.id = s.item_id
        where i.item_code = $1`,
      [wo.item_code],
    );
    console.log(`[DOWÓD S6] item_wac_state dla ${wo.item_code} PO outputcie: ${JSON.stringify(wacAfter)}`);

    // ── domknięcie zlecenia: czy reszta kosztu trafia gdziekolwiek ──────────
    await gotoAndRender(page, `/${L}/production/wos/${wo.id}`, 'wo-detail-header');
    const completeBtn = page.getByRole('button', { name: /^complete/i }).first();
    if (await completeBtn.count()) {
      await completeBtn.click({ timeout: 20_000 });
      const dlg = page.getByRole('dialog');
      await expect(dlg, 'modal „Complete work order"').toBeVisible({ timeout: 30_000 });

      // Wyprodukowano 5 kg z 10 planowanych → bramka wydajności blokuje domknięcie
      // i żąda nadpisania przez przełożonego. To REGUŁA BIZNESOWA, nie defekt —
      // przechodzę ją tak, jak przeszedłby ją brygadzista.
      const yieldStatus = await dlg.getByRole('status').first().innerText().catch(() => '');
      console.log(`[S6] bramka wydajności przy domknięciu: ${yieldStatus}`);

      const reasonCombo = dlg.getByRole('combobox', { name: /override reason/i });
      if (await reasonCombo.count()) {
        await reasonCombo.click({ timeout: 15_000 });
        await page.getByRole('option').first().click({ timeout: 15_000 });
      }
      const pin = dlg.getByRole('textbox', { name: /PIN|password/i });
      if (await pin.count()) await pin.fill('246813');
      const reason = dlg.getByRole('textbox', { name: /E-sign reason/i });
      if (await reason.count()) await reason.fill('E2E seam check — partial yield');
      await shot(page, '14a-complete-modal-filled');

      const confirmComplete = dlg.getByTestId('wo-complete-confirm');
      console.log(`[S6] „Confirm" aktywny po wypełnieniu nadpisania: ${await confirmComplete.isEnabled()}`);
      if (await confirmComplete.isEnabled()) {
        await confirmComplete.click({ timeout: 20_000 });
        await page.waitForTimeout(8_000);
      }
    }
    await shot(page, '14b-wo-completed');

    const [woAfter] = await sql<{ status: string; produced: string | null; planned: string }>(
      `select status, produced_quantity::text as produced, planned_quantity::text as planned
         from public.work_orders where id = $1::uuid`,
      [wo.id],
    );
    console.log(`[DOWÓD S6] zlecenie po domknięciu: ${JSON.stringify(woAfter)}`);

    const wacFinal = await sql<{ code: string; qty: string; value: string }>(
      `select i.item_code as code, s.total_qty_kg::text as qty, s.total_value::text as value
         from public.item_wac_state s join public.items i on i.id = s.item_id
        where i.item_code = $1`,
      [wo.item_code],
    );
    console.log(`[DOWÓD S6] item_wac_state ${wo.item_code} po domknięciu: ${JSON.stringify(wacFinal)}`);

    // BILANS: ile kosztu weszło w zlecenie, ile z niego wyszło na wyrób.
    const [balance] = await sql<{ wejscie: string | null; wyjscie: string | null }>(
      `select (select sum((c.ext_jsonb->>'wac_value')::numeric)::text
                 from public.wo_material_consumption c where c.wo_id = $1::uuid) as wejscie,
              (select sum((o.ext_jsonb->>'wac_value')::numeric)::text
                 from public.wo_outputs o where o.wo_id = $1::uuid) as wyjscie`,
      [wo.id],
    );
    console.log(`[DOWÓD S6] BILANS kosztu zlecenia (wejście vs wyjście): ${JSON.stringify(balance)}`);

    // Ekran finansów — liczba na ekranie kontra baza.
    await gotoAndRender(page, `/${L}/finance`, 'finance-wo-costs');
    await page.waitForTimeout(4_000);
    await shot(page, '15-finance');
    const row = page.getByRole('row').filter({ hasText: flow.woNumber }).first();
    if (await row.count()) {
      const cells = await row.getByRole('cell').allInnerTexts();
      console.log(`[DOWÓD S6] wiersz zlecenia na ekranie finansów (komórki): ${JSON.stringify(cells)}`);
    } else {
      const body = await page.locator('body').innerText();
      console.log(`[DOWÓD S6] brak wiersza tabeli; ekran: ${JSON.stringify(body.slice(0, 900))}`);
    }
    console.log(`[S6] błędy strony: ${JSON.stringify(errors.slice(0, 4))}`);

    expect(outputs.length, 'output został zarejestrowany').toBeGreaterThan(0);
  });

  // ── S6b · liczba na ekranie finansów kontra ta sama liczba w bazie ────────
  test('S6b · ekran „WO actual costs" kontra księga zlecenia', async ({ page }) => {
    acceptDialogs(page);
    await signIn(page, baseURL, L, 'admin');
    await gotoAndRender(page, `/${L}/finance`, 'finance-wo-costs');
    await page.waitForTimeout(5_000);
    await shot(page, '16-finance-row');

    // WO-…-0008 — materiał z NIEZEROWYM WAC; DEMO-WO-259-004 — materiał z WAC = 0,
    // ale z aktywnym kosztem w item_cost_history (przypadek F-1/F-2 poprzedniego toru).
    for (const woNumber of ['WO-202607-0008', 'DEMO-WO-259-004']) {
      const row = page.getByRole('row').filter({ hasText: woNumber }).first();
      if (await row.count()) {
        console.log(
          `[DOWÓD S6b] ekran ${woNumber}: ${JSON.stringify(await row.getByRole('cell').allInnerTexts())}`,
        );
      } else {
        console.log(`[DOWÓD S6b] brak wiersza ${woNumber} na ekranie`);
      }

      const [db] = await sql<{
        wac_zuzycia: string | null;
        wg_cennika: string | null;
        produced: string | null;
      }>(
        `select (select sum((c.ext_jsonb->>'wac_value')::numeric)::text
                   from public.wo_material_consumption c where c.wo_id = w.id) as wac_zuzycia,
                (select sum(c.qty_consumed * coalesce(h.cost_per_kg, it.cost_per_kg, 0))::text
                   from public.wo_material_consumption c
                   left join public.items it on it.id = c.component_id
                   left join lateral (
                     select cost_per_kg from public.item_cost_history
                      where item_id = c.component_id
                        and effective_from <= coalesce(c.consumed_at::date, current_date)
                        and (effective_to is null or effective_to >= coalesce(c.consumed_at::date, current_date))
                      order by effective_from desc limit 1) h on true
                  where c.wo_id = w.id) as wg_cennika,
                w.produced_quantity::text as produced
           from public.work_orders w where w.wo_number = $1`,
        [woNumber],
      );
      console.log(`[DOWÓD S6b] baza  ${woNumber}: ${JSON.stringify(db)}`);
    }
  });

  // ── Spoina zerowa: czy KTOKOLWIEK w tej bazie przeszedł NPD → fabryka ──────
  test('S0 · czy jakikolwiek projekt przekroczył kiedykolwiek spoinę NPD → fabryka', async () => {
    const rows = await sql<{
      stage: string;
      gate: string;
      projekty: string;
    }>(
      `select current_stage as stage, current_gate as gate, count(*)::text as projekty
         from public.npd_projects group by 1,2 order by 3 desc`,
    );
    console.log(`[DOWÓD S0] rozkład etapów wszystkich projektów NPD: ${JSON.stringify(rows)}`);

    const [rel] = await sql<{ n: string }>(
      `select count(*)::text as n from public.factory_release_status`,
    );
    console.log(`[DOWÓD S0] factory_release_status (zwolnienia do fabryki): ${rel?.n}`);

    const [npdBoms] = await sql<{ n: string }>(
      `select count(*)::text as n from public.bom_headers where origin_module = 'npd'`,
    );
    console.log(`[DOWÓD S0] bom_headers pochodzące z NPD: ${npdBoms?.n}`);

    const [handoff] = await sql<{ n: string }>(
      `select count(*)::text as n from public.handoff_checklists`,
    );
    console.log(`[DOWÓD S0] handoff_checklists (zasiewane przy wejściu w handoff): ${handoff?.n}`);
  });
});
