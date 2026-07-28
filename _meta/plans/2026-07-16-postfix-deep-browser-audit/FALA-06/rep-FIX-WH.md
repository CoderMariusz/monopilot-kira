# FALA 6 / FIX-WH — magazyn + powłoka po cross-review

Branch `main`. Testy **napisane, nie uruchamiane** (bramkę odpala orchestrator).

---

## [W-1 · P1] REGRESJA — nowy magazyn traci adres przy pierwszej edycji

### Przyczyna

1. `createWarehouse` (`actions/infra/warehouse.ts:129-139`) zwraca `data.address` (etykieta z `address_label` / `input.address`), **bez** `addressLine1`.
2. Klient po utworzeniu (`warehouse-list-screen.client.tsx:417`) budował wiersz jako `{ ...result.data, site: … }` — **bez** `addressLine1`.
3. Dialog edycji (`warehouse-list-screen.client.tsx:767`) wypełnia pole adresem z `warehouse.addressLine1 ?? ''` → **pusty string**.
4. Zapis (`warehouse-list-screen.client.tsx:503`) wysyła `address: editAddress.trim() || null` → **`null`** → `updateWarehouseDetails` usuwa klucz `line1` z jsonb.

Scenariusz: utworzenie z adresem → bez odświeżenia „Edit warehouse" → zmiana samej nazwy → adres skasowany z bazy.

### Naprawa

W `submitCreateWarehouse` po udanym `createWarehouse` ustawiam:

```ts
addressLine1: input.address,
```

źródło: **adres wysłany przy tworzeniu** (`input.address` po trim/null w formularzu), nie `result.data.address` — to ta sama wartość co `line1` zapisane w bazie, a klient ma ją od razu bez czekania na reload listy.

Mechaniki `jsonb_set` w `updateWarehouseDetails` **nie ruszałem** (punktowy zapis `line1` zachowuje `deactivated_at`, `capacity`, `city` itd.).

### Test

`settings/infra/warehouses/page.test.tsx` — `keeps the address after create when only the name is edited before refresh`:
create z adresem → edit (bez refresh) → prefilled `Dock 5` → rename → `updateWarehouse` dostaje `address: 'Dock 5'`, nie `null`.

---

## [W-2 · P2] Tryb „act as" ignorował zapisany display name

### Przyczyna

Po R01-07 menu użytkownika korzysta z `resolveShellUser(user, identityRow)` (`layout.tsx:170`), ale baner act-as nadal renderował **surowy email** (`layout.tsx:205` → `ActAsBanner` `actorEmail={shellUser.email}`), omijając precedencję `display_name → name → metadata → email`.

### Naprawa

- `ActAsBanner`: prop `actorLabel` (rozwiązana tożsamość) + opcjonalny `actorEmail` (tylko `title` na hover dla audytu).
- `layout.tsx`: `actorLabel={shellUser.name}`, `actorEmail={shellUser.email}`.
- Oznaczenie trybu act-as **bez zmian**: `PLATFORM ADMIN` · `acting as` · nazwa org · kod org · exit.

### Testy

- `lib/shell/shell-identity.test.ts` — `exposes the same resolved label for act-as chrome as for the user menu`
- `components/shell/__tests__/platform-switcher.test.tsx` — baner pokazuje `Ola K.`, nie email w treści

---

## [W-3 · P2] Pełny inwentarz czytelników `public.users.name` vs `display_name`

**Rekomendacja kanoniczna:** jedno wyrażenie odczytu wszędzie:

`coalesce(nullif(trim(display_name), ''), nullif(trim(name), ''), email::text)`

- **`name`** = tożsamość prawna/systemowa (`NOT NULL`, backfill, invite/create).
- **`display_name`** = opcjonalna nadpiska użytkownika (nullable).
- **Precedencja odczytu:** `display_name` wygrywa nad `name` (jak `/account/profile` i powłoka po R01-07).
- **Helper docelowy:** jedna stała SQL (wzór: `INVITATION_AUDIT_JOIN` z toru T4), nie 50 ręcznych wariantów.

### Zapisujący (źródło rozjazdu)

