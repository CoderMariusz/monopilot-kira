# FAZA 2 — inwentarz GAP: NPD / Settings / Auth (`NSA`) — 63 pozycji

Wygenerowane 2026-07-29. Indeks i metodyka: [`FAZA-2-GAP-INWENTARZ.md`](FAZA-2-GAP-INWENTARZ.md).

`kat:N` = linia w `_meta/plans/2026-07-18-full-test-catalog/FULL-TEST-CATALOG.md`.
Kolumna **test dziś** pochodzi z klasyfikacji dowodu z 18-19.07 — patrz ostrzeżenie o wieku werdyktu w indeksie.

Rozkład: brak testu 18 · brak (tylko źródło) 28 · czerwony/pominięty 1 · zielony 15 · zielony+pominięty 1 · przeglądarka 3 · persona 12


## A. NPD Pipeline — stage'y i gate'y (`app/(npd)/pipeline`)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `NSA-007` | **Brak uprawnienia npd.gate.advance** — RBAC na advance. *Kroki:* 1) User bez `npd.gate.advance`. 2) advanceProjectGate. | kat:6620 · `requireActionPermission` → `FORBIDDEN` (403) (`advance-project-gate.ts:281`, `gate-helpers.ts:464-468`). | Permission guard exists; no separate non-privileged identity was exercised. | brak testu | nie | tak | P0 |
| `NSA-010` | **SOFT gate override — audyt zapisany** — override z notatką odblokowuje i pisze audyt. *Kroki:* 1) Soft-gate blocked. 2) advance z `override.note`. | kat:6638 · przejście PASS + `writeGateOverrideAudit` action `npd.stage.gate_overridden` (`advance-project-gate.ts:209-234`). | Override path is covered at a seam; persisted audit row needs DB integration. | zielony | nie | nie | P1 |
| `NSA-016` | **Launch bez product_code** — brak zmapowanego FG blokuje launch. *Kroki:* 1) Projekt handoff bez product_code. 2) advance do launched. | kat:6674 · `LAUNCH_COMPLIANCE_BLOCKED` "Map a finished-good product before launch" (`gate-helpers.ts:606-613`). | Product-code blocker is source-covered; full launch integration unavailable. | brak (tylko źródło) | nie | nie | P1 |
| `NSA-017` | **Launch wymaga ≥1 ważnego compliance doc niezależnie od config C7** — nawet gdy C7 not_required, brak dokumentów blokuje launch. *Kroki:* 1) Org z C7=not_required w `npd_approval_criterion_config`, 0 valid docs. 2) advance do launched. | kat:6680 · wymuszony C7 przy 0 non-deleted/non-expired docs (`gate-helpers.ts:630-640`). | C7 document forcing requires persisted approval config/documents. | brak testu | nie | nie | P0 |
| `NSA-018` | **approveProjectGate — approve wymaga hasła** — schemat discriminated — approve wymaga `password`, reject nie. *Kroki:* 1) approveProjectGate approve bez password. 2) reject bez password. | kat:6686 · approve bez password → invalid; reject dozwolony bez (`approve-project-gate.ts:35-50`). | Schema/source guard is present; real password reauthentication not exercised. | brak testu | nie | nie | P0 |
| `NSA-019` | **approveProjectGate — GATE_MISMATCH** — gateCode musi zgadzać się z derywowanym gate'em projektu. *Kroki:* 1) Projekt w G3. 2) approve z gateCode='G4'. | kat:6692 · `GATE_MISMATCH` (409) (`approve-project-gate.ts:80-82`). | Gate mismatch guard is source-covered; integration suite needs `DATABASE_URL`. | brak (tylko źródło) | nie | nie | P1 |
| `NSA-020` | **approveProjectGate — brak npd.gate.approve** — RBAC na approve. *Kroki:* 1) User bez uprawnienia. 2) approve. | kat:6698 · FORBIDDEN (403) (`approve-project-gate.ts:74`). | Approval RBAC is source-covered; no restricted identity. | brak (tylko źródło) | nie | tak | P0 |
| `NSA-022` | **approvalTargetStage — G3 tylko pilot→approval, G4 tylko approval→handoff** — aprobata nie może advance'ować niewłaściwego stage'a. *Kroki:* 1) approve G3 na projekcie nie-pilot. 2) approve G4 na nie-approval. | kat:6710 · `approvalTargetStage` ogranicza (`approve-project-gate.ts:203-207`). | Target-stage helper is covered indirectly, not as a complete approval action. | brak testu | nie | nie | P1 |
| `NSA-023` | **revertNpdGate wymaga admina** — rollback gate'u tylko dla admina. *Kroki:* 1) Non-admin wywołuje revertNpdGate. 2) Admin. | kat:6716 · `requireAdmin` → FORBIDDEN (403) dla non-admin (`gate-helpers.ts:470-484`; `revert-npd-gate.ts`). | Revert action tests are green; admin/non-admin identity boundary remains untested. | zielony | nie | tak | P1 |
| `NSA-027` | **releaseToFactory — preflight blockers** — release do Technical blokuje gdy warunki niespełnione. *Kroki:* 1) Projekt nie-G4 / bez FG / z open high risk / bez active BOM / bez factory spec. 2) releaseToFactory. | kat:6740 · blockery `LAUNCHED_IS_TERMINAL, G4_REQUIRED, FG_CANDIDATE_REQUIRED, V18_OPEN_HIGH_RISK, ACTIVE_SHARED_BOM_REQUIRED, FAC… | Packaging preflight test is green; full blocker matrix is incomplete. | zielony | nie | tak | P0 |
| `NSA-028` | **releaseToFactory — sfałszowany/obce-org factorySpecId odrzucony** — F1 security — caller-supplied factorySpecId walidowany. *Kroki:* 1) release z factorySpecId z innego org / sfałszowanym UUID. | kat:6746 · `validateSuppliedFactorySpecId` waliduje org + status + FG item_code + BOM header/version (`release-preflight.ts:215-24… | Supplied factory-spec validation is source-covered; no cross-org fixture. | brak (tylko źródło) | nie | nie | P0 |

