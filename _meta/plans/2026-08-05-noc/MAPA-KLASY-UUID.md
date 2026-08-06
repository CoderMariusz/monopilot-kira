# Mapa klasy: ścisła walidacja UUID kontra zasiane identyfikatory (Codex, 2026-08-06 04:05)

**Uwaga:** raport powstał, gdy część napraw leżała już w drzewie roboczym, więc autor
rozdziela stan `HEAD` od worktree. Trzy z wymienionych przecięć zostały tej nocy
naprawione (commit `0f9f4c08`).

Audyt statyczny wykazał **6 unikalnych identyfikatorów niespełniających reguły „wersja 1–5 + wariant RFC-4122”**. Jedynym nowym względem wskazanej listy jest tenant Apex `…0001`.

Istotna korekta: w tym repo `z.string().uuid()` jest przeważnie **luźne**, ponieważ aplikacja używa Zod `3.25.76`.

## 1. Identyfikatory zasiane na stałe

| Identyfikator / rodzina | Co to jest | Gdzie zasiany | Wersja / wariant | Werdykt |
|---|---|---|---|---|
| `00000000-0000-0000-0000-000000000001` | systemowy tenant Apex | [030-apex-org-bootstrap.sql:19](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/030-apex-org-bootstrap.sql:19) | `0` / `0` | **NIE** |
| `00000000-0000-0000-0000-000000000002` | kanoniczna organizacja Apex/pilot | [030-apex-org-bootstrap.sql:38](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/030-apex-org-bootstrap.sql:38) | `0` / `0` | **NIE** |
| `00000000-0000-0000-0000-0000000000ff` | systemowy tenant GDPR | [115-npd-gdpr-erasure.sql:31](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/115-npd-gdpr-erasure.sql:31) | `0` / `0` | **NIE** |
| `00000000-0000-0000-0000-0000000000ee` | systemowa organizacja GDPR | [115-npd-gdpr-erasure.sql:40](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/115-npd-gdpr-erasure.sql:40) | `0` / `0` | **NIE** |
| `00000000-0000-0000-0000-0000000000dd` | rola sentinel GDPR | [115-npd-gdpr-erasure.sql:49](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/115-npd-gdpr-erasure.sql:49) | `0` / `0` | **NIE** |
| `00000000-0000-0000-0000-000000000000` | użytkownik-placeholder GDPR; również sentinel LP, SCIM i system-org | [115-npd-gdpr-erasure.sql:60](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/115-npd-gdpr-erasure.sql:60), stała funkcji na linii 80 | brak / brak | **Nie przechodzi ścisłego regexu**. Uwaga: RFC definiuje Nil UUID jako wartość specjalną, ale nie jest to wersjonowany UUID z wariantem. |
| `11111111-1111-4111-8111-111111111111` | użytkownik harnessu | [seed-e2e-user.sql:26](/Users/mariuszkrawczyk/Projects/monopilot-kira/scripts/seed-e2e-user.sql:26) | `4` / `8` | **TAK** |
| `7f290000-0000-4000-8000-000000000001`–`…0005` | pięć person testowych | [test-personas.ts:52](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/seeds/test-personas.ts:52) i kolejne definicje | `4` / `8` | **TAK** |
| `25900000-0000-4000-8000-*` | 47 identyfikatorów demo: linie, maszyny, pozycje, WO, materiały, operacje, wykonania, outputy, odpady i downtime | [259-demo-wo-seed.sql:7](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/259-demo-wo-seed.sql:7)–126 | `4` / `8` | **TAK** |
| `00000561-0000-4000-8000-000000000561` | token kontroli migracji, nie rekord biznesowy | `561-rls-context-functions-stable.sql:70` | `4` / `8` | **TAK** |
| `00000563-0000-4000-8000-000000000563` | token kontroli migracji, nie rekord biznesowy | `563-site-visibility-rls-hoist.sql:163` | `4` / `8` | **TAK** |
| `00000000-0000-4000-8000-000000000001`–`…0003` | zakomentowane dane dry-run, nie seed produkcyjny | `migrations/__verify__/dry-run-460-customer-item-prices.sql:23–25` | `4` / `8` | **TAK** |

