# Ustawienia — profil organizacji/lokalizacje, użytkownicy i RBAC, master danych infrastruktury, konfiguracja zatwierdzeń + flagi funkcji (przewodnik po module)

> Szczegółowy przewodnik po module. Każde stwierdzenie poniżej jest zakotwiczone w
> rzeczywistym pliku pod `apps/web/…` lub `packages/…`; nic nie jest wymyślone.
> 02-settings jest **panelem sterowania administratora** produktu: zarządza profilem
> organizacji, **masterem fizycznym lokalizacji / linii / maszyn / magazynów /
> miejsc składowania / bram doków**, **użytkownikami i rolami (RBAC)**,
> **politykami zatwierdzeń** (`signoff_policies`) i przełącznikami PIN,
> **numeracją dokumentów** (`org_document_settings`), **flagami funkcji**
> (`feature_flags_core` + `tenant_variations.feature_flags`), danymi referencyjnymi,
> **kreatorami kolumn L3 opartymi na schemacie**, a także powierzchniami integracji
> (D365, e-mail, etykiety, SCIM/SSO/lista dozwolonych IP).
>
> Niemal każdy ekran ustawień znajduje się w **jednej grupie tras**:
> `…/[locale]/(app)/(admin)/settings/…` → `/settings/{company,sites,infra/*,
> machines,shifts,labor-rates,users,roles,security,audit,signoff,scanner-auth,
> devices,documents,flags,features,rules,reference,schema,units,products,boms,
> integrations,…}`. Dwie **akcje zapisu użytkownik/rola** znajdują się POZA tą
> grupą tras w `apps/web/actions/users/*` (zaproszenie / tworzenie-z-hasłem /
> przypisanie-roli / dezaktywacja), a **bramy doków** są widoczne w Ustawienia →
> Infrastruktura → Doki, lecz fizycznie należą do modułu podwórza
> (`(modules)/yard/_actions/yard-actions.ts`, mig 317). Nawigacja spinająca
> wszystko to `apps/web/lib/navigation/settings-nav.ts`.
>
> **Lokalizacja ≡ Magazyn** (decyzja właściciela 2026-06-24): „lokalizacja" (site)
> jest kanoniczną jednostką fizyczną; nie ma duplikatów kolumn magazynowych —
> linie produkcyjne mają już `site_id`. CRUD lokalizacji znajduje się w
> `settings/sites/_actions/sites.ts`. Trasy są zapisane bez prefiksu `[locale]`.
> Ostatni przegląd względem niezatwierdzonego drzewa roboczego (bramy doków E5,
> stawki robocizny E4B, przełącznik PIN scanner-auth, seed macierzy RBAC mig 150).

---

## a. Przegląd

Ustawienia odpowiadają na jedno pytanie: **jak skonfigurowana jest ta organizacja?**
To głównie zbiór **ekranów CRUD o zasięgu organizacji** oraz niewielka liczba
mechanizmów zarządzania (RBAC, zatwierdzenia, audyt). Nie ma tu długiego cyklu
życia dokumentu tak jak w Planowaniu/Produkcji — najbliższym odpowiednikiem
„maszyny stanów" jest **rozwiązywanie uprawnień RBAC** (§c), od którego zależy
każda inna akcja.

Każdy zapis w ustawieniach stosuje **tę samą kanoniczną formę** (wzorzec profilu
firmy, skopiowany dosłownie w `sites.ts` / `machines/_actions` /
`devices/_actions` / `signoff/_actions` / `shifts/_actions` / `documents.ts`):
`'use server'` → parsowanie zod danych wejściowych **wewnątrz** akcji → owinięcie
w `withOrgContext` (jedna transakcja, RLS przez `app.current_org_id()`) → ponowne
sprawdzenie dosłownego **ciągu uprawnień** przez zapytanie `hasPermission` w
dwóch magazynach → org-scoped `INSERT`/`UPDATE`/`UPSERT` → `revalidatePath`.
Brak uprawnienia zwraca typowany `{ ok:false, error:'forbidden' }` (lub rzucony
`forbidden` mapowany na stan strony `permission_denied`), nigdy 500. Uprawnienie
jest sprawdzane ponownie po stronie serwera nawet wtedy, gdy klient już ukrył
przycisk (`can_edit` / `canManage` reguluje tylko renderowanie — patrz
`sites.ts:108-115`, `infra/docks/page.tsx:78-81`).

**Master fizyczny** (sites / production_lines / machines / warehouses /
locations / dock_doors / shifts / labor_rates / scanner_devices) to dane
referencyjne, które czyta reszta zakładu: Produkcja rozwiązuje linie, Planowanie
rozwiązuje maszyny + magazyny, skaner paruje się z `scanner_devices`, a podwórze
rezerwuje `dock_doors`.

**Warstwa RBAC** (`packages/rbac/src/permissions.enum.ts` + tabele
`roles`/`role_permissions`/`user_roles` z `017-rbac.sql`) jest
najbardziej krytyczną częścią modułu: **rodzina ról administratora organizacji**
otrzymuje pełny zestaw uprawnień `settings.*` trwale przez migrację **150**
(autorytatywny seed macierzy RBAC, z wyzwalaczem wstawiania organizacji, dzięki
któremu nowi najemcy dziedziczą go automatycznie).