| Plik:linia | `name` | `display_name` |
|---|---|---|
| `account/profile/profile-data.ts:267-273` | ✅ zapis | ✅ zapis (`displayName \|\| fullName`) |
| `actions/users/invite.ts:249-253` | ✅ | ❌ |
| `actions/users/create-user-with-password.ts:252-256` | ✅ | ❌ (+ kopiuje do `user_metadata.name`) |
| `app/api/scim/v2/Users/route.ts:145-148` | ❌ | ✅ (INSERT) |
| `app/api/scim/v2/Users/[id]/route.ts:175,195-198` | ❌ | ✅ (PATCH) |
| `migrations/115-npd-gdpr-erasure.sql:58` | sentinel `'[anonymised]'` | NULL |

### Czytelnicy — pełna tabela (`apps/web` + `packages/queries`)

| Plik:linia | Kolumna / wzorzec |
|---|---|
| `actions/d365/sync-config.ts:210` | `display_name` (coalesce z emailem) |
| `actions/users/invitations-lifecycle.ts:68` | `name` (`inviter.name`) |
| `app/(npd)/fa/[productCode]/_lib/allergen-cascade.tsx:161` | mixed: `coalesce(display_name, name, …)` |
| `app/(npd)/pipeline/_actions/get-project.ts:227` | mixed: `coalesce(display_name, name, …)` |
| `app/(npd)/pipeline/_actions/get-project.ts:264` | mixed: `coalesce(display_name, name)` |
| `app/[locale]/(app)/(admin)/account/profile/profile-data.ts:131` | **oba** (SELECT) |
| `app/[locale]/(app)/(admin)/account/profile/profile-data.ts:160` | mixed: `display_name ?? fullName(name)` |
| `app/[locale]/(app)/(admin)/settings/audit/audit-log-loader.ts:186` | `name` |
| `app/[locale]/(app)/(admin)/settings/audit/audit-log-loader.ts:193` | `name` |
| `app/[locale]/(app)/(admin)/settings/audit/audit-log-loader.ts:202` | `name` |
| `app/[locale]/(app)/(admin)/settings/audit/audit-log-loader.ts:209` | `name` |
| `app/[locale]/(app)/(admin)/settings/audit/audit-log-loader.ts:223` | `name` |
| `app/[locale]/(app)/(admin)/settings/audit/audit-log-loader.ts:242` | `name` |
| `app/[locale]/(app)/(admin)/settings/manufacturing-ops/[operation_id]/history/page.tsx:231` | `display_name` |
| `app/[locale]/(app)/(admin)/settings/promotions/page.tsx:207` | `name` |
| `app/[locale]/(app)/(admin)/settings/reference/[code]/[row_key]/history/page.tsx:196` | `name` |
| `app/[locale]/(app)/(admin)/settings/roles/page.tsx:185` | `name` |
| `app/[locale]/(app)/(admin)/settings/roles/page.tsx:192` | `name` (ORDER BY) |
| `app/[locale]/(app)/(admin)/settings/schema/migrations/page.tsx:173` | `name` |
| `app/[locale]/(app)/(admin)/settings/security/page.tsx:190` | `name` |
| `app/[locale]/(app)/(admin)/settings/tenant/migrations/export/route.ts:104` | `name` |
| `app/[locale]/(app)/(admin)/settings/tenant/migrations/page.tsx:266` | `name` |
| `app/[locale]/(app)/(admin)/settings/users/page.tsx:242` | `name` |
| `app/[locale]/(app)/(admin)/settings/users/page.tsx:256` | `name` (ORDER BY) |
| `app/[locale]/(app)/(modules)/_actions/get-document-audit-timeline.ts:113` | `display_name` |
| `app/[locale]/(app)/(modules)/_actions/get-document-audit-timeline.ts:155` | `display_name` |
| `app/[locale]/(app)/(modules)/_actions/get-document-audit-timeline.ts:201` | `display_name` |
| `app/[locale]/(app)/(modules)/maintenance/_actions/mwo-actions.ts:431` | `name` |
| `app/[locale]/(app)/(modules)/maintenance/_actions/mwo-actions.ts:455` | `name` (ORDER BY) |
| `app/[locale]/(app)/(modules)/maintenance/calibration/_actions/list-calibration.ts:113` | `name` (reviewer) |
| `app/[locale]/(app)/(modules)/maintenance/calibration/_actions/list-calibration.ts:152` | `name` |
| `app/[locale]/(app)/(modules)/maintenance/calibration/_actions/list-calibration.ts:176` | `name` (ORDER BY) |
| `app/[locale]/(app)/(modules)/production/_actions/changeover-actions.ts:147,151,347,351` | `display_name` (signer names) |
| `app/[locale]/(app)/(modules)/production/_actions/labor-actions.ts:245` | mixed: `coalesce(display_name, name, email)` |
| `app/[locale]/(app)/(modules)/production/downtime/_actions/downtime-data.ts:236` | `name` |
| `app/[locale]/(app)/(modules)/production/waste/_actions/waste-data.ts:198` | `name` |
| `app/[locale]/(app)/(modules)/quality/_actions/ccp-deviation-actions.ts:156` | `display_name` |
| `app/[locale]/(app)/(modules)/quality/_actions/ccp-deviation-actions.ts:158` | `display_name` |
| `app/[locale]/(app)/(modules)/quality/_actions/hold-actions.ts:578` | mixed: `coalesce(display_name, name, email)` |
| `app/[locale]/(app)/(modules)/quality/_actions/inspection-actions.ts:461` | `display_name` |
| `app/[locale]/(app)/(modules)/quality/_actions/inspection-actions.ts:468` | `display_name` |
| `app/[locale]/(app)/(modules)/quality/_actions/inspection-actions.ts:473` | `display_name` |
| `app/[locale]/(app)/(modules)/quality/_actions/inspection-actions.ts:591` | `display_name` |
| `app/[locale]/(app)/(modules)/quality/_actions/inspection-actions.ts:779` | `name` |
| `app/[locale]/(app)/(modules)/quality/_actions/inspection-actions.ts:784` | `name` (search) |
| `app/[locale]/(app)/(modules)/quality/_actions/inspection-actions.ts:785` | `name` (ORDER BY) |
| `app/[locale]/(app)/(modules)/quality/_actions/ncr-actions.ts:435` | `display_name` |
| `app/[locale]/(app)/(modules)/quality/_actions/ncr-actions.ts:503` | mixed: `coalesce(display_name, name, email)` |
| `app/[locale]/(app)/(modules)/technical/bom/_actions/detail-page.ts:196` | `display_name` |
| `app/[locale]/(app)/(modules)/technical/bom/_actions/history.ts:102` | `display_name` |
| `app/[locale]/(app)/(modules)/technical/revisions/_actions/list-revisions.ts:78` | mixed: `coalesce(name, display_name)` ⚠️ odwrotna kolejność |
| `app/[locale]/(app)/(modules)/technical/sensory/_actions/list-sensory.ts:128` | `name` |
| `app/[locale]/(app)/(modules)/warehouse/adjustments/_actions/adjust-form-actions.ts:104` | `name` |
| `app/[locale]/(app)/(modules)/warehouse/adjustments/_actions/adjust-form-actions.ts:122` | `name` (search) |
| `app/[locale]/(app)/(modules)/warehouse/adjustments/_actions/adjust-form-actions.ts:123` | `name` (ORDER BY) |
| `app/[locale]/(app)/(npd)/pipeline/[projectId]/approval/page.tsx:684` | mixed: `coalesce(display_name, name)` |
| `app/[locale]/(app)/(npd)/pipeline/[projectId]/pilot/_actions/get-pilot-run.ts:189` | `display_name` |
| `app/[locale]/(app)/(npd)/pipeline/[projectId]/pilot/page.tsx:256` | `display_name` (picker SQL) |
| `app/[locale]/(app)/(npd)/pipeline/[projectId]/trial/_actions/list-trial-batches.ts:100` | `display_name` |
| `app/[locale]/(app)/(npd)/pipeline/[projectId]/trial/page.tsx:320` | `display_name` |
| `app/[locale]/(app)/(npd)/pipeline/[projectId]/trial/page.tsx:324` | `display_name` |
| `app/[locale]/(app)/(npd)/pipeline/[projectId]/trial/page.tsx:339` | `display_name` (picker SQL) |
| `app/[locale]/(app)/(npd)/pipeline/page.tsx:327` | mixed: `coalesce(name, display_name, email)` ⚠️ odwrotna kolejność |
| `app/api/scim/v2/Users/route.ts:73,145` | `display_name` |
| `app/api/scim/v2/Users/[id]/route.ts:79,175,198,211` | `display_name` |
| `lib/scanner/auth.ts:16` | `name` |
| `lib/shell/shell-identity.ts:70` | mixed: `display_name → name → metadata → email` (kanoniczna powłoka) |
| `packages/queries/src/list-approval-history.ts:110` | `display_name` |
| `packages/queries/src/list-fa-history.ts:118` | `display_name` |
| `packages/queries/src/list-fa-history.ts:137` | `display_name` |

