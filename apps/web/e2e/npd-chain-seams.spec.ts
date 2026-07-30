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

// ═══════════════════════════════════════════════════════════════════════════════
// POFIX — weryfikacja zachowaniem naprawy 375f7c6a („moduł NPD zamknięty od wejścia").
//
// Naprawa ma dowód WYŁĄCZNIE z testów jednostkowych na mockowanym kliencie.
// Ten blok klika te same ścieżki w przeglądarce i sprawdza TRWAŁY STAN W BAZIE.
//
//   POFIX-1  kontrola przeciwna — PUSTE `weekly_volume_packs` musi DALEJ blokować
//   POFIX-2  bramka przepuszcza po wypełnieniu (brief → G1 → recipe)
//   POFIX-3  jak daleko dalej — pierwsza spoina, która nadal nie działa
//
// Cały blok jedzie na NPD-018 (rano nietknięty). NPD-019 zostaje jako materiał
// dowodowy z porannego przebiegu.
//
// Uruchamianie:
//   bash scripts/e2e-local.sh apps/web/e2e/npd-chain-seams.spec.ts --grep POFIX
// ═══════════════════════════════════════════════════════════════════════════════

const fix = { projectId: '', projectCode: 'NPD-018', productCode: '' };

/** Otwiera ekran bramki i modal przejścia; czeka na rozstrzygnięcie gotowości z serwera. */
async function openAdvanceModal(page: Page, projectId: string) {
  await gotoAndRender(page, `/${L}/pipeline/${projectId}/gate`, 'gate-screen');
  const advanceBtn = page.getByTestId('project-header-advance');
  await expect(advanceBtn, 'przycisk „Advance" jest na ekranie bramki').toBeVisible({
    timeout: COMPILE,
  });
  await advanceBtn.click({ timeout: 20_000 });
  const dialog = page.getByRole('dialog');
  await expect(dialog, 'modal przejścia etapu się otwiera').toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('advance-gate-loading')).toHaveCount(0, { timeout: 60_000 });
  return dialog;
}

/** Odhacza W INTERFEJSIE każdy aktywny, jeszcze nieodhaczony punkt listy bramki. */
async function tickGateChecklist(page: Page, projectId: string): Promise<number> {
  await gotoAndRender(page, `/${L}/pipeline/${projectId}/gate`, 'gate-screen');
  const triggers = page.getByTestId('gate-collapsible-trigger');
  const triggerCount = await triggers.count();
  for (let i = 0; i < triggerCount; i += 1) {
    const region = page
      .getByTestId('gate-collapsible')
      .nth(i)
      .getByTestId('gate-collapsible-region');
    if ((await region.count()) === 0) await triggers.nth(i).click({ timeout: 10_000 });
  }
  const checkboxes = page.getByTestId('gate-checklist-checkbox');
  const total = await checkboxes.count();
  let ticked = 0;
  for (let i = 0; i < total; i += 1) {
    const box = checkboxes.nth(i);
    if (await box.isDisabled()) continue;
    if (await box.isChecked()) continue;
    await box.check({ timeout: 15_000 });
    ticked += 1;
    // Server Action + router.refresh() — czekam na utrwalenie, nie na animację.
    await page.waitForTimeout(500);
  }
  return ticked;
}

/**
 * Wypełnia pole sekcji działowej etapu (StageDeptSections) i klika JEGO przycisk zapisu.
 * Dropdown = własny Select (role=combobox/option), reszta = input/textarea.
 */
async function fillStageDeptField(page: Page, code: string, value: string): Promise<void> {
  const editor = page.locator(`[data-field="${code}"]`).first();
  await expect(editor, `pole etapu „${code}" jest na ekranie`).toBeVisible({ timeout: COMPILE });
  const combo = editor.getByRole('combobox');
  if ((await combo.count()) > 0) {
    await combo.first().click({ timeout: 15_000 });
    // Lista jest PORTALOWANA do <body>; szukam po roli `listbox`, a NIE `page.getByRole('option')`
    // — to ostatnie łapie natywny <select> wyboru zakładu z nagłówka („All sites").
    const options = page.getByRole('listbox').getByRole('option');
    const wanted = options.filter({ hasText: value }).first();
    const target = (await wanted.count()) > 0 ? wanted : options.first();
    await expect(target, `dropdown „${code}" ma opcje do wyboru`).toBeVisible({ timeout: 15_000 });
    await target.click({ timeout: 15_000 });
  } else {
    await editor.locator('input, textarea').first().fill(value);
  }
  // Przycisk zapisu jest wyłączony, gdy szkic == wartość zapisana. Po ponownym
  // przebiegu wartość bywa już ta sama — to nie jest awaria, tylko brak zmiany.
  const save = editor.locator('xpath=..').getByRole('button').first();
  if (await save.isEnabled()) {
    await save.click({ timeout: 20_000 });
    await page.waitForTimeout(1_500);
  } else {
    console.log(`[POFIX] pole „${code}" miało już docelową wartość — nic do zapisania`);
  }
}

async function readProjectState(projectId: string) {
  const [row] = await sql<{
    stage: string;
    gate: string;
    weekly: string | null;
    runs: string | null;
  }>(
    `select current_stage as stage, current_gate as gate,
            weekly_volume_packs::text as weekly, runs_per_week::text as runs
       from public.npd_projects where id = $1::uuid`,
    [projectId],
  );
  return row;
}