---

## b. Inwentarz funkcji

> Odczyty/zapisy wymieniają dotykane tabele Postgres. „Gate" to uprawnienie
> sprawdzane po stronie serwera **wewnątrz** akcji przez zapytanie `hasPermission`
> w dwóch magazynach (wiersz `role_permissions` **LUB** starszy cache jsonb
> `roles.permissions` **LUB**, w niektórych bramach, `code`/`slug` roli).
> Akcje zapisu użytkownik/rola znajdują się w `apps/web/actions/users/*`;
> wszystko inne w `settings/<area>/_actions/*`.

### Profil organizacji + numeracja dokumentów — `settings/{company,_actions}`

| Akcja (plik) | Co robi | Odczytuje / zapisuje | Gate |
|---|---|---|---|
| `readCompanyProfile` / `saveCompanyProfile` (`company/_actions/company-profile.ts`) | Odczyt + utrwalenie każdego edytowalnego pola organizacji (nazwa, rejestracja, kontakty, branding) w `public.organizations`. Parsowanie zod, UPDATE w zakresie organizacji. | odczytuje/zapisuje `organizations` | odczyt: RLS; zapis: `settings.org.update` |
| `readOrgDocumentSettings` / `updateOrgDocumentSettings` (`_actions/documents.ts`) | Odczyt / edycja formatu numeracji PO·TO·WO (prefiks / `number_date_part` `none\|YYYY\|YYYYMM\|YYYYMMDD` / `number_seq_padding` 3–8) + `archive_after_days`. **Silnik** numeracji (`nextDocumentNumber`, `lib/documents/numbering.ts`) atomowo zwiększa `next_seq` — znajduje się w ścieżce wywołań Planowania, ale jest **konfigurowany tutaj** (Ustawienia → Dokumenty). | odczytuje/zapisuje `org_document_settings` | odczyt: `settings.org.read`; zapis: `settings.infra.update` |

### Lokalizacje i linie — `settings/sites/_actions/sites.ts`

| Akcja | Co robi | Odczytuje / zapisuje | Gate |
|---|---|---|---|
| `readSitesSettingsData` / `getSites` / `getLinesForSite` | Lista lokalizacji (liczba linii i pracowników, HACCP/godziny pracy z `l3_ext_cols`, współrzędne mapy x/y) + linie produkcyjne wybranej lokalizacji. `can_edit` jest obliczany z tego samego aktywnego sprawdzenia `settings.org.update`, na którym bramkują się zapisy. | odczytuje `sites`, `production_lines`, `shift_patterns`, `locations` | odczyt RLS |
| `createSite(input)` | Wstawia lokalizację (`site_code`, nazwa, strefa czasowa, kraj, podmiot prawny). Czyści istniejące `is_default` jako pierwsze, gdy `is_default=true` (częściowy unikalny `idx_sites_default`). Duplikat `site_code` (`sites_org_code_uq`) → `duplicate_code`. **Brak zdarzenia outbox** (brak dozwolonego `event_type` dla `settings.site.*`). | zapisuje `sites` | `settings.org.update` |
| `updateSiteSettings(orgId,siteId,settings)` | Aktualizuje `is_default` lokalizacji + `l3_ext_cols` (godziny_pracy / haccp_enabled / haccp_valid_until). | zapisuje `sites` | `settings.org.update` |
| `createLine(input)` / `updateLine(input)` | Tworzy/edytuje **linię produkcyjną** w lokalizacji (`code`, `name`, `status` ∈ active/maintenance/inactive). Duplikat kodu w tej samej lokalizacji → `duplicate_code`. Emituje `settings.line.upserted` (dozwolony `event_type` outbox — nie wymyślaj nowych). | odczytuje `sites`, `production_lines`; zapisuje `production_lines`, `outbox_events` | `settings.org.update` |

> Strażnik UUID jest tu celowo **tylko formatowy** (nie ścisły RFC-4122): seed UUIDs
> organizacji to `00000000-…-0000000000xx` (wersja=0), a ścisły regex powodował,
> że lista linii per-lokalizacja zwracała `[]` dla każdego użytkownika
> (`sites.ts:147-153`). Prawdziwym strażnikiem bezpieczeństwa organizacji jest
> `context.orgId !== orgId` + RLS, nie regex.

### Master infrastruktury (maszyny / magazyny / miejsca składowania / drukarki / bramy doków)

