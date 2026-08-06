# B2 — moduły-molochy, złożoność, granice warstw

Audyt inwentaryzacyjny, 2026-08-06. **Niczego nie naprawiono.** Drzewo źródeł nietknięte
(`git status` na `apps/`, `packages/`, `scripts/` pokazuje wyłącznie zmiany zastane,
w tym `changeover-data.ts`, którego nie ruszałem).

Wszystkie liczby poniżej są **zmierzone**, nie oszacowane. Narzędzia pomiarowe stały
poza repozytorium (`/tmp/b2probe/`), rozmiary funkcji i rozpiętości transakcji liczone
przez AST TypeScriptu (`typescript` z `node_modules`), nie przez zliczanie nawiasów.

---

## Co zmierzyłem — zakres

| pomiar | wynik |
|---|---|
| plików źródłowych przeskanowanych (bez testów, `.d.ts`, generowanych) | 3 018 |
| linii w nich | 461 018 |
| funkcji ≥ 150 linii | **517** (≥ 300 linii: **124**) |
| funkcji o zagnieżdżeniu ≥ 5 poziomów | **14** (≥ 6: **3**) |
| bloków `withOrgContext` ≥ 150 linii | **51** (19 tylko-odczyt, 32 zapisujące) |
| cykli importu (par) | **28** — z czego **6 wartościowych**, 22 wygaszane przez `import type` |
| importów względnych z ≥ 5 poziomami `../` | **1 586** |
| modułów produkcyjnych importujących z `_meta/` | **39** |

---

# CZĘŚĆ A — pozycje

Uszeregowane wg **korzyść ÷ ryzyko**, nie wg łatwości.

---

## B2-01 · Awaria zwracana `return`em ZATWIERDZA to, co już zapisano

| pole | treść |
|---|---|
| **co** | W tym repo `withOrgContext` robi `commit` przy **każdym zwykłym `return`**. Blok `try { …zapisy… } catch { return { ok:false } }` połyka wyjątek i zamiast wycofać transakcję — **zatwierdza to, co zdążyło się zapisać**, meldując użytkownikowi porażkę. |
| **gdzie** | Mechanizm: `apps/web/lib/auth/with-org-context.ts:366-368`. Wystąpienia: **56 bloków** `try`-z-zapisami-i-`catch`-który-`return`uje, z czego **41 nie ma ani jednego `throw`** w `catch`. |
| **dowód** | `with-org-context.ts:366-368`:<br>`const result = await action({…});`<br>`await client.query('commit');`<br>`return result;`<br><br>Wzorzec, `apps/web/actions/tenant/set-local-flag.ts:35-73`: `try` wykonuje `update tenant_variations`, potem `writeAuditLog(...)`, potem `writeTenantOutbox(...)`; `catch` na :71-72 zwraca `{ok:false,error:'persistence_failed'}`. Gdy padnie **outbox**, flaga i wpis audytowy **są zatwierdzone**, a wywołujący dostaje „nie udało się". |
| **korzyść** | Zamyka całą klasę „zielono zgłoszona porażka z utrwalonym półproduktem". To dokładnie ta klasa, która w tym repo już raz kosztowała trzy rozjazdy księgi magazynowej. |
| **koszt** | **M** na przegląd 56 miejsc. **S** na samą bramkę lintu (patrz ryzyko). |
| **ryzyko** | **Nie zamieniaj hurtem `return` na `throw`.** Co najmniej jedno wystąpienie jest **celowe i nośne**: `warehouse/counts/_actions/count-actions.ts:1275` zwraca `{kind:'supervisor_pin_reject'}` **właśnie po to**, żeby liczniki blokady PIN-u przetrwały commit. Wycofanie transakcji skasowałoby licznik prób i zniosło blokadę konta. |
| **zależy od** | — |

**Sedno pozycji nie brzmi „56 błędów".** Brzmi: mechanizm jest używany **i celowo, i przez
przypadek, a w kodzie nic tych dwóch przypadków nie odróżnia**. Czytelnik `set-local-flag.ts:72`
nie ma jak stwierdzić, czy commit jest zamierzony. Najtańsze wyjście to nie refaktor, tylko
uczynienie intencji jawną — dwie nazwane funkcje (`commitAndFail` / `rollbackAndFail`) albo
bramka lintu wymagająca jawnego znacznika. **Precedens istnieje i działa**:
`scripts/lint-use-server-exports.mjs` to dokładnie taka bramka AST na klasę, której `tsc` nie widzi.

Najpoważniejsze podklasy (do przejrzenia w pierwszej kolejności — e-podpis):

| plik:linia | zwracane |
|---|---|
| `production/_actions/changeover-actions.ts:739`, `:968`, `:1113` | `esign_failed` |
| `production/_actions/consume-material-actions.ts:649`, `:757` | `esign_failed` |
| `quality/_actions/complaint-actions.ts:728` | `esign_failed` |

> Uczciwe zastrzeżenie: w `changeover-actions.ts` autorzy **byli świadomi** problemu — komentarz
> w :706-709 mówi wprost, że bramka jest sprawdzana *przed* `signEvent`, „żeby odrzucenie niczego
> nie mutowało". Tam ryzyko jest niskie. Nie sprawdziłem pozostałych 53 miejsc pod kątem
> realnej osiągalności — to jest **lista do przeglądu**, nie lista potwierdzonych defektów.

