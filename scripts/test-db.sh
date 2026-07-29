#!/usr/bin/env bash
set -euo pipefail

readonly BREW_PG_BIN="/opt/homebrew/opt/postgresql@16/bin"
readonly PG_DATA="${TEST_DB_PGDATA:-/opt/homebrew/var/postgresql@16}"
readonly PG_HOST="127.0.0.1"
readonly PG_PORT="5432"
readonly PG_ADMIN_ROLE="${TEST_DB_ADMIN_ROLE:-$(id -un)}"
readonly DB_OWNER="monopilot"
readonly DB_PASSWORD="monopilot"
readonly TEMPLATE_DB="monopilot"
readonly TEMPLATE_URL="postgres://monopilot:monopilot@127.0.0.1:5432/monopilot"
readonly CLONES=("monopilot_t1" "monopilot_t2" "monopilot_t3")
readonly REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
readonly MIGRATIONS_DIR="${REPO_ROOT}/packages/db/migrations"
readonly SUPABASE_SHIM="${REPO_ROOT}/scripts/supabase-shim.sql"

log() {
  printf '[test-db] %s\n' "$*"
}

die() {
  printf '[test-db] ERROR: %s\n' "$*" >&2
  exit 1
}

pg_tool() {
  local name="$1"
  if [[ -x "${BREW_PG_BIN}/${name}" ]]; then
    printf '%s\n' "${BREW_PG_BIN}/${name}"
  elif command -v "$name" >/dev/null 2>&1; then
    command -v "$name"
  else
    die "Nie znaleziono ${name} ani w ${BREW_PG_BIN}, ani w PATH."
  fi
}

readonly PSQL="$(pg_tool psql)"
readonly PG_ISREADY="$(pg_tool pg_isready)"
readonly PG_CTL="$(pg_tool pg_ctl)"

admin_psql() {
  "$PSQL" -X --no-password -v ON_ERROR_STOP=1 -U "$PG_ADMIN_ROLE" -d postgres "$@"
}

template_psql() {
  PGPASSWORD="$DB_PASSWORD" "$PSQL" -X --no-password -v ON_ERROR_STOP=1 \
    -h "$PG_HOST" -p "$PG_PORT" -U "$DB_OWNER" -d "$TEMPLATE_DB" "$@"
}

template_admin_psql() {
  "$PSQL" -X --no-password -v ON_ERROR_STOP=1 \
    -U "$PG_ADMIN_ROLE" -d "$TEMPLATE_DB" "$@"
}

require_ready() {
  "$PG_ISREADY" -q -h "$PG_HOST" -p "$PG_PORT" ||
    die "PostgreSQL nie odpowiada na ${PG_HOST}:${PG_PORT}. Uruchom: $0 up"
}

assert_pg16() {
  local version
  version="$(admin_psql -Atqc "show server_version")"
  [[ "$version" == 16.* ]] ||
    die "Oczekiwano PostgreSQL 16.x na ${PG_HOST}:${PG_PORT}, wykryto ${version}."
  log "PostgreSQL ${version} odpowiada na ${PG_HOST}:${PG_PORT}."
}

start_cluster() {
  if "$PG_ISREADY" -q -h "$PG_HOST" -p "$PG_PORT"; then
    return
  fi

  [[ -d "$PG_DATA" ]] || die "Nie znaleziono datadir ${PG_DATA}."
  if "$PG_CTL" -D "$PG_DATA" status >/dev/null 2>&1; then
    log "Klaster działa bez TCP; restartuję go z nasłuchem na ${PG_HOST}:${PG_PORT}."
    "$PG_CTL" -D "$PG_DATA" -m fast -o "-h ${PG_HOST} -p ${PG_PORT}" restart
  else
    log "Uruchamiam klaster PostgreSQL z nasłuchem na ${PG_HOST}:${PG_PORT}."
    "$PG_CTL" -D "$PG_DATA" -o "-h ${PG_HOST} -p ${PG_PORT}" \
      -l "${PG_DATA}/test-db.log" start
  fi

  local attempt
  for attempt in {1..30}; do
    "$PG_ISREADY" -q -h "$PG_HOST" -p "$PG_PORT" && return
    sleep 1
  done
  die "PostgreSQL nie zaczął odpowiadać na ${PG_HOST}:${PG_PORT} w ciągu 30 s."
}