| Akcja (plik) | Co robi | Odczytuje / zapisuje | Gate |
|---|---|---|---|
| `listMachines` / `upsertMachine` (`machines/_actions/machine-actions.ts`) | CRUD maszyn (`code`, `name`, `machine_type`, `status` ∈ active/inactive/maintenance/retired, `capacity_per_hour`). `canEdit` udostępniony dla przycisku. Unikalny `(org_id, code)` → `duplicate_code`. | odczytuje/zapisuje `machines` | `settings.flags.edit` (gate akceptuje też kod roli `owner`/`admin`) |
| `listDockDoors` / `upsertDockDoor` (`(modules)/yard/_actions/yard-actions.ts`, widoczne pod `/settings/infra/docks`) | Master bram doków (`code`, `name`, `direction` ∈ inbound/outbound/both, `site_id`, `warehouse_id`). Akcja **rzuca `forbidden`** (mapowany na stan strony `permission-denied`) zamiast zwracać typowany błąd. mig 317. | odczytuje/zapisuje `dock_doors`; odczytuje `sites`, `warehouses` | `yard.manage` |
| Magazyny / miejsca składowania / drukarki (`infra/warehouses`, `infra/locations/_actions`, `infra/printers/_actions`) | Master magazynów + miejsc składowania + rejestr drukarek etykiet (E1, mig 304). Import miejsc przez `import-location-csv.ts`. | odczytuje/zapisuje `warehouses`, `locations`, `printers` | `settings.infra.update` / `settings.org.update` |

### Siła robocza — zmiany i stawki robocizny

| Akcja (plik) | Co robi | Odczytuje / zapisuje | Gate |
|---|---|---|---|
| `readShiftsSettingsData` + `createShiftPattern` / `updateShiftPattern` / `deleteShiftPattern` (`shifts/_actions/shifts.ts`) | Konfiguracja wzorca zmian + kalendarza per lokalizacja/linia (źródło liczby pracowników, na które joinuje lista lokalizacji). | odczytuje/zapisuje `shift_patterns` | `settings.org.update` |
| `upsertLaborRate` / `listLaborRates` (`production/_actions/labor-actions.ts`, widoczne pod `/settings/labor-rates`) | E4B — karty stawek godzinowych według roli/grupy, zasilające koszt robocizny zlecenia produkcyjnego (WO). | odczytuje/zapisuje `labor_rates` | zapis `settings.org.update`; odczyt `settings.org.read` |

### Użytkownicy i role (RBAC) — `apps/web/actions/users/*` + `settings/roles/_actions`

| Akcja (plik) | Co robi | Odczytuje / zapisuje | Gate |
|---|---|---|---|
| `inviteUser` (`actions/users/invite.ts`) | Generuje magiczny link zaproszenia Supabase + tworzy **nieaktywny** wiersz `public.users` z `invite_token`/datą wygaśnięcia. Wstępne sprawdzenie limitu miejsc (`organizations.seat_limit`). | odczytuje `organizations`, `users`; zapisuje `users` | `settings.users.invite` |
| `createUserWithPassword` (`actions/users/create-user-with-password.ts`) | Administrator „tworzy użytkownika bezpośrednio z hasłem, bez e-maila". Używa **klienta Supabase z rolą serwisową** (`auth.admin.createUser`, `email_confirm:true`) tylko po stronie serwera; tworzy **aktywny** wiersz `users` + złączenie `user_roles`; w razie niepowodzenia prowizji DB usuwa po najlepszych staraniach osierocony użytkownik auth. Odmawia przypisania uprzywilejowanej roli **systemowej** jako domyślnej (`forbidden_role`). | odczytuje/zapisuje `users`, `user_roles`; zapisuje `audit_log`, `outbox_events` | `settings.users.invite` |
| `assignRole(input)` (`actions/users/assign-role.ts`) | Zastępuje rolę użytkownika (ustawia `users.role_id` + przepisuje złączenie `user_roles` w jednym CTE). **Strażnik ostatniego właściciela**: odmawia degradacji jedynego `owner` organizacji (blokuje wiersze właściciela, `last_owner_violation` → `forbidden`). | odczytuje/zapisuje `users`, `user_roles`, `roles`; zapisuje `audit_log`, `outbox_events` | `settings.roles.assign` |
| `deactivateUser(input)` (`actions/users/deactivate.ts`) | Miękka dezaktywacja użytkownika (`is_active=false`). Bramkuje na uprawnieniu **nazwy-roli** `org.access.admin` (`deactivate.ts:67`), **nie** na `settings.users.deactivate` z enuma — patrz luki. | zapisuje `users`, `audit_log`, `outbox_events` | `org.access.admin` |
| `createRole(input)` (`roles/_actions/role-admin-actions.ts`) | Tworzy **niestandardową** rolę (kod w formacie slug, pusty zestaw uprawnień). **Role systemowe zablokowane** (`owner`/`admin`/`org.access.admin`/`org.platform.admin`/`org.schema.admin` → `system_role_locked`). | zapisuje `roles`, `audit_events` | `settings.roles.assign` |
| `listRolePermissions(roleId)` / `setRolePermissions({roleId,permissions})` (`roles/_actions/role-admin-actions.ts`) | Odczyt/zapis **macierzy ról**. Waliduje KAŻDY ciąg względem kanonicznego katalogu `ALL_PERMISSIONS` (jeden nieznany ciąg unieważnia cały zapis — fail-closed). **Zapis w obu magazynach W JEDNEJ transakcji**: przebudowuje wiersze `role_permissions` **i** cache jsonb `roles.permissions` do dokładnie tego samego zestawu (żadna ścieżka odczytu nie zostaje przestarzała). Role systemowe nie mogą być edytowane. | odczytuje/zapisuje `role_permissions`, `roles`; zapisuje `audit_events` | `settings.roles.assign` |

