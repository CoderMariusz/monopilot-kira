/**
 * USTAWIENIA I ADMINISTRACJA — czy zapis PRZEŻYWA odświeżenie?
 *
 * Obszar nigdy nie klikany. Audyty statyczne (8191 zapytań przez PREPARE) wskazały
 * kilka zapisów, które „padają zawsze". Ten spec NIE ufa opisom — każdy trop jest
 * sprawdzany akcją w przeglądarce + odczytem stanu wprost z Postgresa.
 *
 * DOWÓD = AKCJA + TRWAŁY WIERSZ W BAZIE PO ODŚWIEŻENIU.
 * Toast „zapisano" nie dowodzi niczego (dziś 2× okazał się kłamać).
 *
 * Uruchamiać WYŁĄCZNIE przez `bash scripts/e2e-local.sh` (asercja 127.0.0.1 + workers=1).
 */

import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';

import { signIn } from './_shared/parity-login';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const artifactDir = path.resolve(__dirname, 'artifacts/settings-admin-persistence');
const L = 'en';
const ORG_ID = '00000000-0000-0000-0000-000000000002';

/** Serwer DEV kompiluje trasę przy PIERWSZYM wejściu — render czekamy osobno od nawigacji. */
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

/**
 * Odczyt flagi z bazy jako POLL, nie pojedynczy strzał.
 *
 * Server Action leci asynchronicznie względem optymistycznego stanu Reacta: pierwszy
 * przebieg tego specu „wykrył" defekt tylko dlatego, że czytał bazę natychmiast po
 * kliknięciu, zanim akcja zdążyła wrócić. Jeśli wartość nie pojawi się w oknie
 * timeoutu, to dopiero JEST defekt.
 */
async function flagInDb(flag: string): Promise<boolean | null> {
  const [row] = await sql<{ is_enabled: boolean }>(
    `select is_enabled from public.feature_flags_core where org_id = $1::uuid and flag_code = $2`,
    [ORG_ID, flag],
  );
  return row?.is_enabled ?? null;
}

async function shot(page: Page, name: string): Promise<void> {
  ensureDir();
  await page.screenshot({ path: path.join(artifactDir, `${name}.png`), fullPage: true });
}

/**
 * Nawigacja rozdzielona na dwa kroki, bo serwer DEV kompiluje trasę przy pierwszym
 * wejściu: najpierw dojście pod URL, POTEM długie czekanie na konkretny element.
 * Cztery dzisiejsze „zgłoszenia" okazały się właśnie pomyleniem tych dwóch rzeczy.
 */
async function openSettings(page: Page, route: string, ready: string): Promise<void> {
  await page.goto(new URL(`/${L}${route}`, baseURL).toString(), {
    waitUntil: 'domcontentloaded',
    timeout: COMPILE,
  });
  await expect(page.getByTestId(ready)).toBeVisible({ timeout: COMPILE });
}

// Celowo NIE 'serial': każdy ekran to niezależny dowód, jeden defekt nie może
// zamaskować pozostałych przez pominięcie kolejnych testów.

test.beforeAll(() => {
  expect(baseURL, 'PLAYWRIGHT_BASE_URL musi być ustawiony — uruchom przez scripts/e2e-local.sh').toBeTruthy();
  expect(ownerConnectionString, 'DATABASE_URL_OWNER musi być ustawiony').toBeTruthy();
});