---

## B2-02 · `app/(npd)` — 236 plików, 55 tys. linii, **zero tras**

| pole | treść |
|---|---|
| **co** | Katalog `apps/web/app/(npd)/` nie definiuje **ani jednej trasy** — nie ma tam żadnego `page.tsx`, `layout.tsx`, `route.ts`, `template.tsx` ani `default.tsx`. To biblioteka współdzielona (komponenty, akcje, modale) mieszkająca w drzewie routingu App Routera. |
| **gdzie** | `apps/web/app/(npd)/` — 236 plików, 54 774 linie. |
| **dowód** | `find "app/(npd)" -name page.tsx -o -name layout.tsx -o -name route.ts` → **pusto**. Dla porównania `app/[locale]/(app)/(npd)/` ma 23 `page.tsx`. Kod jest **żywy**: importuje go **137 plików spoza katalogu**, w tym **129 z `app/[locale]/`**. Największe: `fa/[productCode]/_components/fa-production-tab.tsx` (2 106), `pipeline/_actions/_lib/materialize-npd-bom.ts` (1 703), `pipeline/_actions/_lib/gate-helpers.ts` (1 425). |
| **korzyść** | Znika trwałe źródło pomyłki „w którym drzewie NPD jestem". Katalogi typu `fa/[productCode]/` i `fa/actions/` (bez podkreślnika) są dziś skanowane przez Next jako segmenty tras, choć żadnej trasy nie tworzą. Po przeniesieniu do `apps/web/lib/npd/` granica jest jawna: **routing w `app/`, biblioteka w `lib/`**. |
| **koszt** | **L** — 137 ścieżek importu do przepisania. |
| **ryzyko** | Przepisanie jest mechaniczne, ale **1 586 importów w repo jest względnych** — przeniesienie katalogu bez aliasu ścieżek to ręczne liczenie `../`. |
| **zależy od** | **B2-03** (najpierw alias, potem przenosiny — inaczej robota jest dwa razy większa). |

---

## B2-03 · Brak aliasu ścieżek → 1 586 importów z ≥ 5 poziomami `../`

| pole | treść |
|---|---|
| **co** | `apps/web/tsconfig.json` **nie ma sekcji `paths`**. `tsconfig.base.json` mapuje tylko `@monopilot/*` (pakiety). Dla wnętrza `apps/web` nie ma żadnego aliasu, więc każdy import wewnętrzny to łańcuch `../`. |
| **gdzie** | `apps/web/tsconfig.json:1-24` (brak `paths`); `tsconfig.base.json:9-14` (tylko `@monopilot/*`). |
| **dowód** | 1 586 importów z ≥ 5 poziomami `../`. Rekordy — po **10 poziomów**:<br>`settings/infra/printers/_actions/printers.ts` → `../../../../../../../../../../packages/gs1/src/build.js`<br>`technical/items/[item_code]/_actions/upsert-nutrition.ts` → `../../../../../../../../../../packages/outbox/src/events.enum`<br>Najgorsze pliki: `formulation/page.tsx` (24 takie importy), `approval/page.tsx` (19), `settings/users/page.tsx` (15). |
| **korzyść** | Przeniesienie pliku przestaje wymagać przeliczania `../` w N miejscach. Znika klasa „policzyłem o jeden za mało i trafiłem w cudzy moduł" — w repo z dziesięcioma poziomami zagnieżdżenia to nie jest teoretyczne. |
| **koszt** | **S** na dodanie aliasu (jedna linia w `tsconfig.base.json`, Next rozumie `paths` sam). Migracja istniejących importów: **L**, ale **opcjonalna i przyrostowa** — alias działa od razu dla nowego kodu, stare importy dalej się kompilują. |
| **ryzyko** | Niskie. `moduleResolution: NodeNext` — alias trzeba sprawdzić z `next build`, nie tylko `tsc`. |
| **zależy od** | — (to jest wróg numer jeden zależności; odblokowuje B2-02 i B2-04) |

---

## B2-04 · Kod produkcyjny importuje tłumaczenia z `_meta/` — katalogu roboczego

