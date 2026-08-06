# E2 — Konektory MCP i integracje

Data: 2026-08-06. Raport **CZĘŚCIOWY** (patrz „Czego nie zdążyłem").

Każdy fakt oznaczony:
- **[ZMIERZONE]** — sprawdziłem w tej sesji, komenda i wynik poniżej.
- **[Z PAMIĘCI]** — wiem z treningu, **NIE zweryfikowałem** dziś w sieci. Traktuj jak hipotezę.

---

## Streszczenie dla właściciela (telefon)

Trzy rzeczy, które zmierzyłem, a które zmieniają obraz:

1. **Obserwowalność jest już zbudowana i wyłączona.** Sentry, OpenTelemetry i PostHog
   są w kodzie. Żaden nie ma ustawionej zmiennej na produkcji. Sentry sam się wycisza
   jednym `if (!dsn)`. To nie jest „trzeba wdrożyć Sentry" — to jest **jedna zmienna
   środowiskowa**.
2. **Powiadomienie na telefon nie wymaga niczego nowego.** ntfy już działa (KORA),
   telefon już subskrybuje. Wysyłka to jeden `curl`. Zweryfikowałem: HTTP 200.
3. **`vercel logs` NIE daje historii błędów** — tylko strumień na żywo. Jedyna droga do
   „dlaczego prod sypie 500" to konektor MCP albo panel. To realny argument za naprawą
   konektora, nie wygoda.

---

## 1. Mamy i działa

### 1.1 Vercel CLI (nie MCP) — uwierzytelniony, tylko odczyt **[ZMIERZONE]**

- **Ból:** #2 (nie wiem, czy prod się wdraża), #4 (stan migracji).
- **Co robi:** `vercel whoami` → `codermariusz`. `vercel ls`, `vercel env ls production`,
  `vercel inspect <url>` — wszystkie działają bez logowania, token już na dysku.
- **Odczyt czy zapis:** te cztery komendy to **czysty odczyt**. `vercel env add`,
  `vercel deploy`, `vercel env rm` to zapis — nie używać z automatu.
- **Koszt wdrożenia:** zero, już działa.
- **Ryzyko:** ten sam token umie też deployować i podmieniać zmienne środowiskowe.
  Nie ma trybu „tylko odczyt" per token.
- **Plan:** darmowe.

**To jest ważne:** martwy konektor MCP Vercela **nie odcina** dostępu do Vercela.
CLI działa. To jest obejście na dziś.

### 1.2 `gh` CLI — uwierzytelniony **[ZMIERZONE]**

- **Ból:** #1 (CI czerwone i nikt nie wie).
- **Co robi:** `gh auth status` → zalogowany jako `CoderMariusz`. `gh run list`,
  `gh run view --log-failed` działają.
- **Odczyt czy zapis:** odczyt. (`gh` umie też pisać — PR, issue, workflow dispatch.)
- **Koszt:** zero.
- **Ryzyko:** token `gho_` ma zakres użytkownika, nie tylko repo.
- **Plan:** darmowe.

**Zmierzony wynik, który to uzasadnia:**
`gh run list --branch main --limit 100` → **100 przebiegów na 100 = `failure`**.
`gh run list --status success` → **pusto**. Zero zielonych w ostatnich 100 przebiegach.

### 1.3 ntfy — działa, telefon podpięty **[ZMIERZONE]**

- **Ból:** #1, #2, #5 (raporty na telefon).
- **Co robi:** `/Users/mariuszkrawczyk/Projects/kora/ops/ntfy.py`, konfiguracja
  w `kora/config.yaml`: `url: https://ntfy.sh`, temat właściciela
  `kora-owner-8Dj1bYOlaOHfh2VQ`. Telefon już subskrybuje (KORA).
- **Zweryfikowałem publikację** (temat jednorazowy, nikt nie subskrybuje, żeby nie
  budzić właściciela):
  `curl -d "..." https://ntfy.sh/mk-e2-audit-probe-9f3a2c` → **HTTP 200**, wiadomość przyjęta.
- **Odczyt czy zapis:** wysyłka powiadomień. **Nie dotyka ani bazy, ani repo.**
- **Koszt:** zero. Kanał istnieje.
- **Ryzyko:** tematy na `ntfy.sh` są **publiczne dla każdego, kto zna nazwę**. Losowy
  sufiks to jedyna ochrona. **Nie wkładaj do treści danych produkcyjnych ani sekretów** —
  tylko „CI padło, link". Do repo wchodzi nazwa tematu, więc użyj **osobnego tematu dla CI**,
  nie `kora-owner-*` (ten jest w prywatnym repo KORY i nie powinien trafić do monopilota).
- **Plan:** darmowe.

### 1.4 Sentry / OpenTelemetry / PostHog — **kod jest, produkcja ciemna** **[ZMIERZONE]**

Wpisuję to tutaj, bo *biblioteki* są zainstalowane i działają. Wyłączona jest konfiguracja.

- **Ból:** #3 (nie wiem, czy apka się wywala).
- **Co jest:** `apps/web/sentry.{server,client,edge}.config.ts`, `apps/web/instrumentation.ts`,
  pakiet `packages/observability` (logger, tracer, meter, `redactBeforeSend`),
  `posthog-node` w `apps/web/package.json`.
- **Dlaczego jest ciemna** — `apps/web/sentry.server.config.ts`:
  ```ts
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) { ...warn('SENTRY_DSN is unset; Sentry web server SDK disabled'); }
  ```
  `vercel env ls production` pokazuje **15 zmiennych i żadnej z SENTRY_*, POSTHOG_* ani OTEL_***.
  W `.env.local` też brak (`grep -c SENTRY` → `0`). `.env.example` ma `SENTRY_DSN=""`.
- **Wniosek:** to jest podręcznikowa **„zieleń przez pominięcie"** — wzorzec, który
  właściciel zna z audytu 30.07. Kod udaje, że ma obserwowalność. Produkcja nie raportuje nic.

---

## 2. Mamy i nie działa

### 2.1 Konektor MCP Vercel — token wygasł **[ZMIERZONE]**

- **Ból:** #3 (historia błędów runtime), #2.
- **Odtworzone dosłownie:** wywołanie `list_teams` → błąd
  `MCP server "plugin:vercel:vercel" requires re-authorization (token expired)`.
- **Co tracimy przez to, czego CLI NIE zastępuje** — i to jest sedno:
  konektor ma `get_runtime_errors` (pogrupowane klastry błędów: nazwa, liczba wystąpień,
  trasy, pierwszy/ostatni raz) i `get_runtime_logs`.
  **Zmierzyłem `vercel logs` jako zamiennik i to nie jest zamiennik:**
  ```
  Displaying runtime logs ... starting from Aug Th 11:52:36.53
  waiting for new logs...
  WARN! Command automatically interrupted after 5 minutes.
  ```
  CLI pokazuje **tylko strumień od teraz w przód**, ubijany po 5 minutach. **Zero historii.**
  Czyli na pytanie „czy prod się wywalał w nocy" CLI **nie odpowie**. Konektor albo panel.
- **Odczyt czy zapis:** konektor ma **jedno i drugie**. Obok odczytu ma `deploy_to_vercel`,
  `buy_domain`, `buy_pro`, `buy_credits`. To nie jest konektor tylko do odczytu.
- **Jak odnowić:** ponowna autoryzacja jest **interaktywna, przez przeglądarkę** — właściciel
  musi ją kliknąć. **[Z PAMIĘCI, NIEZWERYFIKOWANE]** że da się to obejść długowiecznym
  tokenem API; nie potwierdziłem dziś. **To jest dokładnie ta rzecz, która wysypie się
  znowu w środku nocy.**
- **Ryzyko, jeśli agent się pomyli:** `deploy_to_vercel` wypycha na produkcję.
  `buy_*` **wydaje pieniądze**. Agent z tym konektorem i złym kontekstem może wdrożyć
  niesprawdzony kod na system identyfikowalności żywności.
- **Plan:** konektor darmowy; głębokość danych zależy od planu Vercela **[NIEZWERYFIKOWANE]**.

**Rekomendacja:** odnów, ale traktuj jako narzędzie **diagnostyczne w sesji z właścicielem**,
nie jako stały dostęp agenta nocnego. Nocny agent ma mieć Sentry, nie klucz do deploya.

### 2.2 Integracja Vercel ↔ GitHub — produkcja stoi 7 dni za repo **[ZMIERZONE]**

- **Ból:** #2, wprost.
- **Liczby:**
  - `origin/main` HEAD = `2ba3b95d`, **2026-08-06 05:22**.
  - Najnowsze wdrożenie produkcyjne (`vercel ls`) = **7 dni temu**, `vercel inspect`:
    utworzone **Thu Jul 30 07:59**, alias `monopilot-kira-git-main-…` → było wyzwolone z gita.
  - Po 30.07 CI zarejestrowało pushe na `main` **2026-08-02 17:53** i **2026-08-06 07:43**.
  - `vercel ls` nie pokazuje w tym oknie **żadnego** wdrożenia — nawet nieudanego.
- **Wniosek:** GitHub przyjął commity, których Vercel **nigdy nie zobaczył**. Gdyby webhook
  działał, a build padał, byłyby wdrożenia ze statusem `Error`. Ich nie ma. Integracja milczy.
- **Sprostowanie do tezy o `[]`:** `gh api repos/CoderMariusz/monopilot-kira/hooks` → `[]`
  **[ZMIERZONE]**, ale **to samo w sobie NIE jest dowodem rozłączenia**. Vercel podpina się
  przez **GitHub App**, a aplikacje nie zakładają webhooków na poziomie repo — dostarczają
  zdarzenia własnym kanałem. Pusta lista jest **normalna** dla integracji przez App.
  Próbowałem sprawdzić instalację Appki i **nie dało się tokenem użytkownika**:
  `gh api repos/.../installation` → 401, `gh api user/installations` → 403 (wymaga tokenu
  autoryzowanego dla App). **Rozstrzygnięcie wymaga panelu Vercela:**
  Project → Settings → Git. To jest **jedna rzecz do kliknięcia przez właściciela**.
- **Dowód, że to nie wina builda:** `apps/web/vercel.json` ma
  `buildCommand: pnpm --filter @monopilot/db migrate && … pnpm build`, ale nawet gdyby
  migracja padała, powstałoby wdrożenie `Error`. Nie powstało nic.

### 2.3 Konektor MCP Supabase — nigdy nie podłączony **[ZMIERZONE]**

- Wystawia wyłącznie `authenticate` / `complete_authentication`. To znaczy: OAuth nigdy
  nie przeszedł. Nie ma ani jednego narzędzia roboczego.
- **Czy rozwiązałby dzisiejszy ból (klasyfikator zablokował psql do produkcji)?**
  Częściowo — i z ważnym zastrzeżeniem. **[Z PAMIĘCI, NIEZWERYFIKOWANE DZIŚ]** serwer
  Supabase MCP łączy się przez **Management API**, nie przez `DATABASE_URL`, więc
  faktycznie nie wymagałby poświadczeń bazy w `.env.local`. Ma flagi `--read-only`,
  `--project-ref` i `--features`.
- **Ale cel „bez poświadczeń na dysku" jest już przegrany** **[ZMIERZONE]**:
  `.env.local` **już zawiera** `DATABASE_URL`, `DATABASE_URL_OWNER`, `DATABASE_URL_APP`
  i `SUPABASE_SERVICE_ROLE_KEY`. Konektor niczego tu nie uszczelni — dołoży drugą drogę
  do tej samej bazy. Blokada psql jest blokadą **narzędzia**, nie **poświadczeń**.
- **Ryzyko — i dlatego nie stawiam tego wysoko:** to jest system identyfikowalności
  żywności. **[Z PAMIĘCI, WYMAGA WERYFIKACJI]** istnieje opublikowane badanie
  bezpieczeństwa o wstrzykiwaniu poleceń przez **treść wierszy w bazie** (agent czyta
  tabelę, w wierszu siedzi instrukcja, agent ją wykonuje) oraz oficjalne ostrzeżenie
  Supabase, żeby **nie podłączać MCP do produkcji**. Nie potwierdziłem tego dziś w sieci
  i **nie rekomenduję zapisu do prod bez tej weryfikacji**.
- **Co się stanie, jeśli agent się pomyli przy zapisie:** `apply_migration` na
  produkcyjnej bazie identyfikowalności = zmiana danych o partiach mięsa. To jest
  materiał na utratę zgodności regulacyjnej, nie na rollback commita. **Nieodwracalne
  w sensie prawnym, nawet jeśli odwracalne technicznie.**

**Werdykt:** patrz sekcja „warto dodać" — tylko odczyt, tylko z `--read-only`.

---

## 3. Warto dodać

Uszeregowane po **ilości zdejmowanego ryzyka**, nie po funkcjach.

### 3.1 [NAJWYŻSZY ZWROT] Powiadomienie ntfy przy czerwonym `main`

- **Ból:** #1 — CI czerwone **miesiąc**, 100/100 przebiegów `failure`, nikt się nie dowiedział.
  **Zmierzone: `.github/` nie zawiera ani jednego odwołania do
  `ntfy|slack|notif|webhook|discord|telegram`.** Nie ma kanału. To jest cała przyczyna.
- **Co robi:** osobny job na końcu `ci.yml`, `needs: [wszystkie]`, `if: failure()`, jeden `curl`.
  Osobny job (nie krok w istniejącym) — inaczej złapie tylko własną gałąź.
- **Odczyt czy zapis:** **ani jedno, ani drugie.** Wysyła powiadomienie. Zerowy dostęp do bazy i prod.
- **Koszt:** ~10 linii YAML. Infrastruktura już stoi, publikacja zweryfikowana (HTTP 200).
- **Ryzyko:** praktycznie zero. Najgorszy przypadek — fałszywy alarm. Temat trzymaj
  w sekrecie repo (`NTFY_TOPIC`), nie w YAML-u, bo repo widzi go każdy z dostępem.
- **Plan:** darmowe.

### 3.2 Ustawić `SENTRY_DSN` na produkcji

- **Ból:** #3 — i #4 pośrednio, bo **6 cronów** z `apps/web/vercel.json` (`drift`, `d365-pull`,
  `catch-weight-variance`, `outbox` co 5 min, `reporting-refresh`, `pm-schedule-due`)
  chodzi co noc **bez żadnego raportowania błędów**. Właściciel miał już awarię crona
  (`pg_catalog.current_date`), która przeszła niezauważona.