// ───────────────────────────────────────────────────────────────────────────────
// TROP 1: „przełączenie KAŻDEJ flagi funkcji pada" (feature_flags_core.updated_by)
// ───────────────────────────────────────────────────────────────────────────────
test('flagi funkcji: przełącznik zapisuje is_enabled i stan przeżywa odświeżenie', async ({ page }) => {
  test.setTimeout(240_000);
  await signIn(page, baseURL, L, 'admin');

  const FLAG = 'scanner.pwa.enabled';

  const [before] = await sql<{ is_enabled: boolean }>(
    `select is_enabled from public.feature_flags_core where org_id = $1::uuid and flag_code = $2`,
    [ORG_ID, FLAG],
  );
  expect(before, `flaga ${FLAG} musi istnieć w bazie dla org ${ORG_ID}`).toBeTruthy();

  await openSettings(page, '/settings/flags', 'settings-flags-admin-screen');
  await shot(page, '01-flags-before');

  const toggle = page.getByRole('switch', { name: FLAG });
  await expect(toggle, `przełącznik flagi ${FLAG} musi być widoczny`).toBeVisible({ timeout: COMPILE });

  const wasEnabled = before!.is_enabled;
  expect(await toggle.getAttribute('aria-checked')).toBe(String(wasEnabled));

  await toggle.click();

  // handle Toggle() ustawia stan optymistycznie, a po nieudanej akcji COFA go i pokazuje
  // `actionError`. Dlatego NIE wolno poprzestać na aria-checked — czekamy aż rozstrzygnie
  // się jedno z dwojga: baza się zmieni albo pojawi się czerwony alert.
  let toggleError: string | null = null;
  await expect
    .poll(
      async () => {
        if ((await flagInDb(FLAG)) === !wasEnabled) return 'db-changed';
        const alert = page.locator('[data-region="flags-table"] [role="alert"]');
        if (await alert.count()) {
          toggleError = (await alert.first().innerText()).trim();
          return 'error-shown';
        }
        return 'pending';
      },
      { timeout: 45_000 },
    )
    .not.toBe('pending');

  await shot(page, '02-flags-after-click');
  expect(
    toggleError,
    `Przełącznik ${FLAG} zwrócił błąd akcji serwerowej zamiast zapisać: ${toggleError}`,
  ).toBeNull();

  // ODŚWIEŻENIE — dopiero to odróżnia optymistyczny stan Reacta od zapisu w bazie.
  await page.reload({ waitUntil: 'domcontentloaded', timeout: COMPILE });
  await expect(page.getByTestId('settings-flags-admin-screen')).toBeVisible({ timeout: COMPILE });

  await shot(page, '03-flags-after-reload');

  await expect
    .poll(async () => flagInDb(FLAG), { timeout: 30_000 })
    .toBe(!wasEnabled);

  const uiAfterReload = await page.getByRole('switch', { name: FLAG }).getAttribute('aria-checked');
  expect(uiAfterReload, 'ekran po odświeżeniu musi pokazywać wartość z bazy').toBe(String(!wasEnabled));

  // Przywrócenie stanu wyjściowego przez UI (nie przez SQL) — drugi dowód, że zapis żyje
  // w OBIE strony (włączenie i wyłączenie to dwie różne ścieżki preflightu).
  await page.getByRole('switch', { name: FLAG }).click();
  await expect
    .poll(async () => page.getByRole('switch', { name: FLAG }).getAttribute('aria-checked'), { timeout: 30_000 })
    .toBe(String(wasEnabled));
  await expect
    .poll(async () => flagInDb(FLAG), { timeout: 30_000 })
    .toBe(wasEnabled);
});

