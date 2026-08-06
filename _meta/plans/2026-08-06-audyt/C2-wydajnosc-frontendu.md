# C2 — Wydajność frontendu, buildu i suit testowych

Audyt 2026-08-06 · gałąź `main` @ `ebfca8fa` · **raport CZĘŚCIOWY** (budżet sesji
przecięty w połowie; sekcja „Czego nie zdążyłem" na końcu).

**Niczego nie naprawiałem.** Jedyne artefakty poza `/tmp` to przebudowany `apps/web/.next`
(ignorowany przez git). `git status` na plikach roboczych bez zmian z mojej strony.

---

## Uczciwe zastrzeżenie do wszystkich liczb

Mierzyłem na maszynie deweloperskiej, na której **równolegle pracowały inne tory**.
`load average` w trakcie pomiarów: **4,12 → 14,80 przy 10 rdzeniach**. Dlatego:

- **Każdy pomiar powtórzony co najmniej raz.** Podaję obie/trzy wartości.
- **Czas ściany (`real`) jest niestabilny** — build ×3: 31,4 s / 41,5 s / 70,5 s.
  Ta sama komenda, ten sam commit. **Nie wyciągaj z tego wniosków o regresji.**
- **Czas CPU (`user`) jest stabilny** — te same trzy przebiegi: 101,4 s / 108,5 s / 122,9 s.
  Liczby, którym ufam, to **udziały procentowe i rozmiary bajtów** — te nie zależą od obciążenia.
- Rozmiary paczek (bajty na dysku) są **deterministyczne** — tu nie ma niepewności.

---

## Streszczenie — co warto zlecić

| # | pozycja | korzyść | koszt | ryzyko |
|---|---|---|---|---|
| **C2-1** | `@zxing` ładowany zachłannie na 11 ekranach skanera — **89 kB brotli = 72 % JS strony** | −72 % JS na skanerze | S | niskie |
| **C2-2** | Faza TypeScript to **połowa czasu builda**, a `tsc` chodzi w CI **drugi raz** osobnym jobem | −15…39 s z każdego builda | S | średnie |
| **C2-3** | **19 tras nieosiągalnych** (bez prefiksu `[locale]`) — proxy przekierowuje 307 zanim dojdzie do strony | mniejsza powierzchnia buildu, koniec dwóch drzew | M | średnie |
| **C2-4** | Suita UI (3 588 testów) **nigdy nie chodzi** — `&&` po czerwonej suicie node | 3 588 testów wraca do CI | S | niskie |
| **C2-5** | 34 wywołania rewalidacji **wewnątrz** transakcji (brief mówił o 78 — połowa już naprawiona) | koniec ryzyka rollbacku | M | niskie |
| **C2-6** | 89 z 305 stron ładuje ≥2 loadery **sekwencyjnie**, każdy w osobnej transakcji | ~5 round-tripów mniej na stronę | M | **wysokie** |
| — | duplikat pliku testowego `apps/web/apps/web/…` | −1 martwy plik | S | zerowe |

---

## C2-1 · Biblioteka kodów kreskowych to 72 % paczki ekranu skanera

**co** — Wszystkie 11 ekranów skanera magazynowego pobiera całą bibliotekę `@zxing`
(dekodery PDF417, Aztec, MaxiCode…) **przy wejściu na stronę**, mimo że kamera otwiera się
dopiero po kliknięciu przycisku, a komponent do tego czasu nie renderuje nic.

**gdzie**
- `apps/web/components/shell/camera-scanner-overlay.tsx:33-34` — statyczny import
- `apps/web/components/shell/camera-scanner-overlay.tsx:250` — `if (!open) return null;`
- 9 ekranów importuje statycznie, m.in.
  `apps/web/app/[locale]/(scanner)/scanner/pick/_components/pick-screen.tsx:43`,
  `.../move/_components/move-screen.tsx:44`, `.../putaway/_components/putaway-screen.tsx:44`

**dowód — pomiar, nie szacunek**

Z `.next/server/app/**/page_client-reference-manifest.js` policzyłem sumę unikalnych chunków
na trasę, po czym zważyłem każdy plik i skompresowałem brotli:

```
chunk 0xvwevad2dbym.js   raw 463 kB   gzip 118 kB   brotli 89 kB
  → używany przez dokładnie 11 tras — wszystkie to /(scanner)/scanner/*
  → markery w treści chunka: PDF417 ×47, ITF ×5, Aztec ×1
```

Najcięższe trasy w całej aplikacji (brotli / raw):

```
125 / 599 kB   /[locale]/(scanner)/scanner/receive-po/[poId]/[lineId]
124 / 599 kB   /[locale]/(scanner)/scanner/wos/[woId]/consume
123 / 593 kB   /[locale]/(scanner)/scanner/pick
122 / 587 kB   /[locale]/(scanner)/scanner/qa
121 / 585 kB   /[locale]/(scanner)/scanner/receive-po
---------------------------------------------------
 41 kB brotli  ← MEDIANA trasy w aplikacji
```

**89 kB z 123 kB = 72 % paczki ekranu skanera to jedna biblioteka**, która jest potrzebna
dopiero po dotknięciu przycisku aparatu. Ekran skanera to **trasa 3× cięższa od mediany**,
a chodzi na telefonie w hali, po Wi-Fi.

**korzyść** — ekran skanera z 123 kB → ~34 kB brotli (−72 %). To najcięższe trasy aplikacji
i jedyne używane na urządzeniach mobilnych.

**koszt** — S. Jeden `const CameraScannerOverlay = dynamic(() => import(...), { ssr: false })`
zamiast statycznego importu, w 9 plikach.

**ryzyko** — niskie, ale **realne i konkretne**: pierwsze otwarcie kamery czeka na pobranie
89 kB. Na słabym Wi-Fi w chłodni to widoczne opóźnienie. Łagodzenie: prefetch modułu na
`onPointerDown` przycisku aparatu, albo `<link rel="prefetch">` po hydratacji. Testy
`components/shell/__tests__/camera-scanner-overlay.test.tsx` mockują `@zxing/browser` —
`dynamic()` wymaga tam poprawki (mock musi trafić w leniwy import).

**zależy od** — nic.

---

## C2-2 · TypeScript to połowa czasu builda, i CI liczy go dwa razy

**co** — `next build` po skompilowaniu bundla uruchamia **osobną, szeregową fazę `tsc`**,
która trwa tyle samo co cała kompilacja. Ten sam `tsc` chodzi w CI **drugi raz**, jako
niezależny job `pnpm -r typecheck`.

**gdzie**
- `.github/workflows/ci.yml:77` — `pnpm -r typecheck`
- `.github/workflows/ci.yml:92` — `pnpm build` (który w środku znowu odpala `tsc`)
- `apps/web/package.json` — `"build": "next build"`, `"typecheck": "tsc --noEmit"`

**dowód — trzy przebiegi `rm -rf .next && pnpm build`**

| przebieg | Compiled | **TypeScript** | 66 stron | `real` | `user` | warunki |
|---|---|---|---|---|---|---|
| 1 | 13,1 s | **14,8 s** | 119 ms | 31,4 s | 101,4 s | load ~4 |
| 2 | 19,2 s | **18,5 s** | 168 ms | 41,5 s | 108,5 s | równolegle moje greppy |
| 3 | 25,7 s | **38,9 s** | 196 ms | 70,5 s | 122,9 s | load 14,8 (inne tory) |

Rozkład jest **stabilny mimo rozrzutu czasów bezwzględnych**: faza TypeScript to
**47 % / 45 % / 55 %** czasu ściany. Generowanie 66 stron statycznych to **0,2 – 0,3 %** —
**to nie strony są kosztem builda, wbrew założeniu w zleceniu.**

**korzyść** — job `build` w CI skraca się o ~połowę. Przy dzisiejszym rozkładzie to 15–39 s
z każdego builda; typecheck nadal jest sprawdzany, tylko raz zamiast dwóch.

**koszt** — S (`typescript: { ignoreBuildErrors: true }` w `next.config.ts`).

**ryzyko** — **średnie i trzeba je nazwać wprost.** Zdejmujesz bramkę z jobu `build`
i **cała ochrona typów zaczyna wisieć na jobie `typecheck`**. Warunek wstępny: job
`typecheck` musi być **wymagany** do merge'a. Jeśli nie jest — nie ruszaj tego, bo
odtworzysz dokładnie wzorzec z tej nocy („job `build` jest POMIJANY, więc bloker przeżył
tydzień", `BIBLIA-BLEDOW.md`). **Nie zgłaszam tego jako oczywistej wygranej.**

**zależy od** — potwierdzenia, że `typecheck` jest required check w ustawieniach gałęzi.
Tego **nie sprawdziłem** (nie mam dostępu do ustawień repo).

---

## C2-3 · 19 tras zbudowanych i nieosiągalnych

**co** — Aplikacja buduje pełne trasy bez prefiksu języka (`/onboarding/profile`,
`/settings/users`, `/account/profile`…). Proxy przekierowuje każde takie żądanie na wariant
z językiem **zanim dotknie strony**. Te trasy nie mogą obsłużyć ani jednego żądania.

**gdzie**
- `apps/web/proxy.ts:151, 176, 202, 215` — każda ścieżka kończy się `intlHandler(req)`
- `apps/web/proxy.ts:222` — matcher `'/((?!_next|_vercel|.*\\..*).*)'` łapie wszystko
- `apps/web/i18n/routing.ts` — 4 języki `pl, en, uk, ro`, `localePrefix` domyślny = `always`
- drzewa: `apps/web/app/(admin)/` (23 pliki, 10 stron), `apps/web/app/onboarding/` (26 plików, 9 stron)

**dowód — uruchomiony serwer, nie czytanie kodu**

```
$ pnpm exec next start -p 3987      # build z tego commita
$ curl -I http://127.0.0.1:3987/onboarding
307  →  http://127.0.0.1:3987/en/onboarding
$ curl -I http://127.0.0.1:3987/en/onboarding
307  →  http://127.0.0.1:3987/en/onboarding/profile     # ta renderuje
$ curl -I http://127.0.0.1:3987/settings/users
307  →  http://127.0.0.1:3987/login?reason=idle          # bramka auth, też nie dochodzi
```

Z manifestów: **307 tras stron, 285 z prefiksem `[locale]`, 22 bez. 19 z tych 22 ma
bliźniaka z prefiksem.** Pełna lista w `/tmp/c2-routes.json`.

**Odrzucam własną hipotezę, którą miałem po drodze.** Zakładałem, że te trasy dokładają
martwy JS. **Zmierzyłem — nie dokładają:**

```
chunki emitowane WYŁĄCZNIE dla 19 nieosiągalnych tras: 2 pliki, 10 kB raw / 3 kB brotli
```

**To nie jest problem rozmiaru paczki.** To problem powierzchni buildu i utrzymania.

Sprawdziłem też, czy pliki są martwe — **nie są.** `app/(admin)/account/profile/page.tsx`
(871 linii, `'use client'`) jest importowany **jako komponent** przez
`app/[locale]/(app)/(admin)/account/profile/page.tsx:4`. Martwa jest **rola trasy**, nie plik.
Część plików to świadome zaślepki `redirect()` (`LegacySettingsUsersPage`) — one też są
nieosiągalne, więc przekierowania w nich nigdy się nie wykonują.

**korzyść** — o 19 tras mniej do zbudowania i zebrania danych strony; koniec sytuacji, w
której poprawka trafia do jednego z dwóch drzew. Wygrana jest **utrzymaniowa, nie wydajnościowa.**

**koszt** — M. Trzeba rozdzielić „plik-komponent" od „plik-trasa": zostawić moduł, usunąć
`page.tsx` jako trasę.

**ryzyko** — średnie. Zewnętrzne zakładki i linki na `/settings/…` przestaną trafiać w
przekierowanie **jeśli ktoś kiedyś zdejmie `localePrefix: 'always'`**. Dziś proxy i tak je
przechwytuje, więc zachowanie się nie zmienia — ale to trzeba udowodnić testem proxy
(`apps/web/middleware.test.ts` już taki plik ma), a nie założyć.

**zależy od** — nic.

---

## C2-4 · Suita UI (3 588 testów) nie wykonuje się, bo poprzedza ją `&&`

**co** — `pnpm --filter web test` uruchamia suitę node, a suitę UI **dopiero po jej sukcesie**
(`&&`). Suita node jest dziś czerwona → **418 plików i 3 588 testów UI nie chodzi wcale.**

**gdzie**
- `apps/web/package.json` → `"test": "vitest run --config ../../vitest.config.ts … && vitest run --config vitest.ui.config.ts"`
- `.github/workflows/ci.yml:136` → `pnpm -r test`

**dowód — obie suity uruchomione osobno, po dwa razy**

| suita | plików | testów | zdanych | **czerwonych** | pominiętych | `real` #1 | `real` #2 |
|---|---|---|---|---|---|---|---|
| node | 663 | 5 115 | 4 590 | **52** | 473 | 23,9 s | 23,4 s |
| **UI** | **418** | **3 588** | 3 550 | **38** | 0 | 74,5 s | 60,9 s |

Suita node kończy się kodem **1** (`EXIT=1` w `/tmp/c2-node-1.log`) → drugi człon `&&`
nigdy nie startuje. **38 czerwonych testów UI jest dziś niewidocznych dla nikogo.**
Wyniki między przebiegami różnią się o 1 test (52/53 i 38/37) — suita ma drobną niestabilność.

**korzyść** — 3 588 testów wraca do obiegu. To ten sam wzorzec „zieleni przez pominięcie",
który w tym repo mierzono już 5 razy — tu jest szósty, zmierzony.

**koszt** — S. Zamiana `&&` na `;` z agregacją kodu wyjścia (albo dwa osobne skrypty
wołane jako osobne kroki CI).

**ryzyko** — niskie. Uwaga: **CI natychmiast zrobi się bardziej czerwone** (38 nowych
czerwieni). To nie regresja, to ujawnienie. Trzeba to zapowiedzieć, bo inaczej ktoś
„naprawi" to cofnięciem zmiany.

**zależy od** — nic. **Ale to nie jest moja pozycja wydajnościowa** — zgłaszam ją, bo
wypadła z pomiaru czasu suit i jest istotniejsza niż cokolwiek, co znalazłem w samych czasach.

### Czas suit — czego NIE znalazłem (wynik negatywny, też się liczy)

Zlecenie kazało szukać wolnych plików i `beforeEach` stawiającego wszystko od nowa.
**Zmierzyłem i tego tu nie ma:**

- Suita node: **23,4–23,9 s całości**. Najwolniejszy plik —
  `apps/web/lib/navigation/__tests__/shell-nav-integrity.test.ts` — **2,3 s, czyli 10 %.**
  Drugi: `apps/web/i18n/__tests__/icu-template-key-leak.test.ts` — 1,0 s. Reszta poniżej 0,5 s.
- Suita UI: **208 s czasu wykonania plików rozłożone na 418 plików**, wykonane w 61–74 s
  ściany (≈7 workerów). Najwolniejszy plik —
  `.../technical/items/_components/__tests__/item-create-wizard.test.tsx` — **5,3 s = 2,5 %.**
  Top 10 to 17,5 %, top 20 to 26,8 %. **Rozkład jest płaski.**

**Wniosek: nie ma jednego winnego pliku.** Koszt suity UI to „418 razy jsdom + render", a nie
zły fixture. Optymalizacja pojedynczych plików nic tu nie da — **nie zgłaszam pozycji, bo
pomiar jej nie uzasadnia.**

**Nie proponuję żadnej zmiany współbieżności.** Zlecenie kazało udowodnić, że nie wracam
do `deadlock`/`Hook timed out` — nie umiem tego udowodnić bez własnej bazy, więc **tematu
nie otwieram.** Dodatkowo: 473 testy „pominięte" w suicie node to pliki `*.pg.test.ts` bez
`DATABASE_URL` — mierzyłem bez bazy (nie dostałem przydziału), więc **kosztu testów bazodanowych
nie znam.**

---

## C2-5 · 34 rewalidacje wewnątrz transakcji — realny koszt to ryzyko, nie milisekundy

**co** — Rewalidacja stron wołana **wewnątrz** callbacku `withOrgContext`, czyli przed
`commit`. Zlecenie mówiło o **78 wystąpieniach — dziś jest ich 34.** Reszta została
naprawiona (istnieje już helper `revalidateAfterCommit`).

**gdzie** — pełna lista w `/tmp/c2-reval-inside.json`. Skupiska:
- `apps/web/actions/tenant/` — 6 plików (`start-upgrade.ts:115`, `rollback-upgrade.ts:113`,
  `set-rule-variant.ts:94`, `promote-canary.ts:91`, `set-dept.ts:90`, `set-local-flag.ts:68`)
- `apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/{pilot,trial,packaging,handoff}/_actions/` — 14
- `apps/web/actions/{schema,users,security,flags,modules}/` — 11
- `apps/web/app/[locale]/(app)/(modules)/maintenance/_actions/mwo-actions.ts:1709, 1816`

**dowód** — skaner z liczeniem nawiasów po ciele callbacku `withOrgContext(...)`:
`34 wewnątrz / 112 na zewnątrz`, w 411 produkcyjnych plikach wołających `withOrgContext`.
Kontrakt jest zapisany w samym repo, `apps/web/lib/i18n/revalidate-localized.ts:19-34`:

> „`revalidatePath` throws whenever it runs outside a request scope. Called inside the
> callback that throw reaches `withOrgContext`, which rolls the whole transaction back:
> work that already succeeded disappears and the user sees a bare `persistence_failed`."

**Odpowiadam wprost na pytanie ze zlecenia („ile z nich realnie kosztuje"): kosztu
wydajnościowego nie ma.** Zmierzone fakty, które to przesądzają:

```
trasy dynamiczne (ƒ) w buildzie:  379
trasy statyczne  (○) w buildzie:    1     ← tylko /manifest.webmanifest
'use cache'          w app/lib/actions/components:  0 plików
unstable_cache/cacheTag/cacheLife:                 1 plik
export const revalidate:                           0
fetch z next:{tags}/next:{revalidate}:             0
next 16.2.7 domyślne staleTimes.dynamic = 0
  (node_modules/.pnpm/next@16.2.7…/dist/server/config-shared.js:243)
```

Nie ma pamięci podręcznej trasy do unieważnienia, nie ma `Data Cache`, a klient trzyma
dynamiczne trasy przez 0 s. Rewalidacja jest tu **księgowaniem w pamięci procesu** —
jej rola to wymuszenie odświeżenia ekranu po akcji serwerowej, i **tę rolę pełni tak samo
wewnątrz jak i po transakcji**.

**korzyść** — nie „szybciej", tylko **mniej pułapek**: znika ścieżka, w której udany zapis
wraca do użytkownika jako `persistence_failed`, a operator ponawia go w duplikat.

**koszt** — M (34 miejsca, mechaniczna zamiana na istniejący `revalidateAfterCommit`).

**ryzyko** — niskie; wzorzec docelowy już jest w repo i ma testy
(`apps/web/lib/i18n/__tests__/revalidate-localized.test.ts`).

**zależy od** — nic.

---

## C2-6 · 89 z 305 stron ładuje dane sekwencyjnie, każdy loader w osobnej transakcji

**co** — Strony serwerowe czekają na jeden loader, żeby zacząć następny. Każdy loader
otwiera **własną** transakcję `withOrgContext`, a ta poza samym zapytaniem kosztuje
`INSERT` do puli właściciela, `connect`, `begin`, `set_org_context`, `commit` i `DELETE`.

**gdzie**
- `apps/web/lib/auth/with-org-context.ts:333-393` — pełny narzut jednego wywołania
- `apps/web/app/[locale]/(app)/(modules)/production/wos/[id]/page.tsx:241` i `:731` —
  `getWorkOrderDetail(id)` i `getWoActionContext(id)`, sekwencyjnie, **4 wywołania
  `withOrgContext` w jednym pliku**
- `apps/web/app/[locale]/(app)/(modules)/quality/page.tsx:55-56` —
  `getQualityDashboard()` potem `getModuleCount('quality_event')`

**dowód (statyczny)**

```
plików page.tsx:                                   305
używających Promise.all:                            90
bez Promise.all, z ≥2 wywołaniami loadera:          89
rozkład bezpośrednich withOrgContext w page.tsx:  94×0, 49×1, 13×2, 3×3, 2×4
```

**Zastrzeżenie, którego nie wolno pominąć — i to ono decyduje o ocenie tej pozycji.**
Naiwne „opakuj w `Promise.all`" **nie zadziała** wewnątrz jednego `withOrgContext`:
callback dostaje **jednego klienta pg**, a jedno połączenie szereguje zapytania z definicji.
Zysk istnieje **tylko** tam, gdzie strona woła **osobne** `withOrgContext` — wtedy
równoległość oszczędza narzut transakcji, nie czas zapytań. To zawęża pozycję do
kilkunastu stron, nie do 89.

**korzyść** — ~5 round-tripów do bazy mniej na render tam, gdzie loaderów jest 2+.
**Wielkości w milisekundach NIE ZMIERZYŁEM** (brak przydzielonej bazy) — to pozycja
„policzona z kodu", nie „odtworzona uruchomieniem.

**koszt** — M na stronę.

**ryzyko** — **wysokie, i dlatego stawiam tę pozycję ostatnią mimo dużej liczby wystąpień.**
Dwie równoległe transakcje na tej samej encji to dokładnie ten wzorzec, który w tym repo
dawał `deadlock` przy zrównoleglaniu testów. Zanim ktokolwiek to ruszy, musi mieć dowód
kolejności blokad — inaczej wymieniamy 40 ms na incydent produkcyjny.

**zależy od** — bazy do pomiaru. Bez niej **nie zlecałbym tego w tej fali.**

---

## Drobiazg · duplikat pliku testowego

`apps/web/apps/web/tests/settings-wiring-contract.test.ts` — zabłąkana kopia
`apps/web/tests/settings-wiring-contract.test.ts` (zagnieżdżone `apps/web/apps/web/`).
Oba pliki są uruchamiane przez suitę node i **oba są czerwone** (po 14 testów).
Koszt S, ryzyko zerowe.

---

## Sprawdzone i w porządku — zawężam pole następnym

Poniższe **zmierzyłem i nie mam do nich zastrzeżeń.** Nie szukajcie tu drugi raz.

1. **Generowanie stron nie jest kosztem builda.** 66 stron w **119–196 ms**, czyli
   0,2–0,3 % czasu. Hipoteza ze zlecenia („66 stron") — **obalona pomiarem.**
2. **Nie ma innej ciężkiej biblioteki w paczce klienta.** Jedyne pakiety z `node_modules`
   przechodzące przez granicę klienta to `next` (307 tras) i `next-intl` (306). Szukałem
   markerów `react-hook-form`, `zustand`, `@supabase`, `@sentry`, `posthog` w wyemitowanych
   chunkach — **żadna z nich nie trafia do paczki klienta.** Jedyne trafienie na „posthog"
   to łańcuch `posthogUrl` w chunku jednej trasy (`settings/flags`), nie biblioteka.
3. **Druga i trzecia najcięższa trasa to kod aplikacji, nie biblioteka.**
   `pipeline/[projectId]/formulation` (104 kB brotli) rozkłada się na 13 chunków, największy
   21 kB — to `formulation-editor.tsx` (2 679 linii). Nie ma czego wyciąć, można tylko
   dzielić komponent. **Nie zgłaszam — zysk niepewny, ryzyko realne.**
4. **Chunki współdzielone są zdrowe.** Rdzeń React+Next: 70 kB brotli na wszystkie trasy.
   Chunk wspólny 307 tras: 11 kB brotli. Mediana trasy 41 kB brotli. **To dobre liczby.**
5. **19 nieosiągalnych tras NIE dokłada martwego JS** — 10 kB raw łącznie. Sprawdzone,
   moja własna hipoteza obalona.
6. **`app/(npd)/` (236 plików, 0 stron) NIE jest martwym drzewem.** Wygląda na martwe,
   ale `app/[locale]/(app)/(npd)/pipeline/page.tsx:26,32,33` importuje stamtąd akcje.
   **To żywy kod w dziwnym miejscu, nie śmieć do usunięcia.** Byłem o krok od zgłoszenia
   tego jako 236 plików do skasowania.
7. **Żaden plik testowy nie jest „tym wolnym".** Rozkład płaski w obu suitach (najwolniejszy
   plik: 10 % suity node, 2,5 % suity UI). Nie ma tu `beforeEach` do naprawy.
8. **Wyłączenie Serwista jest świadome i udokumentowane** (`next.config.ts:38-46`) —
   wtyczka webpackowa przy buildzie Turbopackiem nie emitowałaby workera; żywy SW to
   ręczny `public/sw.js`. **Nie jest to przeoczenie.**
9. **`revalidateLocalized` robi 4 wywołania (4 języki) i to jest poprawne** —
   `localePrefix: 'always'`, więc gołe `/settings/…` faktycznie nie istnieje jako URL.
   Helper istnieje dokładnie po to. Bez zastrzeżeń.

---

## Propozycja fal — kryterium korzyść ÷ ryzyko

### Fala 1 — wysoka korzyść, niskie ryzyko (dzień pracy)
| poz. | dlaczego tutaj |
|---|---|
| **C2-1** `@zxing` leniwie | Największy zmierzony zysk w całym raporcie (−72 % JS) na jedynych trasach mobilnych. Zmiana lokalna, w 9 plikach, w pełni odwracalna. |
| **C2-4** rozdzielić `&&` w skrypcie `test` | Koszt S, a przywraca 3 588 testów. Wszystko poniżej jest mniej warte niż odzyskanie widoczności testów. |
| duplikat `apps/web/apps/web/…` | Trywialne, przy okazji C2-4. |

**Dlaczego C2-1 przed C2-4:** obie są S, ale C2-1 ma zmierzony efekt dla użytkownika,
a C2-4 dla zespołu. Jeśli robi je ta sama osoba — kolejność bez znaczenia.

### Fala 2 — wymaga decyzji lub warunku wstępnego
| poz. | warunek |
|---|---|
| **C2-2** jeden `tsc` zamiast dwóch | **Wpierw potwierdzić, że job `typecheck` jest required.** Bez tego nie ruszać — odtworzy wzorzec „bloker przeżył tydzień". |
| **C2-5** 34 rewalidacje po commicie | Mechaniczne, wzorzec i testy już są. Nisko na liście, bo zysk jest w odporności, nie w czasie — a fala 1 daje więcej. |

### Fala 3 — dopiero po przydzieleniu bazy
| poz. | co odblokować |
|---|---|
| **C2-3** likwidacja drugiego drzewa tras | M, ryzyko średnie, zysk utrzymaniowy. Wymaga testu proxy potwierdzającego, że nic nie regresuje. |
| **C2-6** kaskady zapytań | **Nie zlecać, dopóki ktoś nie zmierzy tego na bazie.** Ryzyko zakleszczeń przewyższa niezmierzony zysk. |

---

## Czego nie zdążyłem — luki do domknięcia

Uczciwie, żeby nikt nie potraktował braku pozycji jako „sprawdzone i czyste":

1. **Granica serwer/klient — zaczęta, nieskończona.** Naliczyłem **451 plików `.tsx` z
   `'use client'`** w `app/` i `components/`, z czego **21 nie zawiera żadnego haka,
   handlera ani odwołania do `window`/`document`** — kandydaci na komponenty serwerowe.
   Lista jest, ale **NIE zweryfikowałem, który z nich jest importowany przez komponent
   serwerowy** — a tylko takie dają zysk (reszta i tak siedzi w grafie klienta).
   Zlecenie kazało nie proponować zmian granicy bez sprawdzenia, co przez nią przechodzi.
   **Nie sprawdziłem → nie zgłaszam pozycji.** Kandydaci do przejrzenia, m.in.:
   `app/[locale]/(app)/(admin)/settings/users/_components/{Pill,KpiTile}.tsx`,
   `.../(npd)/pipeline/[projectId]/costing/_components/waterfall-bar.tsx`,
   `.../formulation/_components/composition-bar.tsx`,
   `.../sensory/_components/sensory-radar.tsx`,
   `app/[locale]/(scanner)/scanner/wos/_components/status-chip.tsx`.
2. **Obrazy i czcionki — nie sprawdzone w ogóle.** Zlecenie mówiło „tylko jeśli zmierzysz
   realny koszt"; nie zmierzyłem, więc nie mam zdania.
3. **Koszt testów bazodanowych — nie zmierzony.** 473 testy pomijały się bez `DATABASE_URL`.
   Nie dostałem przydziału bazy i nie brałem cudzej.
4. **Wpływ znalezisk B2 na build (1 586 importów z ≥5 poziomami `../`, moduły ciągnące
   tłumaczenia z `_meta/`) — zmierzony tylko powierzchownie i NIE potrafię go rozdzielić
   od reszty czasu kompilacji.** Co policzyłem: **90 produkcyjnych modułów** (bez testów)
   odwołuje się do `_meta/`, a `_meta/i18n-staging/` to **37 plików JSON / 492 kB**
   importowanych **spoza katalogu aplikacji**, np.
   `app/[locale]/(app)/(modules)/reporting/rpt-labels.ts:14` →
   `'../../../../../../../_meta/i18n-staging/reporting.json'`.
   Rozszerza to graf modułów Turbopacka poza `apps/web`. **Ile z 13–26 s kompilacji na to
   idzie — nie wiem.** Do zmierzenia trzeba przenieść katalog i przebudować; to zmiana
   w drzewie, a miałem zakaz naprawiania. **Zostawiam jako niedomknięte, nie jako pozycję.**
5. **Nie mierzyłem `pnpm lint`** ani czasu instalacji zależności.
6. **Ani jeden pomiar czasu nie jest „czysty"** — patrz zastrzeżenie na górze. Gdyby ktoś
   chciał liczb do porównań w czasie, trzeba je powtórzyć na bezczynnej maszynie.
   **Rozmiary bajtów są wiarygodne i nie wymagają powtórki.**

---

### Surowe dane

`/tmp/c2-routes.json` (381 tras: chunki, rozmiary) · `/tmp/c2-reval-inside.json` (34 wystąpienia) ·
`/tmp/c2-build-{1,2,3}.log` · `/tmp/c2-node-{1,2}.json` · `/tmp/c2-ui-{1,2}.json`
