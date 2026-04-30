---
title: create-task-asp skill — design blueprint
date: 2026-04-23
status: blueprint (skill to be written post context-reset)
skill_path: ~/.claude/skills/create-task-asp/SKILL.md
validator_path: ~/.claude/skills/create-task-asp/validator.md
---

# Skill: create-task-asp

## Cel
Skill do generowania **atomic task decomposition** w dokładnym schemacie §4 z `atomic-task-decomposition-guide.md`, z obowiązkowym `prototype_ref` dla T3 UI tasks i locked D1-D12 stack decisions.

Zastępuje i rozszerza koncepcję `prd-decomposition-hybrid`. Nazwa ASP = Atomic Story with Properties.

## Kiedy triggerować
- "zrób taski dla [moduł/feature]"
- "rozłóż [X] na atomic tasks"
- "create tasks for [feature]"
- "generate backlog for [module]"

## Inputs (skill musi zebrać przed generacją)

1. **PRD source** — która sekcja PRD (np. §3 NPD-a, §8.1 Settings reference tables)
2. **Sub-module ID** — do naming convention (np. `02SETa`, `01NPDa`)
3. **Phase** — E-0, E-1, E-2 etc.
4. **Prototype refs available** — czy moduł ma coverage w master-index.json (510 entries)
5. **Parent tasks done** — jakie upstream tasks już istnieją (do dependencies)

## Exact task schema (§4 template)

```markdown
## T-<sub-module>-<NNN> — <short title>

**Type:** T1-schema | T2-api | T3-ui | T4-wiring+test | T5-seed
**Context budget:** ~<N>k tokens
**Est time:** <X> min
**Parent feature:** <feature-id>
**Agent:** any | frontend-specialist | backend-specialist | test-specialist
**Status:** pending

### Dependencies
- **Upstream (must be done first):** [T-XXX, T-YYY]
- **Downstream (will consume this):** [T-ZZZ]
- **Parallel (can run concurrently):** [T-AAA, T-BBB]

### GIVEN / WHEN / THEN
**GIVEN** <state preconditions>
**WHEN** <trigger / action>
**THEN** <expected outcomes, observable>

### Implementation (max 5 sub-steps)
1. <step>
2. <step>
3. <step>
4. <step>
5. <step — optional>

### Files
- **Create:** `path/to/new.ts`, `path/to/other.tsx`
- **Modify:** `path/to/existing.ts`

### Test gate
- **Unit:** `vitest path/to/thing.test.ts` — covers: <specific behavior>
- **Integration:** `vitest path/to/thing.integration.test.ts` — covers: <DB / RLS / trigger behavior>
- **E2E:** `playwright e2e/flow.spec.ts` — covers: <user flow>
- **CI gate:** `npm run test:smoke` green

### Rollback
<one-line how to revert>

### Notes (optional)
<gotchas, edge cases>
```

## T3 UI task EXTRA field (MANDATORY)

T3 tasks muszą zawierać po `**Type:** T3-ui`:

```markdown
**Prototype ref:** `<label>` (`design/Monopilot Design System/<module>/`)
  - component_type: <value from master-index>
  - ui_pattern: <value>
  - shadcn_equivalent: <value>
  - estimated_translation_time_min: <N>
```

Label pochodzi z `_meta/prototype-labels/master-index.json`. Jeśli brak coverage → `**Prototype ref:** none (no prototype exists for this component)`.

## Stack decisions (D1-D12) — LOCKED, wbudowane w skill

Każdy task musi być zgodny z:
- T1: Drizzle migrations (nie Prisma, nie raw SQL)
- T2: Server Actions lub Next.js route handlers; RBAC guard używa `permissions.enum.ts`; audit emit; outbox event via `insertOutboxEvent`
- T3: shadcn/Radix primitives; React Hook Form + Zod resolver
- T4: Vitest unit/integration; Playwright E2E; Supabase local test DB (nie mocker)
- T5: Drizzle typed seed + factory functions; named snapshots

## Naming convention

`T-<sub-module>-<NNN>` gdzie:
- sub-module: `00a`..`00i`, `02SETa`..`02SETe`, `01NPDa`..`01NPDe`, `03TECa` itd.
- NNN: 3-digit od 001 per sub-module
- Enum locks mają suffix E: `T-00b-E01`, `T-00b-E02`, `T-00b-E03`, `T-00b-E04`

## Parallelization rules

- Tasks dzielące pliki do `Modify` → NIE parallel
- Tasks tylko `Create` różnych plików → OK parallel
- Architect enum locks (T-00b-E01..E04) muszą być done przed dispatch jakiegokolwiek downstream

## Output format

Skill generuje:
1. Lista tasków w §4 schema markdown (do wklejenia do pliku np. `_meta/plans/2026-04-23-e1-settings-a-tasks.md`)
2. Dependency graph (markdown table: ID | Upstream | Parallel)
3. Parallel dispatch plan (które grupy mogą lecieć równolegle)
4. PRD coverage check (lista sekcji PRD → covered/not covered)

## Validator (osobny plik validator.md)

Validator sprawdza każdy task:
- [ ] ID format: `T-<module>-<NNN>` regex `^T-[a-z0-9]+-\d{3}[a-z]?$`
- [ ] Type: jeden z T1/T2/T3/T4/T5
- [ ] Context budget: podany i ≤100k
- [ ] GIVEN/WHEN/THEN: wszystkie 3 obecne
- [ ] Implementation: ≥1 i ≤5 kroków
- [ ] Files: sekcja Create lub Modify obecna
- [ ] Test gate: CI gate wymieniony
- [ ] Rollback: obecny, jedna linia
- [ ] T3 tasks: prototype_ref obecny
- [ ] Brak duplikatów ID w danym pliku
- [ ] Dependencies: upstream/downstream/parallel wszystkie wymienione (mogą być [])

## Audit istniejących tasków (95 Foundation tasks)

Plik `_meta/plans/2026-04-22-foundation-merged-plan.md` zawiera 95 tasków.
Skill przy wywołaniu z flagą `--validate` sprawdza te taski przeciw checkliście validatora.

## Przykład wywołania

User: "zrób taski dla 02-SETTINGS-a orgs/users CRUD"
→ Skill czyta 02-SETTINGS-PRD.md §3 (orgs) + §5.1 (users)
→ Czyta master-index.json dla labels z modułu `settings`
→ Generuje T-02SETa-001 (T1-schema), T-02SETa-002 (T2-api create), T-02SETa-003 (T2-api update/delete), T-02SETa-004 (T3-ui z prototype_ref), T-02SETa-005 (T4-wiring+test)
→ Każdy ma pełny §4 schema

---

## WAŻNE: Co różni create-task-asp od prd-decomposition-hybrid

| prd-decomposition-hybrid | create-task-asp |
|---|---|
| Generował feature-level tasks | Generuje TYLKO atomic tasks (T1-T5) |
| Brak GIVEN/WHEN/THEN | GIVEN/WHEN/THEN mandatory |
| Brak prototype_ref | T3 UI: prototype_ref mandatory |
| Brak stack constraints | D1-D12 locked, stack wbudowany |
| Brak validatora | Validator jako osobny check |
| Output był kanban cards | Output jest §4 markdown schema |
