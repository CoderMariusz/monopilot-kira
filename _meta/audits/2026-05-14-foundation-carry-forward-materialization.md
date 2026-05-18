# Foundation Carry-Forward Materialization (2026-05-14)

Source backlog: `_meta/audits/2026-05-07-foundation-final-carry-forward-backlog.md`
Concurrent thread (excluded): `FT-001` (`withOrgContext` HOF) — being materialised by a parallel Opus session.

## Summary
- **Items materialised**: 49 (FT-002..FT-050)
- **T-XXX range used**: T-062 .. T-110
- **Manifest updated**: `_meta/atomic-tasks/00-foundation/manifest.json` (task_count: 61 → 110)
- **Coverage appended**: `_meta/atomic-tasks/00-foundation/coverage.md` (section `## Carry-forward materialization 2026-05-14`)

## P0 deploy blockers (5)

> **NB:** FT-001 is also a P0 (handled by the concurrent Opus thread). The other 4 are below.

- **FT-020 → T-080** — Bootstrap org.platform.admin for the Apex tenant via migration + runbook; without this seed, T-039's canary-upgrade Server Actions return 403 in production.
- **FT-021 → T-081** — Fix the 017-rbac.sql checksum mismatch in migrate.ts so every future migration applies without manual psql workaround; replay 023 and 024 cleanly.
- **FT-032 → T-092** — Bind SAML RelayState with HMAC(org_id + nonce + exp) to defend against replay and cross-tenant binding even if Issuer-host check is bypassed.
- **FT-033 → T-093** — Align packages/ui peerDeps to React 19; reinstall zustand@5 and react-hook-form against React 19; verify Stepper/Field render in apps/web.

All P0 tasks carry: `labels` includes `p0-blocker`; `priority`: 90; `risk_red_lines` includes the line "P0 deploy blocker — do not merge without GREEN evidence on staging".

## FT → T-XXX mapping