- **Co robi:** włącza kod, który już jest napisany, przetestowany i ma `redactBeforeSend`.
- **Odczyt czy zapis:** **wyłącznie wychodząca telemetria.** Sentry nie sięga do bazy.
- **Koszt:** założyć projekt Sentry + `vercel env add SENTRY_DSN production` + redeploy.
  **Zero zmian w kodzie.**
- **Ryzyko:** dane osobowe w śladach błędów — `redactBeforeSend` już istnieje w
  `packages/observability`, **ale należy sprawdzić, co dokładnie czyści**, zanim
  system z danymi produkcyjnymi zacznie wysyłać ślady na zewnątrz. To jedyna
  realna przeszkoda i jest do zweryfikowania w kodzie.
- **Plan:** Sentry ma darmowy pułap **[dokładne limity NIEZWERYFIKOWANE]**.

### 3.3 Czujnik zastoju („dead man's switch") — jeden cron w Actions

- **Ból:** #2 i #4. Wykrywa **brak zdarzenia**, a nie zdarzenie. To jest jedyna klasa
  monitoringu, która łapie „webhook cicho przestał działać" — bo tam nic się nie dzieje.
  Gdyby to stało 30.07, właściciel wiedziałby **31.07**, a nie po tygodniu.
- **Co robi:** `schedule:` co 6 h; sprawdza dwie rzeczy i pcha do ntfy, jeśli któraś zła:
  1. wiek ostatniego wdrożenia produkcyjnego (`vercel ls`, próg np. 48 h),
  2. konkluzja ostatniego przebiegu CI na `main` (`gh run list`).
  Obie komendy **zweryfikowałem, że działają i zwracają te dane**.
