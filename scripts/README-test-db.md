# Lokalna baza testowa z trzema klonami

Skrypt używa lokalnego Homebrew PostgreSQL 16 na `127.0.0.1:5432`. Nie używa
Dockera i nie łączy się z Supabase ani inną bazą zewnętrzną.

> **Uwaga:** `scripts/supabase-shim.sql` jest wyłącznie atrapą do lokalnych
> testów migracji. Nie uruchamia Supabase Storage i nie dowodzi działania
> uploadów, polityk na `storage.objects`, podpisanych URL-i ani Storage API.

## Najbezpieczniejszy start od zera

Uruchom z katalogu głównego repo:

```bash
./scripts/test-db.sh all
pnpm test:db:urls
```

`all` wykonuje kolejno `recreate && migrate && verify && clone` i zatrzymuje się
na pierwszym błędzie. `recreate` zrywa połączenia z bazą `monopilot`, usuwa ją
i tworzy od zera jako `OWNER monopilot TEMPLATE template0`, po czym stosuje
minimalny lokalny shim ról, `auth.uid()` i obiektów schematu `storage`
wymaganych przez migracje.

Te same kroki można uruchomić osobno:

```bash
./scripts/test-db.sh recreate
./scripts/test-db.sh migrate
./scripts/test-db.sh verify
./scripts/test-db.sh clone
```

Runner dostaje `SUPERUSER` i `CREATEROLE` tylko na czas przebiegu, ponieważ
wymagają ich istniejące migracje ról; skrypt odbiera oba atrybuty po przebiegu.
Rola `monopilot` zachowuje `BYPASSRLS`, bo jest pulą właścicielską
`DATABASE_URL_OWNER` i musi czytać tabele z `FORCE ROW LEVEL SECURITY`.
Nie dotyczy to `app_user`: `verify` nadal wymaga, by ta rola nie miała ani
`SUPERUSER`, ani `BYPASSRLS`.

`up` jest niedestrukcyjne: uruchamia PostgreSQL, tworzy brakującą rolę/bazę
i sprawdza istniejący szablon. Jeśli znajdzie w `public` tabelę, której
właścicielem nie jest `monopilot`, kończy się błędem i wskazuje `recreate`;
nie zmienia po cichu tylko właściciela bazy.

## Między falami i sprzątanie

```bash
pnpm test:db:reset   # usuwa i odtwarza t1/t2/t3 z TEMPLATE monopilot
./scripts/test-db.sh reset t1  # usuwa i odtwarza tylko t1
./scripts/test-db.sh down
```

`reset` bez argumentu zachowuje dotychczasowe zachowanie. Argumentem może być
wyłącznie `t1`, `t2` albo `t3`; pozostałe klony nie są wtedy rozłączane ani
zmieniane.

`down` usuwa tylko `monopilot_t1`, `monopilot_t2` i `monopilot_t3`. Baza
`monopilot` zostaje.

## Gotowość środowiska

```bash
./scripts/test-db.sh status
```

`status` wypisuje dla `monopilot` oraz `monopilot_t1..t3`: liczbę migracji
względem repo, parę najwyższych numerów `repo/db` i wynik ich porównania,
liczbę pięciu kanonicznych person w organizacji
`00000000-0000-0000-0000-000000000002` oraz obecność użytkownika harnessu
`11111111-1111-4111-8111-111111111111`. Brakująca baza jest pokazywana jako
`BRAK`, bez pomijania jej w raporcie.

## Dowód działania

`./scripts/test-db.sh verify` porównuje dokładny zbiór nazw
`packages/db/migrations/*.sql` ze zbiorem `public.schema_migrations.filename`.
Kończy się błędem przy różnej liczbie rekordów, różnym najwyższym numerze albo
jakiejkolwiek różnicy zbiorów; wypisuje wszystkie brakujące i nadmiarowe nazwy.
Nadal kończy się błędem, jeśli `app_user` nie istnieje albo ma
`rolsuper`/`rolbypassrls`. Przy poprawnym przebiegu wypisuje wersję PostgreSQL,
liczbę migracji, liczbę tabel w `public` i istotne atrybuty `app_user`.

`clone` wykonuje tę samą kontrolę kompletności przed wyłączeniem połączeń.
Jeśli szablon jest niepełny (np. brakuje
`544-npd-field-catalog-seed-dedup.sql`), uruchamia idempotentny runner,
ponownie sprawdza dokładny zbiór migracji i dopiero wtedy usuwa stare klony.
Nieusunięta rozbieżność albo błąd migracji zatrzymuje komendę przed
klonowaniem.

Po utworzeniu każdego klonu `clone` uruchamia
`packages/db/seeds/test-personas.ts` z lokalnym administratorem PostgreSQL,
`TEST_PERSONAS_CONFIRM_TEST_DB=YES` i kanonicznym orgiem, a następnie
`scripts/seed-e2e-user.sql` tą samą rolą. Oba seedy respektują `FORCE RLS`;
seed person ma wyłączone zdalne provisionowanie Supabase Auth. Ich błąd nie
jest tłumiony i zatrzymuje `clone`. Przy powodzeniu skrypt wypisuje nazwę
klonu, właściciela `monopilot` i `datallowconn = t`.
