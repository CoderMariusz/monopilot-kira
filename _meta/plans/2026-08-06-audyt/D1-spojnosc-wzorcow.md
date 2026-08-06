# D1 — Rozjazdy wzorców (spójność konwencji)

Grupa D, agent 1 · 2026-08-06 · **RAPORT CZĘŚCIOWY** (budżet sesji; sekcja
„Czego nie zdążyłem" na końcu)

Metoda: dla każdego wzorca **najpierw większość, potem odstępcy**. Pozycja wchodzi
do raportu tylko wtedy, gdy **umiem nazwać defekt**, który z niej wyjdzie.
Hipotezy, których nie udało się podeprzeć, są wypisane osobno jako **obalone** —
to oszczędza pracę następnym.

Zakres rozłączny z B2: **nie** ruszam importów, aliasów ścieżek ani granic warstw.
Tu są wyłącznie **konwencje**: kształt akcji serwerowych, obsługa błędów,
nazewnictwo kolumn stanu, konfiguracje per-pakiet, katalogi tłumaczeń.

---

## Uszeregowanie wg prawdopodobieństwa, że rozjazd wyprodukuje defekt

| # | rozjazd | większość | odstępcy | pewność |
|---|---|---|---|---|
| **D1-01** | skrypt `typecheck` w pakiecie | 10 z 23 **ma** | **13 nie ma** | **odtworzone sondą** |
| **D1-02** | gdzie mieszka stan dezaktywacji magazynu | blob jsonb, 2 czytelników | **59 z 61 nie filtruje** | zmierzone |
| **D1-03** | symetria wycofanie/przywrócenie maszyny | wycofanie kasuje 2 rzeczy | **przywrócenie wraca 1** | zmierzone |
| **D1-04** | który katalog tłumaczeń pilnują bramki | 10 910 kluczy pilnowane | **3 538 bez bramki** | zmierzone |
| **D1-05** | pole niepowodzenia akcji serwerowej | `error` | **`reason` / `errorCode` / `state`** | zmierzone + most w kodzie |
| **D1-06** | `catch` w akcji odczytu | zwraca `ok:false` | **1 zwraca `ok:true`** | cytat |
| **D1-07** | znaczenie `quantity` w widoku ruchów | ilość ruchu | **druga gałąź: stan bieżący palety** | cytat |
| **D1-08** | bramka międzyzakładowa skanera | bezwarunkowa | **4 trasy: pod `if (isUuid(...))`** | cytat + zastrzeżenie |
| **D1-09** | fallback rezolwera etykiet | humanizuje klucz (18) | **1 wypuszcza ścieżkę** | utajony |

---

## D1-01 · `pnpm typecheck` melduje zero, nie kompilując 13 z 23 pakietów

| pole | treść |
|---|---|
| **co** | Bramka typów przechodzi po 10 projektach z 23. Trzynaście pakietów — w tym `@monopilot/rbac`, `@monopilot/auth`, `@monopilot/validation`, `@monopilot/e-sign`, `@monopilot/db`, `@monopilot/ui` — **nie ma skryptu `typecheck`**, więc `pnpm -r typecheck` po prostu je omija. Trzy z nich (`cascade-engine`, `rule-engine`, `schema-runtime`) nie są importowane przez nikogo, więc **żaden proces `tsc` w tym repozytorium nigdy nie czyta ich źródeł**. |
| **gdzie** | `package.json:22` (root: `"typecheck": "pnpm -r typecheck"`) · `.github/workflows/ci.yml:77` (ten sam wiersz w CI) · brak klucza `scripts.typecheck` w `packages/{auth,cascade-engine,db,e-sign,ops,rbac,rule-engine,schema-driven,schema-runtime,server,sync-queue,ui,validation}/package.json` |
| **dowód** | **Sonda odtworzeniowa.** Dopisałem do `packages/rule-engine/src/executor.ts` jawny błąd typu:<br>`const __probe: number = "definitely not a number";`<br>`rtk proxy pnpm -r typecheck` → **kod wyjścia 0**. Log wymienia dokładnie dziesięć projektów: `domain, observability, gs1, queries, rate-limit, gdpr, storage, outbox, apps/worker, apps/web`. Sonda **cofnięta**, `git status --porcelain packages/rule-engine/src/executor.ts` → pusto.<br>Kontrola liczebności: `apps/web` importuje `@monopilot/rbac` w **0** plikach, `cascade-engine` w 0, `rule-engine` w 0, `schema-runtime` w 0 — więc nie łapie ich nawet tranzytywnie przez graf importów `apps/web`. |
| **korzyść** | Bramka zaczyna mierzyć **cały** workspace zamiast 43 % projektów. To ta sama klasa co „job `build` był pomijany" — z tą różnicą, że tutaj bramka nie jest pomijana, tylko **melduje zieleń po pustym zbiorze**. |
| **koszt** | **S** — trzynaście linii `"typecheck": "tsc --noEmit"` + `tsconfig.json` dla `packages/db` i `packages/server` (jedyne dwa bez pliku; pozostałe 21 mają). |
| **ryzyko** | Włączenie **ujawni** istniejące błędy typów w tych pakietach — to nie regresja, to dług, który właśnie stał się widoczny. Pierwsze uruchomienie prawdopodobnie będzie czerwone; zaplanuj to jako pracę, nie jako awarię. `pnpm -r` przerywa na pierwszej awarii, więc dodawaj skrypty **partiami** i licz błędy per pakiet. |
| **zależy od** | — |

**Dlaczego to jest wzorcem, a nie kosmetyką:** dokładnie taką miarą właściciel złapał
`packages/storage` bez konfiguracji lintu (jeden z 23). Tu proporcja jest odwrotna
i dużo gorsza — **odstępców jest większość**.

---

## D1-02 · Dezaktywacja magazynu mieszka w blobie jsonb i widzi ją jeden ekran

| pole | treść |
|---|---|
| **co** | Magazyn dezaktywuje się przez wpis `deactivated_at` **wewnątrz kolumny `warehouses.address` typu jsonb** — nie przez kolumnę. Czyta to **jeden ekran ustawień**. Wszystkie pozostałe konsumenty `public.warehouses` — listy wyboru magazynu przy zleceniu przesunięcia, walidacja magazynu docelowego zamówienia zakupu, przyjęcia, zakładanie palet — widzą magazyn dezaktywowany jako w pełni żywy. |
| **gdzie** | zapis: `apps/web/actions/infra/warehouse.ts:210-211` · odczyt (jedyny): `apps/web/app/[locale]/(app)/(admin)/settings/infra/warehouses/page.tsx:328` i `:358` |
| **dowód** | Zapis dezaktywacji:<br>`set address = coalesce(address, '{}'::jsonb) \|\| jsonb_build_object('deactivated_at', now(), 'deactivated_by', $2::uuid)`<br>Zwrotka udaje kolumnę: `returning id, false as is_active` — **`public.warehouses` nie ma kolumny `is_active`**; ta wartość jest zmyślona w `SELECT`.<br>Pomiar po całym repo: **61 miejsc czyta `public.warehouses`, dokładnie 2 filtrują `deactivated_at`** (oba w tym jednym ekranie). Konkretne ofiary tworzące **nową** pracę:<br>• `planning/transfer-orders/_actions/to-form-data.ts:87` — `listTransferWarehouses`, komentarz w kodzie: *„Load the org's warehouses for the From/To selects"*; zapytanie to `select id, code, name from public.warehouses where org_id = app.current_org_id() order by code` — **zero filtra**<br>• `planning/purchase-orders/_actions/po-destination-warehouse.ts:20` — `fetchWarehouseSite`, jedyna bramka magazynu docelowego PO; sprawdza istnienie i zgodność zakładu, **nie sprawdza dezaktywacji**<br>• `lib/warehouse/receive-po-line-core.ts:363,398,419,441,463,491` · `lib/warehouse/lp-create.ts:66` · `planning/transfer-orders/_actions/import-to.ts:326` |
| **korzyść** | Dezaktywacja magazynu zaczyna cokolwiek znaczyć. Dziś jest to **etykieta na jednym ekranie**, nie stan systemu. |
| **koszt** | **M** — jedno miejsce prawdy (widok albo funkcja `app.warehouse_is_active(id)`) plus wpięcie w ~6 ścieżek tworzących nową pracę. Reszta z 59 to złączenia wyświetlające nazwę na dokumencie historycznym i **ma prawo** pokazywać magazyn wycofany. |
| **ryzyko** | Filtr założony hurtem na wszystkie 61 miejsc **wybieli dokumenty historyczne** (przyjęcia z magazynu zamkniętego stracą nazwę). Dlatego zmiana musi rozróżnić „czy mogę tu **założyć** nową pracę" od „czy mogę **pokazać** nazwę". |
| **zależy od** | — |

**Która wersja jest wzorcowa:** kolumna, nie blob. `equipment` (`active` + `deactivated_at`)
i `users` (`deleted_at` + `is_active`) trzymają stan w kolumnach — da się je zaindeksować,
zapiąć w politykę RLS i sprawdzić `CHECK`-iem. Stan schowany w `address` jsonb nie da się
żadnej z tych rzeczy, a dodatkowo **dzieli komórkę z danymi adresowymi** — czego repo jest
świadome, bo w `warehouse.ts:254` stoi komentarz *„SURGICAL jsonb WRITE — do not «simplify»
this into `address = $3::jsonb`"* i osobny test `actions/infra/warehouse-address.test.ts:89`
pilnujący jednej ścieżki zapisu. **To jest strażnik chroniący jeden przypadek** — dokładnie
wzorzec numer jeden z `WZORCE-KAMPANII-NAPRAWCZEJ`.

---

## D1-03 · Wycofanie maszyny kasuje harmonogramy przeglądów; przywrócenie ich nie wraca

| pole | treść |
|---|---|
| **co** | `deactivateEquipment` robi dwie rzeczy: wyłącza maszynę **i** wyłącza wszystkie jej harmonogramy przeglądów. `reactivateEquipment` robi **jedną** — włącza maszynę. Harmonogramy zostają wyłączone na zawsze. Maszyna wraca do służby bez profilaktyki, a żaden ekran o tym nie mówi. |
| **gdzie** | `apps/web/app/[locale]/(app)/(modules)/maintenance/assets/_actions/asset-actions.ts:278` (kasowanie) vs `:317-324` (przywrócenie) |
| **dowód** | Wycofanie, linia 278:<br>`update public.maintenance_schedules s set active = false, … where s.equipment_id = $1::uuid and s.active = true`<br>Przywrócenie, całość zapisu (linie 317-324):<br>`update public.equipment e set active = true, updated_by = $2::uuid, updated_at = pg_catalog.now() where … and e.active = false`<br>`grep -an "maintenance_schedules" asset-actions.ts` → **jedno trafienie, linia 278**. W ścieżce przywrócenia nie ma go wcale.<br>Odzyskanie jest możliwe tylko ręcznie, przez inną akcję: `maintenance/_actions/mwo-actions.ts:1789` (`active = coalesce($5::boolean, s.active)`) — czyli ktoś musi **zauważyć** i wejść w każdy harmonogram osobno. |
| **korzyść** | Zamyka cichą utratę profilaktyki na maszynie, która wróciła do produkcji. W zakładzie mięsnym pominięty przegląd to ścieżka do awarii na linii. |
| **koszt** | **S** — jedno zapytanie w `reactivateEquipment`. Wymaga decyzji: przywracać **wszystkie** harmonogramy, czy tylko te wyłączone tym konkretnym wycofaniem (drugie jest poprawniejsze i wymaga znacznika). |
| **ryzyko** | Ślepe `set active = true` na wszystkich harmonogramach maszyny **wskrzesi** też te, które ktoś wyłączył ręcznie z innego powodu przed wycofaniem. Dlatego wersja ze znacznikiem. |
| **zależy od** | — |

**Sprawdzone i NIEzgłaszane (żeby nie ścigać tego drugi raz):**
- `deactivated_at` **celowo** nie jest czyszczone przy przywróceniu — to ślad audytowy,
  a test `asset-actions.test.ts:222` nazywa to wprost: *„restores active flag without
  clearing withdrawal audit columns"*. To decyzja projektowa, nie błąd.
- Zakładanie zlecenia utrzymania na maszynie wycofanej **jest poprawnie blokowane** —
  `mwo-actions.ts:999` i `:1661`: `if (!equipmentRow.active) return { ok:false, …
  message: 'equipment is withdrawn from service' }`.

---

## D1-04 · Dwa katalogi tłumaczeń: jeden pod trzema bramkami, drugi pod żadną

| pole | treść |
|---|---|
| **co** | Repo ma dwa niezależne katalogi komunikatów. Główny (`apps/web/i18n/*.json`) jest pilnowany przez test parzystości języków i przez zapadkę wycieku kluczy. Drugi — **37 plików w `_meta/i18n-staging/`, 3 538 kluczy, importowanych bezpośrednio przez 42 moduły** — nie jest objęty **żadną** z tych bramek. Błędny albo brakujący klucz w katalogu przejściowym nie zostanie złapany przez nic. |
| **gdzie** | katalog: `_meta/i18n-staging/` (37 plików) · bramka parzystości: `apps/web/i18n/__tests__/wave-4-locale-parity.test.ts:5-12` · zapadka wycieku: `apps/web/i18n/__tests__/icu-template-key-leak.test.ts:37` |
| **dowód** | Test parzystości importuje **osiem** plików i nic więcej:<br>`import en from '../en.json'` … `import ukSettings from '../../messages/uk/02-settings.json'` — `_meta/i18n-staging/` **nie występuje w tym pliku ani razu**.<br>Zapadka wycieku skanuje `const APP_ROOT = join(HERE, '..', '..', 'app')` i rozstrzyga klucze *„przez PRAWDZIWY translator nad PRAWDZIWYM wysyłanym katalogiem"* — a moduły przejściowe mają **własne** funkcje `t()` (np. `getQaNcrsTranslator`), więc do tego translatora nie trafiają.<br>Skala: `grep -ra "i18n-staging" apps/web -l` → **42 pliki**; policzone liście EN w katalogu przejściowym → **3 538 kluczy w 37 plikach** (największe: `warehouse-lp.json`=362, `scanner.json`=339, `warehouse-c.json`=249).<br>Kontrola przeciwna dla głównego katalogu: en/pl/ro/uk mają **po 10 910 kluczy, zero braków w którymkolwiek języku**. |
| **korzyść** | Jedna miara pokrycia zamiast dwóch, z których druga nie istnieje. Zdejmuje też stałe ryzyko przypomniane w zleceniu: pominięcie tego katalogu przy commicie **już raz położyło ~20 modułów**. |
| **koszt** | **M** — albo scalić 3 538 kluczy do głównego katalogu (docelowe; komentarze w rezolwerach mówią wprost, że tak było planowane: *„When the bundle is merged into next-intl this loader collapses to a thin `getTranslations` wrapper"*), albo **S**: dopisać `_meta/i18n-staging/*.json` do istniejącego testu parzystości jako osobny zbiór. |
| **ryzyko** | Scalenie hurtem = 3 538 kluczy w jednym commicie w plikach dotykanych przez wszystkich. Rób per plik przejściowy. |
| **zależy od** | — |

**OBALONE — nie ścigajcie tego.** Podejrzewałem, że katalog przejściowy ma tylko `en`+`pl`
(26 z 37 plików) i dlatego użytkownicy `ro`/`uk` dostają angielski. **To jest zgodne
z polityką repo, nie z nią sprzeczne**: w głównym katalogu `pl` jest przetłumaczony
w 95,4 % (10 409 z 10 910 wartości różnych od EN), a `ro` w **30,7 %** i `uk` w **32,6 %** —
reszta to celowe lustro EN. Komentarz w `supplier-labels.ts:11` nazywa to
*„the repo's two-real-locale policy"*. Odstępstwa nie ma.

---

## D1-05 · Trzy nazwy pola niepowodzenia w tym samym `ok:false`

| pole | treść |
|---|---|
| **co** | Akcje serwerowe zgodnie zwracają obiekt z `ok`, ale **pole z powodem niepowodzenia nazywa się różnie**: `error`, `reason`, `errorCode`, miejscami `state`. Komponent, który destrukturyzuje niewłaściwą nazwę, pokazuje użytkownikowi `undefined` zamiast komunikatu — i nie jest to błąd, który wyłapie typecheck, jeśli po drodze jest most. Repo **ma już** taki most w produkcyjnej ścieżce, co jest dowodem, że koszt jest realny, a nie teoretyczny. |
| **gdzie** | most: `apps/web/app/[locale]/(app)/(modules)/production/wos/[id]/page.tsx:209` |
| **dowód** | Kod mostu — jedna linia, która musi obsłużyć oba kształty naraz:<br>`return result.ok ? { ok: true } : { ok: false, errorCode: 'error' in result ? result.error : result.reason };`<br>Czyli: wołany moduł może zwrócić `error` **albo** `reason`, wołający nie wie który, i wprowadza **trzecią** nazwę (`errorCode`) dla własnego konsumenta.<br>Skala duplikacji typu: `type ActionResult` deklarowany lokalnie w **20** plikach nietestowych; `type ActionFailure = { ok: false; reason: … }` w **7**.<br>Rodziny w praktyce: `{ok:false, error}` — `actions/infra/warehouse.ts:150` · `{ok:false, reason}` — `maintenance/assets/_actions/asset-actions.ts:246` (`reason: 'forbidden'`) · `{ok:false, reason:'error', message}` — `warehouse/_actions/stock-move-actions.ts:281` · `{ok:false, errorCode}` — jw. |
| **korzyść** | Jeden kształt = mosty znikają, a nie mnożą się. Dziś każdy nowy moduł konsumujący cudzą akcję musi zgadnąć albo napisać kolejny most. |
| **koszt** | **L** — kilkaset akcji. **Ale nie trzeba tego robić naraz**: sensowny pierwszy krok jest **S** — wyeksportować jeden typ z `packages/domain` (albo `apps/web/lib`), przestawić na niego **nowe** akcje i te 20 lokalnych deklaracji, resztę zostawić. |
| **ryzyko** | Zmiana nazwy pola w akcji, której konsumenta się przeoczy, **zamienia komunikat na `undefined`** — czyli dokładnie ten defekt, przed którym się bronimy. Dlatego migracja per moduł z przeglądem konsumentów, nigdy hurtem. |
| **zależy od** | — |

**Która wersja jest wzorcowa:** `{ ok: false; reason: <kod z zamkniętego zbioru>; message?: string }`.
Uzasadnienie z tego repo, nie z ogólnych zasad: `reason` niesie **kod**, po którym da się
rozgałęzić (`'forbidden' | 'not_found' | 'validation_error' | 'error'`), a `message` niesie
tekst dla człowieka. Wariant `{ok:false, error: string}` **miesza jedno z drugim** —
i dlatego most w `page.tsx:209` musiał w ogóle powstać. Dodatkowo `reason` jest tym
wariantem, który już stoi w module najgęściej obudowanym testami (utrzymanie ruchu).

---

## D1-06 · `catch` zwracający `ok: true` — awaria odczytu udaje pusty ekran

| pole | treść |
|---|---|
| **co** | Akcja ładująca dane zgodności produktowej łapie **każdy** wyjątek i zwraca `ok: true` z pustymi listami. Ekran pokazuje „brak regulacji, brak flag, 0 wyrobów" — nierozróżnialnie od stanu, w którym naprawdę nic nie ma. Awaria bazy wygląda identycznie jak zgodność. |
| **gdzie** | `apps/web/app/[locale]/(app)/(modules)/technical/compliance/_actions/load-compliance.ts:235` |
| **dowód** | `} catch (error) {`<br>`  console.error('[technical/compliance] loadCompliance failed', …);`<br>`  return { ok: true, state: 'error', regulations: [], flags: [], fgTotal: 0, fgTotalAvailable: 0, limit: FG_LIMIT, truncated: false };`<br>Pole `state: 'error'` **istnieje** — więc informacja o awarii jest w zwrotce. Pytanie, którego nie zdążyłem rozstrzygnąć: czy komponent je czyta i renderuje inaczej niż `state:'empty'`. **Nie sprawdzone.** Jeśli czyta — to nie defekt, tylko nietypowy kształt; jeśli nie — to klasa „bramka melduje zieleń nie odpytując tabeli" z audytu 30.07. |
| **korzyść** | Odróżnienie „nic nie ma" od „nie wiem". |
| **koszt** | **S** |
| **ryzyko** | Zmiana na `ok:false` wywróci ekran, który dziś renderuje się zawsze. Potrzebny stan błędu w UI, nie tylko w zwrotce. |
| **zależy od** | rozstrzygnięcia, czy komponent czyta `state` |

---

## D1-07 · Jedna kolumna `quantity` w widoku ruchów, dwa różne znaczenia

| pole | treść |
|---|---|
| **co** | Lista ruchów magazynowych skleja `union all`-em dwie księgi. W pierwszej gałęzi `quantity` to **ilość, która się przesunęła**. W drugiej — **bieżący stan palety**, odczytany dziś, nie w chwili zdarzenia. Historyczne przyjęcie 100 kg wyświetli się jako „4", jeśli paleta została od tego czasu zużyta do 4 kg. |
| **gdzie** | `apps/web/app/[locale]/(app)/(modules)/warehouse/_actions/stock-move-actions.ts:68` vs `:99` |
| **dowód** | gałąź (a), linia 68: `sm.quantity::text as quantity` — z `public.stock_moves`, czyli ilość ruchu.<br>gałąź (b), linia 99: `lp2.quantity::text as quantity` — gdzie `lp2` to `public.license_plates` złączone po `h.lp_id` w `lp_state_history`. To **stan bieżący palety**, nie ilość zdarzenia.<br>Obie kolumny lądują w tym samym polu wynikowym i są renderowane tak samo: `quantity: String(row.quantity)` (`:358`). |
| **korzyść** | Rejestr ruchów przestaje kłamać o historii. To ekran, po który się sięga przy dochodzeniu, gdzie zniknął towar — czyli dokładnie wtedy, gdy fałszywa liczba kosztuje najwięcej. |
| **koszt** | **M** — `lp_state_history` nie ma kolumny z ilością zdarzenia; trzeba albo pokazać puste, albo dopisać kolumnę i wypełnić wstecz. |
| **ryzyko** | Pokazanie pustego tam, gdzie dziś jest liczba, ktoś zgłosi jako regresję. Warto zmienić nagłówek kolumny dla tych wierszy albo oznaczyć źródło (pole `source` **już jest** w zapytaniu: `'lp_state'` vs `'stock_move'`). |
| **zależy od** | — |

---

## D1-08 · Bramka dostępu międzyzakładowego skanera wykonuje się warunkowo

| pole | treść |
|---|---|
| **co** | W czterech trasach skanera sprawdzenie, czy operator ma prawo widzieć zakład palety i lokalizacji, jest **w środku `if`-a** sterowanego ścisłym regexem UUID. Identyfikator, który nie spełnia RFC-4122 wersja 1–5, **pomija całą kontrolę** i żądanie idzie dalej. |
| **gdzie** | `apps/web/app/api/warehouse/scanner/move/route.ts:41` · `putaway/route.ts:40` · `pick/route.ts:41,65` · `ship/route.ts:62` · walidator: `apps/web/app/api/scanner/site-access.ts:3` |
| **dowód** | `site-access.ts:3`:<br>`export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;`<br>`move/route.ts:41-47`:<br>`if (isUuid(input.lpId) && isUuid(input.toLocationId)) {`<br>`  const access = await withTxnOrgContext(…);`<br>`  if (access !== 'ok') return jsonError('not_found', 404);`<br>`}`<br>`return jsonOk(await moveScannerLp(scopedClient, session, input));`<br>Kontrola przeciwna, którą **wykonałem**: `moveScannerLp` ma **własną** warstwę — `movement.ts:480` (`if (lp.site_id && lp.site_id !== destination.siteId)`) oraz `app.user_can_see_site(...)` w zapytaniach na `:758` i `:816`. **Dlatego nie twierdzę, że to fail-open.** Twierdzę, że bramka jest warunkowa tam, gdzie nic nie wymaga, żeby była — a jej warunkiem jest **dokładnie ten walidator**, który w tym repo raz już odrzucił własną organizację aplikacji. Klasa jest opisana w `MAPA-KLASY-UUID.md`; **nowe jest to, że walidator steruje wykonaniem bramki, a nie tylko odrzuceniem wejścia**. |
| **korzyść** | Bramka bezwarunkowa nie zależy od kształtu identyfikatora. Zdejmuje jedną warstwę „dlaczego to przeszło". |
| **koszt** | **S** — odwrócić warunek: nie-UUID → `400`, zamiast nie-UUID → pomiń kontrolę. |
| **ryzyko** | Jeśli któraś trasa dostaje dziś legalny identyfikator spoza RFC-4122 (np. sentinel `00000000-…-000000000000`, który w tym repo jest realnie używany — `lib/production/consume-material-core.ts:6`), odwrócenie warunku **zacznie odrzucać żywy ruch**. Przed zmianą policzyć w logach, ile żądań ma dziś `isUuid(...) === false`. |
| **zależy od** | `MAPA-KLASY-UUID.md` (stan już zmapowany, nie powtarzać inwentaryzacji) |

---

## D1-09 · Jeden rezolwer etykiet na dziewiętnaście wypuszcza surowy klucz na ekran

| pole | treść |
|---|---|
| **co** | Osiemnaście rezolwerów etykiet ma ten sam bezpiecznik: brak klucza → język podstawowy → **humanizacja ostatniego członu**, żeby na ekran nigdy nie trafiło `a.b.cKey`. Jeden robi odwrotnie: zwraca **całą ścieżkę z kropkami**. |
| **gdzie** | odstępca: `apps/web/app/[locale]/(app)/(modules)/planning/suppliers/_components/supplier-labels.ts:49` · wzorzec (18 plików): m.in. `quality/qa-ncrs-labels.ts:63`, `warehouse/wh-c-labels.ts:55`, `maintenance/maintenance-labels.ts:57` |
| **dowód** | odstępca: `return typeof value === 'string' ? value : path;`<br>wzorzec: `const last = key.split('.').pop() ?? key;` (+ humanizacja), a komentarz w `qa-ncrs-labels.ts:11` stanowi wprost: *„The raw dotted key is NEVER leaked into the UI"*.<br>**Uczciwie: dziś to nie strzela.** Sprawdziłem wszystkie **130** ścieżek, które `supplier-labels.ts` czyta przez `msg(m, …)`, przeciwko `_meta/i18n-staging/suppliers.json` — **0 braków w `en`, 0 w `pl`**. Defekt jest **utajony**: uzbroi się przy pierwszym kluczu dopisanym w kodzie i niedopisanym w pliku. |
| **korzyść** | Zdejmuje minę. Repo prowadzi już zapadkę na tę klasę (`i18n/__tests__/icu-template-key-leak.baseline.txt`, **130 wpisów**, nagłówek: *„RATCHET: this file may only SHRINK"*) — ale ta zapadka **nie widzi** rezolwerów katalogu przejściowego (patrz D1-04). |
| **koszt** | **S** — jedna linia, skopiowana z sąsiada. |
| **ryzyko** | żadne |
| **zależy od** | — |

---

## Wzorce trzymane konsekwentnie — na tym można polegać

To jest połowa wartości tego raportu: mówi, czego **nie** trzeba sprawdzać następnym.

| wzorzec | pomiar | werdykt |
|---|---|---|
| **Kontekst organizacji** | `withOrgContext` w **1 106** plikach. `set_config('app.current_org_id', …)` / `set local app.current_org_id` poza tym opakowaniem: **4 trafienia, wszystkie w testach** (`packages/outbox/__tests__/emit-fa-event.test.ts:82,118`, `packages/db/__tests__/rls.cross-org.integration.test.ts:172`). Ani jedno w kodzie produkcyjnym. | **czysto** |
| **Znak w `stock_moves`** | Ograniczenie `stock_moves_quantity_sign_check check (move_type = 'adjustment' or quantity >= 0)` (`migrations/193…:322-324`) **nigdy nie było zmieniane** — `grep` po całym katalogu migracji: jedno trafienie. Przejrzałem **15 miejsc zapisu**; każde, które potrzebuje znaku, używa `'adjustment'` (`corrections-actions.ts:592,648,691`, `cancelShipment.ts:431`, `complete-cancel-wo.ts:540`, `record-waste.ts:273`, `reverse-consume/route.ts:379`, `reverse-receive.ts:290`, `count-actions.ts:773`, `direct-adjust-actions.ts:366`), a pozostałe typy piszą dodatnio (`consume_to_wo`, `return`, `transfer`). Trzy z tych miejsc mają w kodzie komentarz cytujący nazwę ograniczenia. | **czysto — i pilnowane przez bazę** |
| — kontrola przeciwna do powyższego | Szukałem sumowania księgi, które musiałoby znać kierunek per typ: `sum(quantity)` nad `stock_moves` — **zero trafień w całym repo**. Znak nie zasila dziś żadnego salda, więc rozjazd nie miałby gdzie wyjść. | **hipoteza obalona** |
| **Parzystość języków głównego katalogu** | en/pl/ro/uk: **po 10 910 kluczy, 0 braków** w każdym kierunku. | **czysto** |
| **`active` kontra `is_active`** | Siedem tabel używa krótkiej nazwy `active` (`equipment`, `maintenance_schedules`, `spare_parts`, `calibration_instruments`, `technician_profiles`, `npd_departments`, `npd_field_catalog`), 23 używa `is_active`. Sprawdziłem, czy któreś zapytanie myli nazwy — **zero zanieczyszczeń** w 98 odwołaniach. | **czysto mimo dwóch nazw** |
| **Kasowanie miękkie klientów** | Podejrzewałem czwarty wariant pułapki SCIM (`customers` ma **obie** kolumny: `deleted_at` i `is_active`). Zmierzone: **nic w repo nie ustawia `customers.deleted_at`** — dezaktywacja idzie wyłącznie przez `is_active` (`customer-actions.ts:355`). Dwie bramki, które naprawdę decydują — lista wyboru klienta i walidacja przy zakładaniu zamówienia — **filtrują `is_active`** (`so-form-data.ts:63`, `so-actions.ts:672`). 20 z 25 odczytów filtruje też `deleted_at is null`, a pozostałe 5 to złączenia na dokumentach historycznych. | **hipoteza obalona** |
| **Zlecenie utrzymania na maszynie wycofanej** | Blokowane w obu ścieżkach: `mwo-actions.ts:999` i `:1661`. | **czysto** |
| **Konfiguracja lintu per pakiet** | Wszystkie **23** pakiety mają plik konfiguracyjny ESLint **i** skrypt `lint`. Luka w `packages/storage`, o której mówi teza zlecenia, **jest już zamknięta**. | **naprawione w nocy** |
| **`tsconfig.json` per pakiet** | 21 z 23 ma. Brakuje w `packages/db` i `packages/server` — to podzbiór D1-01, nie osobna pozycja. | — |

---

## Propozycja fal

Kryterium: **korzyść ÷ ryzyko**. Nie „łatwość".

### Fala A — bramka zaczyna mierzyć (najpierw, bo bez niej nie wiadomo, co psują kolejne fale)
- **D1-01** — trzynaście skryptów `typecheck` + dwa `tsconfig.json`.

Sama, przed wszystkim innym. Powód nie jest estetyczny: **każda następna fala dotyka
pakietów, które dziś nie są kompilowane przez nic**. Robienie D1-05 (kształt akcji)
bez tego to praca po ciemku. Licz się z tym, że pierwsze uruchomienie będzie czerwone —
to jest wynik fali, nie jej porażka. **Do wykonania partiami**, bo `pnpm -r` przerywa
na pierwszej awarii i jedna czerwień zamaskuje dwanaście następnych.

### Fala B — stan, który udaje, że istnieje (najwyższa korzyść przy niskim ryzyku)
- **D1-02** — dezaktywacja magazynu; tylko ~6 ścieżek **tworzących nową pracę**, reszta zostaje.
- **D1-03** — przywracanie harmonogramów przeglądów.
- **D1-08** — odwrócenie warunku w czterech trasach skanera (**po** policzeniu w logach,
  ile żądań ma dziś nie-UUID).

Wspólny mianownik: wszystkie trzy to **stan zapisany, którego nikt nie czyta**. Ryzyko
niskie, bo zmiana dotyczy wąskich, dających się wskazać palcem miejsc, a nie kształtu
całych modułów.

### Fala C — tłumaczenia
- **D1-04** wariant tani (**S**): dopiąć `_meta/i18n-staging/*.json` do istniejącego
  testu parzystości. To **nie** scala katalogów — daje pomiar.
- **D1-09** — jedna linia w `supplier-labels.ts`.

Dopiero po zmierzeniu podejmij decyzję o scaleniu 3 538 kluczy (wariant **M**).
Kolejność jest ważna: scalanie bez bramki to ten sam ruch, który już raz położył ~20 modułów.

### Fala D — kształt akcji serwerowych
- **D1-05**, ale **wyłącznie krok pierwszy**: jeden wyeksportowany typ + przestawienie
  20 lokalnych deklaracji `ActionResult` i 7 `ActionFailure`. **Bez** dotykania setek akcji.
- **D1-06**, **D1-07** — pojedyncze, niezależne, można doczepić do dowolnej fali.

Ostatnia świadomie, bo ma **najgorszy stosunek korzyści do ryzyka**: defekt jest realny
(most w `page.tsx:209` to dowód), ale pomyłka przy migracji produkuje **dokładnie ten sam
defekt**, przed którym broni — komunikat zamieniony na `undefined`. Wymaga fali A, żeby
typy w ogóle były sprawdzane.

---

## Czego nie zdążyłem — pełnoprawny wynik, nie przeprosiny

| obszar ze zlecenia | stan |
|---|---|
| **Bramki uprawnień** (jak wołane, czy zawsze przed zapisem) | **nie ukończone.** Zdążyłem tylko potwierdzić, że `mwo-actions.ts` gatuje poprawnie. Pełny przemiot — ilu akcjom zapisu brakuje bramki, czy istnieją opakowania modułowe zachowujące się inaczej niż wspólne — **nie wykonany**. To najpoważniejsza luka tego raportu. |
| **`withOrgContext`: gołe `return` = commit** | **nie sprawdzone.** Wiem z pamięci kampanii, że klasa istniała (3 wystąpienia, 30.07); **nie policzyłem jej dzisiaj**. Nie traktować braku pozycji jako dowodu, że jest czysto. |
| **Walidacja wejścia — pełny cenzus** | **częściowo.** Potwierdziłem osobiście: zod `3.25.76` (czyli `.uuid()` jest **luźne** — istotne, bo unieważnia intuicję „zod pilnuje wersji UUID"), 37 plików produkcyjnych ze ścisłym regexem, `site-access.ts:3` importowany przez 6 tras skanera. **Nie zweryfikowałem osobiście**: proporcji akcji z `safeParse` do bez walidacji, ani pokrycia walidacją tras `app/api/**`. Klasa UUID jest już zmapowana w `MAPA-KLASY-UUID.md` — **nie powtarzać**. |
| **`load-compliance.ts:235`** | pole `state:'error'` istnieje w zwrotce; **nie sprawdziłem, czy komponent je renderuje**. Bez tego pozycja D1-06 jest tezą, nie defektem. |
| **`voided_at`** (trzecia konwencja z tezy zlecenia) | **nie dokończone.** Ustaliłem, że dotyczy `trial_batches` **oraz** `sensory_evaluations` (`record-sensory-evaluation.ts:218,244`, `get-sensory-evaluation.ts:96`, `list-sensory.ts:136`) — czyli **więcej tabel, niż mówi teza**. Nie policzyłem, czy wszyscy czytelnicy filtrują `voided_at is null`. |

### Sondy i stan drzewa

Jedna sonda tymczasowa: linia z błędem typu w `packages/rule-engine/src/executor.ts`,
**cofnięta**, `git status --porcelain` na tym pliku pusty. Żadnego innego pliku nie
zmieniałem. `production/changeover/_actions/changeover-data.ts` nietknięty.