test.describe.serial('POFIX · naprawa 375f7c6a kontra rzeczywiste kliknięcia', () => {
  test.describe.configure({ timeout: 600_000 });
  test.skip(!baseURL, 'PLAYWRIGHT_BASE_URL unset — uruchamiać przez scripts/e2e-local.sh.');

  // ── POFIX-1 · KONTROLA PRZECIWNA: pusta wartość ma DALEJ blokować ──────────
  test('POFIX-1 · puste weekly_volume_packs nadal blokuje bramkę G0', async ({ page }) => {
    const errors: string[] = [];
    collectPageErrors(page, errors);
    acceptDialogs(page);

    const [project] = await sql<{ id: string; product_code: string }>(
      `select id::text as id, product_code from public.npd_projects where code = $1`,
      [fix.projectCode],
    );
    expect(project, `projekt ${fix.projectCode} istnieje`).toBeTruthy();
    fix.projectId = project.id;
    fix.productCode = project.product_code;

    // FIXTURE: stan „świeżo utworzonego projektu" — brief/G0, pusta kolumna,
    // odhaczenia listy skasowane. To NIE jest obejście bramki, tylko punkt
    // startowy kontroli przeciwnej; dzięki temu blok jest powtarzalny.
    console.log(`[STAN POFIX-1] przed wyzerowaniem: ${JSON.stringify(await readProjectState(fix.projectId))}`);
    await sql(
      `update public.npd_projects
          set weekly_volume_packs = null, runs_per_week = null,
              current_stage = 'brief', current_gate = 'G0'
        where id = $1::uuid`,
      [fix.projectId],
    );
    await sql(
      `update public.gate_checklist_items
          set completed_at = null, completed_by_user = null
        where project_id = $1::uuid`,
      [fix.projectId],
    );
    console.log(`[STAN POFIX-1] po wyzerowaniu:     ${JSON.stringify(await readProjectState(fix.projectId))}`);

    await signIn(page, baseURL, L, 'harness');

    // Pozostałe wymagane pola etapu brief (kolumny widoku product) wypełniam z UI,
    // żeby jedynym otwartym punktem został wolumen — inaczej dowód byłby rozmyty.
    await gotoAndRender(page, `/${L}/pipeline/${fix.projectId}/brief`, 'stage-dept-sections-brief');
    await fillStageDeptField(page, 'pack_size', '250g');
    await fillStageDeptField(page, 'number_of_cases', '480');
    await fillStageDeptField(page, 'recipe_components', 'E2E: baza + przyprawy + opakowanie');
    await shot(page, 'pofix-01-brief-stage-fields');

    const [prodRow] = await sql<{
      pack: string | null;
      cases: string | null;
      comps: string | null;
      name: string | null;
    }>(
      `select p.pack_size as pack, p.number_of_cases::text as cases,
              p.recipe_components as comps, p.product_name as name
         from public.product p
         join public.npd_projects np on np.org_id = p.org_id and np.product_code = p.product_code
        where np.id = $1::uuid`,
      [fix.projectId],
    );
    console.log(`[DOWÓD POFIX-1] public.product po zapisach z UI: ${JSON.stringify(prodRow)}`);

    const ticked = await tickGateChecklist(page, fix.projectId);
    const g0 = await sql<{ total: string; done: string }>(
      `select count(*) filter (where required)::text as total,
              count(*) filter (where required and completed_at is not null)::text as done
         from public.gate_checklist_items
        where project_id = $1::uuid and gate_code = 'G0'`,
      [fix.projectId],
    );
    console.log(`[DOWÓD POFIX-1] odhaczono ${ticked}; gate_checklist_items G0: ${JSON.stringify(g0[0])}`);

    const dialog = await openAdvanceModal(page, fix.projectId);
    const blockers = await dialog.getByTestId('advance-gate-required-warning-item').allInnerTexts();
    const confirm = dialog.locator('button[type="submit"]');
    const confirmEnabled = (await confirm.count()) > 0 ? await confirm.isEnabled() : false;
    console.log(`[DOWÓD POFIX-1] blokery przy PUSTYM polu (${blockers.length}): ${JSON.stringify(blockers)}`);
    console.log(`[DOWÓD POFIX-1] potwierdzenie aktywne: ${confirmEnabled}`);
    await shot(page, 'pofix-02-blocked-empty');

    const after = await readProjectState(fix.projectId);
    console.log(`[DOWÓD POFIX-1] stan projektu po próbie: ${JSON.stringify(after)}`);
    console.log(`[POFIX-1] błędy strony: ${JSON.stringify(errors.slice(0, 6))}`);

    expect(
      blockers.join(' | '),
      'bloker „Weekly volume" JEST wymieniony przy pustym polu',
    ).toMatch(/weekly volume/i);
    expect(confirmEnabled, 'potwierdzenie przejścia jest ZABLOKOWANE przy pustym polu').toBe(false);
    expect(after.stage, 'projekt nie ruszył z etapu brief').toBe('brief');
    expect(after.gate, 'bramka nie ruszyła z G0').toBe('G0');
  });

  // ── POFIX-2 · bramka przepuszcza po wypełnieniu ────────────────────────────
  test('POFIX-2 · wypełnienie wolumenu odblokowuje G0 i przeprowadza brief → recipe', async ({
    page,
  }) => {
    const errors: string[] = [];
    collectPageErrors(page, errors);
    acceptDialogs(page);
    await signIn(page, baseURL, L, 'harness');

    // ── 2a. wpisuję wolumen W FORMULARZU BRIEF (ta sama ścieżka, co rano) ────
    await gotoAndRender(page, `/${L}/pipeline/${fix.projectId}/brief`, 'brief-inline-form');
    await page.getByTestId('brief-field-weeklyVolumePacks').fill('1450');
    await page.getByTestId('brief-field-runsPerWeek').fill('5');
    await page.getByTestId('brief-save').click({ timeout: 20_000 });
    await page.waitForTimeout(4_000);
    await shot(page, 'pofix-03-brief-filled');

    const saved = await readProjectState(fix.projectId);
    console.log(`[DOWÓD POFIX-2] npd_projects po zapisie z UI: ${JSON.stringify(saved)}`);
    expect(saved.weekly, 'wolumen utrwalony w npd_projects').toBe('1450.000');

    // ── 2b. modal przejścia: lista blokerów ma się ZMNIEJSZYĆ do zera ────────
    const dialog = await openAdvanceModal(page, fix.projectId);
    const blockers = await dialog.getByTestId('advance-gate-required-warning-item').allInnerTexts();
    const confirm = dialog.locator('button[type="submit"]');
    console.log(`[DOWÓD POFIX-2] blokery PO wypełnieniu (${blockers.length}): ${JSON.stringify(blockers)}`);
    console.log(`[DOWÓD POFIX-2] potwierdzenie aktywne: ${await confirm.isEnabled()}`);
    await shot(page, 'pofix-04-advance-ready');

    expect(blockers.join(' | '), 'bloker „Weekly volume" ZNIKNĄŁ').not.toMatch(/weekly volume/i);
    await expect(confirm, 'potwierdzenie przejścia jest AKTYWNE').toBeEnabled({ timeout: 15_000 });

    await confirm.click({ timeout: 20_000 });
    await expect(page.getByTestId('advance-gate-success'), 'serwer potwierdza przejście').toBeVisible({
      timeout: 60_000,
    });
    await shot(page, 'pofix-05-advanced-g1');

    const afterG1 = await readProjectState(fix.projectId);
    console.log(`[DOWÓD POFIX-2] stan po pierwszym przejściu: ${JSON.stringify(afterG1)}`);
    expect(afterG1.gate, 'G0 → G1 (przejście bramkowe, etap zostaje na brief)').toBe('G1');

    // ── 2c. drugie przejście: G1 + brief → G2 + recipe ───────────────────────
    const tickedG1 = await tickGateChecklist(page, fix.projectId);
    console.log(`[POFIX-2] odhaczono punktów listy G1: ${tickedG1}`);

    const dialog2 = await openAdvanceModal(page, fix.projectId);
    const blockers2 = await dialog2.getByTestId('advance-gate-required-warning-item').allInnerTexts();
    console.log(`[DOWÓD POFIX-2] blokery G1→G2 (${blockers2.length}): ${JSON.stringify(blockers2)}`);
    const confirm2 = dialog2.locator('button[type="submit"]');
    console.log(`[DOWÓD POFIX-2] potwierdzenie G1→G2 aktywne: ${await confirm2.isEnabled()}`);
    if (await confirm2.isEnabled()) {
      await confirm2.click({ timeout: 20_000 });
      await expect(page.getByTestId('advance-gate-success')).toBeVisible({ timeout: 60_000 });
    } else {
      const err = page.getByTestId('advance-gate-error');
      if (await err.count()) console.log(`[DOWÓD POFIX-2] błąd serwera: ${await err.innerText()}`);
    }
    await shot(page, 'pofix-06-advanced-recipe');

    const afterRecipe = await readProjectState(fix.projectId);
    console.log(`[DOWÓD POFIX-2] stan po drugim przejściu: ${JSON.stringify(afterRecipe)}`);
    console.log(`[POFIX-2] błędy strony: ${JSON.stringify(errors.slice(0, 6))}`);

    expect(afterRecipe.stage, 'projekt PRZESZEDŁ brief → recipe').toBe('recipe');
    expect(afterRecipe.gate, 'bramka G1 → G2').toBe('G2');
  });

  // ── POFIX-3 · następna spoina: recipe → packaging ──────────────────────────
  test('POFIX-3 · dokąd łańcuch dochodzi teraz — recipe → packaging', async ({ page }) => {
    const errors: string[] = [];
    collectPageErrors(page, errors);
    acceptDialogs(page);
    await signIn(page, baseURL, L, 'harness');

    const tickedG2 = await tickGateChecklist(page, fix.projectId);
    console.log(`[POFIX-3] odhaczono punktów listy G2: ${tickedG2}`);

    const dialog = await openAdvanceModal(page, fix.projectId);
    const blockers = await dialog.getByTestId('advance-gate-required-warning-item').allInnerTexts();
    const confirm = dialog.locator('button[type="submit"]');
    const enabled = (await confirm.count()) > 0 ? await confirm.isEnabled() : false;
    console.log(`[DOWÓD POFIX-3] blokery recipe→packaging (${blockers.length}): ${JSON.stringify(blockers)}`);
    console.log(`[DOWÓD POFIX-3] potwierdzenie aktywne: ${enabled}`);
    await shot(page, 'pofix-07-recipe-advance');

    if (enabled) {
      await confirm.click({ timeout: 20_000 });
      await page.waitForTimeout(6_000);
      const err = page.getByTestId('advance-gate-error');
      if (await err.count()) console.log(`[DOWÓD POFIX-3] błąd serwera: ${await err.innerText()}`);
    }
    await shot(page, 'pofix-08-recipe-after');

    // Czy wymagane pola etapu `recipe` mają W OGÓLE ekran, na którym da się je wpisać?
    // (StageDeptSections renderują się na brief/packaging/costing-nutrition/trial/sensory/pilot.)
    const recipeScreens: Record<string, boolean> = {};
    for (const route of [
      '',
      'brief',
      'formulation',
      'costing',
      'costing-nutrition',
      'nutrition',
      'packaging',
      'trial',
      'sensory',
      'pilot',
      'approval',
      'handoff',
      'gate',
    ]) {
      // `project-header` renderuje layout projektu — czekam NA NIEGO, a nie na
      // stały timeout: serwer DEV kompiluje każdą trasę przy pierwszym wejściu
      // i „pola nie ma" bez tej asercji bywa zwykłym wyścigiem z kompilacją.
      await page.goto(url(`/${L}/pipeline/${fix.projectId}/${route}`), {
        waitUntil: 'domcontentloaded',
        timeout: COMPILE,
      });
      await expect(
        page.getByTestId('project-header'),
        `/${route} → renderuje nagłówek projektu`,
      ).toBeVisible({ timeout: COMPILE });
      await page.waitForTimeout(2_000);
      const hasRecipeSection = (await page.getByTestId('stage-dept-sections-recipe').count()) > 0;
      const hasAnyField =
        (await page.locator('[data-field="shelf_life"]').count()) > 0 ||
        (await page.locator('[data-field="primary_ingredient_pct"]').count()) > 0 ||
        (await page.locator('[data-field="date_code_per_week"]').count()) > 0;
      const mounted = await page
        .locator('[data-testid^="stage-dept-sections-"]')
        .evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')));
      recipeScreens[route] = hasRecipeSection || hasAnyField;
      console.log(
        `[DOWÓD POFIX-3] /${route || '(główna)'}: sekcja recipe=${hasRecipeSection}, pole recipe=${hasAnyField}, zamontowane sekcje=${JSON.stringify(mounted)}`,
      );
    }
    console.log(`[DOWÓD POFIX-3] podsumowanie ekranów: ${JSON.stringify(recipeScreens)}`);

    const state = await readProjectState(fix.projectId);
    console.log(`[DOWÓD POFIX-3] stan końcowy projektu: ${JSON.stringify(state)}`);

    const rec = await sql<{ field: string; wartosc: string | null }>(
      `select f.code as field, to_jsonb(p.*) ->> lower(f.code) as wartosc
         from public.npd_departments d
         join public.npd_department_field df on df.department_id = d.id and df.org_id = d.org_id
         join public.npd_field_catalog f on f.id = df.field_id and f.org_id = df.org_id
         join public.npd_projects np on np.id = $1::uuid
         left join public.product p on p.org_id = np.org_id and p.product_code = np.product_code
        where d.org_id = np.org_id and d.active and d.stage_code = 'recipe'
          and df.visible and df.required and f.active
        group by 1, 2 order by 1`,
      [fix.projectId],
    );
    console.log(`[DOWÓD POFIX-3] wymagane pola etapu recipe i ich wartości: ${JSON.stringify(rec)}`);
    console.log(`[POFIX-3] błędy strony: ${JSON.stringify(errors.slice(0, 6))}`);

    expect(state, 'projekt istnieje po próbie').toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ETAPY — weryfikacja ZACHOWANIEM naprawy 4a3d02a9 („bramki wymagały pól, których
// żaden ekran nie wystawiał"). Tor naprawiający napisał wprost: „NIE klikałem".
//
//   ETAP-1  sekcja `recipe` renderuje się na /formulation i przyjmuje wpis
//   ETAP-2  KONTROLA PRZECIWNA — puste pola DALEJ blokują tym samym komunikatem
//   ETAP-3  wypełnienie trzech pól → blokery do zera → recipe → packaging w BAZIE
//   ETAP-4  marsz dalej, do PIERWSZEJ rzeczy, która nie działa
//   ETAP-5  sekcja `approval` renderuje się na /approval i utrwala zapis
//
// Uruchamianie:
//   bash scripts/e2e-local.sh apps/web/e2e/npd-chain-seams.spec.ts --grep ETAP
// ═══════════════════════════════════════════════════════════════════════════════

const etap = { projectId: '', productCode: '' };

/** stage_code → segment trasy (kopia lib/npd/stage-routes.ts; `recipe` żyje pod /formulation). */
const STAGE_ROUTE: Record<string, string> = {
  brief: 'brief',
  recipe: 'formulation',
  packaging: 'packaging',
  costing_nutrition: 'costing-nutrition',
  trial: 'trial',
  sensory: 'sensory',
  pilot: 'pilot',
  approval: 'approval',
  handoff: 'handoff',
};

/** Wartość próbna zgodna z typem pola; `bar_codes` idzie do items.gs1_gtin — musi być GTIN. */
function sampleValue(dataType: string, code: string): string {
  if (code === 'bar_codes') return '5901234123457';
  if (dataType === 'number' || dataType === 'integer') return '12';
  if (dataType === 'date' || dataType === 'datetime') return '2026-12-01';
  if (dataType === 'boolean') return 'true';
  return `E2E ${code}`;
}

/**
 * Wypełnia JEDNO pole sekcji działowej i klika JEGO „Save".
 * Przycisk zapisu jest RODZEŃSTWEM `[data-field]`, nie jego dzieckiem — przy polach
 * typu dropdown `getByRole('button').first()` w rodzicu złapałby trigger listy, nie zapis.
 * Listy zamykam kliknięciem opcji; `Escape` zamknąłby CAŁY modal.
 */
async function fillStageField(
  page: Page,
  code: string,
  value: string,
): Promise<'saved' | 'unchanged' | 'readonly' | 'missing'> {
  const editor = page.locator(`[data-field="${code}"]`).first();
  if ((await editor.count()) === 0) return 'missing';
  await expect(editor, `pole „${code}" jest widoczne`).toBeVisible({ timeout: COMPILE });

  const save = editor.locator('xpath=following-sibling::div[1]').getByRole('button').first();
  if ((await save.count()) === 0) return 'readonly';

  const combo = editor.getByRole('combobox');
  if ((await combo.count()) > 0) {
    await combo.first().click({ timeout: 15_000 });
    // Lista jest PORTALOWANA do <body>; szukam po roli `listbox`, a NIE `page.getByRole('option')`
    // — to ostatnie łapie natywny <select> wyboru zakładu z nagłówka („All sites").
    const options = page.getByRole('listbox').getByRole('option');
    await expect(options.first(), `dropdown „${code}" ma opcje do wyboru`).toBeVisible({
      timeout: 15_000,
    });
    const wanted = options.filter({ hasText: value }).first();
    const target = (await wanted.count()) > 0 ? wanted : options.first();
    await target.click({ timeout: 15_000 });
  } else {
    await editor.locator('input, textarea').first().fill(value);
  }

  // Zapis jest wyłączony, gdy szkic == wartość zapisana — to nie awaria, tylko brak zmiany.
  if (!(await save.isEnabled())) return 'unchanged';
  await save.click({ timeout: 20_000 });
  await page.waitForTimeout(1_200);
  return 'saved';
}

/** Wymagane pola etapu + ich wartości W ŹRÓDLE, z którego czyta bramka (public.product). */
async function requiredStageFields(projectId: string, stage: string) {
  return sql<{ dept: string; field: string; label: string; data_type: string; wartosc: string | null }>(
    `select distinct
            d.name as dept,
            lower(f.code) as field,
            f.label,
            f.data_type,
            to_jsonb(p.*) ->> lower(f.code) as wartosc
       from public.npd_departments d
       join public.npd_department_field df on df.department_id = d.id and df.org_id = d.org_id
       join public.npd_field_catalog f     on f.id = df.field_id and f.org_id = df.org_id
       join public.npd_projects np         on np.id = $1::uuid
       left join public.product p          on p.org_id = np.org_id and p.product_code = np.product_code
      where d.org_id = np.org_id and d.active and d.stage_code = $2::text
        and df.visible and df.required and f.active
      order by 1, 2`,
    [projectId, stage],
  );
}

type AdvanceOutcome = {
  etapPrzed: string;
  bramkaPrzed: string;
  polaWypelnione: string[];
  odhaczone: number;
  blokery: string[];
  gotowoscZielona: boolean;
  miekkie: string[];
  potwierdzenieAktywne: boolean;
  bladSerwera: string | null;
  etapPo: string;
  bramkaPo: string;
};

/**
 * Jedno pełne podejście do przejścia etapu: wypełnij wymagane pola działowe TEGO etapu
 * w interfejsie → odhacz listę bramki → otwórz modal → potwierdź, jeśli aktywny.
 * Zwraca stan przed/po prosto z bazy.
 */
async function advanceOneStage(page: Page, projectId: string, tag: string): Promise<AdvanceOutcome> {
  const before = await readProjectState(projectId);
  const stage = before.stage;
  const route = STAGE_ROUTE[stage] ?? stage;
  const wypelnione: string[] = [];

  const fields = await requiredStageFields(projectId, stage);
  console.log(`[${tag}] etap ${stage}/${before.gate} — wymaganych pól działowych: ${fields.length}`);
  if (fields.length > 0) {
    await gotoAndRender(page, `/${L}/pipeline/${projectId}/${route}`, `stage-dept-sections-${stage}`);
    for (const f of fields) {
      if (f.wartosc !== null && f.wartosc.trim() !== '') continue;
      const outcome = await fillStageField(page, f.field, sampleValue(f.data_type, f.field));
      console.log(`[${tag}] ${stage} · ${f.dept}/${f.field} (${f.data_type}) → ${outcome}`);
      if (outcome === 'saved') wypelnione.push(f.field);
      if (outcome === 'missing') wypelnione.push(`${f.field}:BRAK-POLA-NA-EKRANIE`);
    }
  }

  const odhaczone = await tickGateChecklist(page, projectId);
  const dialog = await openAdvanceModal(page, projectId);
  const blokery = await dialog.getByTestId('advance-gate-required-warning-item').allInnerTexts();

  const soft = dialog.getByTestId('advance-gate-soft-block');
  const softItems = dialog.getByTestId('advance-gate-soft-block-item');
  const confirm = dialog.locator('button[type="submit"]');
  const success = page.getByTestId('advance-gate-success');
  const failure = page.getByTestId('advance-gate-error');

  /** Miękka bramka nie blokuje — żąda NOTATKI nadpisania. Operator by ją wpisał. */
  const wpiszNotatke = async (): Promise<string[]> => {
    const missing = (await softItems.allInnerTexts()).map((m) => m.replace(/\s+/g, ' ').trim());
    await dialog
      .locator('#advance-gate-notes')
      .fill(`E2E: nadpisanie miękkiej bramki — ${missing.join('; ')}`);
    return missing;
  };

  // „Gotowość" liczona przez serwer PRZED kliknięciem — porównywalna z tym, co
  // zwróci samo przejście (te dwie odpowiedzi potrafią sobie przeczyć).
  const gotowoscZielona = (await dialog.getByTestId('advance-gate-ready').count()) > 0;

  let miekkie: string[] = [];
  if ((await soft.count()) > 0) miekkie = await wpiszNotatke();

  const potwierdzenieAktywne = (await confirm.count()) > 0 ? await confirm.isEnabled() : false;
  let bladSerwera: string | null = null;

  if (potwierdzenieAktywne) {
    await confirm.click({ timeout: 20_000 });
    // Miękka bramka bywa ujawniana DOPIERO po kliknięciu: gotowość liczona w trybie
    // `readiness` pomija doradczy warunek costing/nutrition, który tryb `advance` stosuje.
    await expect
      .poll(
        async () => (await success.count()) + (await failure.count()) + (await soft.count()),
        { timeout: 60_000 },
      )
      .toBeGreaterThan(0);

    if ((await success.count()) === 0 && (await failure.count()) === 0 && (await soft.count()) > 0) {
      miekkie = await wpiszNotatke();
      await expect(confirm, 'po wpisaniu notatki nadpisanie jest aktywne').toBeEnabled({
        timeout: 15_000,
      });
      await confirm.click({ timeout: 20_000 });
      await expect
        .poll(async () => (await success.count()) + (await failure.count()), { timeout: 60_000 })
        .toBeGreaterThan(0);
    }
    if (await failure.count()) bladSerwera = (await failure.innerText()).replace(/\s+/g, ' ').trim();
  }

  const after = await readProjectState(projectId);
  return {
    etapPrzed: before.stage,
    bramkaPrzed: before.gate,
    polaWypelnione: wypelnione,
    odhaczone,
    blokery: blokery.map((b) => b.replace(/\s+/g, ' ').trim()),
    gotowoscZielona,
    miekkie,
    potwierdzenieAktywne,
    bladSerwera,
    etapPo: after.stage,
    bramkaPo: after.gate,
  };
}

test.describe.serial('ETAPY · naprawa 4a3d02a9 kontra rzeczywiste kliknięcia', () => {
  test.describe.configure({ timeout: 900_000 });
  test.skip(!baseURL, 'PLAYWRIGHT_BASE_URL unset — uruchamiać przez scripts/e2e-local.sh.');

  // ── ETAP-1 · czy operator W OGÓLE widzi pola etapu recipe ──────────────────
  test('ETAP-1 · /formulation renderuje sekcję recipe i pola przyjmują wpis', async ({ page }) => {
    const errors: string[] = [];
    collectPageErrors(page, errors);
    acceptDialogs(page);

    const [project] = await sql<{ id: string; product_code: string }>(
      `select id::text as id, product_code from public.npd_projects where code = 'NPD-018'`,
    );
    expect(project, 'projekt NPD-018 istnieje').toBeTruthy();
    etap.projectId = project.id;
    etap.productCode = project.product_code;

    // FIXTURE: punkt startowy = recipe/G2 z PUSTYMI polami działowymi etapu.
    // Zerowanie idzie na tabelę bazową widoku public.product (fg_npd_ext).
    await sql(
      `update public.npd_projects set current_stage = 'recipe', current_gate = 'G2' where id = $1::uuid`,
      [etap.projectId],
    );
    await sql(
      `update public.fg_npd_ext x
          set primary_ingredient_pct = null, date_code_per_week = null, shelf_life = null
         from public.items i
        where i.id = x.item_id and i.item_code = $1`,
      [etap.productCode],
    );
    console.log(`[STAN ETAP-1] ${JSON.stringify(await readProjectState(etap.projectId))}`);
    console.log(
      `[STAN ETAP-1] wymagane pola recipe: ${JSON.stringify(await requiredStageFields(etap.projectId, 'recipe'))}`,
    );

    await signIn(page, baseURL, L, 'harness');
    await gotoAndRender(
      page,
      `/${L}/pipeline/${etap.projectId}/formulation`,
      'stage-dept-sections-recipe',
    );
    await shot(page, 'etap-01-formulation-recipe-section');

    // Nie „komponent jest w źródle" — trzy KONKRETNE pola są widoczne i edytowalne.
    for (const code of ['primary_ingredient_pct', 'date_code_per_week', 'shelf_life']) {
      const editor = page.locator(`[data-field="${code}"]`).first();
      await expect(editor, `pole „${code}" widoczne na /formulation`).toBeVisible({ timeout: COMPILE });
      const input = editor.locator('input, textarea').first();
      await expect(input, `pole „${code}" ma kontrolkę do wpisania`).toBeVisible();
      await expect(input, `pole „${code}" nie jest tylko do odczytu`).not.toHaveAttribute(
        'readonly',
        /.*/,
      );
      await input.fill(code === 'primary_ingredient_pct' ? '42' : `próba ${code}`);
      await expect(input, `wpisana wartość zostaje w polu „${code}"`).not.toHaveValue('');
      const save = editor.locator('xpath=following-sibling::div[1]').getByRole('button').first();
      await expect(save, `„Save" przy „${code}" aktywuje się po zmianie`).toBeEnabled();
    }
    await shot(page, 'etap-02-recipe-fields-typed');
    console.log(`[ETAP-1] błędy strony: ${JSON.stringify(errors.slice(0, 6))}`);

    // Nic nie zapisuję — ETAP-2 potrzebuje pustego źródła do kontroli przeciwnej.
    const stillEmpty = await requiredStageFields(etap.projectId, 'recipe');
    console.log(`[DOWÓD ETAP-1] źródło bramki po samym wpisaniu (bez „Save"): ${JSON.stringify(stillEmpty)}`);
    expect(
      stillEmpty.every((f) => f.wartosc === null || f.wartosc.trim() === ''),
      'sam wpis bez „Save" NIE utrwala wartości',
    ).toBe(true);
  });

  // ── ETAP-2 · KONTROLA PRZECIWNA: puste pole ma DALEJ blokować ──────────────
  test('ETAP-2 · puste pola etapu recipe nadal blokują bramkę G2', async ({ page }) => {
    const errors: string[] = [];
    collectPageErrors(page, errors);
    acceptDialogs(page);
    await signIn(page, baseURL, L, 'harness');

    const odhaczone = await tickGateChecklist(page, etap.projectId);
    const g2 = await sql<{ total: string; done: string }>(
      `select count(*) filter (where required)::text as total,
              count(*) filter (where required and completed_at is not null)::text as done
         from public.gate_checklist_items
        where project_id = $1::uuid and gate_code = 'G2'`,
      [etap.projectId],
    );
    console.log(`[DOWÓD ETAP-2] odhaczono ${odhaczone}; lista G2: ${JSON.stringify(g2[0])}`);

    const dialog = await openAdvanceModal(page, etap.projectId);
    const blokery = (await dialog.getByTestId('advance-gate-required-warning-item').allInnerTexts()).map(
      (b) => b.replace(/\s+/g, ' ').trim(),
    );
    const confirm = dialog.locator('button[type="submit"]');
    const aktywne = (await confirm.count()) > 0 ? await confirm.isEnabled() : false;
    console.log(`[DOWÓD ETAP-2] blokery przy PUSTYCH polach (${blokery.length}): ${JSON.stringify(blokery)}`);
    console.log(`[DOWÓD ETAP-2] potwierdzenie aktywne: ${aktywne}`);
    await shot(page, 'etap-03-blocked-empty');

    const after = await readProjectState(etap.projectId);
    console.log(`[DOWÓD ETAP-2] stan projektu po próbie: ${JSON.stringify(after)}`);
    console.log(`[ETAP-2] błędy strony: ${JSON.stringify(errors.slice(0, 6))}`);

    const joined = blokery.join(' | ');
    expect(joined, 'bloker „Primary Ingredient Pct" wymieniony').toMatch(/primary ingredient pct/i);
    expect(joined, 'bloker „Date Code Per Week" wymieniony').toMatch(/date code per week/i);
    expect(joined, 'bloker „Shelf Life" wymieniony').toMatch(/shelf life/i);
    expect(aktywne, 'potwierdzenie ZABLOKOWANE przy pustych polach').toBe(false);
    expect(after.stage, 'projekt nie ruszył z etapu recipe').toBe('recipe');
    expect(after.gate, 'bramka nie ruszyła z G2').toBe('G2');
  });

  // ── ETAP-3 · wypełnienie odblokowuje bramkę i przeprowadza etap ────────────
  test('ETAP-3 · wypełnienie trzech pól przeprowadza recipe → packaging', async ({ page }) => {
    const errors: string[] = [];
    collectPageErrors(page, errors);
    acceptDialogs(page);
    await signIn(page, baseURL, L, 'harness');

    await gotoAndRender(
      page,
      `/${L}/pipeline/${etap.projectId}/formulation`,
      'stage-dept-sections-recipe',
    );
    for (const [code, value] of [
      ['primary_ingredient_pct', '42'],
      ['date_code_per_week', 'W-CODE-3'],
      ['shelf_life', '21 dni'],
    ] as const) {
      const outcome = await fillStageField(page, code, value);
      console.log(`[ETAP-3] zapis „${code}" → ${outcome}`);
      expect(outcome, `pole „${code}" dało się zapisać z ekranu`).toBe('saved');
    }
    await shot(page, 'etap-04-recipe-filled');

    // DOWÓD TRWAŁOŚCI: źródło, z którego czyta bramka, ma teraz wartości.
    const zrodlo = await requiredStageFields(etap.projectId, 'recipe');
    console.log(`[DOWÓD ETAP-3] public.product po zapisach z UI: ${JSON.stringify(zrodlo)}`);
    for (const f of zrodlo) {
      expect(f.wartosc?.trim() ?? '', `pole „${f.field}" utrwalone w źródle bramki`).not.toBe('');
    }

    const dialog = await openAdvanceModal(page, etap.projectId);
    const blokery = (await dialog.getByTestId('advance-gate-required-warning-item').allInnerTexts()).map(
      (b) => b.replace(/\s+/g, ' ').trim(),
    );
    const confirm = dialog.locator('button[type="submit"]');
    console.log(`[DOWÓD ETAP-3] blokery PO wypełnieniu (${blokery.length}): ${JSON.stringify(blokery)}`);
    await shot(page, 'etap-05-advance-ready');

    expect(blokery.length, 'lista blokerów zmalała do zera').toBe(0);
    await expect(confirm, 'potwierdzenie przejścia jest AKTYWNE').toBeEnabled({ timeout: 15_000 });

    await confirm.click({ timeout: 20_000 });
    await expect(page.getByTestId('advance-gate-success'), 'serwer potwierdza przejście').toBeVisible({
      timeout: 60_000,
    });
    await shot(page, 'etap-06-advanced-packaging');

    const after = await readProjectState(etap.projectId);
    console.log(`[DOWÓD ETAP-3] stan projektu po przejściu: ${JSON.stringify(after)}`);
    console.log(`[ETAP-3] błędy strony: ${JSON.stringify(errors.slice(0, 6))}`);
    expect(after.stage, 'projekt PRZESZEDŁ recipe → packaging').toBe('packaging');
    expect(after.gate, 'bramka G2 → G3').toBe('G3');
  });

  // ── ETAP-4 · marsz dalej — do PIERWSZEJ rzeczy, która nie działa ───────────
  test('ETAP-4 · jak daleko łańcuch dochodzi teraz', async ({ page }) => {
    const errors: string[] = [];
    collectPageErrors(page, errors);
    acceptDialogs(page);
    await signIn(page, baseURL, L, 'harness');

    const przebieg: AdvanceOutcome[] = [];
    let sciana: AdvanceOutcome | null = null;

    // 8 kroków wystarcza na packaging → launched; pętla i tak przerywa na pierwszej ścianie.
    for (let step = 0; step < 8; step += 1) {
      const outcome = await advanceOneStage(page, etap.projectId, `ETAP-4/${step + 1}`);
      przebieg.push(outcome);
      console.log(`[DOWÓD ETAP-4] krok ${step + 1}: ${JSON.stringify(outcome)}`);
      await shot(page, `etap-07-marsz-${String(step + 1).padStart(2, '0')}-${outcome.etapPo}`);
      if (outcome.etapPo === outcome.etapPrzed && outcome.bramkaPo === outcome.bramkaPrzed) {
        sciana = outcome;
        break;
      }
      if (outcome.etapPo === 'launched') break;
    }

    console.log(`[DOWÓD ETAP-4] cały przebieg: ${JSON.stringify(przebieg)}`);
    console.log(
      `[DOWÓD ETAP-4] ŚCIANA: ${sciana ? JSON.stringify({ etap: sciana.etapPrzed, bramka: sciana.bramkaPrzed, blokery: sciana.blokery, blad: sciana.bladSerwera }) : 'brak — projekt doszedł do końca'}`,
    );
    const koniec = await readProjectState(etap.projectId);
    console.log(`[DOWÓD ETAP-4] stan końcowy: ${JSON.stringify(koniec)}`);
    console.log(`[ETAP-4] błędy strony: ${JSON.stringify(errors.slice(0, 10))}`);

    // Pomiar, nie asercja sukcesu — wynikiem jest MIEJSCE zatrzymania, nie „przeszło".
    expect(przebieg.length, 'wykonano co najmniej jedno podejście').toBeGreaterThan(0);
  });

  // ── ETAP-5 · drugi zamontowany ekran: /approval ────────────────────────────
  test('ETAP-5 · /approval renderuje sekcję approval i utrwala zapis', async ({ page }) => {
    const errors: string[] = [];
    collectPageErrors(page, errors);
    acceptDialogs(page);
    await signIn(page, baseURL, L, 'harness');

    await gotoAndRender(
      page,
      `/${L}/pipeline/${etap.projectId}/approval`,
      'stage-dept-sections-approval',
    );
    await shot(page, 'etap-08-approval-section');

    const przed = await requiredStageFields(etap.projectId, 'approval');
    console.log(`[STAN ETAP-5] wymagane pola approval przed: ${JSON.stringify(przed)}`);

    const widoczne: string[] = [];
    for (const f of przed) {
      const editor = page.locator(`[data-field="${f.field}"]`).first();
      const ok = (await editor.count()) > 0;
      if (ok) widoczne.push(f.field);
      console.log(`[DOWÓD ETAP-5] pole ${f.dept}/${f.field} obecne na /approval: ${ok}`);
    }

    // Zapis JEDNEGO pola: dowodem jest wiersz w bazie, nie render.
    const znacznik = `E2E-ART-${Date.now().toString().slice(-6)}`;
    const outcome = await fillStageField(page, 'article_number', znacznik);
    console.log(`[DOWÓD ETAP-5] zapis „article_number" → ${outcome}`);
    const [po] = await sql<{ wartosc: string | null }>(
      `select p.article_number as wartosc
         from public.product p
         join public.npd_projects np on np.org_id = p.org_id and np.product_code = p.product_code
        where np.id = $1::uuid`,
      [etap.projectId],
    );
    console.log(`[DOWÓD ETAP-5] public.product.article_number po zapisie: ${JSON.stringify(po)}`);
    console.log(`[ETAP-5] błędy strony: ${JSON.stringify(errors.slice(0, 6))}`);

    expect(widoczne.length, 'wszystkie wymagane pola etapu approval są na ekranie').toBe(przed.length);
    expect(po?.wartosc, 'wartość z ekranu /approval utrwalona w źródle bramki').toBe(znacznik);
  });
});