ensure_owner_role() {
  admin_psql <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'monopilot') THEN
    CREATE ROLE monopilot
      LOGIN CREATEDB NOCREATEROLE INHERIT NOSUPERUSER NOBYPASSRLS
      PASSWORD 'monopilot';
  ELSE
    ALTER ROLE monopilot
      LOGIN CREATEDB NOCREATEROLE INHERIT NOSUPERUSER NOBYPASSRLS
      PASSWORD 'monopilot';
  END IF;
END
$$;
SQL
}

assert_template_table_ownership() {
  local foreign_table_count
  foreign_table_count="$(template_admin_psql -Atqc "
    select count(*)
    from pg_catalog.pg_tables
    where schemaname = 'public' and tableowner <> 'monopilot'
  ")"

  if (( foreign_table_count > 0 )); then
    template_admin_psql -P pager=off -c "
      select tableowner, count(*) as public_tables
      from pg_catalog.pg_tables
      where schemaname = 'public' and tableowner <> 'monopilot'
      group by tableowner
      order by tableowner;
    "
    die "Baza monopilot zawiera ${foreign_table_count} tabel w public należących do innej roli. Uruchom: $0 recreate"
  fi
}

up() {
  start_cluster
  assert_pg16
  ensure_owner_role

  if [[ "$(admin_psql -Atqc "select count(*) from pg_database where datname = 'monopilot'")" == "0" ]]; then
    admin_psql -c "create database monopilot owner monopilot template template0"
  fi
  admin_psql -c "alter database monopilot with allow_connections true"
  assert_template_table_ownership
  admin_psql -c "alter database monopilot owner to monopilot"

  template_psql -Atqc "select 1" >/dev/null
  log "Rola monopilot i baza monopilot są gotowe."
}

recreate() {
  start_cluster
  assert_pg16
  ensure_owner_role

  admin_psql -Atqc "
    select pg_terminate_backend(pid)
    from pg_stat_activity
    where datname = 'monopilot' and pid <> pg_backend_pid()
  " >/dev/null
  admin_psql -c "drop database if exists monopilot with (force)"
  admin_psql -c "create database monopilot owner monopilot template template0"

  template_admin_psql -f "$SUPABASE_SHIM"
  template_psql -Atqc "select 1" >/dev/null
  log "Odtworzono bazę monopilot z TEMPLATE template0 i lokalnym shimem Supabase; właściciel: monopilot."
}

migrate() {
  require_ready
  assert_pg16
  command -v pnpm >/dev/null 2>&1 || die "Nie znaleziono pnpm w PATH."

  # 000/006 tworzą i normalizują role. CREATEROLE jest potrzebne tylko na czas runnera.
  # Migracja 000 robi ALTER ROLE app_user ... NOSUPERUSER ... NOBYPASSRLS, gdy rola już istnieje
  # w klastrze (a istnieje, z wcześniejszych kampanii). PG16 sprawdzone empirycznie:
  #   NOSUPERUSER  -> "Only roles with the SUPERUSER attribute may change the SUPERUSER attribute."
  #   NOBYPASSRLS  -> "Only roles with the BYPASSRLS attribute may change the BYPASSRLS attribute."
  # Dotyczy to także USTAWIANIA ich na "nie". ADMIN OPTION nie wystarcza.
  # Usunięcie app_user odpada — wiszą na nim uprawnienia w innych bazach klastra.
  # Dlatego podnosimy monopilot WYŁĄCZNIE na czas przebiegu; verify pilnuje stanu spoczynkowego.
  # Odpowiada to produkcji, gdzie migracje też lecą rolą uprzywilejowaną.
  # UWAGA: przy podniesionych uprawnieniach RLS jest omijany, więc post-checki migracji
  # NIE dowodzą zachowania pod RLS — to trzeba sprawdzić osobno, rolą nieuprzywilejowaną.
  admin_psql -c "alter role monopilot createrole superuser bypassrls"
  trap 'admin_psql -c "alter role monopilot nocreaterole nosuperuser nobypassrls"' EXIT
  local status=0
  (
    cd "$REPO_ROOT"
    DATABASE_URL="$TEMPLATE_URL" \
      DATABASE_URL_OWNER="$TEMPLATE_URL" \
      MIGRATE_ALLOW_CHECKSUM_DRIFT_FOR="" \
      pnpm db:migrate
  ) || status=$?
  admin_psql -c "alter role monopilot nocreaterole nosuperuser nobypassrls"
  trap - EXIT

  (( status == 0 )) || die "Łańcuch migracji zakończył się kodem ${status}."
  log "Łańcuch migracji zakończony."
}

