# PROPOSED TASK — 07-planning-ext: planner-solver hosting + env contract

**Suggested ID:** 07-T-061
**Type:** ops/infra + T2-api (integration wiring)
**Risk tier:** high (blocks the entire scheduler — solver is un-runnable as tasked)
**Closes:** audit finding 07-F1

## Problem
PRD §285: the Python solver "runs in a Python microservice — NOT in main Next.js app… deployed separately, scaled independently." Current tasks only SCAFFOLD it: T-021 (`services/planner-solver/` code + Dockerfile), T-012 (dispatch), T-022/T-023 (algorithms). **No task says where it runs.** Deploy target is Vercel + Supabase; Vercel cannot host a long-running FastAPI container. Without a host the scheduler cannot run end-to-end.

## Title
T-061 — Provision + wire planner-solver host (deploy target + env contract + health/circuit-breaker integration)

## Scope
1. **Decide + document host** for `services/planner-solver` (options: Fly.io / Render / Google Cloud Run / Railway — pick one, ADR-style note). Must support: always-on or fast-cold-start container, Postgres connectivity to Supabase pooler (eu-central-2), secret-based auth.
2. **Env contract:** add `PLANNER_SOLVER_URL` + `PLANNER_SOLVER_SECRET` (or equivalent) to Vercel env + `.env` schema; document in Mon-vercel / deploy docs.
3. **Next.js side integration:** the dispatch path (see T-012 / the dispatch-reconcile task) must read the solver URL/secret, call the solver, and degrade gracefully (circuit breaker → run stays `queued`/`failed` with typed error, never 500s the user) when the solver is unreachable.
4. **Deploy hook:** CI/CD step or documented manual step to build+push the solver image and deploy on merge (kept out of the Vercel build, which is Next-only).
5. **Health probe:** wire the solver `/health` (T-021) into a monitoring/readiness check.

## Acceptance criteria
- A scheduler run dispatched from the deployed Next.js app reaches the deployed solver and returns assignments end-to-end on preview env (live evidence, per live-deploy-verification-gate).
- Solver-down case: run row transitions to a typed failed/queued state with a user-visible message; no unhandled 500.
- Env vars present in Vercel preview; secret never logged (pino redaction).

## Dependencies
- Local: T-021 (scaffold), T-012 (dispatch), the dispatch-reconcile decision (m07-solver-dispatch-reconcile).
- Cross-module: 00-FOUNDATION T-111 `apps/worker` ✅ (if dispatch is reconciled through the worker rather than direct HTTP).

## Red lines
- Do NOT attempt to run FastAPI inside Vercel functions.
- Solver must connect with least-privilege DB role; respect RLS/org scoping for any data it reads.
- No secrets in client bundle or logs.

## Note
Same hosting question applies to the P2 Prophet forecaster microservice (T-054) — fold into the same host decision or explicitly defer with P2.
