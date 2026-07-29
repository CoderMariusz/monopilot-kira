# Persony testowe RBAC

Ten katalog jest przeznaczony wyłącznie dla izolowanych baz testowych bez danych
produkcyjnych. Źródłem person jest
`packages/db/seeds/test-personas.ts`. Seed wymaga jawnego potwierdzenia
`TEST_PERSONAS_CONFIRM_TEST_DB=YES`; bez niego nie otworzy połączenia.
Proces odmawia też pracy, gdy `NODE_ENV=production` albo
`VERCEL_ENV=production`.

## Katalog kont

| login | hasło | rola | co MOŻE | czego NIE MOŻE | do jakich testów służy |
|---|---|---|---|---|---|
| `persona.admin@monopilot.test` | `MonoPilot-Test-2026!` | istniejąca `admin` | Pełny, rzeczywisty zbiór istniejącej roli `Admin` z bazy; seed nie nadpisuje ani `role_permissions`, ani legacy `roles.permissions`. Brak ograniczenia site (zero wpisów `user_sites`, a rola `admin` jest też rozpoznawana jako super-role). | Brak ograniczeń RBAC w obrębie organizacji testowej; rozjazd tej roli z enumem jest raportowany osobno. | Punkt odniesienia oraz pierwszy podpisujący w testach dual-sign. |
| `persona.no-asset-deactivate@monopilot.test` | `MonoPilot-Test-2026!` | `test_no_asset_deactivate` | Wszystkie prawa modułu maintenance poza jednym; w szczególności odczyt/edycja aktywu, MWO, PM, kalibracja i LOTO. | Dokładnie `mnt.asset.deactivate`; ta sama bramka chroni reaktywację aktywu. | Behawioralny test odmowy dezaktywacji i reaktywacji aktywu. |
| `persona.second-signer@monopilot.test` | `MonoPilot-Test-2026!` | `test_second_signer` | `mnt.asset.read`, `mnt.loto.apply`, `mnt.calib.record`. Jest aktywnym użytkownikiem tej samej organizacji i ma UUID różny od admina. | Pozostałe działania maintenance, w tym `mnt.asset.deactivate` i `mnt.loto.clear`. | Drugi podpis LOTO i kalibracji; weryfikacja SoD/dwuosobowości. |
| `persona.single-site-operator@monopilot.test` | `MonoPilot-Test-2026!` | `test_single_site_operator` | Podstawowa egzekucja WO (`start/pause/resume/complete`), zapis zużycia/outputu/odpadu/downtime oraz `warehouse.lp.consume`; ma dokładnie jeden wpis `user_sites`. | Widoczność i zapis danych innego zakładu; brak praw kierowniczych, korekt i override. | Testy `app.user_can_see_site`, RLS i bramek cross-site na ścieżkach produkcyjnych/skanerowych. |
| `persona.no-module-access@monopilot.test` | `MonoPilot-Test-2026!` | `test_no_module_access` | Logowanie i istnienie jako aktywny członek organizacji. | Wszystkie uprawnienia modułowe — efektywny zbiór jest pusty. | Negatywne ścieżki `forbidden`, brak dostępu do modułu i ukrycie nawigacji. |

Nie dodano szóstej persony: `admin` może być pierwszym podpisującym, a
`second_signer` pokrywa brakującego, odrębnego aktora. Osobne konto
`first_signer` dublowałoby ten przypadek bez dodania nowej granicy uprawnień.

## Uruchomienie

Wymagane są:

- `DATABASE_URL` — połączenie rolą testową mającą `SUPERUSER` albo
  `BYPASSRLS`; samo bycie właścicielem bazy/tabel nie wystarcza przy
  `FORCE ROW LEVEL SECURITY`;
- `TEST_PERSONAS_ORG_ID` — UUID istniejącej organizacji testowej;
- `TEST_PERSONAS_CONFIRM_TEST_DB=YES` — jawna blokada przed przypadkowym
  uruchomieniem na bazie produkcyjnej;
- opcjonalnie `TEST_PERSONAS_SITE_ID` — aktywny zakład dla operatora. Bez tej
  zmiennej seed wybiera aktywny zakład domyślny, a następnie pierwszy aktywny
  według `site_code`.

Dla lokalnego klastra tworzonego przez `scripts/test-db.sh` domyślną rolą
administracyjną jest lokalny użytkownik systemowy. Przy domyślnym sockecie
Homebrew polecenie wygląda tak:

```bash
DATABASE_URL="postgresql://$(id -un)@%2Ftmp/monopilot" \
TEST_PERSONAS_ORG_ID='00000000-0000-0000-0000-000000000002' \
TEST_PERSONAS_CONFIRM_TEST_DB=YES \
pnpm --filter @monopilot/db exec tsx seeds/test-personas.ts
```