## B. NPD Formulacje — wersjonowanie (`app/(npd)/pipeline/[projectId]/formulation`)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `NSA-029` | **lockVersion — brak npd.formulation.lock** — RBAC na lock. *Kroki:* 1) User bez uprawnienia. 2) lockVersion. | kat:6758 · `forbidden` (`lock-version.ts:43`). | Permission guard exists; no restricted identity. | brak testu | nie | tak | P0 |
| `NSA-030` | **lockVersion — już locked** — podwójny lock. *Kroki:* 1) Wersja locked. 2) lockVersion. | kat:6764 · `VERSION_LOCKED` (`lock-version.ts:80`). | State guard exists; live lifecycle suite is unavailable without DB. | brak testu | nie | nie | P1 |
| `NSA-031` | **lockVersion — wersja nie-draft** — lock tylko z draft. *Kroki:* 1) Wersja `submitted_for_trial`. 2) lockVersion. | kat:6770 · `VERSION_NOT_DRAFT` (`lock-version.ts:81-83`). | Non-draft guard is source-covered; exact persisted state not exercised. | brak (tylko źródło) | nie | nie | P1 |
| `NSA-033` | **lockVersion — brakujący koszt składnika** — każdy składnik ma cost_per_kg_eur. *Kroki:* 1) Wersja ze składnikiem `cost_per_kg_eur IS NULL`. 2) lockVersion. | kat:6782 · `MISSING_COST` (`lock-version.ts:58-59, 85`). | Missing-cost guard is source-covered; DB lifecycle suite unavailable. | brak (tylko źródło) | nie | nie | P0 |
| `NSA-034` | **lockVersion — brakujący target nutrition** — wymagane NUTRIENT_CODES obecne w calc_cache. *Kroki:* 1) Wersja bez pełnego nutrition_json. 2) lockVersion. | kat:6788 · `MISSING_NUTRITION_TARGET` (`lock-version.ts:60-67, 86-88`). | Missing-nutrition guard is source/action-covered but not persisted. | brak testu | nie | nie | P1 |
| `NSA-035` | **lockVersion — sukces kaskaduje recipe_components na product** — lock zapisuje locked_at/locked_by, kaskaduje recipe_components/ingredient_codes. *Kroki:* 1) Poprawna draft. 2) lockVersion. | kat:6794 · state=locked, `formulations.locked_at=now(), locked_by_user`; update `product.recipe_components/ingredient_codes`; audi… | Lock success is green at action seam; product cascade/audit/outbox need DB. | zielony | nie | nie | P1 |
| `NSA-039` | **unlockVersion — brak outbox (audit gap)** — znany TODO(A6) — unlock nie emituje outbox. *Kroki:* 1) unlockVersion sukces. 2) Sprawdź outbox_events. | kat:6818 · brak eventu (`unlock-version.ts:106`) — kandydat na lukę audytu. | Source confirms unlock audit but no outbox event; catalog records this audit gap. | brak (tylko źródło) | nie | nie | P2 |
| `NSA-041` | **submitForTrial — re-waliduje pct/cost/nutrition i tworzy T-1** — powtórna walidacja + utworzenie trial_batches. *Kroki:* 1) Locked wersja. 2) submitForTrial. | kat:6830 · te same guardy pct/cost/nutrition; tworzy T-1 trial_batches jeśli brak; state locked→submitted_for_trial (`submit-for-t… | Transition and pct/nutrition guards are green; T-1 creation/audit needs DB. | zielony | nie | nie | P1 |

## C. NPD Costing — matematyka WIP (`apps/web/lib/npd/wip-cost.ts`, `lib/costing/compute-waterfall.ts`)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `NSA-048` | **Setup = 0 gdy volume lub wipQty = 0** — brak dzielenia przez zero. *Kroki:* 1) Amortization volume=0. 2) Policz. | kat:6885 · zwraca 0 (`wip-cost.ts:301`). | Zero denominator is guarded in source; no dedicated boundary assertion. | brak (tylko źródło) | nie | nie | P1 |
| `NSA-055` | **Waterfall packaging waste_pct (NIE scrap_pct)** — packaging mnożony przez (1+waste_pct/100). *Kroki:* 1) Komponent packaging waste_pct=5. 2) Policz. | kat:6927 · `qtyPerBox × costPerUnit × (1 + wastePct/100)` (`compute-waterfall.ts:427-433`). | Packaging contributes to waterfall, but exact waste-only boundary lacks a dedicated assertion. | brak testu | nie | nie | P0 |
| `NSA-057` | **Boundary waste/scrap nie mieszane** — NPD waste_pct (D41) ≠ bom_lines.scrap_pct (WO requisition). *Kroki:* 1) Ten sam BOM w costing NPD vs WO. 2) Porównaj czynniki. | kat:6939 · waterfall używa waste_pct ×(1+); WO/MRP używa scrap_pct ÷(1−) — rozdzielne (komentarz `compute-waterfall.ts:427`). | NPD waste versus WO scrap requires a two-engine comparison. | brak testu | nie | nie | P0 |

## E. NPD Allergen cascade (`app/(npd)/fa/[productCode]/allergens`)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `NSA-068` | **updateFaAllergenSet — perm npd.allergen.write** — RBAC (role_permissions ORAZ roles.permissions jsonb). *Kroki:* 1) User bez uprawnienia. 2) update. | kat:7017 · `FORBIDDEN` (`update-allergen-set.ts:93-113`). | Allergen write permission is source-covered; no restricted actor. | brak (tylko źródło) | nie | tak | P0 |
| `NSA-069` | **Cascade idempotentny — emit tylko przy changed** — brak zmiany nie pisze/revaliduje. *Kroki:* 1) update bez zmiany. 2) update ze zmianą. | kat:7023 · persist/revalidate `/npd/fg/{code}/allergens` tylko gdy changed=true (`update-allergen-set.ts:72-74`). | Idempotent update seam is covered; persisted changed/no-change event proof absent. | zielony | nie | nie | P1 |
| `NSA-073` | **C5 audited = job LUB declaration accepted** — kryterium C5 spełnione przez rebuild job albo akceptację. *Kroki:* 1) Bez job, z declaration accepted. 2) Evaluate C5. | kat:7047 · `audited = processed allergen_cascade_rebuild_jobs OR allergens_declaration_accepted` (`evaluate-core.ts:151-161, 225-2… | C5 evaluation is source-covered; processed-job/declaration DB alternatives not both exercised. | brak (tylko źródło) | nie | nie | P1 |

## F. Users / Invite (`apps/web/actions/users/invite.ts`)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `NSA-076` | **seat_limit NULL = unlimited** — brak limitu. *Kroki:* 1) Org seat_limit NULL, wielu aktywnych. 2) inviteUser. | kat:7069 · brak blokady (`invite.ts:144`). | NULL limit is source-covered; no dedicated unlimited test. | brak (tylko źródło) | nie | nie | P1 |
| `NSA-077` | **Pending invites NIE konsumują seat (edge)** — count liczy tylko is_active=true. *Kroki:* 1) Org seat_limit=3, 2 aktywnych + 5 pending. 2) inviteUser. | kat:7075 · dozwolone — pending (is_active=false) nie liczone (`invite.ts:136-142`) — potencjalne przekroczenie intencji. | Active-only counting confirms the pending-invite edge in source; no concurrency proof. | brak (tylko źródło) | nie | nie | P1 |
| `NSA-081` | **Inactive bez outstanding invite → email_taken** — inactive bez tokenu (np. zdeaktywowany) nie da się re-zaprosić tą ścieżką. *Kroki:* 1) Inactive user bez tokenu. 2) inviteUser. | kat:7099 · `email_taken` (`invite.ts:173-175`). | Inactive-without-token branch is source-covered, not directly asserted. | brak (tylko źródło) | nie | nie | P1 |
| `NSA-082` | **Invite — rola z innego org / system role zabroniony** — rola musi należeć do org i nie być forbidden system default. *Kroki:* 1) roleId z org B. 2) rola w SYSTEM_ROLE_CODES_FORBIDDEN_AS_DEFAULT. | kat:7105 · `invalid_input` (`invite.ts:122-127`). | Cross-org role rejection is green; forbidden system-default matrix is partial. | zielony | nie | tak | P1 |

