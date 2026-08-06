# A1 — Martwy kod w `apps/web`

Audyt inwentaryzacyjny, 2026-08-06. Zakres: **wyłącznie `apps/web`** (bez `packages/*`).
Produkt: lista pozycji do zlecenia. **Niczego nie naprawiałem.**

## Jak to mierzyłem

Napisałem własny graf importów zamiast `knip`/`ts-prune` (żadne z nich nie jest zainstalowane
w tym repo — sprawdzone: `node_modules/.bin` nie zawiera ani jednego z nich).

Trzy niezależne przebiegi, każdy odpowiada na inne pytanie:

| skrypt | pytanie | wynik surowy |
|---|---|---|
| graf importów + BFS od korzeni frameworka | które pliki są **nieosiągalne** | 37 plików |
| ten sam BFS, korzenie + pliki testowe | które pliki żyją **tylko przez test** | 38 plików |
| przemiot eksport-po-eksporcie | które **symbole** nie mają konsumenta | 163 martwe, 103 tylko-testowe |

Skrypty leżą poza repo, w `~/.claude/jobs/6a500085/tmp/` (`reach.mjs`, `deadexports.mjs`,
`pername.mjs`, `why.mjs`). Nic nie zapisywały do drzewa projektu.

### Dwie pułapki, które faktycznie wystąpiły — i ostrzeżenie dla następnego

To jest najważniejsza część metody, bo **naiwne narzędzie uznałoby pół `app/` za martwe**.
Obie poniższe pułapki wygenerowały mi fałszywe tezy, które musiałem sam obalić:

1. **`layout.tsx` w grupie bez `page.tsx` nigdy się nie renderuje.** Pierwsza wersja skryptu
   brała *każdy* plik konwencji Next (`page`/`layout`/`route`/…) jako korzeń. Przy takim
   założeniu `app/(npd)/` — 236 plików, **zero `page.tsx`**, zero `route.ts` — wychodziło
   „żywe", bo miało własne layouty. Poprawka: korzeniem jest tylko plik faktycznie
   renderowalny (`page`/`route`/`default`/`sitemap`/…), a `layout`/`loading`/`error` dopiero
   wtedy, gdy w jego poddrzewie istnieje taki plik.

2. **Kierunek zależności bywa odwrotny, niż sugeruje ścieżka.** Postawiłem tezę, że
   `app/(npd)/` (236 plików bez ani jednej strony) to porzucone drzewo po refaktorze na
   `app/[locale]/(app)/(npd)/`. **Teza obalona.** Prawdziwe strony pod `[locale]` importują
   implementację wprost z `(npd)`:

   ```
   apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/formulation/page.tsx
      -> apps/web/app/(npd)/pipeline/[projectId]/formulation/_actions/save-draft.ts
   ```

   To samo z `app/onboarding/` — 9 stron bez prefiksu języka wygląda na duplikat
   `app/[locale]/onboarding/`, ale to wersja `[locale]` jest jednolinijkową atrapą:

   ```
   apps/web/app/[locale]/onboarding/complete/page.tsx  (1 linia, cały plik):
   export { default } from '../../../onboarding/complete/page';
   ```

   **Wniosek dla następnego audytora: w tym repo „krótszy plik" częściej jest atrapą niż
   implementacją. Zanim uznasz drzewo za martwe, sprawdź, w którą stronę idzie import.**

Skutek: z 236 plików `(npd)`, które naiwne narzędzie zgłosiłoby jako martwe, realnie martwych
jest **7**. Z 26 plików `app/onboarding/` — **0**.

---

# Pozycje

## A1-01 · Zduplikowany plik testowy nadal wykonuje się dwa razy

| pole | treść |
|---|---|
| **co** | Kopia suity testowej w zagnieżdżonym `apps/web/apps/web/` została zamieniona na atrapę importującą oryginał — zamiast usunięta. Efekt jest ten sam co przed „naprawą": ten sam zestaw testów liczy się dwa razy. |
| **gdzie** | `apps/web/apps/web/tests/settings-wiring-contract.test.ts:1` |
| **korzyść** | Uczciwa liczba testów w raportach CI; jedna czerwień zamiast dwóch identycznych. Znika katalog-widmo `apps/web/apps/web/`. |
| **koszt** | **S** |
| **ryzyko** | Praktycznie zero. Jeżeli jakiś skrypt CI wskazuje jawnie na zagnieżdżoną ścieżkę — trzeba go poprawić (nie znalazłem takiego). |
| **zależy od** | — |

**dowód.** Cała zawartość pliku to jedna linia:

```ts
import '../../../tests/settings-wiring-contract.test';
```

Uruchomienie obu plików naraz (korzeń `vitest.config.ts` nie ma pola `include`, więc domyślny
glob łapie oba):

```
 Test Files  2 failed (2)
      Tests  2 failed | 26 passed (28)
```

28 = 14 testów × 2. Plik źródłowy `apps/web/tests/settings-wiring-contract.test.ts` ma 1244 linie
i 14 testów.

**Uwaga poboczna (nie moja działka, ale zmierzone):** te 2 czerwone testy to realna czerwień —
`apps/web/tests/settings-wiring-contract.test.ts:866`, `createdLine` oczekuje `ok: true`,
dostaje `ok: false`.

---

## A1-02 · Siedem „legacy" tras administracyjnych, do których nie da się wejść