max_migration_number() {
  awk -F- '
    /^[0-9][0-9][0-9]-/ {
      number = $1 + 0
      if (number > max) max = number
    }
    END { print max + 0 }
  '
}

verify_migration_completeness() {
  [[ -d "$MIGRATIONS_DIR" ]] || die "Nie znaleziono katalogu migracji: ${MIGRATIONS_DIR}"

  local repo_files db_files file
  repo_files="$(
    for file in "${MIGRATIONS_DIR}"/*.sql; do
      [[ -f "$file" ]] || continue
      printf '%s\n' "${file##*/}"
    done | LC_ALL=C sort
  )"
  [[ -n "$repo_files" ]] || die "Brak plików SQL w ${MIGRATIONS_DIR}."

  local db_count
  if ! db_count="$(template_psql -Atqc "select count(*) from public.schema_migrations")"; then
    die "Nie można odczytać public.schema_migrations jako rola monopilot."
  fi
  if ! db_files="$(template_psql -Atqc "
    select filename
    from public.schema_migrations
    order by filename
  " | LC_ALL=C sort)"; then
    die "Nie można odczytać nazw z public.schema_migrations jako rola monopilot."
  fi

  local repo_count repo_max db_max missing unexpected
  repo_count="$(printf '%s\n' "$repo_files" | awk 'NF { count++ } END { print count + 0 }')"
  repo_max="$(printf '%s\n' "$repo_files" | max_migration_number)"
  db_max="$(printf '%s\n' "$db_files" | max_migration_number)"
  missing="$(comm -23 <(printf '%s\n' "$repo_files") <(printf '%s\n' "$db_files"))"
  unexpected="$(comm -13 <(printf '%s\n' "$repo_files") <(printf '%s\n' "$db_files"))"

  if [[ "$repo_count" != "$db_count" || "$repo_max" != "$db_max" ||
        -n "$missing" || -n "$unexpected" ]]; then
    printf '[test-db] Niezgodny łańcuch migracji: repo=%s, baza=%s, max(repo)=%s, max(baza)=%s.\n' \
      "$repo_count" "$db_count" "$repo_max" "$db_max" >&2
    if [[ -n "$missing" ]]; then
      printf '[test-db] Brakujące w bazie pliki:\n' >&2
      while IFS= read -r file; do
        printf '  - %s\n' "$file" >&2
      done <<<"$missing"
    fi
    if [[ -n "$unexpected" ]]; then
      printf '[test-db] Pliki zapisane w bazie, których nie ma w repo:\n' >&2
      while IFS= read -r file; do
        printf '  - %s\n' "$file" >&2
      done <<<"$unexpected"
    fi
    die "Szablon monopilot nie przeszedł kontroli kompletności migracji."
  fi

  log "Migracje kompletne: ${db_count} plików, najwyższy numer ${db_max}."
}

