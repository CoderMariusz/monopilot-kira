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

Runner dostaje `CREATEROLE` tylko na czas przebiegu, ponieważ wymagają go
migracje `000`/`006`; skrypt odbiera ten atrybut po przebiegu. Migracje
wykonują się bez `SUPERUSER` i `BYPASSRLS`.

`up` jest niedestrukcyjne: uruchamia PostgreSQL, tworzy brakującą rolę/bazę
i sprawdza istniejący szablon. Jeśli znajdzie w `public` tabelę, której
właścicielem nie jest `monopilot`, kończy się błędem i wskazuje `recreate`;
nie zmienia po cichu tylko właściciela bazy.

## Między falami i sprzątanie

```bash
pnpm test:db:reset   # usuwa i odtwarza t1/t2/t3 z TEMPLATE monopilot
./scripts/test-db.sh down
```

`down` usuwa tylko `monopilot_t1`, `monopilot_t2` i `monopilot_t3`. Baza
`monopilot` zostaje.

## Dowód działania

`./scripts/test-db.sh verify` porównuje dokładny zbiór nazw
`packages/db/migrations/*.sql` ze zbiorem `public.schema_migrations.filename`.
Kończy się błędem przy różnej liczbie rekordów, różnym najwyższym numerze albo
jakiejkolwiek różnicy zbiorów; wypisuje wszystkie brakujące i nadmiarowe nazwy.
Nadal kończy się błędem, jeśli `app_user` nie istnieje albo ma
`rolsuper`/`rolbypassrls`. Przy poprawnym przebiegu wypisuje wersję PostgreSQL,
liczbę migracji, liczbę tabel w `public` i istotne atrybuty `app_user`.

`clone` wykonuje tę samą kontrolę kompletności przed wyłączeniem połączeń i
usunięciem starych klonów. Niepełny szablon nie zostanie sklonowany. Przy
powodzeniu wypisuje trzy wiersze z nazwą klonu, właścicielem `monopilot`
i `datallowconn = t`.