Organizacja `…0002` jest następnie powielona w wielu seedach i backfillach, m.in. D365, reference data, NPD, planning i demo production. Poza sześcioma wartościami z pierwszej części tabeli nie znalazłem kolejnego niespełniającego kryterium wersja/wariant literalnego UUID w `packages/db/migrations`, `packages/db/seeds`, `scripts/seed-*.sql` ani w nietestowym kodzie aplikacji.

`combined-migrations.sql` i `packages/db/__expected__/schema.sql` są kopiami/generowanymi rezultatami tych samych źródeł, a nie dodatkowymi seedami.

## 2. Walidatory

### Zod — rozstrzygnięcie wersji

- `apps/web`, worker, DB, UI, rate-limit i e-sign rozwiązują się do **Zod `3.25.76`**.
- [Zod 3 `types.ts:599`](/Users/mariuszkrawczyk/Projects/monopilot-kira/node_modules/.pnpm/zod@3.25.76/node_modules/zod/src/v3/types.ts:599) używa regexu `8-4-4-4-12` bez kontroli wersji i wariantu.
- W nietestowym kodzie jest **254 wywołań `.uuid()` w 108 plikach**. Wszystkie te wywołania korzystające ze zwykłego importu `zod` są zatem **luźne**.
- Tylko `packages/gdpr` ma Zod `4.4.1`. Zod 4 sprawdza wersje `1–8` i wariant, dopuszczając specjalne Nil/Max UUID, ale w tym pakiecie nie znalazłem wywołania `.uuid()`.
- Nie znalazłem `validator.isUUID`, `uuid.validate` ani równoważnego walidatora bibliotecznego.

### Walidatory ścisłe

| Plik:linia | Co waliduje | Klasa | Czy może dostać `org_id`? |
|---|---|---|---|
| `scripts/rules-deploy.ts:7,63,66` | `deployedBy` i **`orgId`** wdrożenia reguł | `[1-5]` + `[89ab]` | **TAK — aktywne przecięcie** |
| `actions/invitations/get-invitation-lifecycle-token.ts:48`; `actions/users/invitations-lifecycle.ts:185` | identyfikator zaproszenia | ścisły | Nie |
| `actions/users/invite.ts:328` | selektor site, gdy podano go jako UUID | ścisły | Nie |
| `actions/infra/line.ts:63`; `actions/infra/location.ts:75` | site, warehouse, location, line, parent | ścisły | Nie |
| `actions/tenant/promote-canary.ts:34`; `set-rule-variant.ts:40`; `rollback-upgrade.ts:44` | ID uruchomienia migracji, wariantu lub definicji reguły | ścisły | Nie; to nie tenant/org PK |
| `actions/schema/add-column.ts:427` | `approvedBy`, czyli użytkownik | ścisły | Nie |
| `app/api/scanner/site-access.ts:3`; `print-label/route.ts:41`; `warehouse/scanner/lp/route.ts:43`; `receive-line/route.ts:8`; `location/route.ts:8` | site, line, WO, LP, location i produkty skanera | ścisły | Nie |
| `app/api/production/scanner/wos/[id]/start/route.ts:28` | opcjonalny identyfikator zmiany | ścisły | Nie |
| `lib/warehouse/receive-po-line-core.ts:877`; `scanner/receive-po.ts:571`; `scanner/movement.ts:987`; `modules/warehouse/_actions/receive-po-line.ts:244` | PO line, LP, location, warehouse, WO i materiał | ścisły | Nie |
| `app/(npd)/pipeline/_actions/get-project.ts:332`; `close-out-legacy-stages.ts:350` | projekt/pilot WO | ścisły | Nie |
| Formulation: `get-formulation.ts:345`, `create-draft.ts:99`, `create-version.ts:157`, `load-recipe-cascade.ts:487`, `resolve-live-wip-costs.ts:66`, `save-draft.ts:570`, `submit-for-trial.ts:168`, `lock-version.ts:173` | projekty, wersje formulacji i encje receptury | ścisły | Nie |
| `npd/.../pilot/_actions/create-pilot-wo.ts:109` | powiązane WO i linia | ścisły | Nie |
| `settings/customer-prices/...:47`; `settings/infra/printers/...:94` | customer/item/price oraz printer/site/template | ścisły | Nie |
| `scheduler/_actions/scheduler-actions.ts:134`; `planning/_actions/freight-actions.ts:66`; `releaseWorkOrder.ts:42` | run/assignment/line, carrier/supplier, WO | ścisły | Nie |
| `technical/items/_actions/upload-supplier-spec-doc.ts:120` | supplier-spec ID | ścisły | Nie |
| `shipping/.../shipment-ship-controls.tsx:142` | ukrywanie technicznego UUID w UI | ścisły wzorzec, ale nie bramka zapisu | Nie |
| `migrations/516-npd-sensory-project-integrity.sql:87` | czy `sensory.subject_ref` wygląda jak project UUID | ścisły SQL | Nie znaleziono zasianego niepoprawnego ID na tej ścieżce |
| `scheduler/runs/_actions/runs-loaders.ts:18`; `shipping/_actions/so-create-idempotency.ts:63` | scheduler run i `clientOpId` | wersje `[1-8]` + wariant | Nie |
| `packages/server/src/idempotent.ts:9–16` | wyłącznie `transactionId` UUID v7 | ścisła wersja 7, ale kod nie kontroluje wariantu | Nie |

