# E2E-HARNESS — sekwencyjne testy przeglądarkowe przeciw lokalnej bazie

Rekonesans z 2026-07-29. Wszystkie twierdzenia mają cytat `plik:linia`.
Stan maszyny założony: brak `docker`, lokalny PostgreSQL 16.13 (Homebrew), baza
`postgres://monopilot:monopilot@127.0.0.1:5432/monopilot` stawiana przez równoległy tor.

---

## 0. TL;DR — trzy odpowiedzi

**Sekwencyjny przebieg (jedna przeglądarka naraz):**
```bash
pnpm exec playwright test <spec…> --workers=1 --trace on
```

**Podniesienie aplikacji przeciw lokalnej bazie** — nie ręcznie, tylko przez wbudowany harness
(`startLocalShellParityHarness`), który sam odpala `pnpm --filter web dev` z podstawionym
fałszywym Supabase Auth. Zmienne bazodanowe ustawiasz w powłoce PRZED `playwright test`
(dziedziczą się do procesu dev — `apps/web/e2e/_helpers/shell-parity.ts:340-350`):
```bash
export DATABASE_URL='postgres://monopilot:monopilot@127.0.0.1:5432/monopilot'
export DATABASE_URL_OWNER="$DATABASE_URL"
export DATABASE_URL_APP='postgres://app_user:app-user-test-password@127.0.0.1:5432/monopilot'
```

**Czy logowanie przez formularz zadziała przeciw lokalnej bazie bez Supabase Auth?**
**NIE.** Hasła nie leżą w lokalnym Postgresie. `apps/web/app/[locale]/(auth)/login/_actions/auth.ts:40`
woła `supabase.auth.signInWithPassword({ email, password })` — to HTTP do GoTrue
(`NEXT_PUBLIC_SUPABASE_URL/auth/v1/token`). W `public.users` (`packages/db/migrations/001-baseline.sql:123-137`)
NIE MA kolumny z hasłem ani hashem. Bez GoTrue formularz zawsze zwróci błąd.
Obejście istnieje i jest w repo — patrz §4.

---

## 1. Playwright — konfiguracja

Jedyny root config: **`playwright.config.ts`** (44 linie).

| Ustawienie | Wartość | Linia |
|---|---|---|
| `testDir` | `./apps/web` | `playwright.config.ts:18` |
| `testMatch` | `['**/e2e/**/*.spec.ts', '**/e2e/**/*.e2e.spec.ts']` | `:19` |
| `outputDir` (artefakty: screenshoty porażek, trace.zip, wideo) | `./apps/web/e2e/test-results` | `:20` |
| `fullyParallel` | `true` | `:21` |
| `retries` | `CI ? 1 : 0` | `:23` |
| `reporter` | lokalnie `'list'` | `:24` |
| `use.baseURL` | `process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3100'` | `:12`, `:26` |
| `use.trace` | `'on-first-retry'` | `:27` |
| `use.screenshot` | `'only-on-failure'` | `:28` |
| `projects` | **jeden**: `chromium` / `devices['Desktop Chrome']` | `:30-35` |
| `webServer` | opt-in przez `PLAYWRIGHT_WEB_SERVER`; robi `build` + `next start` | `:36-43` |

Drugi, pomocniczy config: `apps/web/e2e/settings/playwright.auth-setup.config.ts` — tylko do
wygenerowania `storageState` (`testMatch: ['auth.setup.ts']`, `:14`).

### Pełna sekwencyjność

- **`--workers=1` wystarcza.** Jeden worker = jeden proces = jedna przeglądarka = jeden test naraz,
  niezależnie od `fullyParallel`. `fullyParallel` steruje wyłącznie rozdziałem pracy MIĘDZY workerów.
- **`fileParallelism` nie istnieje w Playwrighcie** — to opcja Vitesta. Nie szukaj jej w tym configu.
- Playwright CLI **nie ma** `--no-fully-parallel`. Jeśli chcesz to dodatkowo zadeklarować (nie jest
  potrzebne przy `--workers=1`), zrób osobny config dziedziczący z roota — **nie edytuj**
  `playwright.config.ts`, bo `fullyParallel: true` jest tam intencjonalnie dla CI.
- Projektów jest jeden (`chromium`), więc `--project=chromium` jest zbędne, ale nieszkodliwe.

### Artefakty i trace — PUŁAPKA