Przy innym sockecie lub klastrze należy podać równoważny DSN uprzywilejowanej
roli testowej. Nie używać roli `monopilot` przygotowanej przez
`scripts/test-db.sh`: po migracjach ma ona `NOSUPERUSER NOBYPASSRLS`.
Seed sprawdza `pg_roles.rolsuper`/`rolbypassrls` jako pierwsze zapytanie i
odmawia pracy, zanim `FORCE RLS` zdąży zamienić odczyty w mylące zero wierszy.

Seed jest zbieżny, nie tylko odporny na duplikaty:

- cztery role testowe dostają dokładnie zadeklarowany zbiór zarówno w
  `role_permissions`, jak i w legacy `roles.permissions`;
- systemowa rola `admin` jest wyłącznie odczytywana i przypisywana personie;
  seed nie zmienia jej nazwy, flag ani uprawnień;
- każde konto dostaje dokładnie jedną rolę;
- tylko `single_site_operator` dostaje wpis `user_sites` i jest to dokładnie
  jeden zakład;
- ponowne wykonanie reaktywuje konta DB i usuwa ich stare przypisania, które
  nie należą już do katalogu.

Zmiany dotyczą wyłącznie pięciu deterministycznych UUID z tego katalogu oraz
czterech zarządzanych kodów ról testowych. Istniejąca rola `admin` jest tylko
odczytywana i przypisywana. Kolumna aktywności użytkownika nazywa się
`users.is_active`; seed nie używa nieistniejącego `users.active`.

## Supabase Auth

Część bazodanowa wykonuje się zawsze. Jeśli podano jednocześnie:

```bash
NEXT_PUBLIC_SUPABASE_URL='https://test-project.supabase.co'
SUPABASE_SERVICE_ROLE_KEY='test-service-role-key'
```

seed tworzy lub aktualizuje te same deterministyczne UUID w Supabase Auth,
potwierdza e-mail i ustawia hasła z tabeli. Klucz `service_role` jest używany
wyłącznie po stronie procesu seedującego.

Gdy obie zmienne nie istnieją, proces kończy część DB kodem sukcesu, ale wypisuje
głośne:

```text
[AUTH NOT PROVISIONED] ... DB personas exist, but they cannot log in through Supabase Auth.
```

Gdy podano tylko jedną z dwóch zmiennych albo Auth zwróci błąd, część DB
pozostaje zapisana, natomiast proces kończy się błędem — nie raportuje
fałszywego sukcesu logowania.

## Dlaczego `second_signer` spełnia dual-sign

Migracja `514-maintenance-loto-dual-sign.sql` wymusza różne wartości
`lockout_applied_by` i `zero_energy_verified_by` oraz różne identyfikatory
podpisów. Akcje maintenance dodatkowo wybierają drugiego użytkownika tylko
wtedy, gdy:

- jest aktywny, nieusunięty i należy do tej samej organizacji;
- różni się od pierwszego podpisującego;
- ma `mnt.loto.apply` dla LOTO albo `mnt.calib.record` dla kalibracji.

`second_signer` ma oba prawa oraz stały UUID
`7f290000-0000-4000-8000-000000000003`, różny od UUID admina
`7f290000-0000-4000-8000-000000000001`.

## Dowód efektywnych uprawnień

Seed wykonuje poniższe zapytanie w tej samej transakcji i wypisuje jego
rzeczywisty wynik pod nagłówkiem `[RBAC PROOF]`. Zapytanie łączy oba źródła
sprawdzane przez aplikację: znormalizowane `role_permissions` i legacy
`roles.permissions`. Przed `COMMIT` skrypt porównuje pełne tablice
`effective_permissions` czterech zarządzanych ról oraz site-scope wszystkich
person z katalogiem; rozbieżność powoduje `ROLLBACK`. Komunikat podaje obie
strony różnicy, na przykład:

```text
Effective permission mismatch for persona.second-signer@monopilot.test; missing=["mnt.calib.record"]; unexpected=["mnt.asset.deactivate"]
```

Dla persony `admin` źródłem prawdy jest przypięta, istniejąca rola `Admin`.
Seed nie porównuje jej do deklarowanej kopii. Zamiast tego wypisuje niezależną
diagnostykę `[ADMIN PERMISSION DRIFT]` z tablicami `enum_only` i
`database_only`.