Ścisłe regexy w `crud.test.ts:245`, `pack-actions.test.ts:576` i `packages/server/src/__tests__/idempotent.test.ts:64` są testowe, nie produkcyjne.

### Walidatory luźne

| Plik / grupa | Co waliduje | Klasa | Czy przepuszcza `…0002`? |
|---|---|---|---|
| Zod 3 `.uuid()` — 254 wywołania w 108 plikach | identyfikatory projektów, WO, jakości, shippingu, NPD, techniczne, maintenance itd. | **luźny** | Tak |
| `lib/auth/with-org-context.ts:180`; `lib/platform/platform-context.ts:9`; `lib/site/site-context.ts:37` | kontekst organizacji/site/platform override | luźny | **Tak** |
| `packages/db/schema/sites.zod.ts:32` | `orgId` w schemacie site | luźny | **Tak** |
| `settings/sites/_actions/sites.ts:216` | `orgId` i site ID | luźny | **Tak** |
| Bieżące lokalne wersje `settings/devices/...:97`, `settings/shifts/...:97`, `settings/ship-override-reasons/...:108` | `orgId` oraz lokalne ID ustawień | luźny | **Tak**; w `HEAD` były ścisłe |
| Osiem kopii `owner-org-context.ts`: `apps/worker:19`, `packages/{cascade-engine,queries,rbac,schema-driven,storage}:19`, `packages/db/src/erasure:19`, `packages/db/__tests__:42` | heurystyczne wyciąganie org z parametrów testowej sesji DB | luźny w worktree | **Tak**; w `HEAD` były ścisłe |
| `app/(admin)/gdpr/_actions/redact-user.ts:41`; `api/settings/d365/.../retry/route.ts:28`; D365 `dlq-actions.ts:31`, `drift-actions.ts:41` | user ID oraz identyfikatory rekordów D365 | luźny | Nie są to ścieżki `orgId` |
| `lib/corrections/material-scope.ts:6`; `lib/shipping/pack-lp-into-box.ts:31`; `lib/technical/lab/read-model.ts:137`; `actions/technical/boms/validate-component.ts:50` | materiały, LP, dane lab/BOM | luźny | Nie |
| Produkcja: `reverse-consume/route.ts:69`, `get-wo-action-context.ts:150`, `corrections-actions.ts:171`, `get-work-order-detail.ts:934`, `list-work-orders.ts:118`, `output-qa-actions.ts:39`, `consume-material-actions.ts:191`, `labor-actions.ts:18`, `downtime-data.ts:39` | WO, output, waste, consumption, LP i labor | luźny | Nie |
| `planning/_actions/mrp.ts:887`; `shipping/_actions/pick-actions.ts:601`; `warehouse/counts/_actions/count-actions.ts:119` | encje MRP/pick/count | luźny | Nie |
| `dashboard/activity-labels.ts:168`; `dashboard-summary.ts:177`; OEE `andon-data.ts:27`, `oee-data.ts:112`; quality `labels.ts:344` | rozpoznawanie technicznych ID w read-modelach/UI | luźny detektor | Nie |
| `npd-attachments.ts:151`; `upload-brief-attachment.ts:99`; handoff `get-handoff.ts:179,188,224,233`; sensory `get-sensory-evaluation.ts:53` | prefixy plików, projekt/BOM/sensory | luźny | Nie |
| PostgreSQL `uuid`, `::uuid` i Drizzle `uuid()` | składnia UUID | luźny względem wersji/wariantu | **Tak** |