| pole | treść |
|---|---|
| **co** | Siedem stron w `app/(admin)/` to atrapy przekierowujące na `/en/...`. Nigdy się nie wykonują, bo middleware przekierowuje URL bez prefiksu języka wcześniej — robi dokładnie to samo przekierowanie. Kod istnieje wyłącznie po to, żeby przechodził test. |
| **gdzie** | `apps/web/app/(admin)/settings/users/page.tsx:3`, `.../settings/security/page.tsx:14`, `.../settings/invitations/page.tsx:16`, `.../settings/saml/page.tsx:8`, `.../settings/reference/product-categories/page.tsx:4`, `.../settings/reference/manufacturing-operations/page.tsx:1`, `.../settings/roles/page.tsx:20` |
| **korzyść** | ~7 plików mniej; znika klasa „trasa, która istnieje w manifeście builda, ale jest nieosiągalna". Mniej mylących wyników przy następnym audycie tras. |
| **koszt** | **S** |
| **ryzyko** | **Realne i trzeba je sprawdzić przed usunięciem.** Komentarz w kodzie mówi wprost, że te pliki trzymają przy życiu „route-topology spec" i „i18n-consumption guard". Usunięcie plików wywali te testy. Decyzja: poprawić testy, nie zostawiać kodu. |
| **zależy od** | — |

**dowód 1 — treść atrapy** (`apps/web/app/(admin)/settings/security/page.tsx`):

```ts
export default function LegacySettingsSecurityPage() {
  redirect('/en/settings/security');
}
```

**dowód 2 — komentarz przyznaje, po co to jest** (`apps/web/app/(admin)/settings/roles/page.tsx:11`):

> „…tak żeby **legacy `/settings/roles` route, the route-topology spec, i the i18n-consumption
> guard** dalej się rozwiązywały"

**dowód 3 — middleware nigdy tam nie dopuszcza.** `apps/web/i18n/routing.ts` nie ustawia
`localePrefix`. W dostarczonym kodzie `next-intl@4.13.0` domyślną wartością jest `always`
(`node_modules/.pnpm/next-intl@4.13.0_.../dist/esm/production/routing/config.js`):

```js
localePrefix: (a = e.localePrefix, "object" == typeof a ? a : { mode: a || "always" })
```

W `middleware/middleware.js` przy trybie `always` zmienna `N` (pomiń-prefiks) jest fałszem,
a ścieżka bez rozpoznanego locale trafia do `H(...)` — czyli do `e.redirect(...)`:

```js
const I = w?.localePrefix || L.localePrefix.mode;
const N = "never" === I || b && "as-needed" === I;      // przy "always" => false
...
S = N ? y(e) : H(u(z, n(k, L.localePrefix), t.nextUrl.search));   // => redirect
```

`apps/web/proxy.ts:222` ma matcher `'/((?!_next|_vercel|.*\\..*).*)'`, a każda ścieżka
nie-API kończy w `intlHandler(req)` (linie 174, 187, 203, 213). Czyli `/settings/security`
dostaje 307 na `/en/settings/security`, zanim Next w ogóle wybierze `app/(admin)/...`.

**dowód 4 — build faktycznie emituje te martwe trasy.**
`apps/web/.next/app-path-routes-manifest.json` zawiera m.in. `/settings/security`,
`/settings/saml`, `/settings/users`, `/account/profile`, `/schema/wizard` — 10 pozycji spoza
`[locale]`, poza `/api/*`.

**Czego NIE zdążyłem:** nie odtworzyłem tego przekierowania uruchomieniowo (curl/dev-server).
Trzy próby uruchomienia `next-intl/middleware` w node i w vitest padły na
`Cannot find module '.../next-intl@4.13.0_.../node_modules/next/server'` — pakiet `next` nie
rozwiązuje podścieżki `./server` z wirtualnego magazynu pnpm. **To samo jest powodem, dla
którego `apps/web/middleware.test.ts` mockuje `intlHandler` w całości** (`middleware.test.ts:48`,
`intlHandlerMock: vi.fn()`) — a więc **żaden istniejący test nie sprawdza realnego zachowania
warstwy locale**. Dowód powyżej jest z kodu dostarczonego pakietu, nie z uruchomienia. Status: mocny, ale **nie odtworzony**.

---

## A1-03 · Osierocona druga implementacja ekranu powiadomień (337 linii)

| pole | treść |
|---|---|
| **co** | Pełny, 337-linijkowy ekran „moje powiadomienia" leży pod trasą, do której nie da się wejść, i nikt go nie importuje. Działający ekran to zupełnie inny plik z własnym komponentem klienckim. |
| **gdzie** | `apps/web/app/(admin)/account/notifications/page.tsx:170` (`export default function NotificationsPage`) |
| **korzyść** | −337 linii; koniec z dwiema wersjami tego samego ekranu, które mogą się rozjeżdżać. |
| **koszt** | **S** |
| **ryzyko** | Obok leży `apps/web/app/(admin)/account/notifications/page.test.tsx` — padnie razem z plikiem. Sprawdzić, czy testuje coś, czego nie pokrywa test wersji żywej. |
| **zależy od** | A1-02 (ta sama przyczyna: trasa bez prefiksu języka) |

**dowód.** Wersja żywa nie importuje wersji osieroconej — ma własny komponent:

```ts
// apps/web/app/[locale]/(app)/(admin)/account/notifications/page.tsx:3
import MyNotificationsScreen, {
  type MyNotificationsPageProps as ClientProps,
} from './notifications-screen.client';
```

Jedyny `export { default } from '../../account/notifications/page'`
(`apps/web/app/[locale]/(app)/(admin)/settings/my-notifications/page.tsx:19`) rozwiązuje się do
wersji **`[locale]`**, nie do korzenia. Przemiot całego `apps/web` po
`(admin)/account/notifications` i `../account/notifications`: zero importów wersji korzeniowej.
`diff` obu plików: 407 linii różnicy — to dwie różne implementacje, nie kopia.

---

## A1-04 · Siedem akcji serwerowych bez ani jednego wywołania