`trace: 'on-first-retry'` (`playwright.config.ts:27`) + `retries: 0` lokalnie (`:23`)
⇒ **lokalnie trace NIE POWSTAJE NIGDY**, dopóki nie podasz jawnie `--trace on`.
To samo źródło ma `CLAUDE.md` („Common commands"), gdzie `--trace on` jest przy każdej komendzie E2E.

Gdzie ląduje co:
- `apps/web/e2e/test-results/<test>/trace.zip`, `test-failed-*.png`, `video.webm` — `playwright.config.ts:20`
- `apps/web/e2e/artifacts/<LABEL>/*.png` — screenshoty pisane ręcznie przez specy
  (`ensureArtifactDir`, `apps/web/e2e/_helpers/mrp-fulfilment.ts:31-35`)
- `apps/web/e2e/parity-evidence/shell/` — raport shell-parity (`_helpers/shell-parity.ts:102-104`)
- `apps/web/e2e/parity-evidence/settings/<TASK-ID>/` — raporty settings (`e2e/settings/_runner.ts:37-39`)
- `apps/web/e2e/.gitignore` ignoruje `test-results/`, `playwright-report/`, `**/trace.zip`, `**/*.webm`

Raport HTML nie jest skonfigurowany — dodaj `--reporter=html` jeśli go chcesz.

---

## 2. Uwierzytelnienie w E2E — jak to naprawdę działa

### 2.1 Trzy wzorce logowania w istniejących specach

**(a) Logowanie formularzem** — 13 speców. Wspólny helper:
`apps/web/e2e/_helpers/mrp-fulfilment.ts:41-55` (`signIn`) oraz duplikat
`apps/web/e2e/_shared/parity-login.ts:7-19`. Zmienne:
- `PLAYWRIGHT_ADMIN_EMAIL` (domyślnie `admin@monopilot.test`) — `_helpers/mrp-fulfilment.ts:22`
- `PLAYWRIGHT_ADMIN_PASSWORD` (bez domyślnej) — `:23`
- `PLAYWRIGHT_BASE_URL` — `:21`; brak ⇒ `test.skip(...)`

**(b) storageState** — ~25 speców. `resolveAuthStorageState()`
(`_helpers/shell-parity.ts:112-122`) szuka w kolejności:
`PLAYWRIGHT_AUTH_STORAGE` → `PLAYWRIGHT_AUTH_STORAGE_STATE` → `apps/web/e2e/.auth/user.json`
→ `apps/web/e2e/auth-storage.json` → `apps/web/playwright/.auth/user.json`.
Plik generuje `apps/web/e2e/settings/auth.setup.ts:28-47` (`pnpm --filter web e2e:auth`),
logując się PRAWDZIWYM formularzem — czyli też wymaga Supabase Auth.

**(c) Lokalny harness z fałszywym Supabase** — 11 speców (§4).

### 2.2 Czy logowanie zadziała przeciw lokalnej bazie? — NIE

Łańcuch, cytat po cytacie:

1. Formularz → Server Action: `apps/web/app/[locale]/(auth)/login/login-card.client.tsx:58`
   `useActionState(signInWithPassword, initialState)`.
2. Server Action: `apps/web/app/[locale]/(auth)/login/_actions/auth.ts:39-40`
   ```ts
   const supabase = await createSupabaseServerClient();
   const { error } = await supabase.auth.signInWithPassword({ email, password });
   ```
3. Klient: `apps/web/lib/auth/supabase-server.ts:13,29-31,77` — `@supabase/ssr` `createServerClient`
   z `NEXT_PUBLIC_SUPABASE_URL` (`:30`) i `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`:31`).
4. To jest **wywołanie HTTP do GoTrue**, nie zapytanie SQL. Hasła siedzą w schemacie `auth`
   projektu Supabase — nie w `public`. `packages/db/migrations/001-baseline.sql:123-137` definiuje
   `public.users (id uuid primary key, org_id uuid not null, email citext, …)` — **brak pola hasła**.
   `packages/db/migrations/279-npd-storage.sql:19-20` dokumentuje wprost, że `public.users.id = auth.users.id`.

**Wniosek: lokalny Postgres nie zawiera i nie może zweryfikować haseł. Formularz logowania
przeciw lokalnej bazie zwróci błąd zawsze.** Nie da się tego naprawić seedem SQL.

### 2.3 Auth jest sprawdzany na trzech warstwach — wszystkie trzeba obsłużyć

| Warstwa | Co robi | Plik:linia |
|---|---|---|
| Edge middleware (`proxy.ts`) | `fetch(${supabaseUrl}/auth/v1/user)` na KAŻDYM chronionym żądaniu | `apps/web/lib/auth/session-check.ts:104-110`, wołane z `apps/web/proxy.ts:181-185` |
| Layout `(app)` | `getCachedUser()`; brak usera ⇒ `redirect('/{locale}/login')` | `apps/web/app/[locale]/(app)/layout.tsx:118`, `:132-134` |
| Server Actions / data plane | `resolveContextFromSupabase()` → `getCachedUser()`, potem `select org_id, is_active from public.users where id = $1::uuid` na puli OWNER | `apps/web/lib/auth/with-org-context.ts:229-248` |

To ostatnie jest kluczowe: **org_id NIE pochodzi z JWT, tylko z `public.users`**
(komentarz `with-org-context.ts:240-241`). Czyli uid z sesji MUSI mieć wiersz w lokalnej bazie.

### 2.4 Furtki dev/test — są dokładnie dwie

- **`DEV_AUTH_BYPASS`** — `apps/web/proxy.ts:55-74` i `:149-152`. Wyłącza WYŁĄCZNIE bramkę
  auth w middleware. Ignorowany gdy `NODE_ENV === 'production'` (`proxy.ts:58-66`).
  Przepuszczany do bundla Edge przez `apps/web/next.config.mjs:56` (`env:` block).
  README (`README.md:69`): „bypasses only page-routing middleware auth; … Server Action/API
  authorization still run normally". Potwierdzone kodem — layout i `withOrgContext` dalej wymagają usera.
- **`NEXT_SERVER_ACTION_ACTOR_USER_ID` / `NEXT_SERVER_ACTION_ORG_ID`** —
  `apps/web/lib/auth/with-org-context.ts:161-175`. Aktywne tylko przy
  `NODE_ENV === 'test' && VITEST && obie zmienne ustawione` (koniunkcja czterech warunków).
  **Nie działa pod Playwrightem** (brak `VITEST`).

Nie istnieje żadne `E2E_AUTH_BYPASS`, `MOCK_AUTH`, `DEV_LOGIN`, `TEST_USER` ani `NEXT_PUBLIC_E2E`.

---

## 3. Podniesienie aplikacji przeciw lokalnej bazie

### 3.1 Zmienne — czy nadpiszą `.env.local` bez edycji pliku? TAK

`apps/web/next.config.mjs:15-33` ręcznie parsuje `.env.local` (apps/web i root), ale:
```js
if (process.env[key] === undefined) process.env[key] = value;   // next.config.mjs:33
```
— **zmienna z powłoki wygrywa**. Next.js sam też nigdy nie nadpisuje istniejącego `process.env`.
Nie musisz i **nie wolno** edytować `.env.local`.

⚠️ **`.env.local` istnieje w TRZECH miejscach i wskazuje na PRODUKCJĘ:**
`/.env.local`, `/apps/web/.env.local` — obydwa definiują `DATABASE_URL`, `DATABASE_URL_APP`,
`DATABASE_URL_OWNER`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`. **Jeśli nie nadpiszesz KAŻDEJ z bazodanowych, dev server pojedzie
na prodzie.** To jest największe ryzyko tego zadania.

### 3.2 Który skrypt — `dev`, nie `build`+`start`

**Musi być `dev`.** Powody:
1. `DEV_AUTH_BYPASS` jest ignorowany przy `NODE_ENV=production` (`proxy.ts:58-66`), a `next start`
   ustawia `NODE_ENV=production`. Pod `build`+`start` bypass jest martwy.
2. `NEXT_PUBLIC_SUPABASE_URL` jest inline'owany do bundla klienta w czasie builda — podmiana
   na fałszywy serwer działa czysto tylko w dev.
3. `apps/web/package.json` **nie ma skryptu `start`** — jest tylko `dev` i `build`.
   `next start` odpalasz przez `pnpm --filter web exec next start` (tak robi `playwright.config.ts:38`).

Skrypty istotne (`apps/web/package.json`): `dev = next dev`, `build = next build`,
`e2e:auth`, `e2e:settings-parity`, `e2e:settings-flows`.
Root (`package.json`): `db:migrate:local` i `db:test:local` już wskazują
`postgres://monopilot:monopilot@127.0.0.1:5432/monopilot`.
`db:up = docker compose up -d postgres` — **martwe, docker nie istnieje**.

### 3.3 Zmienne bazodanowe — co dokładnie ustawić

| Zmienna | Do czego | Fallback w kodzie |
|---|---|---|
| `DATABASE_URL` | wspólny fallback | — |
| `DATABASE_URL_OWNER` | pula BYPASSRLS: resolve org_id, rejestracja kontekstu sesji | `?? DATABASE_URL`, `apps/web/lib/auth/with-org-context.ts:134` |
| `DATABASE_URL_APP` | pula data-plane z włączonym RLS | `?? DATABASE_URL` + **przepisanie username na `app_user`** i hasła na `APP_USER_PASSWORD ?? 'app-user-test-password'`, `with-org-context.ts:143-153`; ten sam wzorzec w `packages/db/src/clients.ts:31-37` |
| `APP_USER_PASSWORD` | hasło roli `app_user` | domyślne `'app-user-test-password'` |

Rola `app_user` jest zakładana przez migrację `packages/db/migrations/000-app-user-role.sql:14-18`
z hasłem dokładnie `'app-user-test-password'` — czyli po `db:migrate:local` fallback zadziała
bez ustawiania `DATABASE_URL_APP`. Ustaw go mimo to jawnie: będzie czytelniej w logach.

Migracje: **506 plików** w `packages/db/migrations/` (top-level; podkatalog `__verify__/` z 3 plikami
NIE jest aplikowany — `readdirSync` w runnerze nie schodzi rekurencyjnie). Najwyższa:
`543-npd-field-catalog-semantic-index-fix.sql`. W numeracji jest luka 529-540.
Runner: `packages/db/scripts/migrate.ts` — `getOwnerConnection()` (`:46`), walidacja nazw
`/^(\d{3})-[a-z0-9-]+\.sql$/` (`:48`), stan w `public.schema_migrations(filename, applied_at, checksum)`
(`:100-106`), każdy plik w `begin/commit` (`:166-180`), twardy fail na dryfie sumy kontrolnej
(`:141-150`, furtka `MIGRATE_ALLOW_CHECKSUM_DRIFT_FOR`). Wspiera `--dry-run`.

Uwaga na przyszłość (nie dotyczy lokalnego przebiegu): `apps/web/vercel.json:3` ma
`"buildCommand": "cd ../.. && pnpm --filter @monopilot/db migrate && cd apps/web && pnpm build"`
— build Vercela APLIKUJE migracje na żywej bazie.

---

## 4. Harness lokalny — jedyna działająca ścieżka

Repo ma gotowy harness: **`startLocalShellParityHarness()`**,
`apps/web/e2e/_helpers/shell-parity.ts:321-386`. Co robi:

1. Podnosi **fałszywy serwer Supabase Auth** na losowym wolnym porcie
   (`createFakeSupabaseAuthServer`, `:178-202`) obsługujący dwa endpointy:
   - `GET /auth/v1/user` → zwraca `HARNESS_USER` (`:181-185`) — to jest dokładnie ten endpoint,
     który woła middleware (`session-check.ts:104-110`) i `supabase.auth.getUser()`.
   - `POST /auth/v1/token` → zwraca sesję (`:186-198`).
2. Spawnuje `pnpm --filter web dev` (`:340-350`) z:
   ```js
   ...process.env,            // ⇐ TU wchodzą Twoje DATABASE_URL_*
   PORT: String(appPort),
   NODE_ENV: 'development',
   DEV_AUTH_BYPASS: 'true',
   NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,           // fałszywy serwer
   NEXT_PUBLIC_SUPABASE_ANON_KEY: 'shell-parity-anon-key',
   ```
3. `installAuthCookie(context)` (`:368-379`) wstrzykuje ciasteczko
   `sb-127-auth-token` (nazwa z `authCookieName`, `:262-265`) z base64-owaną sesją (`:267-278`).

Tożsamość harnessu (`shell-parity.ts:134-152`):
- `HARNESS_USER_ID = '11111111-1111-4111-8111-111111111111'`
- `HARNESS_ORG_ID  = '00000000-0000-0000-0000-000000000002'` (Apex)
- email `shell.parity@monopilot.local`

### 4.0 Wybór tożsamości (persony) — dodane 2026-07-29

Domyślna tożsamość jest **niezmieniona** (`11111111-…-111111111111`), więc wszystkie istniejące
specy działają bez modyfikacji. Persona podaje się jako **czwarty, opcjonalny argument**:

```ts
import { signIn } from './_shared/parity-login';
await signIn(page, baseURL, 'en', 'no_module_access');   // klucz persony
await signIn(page, baseURL, 'en', '7f290000-0000-4000-8000-000000000004'); // wprost public.users.id

// niżej, jeśli potrzebujesz samego ciasteczka (bez nawigacji):
import { installHarnessAuthCookie } from './_helpers/shell-parity';
await installHarnessAuthCookie(context, baseURL, supabaseUrl, 'admin');
// albo z uchwytu harnessu:
await harness.installAuthCookie(context, 'second_signer');
```

Klucze: `harness` (domyślny), `admin`, `no_asset_deactivate`, `second_signer`,
`single_site_operator`, `no_module_access` — rejestr `HARNESS_PERSONAS`
(`e2e/_helpers/shell-parity.ts`). UUID-y są kopią z `packages/db/seeds/test-personas.ts`
(nie da się go zaimportować: kończy się `await main()` na najwyższym poziomie, a transform
CommonJS Playwrighta odmawia `require()`).

**Jak to działa (i dlaczego nie da się prościej).** Fałszywy serwer auth żyje w procesie
runnera (`scripts/e2e-local-run.ts`), a ciasteczko pisze **inny** proces — worker Playwrighta.
Wspólny rejestr nie przechodzi przez tę granicę, więc tożsamość jedzie **wewnątrz access
tokena**: `shell-parity-access-token~<userId>`. `GET /auth/v1/user` czyta nagłówek `Bearer`
i odpowiada tą personą. Separatorem jest `~`, nigdy `.` — token ma pozostać nie-JWT-em dla
supabase-js. Domyślna tożsamość zachowuje token dosłownie, więc zachowanie sprzed zmiany
jest bit w bit takie samo. `POST /auth/v1/token` nadal odpowiada domyślną tożsamością —
to ścieżka odświeżenia sesji, a ciasteczko ma `expires_at` +1 h.

**Trzy warstwy — sprawdzone przebiegiem, nie założone** (`e2e/persona-permission-gate.spec.ts`):
middleware (fałszywy GoTrue oddaje personę spod tokena), layout `(app)` (renderuje powłokę
zamiast `redirect('/login')`), `withOrgContext` (`select org_id … where id = $1` trafia na
wiersz persony; topbar pokazuje `public.users.name` przez `loadShellIdentity()`, a sidebar
jest przefiltrowany zbiorem uprawnień TEJ persony). Persony muszą być wcześniej zaseedowane —
bez wiersza w `public.users` dostaniesz przekierowanie albo wyjątek, nie odmowę uprawnień.

### 4.0.1 ⛔ Czego personami NIE udowodnisz dzisiaj — bramka zapisu

**Kontrola przeciwna na akcji zapisującej (odmówiono personie A / przeszło personie B, ze
zmianą stanu w bazie) jest DZIŚ nieosiągalna.** Dwa niezależne blokery, oba zmierzone:

1. **React nie hydratuje pod tym harnessem.** Zmierzone na `/en/login` i
   `/en/planning/reorder-thresholds`: `document` nie ma klucza `__reactContainer$`, prawdziwe
   kliknięcie w `[data-testid=app-topbar-user-trigger]` nie przełącza `aria-expanded`, a lista
   sterowana `useEffect` stoi na `loading` przez 120 s. Tak samo przy
   `browser.newContext({ serviceWorkers: 'block' })` (0 rejestracji SW). Zero `pageerror`,
   zero nieudanych żądań, zero 4xx; `window.next` istnieje, react-dom się ładuje.
   **Skutek: każda Server Action odpalana z `onClick` — czyli prawie każdy zapis w tej
   aplikacji — jest w przeglądarce nieosiągalna.** To defekt środowiska/aplikacji, nie person;
   wymaga osobnego śledztwa (podejrzany: strumień RSC / runtime Turbopacka w dev).
2. **Tylko cztery formularze Server Action w `apps/web` działają bez JS** (submit natywny,
   więc bloker 1 by ich nie dotyczył) — i żaden nie pokazuje obu stron:
   - `(auth)/login` — uwierzytelnianie, nie bramka uprawnień;
   - `settings/infra/locations` `importCsvAction` — submit **i** input pliku mają
     `disabled={!canImport}` (`settings.infra.update`);
   - `settings/schema/new` `publishColumnAction` — submit jest `disabled`, gdy
     `getTenantVariations()` odmawia `settings.org.read`, czyli dla każdej persony poza `admin`.
     14 ról Apex pasuje do strony odmownej (`settings.org.read` bez `settings.schema.edit`),
     ale **żadna nie ma przypisanego użytkownika**;
   - `settings/schema/preview` `publishShadowDraft` — nie jest wyłączony, ale niewykonalna jest
     strona **pozytywna**: `callerHasSchemaAdmin` (`packages/schema-driven`) wymaga **sluga** roli
     `org.schema.admin`, a nie ma w Apex ani jednego użytkownika z tą rolą (persona `admin` ma
     slug `admin`).

Gdy hydracja zostanie naprawiona, gotowa para czeka: `upsertReorderThreshold`
(`planning/_actions/reorder-thresholds.ts`, bramka `npd.planning.write`) pod **niebramkowanym**
przyciskiem „+ Add threshold" (`thresholds-view.tsx:176-184`), stan trwały w
`public.reorder_thresholds` (dziś 0 wierszy), `admin` ma to uprawnienie, `no_module_access` nie.

### 4.1 PUŁAPKA — harness się nie uruchomi, dopóki istnieje `.auth/user.json`

Specy używają wzorca (np. `apps/web/e2e/walking-skeleton.spec.ts:33-35,46-51`):
```ts
const authStorageState = resolveAuthStorageState();
if (authStorageState) test.use({ storageState: authStorageState });
// beforeAll: if (!authStorageState) harness = await startLocalShellParityHarness();
```
Czyli **harness startuje TYLKO gdy `resolveAuthStorageState()` zwróci `undefined`**.

Na dysku leży `apps/web/e2e/.auth/user.json` (nie jest w gicie — `git ls-files` puste, plik lokalny),
i jest **martwy**: ciasteczko `sb-khjvkhzwfzuwzrusgobp-auth-token` przypięte do domeny
`monopilot-kira-git-kira-long-run-codermariuszs-projects.vercel.app`, czyli prod-owy ref Supabase
i domena Vercela. Lokalnie nie zadziała, a jego obecność **zablokuje harness**.

`resolveAuthStorageState` nie da się wyłączyć zmienną — ustawienie `PLAYWRIGHT_AUTH_STORAGE`
na nieistniejącą ścieżkę nie pomaga, bo lista kandydatów jest przeszukiwana `.find(existsSync)`
(`shell-parity.ts:114-121`). **Trzeba przenieść plik.**

### 4.2 Seed użytkownika harnessu — bez tego Server Actions rzucą

`with-org-context.ts:243-250` robi `select org_id, is_active from public.users where id = $1::uuid`
i rzuca `withOrgContext: no public.users row resolves org_id for verified user <uid>`, jeśli wiersza brak.
Strony renderujące się w layoutcie przejdą (layout czyta metadata), ale każda akcja i każdy
org-scoped loader padnie.

Seed (klonuje istniejącego admina Apex, odporny na nieznane kolumny):
```sql
-- 1) znajdź źródłowego admina w klonie prod-danych
select id, email from public.users
 where org_id = '00000000-0000-0000-0000-000000000002' and coalesce(is_active, true)
 order by created_at limit 5;

-- 2) sklonuj go pod uid harnessu
begin;
create temp table _src as
  select * from public.users where id = '31fe18af-43f7-4c05-a078-db23a9a5bd3e';  -- podstaw swój
update _src set id = '11111111-1111-4111-8111-111111111111',
                email = 'shell.parity@monopilot.local';
insert into public.users select * from _src on conflict (id) do nothing;

insert into public.user_roles (user_id, role_id, org_id)
select '11111111-1111-4111-8111-111111111111'::uuid, role_id, org_id
  from public.user_roles where user_id = '31fe18af-43f7-4c05-a078-db23a9a5bd3e'
on conflict do nothing;
commit;
```
`public.user_roles (user_id, role_id, org_id)` — kształt z `packages/rbac/src/grant.ts:364`.
Bez ról nawigacja się przefiltruje do gołego minimum
(`filterNavGroupsByPermissions`, `layout.tsx:139-140`) i akcje polecą w 403.

---

## 5. Runbook — komendy do skopiowania

### Krok 0 — jednorazowo: przeglądarka Playwrighta
```bash
cd /Users/mariuszkrawczyk/Projects/monopilot-kira
pnpm exec playwright install chromium
```
(w cache `~/Library/Caches/ms-playwright/` jest `chromium-1217` + `chromium_headless_shell-1217`,
więc prawdopodobnie no-op; Playwright `^1.58.0` — `package.json` devDependencies)

### Krok 1 — baza lokalna + migracje
```bash
cd /Users/mariuszkrawczyk/Projects/monopilot-kira
bash scripts/test-db.sh            # równoległy tor; stawia bazę `monopilot` + klony
pnpm db:migrate:local              # = DATABASE_URL=postgres://monopilot:monopilot@127.0.0.1:5432/monopilot pnpm db:migrate
```
Weryfikacja, że rola RLS istnieje:
```bash
psql 'postgres://monopilot:monopilot@127.0.0.1:5432/monopilot' -c "\du app_user"
```

### Krok 2 — seed użytkownika harnessu
```bash
psql 'postgres://monopilot:monopilot@127.0.0.1:5432/monopilot' -f /tmp/harness-user.sql
```
(treść pliku — §4.2)

### Krok 3 — odblokowanie harnessu (usunięcie martwego storageState)
```bash
mv apps/web/e2e/.auth/user.json apps/web/e2e/.auth/user.json.PROD-STALE.bak
```

### Krok 4 — środowisko powłoki (nadpisuje `.env.local`, nie dotyka pliku)
```bash
cd /Users/mariuszkrawczyk/Projects/monopilot-kira
export DATABASE_URL='postgres://monopilot:monopilot@127.0.0.1:5432/monopilot'
export DATABASE_URL_OWNER="$DATABASE_URL"
export DATABASE_URL_APP='postgres://app_user:app-user-test-password@127.0.0.1:5432/monopilot'
export APP_USER_PASSWORD='app-user-test-password'
unset PLAYWRIGHT_BASE_URL        # KONIECZNE: gdy ustawione, spec pójdzie tam zamiast na harness
unset PLAYWRIGHT_AUTH_STORAGE PLAYWRIGHT_AUTH_STORAGE_STATE
```
Sanity-check, że nie celujesz w prod:
```bash
echo "$DATABASE_URL" | grep -q '127.0.0.1' && echo OK-LOCAL || echo "STOP: nie-lokalna baza"
```

### Krok 5 — przebieg SEKWENCYJNY
```bash
pnpm exec playwright test apps/web/e2e/walking-skeleton.spec.ts \
  --workers=1 --trace on --reporter=list
```
Wiele speców, nadal jedna przeglądarka naraz:
```bash
pnpm exec playwright test \
  apps/web/e2e/walking-skeleton.spec.ts \
  apps/web/e2e/shell-smoke.spec.ts \
  apps/web/e2e/settings-users-parity-evidence.spec.ts \
  --workers=1 --trace on --reporter=list
```
Cała suita (101 speców; większość zSKIPuje się bez `PLAYWRIGHT_BASE_URL` — to zamierzone):
```bash
pnpm exec playwright test --workers=1 --trace on --reporter=list
```
Lista bez uruchamiania:
```bash
pnpm exec playwright test --list
```
Podgląd trace:
```bash
pnpm exec playwright show-trace apps/web/e2e/test-results/<katalog-testu>/trace.zip
```

### Wariant B — własny serwer + `PLAYWRIGHT_BASE_URL`

Działa tylko dla speców, które i tak wymagają `PLAYWRIGHT_BASE_URL`, i **nadal potrzebuje
fałszywego Supabase** — inaczej layout `(app)` zrobi `redirect('/en/login')`
(`layout.tsx:132-134`), a login nie przejdzie (§2.2). Nie ma tu skrótu:
`DEV_AUTH_BYPASS` sam nie wpuszcza do aplikacji. Jeśli mimo to chcesz osobny serwer,
skopiuj mechanikę z `shell-parity.ts:178-202` do własnego skryptu — **nie ruszaj `.env.local`**.

---

## 6. Katalog speców E2E

**101 plików `*.spec.ts`**, wszystkie pod `apps/web/e2e/` (89 płasko + 12 w `apps/web/e2e/settings/`).
Pliki nie-spec: `_helpers/mrp-fulfilment.ts`, `_helpers/shell-parity.ts`, `_shared/parity-login.ts`,
`settings/_catalog.ts`, `settings/_runner.ts`, `settings/auth.setup.ts`,
`settings/playwright.auth-setup.config.ts`.
`apps/web/e2e/artifacts/` i `apps/web/e2e/parity-evidence/` to wyjścia, nie testy.

### 6.1 Flow-specy — pełne ścieżki biznesowe (logowanie formularzem, sterowanie żywym UI)

| Spec | Co dowodzi (jedno zdanie) |
|---|---|
| `order-to-ship-flow.e2e.spec.ts` | SO → confirm → allocate → shipment → pack (SSCC-18) → ship (BOL) → POD → delivered, plus ogon PO→GRN→LP z walutą WAC; `delivered` nie może się cofnąć. |
| `npd-create-to-wo-flow.e2e.spec.ts` | Kreator NPD → mint FG (bez wyrzucenia na `/fg`) → recepta z bramką „ma składnik" → packaging z dostawcą → produkcja → WO; każdy szew twardo asertowany. |
| `purchasing-chain-e2e.spec.ts` | PO powstaje wyłącznie jako `draft`, przechodzi draft→sent→confirmed→received, receipt materializuje AVAILABLE LP i wycenia we WŁASNEJ walucie PO. |
| `npd-full-lifecycle.spec.ts` | Brief → projekt → G0-G2 → G3 z e-podpisem → kandydat FG → G4 release-to-factory → closeout „Launched". |
| `npd-to-production-chain-overlap.spec.ts` | Wydany FG buduje łańcuch WO (FG + WIP przez `wo_dependencies`), a tablica harmonogramu wykrywa nakładanie na jednej linii (`data-conflict="true"`). |
| `fulfilment-allocate-pack-ship-pod.spec.ts` | SO → allocate → pick/pack → seal (SSCC-18) → ship → POD → delivered; `quantity_allocated` nigdy nie przekracza `quantity_ordered`. |
| `mrp-so-demand-netting.spec.ts` | Różnicowo na jednym SO: draft nie generuje popytu MRP, confirmed generuje (≥ D0+qty), cancelled wycofuje — bez zależności od czystej bazy. |
| `npd-project-gate-flow.spec.ts` | T-062: utworzenie projektu NPD i przejście G0→G1→G2 z zatwierdzeniem G3 e-podpisem. |
| `npd-create-project-wizard.spec.ts` | 4-krokowy kreator „Create NPD project" (Basics → Brief → Starting point → Review) przechodzi do końca. |
| `npd-project-detail-header-rail.spec.ts` | Detal projektu NPD: nagłówek + 8-stopniowy rail operacyjny + parity etapu Brief. |
| `technical-bom-row-actions-parity-evidence.spec.ts` | Akcje wiersza komponentu BOM + deep-link item→BOM na żywym ekranie Technical. |
| `technical-eco-parity-evidence.spec.ts` | Change Control (ECO): lista + modal tworzenia + stan pusty na `/{locale}/technical/eco`. |
| `technical-i18n-pl-parity-evidence.spec.ts` | Sub-nav i dashboard Technical rozwiązują etykiety przez next-intl na realnym `/pl/technical`. |

### 6.2 Specy pod lokalny harness (11) — startują `startLocalShellParityHarness()`

`walking-skeleton.spec.ts` (klik przez KAŻDĄ pozycję menu + widoczne wiązanie danych; tryb ścisły
przez `WALKING_SKELETON_REQUIRE_DB=1`), `shell-smoke.spec.ts` (kontrakt regionów shella +
`aria-current` dla wszystkich tras sidebara, pisze `parity_report.json`),
`settings-infra-locations-modal-crud.spec.ts`, oraz parity-evidence: `settings-boms`,
`settings-devices`, `settings-gallery`, `settings-shifts`, `settings-ship-override-reasons`,
`settings-units`, `settings-users`.
**To są jedyne specy, które da się uruchomić lokalnie od zera bez Supabase.**

### 6.3 Specy strukturalne (nie potrzebują serwera ani sesji)

`route-topology.spec.ts`, `module-nav-route-contract.spec.ts`, `scanner-isolation.spec.ts`,
`scanner-wo-flow.spec.ts` (jawnie oznaczony „STUB spec"), `settings-subnav.spec.ts`,
`planning-po-import.spec.ts` — czytają drzewo `app/` z dysku. Przechodzą zawsze.

### 6.4 Reszta

~25 speców na `storageState` (grupa `settings/*` + `npd-*` + `onboarding-wizard`,
`invite-accept`, `reference-csv`, `d365-toggle`, `users-categories`) — bez świeżego
`.auth/user.json` zSKIPują się z notatką `BLOCKED_AUTH` (`e2e/settings/_runner.ts:20-24`).
Pozostałe parity-evidence (quality-*, production-*, scheduler, yard, warehouse, changeovers)
to głównie statyczne harnessy HTML / kontrakty DOM.

---

## 7. Ryzyka — konkretnie, z nazwą mechanizmu i plikiem

### R1 (KRYTYCZNE) — `.env.local` wskazuje prod i wciągnie Cię tam po cichu
Trzy pliki `.env.local` (root, `apps/web/`) definiują `DATABASE_URL`, `DATABASE_URL_OWNER`,
`DATABASE_URL_APP`, `SUPABASE_SERVICE_ROLE_KEY`. `apps/web/next.config.mjs:33` wypełnia tylko
zmienne `undefined`, więc **wystarczy zapomnieć o jednym `export` i dev server jedzie na produkcji**.
Zawsze uruchamiaj sanity-check z Kroku 4. Nie edytuj `.env.local`.

### R2 (KRYTYCZNE) — logowanie formularzem nie zadziała
Supabase Auth / GoTrue, `apps/web/app/[locale]/(auth)/login/_actions/auth.ts:40`. Szczegóły §2.2.
Konsekwencja: 13 flow-speców z §6.1 **nie da się uruchomić lokalnie bez przepisania ich `signIn`**
(a to byłaby zmiana kodu testów). Lokalnie realnie dostępne są specy z §6.2 i §6.3.

### R3 (WYSOKIE) — martwy `apps/web/e2e/.auth/user.json` blokuje harness
`resolveAuthStorageState()`, `shell-parity.ts:112-122` — nie da się wyłączyć zmienną środowiskową.
Bez przeniesienia pliku `walking-skeleton` i `shell-smoke` NIE wystartują harnessu, tylko pojadą
na `http://127.0.0.1:3000` z nieważnym ciasteczkiem prod-owym i wywalą się na `redirect → /login`.

### R4 (WYSOKIE) — brak wiersza `public.users` = wysyp Server Actions
`with-org-context.ts:243-250` rzuca `no public.users row resolves org_id for verified user`.
Uid harnessu (`11111111-1111-4111-8111-111111111111`, `shell-parity.ts:134`) nie istnieje
w klonie prod-danych. Seed z §4.2 jest obowiązkowy.

### R5 (WYSOKIE) — delta major Postgresa 16 vs 17
Prod to 17.6, lokalnie 16.13. 509 migracji, najwyższa `543-*`. Ryzyko realne przy:
- `packages/db/migrations/320-dock-appointment-no-overlap-excl.sql:5` — `create extension if not exists btree_gist`
  (constraint EXCLUDE); ekstensja musi być zainstalowana w Homebrew PG16.
- `packages/db/migrations/001-baseline.sql:4` i `037-settings-core.sql:5` — `create extension if not exists citext`.
Jeśli `contrib` nie jest zainstalowane, migracje padną na starcie — sprawdź
`psql -c "select * from pg_available_extensions where name in ('citext','btree_gist')"`.

### R6 (ŚREDNIE) — pgcrypto poza `search_path` (znana pułapka z historii repo)
`packages/db/migrations/517-npd-g4-definition-esign-freeze.sql` używa `digest()` (pgcrypto);
`521-npd-gate-approval-subject-hash-builtin-sha256.sql` migruje to na wbudowane `sha256()`.
Jeśli lokalna baza zatrzyma się między 517 a 521, e-sign/gate padnie na 42883.
Dojedź migracje do końca (543), nie zatrzymuj się w połowie.

### R7 (ŚREDNIE) — RLS jest realne również lokalnie
`getAppPool()` (`with-org-context.ts:143-153`) przepisuje username na `app_user`
z hasłem `app-user-test-password`, żeby RLS ZADZIAŁAŁ. Jeśli baza została zbudowana `pg_restore`'em
z produkcji bez migracji `000-app-user-role.sql` i `002-rls-baseline.sql`, rola nie będzie miała
grantów i data-plane padnie na `permission denied`. Migracje muszą przejść na tej samej bazie.
(Znana pułapka z pamięci projektu: „local-pg-perm".)

### R8 (ŚREDNIE) — `DEV_AUTH_BYPASS` martwy pod `build`+`start`
`proxy.ts:58-66` ignoruje flagę przy `NODE_ENV=production`. Jeśli uprościsz runbook do
`next build && next start`, stracisz bypass i `NEXT_PUBLIC_SUPABASE_URL` zapiecze się w bundlu.
Zostań przy `next dev`.

### R9 (ŚREDNIE) — harness modyfikuje drzewo `app/` na czas przebiegu
`temporarilyDisableKnownNextDevRouteConflicts()`, `shell-parity.ts:285-319`, **zmienia nazwę katalogu**
`app/[locale]/(app)/(admin)/settings/rules/[rule_code]` → `.__shell-parity-disabled-rule_code`
i przywraca w `close()`. Przerwanie testu SIGKILL-em zostawi katalog przemianowany —
sprawdź `git status` po każdym twardym ubiciu.

### R10 (ŚREDNIE) — Supabase Storage padnie; Realtime/Edge Functions nie istnieją
Fałszywy serwer obsługuje WYŁĄCZNIE `/auth/v1/user` i `/auth/v1/token` — wszystko inne dostaje
404 (`shell-parity.ts:199-200`). Supabase Storage jest realnie używany w 5 miejscach i **każde
z nich padnie lokalnie**:
- `apps/web/lib/storage/npd-attachments.ts:89-101` — `createNpdStorageAdmin()`, czyta
  `NEXT_PUBLIC_SUPABASE_URL` (`:92`) + `SUPABASE_SERVICE_ROLE_KEY` (`:93`), bucket
  `npd-attachments` (`:26`)
- `…/(npd)/pipeline/[projectId]/packaging/_actions/deleteArtworkVersion.ts:58`
- `…/(npd)/pipeline/[projectId]/brief/_actions/delete-brief-attachment.ts:58`
- `…/(modules)/technical/items/_actions/upload-supplier-spec-doc.ts:83,142-143,170`
- `apps/web/app/(npd)/fa/[productCode]/docs/_actions/upload-doc.ts:221`

`packages/db/migrations/279-npd-storage.sql` mimo nazwy to schemat metadanych, nie Storage API.
Realtime (`.channel(`) i Edge Functions (`functions.invoke(`, katalog `supabase/functions`)
**nie występują w repo w ogóle** — te dwa nie są ryzykiem.

### R11 (NISKIE) — brak centralnej walidacji env dla `apps/web`
Nie ma `env.ts`/schematu zod dla web (jest tylko `apps/worker/src/env.ts:8-27,45`, zod + eager throw).
W `apps/web` walidacja jest leniwa i rozproszona: `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` czytane
z `?? ''` (`lib/auth/supabase-server.ts:30-31`), `SUPABASE_SERVICE_ROLE_KEY` też `?? ''`
(`lib/storage/npd-attachments.ts:93`). **Skutek: literówka w nazwie zmiennej nie wywali startu —
zobaczysz ją dopiero jako dziwny błąd w środku testu.** Odpal sanity-check z Kroku 4 zamiast
polegać na tym, że aplikacja się „nie podniesie".
Dodatkowo `scripts/verify-supabase-config.ts:34-44` czyta `SUPABASE_URL` (bez `NEXT_PUBLIC_`) —
inna zmienna niż runtime; nie jest wpięty w `build` ani `ci`.

### R12 (NISKIE) — brak trace przy domyślnych ustawieniach
`trace: 'on-first-retry'` + `retries: 0` (`playwright.config.ts:23,27`). Zawsze dopisuj `--trace on`,
inaczej po porażce zostanie Ci tylko screenshot.

### R13 (NISKIE) — `@axe-core/playwright` opcjonalny
`e2e/settings/_runner.ts:69-83` i `npd-full-lifecycle.spec.ts` importują go dynamicznie i degradują
do `axe_unavailable` (nigdy nie fałszują PASS). Brak paczki nie wywali przebiegu, ale a11y nie zostanie sprawdzone.

---

## 8. Czego świadomie nie zrobiono

- Nie uruchomiono żadnego testu ani builda (zadanie READ-ONLY).
- Nie edytowano `.env.local`, kodu aplikacji ani `playwright.config.ts`.
- `scripts/test-db.sh` jeszcze nie istnieje na dysku — Krok 1 zakłada tor równoległy.