## 3. PRZECIĘCIA

Stan jest nietrywialny: w drzewie roboczym istnieją już **niezacommitowane zmiany** poluzowujące trzy produkcyjne walidatory i osiem helperów testowych. Nie są to moje zmiany.

Nie sprawdzałem, czy te lokalne poprawki są wdrożone. Dlatego rozdzielam `HEAD` od bieżącego worktree.

### 1. Wdrożenie reguł dla organizacji Apex — nadal aktywne w worktree i `HEAD`

`scripts/rules-deploy.ts:66` sprawdza `orgId` ścisłym regexem. CLI pobiera tę wartość z `ORG_ID` na linii 405.

Konkretny skutek: **nie można wdrożyć ani zaktualizować żadnej definicji reguły dla organizacji pilota**. Funkcja kończy się `invalid_input` jeszcze przed odczytem reguł i zapisem do bazy/outboxa.

To ścieżka operacyjna/CI, nie ekran. Nie znalazłem jej wpisanej jako skrypt w `package.json`, więc faktyczne podpięcie do produkcyjnego pipeline’u nie zostało potwierdzone.

### 2. Ustawienia urządzeń — defekt w `HEAD`, lokalnie poluzowany

W `HEAD` `settings/devices/_actions/devices.ts` miał ścisły regex. Dotyczył `orgId` w:

- `queryDevices` — odrzucał org i zwracał `[]`;
- `queryDeviceDefaults` — odrzucał org i zwracał sztuczne wartości `5 / true / true`.

Konkretny skutek: **administrator widzi pustą listę skanerów i fałszywe ustawienia auto-lock/offline/login-per-shift zamiast konfiguracji zapisanej w bazie**. Nie może wiarygodnie skontrolować konfiguracji urządzeń.

Bieżący worktree zmienia regex na luźny; zmiana jest niezacommitowana.

### 3. Kalendarz zmian — defekt w `HEAD`, lokalnie poluzowany

`settings/shifts/_actions/shifts.ts:239–247` walidował ścisło `orgId` przed odczytem `org_non_production_days`.

Konkretny skutek: **kalendarz zmian zwraca pustą tablicę dla każdego miesiąca**, więc planista/administrator nie zobaczy świąt, zamknięć i dni nieprodukcyjnych zapisanych dla organizacji.

Bieżący worktree ma luźny regex; zmiana jest niezacommitowana.

### 4. Powody shipping/RMA — potwierdzony defekt w `HEAD`, lokalnie poluzowany

Ścisły `UuidInput` był używany przez schematy create/update/delete/list reason codes.

Konkretny skutek: **administrator nie może dodać, zmienić ani usunąć powodu zwrotu/override dla organizacji Apex**. Potwierdzony przypadek create kończy się przed bazą, a UI błędnie sugeruje duplikat kodu.

Bieżący worktree ma już luźny regex na linii 108; zmiana jest niezacommitowana.

### Nie zaliczam jako produkcyjne przecięcia