| pole | treść |
|---|---|
| **co** | 39 modułów produkcyjnych importuje pliki JSON z `_meta/i18n-staging/`. `_meta/` to katalog planów, raportów i dowodów (`_meta/plans/`, `_meta/reviews/`, `_meta/parity-evidence/`) — czyli **katalog roboczy jest wejściem builda**. |
| **gdzie** | 39 plików; przykład: `apps/web/app/[locale]/(app)/(admin)/settings/infra/printers/printers-labels.ts:16`. |
| **dowód** | `printers-labels.ts:16`:<br>`import stagedBundle from '../../../../../../../../../_meta/i18n-staging/printers.json';`<br>18 różnych plików JSON (`warehouse-*.json`, `quality-*.json`, `transfer-orders.json`, `maintenance-mwo.json`, …). Ani `.gitignore`, ani `.vercelignore` nie wspominają `_meta` — czyli dziś to działa **przez przypadek, nie przez projekt**. |
| **korzyść** | Sprzątanie `_meta/` przestaje móc położyć build. Tłumaczenia trafiają tam, gdzie reszta — `apps/web/messages/**`. |
| **koszt** | **M** — przeniesienie 18 plików + 39 importów, plus scalenie z istniejącym drzewem kluczy. |
| **ryzyko** | Brakujące klucze i18n po scaleniu. Komentarz w `scanner-labels.ts:1-13` opisuje ten mechanizm jako **świadomie tymczasowy** („staged … for promotion into `messages/**` later") — to jest dług zaplanowany, nie przypadek. |
| **zależy od** | — |

---

## B2-05 · `gate-helpers.ts` — 58 eksportów, 6 odpowiedzialności, 26 czystych funkcji uwięzionych przy warstwie bazy

| pole | treść |
|---|---|
| **co** | Jeden plik trzyma: stałe uprawnień/zdarzeń, **czysty automat stanów bramek NPD**, narzędzie naprawy danych, ładowarki bazodanowe, wyliczanie blokerów i funkcję skrótu kryptograficznego. |
| **gdzie** | `apps/web/app/(npd)/pipeline/_actions/_lib/gate-helpers.ts` — 1 425 linii, 47 eksportowanych funkcji + 11 stałych. |
| **dowód** | Zmierzony podział: **26 funkcji / 385 linii nie dotyka bazy** (`gateForStage:104`, `nextStage:127`, `nextGate:450`, `previousGate:456`, `assertAdjacent:463`, `effectiveCurrentGate:275`, `resolveGateReadiness:336`, `resolveAdvanceTransition:350`, `transitionRequiresFormalApproval:553`, `representativeStageForGate:809`, …). Pozostałe **21 funkcji** przyjmuje `OrgContextLike`/`ctx.client` (`loadProject:582`, `getBlockers:613`, `updateProjectStage:788`, `createFgCandidate:888`, …). Plik importuje 5 modułów, w tym bazodanowe (`gate-helpers.ts:3-16`), więc **test czystej funkcji `nextGate()` ładuje całą warstwę dostępu do danych**. |
| **korzyść** | Automat stanów bramek — najbardziej regulacyjnie wrażliwa logika w NPD — daje się testować i czytać bez bazy. Dwie osoby mogą pracować równolegle: jedna nad przejściami bramek, druga nad zapytaniami. |
| **koszt** | **S–M** — przeniesienie 385 linii czystych funkcji do `gate-machine.ts` obok. |
| **ryzyko** | **Bardzo niskie — to jedyna duża ekstrakcja w tym raporcie, która nie dotyka żadnej transakcji.** Czyste funkcje, brak `withOrgContext`, 11 plików testowych już istnieje (m.in. `gate-machine-honesty.test.ts`). |
| **zależy od** | — |

---

## B2-06 · Sześć cykli importu, wszystkie tego samego kształtu: pomocnik mieszka w ekranie

| pole | treść |
|---|---|
| **co** | Duży komponent-ekran eksportuje drobną funkcję pomocniczą, którą **jego własne dzieci importują z powrotem**. To jedyne **wartościowe** (nie-typowe) cykle w repo. |
| **gdzie** | 6 par. Winowajcy to trzy funkcje: `slugifyCode`, `interpolate`, `fmtDate`/`fmtDateTime`. |
| **dowód** | `npd-fields/_components/department-dialog.tsx:6`: `import { slugifyCode, type NpdFieldsScreenLabels } from '../npd-fields-screen.client';` ↔ `npd-fields-screen.client.tsx:8`.<br>To samo dla `field-dialog.tsx:6` ↔ `:9`.<br>`users/_components/AssignSitesDialog.tsx:9` (`interpolate`) ↔ `users-screen.client.tsx:14`; `InviteDialog.tsx:11` ↔ `:18`; `RoleAssignDialog.tsx:10` ↔ `:21`.<br>`maintenance/_components/mwo-pm-schedule-list.tsx:12`: `import { fmtDate, fmtDateTime } from './mwo-list.client';` ↔ `mwo-list.client.tsx:40`. |
| **korzyść** | Znika ryzyko TDZ przy inicjalizacji modułu i „dlaczego modal ciągnie 1 000-linijkowy ekran". |
| **koszt** | **S** — trzy funkcje do plików obok, sześć importów do przekierowania. |
| **ryzyko** | Znikome. |
| **zależy od** | — |

> **Dobra wiadomość, która zawęża pole:** pozostałe **22 cykle są nieszkodliwe**. W każdym z nich
> jedna krawędź to `import type`, który TypeScript wymazuje — w runtime cyklu nie ma.
> Dotyczy to wszystkich par `ekran ↔ modal` w `sites/`, `shipping/`, `trial/`, `pilot/`,
> `packaging/`, `formulation/`, `bom/`, `approval/`, `rma/` oraz `wo-detail-screen ↔
> record-consumption-modal`. **Nie zgłaszaj ich jako pracy.**

---

## B2-07 · `transitionTransferOrderStatus` — transakcja ~275–320 linii, niewidoczna z sygnatury

| pole | treść |
|---|---|
| **co** | Ciało `withOrgContext` ma 98 linii, ale w środku wywołuje jeden z trzech silników ruchu towaru. Realna rozpiętość jednej transakcji to ~275–320 linii — **czego nie widać, patrząc na eksportowaną funkcję**. |
| **gdzie** | `apps/web/app/[locale]/(app)/(modules)/planning/transfer-orders/_actions/actions.ts:1486-1583` + `shipTransferOrder:923-1145` (223 linie) / `receiveTransferOrder:1160-1335` (176) / `cancelInTransitTransferOrder:1343-1479` (137). |
| **dowód** | `actions.ts:1516-1517`: `const shipped = await shipTransferOrder(ctx, previous); if (!shipped.ok) return shipped;` — zwykły `return` z callbacku ⇒ **commit** (B2-01).<br>Osiągalność sprawdziłem ręcznie i **wynik jest mieszany, na korzyść kodu**: w `shipTransferOrder` pętla FEFO (`:999-1044`) buduje **plan w pamięci** (`picks.push`, `lpQtyShadow`) i dopiero potem zapisuje — więc wyjście `insufficient_stock` na `:1045` **nic nie utrwala**. Podobnie `receiveTransferOrder:1165` i `:1181` to walidacja przed zapisami.<br>Jedyny `return` **po** zapisach to `receiveTransferOrder:1282` (`persistence_failed` po `insert … returning id` dla wcześniejszych wierszy) — praktycznie nieosiągalny, bo taki `insert` albo rzuca, albo zwraca wiersz. |
| **korzyść** | Nie „naprawa błędu" — **korzyść jest czytelnicza**: dziś, żeby stwierdzić, czy `return` jest bezpieczny, trzeba przeczytać 320 linii w trzech miejscach. Rozdzielenie planowania od zapisu (już zastosowane w `shipTransferOrder`!) i nazwanie tego wzorca czyni to sprawdzalnym wzrokiem. |
| **koszt** | **M** |
| **ryzyko** | **Wysokie przy naiwnym podejściu.** Trzy silniki dzielą jedną transakcję z `assertTransferOrderMatterConserved`. Rozbicie na osobne `withOrgContext` = wysyłka zatwierdzona bez kontroli bilansu masy. |
| **zależy od** | **B2-01** |

---

## B2-08 · `mwo-actions.ts` — 1 900 linii, **5 niezależnych odpowiedzialności**, wszystkie transakcje krótkie

| pole | treść |
|---|---|
| **co** | Najwyraźniej wielo-odpowiedzialnościowy plik w repo: odczyty MWO, cykl życia MWO, **bezpieczeństwo LOTO z podwójnym podpisem**, CRUD harmonogramów przeglądów, powierzchnia RBAC. |
| **gdzie** | `apps/web/app/[locale]/(app)/(modules)/maintenance/_actions/mwo-actions.ts` — 15 eksportów. |
| **dowód** | Klastry dzielą prawie nic: LOTO ma własną tabelę (`mwo_loto_checklists`), własne uprawnienia (`mnt.loto.apply`/`mnt.loto.clear`) i własne inwarianty (`readLotoGate:326`, `assertDualLotoReceipts:468`, predykaty `:372-397`); z MWO styka się **jednym** warunkiem `requires_loto` w `transitionMwo:1565-1581`. Harmonogramy PM mają własną tabelę (`maintenance_schedules`), własne uprawnienie (`mnt.pm.create`), własne DTO (`PmScheduleRow:191`); dzielą tylko `resolveMwoEquipmentId` i `toIso`. |
| **korzyść** | **To najlepszy kandydat na podział w całym repo, bo ryzyko jest niskie:** wszystkie 15 transakcji ma **poniżej 150 linii** (najdłuższa `verifyMwoLotoLockout:1257-1389` = 133). Nie ma tu żadnej transakcji do rozbicia — podział jest przenoszeniem funkcji między plikami, nie zmianą granic commitu. Zysk: LOTO (logika bezpieczeństwa pracowników) przestaje być czytane razem z listą harmonogramów. |
| **koszt** | **M** — podział na `mwo-actions.ts` / `mwo-loto-actions.ts` / `pm-schedule-actions.ts`. |
| **ryzyko** | Niskie. Uwaga: `updateMwo:1079-1182` **już** stosuje wzorzec docelowy — zwraca z transakcji samo `{mwoId}`, a szczegóły doczytuje **po commicie** przez `getMwoById:1188`. |
| **zależy od** | — |

---

## B2-09 · 19 długich transakcji **tylko do odczytu** — bezpieczne do skrócenia, zysk mierzalny w połączeniach

| pole | treść |
|---|---|
| **co** | 19 z 51 długich bloków `withOrgContext` nie wykonuje żadnego zapisu. Trzymają połączenie z puli przez całą swoją długość bez powodu transakcyjnego. |
| **gdzie** | Najdłuższe: `production/_actions/get-work-order-detail.ts:305-926` (**622 linie**), `technical/traceability/_actions/search-traceability.ts:84-407` (324), `technical/factory-specs/_actions/bundle-data.ts:134-405` (272), `app/(npd)/fa/actions/get-component-processes.ts:65-281` (217), `oee/_actions/oee-data.ts:136-349` (214). |
| **dowód** | Klasyfikacja po treści bloku: brak `insert into` / `update … set` / `delete from`. **Rozwiązanie jest już w repo i jest udokumentowane** — `reporting/_actions/report-read-actions.ts:159-171` opisuje ten sam problem i jego naprawę: *„a `/reporting` load historically fired ~7 of them CONCURRENTLY, which under modest traffic exhausted the Supavisor pool (pool_size=15) → EMAXCONNSESSION"*. Wzorzec `XCore(ctx, input)` + cienka otoczka `withOrgContext` działa już w **8 plikach** (`report-read-actions.ts` ×8, `hold-actions.ts:772`, `create-work-order-core.ts:58`, `create-purchase-order-core.ts:166`, `create-transfer-order-core.ts:138`). |
| **korzyść** | Krótsze trzymanie połączenia przy `pool_size=15`. Konkret: strona detalu WO trzyma dziś połączenie przez 622 linie odczytów. |
| **koszt** | **M** — wzorzec jest gotowy do skopiowania, nie do wymyślenia. |
| **ryzyko** | **Najniższe z wszystkich pozycji transakcyjnych — przy odczycie nie ma czego utrwalić częściowo.** Uwaga na spójność odczytu: rozbicie jednej transakcji na kilka oznacza, że zapytania widzą różne migawki. Dla ekranów odczytowych to zwykle bez znaczenia, dla `search-traceability` (genealogia) — **trzeba sprawdzić**, nie sprawdziłem. |
| **zależy od** | — |

---

## B2-10 · Cztery transakcje zapisujące ponad 200 linii — tu podział jest **niebezpieczny**

| pole | treść |
|---|---|
| **co** | Cztery bloki zapisujące przekraczają 200 linii w jednym commicie. Wymieniam je **jako ostrzeżenie**, nie jako zlecenie: to są miejsca, gdzie pochopne rozbicie wprowadza częściowe utrwalenie. |
| **gdzie** | `production/_actions/consume-material-actions.ts:447-964` (**518 linii**, 6 zapisów), `shipping/_actions/ship-actions.ts:372-749` (378, 7), `technical/bom/_actions/create-draft.ts:121-451` (331, 8), `app/(npd)/pipeline/[projectId]/formulation/_actions/save-draft.ts:112-418` (307, 6). Dalej: `so-actions.ts:631-911` i `:926-1206` (po 281), `pick-actions.ts:238-502` (265), `count-actions.ts:1182-1419` (238). |
| **dowód** | `count-actions.ts:1182-1419` w jednym commicie: blokada palety + odczyt stanu na żywo (:1194), wybór palety ubytkowej + kontrola wstrzymań (:1221-1231), `signEvent` (:1248), weryfikacja PIN przełożonego z **celową** ścieżką commit-nie-throw (:1271-1278), tworzenie/pomniejszanie palety (:1284-1315), korekty + ruchy + WAC (:1318-1395), zmiana statusu linii (:1397). |
| **korzyść** | Sama pozycja nie ma korzyści z realizacji — **jej korzyścią jest to, że ktoś tego nie tknie przypadkiem**. Jeśli którakolwiek fala dotknie tych plików, ta lista mówi, gdzie zwolnić. |
| **koszt** | — (pozycja ostrzegawcza) |
| **ryzyko** | — |
| **zależy od** | — |

---

## B2-11 · Angielskie komunikaty dla użytkownika składane w akcjach serwerowych

| pole | treść |
|---|---|
| **co** | Akcje serwerowe budują pełne, angielskie zdania instruktażowe i zwracają je do UI jako `message`. To formatowanie w warstwie zapisu — w aplikacji, która ma osobną warstwę i18n. |
| **gdzie** | Najgorsze skupisko: `planning/transfer-orders/_actions/actions.ts:255-268` — zdania budowane **wewnątrz zapytania SQL** jako kolumna `reverse_block_reason`. |
| **dowód** | `actions.ts:259-266`: *„Transfer order status does not allow reversal."*, *„Received pallet link is no longer reversible."*, oraz konkatenacja SQL:<br>`'Destination pallet cannot be reversed because it has ' \|\| array_to_string(lp_blockers.blockers, ', ') \|\| '.'`<br>Dalej: `actions.ts:1184-1186` i `so-actions.ts:806-811` (*„No site could be resolved… Assign it in Settings -> Sites…"*), `count-actions.ts:1242-1245` (to samo zdanie, inne słowa), `mwo-actions.ts` — 17 miejsc z zaszytymi angielskimi `message`. |
| **korzyść** | Te zdania są dziś **niedostępne dla tłumacza** — a zakład pracuje po polsku. Dodatkowo trzy różne warianty tego samego komunikatu „przypisz zakład w Ustawieniach" żyją w trzech modułach i rozjeżdżają się niezależnie. |
| **koszt** | **M** |
| **ryzyko** | Niskie, ale **`actions.ts:255-268` to zmiana w SQL**, nie w TypeScripcie — wymaga sprawdzenia na bazie, nie samym `tsc`. |
| **zależy od** | — |

---

## B2-12 · Cztery komponenty-ekrany, w których stan i JSX są zrośnięte

| pole | treść |
|---|---|
| **co** | Cztery komponenty przekroczyły próg, za którym nie da się już zmienić jednej zakładki bez czytania całości. |
| **gdzie / dowód** | |

| plik | funkcja | `useState` | `useEffect` | odrębnych spraw |
|---|---|---|---|---|
| `…/formulation/_components/formulation-editor.tsx` | `FormulationEditor:787-2445` | **29** | 9 | **11** |
| `…/warehouse/license-plates/[lpId]/_components/lp-detail.client.tsx` | `LpDetailClient:183-1275` | **21** | 0 | **15** |
| `…/production/wos/[id]/_components/wo-detail-screen.tsx` | `WoDetailScreen:426-1695` | 10 | 0 | **14** |
| `…/technical/items/_components/item-create-wizard.tsx` | `ItemWizard:340-1328` | 5 | 1 | **16** |

**Dowód szczegółowy.** `FormulationEditor` trzyma **74 wywołania hooków w jednej funkcji**
(29 `useState`, 27 `useCallback`, 5 `useMemo`, 9 `useEffect`, 4 `useRef`), a deklaracje stanu
**nie są w jednym bloku** — rozsypane po pięciu wyspach: `:870-871`, `:892-910`, `:936`,
`:971-975`, `:1098-1117`. W `LpDetailClient` **12 z 21** stanów to zwykłe logiczne przełączniki
otwarcia modala.

| pole | treść |
|---|---|
| **korzyść** | Konkretna i policzalna: w `wo-detail-screen.tsx` **osiem paneli zakładek nie dotyka żadnego stanu** — czytają tylko `data.*` (Downtime `:1220-1254`, History `:1527-1561`, QA `:1257-1345`, Overview `:869-908`, ciało tabeli Consumption `:946-980`, paski postępu `:806-845`). W `lp-detail.client.tsx` **sześć zakładek** (`:731-747`, `:749-776`, `:778-810`, `:812-848`, `:850-921`, `:979-989`) też nie dotyka stanu. To są wycięcia **bez ryzyka** — nie ma stanu do przeniesienia. Efekt: zmiana zakładki „Odpady" przestaje wymagać otwarcia pliku, w którym mieszka podpis elektroniczny. |
| **koszt** | **M** na plik. |
| **ryzyko** | Niskie **dla bloków bezstanowych**; rosnące dla bloków z własnym stanem (modale lock/unlock/compare w `FormulationEditor`, każdy z 3–5 własnymi zmiennymi). |
| **zależy od** | — |

---

## B2-13 · `fa-production-tab.tsx` — 2 107 linii, ale to **dziewięć komponentów w jednym pliku**

| pole | treść |
|---|---|
| **co** | Plik wygląda na drugi największy moloch w repo, a w rzeczywistości jest zbiorem dziewięciu współlokowanych komponentów, z których **sześć jest całkowicie samodzielnych**. |
| **gdzie** | `apps/web/app/(npd)/fa/[productCode]/_components/fa-production-tab.tsx` |
| **dowód** | Eksportowany `FaProductionTab:1672-2104` trzyma **tylko 4 `useState` i 1 `useEffect`**. Reszta stanu (17 `useState`, 5 `useEffect`) należy do sąsiadów w tym samym pliku: `OperationPicker:626-810` (własne `open, query, activeIndex, rect` + 3 refy), `ProcessEditDialog:820-1035` (7 pól), `PublishWipDialog:1041-1119` (1), `ComponentProcesses:1277-1666` (4). `ProductionField:511-619`, `StateNotice:476-505` i `ProcessLineConsumption:1131-1271` nie mają stanu w ogóle. |
| **korzyść** | **Najtańszy duży podział w repo**: sześć wycięć to przeniesienie funkcji do pliku obok i dodanie importu — żadnego przenoszenia stanu, żadnej transakcji, żadnego przeplotu. |
| **koszt** | **S–M** |
| **ryzyko** | Niskie. Uwaga na istniejący re-eksport: `apps/web/app/(npd)/fa/_components/fa-production-tab.tsx:6-18` wystawia **dziesięć** symboli z tego pliku dalej — podział musi zachować tę powierzchnię. |
| **zależy od** | — |

---

## B2-14 · Reguły biznesowe zduplikowane w przeglądarce — trzy zmierzone przypadki

| pole | treść |
|---|---|
| **co** | Komponenty klienckie odtwarzają reguły, których źródłem prawdy jest baza albo serwer. Kopia i oryginał rozjeżdżają się niezależnie. |
| **gdzie / dowód** | (1) `item-create-wizard.tsx:464-474` — reguła hierarchii opakowań, w komentarzu wprost: *„mirroring DB CHECK (mig 267)"*.<br>(2) `lp-detail.client.tsx:91-117` — **pięć zbiorów statusów** (`IMMOVABLE`, `SPLIT_ALLOWED`, `DESTROY_BLOCKED`, `METADATA_LOCKED`, `BLOCK_BLOCKED`) opisanych w komentarzach jako lustro automatów serwerowych; `:290-303` powtarza pięcioczłonowe koniunkcje `canMerge`/`canReserve` z adnotacją *„server re-enforces"*.<br>(3) `item-create-wizard.tsx:452-524` — cały silnik walidacji jako lustro `refineItemInvariants`. |
| **korzyść** | Reguła zmieniana w migracji przestaje wymagać pamiętania o pliku `.tsx` po drugiej stronie repo. |
| **koszt** | **M–L** — wymaga miejsca na wspólną regułę (`packages/domain`), więc to nie jest wycinanie, tylko przenosiny. |
| **ryzyko** | Średnie. Duplikacja **ma dziś funkcję**: wyszarza przycisk zanim użytkownik kliknie. Usuwając kopię, trzeba tę informację czymś zastąpić, inaczej UI się cofa. |
| **zależy od** | — |

**Osobno, znalezione przy okazji — jedna z tych kopii jest niepoprawna:**

`lp-detail.client.tsx:275-277` liczy przeterminowanie w **strefie UTC przeglądarki**:

```
const isExpired = Boolean(
  detail.expiryDate && detail.expiryDate.slice(0, 10) < new Date().toISOString().slice(0, 10),
);
```

To jest **ta sama klasa**, którą noc 5/6 sierpnia naprawiła w wysyłkach („bramka terminu liczyła
dobę w strefie sesji → liczy w strefie zakładu", commit `93730681`). Kanoniczny pomocnik istnieje:
`apps/web/lib/site/site-day.ts:70` (`expiredBySiteDaySql`). Skutek jest **ograniczony** —
serwer wymusza regułę ponownie (komentarze `:290`, `:296` to potwierdzają), więc to nie jest
utrata danych, tylko przycisk aktywny/nieaktywny w złym momencie wokół północy.
**Koszt S, ryzyko niskie.**

---

# CZĘŚĆ B — duże, ale zdrowe

Sprawdzone i **nietykalne**. Ta lista zawęża pole następnym: rozmiar tych plików
odpowiada jednej spójnej odpowiedzialności.

| plik | linie | dlaczego jest w porządku |
|---|---|---|
| `app/[locale]/(scanner)/_components/scanner-labels.ts` | 1 449 | Płaskie dane i18n. **Zero importów**, jedna zagnieżdżona stała. Podział niczego nie ułatwia. |
| `packages/rbac/src/permissions.enum.ts` | 1 009 | Płaska enumeracja uprawnień z odsyłaczami do PRD. Jedna odpowiedzialność, brak logiki. |
| `lib/production/complete-cancel-wo.ts` | 776 | **Brief wskazywał go jako kandydata — nie potwierdza się.** Dwie operacje (`completeWo:113`, `cancelWo:560`), 4 typy. Już stosuje wzorzec docelowy: `(ctx, input)`, **żadnego własnego `withOrgContext`**, wszystkie transakcje poniżej 150 linii, 3 pliki testowe. |
| `production/_actions/corrections-actions.ts` | 1 583 | **Kandydat z briefu — nie potwierdza się.** To **jedna** odpowiedzialność („wpis przeciwstawny + kompensacyjny ruch magazynowy") zastosowana do trzech encji. Wszystkie trzy transakcje krótkie: 74 / 150 / 133 linii. Trzy eksporty dzielą siedem wspólnych pomocników. |
| `shipping/_actions/cancelShipment.ts` | 1 090 | **Kandydat z briefu — nie potwierdza się.** Jedna „drabina cofania wysyłki", trzy szczeble tego samego cofnięcia na jednym agregacie. ~500 linii to wspólna infrastruktura prywatna (`:159-662`). Transakcje 169 / 116 / 111. |
| `lib/warehouse/scanner/movement.ts` | 1 024 | **Kandydat z briefu — nie potwierdza się.** 9 eksportów, **zero `withOrgContext`** — wszystkie funkcje przyjmują `client: QueryClient`, czyli plik **już jest** w docelowym kształcie „rdzeń bez własnej transakcji". |
| `reporting/_actions/report-read-actions.ts` | 1 174 | **Wzorzec do naśladowania, nie do naprawy.** Świadomie rozbity na `XCore(ctx, …)` + cienkie otoczki, z udokumentowanym powodem (`:159-171`, wyczerpanie puli połączeń). |
| `shipping/_actions/so-actions.ts` | 1 524 | 4 klastry, ale **transakcje 281 / 281 / 223 linii są nierozdzielne** (blokada doradcza, idempotencja, FEFO). Ryzyko przewyższa korzyść — patrz B2-10. |
| `app/(npd)/pipeline/_actions/_lib/materialize-npd-bom.ts` | 1 703 | Nie badany szczegółowo — **niesprawdzone**. Zgłaszam jako lukę, nie jako werdykt. |

---

# CZĘŚĆ C — sprawdzone i **czyste**

Rzeczy, których szukałem i nie znalazłem. Tak samo wartościowe jak lista problemów.

| klasa | wynik |
|---|---|
| **SQL w komponentach klienckich** | **Zero.** Cztery trafienia heurystyki to fałszywe alarmy: `Select ${line.name}` (etykieta) i słowo „select" w komentarzach (`lines-screen.client.tsx:198`, `security-screen.client.tsx:141`, `sites-screen.client.tsx:38`, `override-modal.tsx:6`). |
| **Komponent kliencki importujący `next/headers` albo `pg`** | **Zero.** Sprawdzone we wszystkich plikach z dyrektywą `'use client'`. |
| **`'use server'` eksportujący nie-funkcję** (bloker builda ×2 w osiem dni) | **Zero.** Uruchomiłem bramkę: `node scripts/lint-use-server-exports.mjs` → *„No illegal exports in 397 'use server' modules."* Bramka jest wpięta w CI (`package.json:9` → `.github/workflows/ci.yml:63`). **Klasa domknięta narzędziowo — nie zgłaszać ponownie.** |
| **Zagnieżdżenie ponad 4 poziomy** | **Praktycznie nie występuje.** Z 3 018 plików: **14 funkcji** ma zagnieżdżenie ≥ 5, **3 funkcje** ≥ 6 (`scanner/wos/[id]/output/route.ts:78` — 7 poziomów; `quality/_actions/hold-actions.ts:772`; `packages/db/scripts/migrate.ts:74`). **Problemem tego repo jest długość funkcji, nie ich głębokość.** Wcześniejszy pomiar zliczaniem nawiasów dawał tu ~200 fałszywych trafień — zweryfikowane AST-em. |
| **Etykiety i18n importowane do akcji serwerowych** | **Zero.** Przeciek idzie w drugą stronę — akcje składają angielskie zdania same (B2-11). |
| **Cykle importu groźne w runtime** | **6 z 28.** Pozostałe 22 wygasza `import type` (B2-06). |

---

# CZĘŚĆ D — propozycja fal

Kryterium: **korzyść ÷ ryzyko**. Nie „łatwość".

### Fala 1 — narzędzia i granice (nic nie zmienia zachowania)
`B2-03` (alias ścieżek) · `B2-06` (6 cykli) · bramka lintu z `B2-01`

Zaczyna się tutaj, bo **B2-03 jest zależnością dwóch późniejszych pozycji**, a jego koszt to
jedna linia. Bramka lintu na `return`-w-transakcji jest tańsza niż przegląd 56 miejsc i chroni
przed **nowymi** wystąpieniami, gdy stare będą jeszcze naprawiane. Sześć cykli to trzy funkcje.
Żadna pozycja w tej fali nie dotyka transakcji ani SQL-a.

### Fala 2 — podziały o niskim ryzyku (żadnej transakcji nie ruszamy)
`B2-13` (fa-production-tab: 6 samodzielnych komponentów) · `B2-05` (gate-helpers: 385 linii czystych funkcji) · `B2-08` (mwo-actions: 5 odpowiedzialności, wszystkie transakcje < 150 linii)

Wspólny mianownik: **w żadnej z tych pozycji nie przesuwa się granica commitu.** To przenoszenie
funkcji między plikami. Największa korzyść na jednostkę ryzyka w całym zestawieniu — z LOTO
i automatem bramek NPD jako najbardziej wrażliwą logiką, która przestaje mieszkać w worku.

### Fala 3 — przegląd transakcji (tu zwalniamy)
`B2-01` (przegląd 56 miejsc, priorytet: 6 podpisów elektronicznych) · `B2-09` (19 transakcji tylko-odczyt wg wzorca `Core`)

Dopiero po Fali 1, bo bramka lintu musi już stać. `B2-09` idzie razem, bo dzieli wzorzec
i jest jego bezpieczną częścią (przy odczycie nie ma czego utrwalić częściowo) — dobre
miejsce, żeby zespół nauczył się kształtu `Core(ctx, …)` **zanim** dotknie zapisów.
**Przed startem przeczytać `B2-10`** — cztery transakcje, których nie wolno tknąć naiwnie.

### Fala 4 — porządki, gdy alias już działa
`B2-04` (`_meta/i18n-staging` → `messages/**`) · `B2-11` (angielskie zdania w akcjach) · `B2-02` (`app/(npd)` → `lib/npd`)

Wszystkie trzy są przenosinami na dużą skalę i wszystkie robią się **istotnie taniej po B2-03**.
`B2-02` na końcu, bo to 137 ścieżek importu i największa jednorazowa zmiana w repo.

### Fala 5 — UI
`B2-12` (4 ekrany; **zacząć od 14 bloków bezstanowych** — nie ma tam stanu do przeniesienia) · `B2-14` (zduplikowane reguły; **wyjąć z tego drobiazg ze strefą czasową jako osobną pozycję kosztu S**)

Na końcu, bo korzyść jest czytelnicza, nie zachowaniowa, a `B2-14` wymaga najpierw decyzji,
gdzie ma mieszkać wspólna reguła.

---

## Czego NIE sprawdziłem

Zapisuję, żeby nikt nie uznał braku pozycji za brak problemu:

- **`materialize-npd-bom.ts` (1 703 linie)** — nie czytany. Trzeci co do wielkości plik logiki.
- **Osiągalność 53 z 56 miejsc z `B2-01`** — sprawdziłem ręcznie trzy (`set-local-flag`,
  `transfer-orders`, `changeover-actions`). Reszta to lista do przeglądu, nie potwierdzone defekty.
- **Spójność odczytu przy rozbijaniu transakcji z `B2-09`** — dla `search-traceability`
  (genealogia) rozbicie może zmienić wynik. Nie zweryfikowane.
- **Cykle między pakietami `packages/*`** — badałem cykle po imporcie względnym wewnątrz
  `apps/web` i `packages`; importy przez alias `@monopilot/*` nie były w grafie.
- **Czy `_meta/` trafia na Vercel** — brak `.vercelignore` sprawdziłem, ale nie potwierdziłem
  uruchomieniem, że build faktycznie ciągnie te JSON-y z katalogu roboczego.