### Polityki zatwierdzeń + przełączniki PIN + progi nadkonsumpcji — `settings/{signoff,scanner-auth}/_actions`

| Akcja (plik) | Co robi | Odczytuje / zapisuje | Gate |
|---|---|---|---|
| `listSignoffPolicies` / `upsertSignoffPolicy(input)` (`signoff/_actions/signoff-actions.ts`) | **Konfiguracja podwójnego podpisu**: per `signoff_type` ustawia `required_signatures` (1–2), `first_signer_role_id`, `second_signer_role_id`, `allow_same_user`, `is_active`. Identyfikatory ról sygnatariuszy są walidowane w zakresie organizacji przed upsert (F3). Unikalny `(org_id, signoff_type)`. Te wiersze są odczytywane przez `signChangeover` (08-production B-2) i inne przepływy podwójnego podpisu CFR-21. | odczytuje/zapisuje `signoff_policies`; odczytuje `roles`; zapisuje `audit_log` | odczyt `org.access.admin`; zapis `settings.flags.edit` |
| `setOverconsumeThresholds({warnPct,approvePct})` (`signoff/_actions/signoff-actions.ts`) | Zapisuje OBA progi do `tenant_variations.feature_flags->overconsume_warn_pct` (poziom ostrzeżenia) i `->overconsume_threshold_pct` (poziom zatwierdzenia przez PIN przełożonego). Niezmiennik serwera: `warnPct ≤ approvePct` (`warn_above_approve`). Bramy konsumpcji Produkcji je odczytują (brak = 0). | odczytuje/zapisuje `tenant_variations`; zapisuje `audit_log` | `settings.flags.edit` |
| `getScannerAuthPolicy` / `setScannerReverseAuthPolicy({requireSupervisorPin})` (`scanner-auth/_actions/scanner-auth-actions.ts`) | Przełącznik **`scanner_reverse_require_supervisor_pin`**. Przechowywany jako tekst `'true'`/`'false'` w `tenant_variations.feature_flags` pod tym kluczem (**brak = domyślnie WŁĄCZONY**). WŁĄCZONY = skanerowe cofnięcie konsumpcji wymaga e-maila + PIN przełożonego (posiadacza `production.consumption.override_approve`); WYŁĄCZONY = tylko PIN operatora. Odczytywany przez `api/production/scanner/wos/[id]/reverse-consume/route.ts`. Brak nowej tabeli/migracji. | odczytuje/zapisuje `tenant_variations`; zapisuje `audit_log` | odczyt `org.access.admin`; zapis `settings.flags.edit` |

### Flagi funkcji + dane referencyjne + jednostki miary + integracje (reprezentatywne)

| Akcja / strona (plik) | Co robi | Odczytuje / zapisuje | Gate |
|---|---|---|---|
| Administrator flag (`flags/page.tsx`) | Wyświetla i przełącza flagi funkcji organizacji z `feature_flags_core` (`flag_code`, `is_enabled`, `rolled_out_pct`, `tier`) + wstępne sprawdzenie polityki autoryzacji NPD. | odczytuje/zapisuje `feature_flags_core`, `org_authorization_policies` | `org.access.admin` (gate nazwa-roli-jako-uprawnienie) |
| `createUnit` / `createConversion` / `softDeleteUnit` (`units/_actions/manage-units.ts`) | Master jednostek miary (`unit_of_measure`: kategoria/kod/przelicznik_do_podstawowej/is_base) + przeliczniki; źródło dropdownów UoM w pozycjach PO/TO/WO. | odczytuje/zapisuje `unit_of_measure`; zapisuje `audit_log`, `outbox_events` | `settings.units.manage` (gate akceptuje też `owner`/`admin`/`module_admin`) |
| `commitImportAction` / `previewImportAction` (`reference/[code]/import/_actions`) | Import CSV danych referencyjnych (podgląd → zatwierdzenie). | odczytuje/zapisuje `reference_data` | `settings.reference.import` |
| `createReasonCode` / `updateReasonCode` / `deleteReasonCode` (`ship-override-reasons/_actions/shipping-overrides.ts`) | Master kodów przyczyn odchyleń wysyłki (mig 240). | odczytuje/zapisuje tabele odchyleń wysyłki; zapisuje `audit` | `settings.org.update` |
| `setRequireGrnQcInspection` (`quality/_actions/setRequireGrnQcInspection.ts`) | Przełącza flagę organizacji „wymagaj inspekcji QC GRN" (ten sam wzorzec jsonb-feature-flag). | zapisuje `tenant_variations` | `settings.flags.edit` |
| Hub importu/eksportu danych master (`import-export/_actions/master-data.ts`, `load-master-data-hub.ts`) | Centralna powierzchnia importu/eksportu dla encji master. | odczytuje tabele master; zapisuje `import_export_jobs` | bramy administratora ustawień |
| Integracja D365 (`integrations/d365/{cost-import,dlq,drift}/_actions/*`) | Połączenie/stan D365, ponowne próby DLQ, dryft, import kosztów (wyłącznie eksport per R15). | tabele D365 + DLQ | `settings.d365.*` |