// ───────────────────────────────────────────────────────────────────────────────
// TROP 2: „zapis konfiguracji poczty pada" (reference_schemas.enum_values)
// ───────────────────────────────────────────────────────────────────────────────
test('konfiguracja poczty: zapis szablonu musi trafić do reference_tables', async ({ page }) => {
  test.setTimeout(240_000);
  await signIn(page, baseURL, L, 'admin');

  await openSettings(page, '/settings/email', 'settings-email-templates-screen');
  await shot(page, '10-email-screen');

  // Ekran startuje pusty ("No email templates yet"), więc zapis ćwiczymy przez tworzenie.
  const templatesBefore = await sql<{ n: string }>(
    `select count(*)::text as n from public.reference_tables
      where org_id = $1::uuid and table_code = 'email_config'`,
    [ORG_ID],
  );

  await page.getByRole('button', { name: 'Create email template' }).click();
  await expect(page.getByTestId('email-template-edit-modal')).toBeVisible({ timeout: 30_000 });

  // Trigger code = Select. Listę zamykamy WYBOREM opcji — Escape zamyka cały modal
  // (potwierdzone dziś empirycznie), więc nie używamy go tutaj wcale.
  const triggerSelect = page.getByLabel(/^Trigger code/);
  await triggerSelect.click();
  // Lista jest portalowana do <body>, czyli POZA dialog z aria-modal="true" — przez to
  // getByRole('option') jej nie widzi (drzewo a11y ucina wszystko spoza modala).
  // Lokalizujemy po data-slot, a fakt niedostępności odnotowujemy w raporcie.
  const firstOption = page.locator('[data-slot="select-content"] [role="option"]').first();
  await expect(firstOption).toBeVisible({ timeout: 15_000 });
  const optionText = (await firstOption.innerText()).trim();
  const code = optionText.replace(/^.*\(/, '').replace(/\)$/, '').trim();
  await firstOption.click();

  await expect(
    page.getByTestId('email-template-edit-modal'),
    'po wyborze wartości z listy modal MUSI nadal stać (Escape/klik nie może go zdjąć)',
  ).toBeVisible();

  await page.getByLabel(/^Display name/).fill('E2E settings probe');
  await page.getByLabel(/^Active recipients/).fill('e2e@monopilot.test');

  await page.getByRole('button', { name: /^Next →$/ }).click();

  const marker = `E2E-SETTINGS-${Date.now()}`;
  const subject = page.getByLabel(/^Subject/);
  await expect(subject).toBeVisible({ timeout: 15_000 });
  await subject.fill(marker);
  await page.getByLabel(/^Body/).fill('E2E body without merge fields.');

  await page.getByRole('button', { name: /^Next: review →$/ }).click();

  const save = page.getByRole('button', { name: /^Save template$/ });
  await expect(save).toBeVisible({ timeout: 15_000 });
  await save.click();

  // Czekamy aż akcja serwerowa rozstrzygnie: wiersz w bazie ALBO komunikat błędu.
  let uiOutcome = 'pending';
  await expect
    .poll(
      async () => {
        const rows = await sql<{ n: string }>(
          `select count(*)::text as n from public.reference_tables
            where org_id = $1::uuid and table_code = 'email_config' and row_key = $2`,
          [ORG_ID, code],
        );
        if (Number(rows[0]!.n) > 0) return (uiOutcome = 'db-row-written');
        const toast = page.locator('[role="alert"]').filter({ hasText: /fail|error|denied|unable|persist/i });
        if (await toast.count()) return (uiOutcome = (await toast.first().innerText()).trim());
        return 'pending';
      },
      { timeout: 45_000 },
    )
    .not.toBe('pending');

  await shot(page, '11-email-after-save');

  const afterRows = await sql<{ row_data: Record<string, unknown>; version: number }>(
    `select row_data, version from public.reference_tables
      where org_id = $1::uuid and table_code = 'email_config' and row_key = $2`,
    [ORG_ID, code],
  );

  expect(
    afterRows[0]?.row_data?.['subject_template'],
    `DOWÓD BAZY: po „Save template" reference_tables.row_data.subject_template dla triggera "${code}" ` +
      `musi zawierać "${marker}". Wierszy email_config przed=${templatesBefore[0]!.n}. ` +
      `Reakcja UI: ${uiOutcome}. Brak wiersza = zapis konfiguracji poczty faktycznie pada.`,
  ).toBe(marker);

  // ODŚWIEŻENIE — zapis musi być widoczny także po ponownym wejściu na ekran.
  await page.reload({ waitUntil: 'domcontentloaded', timeout: COMPILE });
  await expect(page.getByTestId('settings-email-templates-screen')).toBeVisible({ timeout: COMPILE });
  await expect(
    page.getByTestId('settings-email-template-row').filter({ hasText: code }),
    'zapisany szablon musi być widoczny na liście po odświeżeniu',
  ).toHaveCount(1);
});

