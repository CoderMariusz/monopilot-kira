# FINDING-UPRAWNIENIA — audyt bramek uprawnień i kontroli dostępu

Tor: uprawnienia / RBAC / site-scope. Data: 2026-07-30. Baza dowodowa: izolowany klon `monopilot_t2`
(507 migracji, 5 person, harness). Uruchomiono **prawdziwą ścieżkę app-role (RLS `app_user`)** przez
test-stub `withOrgContext` (`NEXT_SERVER_ACTION_ACTOR_USER_ID`/`_ORG_ID`). Nic nie naprawiano, nic nie
commitowano. Skrypt dowodowy zachowany poza drzewem repo:
`~/.claude/jobs/onboarding-persist-before-gate-proof.test.ts.txt` (3/3 zielone).

**Wspólny mianownik #1–#3 (rodzeństwo `completeOnboarding`):** akcja onboardingu wykonuje realną
mutację danych w **osobnej, samodzielnie commitującej** transakcji `withOrgContext` **przed**
sprawdzeniem uprawnienia. Jedyna bramka (`settings.onboarding.complete`) siedzi w **kolejnym** kroku
`mutateOnboarding('advance')`, który odpala **po** zatwierdzeniu zapisu — więc `forbidden` wraca do
UI, ale stan trwały już się zmienił. Kontrola: `advanceOnboarding`/`completeOnboarding` sprawdzają
uprawnienie PRZED odczytem i mutacją (`advance.ts:72-75`); zapis-przed-bramką dotyczy wyłącznie tych
trzech akcji, które robią własny `insert/update` obok stanu onboardingu. RLS na `organizations`,
`warehouses`, `locations` jest **wyłącznie org-scope** (`org_id = app.current_org_id()`, bez roli),
więc RLS tego nie ratuje. Okno ataku = organizacja z `onboarding_completed_at IS NULL` (Apex — organizacja
person — jest w tym oknie). Aktor: `no_module_access` (dokładnie **0 uprawnień**).