**Zinwentaryzowana powierzchnia akcji: ponad ~40 akcji zapisu w ~25 podobszarach.**
Rdzeń zarządzania to `setRolePermissions` (macierz RBAC), trio prowizji
użytkowników `users/*` (`inviteUser` / `createUserWithPassword` / `assignRole` ze
strażnikiem ostatniego właściciela), `upsertSignoffPolicy` oraz dwa zapisy
`tenant_variations.feature_flags` (`setOverconsumeThresholds`,
`setScannerReverseAuthPolicy`). Rdzeń CRUD mastera to lokalizacje/linie + maszyny
+ bramy doków + magazyny/miejsca składowania + jednostki miary.

---

## c. RBAC i model uprawnień („maszyna stanów" Ustawień)

Ustawienia nie mają cyklu życia dokumentu; ich krytycznym mechanizmem jest
**sposób, w jaki ciąg uprawnień rozwiązuje się do nadania**. Błąd w tym miejscu
powoduje, że administrator trafia na 403 na każdej stronie (nawracający błąd
produkcyjny #1, `MON-project-overview`).

### Tabele (`packages/db/migrations/017-rbac.sql` + `080-role-permissions.sql`)

```
 public.roles            (id, org_id, code, slug, name, permissions jsonb, is_system, display_order)
 public.role_permissions (role_id, permission)          ← znormalizowane wiersze nadań
 public.user_roles       (user_id, role_id, org_id)      ← złączenie
 public.users            (id, org_id, role_id, …)        ← zawiera też pojedynczy role_id
```

### Rozwiązywanie nadań (każda brama wykonuje dokładnie ten dwumagazynowy odczyt)

Użytkownik **posiada uprawnienie**, jeśli dla dowolnej roli w jego `user_roles`:

1. wiersz `role_permissions` pasuje do ciągu, **LUB**
2. starszy cache jsonb `roles.permissions` zawiera ciąg
   (`coalesce(r.permissions,'[]') ? $perm`), **LUB**
3. (w niektórych bramach) `code`/`slug` roli jest równy ciągowi — używane przez
   bramy **nazwa-roli-jako-uprawnienie** `org.access.admin` / `org.schema.admin`
   (flagi / podgląd-schematu / promocje / bezpieczeństwo) oraz przez bramy
   `machines` / `signoff`, które dodatkowo akceptują `r.code in ('owner','admin')`.

**Nie ma obejścia superużytkownika** ani **normalizacji aliasów** na poziomie bramy —
zasiana wartość musi być identyczna bajtowo ze sprawdzanym ciągiem. Edytor ról
(`setRolePermissions`) zapisuje zatem **oba** magazyny w jednej transakcji, aby
usunięte uprawnienie nie mogło się już rozwiązać przez przestarzały cache jsonb
(`role-admin-actions.ts:213-238`).

### Seed rodziny ról administratora (migracja 150 — autorytatywna macierz)

```
 organizations INSERT
   └─ trg_zzz_seed_settings_rbac_matrix (AFTER INSERT, security definer)
        └─ seed_settings_rbac_matrix_for_org(org_id)
             ├─ grant_matrix (≈40 ciągów settings.*) → role_permissions
             │     rodzina 'admin'  → roles code IN (owner,admin,org_admin)
             │                       LUB slug IN (owner,admin,org_admin,
             │                          org.access.admin, org.platform.admin,
             │                          org.schema.admin)
             │     rodzina 'auditor'→ tylko odczyt (audit.read, users.view, rules.view)
             └─ przebudowuje roles.permissions jsonb = dedup-union(existing + rp rows)
        + jednorazowa pętla backfill dla każdej istniejącej organizacji
```

Migracja 150 powstała dlatego, że wcześniejsze migracje (037/049/050/064/116/146/148)
zasiały tylko podzbiór ciągów faktycznie sprawdzanych przez strony, przez co
administrator organizacji trafiał na 403 na ~24–30 stronach ustawień na świeżo
migrowanej bazie; produkcyjna baza „działała" jedynie dlatego, że rola admina była
**ręcznie zasilona** podczas Gate-5 ciągami nieobecnymi w żadnej migracji. Macierz
czyni pełny zestaw **trwałym i odtwarzalnym** (naprawia też błąd kolejności
`settings.units.manage` z mig-064 — 064 działała przed stworzeniem `admin` przez
080 i nie zainstalowała wyzwalacza, zasiając 0 wierszy). Wdrożony admin jest na
**`org.access.admin`**, NIE `admin`.

### Blokada ról systemowych

Pięć kodów jest **zablokowanych** wszędzie (`role-admin-actions.ts:35-41`,
`create-user-with-password.ts:37-43`): `owner`, `admin`, `org.access.admin`,
`org.platform.admin`, `org.schema.admin`. Nie mogą być tworzone jako role
niestandardowe, ich nadania uprawnień nie mogą być edytowane i nie mogą być
domyślną rolą samoobsługową dla nowego użytkownika (`forbidden_role`). DB-seedowane
`roles.is_system = true` jest też honorowane. **Ostatni `owner`** nie może być
zdegradowany (`assignRole` blokuje wiersze + `last_owner_violation`).

<!-- screenshot: settings/roles matrix (lista ról + siatka checkboxów uprawnień) -->
<!-- screenshot: settings/sites (lista lokalizacji + panel linii + przełączniki HACCP) -->

---

## d. Instrukcje dla użytkownika

> Każdy ekran jest dostępny z podmenu **Ustawienia**
> (`apps/web/lib/navigation/settings-nav.ts` — grupy Organizacja / Dane /
> Dostęp / Zatwierdzenia / Operacje / Integracje / Szablony dokumentów /
> Wdrożenie / Admin / Moje konto). Pozycje nawigacji są obecnie **niezabramkowane**
> (`permission_key: null`, `RBAC_TODO`) — same ekrany wymuszają kontrolę dostępu.

### (i) Dodawanie lokalizacji i linii produkcyjnej

1. **Ustawienia → Organizacja → Lokalizacje i linie** (`/settings/sites`).
2. Utwórz lokalizację (kod, nazwa, strefa czasowa, kraj); zaznacz **Główna**, aby
   uczynić ją domyślną dla organizacji (poprzednia domyślna jest najpierw
   czyszczona). → `createSite`.
3. Po wybraniu lokalizacji dodaj **linię produkcyjną** (kod, nazwa, status).
   Duplikat kodu linii w tej samej lokalizacji jest odrzucany → `createLine`.
   Linie noszą `site_id` (brak odrębnej kolumny magazynowej — lokalizacja ≡
   magazyn).
4. Przełącz **HACCP** / godziny pracy per lokalizacja (przechowywane w
   `l3_ext_cols`) → `updateSiteSettings`.

### (ii) Rejestracja maszyny / bramy doku / magazynu

- **Maszyny** (`/settings/machines`): dodaj kod / nazwę / typ / status /
  wydajność-na-godzinę → `upsertMachine`. (Starszy `/settings/infra/machines`
  jest celowo zastąpiony przez ten ekran.)
- **Bramy doków** (`/settings/infra/docks`): dodaj kod / nazwę / kierunek
  (inbound/outbound/both) / lokalizację / magazyn → `upsertDockDoor`.
  Użytkownik bez uprawnień widzi **komunikat o odmowie dostępu** (akcja rzuca
  `forbidden`).
- **Magazyny / Miejsca składowania / Drukarki** znajdują się w tej samej grupie
  nawigacji Organizacja.

### (iii) Zaproszenie lub tworzenie użytkownika, a następnie przypisanie roli

1. **Ustawienia → Dostęp → Użytkownicy i role** (`/settings/users`).
2. **Zaproś** wysyła magiczny link e-mail i tworzy nieaktywnego użytkownika
   (`inviteUser`); **Utwórz z hasłem** tworzy aktywnego użytkownika bez e-maila
   (`createUserWithPassword`). Oba wstępnie sprawdzają **limit miejsc**.
3. **Przypisz rolę** zmienia rolę użytkownika (`assignRole`). **Nie możesz**
   zdegradować jedynego właściciela organizacji ani samoobsługowo przypisać
   zablokowanej roli systemowej.

### (iv) Tworzenie niestandardowej roli i nadawanie uprawnień

1. **Ustawienia → Dostęp → Użytkownicy i role → Role** (`/settings/roles`).
2. **Utwórz rolę** (kod w formacie slug, np. `npd_manager`) → `createRole`
   (startuje bez uprawnień). Role systemowe nie mogą być tworzone.
3. Zaznacz uprawnienia w **macierzy** i zapisz → `setRolePermissions`. Każdy
   ciąg jest walidowany względem kanonicznego katalogu; jeden nieznany ciąg
   unieważnia cały zapis. Oba magazyny nadań są atomowo przepisywane.

### (v) Konfigurowanie polityk zatwierdzeń + PIN skanera

1. **Ustawienia → Zatwierdzenia → Polityki zatwierdzeń** (`/settings/signoff`):
   per `signoff_type` ustaw wymaganą liczbę podpisów (1–2), **role** pierwszego/
   drugiego sygnatariusza oraz allow-same-user → `upsertSignoffPolicy`. To jest
   odczytywane przez podwójny podpis alergenów B-2 (przezbrojenia Produkcji).
2. Ustaw dwupoziomowe progi **nadkonsumpcji** (ostrzeżenie % ≤ zatwierdzenie %)
   → `setOverconsumeThresholds`.
3. **Ustawienia → Zatwierdzenia → Zatwierdzenia i PINy** (`/settings/scanner-auth`):
   przełącz **„PIN przełożonego wymagany do cofnięcia konsumpcji przez skaner"**
   → `setScannerReverseAuthPolicy` (domyślnie WŁĄCZONY, gdy flaga jest nieobecna).

### (vi) Konfigurowanie numeracji dokumentów

1. **Ustawienia → Szablony dokumentów → Numeracja dokumentów**
   (`/settings/documents`).
2. Dla każdego z **PO / TO / WO** ustaw prefiks, część datową (`none`/`YYYY`/
   `YYYYMM`/`YYYYMMDD`), dopełnienie sekwencji (3–8) oraz **archiwizuj po N
   dniach** → `updateOrgDocumentSettings` (bramkowane `settings.infra.update`).
   Następny tworzony dokument pobiera swój numer z `nextDocumentNumber` (ścieżka
   wywołań Planowania), która atomowo zwiększa `org_document_settings.next_seq`.
   (Patrz `04-planning.md` §(viii) po opis silnika.)

### (vii) Przełączanie flagi funkcji / zarządzanie jednostkami miary / danymi referencyjnymi

- **Flagi funkcji** (`/settings/flags`): przełącz wiersze `feature_flags_core`
  (bramkowane uprawnieniem nazwy roli `org.access.admin`).
- **Jednostki miary i przeliczniki** (`/settings/units`): dodawaj jednostki miary +
  przeliczniki (`createUnit` / `createConversion`); zasilają one dropdowny UoM
  w pozycjach PO/TO/WO (nigdy nie są hardcodowaną listą).
- **Dane referencyjne** (`/settings/reference/[code]`): edycja + import CSV tabel
  słownikowych (`commitImportAction`).

### (viii) Pola NPD (schemat działów)

Przejdź do **Ustawienia → Schemat → Pola NPD** (`/settings/npd-fields`), aby zarządzać polami schematu NPD dla każdego działu (Core / Planning / Commercial / Production / Technical / MRP / Procurement).

![Ekran Pola NPD — wybór działu (dropdown), tabela schematu pól (kolumny: Pole, Typ danych, Wymagane, Widoczne, Kolejność)](screenshots/settings-npd-fields.png)

Dla każdego wybranego działu widzisz tabelę definicji pól, gdzie możesz edytować typ danych, flagę wymagalności, widoczność i kolejność wyświetlania.

---

## e. Źródła danych (tabele Supabase)

RBAC / użytkownicy (odczyt/zapis):

- `roles` — master ról (`code`, `slug`, cache jsonb `permissions`, `is_system`, `display_order`); zasilany per-organizacja (017/080) + pełna macierz ustawień (150).
- `role_permissions` — znormalizowane wiersze nadań `(role_id, permission)` (cel seeda macierzy + edytora ról).
- `user_roles` — złączenie użytkownik↔rola (w zakresie organizacji; strażnik ostatniego właściciela blokuje wiersze właściciela).
- `users` — użytkownicy organizacji (`role_id`, `is_active`, `invite_token`, licznik `seat`).
- `organizations` — profil organizacji + `seat_limit` (cel profilu firmy).

Master fizyczny (odczyt/zapis):

- `sites` — master lokalizacji (`site_code`, `is_default`, `address` jsonb, `l3_ext_cols` godziny-pracy/HACCP/mapa; unikalny `sites_org_code_uq`, częściowy unikalny `idx_sites_default`).
- `production_lines` — linie (noszą `site_id`; emitują `settings.line.upserted`).
- `machines` — master maszyn (`machine_type`, `status`, `capacity_per_hour`; unikalny `(org_id, code)`).
- `dock_doors` — master bram doków (`direction` inbound/outbound/both, `site_id`, `warehouse_id`; mig 317; unikalny `(org_id, code)`).
- `warehouses`, `locations`, `printers`, `shift_patterns`, `labor_rates`, `scanner_devices`, `scanner_device_defaults` — master infrastruktury/siły roboczej/skanera.
- `unit_of_measure` — jednostki miary + przeliczniki (jedyne źródło prawdy dla dropdownów).
- `org_document_settings` — format numeracji PO/TO/WO per organizacja + `archive_after_days` + atomowy `next_seq`.

Zarządzanie / polityki:

- `signoff_policies` — konfiguracja podwójnego podpisu (`required_signatures`, rola pierwszego/drugiego sygnatariusza, `allow_same_user`; unikalny `(org_id, signoff_type)`).
- `tenant_variations.feature_flags` (jsonb) — przełączniki polityk organizacji: `scanner_reverse_require_supervisor_pin`, `overconsume_warn_pct`, `overconsume_threshold_pct`, GRN-QC, …
- `feature_flags_core` — nazwane flagi funkcji organizacji (`flag_code`, `is_enabled`, `rolled_out_pct`, `tier`).
- `org_authorization_policies` — autoryzacja przepływów pracy (edycja wydanego produktu NPD itp.).
- `reference_data`, tabele odchyleń wysyłki + konfiguracja D365/e-mail/etykiety.

Audyt / outbox:

- `audit_log` / `audit_events` — każdy zapis w ustawieniach (`settings.{role,role_permissions,signoff_policy,flag,user,line,…}.*`; klasa przechowywania bezpieczeństwa dla zmian RBAC/użytkowników).
- `outbox_events` — tylko **dozwolone** event_types (`settings.line.upserted`, `settings.user.created_with_password`, `settings.role.assigned`, `settings.user.deactivated`); wymyślenie zdarzenia `settings.site.*` naruszałoby `outbox_events_event_type_check`.

---

## f. Znane luki / TODO

Ugruntowane w odczytanym kodzie — zasilają rejestr napraw:

1. **Nawigacja ustawień jest całkowicie niezabramkowana.** Każda pozycja
   `settings-nav.ts` jest wysyłana z `permission_key: null` i `RBAC_TODO`
   („UI-128 keeps settings navigation ungated; wire permission_key in the future
   RBAC module", `settings-nav.ts:3,13-14`). Linki renderują się dla wszystkich;
   tylko ekran docelowy wymusza kontrolę (więc użytkownik bez uprawnień klika i
   trafia na stronę odmowy dostępu zamiast nigdy nie widzieć linku).

2. **Dryft ciągu bramy vs `permissions.enum.ts`.** Nagłówek migracji 150
   dokumentuje, że zasilone ciągi to **rzeczywista suma ciągów sprawdzanych przez
   kod**, w tym ciągi dryfujące nieobecne w enumie: `settings.d365.manage` /
   `.rotate_secret` / `.test_connection`, `settings.email_config.edit`,
   `settings.units.manage`, `settings.infra.read|update` (enum ma `view|edit`),
   `settings.schema.read|admin`, `settings.roles.manage`, `settings.users.view`,
   `impersonate.tenant` (enum ma `settings.impersonate.tenant` ORAZ
   `impersonate.org`). Dwa równoległe słowniki (`.view/.read`,
   `.edit/.manage/.update`) wymagają scalenia do jednego i ponownego kanonicznego
   zasilania.

3. **Ciągi uprawnień sprawdzane, ale nie w enumie.** `machines/_actions` oraz
   zapisy signoff/scanner-auth bramkują na `settings.flags.edit` dla edycji
   **maszyn** i **zatwierdzeń** (ciąg flags zastępujący zapis infra/sign-off),
   a kilka bram dodatkowo akceptuje **kod** roli `owner`/`admin` bezpośrednio
   (`machine-actions.ts:74`, `signoff-actions.ts:127`,
   `manage-units.ts:92`) — skrót kod-jako-uprawnienie omijający znormalizowany
   katalog. Podobnie `deactivateUser` bramkuje na nazwie roli `org.access.admin`,
   podczas gdy enum deklaruje `settings.users.deactivate` (`deactivate.ts:67`).
   Dodaj dedykowane ciągi `settings.machines.*` / `settings.signoff.*` i dostosuj
   bramę dezaktywacji użytkownika do jej elementu enum.

4. **Uprawnienie bram doków `yard.manage` należy do modułu podwórza.** Ekran
   Ustawienia → Infrastruktura → Doki jest fizycznie wspierany przez
   `(modules)/yard/_actions/yard-actions.ts` i bramkuje na `yard.manage`
   (`yard-actions.ts:90`), nie na ciągu `settings.infra.*` — rozmycie własności
   (ekran ustawień sprawdzający uprawnienie podwórza). Akcja też **rzuca**
   `forbidden` zamiast zwracać typowany `{ok:false}`, który stosuje reszta
   ustawień.

5. **Brak zdarzenia outbox dla tworzenia lokalizacji.** `createSite` celowo nic
   nie emituje ("`outbox_events_event_type_check` has no allowed `settings.site.*`
   event_type", `sites.ts:480-483`); upsert linii emituje. Konsumenci zdarzeń
   „lokalizacja została utworzona" nie mają zdarzenia, na które mogliby się
   zapisać.

6. **Istnieją zduplikowane / legacy drzewa tras ustawień.** Oprócz kanonicznego
   `[locale]/(app)/(admin)/settings/**` repozytorium nadal zawiera
   `app/(admin)/settings/**` i `app/(settings)/**` (np. `reference`,
   `roles`, `schema`, `users`), które nie są pod zlokalizowanym AppShell —
   przestarzałe drzewa, które powinny zostać skonsolidowane lub usunięte, aby
   uniknąć mylenia tras.

7. **`worker_count` na liście lokalizacji pochodzi ze wzorców zmian, nie z
   rzeczywistej liczby pracowników.** Liczba pracowników dla lokalizacji/linii
   pochodzi z `count(distinct shift_id)` po aktywnych `shift_patterns`
   (`sites.ts:306-320`), tj. liczby obsadzonych zmian, a nie przypisanych
   operatorów — proxy modelowania oznaczone flagą, aby liczba nie była odczytywana
   jako prawdziwy stan zatrudnienia.

8. **Konsument outbox `apps/worker` nie działa.** Zdarzenia ustawień
   (`settings.role.assigned`, `settings.user.created_with_password`,
   `settings.user.deactivated`, `settings.line.upserted`) są utrwalane w
   `outbox_events`, ale nie ma jeszcze aktywnego dispatchera
   (per `MON-project-overview`).

Poza notatką nawigacyjną `RBAC_TODO` i notatką o konwergencji enum-vs-brama
przeniesioną w migracji 150 nie znaleziono surowych znaczników `// TODO` w
głównych akcjach ustawień; lista luk pochodzi w inny sposób z dryfu
uprawnienie-vs-enum i rozmyć własności zaobserwowanych bezpośrednio w kodzie.
