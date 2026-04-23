# ADR-032 — Settings-minimum carveout for NPD unlock + Foundation/Settings infra split

**Status:** Proposed (2026-04-22)
**Supersedes:** §4.2 of `00-FOUNDATION-PRD.md` v3.0 (build order row 2 dependency "Foundation infra w minimum scope" is under-specified)
**Related:** ADR-028 (schema-driven), ADR-029 (rule engine), ADR-030 (dept taxonomy), ADR-031 (multi-tenant L1-L4)
**Context docs:** `_meta/plans/2026-04-22-phase-e-kickoff-plan.md` (full analysis + dependency matrix)

---

## Context

Current `00-FOUNDATION-PRD.md` §4.2 build order says:

```
1. 00-FOUNDATION (meta, no build)
2. 01-NPD impl (depends on: "Foundation infra in minimum scope")
3. 02-SETTINGS impl → 03-TECHNICAL impl
```

Two problems:

1. **"Foundation infra in minimum scope" is not a build target** — it has no sub-modules, no PRD, no definition of done. Everyone interprets it differently. No story backlog exists.
2. **01-NPD-a cannot actually start** until 02-SETTINGS provides Reference CRUD (pack_sizes, lines, templates, processes, dieset, allergens), RBAC (fa.create, fa.edit permissions), module toggles, i18n scaffolding. Analysis (see plan doc §1) identifies **10 hard blockers** and 5 soft blockers from 02-SETTINGS on 01-NPD-a.

Result: strict PRD order (01→02→03) is impossible. Implicit Foundation prereq is vague. Development cannot start without a clean contract.

## Decision

Split pre-NPD work into **two explicit build phases**, each with own sub-modules, PRDs/specs, and story backlogs:

### Phase E-0: `00-FOUNDATION-impl-a..i` — runtime infrastructure

Runtime infra consumed by every module. NO user-facing UI.

| Sub-module | Scope | Est. sesji |
|---|---|---|
| 00-a | Monorepo (pnpm + Turborepo) + Next.js 14 app router + TS strict + Tailwind + shadcn init | 1-2 |
| 00-b | Supabase setup + Drizzle ORM + migrations pipeline + seed runner | 1-2 |
| 00-c | Auth + session + `app.current_org_id` middleware + basic login | 2 |
| 00-d | RLS baseline (policies on all business tables + org_id scoping) | 1 |
| 00-e | Audit infrastructure (`audit_log` table partitioned + triggers framework + query API) | 2 |
| 00-f | Outbox pattern runtime (`outbox_events` table + `insertOutboxEvent` helper + pg-boss/pg_cron worker + DLQ + R14 UUID v7) | 2 |
| 00-g | Rule engine runtime (DSL interpreter + registry loader + dry-run harness — **runtime only, no admin UI**) | 2-3 |
| 00-h | Schema-driven engine runtime (ADR-028 L1-L4 storage + JSON-Schema→Zod runtime codegen + ext_jsonb GIN indexes) | 2-3 |
| 00-i | Testing + CI (Vitest + Playwright + seed fixtures + GitHub Actions + Vercel preview deploys + PostHog self-host skeleton + Sentry) | 2-3 |

**Total: 15-20 sesji.** All sub-modules infra-only, no dept-specific logic.

### Phase E-1: `02-SETTINGS-a` — minimum viable admin (gates 01-NPD-a)

UI + data model for admin config that 01-NPD-a consumes at runtime. Strict carveout — everything else from 02-SETTINGS defers to parallel tracks `-b..e`.

| Sub-task | 02-SET PRD section | Est. sesji |
|---|---|---|
| Orgs + Users CRUD | §5.1 | 1 |
| 10 Roles + permission matrix JSONB + RBAC middleware | §3, §5.1 | 2 |
| Reference CRUD generic (subset: pack_sizes, lines_by_pack_size, dieset_by_line_pack, templates, processes, close_confirm, dept_columns) — **7 of 17 ref tables** | §8.1 | 2-3 |
| Module toggles (modules + organization_modules tables + middleware feature guard) | §10.1 | 1 |
| i18n scaffolding (next-intl config + EN keys full + PL placeholders) | §14.2 | 1 |
| Org security policies baseline (password rules + session timeout enforcement — **NO MFA UI yet**) | §5.7, §14.1 | 1 |

**Total: 7-9 sesji.** Excludes: schema wizard UI (→ 02-SET-b), rule registry UI (→ 02-SET-c), L2 dept split/merge (→ 02-SET-d), D365 Constants admin (→ 02-SET-e), EmailConfig/Resend (→ 02-SET-e), onboarding wizard (→ 02-SET-e), MFA enrollment (→ 02-SET-e), remaining 10 ref tables not needed by 01-NPD-a (→ 02-SET-d).

### Phase E-2+: 01-NPD-a..e parallel with 02-SETTINGS-b..e

Once 02-SET-a complete, 01-NPD-a starts. Concurrent agent tracks:

- **Track A** (sequential): 01-NPD-a → -b → -c → -d → -e (~17-24 sesji)
- **Track B** (parallel with A): 02-SET-b (schema wizard) → -c (rule registry) → -d (full ref CRUD + L2) → -e (infra/D365/onboarding) (~14-17 sesji)

## Consequences