| # | Co jest błędne (jedno zdanie) | Plik:linia | Dowód (persona → akcja → stan w bazie) | Ryzyko dla użytkownika | Pewność |
|---|---|---|---|---|---|
| 1 | `saveOrgProfile` nadpisuje profil organizacji (`name/timezone/locale/currency/gs1_prefix`) w samodzielnie commitującej transakcji **bez sprawdzenia uprawnienia**; bramka `settings.onboarding.complete` odpala dopiero w następnym kroku `advance` — po commicie | `actions/onboarding/save-org-profile.ts:65-66` (persist woła się pierwszy) → `:103-157` (własny `withOrgContext`, `UPDATE public.organizations` `:127-143`, zero gate) ; bramka dopiero w `:68` przez `mutateOnboarding('advance')` | `no_module_access` (0 uprawnień) → `saveOrgProfile({orgName:'AUDIT-NOPERM-ORGNAME', gs1Prefix:'9990001', …})` → funkcja zwraca `{ok:false,error:'PERSISTENCE_FAILED'}`, ale w bazie `organizations.name='AUDIT-NOPERM-ORGNAME'`, `gs1_prefix='9990001'` (**zmienione**). Kontrola pary: **ta sama** persona → `advanceOnboarding({step:1})` → `{ok:false,error:'forbidden'}`, `onboarding_state` **bez zmian**; `admin` (ma `settings.onboarding.complete`) → advance **przechodzi bramkę** (błąd nigdy nie `forbidden`) | Członek organizacji **bez żadnych uprawnień** (dopóki onboarding trwa) przepisuje nazwę firmy, walutę, locale, strefę i **prefiks GS1** — a `gs1_prefix` steruje generowaniem SSCC/kodów kreskowych: podmiana psuje etykiety wysyłkowe całej organizacji | **potwierdzone uruchomieniem** |
| 2 | `createFirstWarehouse` wstawia magazyn (`public.warehouses`) w samodzielnie commitującej transakcji **bez sprawdzenia uprawnienia**; ta sama bramka co #1 odpala dopiero po commicie | `actions/onboarding/create-first-warehouse.ts:37` (persist pierwszy) → `:64-110` (własny `withOrgContext`, `INSERT public.warehouses` `:88-90`, zero gate) ; bramka dopiero w `:45` (`advance`) | `no_module_access` → `createFirstWarehouse({code:'AUDIT-NOPERM-WH', name:'…', type:'raw'})` → w bazie powstaje wiersz `warehouses` z tym kodem (`rowCount=1`, potwierdzone i posprzątane w teście). Ta sama persona jest odrzucana przez bramkę na ścieżce `advance` (#1) | Zerowo-uprawniony użytkownik zaśmieca dane podstawowe magazynów (dowolne kody/typy) w oknie onboardingu — magazyny wchodzą w RLS/planowanie/inwentaryzację | **potwierdzone uruchomieniem** |
| 3 | `createFirstLocation` wstawia lokalizację (`public.locations`) w samodzielnie commitującej transakcji **bez sprawdzenia uprawnienia** (identyczny kształt co #1/#2) | `actions/onboarding/create-first-location.ts:31` (persist pierwszy) → `:48-92` (własny `withOrgContext`, `INSERT public.locations` `:74-79`, zero gate) ; bramka dopiero w `:34` (`advance`) | Struktura kodu **identyczna** z #1/#2 (persist commit → dopiero potem `mutateOnboarding('advance')`); RLS `locations` też tylko org-scope (INSERT policy `with_check = org_id = app.current_org_id()`, bez roli). Nie uruchamiane osobno — wniosek z identycznej ścieżki i tej samej RLS | Zerowo-uprawniony użytkownik tworzy dowolne lokalizacje magazynowe w oknie onboardingu | silna przesłanka z kodu (ta sama ścieżka persist-przed-bramką co #1/#2, ta sama org-scope RLS) |

## Uwagi poza tabelą (świadomie NIE eskalowane do znaleziska)

- **Nie duplikuję** (z briefu / od sąsiednich torów): konsumpcja materiału ignorująca zakres zakładu
  (FEFO z cudzego zakładu) oraz `revertNpdGate` wymagający `npd.gate.advance` zamiast admina
  (`revert-npd-gate.ts:49`).
- **`requireAdmin()` to martwy kod.** `app/(npd)/pipeline/_actions/_lib/gate-helpers.ts:475` definiuje
  `requireAdmin`, ale **żadna** akcja go nie woła (0 wywołań w `app/`). Dlatego revert bramy używa
  uprawnienia modułowego, a nie admina — i nie ma innego miejsca do naprawy „przez requireAdmin".
  Podobnie `repairGateStageSkew` (mutuje `npd_projects`) nie ma żadnego wywołującego — nie jest
  wystawiony jako akcja.
- **`deleteProject` bramkowany uprawnieniem `create`.** `app/(npd)/pipeline/_actions/delete-project.ts:121`
  używa `PROJECT_CREATE_PERMISSION` do DELETE (klasa „złe uprawnienie", jak `revertNpdGate`), ale to
  „kto może tworzyć, może kasować" — niska waga, nie eskaluję.
- **`getSignedUrl` (odczyt) wymaga uprawnienia `npd.compliance_doc.write`** (`docs/_actions/get-signed-url.ts:33`)
  — nadmiernie restrykcyjne, nie dziura. Sam `uploadDoc`/`softDeleteDoc`/`getSignedUrl` **poprawnie**
  bramkują przez `hasComplianceDocWritePermission`.
- **`app.user_can_see_site` ma udokumentowane fail-open**: `current_user_id() IS NULL`, **zero wpisów
  `user_sites` = nieograniczony**, oraz `p_site_id IS NULL` = widoczne. To projektowe (komentarze w
  funkcji), ale warto pamiętać: wiersze produkcyjne z `site_id IS NULL` (np. `wo_outputs` bez site) są
  widoczne cross-site, a `wo_outputs`/`wo_events`/`downtime_events` mają **tylko** org-scope RLS
  (brak restrykcyjnej `*_site_visibility`, inaczej niż `work_orders` i `license_plates`).

## Zweryfikowane jako POPRAWNE (pokrycie, nie znaleziska)

- **Maintenance**: `deactivate`/`reactivate` aktywu → oba `mnt.asset.deactivate`
  (`assets/_actions/asset-actions.ts:245,313`); MWO create/execute/cancel → `mnt.mwo.request/execute/cancel`;
  LOTO apply/release → `mnt.loto.apply`/`mnt.loto.clear`; PM → `mnt.pm.create`; read → `mnt.asset.read`.
  Bramki obecne w każdej mutacji, SoD LOTO egzekwowane w kodzie i w bazie (mig 514). Bez znaleziska.
- **Onboarding gated core**: `advance/back/jump/skip/restart/first_wo` → wszystkie przez
  `mutateOnboarding` z `hasOnboardingPermission` PRZED odczytem/mutacją; `completeOnboarding` już
  naprawiony (`complete-onboarding.ts:57-60`).
- **Pipeline NPD**: `clone`→`npd.project.create`, `bulk`→`npd.core.write`, `advance/approve`→
  `npd.gate.advance`/`npd.gate.approve`; `close-out-legacy-stages` to wewnętrzny helper gated-`advance`.
- **Site-scope produkcji**: `work_orders` i `license_plates` mają **RESTRICTIVE** `*_site_visibility`
  `FOR ALL` (`USING` + `WITH CHECK` = `app.user_can_see_site(site_id)`), więc desktopowe akcje WO
  (start/pause/resume/complete/cancel/close) są chronione tranzytywnie (SELECT po `work_orders` zwraca
  `not_found` dla cudzego zakładu).
- **Fail-open**: brak w helperach `lib/auth`, `lib/rbac`, `lib/site` (catch nie zwraca `true`);
  znalezione `?? true` to wyłącznie domyślne flagi UI (`page.tsx`), a serwer i tak re-sprawdza.