```sql
with persona_users as (
  select u.id, u.email
    from public.users u
   where u.org_id = :'org_id'::uuid
     and u.email = any(array[
       'persona.admin@monopilot.test',
       'persona.no-asset-deactivate@monopilot.test',
       'persona.second-signer@monopilot.test',
       'persona.single-site-operator@monopilot.test',
       'persona.no-module-access@monopilot.test'
     ]::citext[])
),
effective as (
  select pu.id as user_id, permission_set.permission
    from persona_users pu
    join public.user_roles ur
      on ur.user_id = pu.id
     and ur.org_id = :'org_id'::uuid
    join public.roles r
      on r.id = ur.role_id
     and r.org_id = ur.org_id
    cross join lateral (
      select rp.permission
        from public.role_permissions rp
       where rp.role_id = r.id
      union
      select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb))
    ) permission_set
)
select pu.email::text as login,
       string_agg(distinct r.code, ', ' order by r.code) as role,
       count(distinct e.permission)::int as permission_count,
       coalesce(bool_or(e.permission = 'mnt.asset.deactivate'), false)
         as has_asset_deactivate,
       coalesce(bool_or(e.permission = 'mnt.loto.apply'), false)
         as can_loto_apply,
       coalesce(bool_or(e.permission = 'mnt.calib.record'), false)
         as can_calib_record,
       coalesce(
         (
           select array_agg(s.site_code order by s.site_code)
             from public.user_sites us
             join public.sites s
               on s.id = us.site_id
              and s.org_id = us.org_id
            where us.user_id = pu.id
              and us.org_id = :'org_id'::uuid
         ),
         array[]::text[]
       ) as assigned_sites,
       coalesce(
         array_agg(distinct e.permission order by e.permission)
           filter (where e.permission is not null),
         array[]::text[]
       ) as effective_permissions
  from persona_users pu
  join public.user_roles ur
    on ur.user_id = pu.id
   and ur.org_id = :'org_id'::uuid
  join public.roles r
    on r.id = ur.role_id
   and r.org_id = ur.org_id
  left join effective e on e.user_id = pu.id
 group by pu.id, pu.email
 order by pu.email;
```

Skrócony, deterministyczny rezultat kontraktu (pełna tablica
`effective_permissions` jest wypisywana przez seed):

| login | permission_count | has_asset_deactivate | can_loto_apply | can_calib_record | assigned_sites |
|---|---:|---|---|---|---|
| `persona.admin@monopilot.test` | liczba efektywnych praw istniejącej roli `Admin` | `true` | `true` | `true` | `{}` |
| `persona.no-asset-deactivate@monopilot.test` | `17` | `false` | `true` | `true` | `{}` |
| `persona.second-signer@monopilot.test` | `3` | `false` | `true` | `true` | `{}` |
| `persona.single-site-operator@monopilot.test` | `9` | `false` | `false` | `false` | `{<wybrany_site_code>}` |
| `persona.no-module-access@monopilot.test` | `0` | `false` | `false` | `false` | `{}` |

## Rozjazd enum ↔ rola `Admin`

Na bazie po pełnym łańcuchu do migracji 543:

- `ALL_PERMISSIONS` ma dokładnie **273** kody;
- efektywny zbiór istniejącej roli `Admin` ma **316** kodów;
- 270 kodów jest wspólnych, 3 istnieją tylko w enumie, a 46 tylko w bazie.

Tylko w enumie (`enum_only`):

- `impersonate.org`
- `org.scim.write`
- `settings.impersonate.tenant`

Tylko w bazie (`database_only`):

- NPD/legacy: `brief.convert_to_fa`, `fa.create`, `fa.delete`,
  `fa.field_edit`, `npd.brief.read`, `npd.brief.write`,
  `npd.commercial.write`, `npd.compliance`, `npd.costing`, `npd.dashboard`,
  `npd.fa.build`, `npd.fa.close`, `npd.fa.create`, `npd.fa.read`,
  `npd.mrp.write`, `npd.nutrition`, `npd.procurement.write`,
  `npd.production.write`, `npd.project.create`, `npd.project.view`,
  `npd.risks`, `npd.technical.write`
- Settings/legacy: `impersonate.tenant`, `settings.d365.manage`,
  `settings.d365.rotate_secret`, `settings.d365.test_connection`,
  `settings.email.read`, `settings.email_config.edit`, `settings.infra.read`,
  `settings.infra.update`, `settings.roles.manage`, `settings.roles.view`,
  `settings.schema.admin`, `settings.schema.read`, `settings.security.view`,
  `settings.units.manage`, `settings.users.view`
- Operacje techniczne: `manufacturing_operations.create`,
  `manufacturing_operations.delete`, `manufacturing_operations.edit`,
  `manufacturing_operations.reorder`, `manufacturing_operations.view`,
  `technical.sensory.write`, `technical.wip.create`,
  `technical.wip.deactivate`, `technical.wip.edit`

Seed wyłącznie raportuje ten rozjazd. Nie zmienia enuma ani istniejącej roli,
bo ich uzgodnienie wymaga osobnej decyzji RBAC.