verify() {
  require_ready
  verify_migration_completeness
  template_psql -P pager=off <<'SQL'
DO $$
DECLARE
  app_role record;
BEGIN
  SELECT * INTO app_role FROM pg_roles WHERE rolname = 'app_user';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Brak wymaganej roli app_user';
  END IF;
  IF app_role.rolsuper OR app_role.rolbypassrls THEN
    RAISE EXCEPTION
      'app_user jest niebezpieczna: rolsuper=%, rolbypassrls=%',
      app_role.rolsuper, app_role.rolbypassrls;
  END IF;

  -- Rola PULI WŁAŚCICIELSKIEJ (DATABASE_URL_OWNER). Wbrew pierwszemu odruchowi ma ona
  -- BYPASSRLS MIEĆ — tak jest na produkcji i repo tego wprost wymaga:
  -- migracja 525 podnosi wyjątek, gdy rola definiująca nie jest superuserem ani BYPASSRLS
  -- ("public.work_orders is FORCE ROW LEVEL SECURITY with policies granted only to app_user"),
  -- a `packages/db/src/clients.ts` opisuje tę pulę jako "owner/superuser role".
  -- Egzekwowanie RLS testujemy PULĄ APLIKACYJNĄ (app_user) — sprawdzoną wyżej.
  -- Bez BYPASSRLS rozwiązywanie organizacji w withOrgContext widzi 0 wierszy w public.users
  -- i KAŻDA Server Action pada. SUPERUSER natomiast zostać nie może.
  SELECT * INTO app_role FROM pg_roles WHERE rolname = 'monopilot';
  IF app_role.rolsuper THEN
    RAISE EXCEPTION
      'monopilot ma SUPERUSER po migracji — podniesienie z migrate() nie zostalo cofniete';
  END IF;
  IF NOT app_role.rolbypassrls THEN
    RAISE EXCEPTION
      'monopilot NIE ma BYPASSRLS — pula wlascicielska nie odczyta public.users (FORCE RLS), kazda Server Action padnie';
  END IF;
END
$$;

SELECT current_setting('server_version') AS postgres_version;
SELECT count(filename) AS applied_migrations
FROM public.schema_migrations;
SELECT count(*) AS public_tables
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p');
SELECT
  rolname,
  rolcanlogin,
  rolsuper,
  rolcreatedb,
  rolcreaterole,
  rolinherit,
  rolreplication,
  rolbypassrls
FROM pg_roles
WHERE rolname = 'app_user';
SQL
  log "Weryfikacja zakończona: app_user nie ma SUPERUSER ani BYPASSRLS."
}

create_clones() {
  require_ready
  verify_migration_completeness
  admin_psql -c "alter database monopilot with allow_connections false"

  local status=0
  admin_psql -q <<'SQL' || status=$?
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname IN ('monopilot', 'monopilot_t1', 'monopilot_t2', 'monopilot_t3')
  AND pid <> pg_backend_pid();

DROP DATABASE IF EXISTS monopilot_t1;
DROP DATABASE IF EXISTS monopilot_t2;
DROP DATABASE IF EXISTS monopilot_t3;

CREATE DATABASE monopilot_t1 OWNER monopilot TEMPLATE monopilot;
CREATE DATABASE monopilot_t2 OWNER monopilot TEMPLATE monopilot;
CREATE DATABASE monopilot_t3 OWNER monopilot TEMPLATE monopilot;
SQL

  admin_psql -c "alter database monopilot with allow_connections true"
  (( status == 0 )) || die "Klonowanie zakończyło się kodem ${status}."

  admin_psql -P pager=off -c "
    select datname, pg_get_userbyid(datdba) as owner, datallowconn
    from pg_database
    where datname in ('monopilot_t1', 'monopilot_t2', 'monopilot_t3')
    order by datname;
  "
  log "Utworzono trzy czyste klony z TEMPLATE monopilot."
}

drop_clones() {
  require_ready
  admin_psql -q <<'SQL'
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname IN ('monopilot_t1', 'monopilot_t2', 'monopilot_t3')
  AND pid <> pg_backend_pid();

DROP DATABASE IF EXISTS monopilot_t1;
DROP DATABASE IF EXISTS monopilot_t2;
DROP DATABASE IF EXISTS monopilot_t3;
SQL
  log "Usunięto klony; baza monopilot pozostała bez zmian."
}

print_urls() {
  local db
  for db in "${CLONES[@]}"; do
    printf '%s=postgres://monopilot:monopilot@127.0.0.1:5432/%s\n' "$db" "$db"
  done
}

run_all() {
  "$BASH" "$REPO_ROOT/scripts/test-db.sh" recreate &&
    "$BASH" "$REPO_ROOT/scripts/test-db.sh" migrate &&
    "$BASH" "$REPO_ROOT/scripts/test-db.sh" verify &&
    "$BASH" "$REPO_ROOT/scripts/test-db.sh" clone
}

usage() {
  cat <<EOF
Użycie: $0 {up|recreate|migrate|verify|clone|all|reset|urls|down}
EOF
}

case "${1:-}" in
  up) up ;;
  recreate) recreate ;;
  migrate) migrate ;;
  verify) verify ;;
  clone) create_clones ;;
  all) run_all ;;
  reset)
    log "Odtwarzam czyste klony z bazy monopilot."
    create_clones
    ;;
  urls) print_urls ;;
  down) drop_clones ;;
  *)
    usage >&2
    exit 2
    ;;
esac