## G. Roles (`apps/web/actions/users/assign-role.ts`, `settings/roles/_actions`)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `NSA-096` | **Brak akcji usuwania roli (by-design / gap)** — rola w użyciu nie ma ścieżki delete. *Kroki:* 1) Szukaj delete-role action. | kat:7193 · brak akcji delete; UI pokazuje `usersAssigned` bez delete (`roles-screen.client.tsx:28, 457`) — potwierdzić intencję. | Source/production UI confirms there is no role deletion path; intent remains unresolved. | brak testu | TAK | tak | P2 |

## I. Auth — login / PIN (`app/[locale]/(auth)/login/_actions/auth.ts`, `api/scanner/login`)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `NSA-101` | **Login happy path** — poprawne dane logują i redirectują. *Kroki:* 1) Poprawny email+hasło. | kat:7231 · signInWithPassword → refreshSession → redirect `/${locale}/` (bez MFA) (`auth.ts:39-72`). | Production authenticated session works, but fresh login unit is red from stale `getUser` mock. | czerwony/pominięty | nie | nie | P0 |
| `NSA-103` | **Login — brak email/hasła** — walidacja wejścia. *Kroki:* 1) Puste pole. | kat:7243 · "Email and password are required." (`auth.ts:35-37`). | Required fields are source-covered; no dedicated empty-field run. | brak (tylko źródło) | nie | nie | P2 |
| `NSA-105` | **Brak app-level lockout na password login (gap)** — brute-force na /login polega tylko na throttlingu Supabase. *Kroki:* 1) Wiele błędnych prób. | kat:7255 · brak licznika/lockout w aplikacji (dokumentacja luki). | Source confirms no application password lockout beyond Supabase throttling. | brak (tylko źródło) | nie | nie | P1 |

