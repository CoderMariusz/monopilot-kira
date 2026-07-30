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
readonly PERSONAS_ORG_ID="00000000-0000-0000-0000-000000000002"
readonly TEST_PERSONAS_COUNT=5
readonly HARNESS_USER_ID="11111111-1111-4111-8111-111111111111"
readonly REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
readonly MIGRATIONS_DIR="${REPO_ROOT}/packages/db/migrations"
readonly SUPABASE_SHIM="${REPO_ROOT}/scripts/supabase-shim.sql"
readonly E2E_USER_SEED="${REPO_ROOT}/scripts/seed-e2e-user.sql"

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

database_admin_psql() {
  local database="$1"
  shift
  "$PSQL" -X --no-password -v ON_ERROR_STOP=1 \
    -h "$PG_HOST" -p "$PG_PORT" -U "$PG_ADMIN_ROLE" -d "$database" "$@"
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
      LOGIN CREATEDB NOCREATEROLE INHERIT NOSUPERUSER BYPASSRLS
      PASSWORD 'monopilot';
  ELSE
    ALTER ROLE monopilot
      LOGIN CREATEDB NOCREATEROLE INHERIT NOSUPERUSER BYPASSRLS
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
  # Dlatego podnosimy SUPERUSER/CREATEROLE WYŁĄCZNIE na czas przebiegu; verify pilnuje
  # stanu spoczynkowego. BYPASSRLS zostaje, bo monopilot jest pulą właścicielską.
  # Odpowiada to produkcji, gdzie migracje też lecą rolą uprzywilejowaną.
  # UWAGA: przy podniesionych uprawnieniach RLS jest omijany, więc post-checki migracji
  # NIE dowodzą zachowania pod RLS — to trzeba sprawdzić osobno, rolą nieuprzywilejowaną.
  admin_psql -c "alter role monopilot createrole superuser bypassrls"
  trap 'admin_psql -c "alter role monopilot nocreaterole nosuperuser bypassrls"' EXIT
  local status=0
  (
    cd "$REPO_ROOT"
    DATABASE_URL="$TEMPLATE_URL" \
      DATABASE_URL_OWNER="$TEMPLATE_URL" \
      MIGRATE_ALLOW_CHECKSUM_DRIFT_FOR="" \
      pnpm db:migrate
  ) || status=$?
  admin_psql -c "alter role monopilot nocreaterole nosuperuser bypassrls"
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

  local ledger_exists
  if ! ledger_exists="$(template_psql -Atqc "select to_regclass('public.schema_migrations')")"; then
    die "Nie można sprawdzić public.schema_migrations jako rola monopilot."
  fi
  if [[ -z "$ledger_exists" ]]; then
    printf '[test-db] Szablon nie ma public.schema_migrations.\n' >&2
    return 1
  fi

  local db_count
  if ! db_count="$(template_psql -Atqc "select count(filename) from public.schema_migrations")"; then
    die "Nie można odczytać public.schema_migrations jako rola monopilot."
  fi
  if ! db_files="$(template_psql -Atqc "
    select filename
    from public.schema_migrations
    where filename is not null
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
    return 1
  fi

  log "Migracje kompletne: ${db_count} plików, najwyższy numer ${db_max}."
}

ensure_template_migrations() {
  if verify_migration_completeness; then
    return
  fi

  log "Szablon monopilot jest niepełny; uruchamiam idempotentny runner migracji."
  migrate
  verify_migration_completeness ||
    die "Szablon monopilot nadal jest niekompletny po migracji."
}