**Podsumowanie:** ~28 miejsc czyta wyłącznie `display_name`, ~22 wyłącznie `name`, ~9 mieszanych (w tym 2 z **odwrotną** kolejnością coalesce). Ujednolicenie wymaga helpera SQL + audytu zapisujących (invite/create vs SCIM).

---

## [W-4 · korekta raportu] Twierdzenie o SCIM było nieprawdziwe

### Usunięte z `rep-T5.md`

Twierdzenie: *„SCIM musi zacząć zapisywać `name` — inaczej użytkownik z SCIM ma `name` z NOT-NULL-owego defaultu"*.

**To było fałszywe.** W schemacie **nie ma** defaultu na `public.users.name`. Kolumna jest `NOT NULL` od migracji `037-settings-core.sql` z backfillem, ale INSERT bez `name` **nie dostaje** żadnej wartości domyślnej.

### Fakty (`api/scim/v2/Users/route.ts:145-148`)

```sql
insert into public.users (id, org_id, email, display_name, external_id)
values ($1, $2, $3, $4, $5)
```

INSERT pomija **zarówno wymagane `name`, jak i wymagane `role_id`**. Poprawny SCIM POST kończy się naruszeniem `NOT NULL` — provisioning przez SCIM jest **całkowicie niedziałający**. To nie jest kwestia „złego defaultu", tylko brakujących kolumn w INSERT.