// ───────────────────────────────────────────────────────────────────────────────
// TROP 3: „ekran reguł pokazuje Never changed NA ZAWSZE" (audit_log.created_at)
// ───────────────────────────────────────────────────────────────────────────────
//
// UWAGA METODOLOGICZNA: pierwsze podejście „wykryło defekt", bo klikało wariant, który
// był JUŻ wybrany. `collectOverrides` (rule-variant-selector.client.tsx:67) wysyła
// WYŁĄCZNIE wartości RÓŻNE od bieżącej, a każda reguła w tej bazie ma dokładnie jedną
// wersję — nie było czego zmienić, więc akcja słusznie nie zapisywała nic i słusznie
// raportowała sukces. Żeby ścieżkę zapisu dało się w ogóle przetestować, spec dosiewa
// DRUGĄ wersję reguły i dopiero wtedy klika realną zmianę v1 → v2.
const SEEDED_RULE = 'lp_state_machine_v1';

test('reguły tenanta: wybór INNEGO wariantu zapisuje override i kolumna Last changed ożywa', async ({ page }) => {
  test.setTimeout(240_000);

  // Setup danych testowych (nie kodu produkcyjnego): druga wersja reguły = realny wybór.
  await sql(
    `insert into public.rule_definitions (org_id, rule_code, rule_type, tier, definition_json, version)
     select $1::uuid, rule_code, rule_type, tier, definition_json, 2
       from public.rule_definitions
      where org_id = $1::uuid and rule_code = $2 and version = 1
     on conflict do nothing`,
    [ORG_ID, SEEDED_RULE],
  );
  // Wiersz tenant_variations musi istnieć — akcja reguł robi GOŁE UPDATE (patrz raport).
  await sql(
    `insert into public.tenant_variations (org_id) values ($1::uuid) on conflict (org_id) do nothing`,
    [ORG_ID],
  );
  await sql(`update public.tenant_variations set rule_variant_overrides = '{}'::jsonb where org_id = $1::uuid`, [ORG_ID]);
  await sql(`delete from public.audit_log where org_id = $1::uuid and action = $2`, [
    ORG_ID,
    'tenant_variations.rule_variant.batch_updated',
  ]);

  await signIn(page, baseURL, L, 'admin');
  await openSettings(page, '/settings/tenant/rules', 'settings-rule-variant-selector-screen');
  await shot(page, '20-rules-before');

  await expect(
    page.getByRole('row').filter({ hasText: SEEDED_RULE }).first(),
    `wiersz reguły ${SEEDED_RULE} musi pokazywać „Never changed" przed pierwszym zapisem`,
  ).toContainText('Never changed');

  const v2 = page.locator(`input[type="radio"][name="variant:${SEEDED_RULE}"][value="v2"]`);
  await expect(v2, 'po dosianiu wersji 2 ekran musi oferować realny wybór').toBeVisible({ timeout: 30_000 });
  expect(await v2.isChecked(), 'wersja 2 nie może być już wybrana — inaczej nie ma czego zapisać').toBe(false);
  await v2.check();

  await page.locator('form[data-region="variant-selector-form"] button[type="submit"]').click();

  await expect
    .poll(
      async () => {
        const rows = await sql<{ overrides: Record<string, unknown> | null }>(
          `select rule_variant_overrides as overrides from public.tenant_variations where org_id = $1::uuid`,
          [ORG_ID],
        );
        return rows[0]?.overrides?.[SEEDED_RULE] === undefined ? 'pending' : 'saved';
      },
      { timeout: 45_000 },
    )
    .toBe('saved');

  await shot(page, '21-rules-after-save');

  // Sukces ląduje w #rule-variant-selector-status; #...-alert pokazuje stałą poradę
  // i przy sukcesie się NIE zmienia — czytamy oba, żeby nie zgadywać.
  const statusText = (await page.locator('#rule-variant-selector-status').innerText()).trim();
  const alertText = (await page.locator('#rule-variant-selector-alert').innerText()).trim();

  // Kolumna „Last changed" karmi się audit_log.occurred_at — trop mówił, że zapis idzie
  // do nieistniejącej kolumny created_at, a catch połyka błąd.
  const audit = await sql<{ n: string }>(
    `select count(*)::text as n from public.audit_log
      where org_id = $1::uuid and action = 'tenant_variations.rule_variant.batch_updated'`,
    [ORG_ID],
  );
  expect(
    Number(audit[0]!.n),
    `DOWÓD BAZY: zapis wariantu musi zostawić wiersz w audit_log. Status: "${statusText}", alert: "${alertText}".`,
  ).toBeGreaterThan(0);

  await page.reload({ waitUntil: 'domcontentloaded', timeout: COMPILE });
  await expect(page.getByTestId('settings-rule-variant-selector-screen')).toBeVisible({ timeout: COMPILE });
  await shot(page, '22-rules-after-reload');

  await expect(
    page.getByRole('row').filter({ hasText: SEEDED_RULE }).first(),
    `DOWÓD UI: po udanym zapisie wiersz ${SEEDED_RULE} NIE może już pokazywać „Never changed"`,
  ).not.toContainText('Never changed');
});