| pole | treść |
|---|---|
| **co** | Siedem funkcji z dyrektywą `'use server'` nie jest wołanych znikąd — ani z produkcji, ani z testu, ani z własnego pliku. Każda z nich to publiczny endpoint akcji serwerowej, którego nikt nie używa. |
| **gdzie** | patrz tabela w dowodzie |
| **korzyść** | Mniej publicznych endpointów (Next kompiluje **każdy** eksport modułu `'use server'` na wywoływalną referencję), −~250 linii. |
| **koszt** | **M** — pojedynczo S, ale przy `setAppointmentStatus` i `getCcpDeviation` trzeba najpierw rozstrzygnąć, czy to martwy kod czy **brakująca ścieżka w UI** (patrz ryzyko). |
| **ryzyko** | **Dwie z nich to prawdopodobnie luka funkcjonalna, nie śmieć.** `setAppointmentStatus` wykonuje realny `update public.dock_appointments set status = $2` — jeśli nie ma go w UI, to znaczy, że **status awizacji na bramie nie da się zmienić z aplikacji**. To pytanie do właściciela, nie kasowanie. |
| **zależy od** | — |

**dowód** — przemiot per-eksport po wszystkich 429 modułach `'use server'` w `apps/web`;
poniższe mają zero odwołań zewnętrznych **i** zero użyć we własnym pliku:

| plik:linia | funkcja | uwaga |
|---|---|---|
| `apps/web/actions/security/force-mfa.ts:26` | `forceMfa` | |
| `apps/web/actions/tenant/promote-canary.ts:36` | `promoteCanary` | test **czyta plik jako tekst**, nigdy go nie wywołuje |
| `apps/web/app/[locale]/(app)/(admin)/settings/npd-fields/_actions/npd-field-config.ts:606` | `listDepartmentFields` | |
| `apps/web/app/[locale]/(app)/(modules)/planning/transfer-orders/_actions/reverse-receive.ts:387` | `consumeTransferReceiveReversalEvent` | **podwójnie martwa** — patrz niżej |
| `apps/web/app/[locale]/(app)/(modules)/quality/_actions/ccp-deviation-actions.ts:210` | `getCcpDeviation` | odczyt pojedynczego odchylenia CCP |
| `apps/web/app/[locale]/(app)/(modules)/technical/items/_actions/supplier-spec-actions.ts:54` | `listItemSupplierSpecs` | komentarz opisuje odbiorców, których nie ma |
| `apps/web/app/[locale]/(app)/(modules)/yard/_actions/yard-actions.ts:505` | `setAppointmentStatus` | realny `UPDATE`, zero wywołań |

`consumeTransferReceiveReversalEvent` jest martwa **dwa razy**: nikt jej nie woła, a jej ciało i tak
nic nie robi:

```ts
// apps/web/app/[locale]/(app)/(modules)/planning/transfer-orders/_actions/reverse-receive.ts:387
export async function consumeTransferReceiveReversalEvent(
  event: TransferReceiveReversalEvent,
): Promise<{ ok: true; handled: boolean }> {
  if (event.eventType !== TRANSFER_RECEIVE_REVERSED_EVENT || ...) {
    return { ok: true, handled: false };
  }
  return { ok: true, handled: true };     // <- zdarzenie zgłasza "obsłużone" i nic nie robi
}
```

`listItemSupplierSpecs` ma komentarz, który wymienia odbiorców — a odbiorców nie ma
(`supplier-spec-actions.ts:50`):

> „…re-eksportujemy to przez barrel `items _actions`, żeby **wołający (odświeżanie modala,
> testy)** mieli jedną powierzchnię importu"

Przemiot: zero wywołań, również z testów.

**Znane, celowo nieliczone ponownie:** `clearAllergenOverride`
(`.../technical/items/[item_code]/_actions/allergen-profile.ts:225`) — potwierdzam pomiarem,
że nadal ma zero wywołań (jedyne wystąpienie nazwy poza definicją to łańcuch w `console.error`
w linii 236). Jest już w `BIBLIA-BLEDOW.md` jako pozycja 10.

---

## A1-05 · Dziewięć funkcji `*Core` niepotrzebnie wystawionych jako endpointy

| pole | treść |
|---|---|
| **co** | W module raportowania z dyrektywą `'use server'` dziewięć funkcji pomocniczych `*Core` jest eksportowanych, choć używane są wyłącznie wewnątrz tego samego pliku. Każdy taki eksport Next zamienia w publiczną akcję serwerową. |
| **gdzie** | `apps/web/app/[locale]/(app)/(modules)/reporting/_actions/report-read-actions.ts` — linie 172, 225, 455, 574, 709, 828, 924, 1030 (+`getReportingExportAccessCore`) |
| **korzyść** | Dziewięć publicznych endpointów mniej. Każdy z nich przyjmuje **kontekst organizacji jako pierwszy argument od wołającego** — zdjęcie `export` zamyka temat bez analizy, czy da się to wykorzystać. |
| **koszt** | **S** — usunąć słowo `export`. |
| **ryzyko** | Niskie. Trzeba sprawdzić, czy któryś test nie importuje wariantu `*Core` (przemiot mówi, że nie). |
| **zależy od** | — |

**dowód.** `productionSummaryCore` jest zdefiniowana w linii 225 i użyta tylko w liniach 391
i 1145 tego samego pliku; zero importów z zewnątrz. Sygnatura:

```ts
export async function productionSummaryCore(
  ctx: ReportingContext,
  input: ReportingLoaderInput = {},
): Promise<ReportingResult<ProductionSummary>>
```