### Zgłoszenie poza zakresem (P1)

| ID | Znalezisko |
|---|---|
| **N-1** | **SCIM CREATE nie może utworzyć użytkownika** — `route.ts:145` pomija `name` i `role_id`; wymaga osobnej decyzji produktowej o domyślnym `role_id` i mapowaniu `userName` → `name`. **Nie naprawiane w FIX-WH.** |

---

## Testy (napisane, NIE uruchamiane)

| Wymóg | Plik |
|---|---|
| W-1 create → edit name only → adres zachowany | `warehouses/page.test.tsx` |
| W-2 act-as label = display name | `shell-identity.test.ts`, `platform-switcher.test.tsx` |

---

## Czego NIE jestem pewien

1. **Nie uruchamiałem testów ani buildu** (zakaz ze spec) — ryzyko literówek w nowym teście create→edit (selektory dialogu Add warehouse).
2. **Baner act-as:** prototyp pokazuje email po prawej; teraz pokazujemy `actorLabel` z `title={email}`. Wizualnie inne niż HTML-prototyp, ale zgodne z wymogiem precedencji display name; warto zerknąć w bramce E2E platform admina.
3. **Inwentarz W-3** zbudowany grepem po `apps/web` + `packages/queries` — czytelnicy w migracjach SQL, workerach poza tym drzewem lub w `packages/db` mogły zostać pominięte.
4. **RLS na `public.users`** przy act-as z innym `org_id` w cookie — `loadShellIdentity` czyta wiersz aktora po `userId` (PK), nie po org kontekstu act-as; zakładam, że to poprawne (pokazujemy tożsamość platform admina, nie użytkownika docelowej org).