- **Odczyt czy zapis:** odczyt + powiadomienie. Nic nie wdraża, nic nie zmienia.
- **Koszt:** ~30 linii YAML + `VERCEL_TOKEN` i `NTFY_TOPIC` w sekretach repo.
- **Ryzyko:** `VERCEL_TOKEN` w sekretach GitHuba umie też deployować (Vercel nie daje
  tokenów tylko do odczytu) — to jest realny koszt tego rozwiązania.
  **[Z PAMIĘCI, NIEZWERYFIKOWANE]** GitHub wyłącza `schedule:` po 60 dniach bez
  aktywności w repo — przy tym tempie commitów nieistotne, ale warto znać.
- **Plan:** darmowe w praktyce (kilka minut miesięcznie).

### 3.4 Supabase MCP — **wyłącznie tryb odczytu**, i dopiero po weryfikacji

- **Ból:** #4 (stan migracji), zablokowany psql.
- **Co robi:** pozwoliłby zapytać produkcyjną bazę bez psql. Na dziś stan migracji jest
  ustalony i **bez konektora** — koordynator zmierzył: **prod na 544, repo na 564,
  łańcuch stanie na 551** do decyzji właściciela. Czyli konektor nie jest tu warunkiem
  koniecznym, tylko wygodą.
- **Odczyt czy zapis:** **wolno wyłącznie odczyt.** `--read-only`, `--project-ref`
  przypięty do jednego projektu.