| FT | T-XXX | severity | category | title |
|---|---|---|---|---|
| FT-002 | T-062 | P1 | auth | restore proper org-scoped USING clause on user_pins RLS |
| FT-003 | T-063 | P2 | docs | document Radix colon-id axe-core quirk in packages/ui/TESTING.md |
| FT-004 | T-064 | P2 | data | VALIDATE CONSTRAINT audit_events_role_assigned_security_check after fresh-DB |
| FT-005 | T-065 | P2 | docs | Supabase deploy runbook (JWT_EXP, MAILER_OTP_EXP, refresh rotation) + verifier |
| FT-006 | T-066 | P1 | auth | setPin/verifyPin caller-contract JSDoc + pool.end() lifecycle fix |
| FT-007 | T-067 | P2 | ui | ReasonInput — add aria-label prop + forwardRef |
| FT-008 | T-068 | P1 | ops | add `import 'server-only'` marker on PostHog flags route |
| FT-009 | T-069 | P2 | data | verify organizations.industry_code CHECK accepts 'generic' |
| FT-010 | T-070 | P1 | auth | true 8-h absolute session lifetime + session_started_at |
| FT-011 | T-071 | P1 | auth | approval-token replay protection (jti + consumed_approval_tokens) |
| FT-012 | T-072 | P3 | ui | shouldFail=true click-driven error-transition test in patterns.test.tsx |
| FT-013 | T-073 | P2 | auth | tenant-scoped JIT provisioning flag wired to signInWithMagicLink.shouldCreateUser |
| FT-014 | T-074 | P2 | auth | shared rbac pool lifecycle (closeRbacPool) replacing per-call pool.end() |
| FT-015 | T-075 | P2 | docs | rename POSTHOG_KEY → POSTHOG_API_KEY + .env.example |
| FT-016 | T-076 | P1 | auth | cross-org grant rejection (assertActorBelongsToOrg) + integration test |
| FT-017 | T-077 | P1 | auth | refactor grantRole from BYPASSRLS owner pool to getAppConnection + set_org_context |
| FT-018 | T-078 | P2 | docs | import Permission.ORG_ACCESS_ADMIN from @kira/rbac instead of inlined string |
| FT-019 | T-079 | P1 | auth | SoD semantic correction: check target's existing roles in addition to actor's |
| FT-020 | T-080 | P0 | ops | bootstrap org.platform.admin Apex seed runbook + migration |
| FT-021 | T-081 | P0 | ops | fix migrate.ts 017-rbac.sql checksum mismatch; replay 023+024 cleanly |
| FT-022 | T-082 | P1 | auth | owner-pool memoization + request-scoped actor org binding for upgrade actions |
| FT-023 | T-083 | P1 | data | audit_events_dept_column_denied_security_check DB CHECK constraint |
| FT-024 | T-084 | P1 | auth | narrow tenant_idp_config grants (column-level or service-role-only) |
| FT-025 | T-085 | P2 | data | dept_column_drafts partial unique (org_id, dept_id, column_key) WHERE status='draft' |
| FT-026 | T-086 | P1 | auth | replace SAML Issuer regex with xmldom + namespace-aware XPath |
| FT-027 | T-087 | P2 | data | audit_events.org_id nullable for unauthenticated security events + sentinel backfill |
| FT-028 | T-088 | P1 | auth | invoke enforceSamlPolicy from password/magic sign-in routes with real user_roles JOIN |
| FT-029 | T-089 | P1 | auth | cross-tenant SCIM ambiguity-guard test (>1 hash verifies → 401) |
| FT-030 | T-090 | P1 | auth | register Jackson connection (createConnection) at tenant onboarding/saml-config write |
| FT-031 | T-091 | P1 | auth | SCIM Group provisioning (POST/PATCH /Groups, members semantics) |
| FT-032 | T-092 | P0 | auth | HMAC-bound RelayState (org_id + nonce + exp) for SAML replay defence |
| FT-033 | T-093 | P0 | ui | align packages/ui to React 19 peerDeps + reinstall zustand@5/react-hook-form |
| FT-034 | T-094 | P2 | auth | SLO session-cookie clearing + Supabase session revoke |
| FT-035 | T-095 | P2 | ui | SchemaColumnWizard step 2 → RHF + Zod resolver from @monopilot/ui |
| FT-036 | T-096 | P2 | ui | swap custom jsxPreTransformPlugin → @vitejs/plugin-react-oxc |
| FT-037 | T-097 | P3 | ui | remove test-setup.ui.ts userEvent monkey-patch once user-event v15 ships |
| FT-038 | T-098 | P1 | ops | getSystemActorConnection() helper in @monopilot/db + constant-time Bearer compare for cron |
| FT-039 | T-099 | P1 | ui | install @playwright/test + real-Chromium offline PWA E2E spec |
| FT-040 | T-100 | P2 | data | wire executor cascading branch → dispatch runCascade for manufacturing_operation_to_intermediate_code_cascade |
| FT-041 | T-101 | P2 | data | enable drift-detect strict mode (extra_in_db) after dept_code → table registry lands |
| FT-042 | T-102 | P2 | data | promote public.fg fixture to real migration when 01-NPD module ships |
| FT-043 | T-103 | P2 | ops | wire @monopilot/ops TS path alias in apps/web/tsconfig.json |
| FT-044 | T-104 | P2 | data | org-scoped Postgres sequence for nextSeq7() replacing Date-based counter |
| FT-045 | T-105 | P2 | docs | document Vercel-only deploy assumption for x-vercel-cron OR require Bearer-AND-header in prod |
| FT-046 | T-106 | P3 | data | surface EvaluateResult through ExecutorResult if executeRule is ever made async |
| FT-047 | T-107 | P3 | ops | outbox-error surfacing through an upstream error-reporting mechanism |
| FT-048 | T-108 | P2 | data | restore FK tenant_migrations.tenant_id → organizations(id) once T-039 verified in prod |
| FT-049 | T-109 | P1 | auth | totp.ts masterKey fail-closed env-var guard (mirror T-014 HMAC pattern) |
| FT-050 | T-110 | P2 | auth | bundle full NIST top-25K common-password list (replacing ~200 stub) |

## Intentionally skipped
- **FT-001** — assigned to a parallel Opus thread (`withOrgContext` HOF + RLS tests). No JSON file emitted here to avoid a collision.

## Pipeline coverage
- All tasks declare `pipeline_name: "kira_dev"`, `max_attempts: 3`, full `pipeline_inputs` including `root_path`, `prd_task_id`, `source_prd`, `prd_refs`, `original_carry_forward_id`, `category`, `subcategory`, `task_type`, `parent_feature`, `context_budget`, `estimated_effort`, `description`, `details`, `scope_files`, `out_of_scope`, `dependencies`, `parallel_safe_with`, `acceptance_criteria`, `test_strategy`, `risk_red_lines`, `skills`, `checkpoint_policy`, `routing_hints`.
- UI tasks (FT-007, FT-033, FT-035, FT-039) carry `prototype_match: true` + `ui_evidence_policy: "_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md"`.
- Migration-touching tasks carry the `systematic-debugging` skill in addition to the baseline.
- P0 tasks also carry `verification-before-completion`.

## Notes for orchestrator
- `dependencies` are listed in canonical T-XXX form. The most important cross-FT chain is **FT-033 (T-093) blocks FT-035 (T-095) and FT-036 (T-096)** because the React 19 peer must land before the UI consumers can be refactored.
- `parallel_safe_with` is set on FT-033 ↔ FT-021 (they touch disjoint trees — `packages/ui` deps vs `scripts/migrate.ts`).
- The orchestrator may also wire `FT-001` → `FT-010, FT-017, FT-022, FT-028` once FT-001's T-XXX number is known (sister thread will report).