// ───────────────────────────────────────────────────────────────────────────────
// JEDNOSTKI MIARY — ekran „ustawieniowy" bez żadnego tropu z audytu (próba kontrolna)
// ───────────────────────────────────────────────────────────────────────────────
test('jednostki miary: dodana jednostka trafia do unit_of_measure i przeżywa odświeżenie', async ({ page }) => {
  test.setTimeout(240_000);
  await signIn(page, baseURL, L, 'admin');

  await page.goto(new URL(`/${L}/settings/units`, baseURL).toString(), { waitUntil: 'domcontentloaded', timeout: COMPILE });
  await expect(page.locator('[data-screen="settings-units"]')).toBeVisible({ timeout: COMPILE });
  await shot(page, '30-units-before');

  const code = `E2E${Date.now().toString().slice(-6)}`;

  await page.getByRole('button', { name: /add unit/i }).first().click();
  const dialog = page.getByRole('dialog', { name: /add unit/i });
  await expect(dialog).toBeVisible({ timeout: 30_000 });

  await page.locator('#settings-units-add-code').fill(code);
  await page.locator('#settings-units-add-name').fill(`E2E unit ${code}`);
  await page.locator('#settings-units-add-factor').fill('1');

  await page.getByRole('button', { name: /save unit/i }).click();

  let unitsOutcome = 'pending';
  await expect
    .poll(
      async () => {
        const rows = await sql<{ n: string }>(
          `select count(*)::text as n from public.unit_of_measure where org_id = $1::uuid and code = $2`,
          [ORG_ID, code],
        );
        if (Number(rows[0]!.n) > 0) return (unitsOutcome = 'db-row-written');
        const err = page.locator('[role="alert"].alert-red');
        if (await err.count()) return (unitsOutcome = (await err.first().innerText()).trim());
        return 'pending';
      },
      { timeout: 45_000 },
    )
    .not.toBe('pending');

  await shot(page, '31-units-after-save');
  expect(unitsOutcome, `Zapis jednostki ${code} nie utworzył wiersza; reakcja UI: ${unitsOutcome}`).toBe('db-row-written');

  await page.reload({ waitUntil: 'domcontentloaded', timeout: COMPILE });
  await expect(page.locator('[data-screen="settings-units"]')).toBeVisible({ timeout: COMPILE });
  await expect(
    page.getByText(code, { exact: false }).first(),
    'nowa jednostka musi być widoczna po odświeżeniu',
  ).toBeVisible({ timeout: 30_000 });
});