## J. MFA TOTP (`packages/auth/src/totp.ts`)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `NSA-109` | **MFA_MASTER_KEY guard point-of-use (prod)** — prod bez klucza rzuca przy enroll/verify, nie przy imporcie. *Kroki:* 1) NODE_ENV=production, MFA_MASTER_KEY unset. 2) enrollTotp/verifyTotp. 3) Sprawdź że import/build nie crashuje. | kat:7285 · `getMfaMasterKeyFromEnv` throw w prod (`:39-42`); import side-effect-free (`:53-59`). | Point-of-use environment guard is source-covered; production missing-key case was not invoked. | brak (tylko źródło) | nie | nie | P0 |

## K. SAML/SSO + tenant_idp (`api/auth/saml/callback`, mig509)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `NSA-117` | **Tenant IdP resolution na owner connection** — resolucja tenant IdP przed sesją. *Kroki:* 1) SAML callback z org_id z RelayState. | kat:7337 · lookup na owner conn (app.current_org_id niedostępny), join `tenant_idp_config`↔`organizations`; brak → 400 (`callback/… | Tenant IdP resolution is covered by mocked integration, not owner-connection DB. | brak testu | nie | nie | P1 |
| `NSA-119` | **Post-auth org context fail-loud** — nieudane seedowanie org context → 500, nie ciche. *Kroki:* 1) Wymuś błąd set_org_context. | kat:7349 · 500 (fail-loud, komentarz o wycieku/zerowaniu danych) (`callback/route.ts:158-188`). | Fail-loud org context is source/integration-covered; forced live failure unavailable. | zielony+pominięty | nie | nie | P0 |
| `NSA-121` | **enforce_for_non_admins / mfa_required policy** — wymuszenie SSO/MFA per polityka. *Kroki:* 1) Polityka enforce_for_non_admins=true. 2) Non-admin login. | kat:7361 · handleSamlCallback stosuje enforce (`callback/route.ts:126-147`; mig509 pola). | Policy fields and callback path are covered; distinct non-admin live login absent. | zielony | nie | tak | P1 |