Bramka lintu `scripts/lint-use-server-exports.mjs` **tego nie łapie** — z założenia dopuszcza
każde `export async function` (komentarz w pliku, linia 19: „the entire point of these modules").
To nie jest błąd bramki, tylko luka w zakresie.

---

## A1-06 · 62 akcje serwerowe, które istnieją tylko dla testów

| pole | treść |
|---|---|
| **co** | 62 eksporty z modułów `'use server'` są wołane wyłącznie z plików testowych. Żaden ekran ich nie używa. To nie jest martwy kod w sensie „nieosiągalny" — to **kod napisany i nigdy niepodpięty**, razem z testem, który udaje pokrycie. |
| **gdzie** | pełna lista poniżej; najgęstsze skupiska: `apps/web/actions/tenant/*` (5), `apps/web/actions/sso/*` (3), `apps/web/app/(npd)/builder/_lib/factory-release-status.ts` (5), `.../settings/ship-override-reasons/_actions/shipping-overrides.ts` (5), `apps/web/actions/scim/tokens.ts` (3) |
| **korzyść** | Rozstrzygnięcie „dokończyć czy skasować" dla ~62 funkcji. Każda pozostawiona daje zielony test przy niedziałającej funkcji produktu. |
| **koszt** | **L** — to nie jest jedno zadanie, tylko przegląd wymagający decyzji produktowej per moduł. |
| **ryzyko** | Kasowanie bez decyzji właściciela usunie funkcje, które ktoś planował podpiąć. **Tu trzeba najpierw listy, potem decyzji, a dopiero na końcu kodu.** |
| **zależy od** | — |

**dowód.** Trzy moduły, gdzie **cały moduł** nie ma odbiorcy produkcyjnego:

- `apps/web/actions/sso/` — `disableSso` (`disable.ts:15`), `testSamlConnection`
  (`test-connection.ts:49`), `upsertSsoConfig` (`upsert-config.ts:44`). Ten ostatni jest
  importowany przez `app/(admin)/settings/saml/_actions/save-saml-config.ts:3` — ale ten plik
  sam ma odbiorcę wyłącznie testowego, a jego trasa `/settings/saml` jest nieosiągalna (A1-02).
  **Cały łańcuch konfiguracji SSO nie jest podpięty do żadnego ekranu.**
- `apps/web/actions/tenant/` — `startUpgrade:48`, `previewUpgrade:64`, `rollbackUpgrade:46`,
  `setRuleVariant:42` (tylko testy) + `promoteCanary:36` (nawet nie test — patrz A1-04).
- `apps/web/actions/scim/tokens.ts` — `createScimToken:126`, `listScimTokens:168`,
  `revokeScimToken:199`. Zgodne z tym, co już wiadomo o cyklu tokenów SCIM.

Weryfikacja ręczna, przykład `startUpgrade` — wszystkie wystąpienia w repo poza definicją:

```
apps/web/actions/tenant/upgrade.test.ts:23   const startUpgradePath = resolve(repoRoot, 'apps/web/actions/tenant/start-upgrade.ts');
apps/web/actions/tenant/upgrade.test.ts:130  const { startUpgrade } = await loadStartUpgrade();
```

Pełna lista 62 pozycji: `~/.claude/jobs/6a500085/tmp/pername.mjs` (uruchom, sekcja
„referenced ONLY by tests"). Warto ją przenieść do repo przy tworzeniu fali.

---

## A1-07 · 163 martwe eksporty (funkcje, stałe, typy)

| pole | treść |
|---|---|
| **co** | 163 eksportowane symbole nie mają konsumenta: ani importu (produkcyjnego czy testowego), ani użycia we własnym pliku. Rozkład: **106 typów, 37 funkcji, 18 stałych, 2 re-eksporty**. |
| **gdzie** | pełna lista w `~/.claude/jobs/6a500085/tmp/deadexports.json`; najważniejsze pozycje w dowodzie |
| **korzyść** | Mniej powierzchni do czytania. Typy są bezkosztowe w runtime, ale mylą przy nawigacji po kodzie. Funkcje i stałe to realny martwy kod. |
| **koszt** | **M** dla 37 funkcji + 18 stałych, **S** dla 106 typów (jedno przejście) |
| **ryzyko** | **Lista NIE jest zweryfikowana ręcznie w całości** — patrz „Czego nie zdążyłem". Detektor jest regexowy i może mylić się przy barrelach, `import * as ns`, oraz odwołaniach przez łańcuch znaków. Przed kasowaniem: `tsc --noEmit` + `next build`. |
| **zależy od** | — |

**dowód — pozycje warte uwagi ponad statystykę:**

| plik:linia | symbol | dlaczego to warto zobaczyć |
|---|---|---|
| `apps/web/lib/finance/upsert-wac.ts:603` | `computeWacDebitDelta` | martwa funkcja w ścieżce pieniężnej (WAC) |
| `apps/web/lib/finance/upsert-wac.ts:635` | `applyWacDebitDelta` | j.w., para do powyższej |
| `apps/web/app/[locale]/(app)/(modules)/scheduler/_actions/sequence-solver.ts:773` | `__dayUsageHoursForTests` | wyeksportowana „dla testów" — **żaden test jej nie używa** |
| `apps/web/app/api/scanner/site-access.ts:9` i `:52` | `scannerCanSeeSite`, `scannerWoSiteAccess` | dwie funkcje kontroli dostępu do zakładu w skanerze, zero wywołań |
| `apps/web/lib/auth/supabase-browser.ts:20` | `createBrowserSupabaseClient` | jedyny eksport pliku → cały plik martwy |
| `apps/web/lib/quality/resolve-inspection-parameters.ts:224` | `ACTIVE_SPEC_PARAMETERS_SQL` | martwa stała z SQL-em |
| `apps/web/lib/site/production-lines-site-filter.ts:12` | `PRODUCTION_LINES_SITE_FILTER_BARE_SQL` | j.w. — filtr zakładu, którego nikt nie wstrzykuje |
| `apps/web/lib/navigation/module-registry.ts:304` | `APP_MODULE_IDS` | |
| `apps/web/app/[locale]/(app)/(modules)/quality/ccp-deviations/_components/labels.ts:99,103,107` | `buildDeviation{Empty,Denied,Error}Labels` | trzy budowniczowie etykiet stanu pustego/odmowy/błędu — komplet nieużywany |

`scannerCanSeeSite` / `scannerWoSiteAccess` zestawiam z tym, co już wiadomo o widoczności
zakładów (`BIBLIA-BLEDOW.md`, D5: „widoczność zakładów jest wyłączona z projektu"). Nie
twierdzę, że to ta sama sprawa — **nie sprawdzone**, ale wygląda na ten sam wątek.

---

## A1-08 · Pliki bez ani jednego importera

| pole | treść |
|---|---|
| **co** | 12 plików nie jest importowanych przez nic i nie jest trasą — po odfiltrowaniu plików frameworka i konfiguracji. |
| **gdzie** | lista w dowodzie |
| **korzyść** | −12 plików |
| **koszt** | **S** |
| **ryzyko** | Niskie, ale `apps/web/components/settings/modals/vitest.config.ts` **jest już znanym znaleziskiem** (`_meta/plans/2026-07-30-dzien-12h/FINDING-ANTY-TESTY.md:167`) i jego usunięcie zmienia sposób uruchamiania 8 testów modali — patrz niżej. |
| **zależy od** | — |

**dowód** (surowy wynik BFS, 37 pozycji, po odjęciu 5 fałszywych trafień frameworka —
`next-env.d.ts`, `public/sw.js`, `vitest.ui.config.ts`, `sentry.*.config.ts` — oraz 20 akcji
serwerowych już policzonych w A1-04/A1-06):

```
apps/web/app/(npd)/_components/dashboard-pipeline-preview.tsx
apps/web/app/(npd)/fa/[productCode]/_components/fa-right-panel.tsx
apps/web/app/(npd)/fa/[productCode]/_components/fa-tabs.tsx
apps/web/app/(npd)/fa/_components/fa-create-host.tsx
apps/web/app/(npd)/fa/_components/fa-production-tab.tsx
apps/web/app/[locale]/(app)/(admin)/settings/_components/single-reference-screen.tsx
apps/web/app/[locale]/(app)/(npd)/_components/dashboard-counters.tsx
apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/costing/_components/waterfall-bar.tsx
apps/web/components/app/_components/user-menu-language-picker.tsx
apps/web/lib/cascade/manufacturing-ops-lookup.ts
apps/web/lib/technical/routing/service.ts
apps/web/components/settings/modals/vitest.config.ts
```

Osobno: `apps/web/components/settings/modals/vitest.config.ts` jest martwy jako konfiguracja —
żaden skrypt w `package.json` ani workflow go nie woła (przemiot po `*.json`, `*.yml`, `*.sh`,
`*.mjs`, `*.md`: jedyne trafienie to wpis w raporcie z 30.07). Skutkiem jest to, że
**8 testów modali w `apps/web/components/settings/modals/` chodzi bez aliasu
`@radix-ui/react-dialog`, który ten plik dokłada.** Czy to je psuje — **nie sprawdzone**.

---

## A1-09 · Pary duplikatów między `(npd)` a `[locale]/(app)/(npd)`

| pole | treść |
|---|---|
| **co** | Dwa komponenty pulpitu NPD istnieją w obu drzewach jako osobne kopie; jedna kopia z każdej pary nie ma odbiorcy produkcyjnego, a testy są rozjechane między drzewami. |
| **gdzie** | `apps/web/app/(npd)/_components/dashboard-counters.tsx` ↔ `apps/web/app/[locale]/(app)/(npd)/_components/dashboard-counters.tsx`; `apps/web/app/(npd)/_components/dashboard-pipeline-preview.tsx` ↔ `apps/web/app/[locale]/(app)/(npd)/_components/dashboard-pipeline-preview.tsx` |
| **korzyść** | Jedna wersja komponentu zamiast dwóch; testy przestają celować w drzewo, którego nie ma na ekranie. |
| **koszt** | **M** |
| **ryzyko** | Trzeba ustalić, która kopia jest na ekranie, zanim się skasuje drugą — **dokładnie ta pułapka, w którą sam wpadłem** (patrz metodyka). |
| **zależy od** | — |

**dowód — testy są skrzyżowane.** Test leżący w drzewie `(npd)` testuje komponent z drzewa
`[locale]`:

```
apps/web/app/(npd)/_components/__tests__/dashboard-pipeline-preview.test.tsx
   -> apps/web/app/[locale]/(app)/(npd)/_components/dashboard-pipeline-preview.tsx
```

Stan każdej z czterech kopii wg BFS:

| plik | status |
|---|---|
| `apps/web/app/(npd)/_components/dashboard-counters.tsx` | tylko test |
| `apps/web/app/[locale]/(app)/(npd)/_components/dashboard-counters.tsx` | **zero odbiorców** |
| `apps/web/app/(npd)/_components/dashboard-pipeline-preview.tsx` | **zero odbiorców** |
| `apps/web/app/[locale]/(app)/(npd)/_components/dashboard-pipeline-preview.tsx` | tylko test (3 pliki) |

Czyli **żadna z czterech kopii nie jest renderowana przez stronę.** Cały pulpit NPD z tych
dwóch kafelków wisi na testach.

---

## A1-10 · 13 plików żyjących wyłącznie przez test (poza akcjami serwerowymi)

| pole | treść |
|---|---|
| **co** | Test-only plików jest 38; 25 z nich to akcje serwerowe policzone w A1-06. Pozostaje **13 plików** spoza tej kategorii, do których prowadzi ścieżka importu wyłącznie z testu. |
| **gdzie** | najciekawsze w dowodzie; pełna lista w `~/.claude/jobs/6a500085/tmp/reach.json`, klucz `testOnly` |
| **korzyść** | Wskazanie modułów, które zostały napisane i nigdy niepodpięte. |
| **koszt** | **M** |
| **ryzyko** | Jak w A1-06: część to niedokończone funkcje, nie śmieci. |
| **zależy od** | — |

**dowód — pozycje warte uwagi:**

| plik | uwaga |
|---|---|
| `apps/web/lib/feature-flags/index.ts` | jedyny odbiorca to `apps/web/__tests__/feature-flags.test.ts`. Spójne z notatką „flagi funkcji nie działają nigdzie". |
| `apps/web/lib/shared/sql-placeholders.ts` | **10 plików testowych, zero produkcyjnych.** Pomocnik do budowania list `$1,$2,…`, którego kod produkcyjny nie używa — czyli każde miejsce buduje je po swojemu. |
| `apps/web/lib/i18n/format.ts` | tylko `layout.test.tsx` i własny test |
| `apps/web/lib/onboarding/{actions,get-onboarding-state,types}.ts` | trzy pliki, jedyny odbiorca `apps/web/tests/onboarding-wiring-contract.test.ts` |
| `apps/web/lib/rbac/collect-server-enforcement-permissions.ts` | tylko `enforced-permissions.test.ts` |
| `apps/web/lib/npd/{derive-dept-statuses,field-value-filled}.ts` | |
| `apps/web/components/npd/dept-status-strip.tsx` | |
| `apps/web/app/[locale]/(app)/(modules)/technical/allergens-config/_components/allergens-config.client.tsx` | komponent kliencki konfiguracji alergenów — żadna strona go nie renderuje |
| `apps/web/app/[locale]/(app)/(modules)/technical/allergens-config/_components/config-labels.ts` | para do powyższego |

Pełna lista 13 pozycji (`~/.claude/jobs/6a500085/tmp/reach.json`, klucz `testOnly`, po odjęciu 25 akcji):

```
apps/web/app/(npd)/_components/dashboard-counters.tsx
apps/web/app/[locale]/(app)/(modules)/technical/allergens-config/_components/allergens-config.client.tsx
apps/web/app/[locale]/(app)/(modules)/technical/allergens-config/_components/config-labels.ts
apps/web/app/[locale]/(app)/(npd)/_components/dashboard-pipeline-preview.tsx
apps/web/components/npd/dept-status-strip.tsx
apps/web/lib/feature-flags/index.ts
apps/web/lib/i18n/format.ts
apps/web/lib/npd/derive-dept-statuses.ts
apps/web/lib/npd/field-value-filled.ts
apps/web/lib/onboarding/get-onboarding-state.ts
apps/web/lib/onboarding/types.ts
apps/web/lib/rbac/collect-server-enforcement-permissions.ts
apps/web/lib/shared/sql-placeholders.ts
```

(`advanceCohort` i `recordMigrationRun` liczę w A1-06 razem z akcjami; `advanceCohort` jest już
znany z `BIBLIA-BLEDOW.md`, poz. 9.)

`lib/shared/sql-placeholders.ts` uważam za najciekawszą pozycję w tej grupie: pomocnik
istnieje, ma test, i **nie jest używany w ani jednym zapytaniu produkcyjnym**.

---

## A1-11 · 71 martwych kolumn w bazie — klasa `cleaning_checklist`

| pole | treść |
|---|---|
| **co** | 71 kolumn istnieje w obowiązującym schemacie, ale **żaden kod aplikacji ich nie czyta ani nie zapisuje** — ani `apps/web`, ani `packages/*`. To ta sama klasa co znany `cleaning_checklist`. Najgorzej jest w `brief_lines` (12 z ~15 kolumn) i w `work_orders` (5 kolumn na tabeli rdzeniowej). |
| **gdzie** | tabela poniżej; definicje w `packages/db/__expected__/schema.sql` |
| **korzyść** | Koniec z „polami, które wyglądają jak funkcja, a nie są". Każda taka kolumna to pułapka: ktoś prędzej czy później napisze do niej raport. |
| **koszt** | **M** na inwentaryzację i decyzje, **L** jeśli miałoby dojść do migracji usuwających. |
| **ryzyko** | **Nie kasować bez sprawdzenia każdej z osobna.** Kolumna może być zapisywana przez trigger albo funkcję w bazie, a nie przez kod aplikacji — mój przemiot tego nie pokrywa. `released_to_warehouse` ma 4 wystąpienia w migracjach (a nie 1), więc coś jeszcze jej dotyka. |
| **zależy od** | — |

**dowód metody.** Sparsowałem `CREATE TABLE` z `packages/db/__expected__/schema.sql` (stan
obowiązujący, nie pojedyncza migracja — to omija pułapkę „kolumna dodana i później usunięta"):
**151 tabel, 2018 kolumn**. Odrzuciłem nazwy generyczne (`id`, `org_id`, `created_at`, …) oraz
krótsze niż 8 znaków (kolidują z niepowiązanymi identyfikatorami). Z reszty odsiałem wszystko, co
występuje gdziekolwiek w `apps/web` lub w `packages/*` poza samą definicją schematu.

Kontrola poprawności: **`cleaning_checklist` znalazł się w wyniku** — detektor odtwarza znany
przypadek.

Ręcznie zweryfikowałem próbkę 12 kolumn (grep po całym `apps/web` **z wykluczeniem `.next`**):
wszystkie 12 potwierdzone, zero wystąpień.

> **Pułapka, w którą sam wpadłem — dla następnego:** pierwszy przemiot dał 103 kolumny, bo nie
> wykluczał `packages/*`. `secret_encrypted`, `proposal_status` i `last_otp_window` **są używane**
> w `packages/` (odpowiednio 17, 3 i 5 razy) i nie są martwe. Drugi raz: surowy
> `grep secret_encrypted apps/web` dawał 4 trafienia — **wszystkie w `apps/web/.next/`**, czyli
> w artefaktach builda. Bez `--exclude-dir=.next` ta kolumna wyglądałaby na żywą.

**Największe skupiska (71 pozycji, tabele z ≥2):**

| tabela | kolumny |
|---|---|
| `public.brief_lines` (12) | `line_type`, `line_index`, `slice_count`, `benchmark_identified`, `primary_packaging`, `secondary_packaging`, `base_web_code`, `base_web_price`, `top_web_type`, `sleeve_carton_code`, `sleeve_carton_price`, `packaging_ext` |
| `public.ncr_reports` (5) | `detected_location`, `fail_reason_code_id`, `actual_yield_pct`, `claim_pct`, `claim_value_eur` |
| `public.wo_materials` (5) | `consume_whole_lp`, `is_by_product`, `scrap_percent`, `condition_flags`, `source_wo_id` |
| `public.work_orders` (5) | `factory_release_event_id`, `factory_release_status_at_creation`, `is_rework`, `released_to_warehouse`, `pause_reason` |
| `public.supplier_spec_review_proposals` (4) | `reviewed_by`, `reviewed_at`, `review_notes`, `resulting_supplier_spec_id` |
| `public.supplier_specs` (3) | `review_notes`, `rejected_by`, `rejected_at` |
| `public.tax_codes` (3) | `country_code`, `tax_type`, `jurisdiction` |
| `public.bom_headers` (2) | `technical_review_requested_by`, `technical_review_requested_at` |
| `public.brief` (2) | `converted_at`, `converted_by_user` |
| `public.capacity_plans` (2) | `bucket_kind`, `mrp_run_id` |
| `public.changeover_events` (2) | `planned_duration_min`, **`cleaning_checklist`** |
| `public.compliance_docs` (2) | `last_expiry_scan_at`, `last_notified_at` |

Pełny wynik: `~/.claude/jobs/6a500085/tmp/deadcols.mjs` (uruchom).

**Trzy z tych grup czytam jako niedokończone funkcje, nie jako śmieci** — i to są pytania do
właściciela, nie zadania do wykonania:

- `work_orders.is_rework` + `released_to_warehouse` + `pause_reason` — zlecenie produkcyjne ma
  w bazie pola na przeróbkę, zwolnienie do magazynu i powód wstrzymania, których **nic nie
  ustawia**;
- `supplier_specs.rejected_by/rejected_at/review_notes` + cała tabela
  `supplier_spec_review_proposals` — **ścieżka odrzucenia specyfikacji dostawcy istnieje
  wyłącznie w schemacie**;
- `ncr_reports.claim_pct` + `claim_value_eur` — pola na roszczenie w niezgodności, nieużywane.

---

# Co sprawdziłem i jest ŻYWE

Ta sekcja jest tak samo ważna jak lista problemów — zawęża pole następnym.

| co sprawdzone | wynik |
|---|---|
| **`app/(npd)/` — 236 plików, zero `page.tsx`** | **ŻYWE.** Postawiłem tezę o porzuconym drzewie i sam ją obaliłem: strony pod `[locale]/(app)/(npd)/` importują stąd implementację wprost. Martwych realnie: 7 plików. **Nie ścigajcie tego drugi raz.** |
| **`app/onboarding/` — 26 plików, 9 stron bez prefiksu języka** | **ŻYWE.** To implementacja; `app/[locale]/onboarding/*/page.tsx` to jednolinijkowe atrapy re-eksportujące ją. Martwe są tylko *trasy* bez prefiksu, nie kod. |
| **`app/(admin)/account/profile/page.tsx` (871 linii)** | **ŻYWE.** Importowane jako `MyProfileClient` przez `[locale]/(app)/(admin)/account/profile/page.tsx:4`. |
| **`app/(admin)/schema/wizard/page.tsx`** | **ŻYWE.** `[locale]/(admin)/schema/wizard/page.tsx` to atrapa (1 linia) wskazująca tutaj. |
| **`app/(admin)/settings/roles/page.tsx`** | atrapa, ale re-eksportuje **żywy** komponent z `[locale]`. Martwa jest atrapa, nie komponent. |
| **60 tras `route.ts` w `app/api/`** | **ŻYWE.** Wszystkie w manifeście builda; `proxy.ts:174` wypuszcza `/api/*` z pominięciem warstwy locale, więc nie dotyczy ich problem z A1-02. |
| **`apps/web/actions/` — 106 plików nietestowych** | **83 żywe**, 20 martwych, 3 tylko-testowe. Czyli 78% katalogu jest w porządku. |
| **429 modułów `'use server'`** | 20 eksportów bez odbiorcy zewnętrznego, z czego **7 naprawdę martwych** (reszta używana wewnątrz pliku — A1-05). 409 modułów bez zastrzeżeń. |
| **`apps/web/public/sw.js`, `next-env.d.ts`, `vitest.ui.config.ts`, `sentry.*.config.ts`** | fałszywe trafienia mojego detektora — **żywe**, wołane przez framework/skrypty. Wymieniam, żeby nikt ich nie skasował na podstawie surowego wyniku. |
| **1875 plików nietestowych w `apps/web`** | **1838 osiągalnych z korzeni frameworka** (98%). Repo nie jest zaśmiecone — problem jest skupiony, nie rozlany. |
| **2018 kolumn w 151 tabelach** | **1947 używanych** przez kod (96%). Martwe 71 — patrz A1-11. Tu też problem jest skupiony: 12 z 71 siedzi w jednej tabeli `brief_lines`. |
| **`secret_encrypted`, `proposal_status`, `last_otp_window`** | **ŻYWE** w `packages/*` — wypadły z listy martwych kolumn przy drugim przemiocie. Wymieniam, żeby nikt nie zgłosił ich ponownie na podstawie samego `grep` po `apps/web`. |

---

# Propozycja podziału na fale

Kryterium: **korzyść ÷ ryzyko**, nie łatwość.

### Fala 1 — usuwa mylące sygnały, ryzyko bliskie zeru

Cel: żeby następny audyt i CI mówiły prawdę. Nic tu nie dotyka logiki produktu.

| poz. | co | koszt |
|---|---|---|
| A1-01 | zduplikowany plik testowy (jedna linia do usunięcia + katalog-widmo) | S |
| A1-05 | zdjąć `export` z 9 funkcji `*Core` | S |
| A1-08 | 12 plików bez importera **minus** `vitest.config.ts` modali | S |

**Dlaczego najpierw:** A1-01 i A1-08 zmieniają wyłącznie to, co widzi narzędzie; A1-05 to jedno
słowo w dziewięciu miejscach i zmniejsza powierzchnię publiczną. Żadna z tych zmian nie wymaga
decyzji właściciela.

### Fala 2 — trasy bez wejścia

| poz. | co | koszt |
|---|---|---|
| A1-02 | 7 atrap przekierowań w `app/(admin)/` | S |
| A1-03 | osierocony ekran powiadomień (337 linii) | S |

**Dlaczego razem i dlaczego druga:** jedna przyczyna (przekierowanie na prefiks języka), więc
jeden kontekst dla wykonawcy. Ryzyko wyższe niż w Fali 1, bo **padną testy, które te pliki
trzymają przy życiu** — i to jest właśnie do zrobienia świadomie: poprawić test, nie zostawiać
kodu dla testu.

**Warunek wejścia:** najpierw odtworzyć uruchomieniowo przekierowanie z A1-02 (mnie się nie
udało — patrz „czego nie zdążyłem"). Jeden `curl -I http://localhost:3000/settings/security` na
działającym dev-serwerze zamyka temat.

### Fala 3 — martwe akcje serwerowe

| poz. | co | koszt |
|---|---|---|
| A1-04 | 7 akcji bez wywołania | M |

**Dlaczego trzecia:** to jedyna fala, która może odsłonić **brakującą funkcję produktu**, a nie
śmieć. `setAppointmentStatus` i `getCcpDeviation` wymagają odpowiedzi „czy operator ma mieć taką
ścieżkę". Zlecać dopiero, gdy właściciel odpowie na te dwa pytania.

### Fala 4 — porządkowanie eksportów

| poz. | co | koszt |
|---|---|---|
| A1-07 | 163 martwe eksporty (najpierw 106 typów, potem 37 funkcji, potem 18 stałych) | M |
| A1-09 | duplikaty pulpitu NPD | M |

**Dlaczego czwarta:** największa objętość, najmniejszy skutek na jednostkę pracy. **Wymaga
ręcznej weryfikacji listy przed startem** (nie zdążyłem jej dokończyć). Podzielić na trzy
zlecenia po typie symbolu — typy same w sobie są bezpieczne i można je zrobić jednym przejściem
z `tsc` jako bramką.

### Fala 5 — decyzja właściciela, nie kod

| poz. | co | koszt |
|---|---|---|
| A1-06 | 62 akcje tylko-testowe | L |
| A1-10 | 13 plików tylko-testowych | M |
| A1-11 | 71 martwych kolumn | M (inwentaryzacja) / L (migracje) |

**Dlaczego na końcu i dlaczego to nie jest zadanie programistyczne:** tu nie chodzi o skasowanie
kodu, tylko o rozstrzygnięcie per moduł: **dokończyć czy wyrzucić**. Trzy skupiska wymagają
osobnej odpowiedzi:

- **konfiguracja SSO** — cały łańcuch (`actions/sso/*` → `save-saml-config.ts` → trasa
  `/settings/saml`) nie jest podpięty do żadnego ekranu;
- **cykl aktualizacji dzierżawcy** (`actions/tenant/*`) — 5 akcji, zero ekranów;
- **tokeny SCIM** — zgodne z tym, co już wiadomo.

Dopóki właściciel nie powie, które z nich są planowane, kasowanie jest hazardem, a zostawianie
produkuje zielone testy przy niedziałających funkcjach.

---

# Czego NIE zdążyłem sprawdzić

Uczciwa granica raportu. Poniższe są **niesprawdzone**, nie „sprawdzone i w porządku".

1. **Nie odtworzyłem uruchomieniowo przekierowania z A1-02.** Dowód jest z kodu dostarczonego
   `next-intl@4.13.0` i z manifestu builda, ale nie z żywego żądania. Trzy próby (node, node
   z przemapowanymi ścieżkami, vitest) padły na `Cannot find module '.../next/server'`.
   Zamknięcie: `curl -I` na dev-serwerze. **Status pozycji A1-02: mocna teza, nie dowód
   uruchomieniowy.**
2. **Nie zweryfikowałem ręcznie listy 163 martwych eksportów (A1-07).** Zweryfikowałem ręcznie
   kilkanaście pozycji z A1-04 i A1-06 (wszystkie się potwierdziły), ale **nie znam współczynnika
   fałszywych trafień dla całej listy**. Zleciłem to osobnemu przebiegowi; nie wrócił przed
   końcem mojego budżetu. Przed kasowaniem czegokolwiek z A1-07: `tsc --noEmit` + `next build`.
3. **Gałęzie nieosiągalne — kategoria PUSTA, do zrobienia od nowa.** Zlecenie wymieniało dwie
   rzeczy w tym punkcie: martwe kolumny (klasa `cleaning_checklist`) i warunki, które nigdy nie
   mogą być prawdziwe. **Martwe kolumny zrobiłem sam — A1-11. Gałęzi nieosiągalnych NIE
   sprawdziłem w ogóle.** Chodzi o: flagi zaszyte na sztywno, porównania statusu z wartością
   spoza wyliczenia, bloki za `const X = false`. Zleciłem to osobnemu przebiegowi, nie wrócił
   przed końcem mojego budżetu. **Ta kategoria to czysta kartka.**
4. **Nie sprawdziłem, czy do martwych kolumn z A1-11 nie pisze trigger lub funkcja w bazie.**
   Mój przemiot pokrywa kod aplikacji, nie ciała funkcji SQL. `released_to_warehouse` ma 4
   wystąpienia w migracjach zamiast 1, więc przynajmniej ona wymaga sprawdzenia przed dotknięciem.
5. **Nie sprawdziłem, czy 8 testów modali psuje się bez martwego `vitest.config.ts`** (A1-08).
6. **Nie sprawdziłem `import()` z ścieżką w zmiennej w kodzie produkcyjnym.** Mój detektor łapie
   tylko literały. W testach ten wzorzec występuje często (`await import(startUpgradePath)`) i
   uwzględniłem go osobnym przemiotem po nazwach; w kodzie produkcyjnym **nie sprawdzone**.
   Gdyby gdzieś występował, część pozycji z A1-07/A1-08 byłaby fałszywa.
7. **Nie sprawdziłem `packages/*`** — to zakres partnera, celowo pominięty.