// ───────────────────────────────────────────────────────────────────────────────
// TROP 4: „przycisk Run import to atrapa"
// ───────────────────────────────────────────────────────────────────────────────
test('import danych podstawowych: „Run import" nie tworzy żadnego zadania importu', async ({ page }) => {
  test.setTimeout(240_000);
  await signIn(page, baseURL, L, 'admin');

  await openSettings(page, '/settings/import-export', 'settings-import-export-hub');
  await shot(page, '40-impex-hub');

  const jobsBefore = await sql<{ n: string }>(
    `select count(*)::text as n from public.import_export_jobs where org_id = $1::uuid`,
    [ORG_ID],
  );

  // Wejście w encję otwiera szufladę kreatora importu.
  // Tabela encji to divy z role="row" (nie <table>), a wejście w kreator jest pod
  // przyciskiem „↑ Import" w wierszu — nie pod kliknięciem samego wiersza.
  await page.locator('[data-testid="settings-import-export-hub"] .impex-row [role="cell"] button').first().click();
  const drawer = page.getByTestId('master-data-hub-drawer');
  await expect(drawer).toBeVisible({ timeout: 30_000 });

  // Przeklikanie kreatora do kroku 3 (Review) przyciskiem głównym w stopce szuflady;
  // etykiety są tłumaczone, więc idziemy po strukturze, nie po tekście.
  const reviewStep = page.getByTestId('master-data-hub-step-review');
  for (let i = 0; i < 4 && !(await reviewStep.count()); i += 1) {
    await drawer.locator('.btn-primary').last().click();
    await page.waitForTimeout(800);
  }
  await expect(reviewStep, 'kreator importu musi dojść do kroku Review').toBeVisible({ timeout: 30_000 });
  await shot(page, '41-impex-review-step');

  // Przycisk „Run import" to jedyny .btn-primary w stopce na kroku 3. Szukamy go
  // strukturalnie, bo jego etykieta bywa nieprzetłumaczona (patrz asercja niżej).
  const runImport = drawer.locator('.impex-drawer-foot .btn-primary, .btn-primary').last();
  await expect(runImport, 'krok Review musi mieć przycisk główny „Run import"').toBeVisible({ timeout: 15_000 });
  const runImportText = (await runImport.innerText()).trim();

  const notWired = page.getByTestId('master-data-hub-not-wired');
  const notWiredVisible = (await notWired.count()) > 0;

  const runImportEnabled = await runImport.isEnabled();

  // NAJPIERW akcja + stan bazy — asercje opisowe dopiero po zebraniu dowodu, żeby
  // pierwsza z nich nie ucięła testu przed kliknięciem.
  await runImport.click();
  await page.waitForTimeout(5_000);
  await shot(page, '42-impex-after-run-import');

  const jobsAfter = await sql<{ n: string }>(
    `select count(*)::text as n from public.import_export_jobs where org_id = $1::uuid`,
    [ORG_ID],
  );
  const drawerStillOpen = (await page.getByTestId('master-data-hub-drawer').count()) > 0;

  const evidence =
    `etykieta="${runImportText}", aktywny=${runImportEnabled}, baner „not wired"=${notWiredVisible}, ` +
    `szuflada po kliknięciu otwarta=${drawerStillOpen}, zadań przed=${jobsBefore[0]!.n}, po=${jobsAfter[0]!.n}`;

  expect(
    runImportText,
    `etykieta przycisku musi być przetłumaczona, a nie surowym kluczem i18n (${evidence})`,
  ).not.toContain('settings.import_export');

  expect(
    Number(jobsAfter[0]!.n),
    `DOWÓD BAZY: „Run import" musi utworzyć zadanie w import_export_jobs (${evidence}). ` +
      `Bez zmiany = przycisk jest atrapą.`,
  ).toBeGreaterThan(Number(jobsBefore[0]!.n));
});