## L. Session (`apps/web/lib/auth/session-check.ts`)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `NSA-122` | **Idle timeout na podstawie JWT iat, weryfikowany JWKS** — idle liczony z iat, podpis weryfikowany przed zaufaniem. *Kroki:* 1) Token starszy niż idleTimeoutMin. | kat:7371 · podpis via JWKS `/auth/v1/user`; `idleSeconds > idleTimeoutMin*60` → 401; strict `>` (dokładnie N nie wygasa) (`session… | JWKS/strict timeout logic is source-covered without a dedicated behavioral suite. | brak (tylko źródło) | nie | nie | P0 |
| `NSA-124` | **Absolutny cap 8h** — max sesja 8h niezależnie od configu. *Kroki:* 1) Sesja >8h nawet z idle never. | kat:7383 · `ABSOLUTE_MAX_SESSION_S=8h` → 401 (`session-check.ts:123, 160-165`). | Eight-hour cap is source-covered but not freshly clock-tested. | brak (tylko źródło) | nie | nie | P1 |
| `NSA-125` | **Fail-closed w prod przy braku Supabase env** — brak env → 401 (prod). *Kroki:* 1) Prod bez Supabase env. 2) checkIdleTimeout. | kat:7389 · null → 401; non-prod decode-only (`session-check.ts:87-97`). | Production fail-closed missing-env branch was not safely invoked. | brak testu | nie | nie | P1 |
| `NSA-126` | **Refresh resetuje zegar idle** — refreshSession mintuje nowy iat. *Kroki:* 1) Login/MFA → refreshSession. 2) Sprawdź nowy iat. | kat:7395 · `refreshSession()` po login/MFA (`auth.ts:54, 117`); kontekst z `getUser()` nie `getSession()` (`with-org-context.ts:22… | Refresh/getUser flow is source-covered; fresh `iat` comparison absent. | brak (tylko źródło) | nie | nie | P1 |
| `NSA-127` | **Brak tokenu → 401 natychmiast** — no-token. *Kroki:* 1) checkIdleTimeout bez tokenu. | kat:7401 · 401 (`session-check.ts:137-142`). | Immediate no-token path is source-covered without a direct test. | brak (tylko źródło) | nie | nie | P2 |

## M. Password reset

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `NSA-128` | **sendPasswordReset — brak enumeracji userów** — zawsze success niezależnie od istnienia emaila. *Kroki:* 1) Reset dla istniejącego. 2) Dla nieistniejącego. | kat:7411 · `{success:true}` w obu; `resetPasswordForEmail` z redirectTo `/${locale}/login` (`auth.ts:75-93`). | Anti-enumeration behavior is source-covered; two real reset requests were not sent. | brak (tylko źródło) | nie | nie | P1 |
| `NSA-129` | **sendPasswordReset — brak email** — walidacja. *Kroki:* 1) Puste pole. | kat:7417 · wymaga email (`auth.ts:84-86`). | Empty-email validation is source-covered without a dedicated run. | brak (tylko źródło) | nie | nie | P2 |

## N. Multi-tenant / RLS (`apps/web/lib/auth/with-org-context.ts`)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `NSA-130` | **org_id z public.users, nie z JWT** — autorytatywne źródło org. *Kroki:* 1) JWT z rozjechanym org claim. | kat:7427 · org z `public.users.org_id`; rowCount!==1 → throw; deactivated → throw (`with-org-context.ts:240-254`). | Authoritative `public.users.org_id` lookup is source-covered; skewed JWT unavailable. | brak (tylko źródło) | nie | nie | P0 |
| `NSA-131` | **Platform act-as — tylko platform_admin** — impersonacja org tylko dla platform_admin. *Kroki:* 1) Non-platform-admin ustawia PLATFORM_ORG_COOKIE. | kat:7433 · ignorowane + audit `not_platform_admin`, fallback home org; wymaga `app.platform_admins` revoked_at IS NULL (`with-org-… | Platform act-as audit was observed in the wider run; non-admin cookie attempt unavailable. | zielony | nie | tak | P0 |
| `NSA-132` | **Act-as — niepoprawny cookie / target nieistniejący** — sanityzacja cookie. *Kroki:* 1) Non-UUID cookie. 2) Nieistniejący target org. | kat:7439 · ignorowane + audit `invalid_cookie` / `target_org_not_found` (`with-org-context.ts:261-264, 283-286`). | Cookie sanity paths are source-covered; no invalid impersonation cookie was injected. | brak (tylko źródło) | nie | nie | P1 |