- **Ryzyko przy pomyłce agenta:** opisane w 2.3. Zapis = dane o partiach mięsa.
- **Warunek wstępny:** potwierdzić w oficjalnej dokumentacji, że `--read-only` wymusza
  **rolę read-only w Postgresie**, a nie tylko sugestię w prompcie. Jeśli to tylko
  poziom promptu — **odradzam całkowicie na produkcji**.
- **Plan:** serwer darmowy **[NIEZWERYFIKOWANE]**.

---

## 4. Odradzam

- **Jakikolwiek konektor z ZAPISEM do produkcyjnej bazy** (`apply_migration`, `execute_sql`
  bez `--read-only`). Identyfikowalność żywności: błąd agenta to nie regresja, to
  utrata zgodności. Migracje mają iść jedyną istniejącą drogą — przez repo i build.
- **Konektor Vercel jako stały dostęp agenta nocnego.** Ma `deploy_to_vercel` i `buy_*`
  w tym samym zestawie co odczyt. Nie da się wziąć samego odczytu. Do sesji z właścicielem — tak.
- **Google Workspace / Canva / Gmail / Kalendarz** — obecne w sesji, **zero związku**
  z bólami 1–5. Nie rozwiązują niczego w tym projekcie. Pomijam.
- **Context7** — przydatny do dokumentacji bibliotek, ale nie zdejmuje **żadnego** z pięciu
  bólów. Neutralny, zostaw jak jest.