verify() {
  require_ready
  verify_migration_completeness ||
    die "Szablon monopilot nie przeszedł kontroli kompletności migracji."
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

seed_clone() {
  local database="$1"
  local admin_url="postgres://${PG_ADMIN_ROLE}@${PG_HOST}:${PG_PORT}/${database}"

  log "Seeduję persony testowe w ${database} jako ${PG_ADMIN_ROLE}."
  (
    cd "$REPO_ROOT"
    DATABASE_URL="$admin_url" \
      TEST_PERSONAS_ORG_ID="$PERSONAS_ORG_ID" \
      TEST_PERSONAS_CONFIRM_TEST_DB=YES \
      NEXT_PUBLIC_SUPABASE_URL= \
      SUPABASE_SERVICE_ROLE_KEY= \
      pnpm --filter @monopilot/db exec tsx seeds/test-personas.ts
  )

  log "Seeduję użytkownika harnessu w ${database} jako ${PG_ADMIN_ROLE}."
  database_admin_psql "$database" -f "$E2E_USER_SEED"
}

create_clones() {
  require_ready
  command -v pnpm >/dev/null 2>&1 || die "Nie znaleziono pnpm w PATH."
  ensure_template_migrations

  local targets=("$@")
  if (( ${#targets[@]} == 0 )); then
    targets=("${CLONES[@]}")
  fi

  admin_psql -c "alter database monopilot with allow_connections false"

  local status=0
  admin_psql -q <<'SQL' || status=$?
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'monopilot'
  AND pid <> pg_backend_pid();
SQL

  local database
  if (( status == 0 )); then
    for database in "${targets[@]}"; do
      admin_psql -q <<SQL || status=$?
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '${database}'
  AND pid <> pg_backend_pid();

DROP DATABASE IF EXISTS "${database}";
CREATE DATABASE "${database}" OWNER monopilot TEMPLATE monopilot;
SQL
      (( status == 0 )) || break
    done
  fi

  admin_psql -c "alter database monopilot with allow_connections true"
  (( status == 0 )) || die "Klonowanie zakończyło się kodem ${status}."

  for database in "${targets[@]}"; do
    seed_clone "$database"
    admin_psql -P pager=off -c "
      select datname, pg_get_userbyid(datdba) as owner, datallowconn
      from pg_database
      where datname = '${database}';
    "
  done
  log "Utworzono i zaseedowano ${#targets[@]} czystych klonów z TEMPLATE monopilot."
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

clone_database_name() {
  case "$1" in
    t1|t2|t3) printf 'monopilot_%s\n' "$1" ;;
    *) die "Nieznany klon '$1'. Dozwolone: t1, t2, t3." ;;
  esac
}

print_database_status() {
  local database="$1"
  local repo_count="$2"
  local repo_max="$3"
  local database_exists ledger_exists users_exists
  local db_files="" db_count=0 db_max=0 max_matches="NIE"
  local persona_count=0 persona_status harness_count=0 harness_status="NIE"

  database_exists="$(admin_psql -Atqc \
    "select count(*) from pg_database where datname = '${database}'")"
  if [[ "$database_exists" == "0" ]]; then
    printf '%-14s %-11s %-12s %-10s %-15s %-8s\n' \
      "$database" "BRAK" "${repo_max}/-" "NIE" "NIE (0/${TEST_PERSONAS_COUNT})" "NIE"
    return
  fi

  ledger_exists="$(database_admin_psql "$database" -Atqc \
    "select to_regclass('public.schema_migrations')")"
  if [[ -n "$ledger_exists" ]]; then
    db_files="$(database_admin_psql "$database" -Atqc "
      select filename
      from public.schema_migrations
      where filename is not null
      order by filename
    " | LC_ALL=C sort)"
    db_count="$(printf '%s\n' "$db_files" | awk 'NF { count++ } END { print count + 0 }')"
    db_max="$(printf '%s\n' "$db_files" | max_migration_number)"
  fi
  [[ "$db_max" == "$repo_max" ]] && max_matches="TAK"

  users_exists="$(database_admin_psql "$database" -Atqc \
    "select to_regclass('public.users')")"
  if [[ -n "$users_exists" ]]; then
    persona_count="$(database_admin_psql "$database" -Atqc "
      select count(*)
      from public.users
      where org_id = '${PERSONAS_ORG_ID}'::uuid
        and id = any(array[
          '7f290000-0000-4000-8000-000000000001'::uuid,
          '7f290000-0000-4000-8000-000000000002'::uuid,
          '7f290000-0000-4000-8000-000000000003'::uuid,
          '7f290000-0000-4000-8000-000000000004'::uuid,
          '7f290000-0000-4000-8000-000000000005'::uuid
        ])
    ")"
    harness_count="$(database_admin_psql "$database" -Atqc "
      select count(*)
      from public.users
      where id = '${HARNESS_USER_ID}'::uuid
        and org_id = '${PERSONAS_ORG_ID}'::uuid
    ")"
  fi

  if [[ "$persona_count" == "$TEST_PERSONAS_COUNT" ]]; then
    persona_status="TAK (${persona_count}/${TEST_PERSONAS_COUNT})"
  else
    persona_status="NIE (${persona_count}/${TEST_PERSONAS_COUNT})"
  fi
  [[ "$harness_count" == "1" ]] && harness_status="TAK"

  printf '%-14s %-11s %-12s %-10s %-15s %-8s\n' \
    "$database" "${db_count}/${repo_count}" "${repo_max}/${db_max}" \
    "$max_matches" "$persona_status" "$harness_status"
}

status() {
  require_ready
  local repo_files file repo_count repo_max database
  repo_files="$(
    for file in "${MIGRATIONS_DIR}"/*.sql; do
      [[ -f "$file" ]] || continue
      printf '%s\n' "${file##*/}"
    done | LC_ALL=C sort
  )"
  [[ -n "$repo_files" ]] || die "Brak plików SQL w ${MIGRATIONS_DIR}."
  repo_count="$(printf '%s\n' "$repo_files" | awk 'NF { count++ } END { print count + 0 }')"
  repo_max="$(printf '%s\n' "$repo_files" | max_migration_number)"

  printf '%-14s %-11s %-12s %-10s %-15s %-8s\n' \
    "BAZA" "MIGRACJE" "MAX(repo/db)" "MAX=REPO" "PERSONY" "HARNESS"
  for database in "$TEMPLATE_DB" "${CLONES[@]}"; do
    print_database_status "$database" "$repo_count" "$repo_max"
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
Użycie: $0 {up|recreate|migrate|verify|clone|all|reset [t1|t2|t3]|status|urls|down}
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
    (( $# <= 2 )) || die "reset przyjmuje najwyżej jeden argument: t1, t2 albo t3."
    if [[ -n "${2:-}" ]]; then
      reset_database="$(clone_database_name "$2")"
      log "Odtwarzam czysty klon ${reset_database} z bazy monopilot."
      create_clones "$reset_database"
    else
      log "Odtwarzam wszystkie czyste klony z bazy monopilot."
      create_clones
    fi
    ;;
  status) status ;;
  urls) print_urls ;;
  down) drop_clones ;;
  *)
    usage >&2
    exit 2
    ;;
esac