## O. Onboarding (`apps/web/app/onboarding`, `apps/web/actions/onboarding`)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `NSA-134` | **saveOrgProfile — walidacja gs1Prefix i orgName** — wymagane pola. *Kroki:* 1) Bez gs1Prefix. 2) Bez orgName. | kat:7457 · `VALIDATION_FAILED` field gs1Prefix / orgName (`save-org-profile.ts:52-63`). | Org-profile wiring is green; exact field validation matrix is partial. | zielony | nie | nie | P1 |
| `NSA-135` | **createFirstWarehouse — walidacja + duplikat kodu** — name/code wymagane, unikalny code. *Kroki:* 1) Bez code. 2) Duplikat code. | kat:7463 · `VALIDATION_FAILED`; PG 23505 → `CODE_TAKEN` (`create-first-warehouse.ts:31-35, 102-103`). | Warehouse onboarding wiring is green; live duplicate-code mapping unavailable. | zielony | nie | nie | P1 |
| `NSA-136` | **createFirstLocation — warehouse resolve + walidacja** — pola i istnienie warehouse. *Kroki:* 1) Nieistniejący warehouseCode. 2) Duplikat binCode. | kat:7469 · `NOT_FOUND`; insert location_type='bin' level=4; dup → `CODE_TAKEN` (`create-first-location.ts:26-79`). | Location onboarding wiring is green; live unknown/duplicate warehouse fixture absent. | zielony | nie | nie | P1 |
| `NSA-144` | **Persistence 0-rows → persistence_failed** — org usunięty mid-request nie fabrykuje sukcesu. *Kroki:* 1) Usuń org podczas advance. | kat:7517 · `persistence_failed` (`advance.ts:89-96, 245-260`). | Zero-row persistence branch is source-covered; race not reproducible safely. | brak (tylko źródło) | nie | nie | P1 |
| `NSA-146` | **completeOnboarding — idempotencja + post-commit chain** — podwójne complete; stamp claim + refresh. *Kroki:* 1) completeOnboarding 2×. | kat:7529 · `onboarding_already_completed`; sukces: `onboarding_completed_at=now`, `stampOnboardingClaim` (fail→AUTH_METADATA_FAILE… | Timestamp/session seams are green; full two-call post-commit chain is incomplete. | zielony | nie | nie | P1 |

## P. GDPR (`app/(admin)/gdpr/_actions/redact-user.ts`, mig115)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `NSA-154` | **Erasure counts — brak podwójnego liczenia fa alias** — NPD handler wyklucza alias `fa`. *Kroki:* 1) redactUser produktu z fa. 2) Sprawdź counts. | kat:7583 · alias `fa` wykluczony z sumy (`packages/db/src/erasure/npd.ts:35, 59-61`). | FA alias exclusion is source-tested, not verified against real erasure counts. | brak testu | nie | nie | P2 |

## Q. Reference data (UoM, kategorie)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `NSA-155` | **createUnit — walidacje** — category/code/name/factorToBase. *Kroki:* 1) category spoza {mass,volume,count,length}. 2) code z niedozwolonym znakiem. 3) factorToBase ≤ 0. | kat:7593 · walidacja Zod; "factorToBase must be greater than zero" (`units-validation.ts:13-27`); perm `settings.units.manage`. | Positive-factor and permission guards are green; full field matrix is partial. | zielony | nie | tak | P1 |
| `NSA-156` | **createUnit — uniqueness / FK / check** — mapowanie błędów DB. *Kroki:* 1) Duplikat code. | kat:7599 · 23505→already_exists, 23503→invalid_reference, 23514→invalid factor (`manage-units.ts:308-312`). | Database error mapping needs real unique/FK/check violations. | brak testu | nie | nie | P1 |
| `NSA-158` | **softDeleteUnit — nie usuwa base unit** — base unit chroniony. *Kroki:* 1) softDelete base unit. | kat:7611 · blok (`manage-units.ts:447`). | Base-unit protection is source-covered without exact focused assertion. | brak (tylko źródło) | nie | nie | P1 |
| `NSA-159` | **softDeleteUnit — in-use check (~16 tabel)** — nie można usunąć używanej jednostki. *Kroki:* 1) Jednostka referowana w bom_lines/items/... . 2) softDelete. | kat:7617 · `isUnitCodeInUse` → `in_use` (`manage-units.ts:169-256`). | In-use checks are green for BOM/PO and generic paths, not all catalogued tables. | brak testu | TAK | nie | P1 |
| `NSA-160` | **createCustomConversion — walidacja** — label/from/to/factor. *Kroki:* 1) factor ≤ 0. | kat:7623 · positive finite (`units-validation.ts:45-50`). | Positive-factor validation is source-covered; no dedicated conversion run. | brak (tylko źródło) | nie | nie | P2 |
| `NSA-162` | **Product category — code immutable, soft-deactivate** — kod niezmienny po utworzeniu; brak twardego delete. *Kroki:* 1) Edytuj kategorię. 2) Deaktywuj. | kat:7635 · update edytuje tylko label/order/active; deaktywacja zamiast delete (`page.tsx:125, 156-164`). | Code immutability/soft deactivation are source/UI-covered, not action-complete. | brak testu | nie | nie | P2 |

