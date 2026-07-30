/**
 * MODUŁ JAKOŚCI — blokada partii → dyspozycja → zwolnienie, NCR → zamknięcie,
 * odchylenie CCP → rozstrzygnięcie. Odcinek dotąd NIE przechodzony klikaniem
 * (istniejące `quality-*-parity-evidence.spec.ts` robią wyłącznie zrzuty ekranu
 * i `skip` bez PLAYWRIGHT_BASE_URL — nie sprawdzają ŻADNEGO wiersza w bazie).
 *
 * PYTANIE BADAWCZE: czy JEDNA osoba przechodzi krytyczną ścieżkę jakości od
 * początku do końca, mimo że interfejs obiecuje podwójny podpis / rozdział
 * obowiązków (V-QA-NCR-006, V-QA-HOLD-006)?
 *
 * DOWÓD = AKCJA W UI + TRWAŁY WIERSZ W POSTGRESIE. Po każdej akcji spec czyta
 * stan wprost z bazy rolą `monopilot` (BYPASSRLS — `pg_roles.rolbypassrls`),
 * więc kontekst org nie jest potrzebny; gdyby był, to `app.set_org_context`,
 * NIGDY surowy GUC `app.current_org_id`.
 *
 * T1  krytyczny NCR: utworzenie → ostrzeżenie „dual signature required" →
 *     zamknięcie przez TĘ SAMĄ osobę → e_sign_log
 * T2  krytyczna blokada: utworzenie → nota SoD „releaser must differ from the
 *     creator" → zwolnienie przez TĘ SAMĄ osobę → e_sign_log
 * T3  odchylenie CCP: CCP → odczyt poza limitem → automatyczny NCR/blokada →
 *     rozstrzygnięcie z podpisem → e_sign_log
 *
 * Uruchamiać WYŁĄCZNIE przez `bash scripts/e2e-local.sh` (asercja 127.0.0.1).
 */
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Locator, type Page } from '@playwright/test';
import pg from 'pg';

import { signIn } from './_shared/parity-login';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const artifactDir = path.resolve(__dirname, 'artifacts/quality-hold-ncr-ccp-signoff-chain');
const L = 'en';

/** Serwer DEV kompiluje trasę przy pierwszym wejściu — render dostaje własny, długi budżet. */
const COMPILE = 180_000;

/** apps/web/e2e/_helpers/shell-parity.ts — użytkownik i organizacja harnessu. */
const HARNESS_UID = '11111111-1111-4111-8111-111111111111';
const ORG_ID = '00000000-0000-0000-0000-000000000002';

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

/** Playwright DOMYŚLNIE ODRZUCA confirm() — bez tego przejście statusu to cichy no-op. */
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

const stamp = `${Date.now()}`.slice(-8);

test.describe.configure({ mode: 'serial' });