### Positive
- 01-NPD-a start unblocked at session ~22-29 (Foundation 15-20 + Settings-a 7-9) vs session ~37-40 under strict PRD order.
- Foundation infra becomes real build target with own backlog — no more "minimum scope" ambiguity.
- Parallel Track A+B after 02-SET-a saves ~14-17 calendar sesji (wall clock).
- Clean separation: Foundation = runtime primitives, Settings = admin UI on top.
- ADR-028/029/031 runtime implementations live in Foundation; admin wizards live in Settings-b/c/d — unambiguous ownership.

### Negative
- 00-FOUNDATION ceases to be "meta-PRD only" — needs supplementary build-spec (`00-FOUNDATION-impl-spec.md`) describing sub-modules a..i with ACs. Created in Phase E kickoff session.
- 02-SETTINGS sub-module boundaries shift vs PRD v3.3 original (-a..e). Old -a was "admin foundation full", new -a is narrow carveout. PRD §16.2 build sequence needs addendum note (not rewrite).
- Cross-PRD consistency: 02-SET-b..e must not assume features that moved to 00-FOUNDATION (e.g., outbox runtime was §10 in 02-SET; now §10 is admin toggle UI only — runtime lives in 00-f).

### Neutral
- Session total stays ~same (~37-45 impl sesji for Foundation+Settings+NPD) — benefit is **parallelization**, not reduction.
- If parallel agents not available (solo dev), strict sequential still works — just slower, no regression vs current plan.

## Automated testing implications

Foundation sub-module 00-i delivers:
- Vitest unit harness + coverage
- Playwright E2E harness + auth fixture
- Seed data runner (Forza baseline + synthetic multi-tenant)
- CI green gate (PR blocked on fail)
- Preview deploy per PR

**Every subsequent module story** (starting 00-a) must ship with tests. No story marked done without Vitest + Playwright coverage for ACs. `vba-e2e-tester`-pattern skill adapted for Next.js will automate most manual checks. Manual testing budget → reserve for UX/flow validation only.

## Rejected alternatives

1. **Strict PRD order (01-NPD → 02-SET → 03-TECH)** — impossible per dependency analysis.
2. **Full 02-SETTINGS before 01-NPD (Strategy A)** — 22-27 sesji before first UI visible. Rejected: too slow to user feedback loop for primary module.
3. **Inline Foundation infra into 01-NPD-a** — couples infra to one module, regression risk every time infra changes. Rejected.
4. **Outbox/RLS/Audit as 02-SETTINGS-a subscope** (Explore agent original proposal) — mixes runtime infra (universal) with admin UI (config). Rejected: runtime primitives belong in Foundation per ADR-029 / R1 / R3.

## Action items

1. Create `_meta/specs/00-FOUNDATION-impl-spec.md` describing sub-modules 00-a..i with ACs, dependencies, seed data needs (1 session, next step).
2. Create `_meta/specs/02-SETTINGS-a-carveout-spec.md` defining narrow scope + deferred features pointer to -b..e (1 session, same Phase E kickoff).
3. Update `00-FOUNDATION-PRD.md` §4.2 build order table per Phase E kickoff plan diff (bundled with point 1, tiny PRD amendment).
4. Update `02-SETTINGS-PRD.md` §16.2 with addendum note "sub-module -a narrowed per ADR-032; deferred features land in -b..e" (no rewrite).
5. Run `epic-writing` skill on 00-FOUNDATION-impl-spec → ~9 epics → `story-writing` per epic → ~50-60 stories in pipeline.log.md.
6. Run `epic-writing` on 02-SETTINGS-a-carveout-spec → ~5-7 epics → ~25-35 stories.
7. Phase E session 1 executes 00-a (scaffold) after action items 1-6 complete.

## References

- `_meta/plans/2026-04-22-phase-e-kickoff-plan.md` — full NPD-a dependency matrix (10 hard + 5 soft blockers), parallel execution plan, test milestones, agent dispatch strategy.
- `00-FOUNDATION-PRD.md` v3.0 §4.2 (current build order, to be amended).
- `02-SETTINGS-PRD.md` v3.3 §16.2 (current sub-module breakdown, addendum needed).
- `01-NPD-PRD.md` v3.0 §6.1 cascades (5 cascade chains drive Reference table carveout).

## Amendment 2026-04-23 — PWA + IndexedDB in Phase E-0 scope

User Decision #3 (post-ADR-032, captured in `_meta/plans/2026-04-22-foundation-merged-plan.md` frontmatter): **PWA + IndexedDB promoted into Phase E-0 Foundation scope** as atomic tasks `T-00a-008` (Workbox service worker registration) and `T-00a-009` (IndexedDB sync queue).

This extends but does NOT supersede the Foundation vs Settings split declared in this ADR:
- PWA service worker + IndexedDB = **runtime infrastructure** → lives in Foundation E-0 (correct per ADR-032 principle)
- Per-tenant PWA theming (splash screens, icons, install prompts styled per org) = **configuration surface** → deferred to Settings E-1 or later (pointer only; no task yet)

No contract change to Phase E-0 → E-1 → E-2 sequencing. PWA tasks land cleanly within 00-a sub-module (monorepo + Next.js scaffold). See `2026-04-22-foundation-merged-plan.md` for task definitions.