## R. Schema wizard (`app/(admin)/schema/wizard`, `SchemaColumnWizard.tsx`)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `NSA-164` | **Wizard wymaga deptId** — bez ?deptId placeholder. *Kroki:* 1) Wejście bez deptId. | kat:7651 · "Select a department" (`wizard/page.tsx:22-33`). | Wizard component is green; missing-`deptId` page placeholder was not directly run. | zielony | TAK | nie | P2 |

## S. Security settings (`app/[locale]/(app)/(admin)/settings/security`)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `NSA-168` | **RBAC widoku security** — dostęp read-only bez uprawnienia. *Kroki:* 1) User bez security.view/manage/edit/admin/owner. | kat:7679 · `permission-denied`, canManageSecurity=false (`page.tsx:135-153`, `security-screen.client.tsx:249`). | Security page guard is source-covered; restricted identity unavailable. | brak (tylko źródło) | nie | tak | P1 |
| `NSA-171` | **Session timeout / SCIM / password fields — kosmetyczne (gap)** — te kontrolki disabled, zapis no-op. *Kroki:* 1) Zmień idleTimeout/maxSession. 2) Save. 3) Reload. | kat:7697 · brak backing column; min-length/reuse z constants (nist-password-policy), nie DB (`security-screen.client.tsx:360-394`,… | Production and tests show session/SCIM controls disabled as “Not available yet”; capability is absent. | brak testu | nie | nie | P1 |

## T. Dashboard / Reporting / Multi-site (`app/[locale]/(app)/(modules)/reporting`)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `NSA-178` | **Reporting read-only + org_id belt-and-braces** — brak mutacji, każda relacja z explicit org_id. *Kroki:* 1) Audyt akcji reporting. | kat:7743 · SELECT-only, żadnego outbox, `org_id = app.current_org_id()` na każdej relacji (`report-read-actions.ts:1-21`). | Read-only/org belt-and-braces is source-audited; every relation was not dynamically probed. | brak testu | nie | nie | P1 |