// ───────────────────────────────────────────────────────────────────────────────
// TROP 5: przełączniki powiadomień — czy w ogóle przeżywają odświeżenie
// ───────────────────────────────────────────────────────────────────────────────
test('powiadomienia: przełącznik digestu musi przeżyć odświeżenie strony', async ({ page }) => {
  test.setTimeout(240_000);
  await signIn(page, baseURL, L, 'admin');

  await openSettings(page, '/settings/notifications', 'settings-notifications-screen');
  await shot(page, '50-notifications-before');

  const digestRows = page.getByTestId('settings-notification-digest-row');
  await expect(digestRows.first()).toBeVisible({ timeout: COMPILE });

  const firstDigest = digestRows.first();
  const label = (await firstDigest.getByTestId('settings-notification-row-label').innerText()).trim();
  const toggle = firstDigest.getByRole('switch');
  const before = await toggle.getAttribute('aria-checked');

  await toggle.click();
  await expect.poll(async () => toggle.getAttribute('aria-checked'), { timeout: 30_000 }).toBe(String(before !== 'true'));
  await page.waitForTimeout(3_000);
  await shot(page, '51-notifications-after-toggle');

  await page.reload({ waitUntil: 'domcontentloaded', timeout: COMPILE });
  await expect(page.getByTestId('settings-notifications-screen')).toBeVisible({ timeout: COMPILE });

  const afterReload = await page
    .getByTestId('settings-notification-digest-row')
    .filter({ hasText: label })
    .first()
    .getByRole('switch')
    .getAttribute('aria-checked');

  await shot(page, '52-notifications-after-reload');
  expect(
    afterReload,
    `DOWÓD UI+BAZY: przełącznik digestu „${label}" przestawiony z ${before} na ${before !== 'true'} ` +
      `musi po odświeżeniu nadal pokazywać nową wartość. Powrót do ${before} = ekran renderuje ` +
      `zaszyte wartości domyślne zamiast stanu z bazy.`,
  ).toBe(String(before !== 'true'));
});

// ───────────────────────────────────────────────────────────────────────────────
// SIGNOFF — czy sąsiedni ekran pisze do tenant_variations
//
// Kontrola dla tropu 3: akcje signoff/scanner-auth/quality robią UPSERT
// (INSERT … ON CONFLICT DO UPDATE), a akcja reguł GOŁE UPDATE — ten test pokazuje,
// że wiersz tenant_variations powstaje dopiero przy pierwszym zapisie z tych ekranów.
// ───────────────────────────────────────────────────────────────────────────────
test('signoff: zapis progów tworzy/aktualizuje wiersz tenant_variations', async ({ page }) => {
  test.setTimeout(240_000);
  await signIn(page, baseURL, L, 'admin');

  await sql(`delete from public.tenant_variations where org_id = $1::uuid`, [ORG_ID]);

  await openSettings(page, '/settings/signoff', 'settings-signoff-page');
  await shot(page, '60-signoff');

  // Ekran signoff zapisuje progi przez INSERT ... ON CONFLICT DO UPDATE, więc jego
  // zapis tworzy brakujący wiersz tenant_variations.
  const numberInputs = page.locator('[data-testid="settings-signoff-page"] input[type="number"]');
  const inputCount = await numberInputs.count();
  expect(inputCount, 'ekran signoff musi mieć pola progów do zapisania').toBeGreaterThan(0);

  const saveBtn = page.getByRole('button', { name: /save|zapisz/i }).first();
  await expect(saveBtn, 'ekran signoff musi mieć przycisk zapisu').toBeVisible({ timeout: 30_000 });
  await saveBtn.click();

  await expect
    .poll(
      async () => {
        const rows = await sql<{ n: string }>(
          `select count(*)::text as n from public.tenant_variations where org_id = $1::uuid`,
          [ORG_ID],
        );
        return Number(rows[0]!.n);
      },
      { timeout: 45_000 },
    )
    .toBeGreaterThan(0);

  await shot(page, '61-signoff-after-save');

  // Zapis musi też przeżyć odświeżenie — wartość progu czytana z bazy, nie z domyślnych.
  const saved = await sql<{ feature_flags: Record<string, unknown> | null }>(
    `select feature_flags from public.tenant_variations where org_id = $1::uuid`,
    [ORG_ID],
  );
  expect(
    saved[0]?.feature_flags,
    'DOWÓD BAZY: zapis progów signoff musi wypełnić tenant_variations.feature_flags',
  ).toBeTruthy();
});