- **Nowy SaaS do powiadomień** (Slack, Discord, PagerDuty) — ntfy już stoi i telefon już
  subskrybuje. Dokładanie kanału to koszt bez zysku.

---

## 5. Czego nie zdążyłem

Uczciwie: **trzy zlecone zadania badawcze w sieci nie wróciły przed wyczerpaniem budżetu.**
Wszystko powyżej opiera się na pomiarach lokalnych, nie na weryfikacji w sieci.
Nie zacytowałem ani jednego wyniku, którego nie widziałem — pozycje **[Z PAMIĘCI]** są
oznaczone właśnie dlatego.

Do dokończenia, w kolejności ważności:

1. **Supabase MCP — bezpieczeństwo.** Czy `--read-only` egzekwuje rolę read-only
   w Postgresie, czy to tylko prompt. Znaleźć opublikowane badanie o wstrzykiwaniu
   przez treść wierszy i oficjalne stanowisko Supabase wobec produkcji.
   **To rozstrzyga punkt 3.4 i jest jedyną rzeczą, która może go zamienić w „odradzam".**
2. **Vercel MCP — czy da się uniknąć wygasania.** Czy istnieje wariant na długowiecznym
   tokenie API zamiast OAuth. Jeśli tak, nocna praca przestaje się wywracać o re-autoryzację.
3. **Retencja i plan Vercela** — ile historii błędów runtime realnie widać na obecnym
   planie i czy `get_runtime_errors` w ogóle ma z czego czytać.
4. **Darmowy pułap Sentry** — limity zdarzeń i retencji.
5. **Czy `redactBeforeSend` w `packages/observability` faktycznie czyści dane osobowe.**
   To jest lokalne, do przeczytania w kodzie — warunek wstępny dla punktu 3.2.

**Jedna rzecz do kliknięcia przez właściciela, niezależnie od reszty:**
Vercel → Project → Settings → Git. Sprawdzić, czy repo jest wciąż podpięte.
Zmierzone: produkcja stoi 7 dni i 2 pushe za `origin/main`.
