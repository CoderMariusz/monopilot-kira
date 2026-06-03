# 00-foundation — Module Run Ledger (live)

Run started 2026-06-03 via `/kira:run-module 00-foundation`. Integration branch `kira/long-run`.
Writer routing per `docs/workflow/01-MODEL-ROUTING.md` (Codex = primary impl; Opus = UI + review).
Worktrees per `03-WORKTREE-PROTOCOL.md` at `../kira-wt/<T>`. Gates per `02-QUALITY-GATES.md`.

Legend: ⬜ pending · 🔄 in-flight · 🧪 gates-running · 👀 review · ✅ merged · ⏸ blocked-external · ⏭ deferred

## Pending scope (51) — dependency-layered

### Layer 0 — buildable now (no pending in-module deps)
| Task | Type | Writer | Risk | Serialization | Status |
|---|---|---|---|---|---|
| T-111 | T2-api scaffold | Codex | high | apps/worker/* (creates) | ✅ merged |
| T-113 | T2-api | Codex | high | packages/gdpr (new) | ✅ merged |
| T-124 | T2-api | Codex | high | packages/e-sign +mig055 +schema | ✅ merged (1 rework) |
| T-028 | UI prim | Opus(kira-ui) | high | ReasonInput +T-067 | ✅ merged |
| T-037 | T3-ui | Opus(kira-ui) | high | apps/web wizard | ⬜ |
| T-095 | T3-ui | Opus(kira-ui) | high | apps/web wizard | ⬜ |
| T-096 | T4-test | Codex/Sonnet | low | apps/web/vitest.ui.config | ⬜ |
| T-063 | T4-test | Sonnet | low | packages/ui/TESTING.md | ⬜ |
| T-064 | T1-schema | Codex | high | migrations/* | ✅ merged |
| T-065 | docs+script | kira-easy+Codex | low | runbook + verify script | ✅ merged |
| T-068 | mech | Haiku | high | feature-flags | ⬜ |
| T-072 | T4-test | Sonnet | low | packages/ui __tests__ | ⬜ |
| T-073 | T2-api | Codex | high | login _actions | ✅ merged |
| T-074 | T2-api | Codex | high | rbac pool lifecycle | ✅ merged |
| T-075 | mech | Haiku | low | feature-flags + .env | ✅ merged |
| T-077 | T2-api | Codex | high | packages/rbac grant | ⬜ |
| T-078 | mech | Haiku | low | flags/route | ✅ merged |
| T-082 | T2-api | Codex | high | with-org-context | ✅ obsolete (superseded T-125) |
| T-083 | T1-schema | Codex | high | dept-denied CHECK mig058 | ✅ merged |
| T-085 | T1-schema | Codex | high | dept-drafts unique mig059 | ✅ merged |
| T-086 | T2-api | Codex | high | saml issuer-parser xmldom | ✅ merged |
| T-087 | T1-schema | Codex | high | audit org_id nullable mig060 | ✅ merged |
| T-089 | T4-test | Codex | high | scim __tests__ | ⬜ |
| T-091 | T2-api | Codex | high | scim v2/Groups +mig053 +rbac revokeRole | ✅ merged (3 rounds) |
| T-092 | T2-api(logic) | Codex | high | HMAC RelayState | ✅ merged |
| T-094 | T2-api | Codex | high | SLO + Supabase signOut | ✅ merged |
| T-098 | T2-api | Codex | high | system-actor-conn + wire drift/outbox | 🔄 rework (wire real routes) |
| T-099 | T4-test | Codex | low | playwright offline E2E | ✅ merged |
| T-100 | T2-api | Codex | low | outbox route | ⬜ |
| T-103 | T4-test | Haiku | low | apps/web/tsconfig | ✅ merged |
| T-104 | T1-schema(logic) | Codex | high | migrations/* | ⬜ |
| T-105 | docs | Sonnet | low | cron docs | ⬜ |
| T-106 | T2-api | Codex | low | executor | ⬜ (was deferred; executeRule async in-task) |
| T-108 | T1-schema | Codex | high | migrations/* | ⬜ (T-039 done) |
| T-110 | T5-seed | Codex | high | password-policy 25k list | ✅ merged |

### Layer 1
| T-067 | UI prim | Opus | high | bundled w/ T-028 | ✅ merged |
| T-112 | T2-api | Codex | high | outbox consumer +mig056 +DLQ | ✅ merged (1 rework) |
| T-114 | T2-api | Codex | high | gdpr erasure cron +mig057 | ✅ merged |
| T-116 | T2-api | Codex | high | observability+instrumentation | ✅ merged |

### Layer 2
| T-117 | T2-api | Codex | low | pino logger + worker logger | ✅ merged |

### Layer 3
| T-118 | T2-api | Codex | high | Sentry (web+worker+obs) | ✅ merged |
| T-119 | T2-api | Codex | high | backup policy + cron | ✅ merged |
| T-121 | T2-api | Codex | high | rate-limit → proxy.ts (edge) | ✅ merged |
| T-107 | T2-api | Codex | low | ←T-118 (outbox error→Sentry) | ⬜ |

### Layer 4
| T-120 | T2-api | Codex | high | restore-drill | ✅ merged |

### Layer 5
| T-122 | T4-test | Codex | high | CI harden + drift gate | ✅ merged |

## External gaps (do NOT build now — record in sign-off)
- **T-102** — promote `public.fg` fixture → real migration. Blocking: **01-npd** (product schema). Bucket A.
- **T-115** — NPD erasure handler registration test. Blocking: **01-npd/T-089**. Bucket A. (Framework lands via T-113/114; NPD handler is external.)

## Deferred (upstream/library, not buildable)
- **T-097** — remove user-event monkey-patch. Blocking: **user-event v15 not released**. ⏭

## Notes
- T-101 (drift strict) was "deferred until dept_code table registry"; T-106/T-107/T-108 conditional-deferred now unblocked in-module → scheduled above.
- Serialization points: `packages/db/migrations/`, `permissions.enum.ts`, `apps/web/package.json`, `apps/worker/src/index.ts`, `packages/db/src/schema/index.ts` — run alone, merge, then fan out.

## Infra unlocked 2026-06-03
- **Local Postgres** at 127.0.0.1:5432 fully migrated (001-052 + 054; anon/authenticated/service_role roles created). Owner=`mariuszkrawczyk` (superuser), app=`monopilot` (member of app_user). Run DB-gated tests: `DATABASE_URL=postgres://monopilot:monopilot@127.0.0.1:5432/monopilot DATABASE_URL_OWNER=postgres://mariuszkrawczyk@127.0.0.1:5432/monopilot pnpm --filter <pkg> test`. **This is the real Gate-1 for DB tasks** — orchestrator runs integration suites here before merge (Codex reported 'no DB' falsely).
- **Migration numbering:** 052=T-064(merged), 053=T-091(scim-groups, pending), 054=audit-seq-grant(merged), 055=next free (T-124 e-sign).
- **Systemic Codex pattern:** creates dead code at stale scope paths (T-073/T-100/T-082/T-098). Pre-check the real integration point before dispatch.

## KNOWN ISSUES FOR SIGN-OFF (must resolve before module sign-off)
- **Pre-existing auth DB-test failures on local Postgres:** `packages/auth/src/__tests__/totp.test.ts` (T-015) + `verify-pin.test.ts` (T-016) FAIL when run against the real local DB (fixture/seed drift + otlib-compat TS2724 mock). These tasks are marked DONE but violate G1 'tests run for real' on a real DB. Needs a fixture-fix task before sign-off (same drift class as T-091/T-124 fixtures — seed users with name+role_id, fix otplib mock).