test.describe('Jakość: blokada / NCR / odchylenie CCP — podpisy i trwały stan', () => {
  test.skip(!baseURL, 'PLAYWRIGHT_BASE_URL unset — uruchom przez scripts/e2e-local.sh');
  test.skip(!ownerConnectionString, 'DATABASE_URL_OWNER unset — brak dostępu do bazy dowodowej');

  test('T1 — jedna osoba tworzy I zamyka KRYTYCZNY NCR mimo obietnicy podwójnego podpisu', async ({ page }) => {
    test.setTimeout(300_000);
    const errors: string[] = [];
    collectPageErrors(page, errors);
    acceptDialogs(page);
    await signIn(page, baseURL!, L, 'harness');

    // ── Krok 1: lista NCR + modal tworzenia ────────────────────────────────
    await page.goto(url(`/${L}/quality/ncrs`), { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('ncr-create-open')).toBeVisible({ timeout: COMPILE });
    await page.getByTestId('ncr-create-open').click();
    await expect(page.getByTestId('ncr-create-form')).toBeVisible({ timeout: 30_000 });

    // ── Krok 2: severity = critical ⇒ interfejs OBIECUJE podwójny podpis ──
    await page.getByTestId('ncr-create-severity-critical').click();
    const createWarning = page.getByTestId('ncr-create-sod-warning');
    await expect(createWarning).toBeVisible();
    const createWarningText = (await createWarning.innerText()).trim();
    expect(createWarningText).toMatch(/dual signature/i);

    const ncrTitle = `E2E krytyczny NCR ${stamp}`;
    await page.getByTestId('ncr-create-title').fill(ncrTitle);
    await page
      .getByTestId('ncr-create-description')
      .fill('Sprawdzenie, czy jedna osoba zamyka krytyczna niezgodnosc od poczatku do konca.');
    await shot(page, 'T1-01-create-critical');
    await page.getByTestId('ncr-create-submit').click();

    // ── DOWÓD 1: wiersz w bazie ────────────────────────────────────────────
    await expect
      .poll(
        async () =>
          (await sql<{ n: string }>(
            `select count(*)::text as n from public.ncr_reports where org_id = $1::uuid and title = $2`,
            [ORG_ID, ncrTitle],
          ))[0]?.n,
        { timeout: 60_000, message: 'NCR nie pojawił się w public.ncr_reports' },
      )
      .toBe('1');

    const created = (
      await sql<{
        id: string;
        ncr_number: string;
        severity: string;
        status: string;
        detected_by: string | null;
      }>(
        `select id::text, ncr_number, severity, status, detected_by::text
           from public.ncr_reports
          where org_id = $1::uuid and title = $2`,
        [ORG_ID, ncrTitle],
      )
    )[0]!;
    expect(created.severity).toBe('critical');
    expect(created.status).toBe('open');
    // Kto ZGŁOSIŁ niezgodność — potrzebne, żeby porównać z tym, kto ją zamknie.
    expect(created.detected_by).toBe(HARNESS_UID);
    console.log(`[T1] utworzony NCR ${created.ncr_number} (${created.id}) detected_by=${created.detected_by}`);

    // ── Krok 3: szczegóły — nota regulacyjna o podwójnym podpisie ──────────
    await page.goto(url(`/${L}/quality/ncrs/${created.id}`), { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('ncr-detail-status')).toBeVisible({ timeout: COMPILE });
    const detailNote = page.getByTestId('ncr-detail-dualsign-note');
    await expect(detailNote).toBeVisible();
    const detailNoteText = (await detailNote.innerText()).trim();
    expect(detailNoteText).toMatch(/dual sign/i);
    await shot(page, 'T1-02-detail-dualsign-note');

    // ── Krok 3a: „Zamknij" pojawia się dopiero w statusie `investigating`.
    //   Zapisujemy dochodzenie z PUSTĄ przyczyną źródłową. Zapis częściowy MA
    //   przechodzić (dochodzenie się prowadzi etapami), ale gwiazdka przy
    //   „Root cause" musi coś znaczyć: po NAPRAWIE (Z-06) przycisk „Zamknij"
    //   nie pojawia się, dopóki przyczyna nie jest zapisana — V-QA-NCR-005.
    await expect(page.getByTestId('ncr-detail-close-open')).toHaveCount(0);
    await expect(page.getByTestId('ncr-investigation-rootcause')).toHaveValue('');
    await page.getByTestId('ncr-investigation-save').click();
    await expect(page.getByTestId('ncr-investigation-saved')).toBeVisible({ timeout: 30_000 });

    const afterInvestigation = (
      await sql<{ status: string; root_cause: string | null; root_cause_category: string | null }>(
        `select status, root_cause, root_cause_category
           from public.ncr_reports where org_id = $1::uuid and id = $2::uuid`,
        [ORG_ID, created.id],
      )
    )[0]!;
    console.log(`[T1] po zapisie dochodzenia (puste pola): ${JSON.stringify(afterInvestigation)}`);
    expect(afterInvestigation.status).toBe('investigating');
    // Kierunek negatywny: przyczyna pusta → zamknięcie niedostępne.
    expect((afterInvestigation.root_cause ?? '').trim()).toBe('');
    await expect(page.getByTestId('ncr-detail-close-open')).toHaveCount(0);
    await shot(page, 'T1-02b-close-blocked-without-root-cause');

    // ── Krok 3b: zapisujemy przyczynę źródłową — dopiero teraz wolno zamykać.
    await page.getByTestId('ncr-investigation-rootcause').fill('Szczelina sita przepuscila fragment.');
    await page.getByTestId('ncr-investigation-save').click();
    await expect
      .poll(
        async () =>
          (await sql<{ root_cause: string | null }>(
            `select root_cause from public.ncr_reports where org_id = $1::uuid and id = $2::uuid`,
            [ORG_ID, created.id],
          ))[0]?.root_cause,
        { timeout: 30_000, message: 'przyczyna źródłowa nie została zapisana' },
      )
      .toBe('Szczelina sita przepuscila fragment.');

    // ── Krok 4: modal zamknięcia — ostrzeżenie „obaj muszą podpisać" ───────
    await expect(page.getByTestId('ncr-detail-close-open')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('ncr-detail-close-open').click();
    await expect(page.getByTestId('ncr-close-form')).toBeVisible({ timeout: 30_000 });
    const closeWarning = page.getByTestId('ncr-close-dualsign-warning');
    await expect(closeWarning).toBeVisible();
    const closeWarningText = (await closeWarning.innerText()).trim();
    expect(closeWarningText).toMatch(/dual signature required/i);
    // Interfejs nie oferuje ŻADNEGO pola drugiego podpisującego — tylko jedno hasło.
    const passwordInputs = page.getByTestId('ncr-close-form').locator('input[type="password"]');
    expect(await passwordInputs.count()).toBe(1);
    await shot(page, 'T1-03-close-modal-dualsign-warning');

    await page.getByTestId('ncr-close-resolution').fill('Zamkniete jednym podpisem w tescie E2E.');
    await page.getByTestId('ncr-close-password').fill('e2e-local');
    await page.getByTestId('ncr-close-submit').click();

    // ── DOWÓD 2: NCR zamknięty przez TĘ SAMĄ osobę ─────────────────────────
    await expect
      .poll(
        async () =>
          (await sql<{ status: string }>(
            `select status from public.ncr_reports where org_id = $1::uuid and id = $2::uuid`,
            [ORG_ID, created.id],
          ))[0]?.status,
        { timeout: 60_000, message: `NCR ${created.ncr_number} nie zmienił statusu na closed` },
      )
      .toBe('closed');

    const closed = (
      await sql<{
        status: string;
        closed_by: string | null;
        detected_by: string | null;
        closure_signature_hash: string | null;
        root_cause: string | null;
        capa_record_id: string | null;
      }>(
        `select status, closed_by::text, detected_by::text, closure_signature_hash,
                root_cause, capa_record_id::text
           from public.ncr_reports where org_id = $1::uuid and id = $2::uuid`,
        [ORG_ID, created.id],
      )
    )[0]!;
    console.log(`[T1] po zamknięciu: ${JSON.stringify(closed)}`);
    expect(closed.closure_signature_hash).not.toBeNull();

    // ── DOWÓD 3: e_sign_log — ILE podpisów naprawdę powstało ───────────────
    const signatures = await sql<{ signer_user_id: string; intent: string; created_at: string }>(
      `select signer_user_id::text, intent, created_at::text
         from public.e_sign_log
        where org_id = $1::uuid and intent = 'qa.ncr.close' and subject_hash = $2
        order by created_at`,
      [ORG_ID, closed.closure_signature_hash],
    );
    console.log(`[T1] e_sign_log dla tego zamknięcia: ${JSON.stringify(signatures)}`);

    // WŁAŚCIWA TEZA: jeden użytkownik zgłosił i zamknął krytyczny NCR, a rejestr
    // podpisów zawiera DOKŁADNIE JEDEN podpis — mimo dwóch ostrzeżeń w UI.
    expect(signatures).toHaveLength(1);
    expect(signatures[0]!.signer_user_id).toBe(HARNESS_UID);
    expect(closed.closed_by).toBe(closed.detected_by);
    expect(closed.closed_by).toBe(HARNESS_UID);

    await shot(page, 'T1-04-closed');
    console.log(`[T1] BŁĘDY STRONY: ${errors.length === 0 ? 'brak' : JSON.stringify(errors)}`);
  });

  test('T2 — ta sama osoba tworzy I zwalnia KRYTYCZNĄ blokadę mimo noty o rozdziale obowiązków', async ({ page }) => {
    test.setTimeout(300_000);
    const errors: string[] = [];
    collectPageErrors(page, errors);
    acceptDialogs(page);
    await signIn(page, baseURL!, L, 'harness');

    // ── Krok 1: modal tworzenia blokady ───────────────────────────────────
    await page.goto(url(`/${L}/quality/holds`), { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('holds-create-open')).toBeVisible({ timeout: COMPILE });
    await page.getByTestId('holds-create-open').click();
    await expect(page.getByTestId('hold-create-form')).toBeVisible({ timeout: 30_000 });

    // Wyszukiwarka LP (domyślny typ referencji) — wybieramy nośnik po numerze z bazy.
    const lp = (
      await sql<{ id: string; lp_number: string }>(
        `select id::text, lp_number
           from public.license_plates
          where org_id = $1::uuid and status = 'available'
          order by lp_number
          limit 1`,
        [ORG_ID],
      )
    )[0];
    expect(lp, 'brak wolnego license_plate do zablokowania — stan bazy, nie defekt').toBeTruthy();

    await page.getByTestId('hold-create-lp-search').fill(lp!.lp_number);
    const lpResult = page.getByTestId(`hold-create-lp-result-${lp!.id}`);
    await expect(lpResult).toBeVisible({ timeout: 30_000 });
    await lpResult.click();
    await expect(page.getByTestId('hold-create-lp-chip')).toBeVisible();

    const reason = `E2E krytyczna blokada ${stamp}`;
    await page.getByTestId('hold-create-reason').fill(reason);

    // ── Krok 2: priorytet critical ⇒ interfejs OBIECUJE rozdział obowiązków ─
    await page.getByTestId('hold-create-priority-critical').click();
    const sodCreate = page.getByTestId('hold-create-sod-warning');
    await expect(sodCreate).toBeVisible();
    const sodCreateText = (await sodCreate.innerText()).trim();
    expect(sodCreateText).toMatch(/different users|segregation of duties/i);
    await shot(page, 'T2-01-create-critical-hold');
    await page.getByTestId('hold-create-submit').click();

    // ── DOWÓD 1: blokada w bazie ──────────────────────────────────────────
    await expect
      .poll(
        async () =>
          (await sql<{ n: string }>(
            `select count(*)::text as n from public.quality_holds where org_id = $1::uuid and reason_free_text = $2`,
            [ORG_ID, reason],
          ))[0]?.n,
        { timeout: 60_000, message: 'blokada nie pojawiła się w public.quality_holds' },
      )
      .toBe('1');

    const hold = (
      await sql<{
        id: string;
        hold_number: string;
        hold_status: string;
        priority: string;
        created_by: string | null;
      }>(
        `select id::text, hold_number, hold_status, priority, created_by::text
           from public.quality_holds where org_id = $1::uuid and reason_free_text = $2`,
        [ORG_ID, reason],
      )
    )[0]!;
    expect(hold.priority).toBe('critical');
    expect(hold.created_by).toBe(HARNESS_UID);
    console.log(`[T2] utworzona blokada ${hold.hold_number} (${hold.id}) created_by=${hold.created_by}`);

    // ── Krok 3: szczegóły — czy przycisk „Release" jest w ogóle pokazany
    //           TWÓRCY tej samej blokady? ──────────────────────────────────
    await page.goto(url(`/${L}/quality/holds/${hold.id}`), { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('hold-detail-status')).toBeVisible({ timeout: COMPILE });
    const releaseOpen = page.getByTestId('hold-detail-release-open');
    const noRelease = page.getByTestId('hold-detail-no-release');
    await expect(releaseOpen.or(noRelease)).toBeVisible({ timeout: 30_000 });
    const releaseOfferedToCreator = await releaseOpen.isVisible();
    console.log(`[T2] przycisk zwolnienia widoczny dla TWÓRCY blokady: ${releaseOfferedToCreator}`);
    await shot(page, 'T2-02-detail-actions');

    expect(
      releaseOfferedToCreator,
      'UI ukrył przycisk zwolnienia twórcy — wtedy SoD byłoby egzekwowane choćby wizualnie',
    ).toBe(true);

    // ── Krok 4: zwolnienie z dyspozycją, ten sam użytkownik ───────────────
    await releaseOpen.click();
    await expect(page.getByTestId('hold-release-form')).toBeVisible({ timeout: 30_000 });
    const sodNote = page.getByTestId('hold-release-sod-note');
    await expect(sodNote).toBeVisible();
    const sodNoteText = (await sodNote.innerText()).trim();
    expect(sodNoteText).toMatch(/other than the creator/i);
    await shot(page, 'T2-03-release-modal-sod-note');

    await pickSelect(page, page.getByTestId('hold-release-disposition'), /^Release as-is$/);
    await page.getByTestId('hold-release-reason').fill('Zwolnione przez twórcę blokady w tescie E2E.');
    await page.getByTestId('hold-release-password').fill('e2e-local');
    await page.getByTestId('hold-release-submit').click();

    // ── DOWÓD 2: blokada zwolniona przez TĘ SAMĄ osobę ────────────────────
    await expect
      .poll(
        async () =>
          (await sql<{ hold_status: string }>(
            `select hold_status from public.quality_holds where org_id = $1::uuid and id = $2::uuid`,
            [ORG_ID, hold.id],
          ))[0]?.hold_status,
        { timeout: 60_000, message: `blokada ${hold.hold_number} nie zmieniła statusu na released` },
      )
      .toBe('released');

    const released = (
      await sql<{
        hold_status: string;
        disposition: string | null;
        created_by: string | null;
        released_by: string | null;
        release_signature_hash: string | null;
      }>(
        `select hold_status, disposition, created_by::text, released_by::text, release_signature_hash
           from public.quality_holds where org_id = $1::uuid and id = $2::uuid`,
        [ORG_ID, hold.id],
      )
    )[0]!;
    console.log(`[T2] po zwolnieniu: ${JSON.stringify(released)}`);
    expect(released.disposition).not.toBeNull();
    expect(released.release_signature_hash).not.toBeNull();

    const signatures = await sql<{ signer_user_id: string; intent: string }>(
      `select signer_user_id::text, intent
         from public.e_sign_log
        where org_id = $1::uuid and intent = 'qa.hold.release' and subject_hash = $2
        order by created_at`,
      [ORG_ID, released.release_signature_hash],
    );
    console.log(`[T2] e_sign_log dla tego zwolnienia: ${JSON.stringify(signatures)}`);

    expect(signatures).toHaveLength(1);
    expect(signatures[0]!.signer_user_id).toBe(HARNESS_UID);
    expect(released.released_by).toBe(released.created_by);

    await shot(page, 'T2-04-released');
    console.log(`[T2] BŁĘDY STRONY: ${errors.length === 0 ? 'brak' : JSON.stringify(errors)}`);
  });

  test('T3 — odchylenie CCP: odczyt poza limitem → automatyka → rozstrzygnięcie jednym podpisem', async ({ page }) => {
    test.setTimeout(360_000);
    const errors: string[] = [];
    collectPageErrors(page, errors);
    acceptDialogs(page);
    await signIn(page, baseURL!, L, 'harness');

    // ── Krok 1: utworzenie CCP z górnym limitem krytycznym ────────────────
    const ccpCode = `E2E${stamp}`;
    await page.goto(url(`/${L}/quality/ccp-monitoring`), { waitUntil: 'domcontentloaded' });
    const createOpen = page.getByTestId('ccp-create-open').or(page.getByTestId('ccp-board-empty-cta'));
    await expect(createOpen.first()).toBeVisible({ timeout: COMPILE });
    await createOpen.first().click();
    await expect(page.getByTestId('ccp-create-form')).toBeVisible({ timeout: 30_000 });

    await page.getByTestId('ccp-create-code').fill(ccpCode);
    await page.getByTestId('ccp-create-name').fill(`E2E chłodzenie ${stamp}`);
    await page.getByTestId('ccp-create-step').fill('Chilling');
    await pickSelect(page, page.getByTestId('ccp-create-hazard'), /^Biological$/);
    await page.getByTestId('ccp-create-limit-max').fill('4');
    await page.getByTestId('ccp-create-unit').fill('C');
    await page.getByTestId('ccp-create-frequency').fill('every batch');
    await page.getByTestId('ccp-create-corrective').fill('Zatrzymac linie i schlodzic ponownie.');
    await shot(page, 'T3-01-create-ccp');
    await page.getByTestId('ccp-create-submit').click();

    await expect
      .poll(
        async () =>
          (await sql<{ n: string }>(
            `select count(*)::text as n from public.haccp_ccps where org_id = $1::uuid and ccp_code = $2`,
            [ORG_ID, ccpCode],
          ))[0]?.n,
        { timeout: 60_000, message: 'CCP nie pojawił się w public.haccp_ccps' },
      )
      .toBe('1');

    const ccp = (
      await sql<{ id: string; critical_limit_max: string | null; is_active: boolean }>(
        `select id::text, critical_limit_max::text, is_active
           from public.haccp_ccps where org_id = $1::uuid and ccp_code = $2`,
        [ORG_ID, ccpCode],
      )
    )[0]!;
    console.log(`[T3] utworzony CCP ${ccpCode} (${ccp.id}) max=${ccp.critical_limit_max} active=${ccp.is_active}`);

    // ── Krok 2: odczyt POZA limitem (9 > 4) ───────────────────────────────
    await page.goto(url(`/${L}/quality/ccp-monitoring`), { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('ccp-record-open').first()).toBeVisible({ timeout: COMPILE });
    await page.getByTestId('ccp-record-open').first().click();
    await expect(page.getByTestId('ccp-record-form')).toBeVisible({ timeout: 30_000 });
    // Formularz odczytu nie ma ŻADNEGO pola zlecenia produkcyjnego — jedyna lista
    // wyboru to picker CCP. To przesądza, że `woId` nigdy nie dotrze do akcji,
    // a więc automatyczna blokada wyrobu nie ma jak powstać z tego ekranu.
    const recordForm = page.getByTestId('ccp-record-form');
    expect(await recordForm.getByRole('combobox').count()).toBe(1);
    expect(await recordForm.getByText(/work order/i).count()).toBe(0);
    await pickSelect(page, page.getByTestId('ccp-record-ccp-select'), new RegExp(`^${ccpCode} — `));
    await page.getByTestId('ccp-record-value').fill('9');
    await page.getByTestId('ccp-record-note').fill('Odczyt poza limitem w tescie E2E.');
    await page.getByTestId('ccp-record-submit').click();

    // ── DOWÓD 1: log monitoringu + odchylenie ─────────────────────────────
    await expect
      .poll(
        async () =>
          (await sql<{ n: string }>(
            `select count(*)::text as n
               from public.haccp_monitoring_log
              where org_id = $1::uuid and ccp_id = $2::uuid`,
            [ORG_ID, ccp.id],
          ))[0]?.n,
        { timeout: 60_000, message: 'odczyt nie trafił do public.haccp_monitoring_log' },
      )
      .toBe('1');

    const log = (
      await sql<{ id: string; within_limits: boolean; breach_ncr_id: string | null; measured_value: string }>(
        `select id::text, within_limits, breach_ncr_id::text, measured_value::text
           from public.haccp_monitoring_log where org_id = $1::uuid and ccp_id = $2::uuid`,
        [ORG_ID, ccp.id],
      )
    )[0]!;
    console.log(`[T3] log monitoringu: ${JSON.stringify(log)}`);
    expect(log.within_limits).toBe(false);

    const deviations = await sql<{ id: string; status: string; hold_id: string | null; action_taken: string | null }>(
      `select id::text, status, hold_id::text, action_taken
         from public.ccp_deviations where org_id = $1::uuid and ccp_id = $2::uuid`,
      [ORG_ID, ccp.id],
    );
    console.log(`[T3] odchylenia: ${JSON.stringify(deviations)}`);
    expect(deviations).toHaveLength(1);
    const deviation = deviations[0]!;
    expect(deviation.status).toBe('open');

    // Automatyczny NCR o powadze critical (haccp-actions.ts — severity 'critical').
    const autoNcr = log.breach_ncr_id
      ? (
          await sql<{ severity: string; status: string; site_id: string | null; detected_by: string | null }>(
            `select severity, status, site_id::text, detected_by::text
               from public.ncr_reports where org_id = $1::uuid and id = $2::uuid`,
            [ORG_ID, log.breach_ncr_id],
          )
        )[0]
      : null;
    console.log(`[T3] automatyczny NCR z przekroczenia: ${JSON.stringify(autoNcr)}`);

    // Czy przekroczenie CCP FAKTYCZNIE zablokowało jakikolwiek produkt?
    console.log(`[T3] hold_id odchylenia = ${deviation.hold_id ?? 'BRAK'} (action_taken=${deviation.action_taken})`);

    // ── Krok 3: rozstrzygnięcie odchylenia jednym podpisem ────────────────
    await page.goto(url(`/${L}/quality/ccp-deviations`), { waitUntil: 'domcontentloaded' });
    const resolveOpen = page.getByTestId(`deviation-resolve-open-${deviation.id}`);
    await expect(resolveOpen).toBeVisible({ timeout: COMPILE });
    await shot(page, 'T3-02-deviation-list');
    await resolveOpen.click();
    await expect(page.getByTestId('deviation-resolve-form')).toBeVisible({ timeout: 30_000 });
    // Jedno pole hasła — brak jakiegokolwiek pola drugiego podpisującego.
    expect(await page.getByTestId('deviation-resolve-form').locator('input[type="password"]').count()).toBe(1);

    await page.getByTestId('deviation-resolve-action').fill('Ponowne schlodzenie i weryfikacja termometru.');
    await pickSelect(page, page.getByTestId('deviation-resolve-disposition'), /^Corrected/);
    await page.getByTestId('deviation-resolve-password').fill('e2e-local');
    await shot(page, 'T3-03-resolve-modal');
    await page.getByTestId('deviation-resolve-submit').click();

    // ── DOWÓD 2: odchylenie rozstrzygnięte + podpis ───────────────────────
    await expect
      .poll(
        async () =>
          (await sql<{ status: string }>(
            `select status from public.ccp_deviations where org_id = $1::uuid and id = $2::uuid`,
            [ORG_ID, deviation.id],
          ))[0]?.status,
        { timeout: 60_000, message: 'odchylenie CCP nie zmieniło statusu na resolved' },
      )
      .toBe('resolved');

    const resolved = (
      await sql<{
        status: string;
        disposition: string | null;
        closed_by: string | null;
        opened_by: string | null;
        esign_ref: string | null;
      }>(
        `select status, disposition, closed_by::text, opened_by::text, esign_ref::text
           from public.ccp_deviations where org_id = $1::uuid and id = $2::uuid`,
        [ORG_ID, deviation.id],
      )
    )[0]!;
    console.log(`[T3] po rozstrzygnięciu: ${JSON.stringify(resolved)}`);
    expect(resolved.disposition).toBe('corrected');
    expect(resolved.esign_ref).not.toBeNull();

    const signatures = await sql<{ signer_user_id: string; intent: string }>(
      `select signer_user_id::text, intent
         from public.e_sign_log
        where org_id = $1::uuid and signature_id = $2::uuid`,
      [ORG_ID, resolved.esign_ref],
    );
    console.log(`[T3] e_sign_log dla rozstrzygnięcia: ${JSON.stringify(signatures)}`);
    expect(signatures).toHaveLength(1);
    expect(signatures[0]!.intent).toBe('qa.haccp.ccp.deviation');
    expect(signatures[0]!.signer_user_id).toBe(HARNESS_UID);
    expect(resolved.closed_by).toBe(resolved.opened_by);

    await shot(page, 'T3-04-resolved');
    console.log(`[T3] BŁĘDY STRONY: ${errors.length === 0 ? 'brak' : JSON.stringify(errors)}`);
  });

  /**
   * T4 — kontrola POZYTYWNA/NEGATYWNA jedynego pola polityki, które dla tych
   * trzech typów zostało edytowalne: „rola pierwszego podpisującego".
   *
   * Liczba podpisów jest zablokowana na 1, przełącznik „ta sama osoba" i rola
   * drugiego podpisującego są wyłączone (oczekiwane — kod nie ma ścieżki drugiego
   * podpisu). Jeśli rola pierwszego podpisującego też nic nie robi, cały ekran
   * Ustawienia → Polityki podpisu jest dla jakości dekoracją.
   *
   * Test przywraca politykę do stanu wyjściowego (blok `finally`).
   */
  test('T4 — czy rola pierwszego podpisującego JEST egzekwowana przy zamykaniu NCR', async ({ page }) => {
    test.setTimeout(300_000);
    const errors: string[] = [];
    collectPageErrors(page, errors);
    acceptDialogs(page);
    await signIn(page, baseURL!, L, 'harness');

    const before = (
      await sql<{ required_signatures: number; first_signer_role_id: string | null; allow_same_user: boolean }>(
        `select required_signatures, first_signer_role_id::text, allow_same_user
           from public.signoff_policies where org_id = $1::uuid and signoff_type = 'qa.ncr.close'`,
        [ORG_ID],
      )
    )[0]!;
    console.log(`[T4] polityka qa.ncr.close PRZED: ${JSON.stringify(before)}`);

    // Rola, której użytkownik harnessu NIE posiada (harness ma rolę `admin`).
    const foreignRole = (
      await sql<{ id: string; name: string }>(
        `select id::text, name from public.roles where org_id = $1::uuid and code = 'test_second_signer'`,
        [ORG_ID],
      )
    )[0];
    expect(foreignRole, 'brak roli test_second_signer — uruchom seed person').toBeTruthy();

    const harnessHasForeignRole = (
      await sql<{ n: string }>(
        `select count(*)::text as n
           from public.user_roles ur
          where ur.org_id = $1::uuid and ur.user_id = $2::uuid and ur.role_id = $3::uuid`,
        [ORG_ID, HARNESS_UID, foreignRole!.id],
      )
    )[0]!.n;
    expect(harnessHasForeignRole).toBe('0');

    try {
      // ── Krok 1: przez UI Ustawienia → Polityki podpisu ───────────────────
      await page.goto(url(`/${L}/settings/signoff`), { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('settings-signoff-screen')).toBeVisible({ timeout: COMPILE });
      const row = page.getByTestId('signoff-row-qa.ncr.close');
      await expect(row).toBeVisible({ timeout: 30_000 });
      await page.getByTestId('signoff-edit-qa.ncr.close').click();

      // Potwierdzenie „to jest oczekiwane": dwa podpisy niedostępne dla tego typu.
      const secondSigner = row.getByLabel('Second signer role');
      const sameUser = row.getByLabel('Allow same user');
      await expect(secondSigner).toBeDisabled();
      await expect(sameUser).toBeDisabled();
      await shot(page, 'T4-01-policy-editor-two-signatures-locked');

      await pickSelect(page, row.getByLabel('First signer role'), new RegExp(`^${foreignRole!.name}$`));
      await row.getByRole('button', { name: /^Save$/ }).click();

      await expect
        .poll(
          async () =>
            (await sql<{ first_signer_role_id: string | null }>(
              `select first_signer_role_id::text
                 from public.signoff_policies where org_id = $1::uuid and signoff_type = 'qa.ncr.close'`,
              [ORG_ID],
            ))[0]?.first_signer_role_id,
          { timeout: 30_000, message: 'polityka nie zapisała roli pierwszego podpisującego' },
        )
        .toBe(foreignRole!.id);
      console.log(`[T4] polityka zapisana: first_signer_role_id=${foreignRole!.id} (${foreignRole!.name})`);

      // ── Krok 2: nowy krytyczny NCR i próba zamknięcia przez osobę BEZ roli ─
      const ncrTitle = `E2E NCR polityka podpisu ${stamp}`;
      await page.goto(url(`/${L}/quality/ncrs`), { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('ncr-create-open')).toBeVisible({ timeout: COMPILE });
      await page.getByTestId('ncr-create-open').click();
      await expect(page.getByTestId('ncr-create-form')).toBeVisible({ timeout: 30_000 });
      await page.getByTestId('ncr-create-severity-critical').click();
      await page.getByTestId('ncr-create-title').fill(ncrTitle);
      await page
        .getByTestId('ncr-create-description')
        .fill('Sprawdzenie, czy rola pierwszego podpisujacego blokuje zamkniecie NCR.');
      await page.getByTestId('ncr-create-submit').click();

      await expect
        .poll(
          async () =>
            (await sql<{ n: string }>(
              `select count(*)::text as n from public.ncr_reports where org_id = $1::uuid and title = $2`,
              [ORG_ID, ncrTitle],
            ))[0]?.n,
          { timeout: 60_000, message: 'NCR (T4) nie pojawił się w bazie' },
        )
        .toBe('1');
      const ncrId = (
        await sql<{ id: string }>(
          `select id::text from public.ncr_reports where org_id = $1::uuid and title = $2`,
          [ORG_ID, ncrTitle],
        )
      )[0]!.id;

      await page.goto(url(`/${L}/quality/ncrs/${ncrId}`), { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('ncr-detail-status')).toBeVisible({ timeout: COMPILE });
      // Przyczyna źródłowa jest wymagana do zamknięcia (V-QA-NCR-005) — wypełniamy
      // ją, żeby ten test badał WYŁĄCZNIE bramkę roli podpisującego.
      await page.getByTestId('ncr-investigation-rootcause').fill('Przyczyna zapisana dla testu roli.');
      await page.getByTestId('ncr-investigation-save').click();
      await expect(page.getByTestId('ncr-investigation-saved')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('ncr-detail-close-open')).toBeVisible({ timeout: 30_000 });
      await page.getByTestId('ncr-detail-close-open').click();
      await expect(page.getByTestId('ncr-close-form')).toBeVisible({ timeout: 30_000 });
      await page.getByTestId('ncr-close-resolution').fill('Proba zamkniecia bez wymaganej roli.');
      await page.getByTestId('ncr-close-password').fill('e2e-local');
      // Znacznik czasu z BAZY (nie z Node) — okno liczenia podpisów musi być
      // węższe niż wcześniejsze testy tej samej suity, inaczej złapie ich wiersze.
      const beforeClick = (await sql<{ ts: string }>('select now()::text as ts'))[0]!.ts;
      await page.getByTestId('ncr-close-submit').click();

      // ── DOWÓD: czy zamknięcie zostało ODRZUCONE i czy stan bazy NIE drgnął ─
      const closeError = page.getByTestId('ncr-close-error');
      const errorVisible = await closeError
        .waitFor({ state: 'visible', timeout: 20_000 })
        .then(() => true)
        .catch(() => false);
      const errorText = errorVisible ? (await closeError.innerText()).trim() : '(brak komunikatu)';
      console.log(`[T4] komunikat w modalu zamknięcia: ${errorText}`);
      await shot(page, 'T4-02-close-attempt-without-role');

      const after = (
        await sql<{ status: string; closed_by: string | null; closure_signature_hash: string | null }>(
          `select status, closed_by::text, closure_signature_hash
             from public.ncr_reports where org_id = $1::uuid and id = $2::uuid`,
          [ORG_ID, ncrId],
        )
      )[0]!;
      const esignRows = await sql<{ n: string }>(
        `select count(*)::text as n
           from public.e_sign_log
          where org_id = $1::uuid and intent = 'qa.ncr.close' and created_at > $2::timestamptz`,
        [ORG_ID, beforeClick],
      );
      console.log(`[T4] NCR po próbie zamknięcia: ${JSON.stringify(after)}`);
      console.log(`[T4] podpisy qa.ncr.close zapisane PO kliknięciu: ${esignRows[0]!.n}`);

      // Gate DZIAŁA ⇒ NCR pozostaje otwarty i nie powstał żaden podpis.
      expect(after.status).toBe('investigating');
      expect(after.closure_signature_hash).toBeNull();
      expect(esignRows[0]!.n).toBe('0');
      expect(errorText).not.toBe('(brak komunikatu)');
    } finally {
      // Przywrócenie polityki do stanu wyjściowego (spec nie zostawia śladu w konfiguracji).
      await sql(
        `update public.signoff_policies
            set first_signer_role_id = $2::uuid,
                required_signatures = $3::int,
                allow_same_user = $4::boolean,
                updated_at = now()
          where org_id = $1::uuid and signoff_type = 'qa.ncr.close'`,
        [ORG_ID, before.first_signer_role_id, before.required_signatures, before.allow_same_user],
      );
      const restored = (
        await sql<{ first_signer_role_id: string | null }>(
          `select first_signer_role_id::text
             from public.signoff_policies where org_id = $1::uuid and signoff_type = 'qa.ncr.close'`,
          [ORG_ID],
        )
      )[0]!;
      console.log(`[T4] polityka PRZYWRÓCONA: ${JSON.stringify(restored)}`);
    }

    console.log(`[T4] BŁĘDY STRONY: ${errors.length === 0 ? 'brak' : JSON.stringify(errors)}`);
  });

  /**
   * T5 — dyspozycja „Partial release" (częściowe zwolnienie).
   *
   * Modal zwolnienia nie ma ŻADNEGO pola ilości, więc sprawdzamy, co system
   * naprawdę robi z „częściowym" zwolnieniem: ile kilogramów zapisuje jako
   * zwolnione i w jakim stanie zostawia nośnik.
   *
   * Przy okazji kontrola POZYTYWNA: czy założenie blokady w ogóle zmienia stan
   * nośnika (qa_status = 'on_hold').
   */
  test('T5 — dyspozycja „częściowe zwolnienie": ile naprawdę zostaje zwolnione', async ({ page }) => {
    test.setTimeout(300_000);
    const errors: string[] = [];
    collectPageErrors(page, errors);
    acceptDialogs(page);
    await signIn(page, baseURL!, L, 'harness');

    const lp = (
      await sql<{ id: string; lp_number: string; quantity: string; uom: string; qa_status: string }>(
        `select id::text, lp_number, quantity::text, uom, qa_status
           from public.license_plates
          where org_id = $1::uuid and status = 'available' and qa_status = 'released'
          order by lp_number
          limit 1`,
        [ORG_ID],
      )
    )[0];
    expect(lp, 'brak wolnego nośnika — stan bazy, nie defekt').toBeTruthy();
    console.log(`[T5] nośnik przed blokadą: ${JSON.stringify(lp)}`);

    await page.goto(url(`/${L}/quality/holds`), { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('holds-create-open')).toBeVisible({ timeout: COMPILE });
    await page.getByTestId('holds-create-open').click();
    await expect(page.getByTestId('hold-create-form')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('hold-create-lp-search').fill(lp!.lp_number);
    await expect(page.getByTestId(`hold-create-lp-result-${lp!.id}`)).toBeVisible({ timeout: 30_000 });
    await page.getByTestId(`hold-create-lp-result-${lp!.id}`).click();
    const reason = `E2E czesciowe zwolnienie ${stamp}`;
    await page.getByTestId('hold-create-reason').fill(reason);
    await page.getByTestId('hold-create-submit').click();

    await expect
      .poll(
        async () =>
          (await sql<{ n: string }>(
            `select count(*)::text as n from public.quality_holds where org_id = $1::uuid and reason_free_text = $2`,
            [ORG_ID, reason],
          ))[0]?.n,
        { timeout: 60_000, message: 'blokada (T5) nie pojawiła się w bazie' },
      )
      .toBe('1');
    const hold = (
      await sql<{ id: string; hold_number: string }>(
        `select id::text, hold_number from public.quality_holds where org_id = $1::uuid and reason_free_text = $2`,
        [ORG_ID, reason],
      )
    )[0]!;

    // KONTROLA POZYTYWNA: blokada faktycznie zmienia stan nośnika.
    const lpHeld = (
      await sql<{ status: string; qa_status: string; quantity: string }>(
        `select status, qa_status, quantity::text from public.license_plates where id = $1::uuid`,
        [lp!.id],
      )
    )[0]!;
    console.log(`[T5] nośnik PO założeniu blokady ${hold.hold_number}: ${JSON.stringify(lpHeld)}`);
    expect(lpHeld.qa_status).toBe('on_hold');

    const itemsHeld = await sql<{ qty_held_kg: string | null; qty_released_kg: string | null; item_status: string }>(
      `select qty_held_kg::text, qty_released_kg::text, item_status
         from public.quality_hold_items where org_id = $1::uuid and hold_id = $2::uuid`,
      [ORG_ID, hold.id],
    );
    console.log(`[T5] pozycje blokady po założeniu: ${JSON.stringify(itemsHeld)}`);

    // ── Zwolnienie z dyspozycją „Partial release" ─────────────────────────
    await page.goto(url(`/${L}/quality/holds/${hold.id}`), { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('hold-detail-release-open')).toBeVisible({ timeout: COMPILE });
    await page.getByTestId('hold-detail-release-open').click();
    await expect(page.getByTestId('hold-release-form')).toBeVisible({ timeout: 30_000 });
    // Modal zwolnienia nie ma pola ilości: jedyne pola to lista dyspozycji,
    // notatka i hasło.
    const releaseForm = page.getByTestId('hold-release-form');
    expect(await releaseForm.locator('input[type="number"]').count()).toBe(0);

    // NAPRAWIONE (Z-05): „Partial release" było odrzucane bezwarunkowo surowym
    // kodem `partial_release_requires_lp_split`, bo taka dyspozycja nie istnieje
    // ani w PRD (docs/prd/09-QUALITY-PRD.md:360), ani w prototypie modala, ani
    // w mechanice ilościowej. Kontrolka została USUNIĘTA — lista oferuje wyłącznie
    // dyspozycje, które faktycznie działają. Serwer nadal odrzuca spreparowane
    // żądanie (hold-actions.ts — guard w releaseHoldCore).
    await page.getByTestId('hold-release-disposition').getByRole('combobox').click();
    const dispositionOptions = await page.getByRole('option').allInnerTexts();
    console.log(`[T5] dyspozycje w liście: ${JSON.stringify(dispositionOptions)}`);
    expect(dispositionOptions.map((o) => o.trim())).toEqual(['Release as-is', 'Scrap', 'Rework']);
    expect(await page.getByRole('option', { name: /partial/i }).count()).toBe(0);
    await page.keyboard.press('Escape');
    await shot(page, 'T5-01-release-dispositions');

    const stillOpen = (
      await sql<{ hold_status: string; disposition: string | null; released_by: string | null }>(
        `select hold_status, disposition, released_by::text
           from public.quality_holds where org_id = $1::uuid and id = $2::uuid`,
        [ORG_ID, hold.id],
      )
    )[0]!;
    const itemsAfter = await sql<{ qty_held_kg: string | null; qty_released_kg: string | null; item_status: string }>(
      `select qty_held_kg::text, qty_released_kg::text, item_status
         from public.quality_hold_items where org_id = $1::uuid and hold_id = $2::uuid`,
      [ORG_ID, hold.id],
    );
    const lpAfter = (
      await sql<{ status: string; qa_status: string; quantity: string }>(
        `select status, qa_status, quantity::text from public.license_plates where id = $1::uuid`,
        [lp!.id],
      )
    )[0]!;
    console.log(`[T5] blokada po otwarciu listy dyspozycji: ${JSON.stringify(stillOpen)}`);
    console.log(`[T5] pozycje blokady: ${JSON.stringify(itemsAfter)}`);
    console.log(`[T5] nośnik: ${JSON.stringify(lpAfter)}`);

    // Samo obejrzenie listy niczego nie zmienia — blokada dalej trzyma nośnik.
    expect(stillOpen.hold_status).toBe('open');
    expect(stillOpen.released_by).toBeNull();
    expect(lpAfter.qa_status).toBe('on_hold');
    expect(itemsAfter.every((i) => i.item_status === 'held')).toBe(true);

    // Czy istnieje JAKAKOLWIEK droga do „podziału nośnika" z tego ekranu?
    await page.getByTestId('hold-release-cancel').click();
    const splitAffordance = await page.getByText(/split/i).count();
    console.log(`[T5] elementy ze słowem „split" na ekranie blokady: ${splitAffordance}`);

    // Sprzątanie: zwolnienie blokady dyspozycją, która działa, żeby nośnik
    // nie został zamrożony dla kolejnych przebiegów.
    await page.getByTestId('hold-detail-release-open').click();
    await expect(page.getByTestId('hold-release-form')).toBeVisible({ timeout: 30_000 });
    await pickSelect(page, page.getByTestId('hold-release-disposition'), /^Release as-is$/);
    await page.getByTestId('hold-release-reason').fill('Sprzatanie po tescie czesciowego zwolnienia.');
    await page.getByTestId('hold-release-password').fill('e2e-local');
    await page.getByTestId('hold-release-submit').click();
    await expect
      .poll(
        async () =>
          (await sql<{ hold_status: string }>(
            `select hold_status from public.quality_holds where org_id = $1::uuid and id = $2::uuid`,
            [ORG_ID, hold.id],
          ))[0]?.hold_status,
        { timeout: 60_000, message: 'sprzątanie: blokada (T5) nie została zwolniona' },
      )
      .toBe('released');

    await shot(page, 'T5-02-after-partial-release');
    console.log(`[T5] BŁĘDY STRONY: ${errors.length === 0 ? 'brak' : JSON.stringify(errors)}`);
  });
});