- `owner-org-context.ts` rzeczywiście wybierał user/row ID jako org i powodował `session_org_contexts_org_id_fkey`, ale wszystkie osiem kopii jest w helperach testowych. To defekt infrastruktury testowej, nie bezpośrednia ścieżka operatora.
- Nie znalazłem pewnego ścisłego przecięcia dla tenant ID `…0001`, sentinelów GDPR `…dd/ee/ff/0000` ani rodziny demo `259…`. Rodzina demo i persony są poprawnymi v4.
- `settings/sites`, centralny `withOrgContext`, platform context i site context są już luźne.

Wniosek: **cztery pewne przecięcia w stanie `HEAD`, z czego trzy mają istniejące lokalne, lecz niezacommitowane poprawki. W aktualnym worktree pozostaje jedno ścisłe przecięcie `orgId`: `rules-deploy`.**

## 4. Dwie drogi naprawy

| Droga | Koszt | Ryzyko |
|---|---|---|
| Poluzowanie walidatorów przyjmujących wewnętrzny `org_id` | Małe. Zmiana regexu na kontrolę formatu `8-4-4-4-12`; zachowanie osobnego zakazu Nil tam, gdzie jest potrzebny. Trzy takie zmiany już istnieją lokalnie. | Walidator dopuści UUID-shaped wartości bez poprawnej wersji/wariantu. Nie należy poluzowywać hurtowo walidatorów zewnętrznych ani identyfikatorów idempotencji. |
| Migracja wszystkich zasianych ID | Duże. Nowa migracja forward-only musi zmienić tenant/org/role/user PK oraz wszystkie FK i kopie w auth metadata, seedach, skryptach, D365 constants, outbox/audit/JSONB/text i konfiguracji środowisk. | Blokady tabel, kolejność FK, potencjalnie niedeferrable constraints, RLS, zewnętrzne referencje i historyczne payloady. Nil UUID pełni kilka różnych ról sentinelowych, więc jego zamiana wymaga osobnej decyzji semantycznej. |

Przy migracji **nie wolno edytować zastosowanych migracji `030` ani `115`**; projekt wymaga nowej migracji, inaczej grozi mismatch checksum. Bez odczytu żywej bazy nie wiadomo też, które FK mają `ON UPDATE CASCADE`, ile rekordów odwołuje się do tych ID i jakie blokady powstaną.

Moja rekomendacja: **krótkoterminowo mniej ryzykowne jest chirurgiczne poluzowanie wyłącznie walidatorów wewnętrznego `org_id`**. Bezpieczeństwo organizacji nadal zapewniają:

- porównanie z `context.orgId`;
- `withOrgContext`;
- `app.current_org_id()` i RLS;
- klucze obce.

W `rules-deploy` można zachować istniejący osobny zakaz Nil UUID. Walidatory identyfikatorów zewnętrznych, user-generated operation IDs i UUID v7 powinny pozostać ścisłe.

Migrację danych traktowałbym jako osobny, planowany projekt naprawy inwariantu, nie jako szybki hotfix.

## 5. CZEGO NIE SPRAWDZIŁEM

- Testy: **nie zostało wykonane**.
- Build/typecheck/lint: **nie zostało wykonane**.
- Baza lokalna ani żywa, migracje dry-run i kontrola FK: **nie zostało wykonane**.
- Stan produkcyjnego deploymentu/Vercel/CI: **nie zostało wykonane**.
- Sieć i zewnętrzne integracje: **nie zostało wykonane**.
- Runtime Zod: nie został uruchomiony; werdykt pochodzi z lockfile, manifestów i kodu zainstalowanej biblioteki.
- Nie potwierdziłem, że dane żywej bazy nadal mają dokładnie wartości z migracji.
- Nie sprawdziłem historii Git ani tego, które niezacommitowane poprawki zostaną wdrożone.
- Statyczny spis nie obejmuje identyfikatorów dostarczanych wyłącznie przez env, zewnętrzne systemy lub dane niewystępujące literalnie w repo.
- Niczego nie zmodyfikowałem.
