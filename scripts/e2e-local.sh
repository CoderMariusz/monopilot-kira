#!/usr/bin/env bash
# scripts/e2e-local.sh — run browser E2E specs against the LOCAL Postgres.
#
# Why this script exists: .env.local (repo root AND apps/web) points DATABASE_URL,
# DATABASE_URL_OWNER and SUPABASE_SERVICE_ROLE_KEY at PRODUCTION, and next.config.mjs
# only fills variables that are still undefined — one forgotten export and a
# destructive E2E run hits the live database. Every DB URL is exported here and then
# re-asserted to be 127.0.0.1 before anything starts.
#
# Auth: there is no Supabase Auth in front of the local DB, so the login form can
# never succeed. scripts/e2e-local-run.ts boots the in-repo shell-parity harness
# (fake GoTrue + `pnpm --filter web dev` with DEV_AUTH_BYPASS=true) and the specs'
# shared signIn() installs its session cookie (E2E_LOCAL=1).
#
# Usage:
#   scripts/e2e-local.sh apps/web/e2e/order-to-ship-flow.e2e.spec.ts [more specs…]
#   scripts/e2e-local.sh --db monopilot_t1 apps/web/e2e/purchasing-chain-e2e.spec.ts
#
# Prerequisites: local Postgres up + migrated (scripts/test-db.sh, pnpm db:migrate:local)
# and the harness user seeded (psql "$DATABASE_URL" -f scripts/seed-e2e-user.sql).
set -euo pipefail

readonly REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
readonly LOCAL_HOST='127.0.0.1'
readonly LOCAL_PORT='5432'
readonly DB_ROLE='monopilot'
readonly DB_PASSWORD='monopilot'
# apps/web/e2e/_helpers/shell-parity.ts:134 — HARNESS_USER_ID.
readonly HARNESS_UID='11111111-1111-4111-8111-111111111111'
readonly AUTH_STATE="${REPO_ROOT}/apps/web/e2e/.auth/user.json"
readonly AUTH_STASH="${REPO_ROOT}/apps/web/e2e/.auth/user.json.e2e-local-stash"

cd "$REPO_ROOT"

db_name='monopilot'
if [[ "${1:-}" == '--db' ]]; then
  db_name="${2:?--db requires a database name (monopilot, monopilot_t1…t3)}"
  shift 2
fi
if [[ $# -eq 0 ]]; then
  echo "usage: scripts/e2e-local.sh [--db <database>] <spec> [<spec>…]" >&2
  exit 2
fi

# ── environment: shell wins over both .env.local files (next.config.mjs:33) ────
export DATABASE_URL="postgres://${DB_ROLE}:${DB_PASSWORD}@${LOCAL_HOST}:${LOCAL_PORT}/${db_name}"
export DATABASE_URL_OWNER="$DATABASE_URL"
export APP_USER_PASSWORD='app-user-test-password'
export DATABASE_URL_APP="postgres://app_user:${APP_USER_PASSWORD}@${LOCAL_HOST}:${LOCAL_PORT}/${db_name}"
export E2E_LOCAL=1
# The fake GoTrue accepts any credentials; never type the real preview password
# into a locally served app.
export PLAYWRIGHT_ADMIN_EMAIL='shell.parity@monopilot.local'
export PLAYWRIGHT_ADMIN_PASSWORD='e2e-local'
# The harness picks its own port and exports PLAYWRIGHT_BASE_URL; a stale value here
# would send every spec at the deployed app instead.
unset PLAYWRIGHT_BASE_URL PLAYWRIGHT_AUTH_STORAGE PLAYWRIGHT_AUTH_STORAGE_STATE PLAYWRIGHT_WEB_SERVER

# ── production guard (assertion, not a comment) ───────────────────────────────
url_host() {
  local rest="${1#*://}"   # drop scheme
  rest="${rest##*@}"       # drop user:password@
  rest="${rest%%[/?]*}"    # drop /database and ?params
  printf '%s' "${rest%%:*}"  # drop :port
}

refuse() {
  echo "REFUSING TO RUN: $1" >&2
  echo "  These specs are destructive; they must never touch the deployed database." >&2
  exit 1
}

assert_local_db_url() {
  local name="$1" value="${2-}" host
  [[ -n "$value" ]] || refuse "$name is empty."
  host="$(url_host "$value")"
  [[ "$host" == "$LOCAL_HOST" ]] || refuse "$name resolves to host '${host}', expected ${LOCAL_HOST}."
  case "$value" in
    *supabase.co*|*supabase.com*|*supabase.in*|*.vercel.app*)
      refuse "$name contains a production host (supabase/vercel)."
      ;;
  esac
}

assert_local_db_url DATABASE_URL "$DATABASE_URL"
assert_local_db_url DATABASE_URL_OWNER "$DATABASE_URL_OWNER"
assert_local_db_url DATABASE_URL_APP "$DATABASE_URL_APP"
echo "[e2e-local] database: ${DB_ROLE}@${LOCAL_HOST}:${LOCAL_PORT}/${db_name} (asserted local)"

# ── the harness user must exist: with-org-context.ts:243 resolves org_id from
#    public.users and throws for every Server Action otherwise ────────────────
if ! command -v psql >/dev/null 2>&1 && [[ -x /opt/homebrew/opt/postgresql@16/bin/psql ]]; then
  PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
fi
if command -v psql >/dev/null 2>&1; then
  if seeded="$(psql "$DATABASE_URL" -tAXc "select count(*) from public.users where id = '${HARNESS_UID}'")"; then
    if [[ "$seeded" != '1' ]]; then
      # Also fires when the row exists but this role cannot see it: public.users is FORCE RLS
      # with policies only for app_user, and the seed grants the owner role BYPASSRLS.
      echo "REFUSING TO RUN: the owner role does not resolve harness user ${HARNESS_UID} in ${db_name}." >&2
      echo "  Seed it first (as a superuser):  psql -d ${db_name} -v ON_ERROR_STOP=1 -f scripts/seed-e2e-user.sql" >&2
      exit 1
    fi
  else
    echo "REFUSING TO RUN: cannot query ${db_name} on ${LOCAL_HOST}:${LOCAL_PORT}." >&2
    echo "  Bring the local database up first:  bash scripts/test-db.sh up && pnpm db:migrate:local" >&2
    exit 1
  fi
else
  echo "[e2e-local] psql not found — skipping the harness-user check." >&2
fi

# ── the stale prod storageState blocks the harness (shell-parity.ts:112-122) ──
restore_auth_state() {
  if [[ -f "$AUTH_STASH" ]]; then mv -f "$AUTH_STASH" "$AUTH_STATE"; fi
}
trap restore_auth_state EXIT
if [[ -f "$AUTH_STATE" ]]; then
  mv -f "$AUTH_STATE" "$AUTH_STASH"
  echo "[e2e-local] moved ${AUTH_STATE#$REPO_ROOT/} aside for this run (restored on exit)"
fi

pnpm exec tsx scripts/e2e-local-run.ts "$@"
