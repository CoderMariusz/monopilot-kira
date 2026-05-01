#!/usr/bin/env python3
"""Generator: emits manifest.json + coverage.md + tasks/T-NNN.json for 00-FOUNDATION-PRD.md."""
import json
import pathlib
from datetime import datetime, timezone

ROOT = "/Users/mariuszkrawczyk/Projects/monopilot-kira"
OUT = pathlib.Path(ROOT) / "_meta" / "atomic-tasks" / "00-foundation"
TASKS_DIR = OUT / "tasks"
TASKS_DIR.mkdir(parents=True, exist_ok=True)
SOURCE_PRD = "00-FOUNDATION-PRD.md"

CHECKPOINT = {
    "required_checkpoints": ["RED", "GREEN", "REVIEW", "CLOSEOUT"],
    "closeout_requires": [
        "changed_files",
        "test_commands_and_results",
        "acceptance_criteria_status",
        "deviations_from_prd",
        "git_status",
    ],
}
ROUTING = {
    "red": "hermes_gpt55",
    "implementation": "hermes_gpt55",
    "review": "opus_if_high_risk_or_ui_or_architecture",
    "close": "spark_low_risk_else_opus",
}


def task(
    tid,
    title,
    *,
    category,
    subcategory,
    task_type,
    parent_feature,
    priority,
    prd_refs,
    description,
    details,
    scope_files,
    out_of_scope,
    dependencies,
    parallel_safe_with,
    acceptance_criteria,
    test_strategy,
    risk_red_lines,
    skills,
    context_budget="40k",
    estimated_effort="1-3h",
    max_attempts=3,
    prompt=None,
):
    full_title = f"{tid} — {title}"
    if prompt is None:
        prompt = build_prompt(
            tid,
            title,
            description,
            details,
            scope_files,
            acceptance_criteria,
            test_strategy,
            prd_refs,
            risk_red_lines,
            dependencies,
        )
    payload = {
        "title": full_title,
        "prompt": prompt,
        "labels": ["prd", category, subcategory, task_type],
        "priority": priority,
        "max_attempts": max_attempts,
        "pipeline_name": "kira_dev",
        "pipeline_inputs": {
            "root_path": ROOT,
            "prd_task_id": tid,
            "source_prd": SOURCE_PRD,
            "prd_refs": prd_refs,
            "category": category,
            "subcategory": subcategory,
            "task_type": task_type,
            "parent_feature": parent_feature,
            "context_budget": context_budget,
            "estimated_effort": estimated_effort,
            "description": description,
            "details": details,
            "scope_files": scope_files,
            "out_of_scope": out_of_scope,
            "dependencies": dependencies,
            "parallel_safe_with": parallel_safe_with,
            "acceptance_criteria": acceptance_criteria,
            "test_strategy": test_strategy,
            "risk_red_lines": risk_red_lines,
            "skills": skills,
            "checkpoint_policy": CHECKPOINT,
            "routing_hints": ROUTING,
        },
    }
    (TASKS_DIR / f"{tid}.json").write_text(json.dumps(payload, indent=2) + "\n")
    return tid


def build_prompt(tid, title, description, details, scope_files, ac, ts, refs, risks, deps):
    lines = [
        f"# {tid} — {title}",
        "",
        f"PRD: `{SOURCE_PRD}` — sections: {', '.join(refs)}",
        f"Project root: `{ROOT}`",
        "",
        "## Goal",
        description,
        "",
        "## Implementation contract",
        details,
        "",
        "## Files (scope)",
    ]
    for f in scope_files:
        lines.append(f"- {f}")
    lines += ["", "## Acceptance criteria"]
    for i, c in enumerate(ac, 1):
        lines.append(f"{i}. {c}")
    lines += ["", "## Test strategy"]
    for s in ts:
        lines.append(f"- {s}")
    lines += ["", "## Risk red lines"]
    for r in risks:
        lines.append(f"- {r}")
    if deps:
        lines += ["", "## Dependencies (must be complete first)"]
        for d in deps:
            lines.append(f"- {d}")
    lines += [
        "",
        "## Closeout evidence",
        "Provide: changed_files, test_commands_and_results, acceptance_criteria_status (per AC), deviations_from_prd, git_status. Use the test-driven-development skill (RED test before implementation) and requesting-code-review at GREEN.",
    ]
    return "\n".join(lines)


# --- Common skills bundles ---
SKILLS_TDD = ["test-driven-development", "requesting-code-review"]
SKILLS_TDD_VERIFY = ["test-driven-development", "verification-before-completion", "requesting-code-review"]
SKILLS_DOCS = ["writing-plans", "requesting-code-review"]

OOS_GENERIC = [
    "Do not modify files outside the scope_files list",
    "Do not introduce business logic from later module PRDs (01-NPD, 02-SETTINGS, etc.)",
]

# --- Tasks ---

# T-001: Monorepo bootstrap
task(
    "T-001",
    "Monorepo bootstrap (pnpm workspace + Next.js App Router + TypeScript strict)",
    category="infra",
    subcategory="scaffold",
    task_type="T4-wiring-test",
    parent_feature="00-FOUNDATION-impl-a scaffolding",
    priority=50,
    prd_refs=["§5", "§4.2-AMENDMENT"],
    description="Bootstrap pnpm monorepo with apps/web (Next.js 15 App Router, RSC, TypeScript 5 strict) and packages/ workspace ready to host db/ui/rbac/outbox/i18n.",
    details=(
        "Create root pnpm-workspace.yaml listing apps/* and packages/*. Initialise apps/web with Next.js 15 App Router (TypeScript strict, eslint-config-next, tailwind preset). "
        "Add tsconfig base with paths '@monopilot/*' resolving to packages. Add Vitest config and a single smoke test that boots Next.js dev server in test mode and asserts GET / returns 200. Add Playwright skeleton config (no specs yet). "
        "Add CI script 'pnpm build && pnpm test:smoke && pnpm lint'."
    ),
    scope_files=[
        "pnpm-workspace.yaml [create]",
        "package.json [create]",
        "tsconfig.base.json [create]",
        "apps/web/package.json [create]",
        "apps/web/next.config.mjs [create]",
        "apps/web/tsconfig.json [create]",
        "apps/web/app/layout.tsx [create]",
        "apps/web/app/page.tsx [create]",
        "apps/web/app/__tests__/smoke.test.ts [create]",
        "vitest.config.ts [create]",
        "playwright.config.ts [create]",
    ],
    out_of_scope=OOS_GENERIC + ["Do not create packages/db, packages/ui, packages/rbac yet (separate tasks)"],
    dependencies=[],
    parallel_safe_with=[],
    acceptance_criteria=[
        "Given a fresh checkout, when 'pnpm install' runs, then it completes without errors and pnpm lists apps/web plus the workspace",
        "Given the workspace is installed, when 'pnpm --filter web dev' starts and 'pnpm test:smoke' runs against it, then the smoke test asserts GET / returns HTTP 200",
        "Given TypeScript strict is enabled, when 'pnpm --filter web typecheck' runs, then it exits 0 with zero errors",
    ],
    test_strategy=[
        "RED: write apps/web/app/__tests__/smoke.test.ts asserting GET / returns 200 before page.tsx exists",
        "Run 'pnpm install && pnpm --filter web build && pnpm test:smoke' and capture output",
    ],
    risk_red_lines=[
        "Do not pin Node version below 20",
        "Do not disable TypeScript strict mode",
        "Do not commit node_modules",
    ],
    skills=SKILLS_TDD,
    context_budget="35k",
    estimated_effort="1-2h",
)

# T-002: Drizzle setup + Postgres dev wiring
task(
    "T-002",
    "Drizzle ORM + Postgres 16 dev wiring (packages/db scaffold)",
    category="data",
    subcategory="scaffold",
    task_type="T1-schema",
    parent_feature="00-FOUNDATION-impl-d DB scaffold",
    priority=50,
    prd_refs=["§5", "§5.Backend"],
    description="Create packages/db workspace with Drizzle ORM, drizzle-kit migration runner, and Postgres 16 connection helpers. No business tables yet — only the migration toolchain.",
    details=(
        "Create packages/db/package.json with drizzle-orm and drizzle-kit. Add packages/db/drizzle.config.ts pointing to packages/db/migrations and packages/db/schema. "
        "Add lib/db/client.ts exporting a typed Drizzle client constructed from process.env.DATABASE_URL. Add packages/db/scripts/migrate.ts running drizzle-kit push. "
        "Add a vitest integration test that connects to a Postgres docker container, runs zero migrations, and asserts SELECT 1 returns 1."
    ),
    scope_files=[
        "packages/db/package.json [create]",
        "packages/db/drizzle.config.ts [create]",
        "packages/db/schema/index.ts [create]",
        "packages/db/migrations/.gitkeep [create]",
        "packages/db/lib/client.ts [create]",
        "packages/db/scripts/migrate.ts [create]",
        "packages/db/__tests__/connection.integration.test.ts [create]",
    ],
    out_of_scope=OOS_GENERIC + ["No business tables in this task — those are T-003 onward"],
    dependencies=["T-001"],
    parallel_safe_with=[],
    acceptance_criteria=[
        "Given a Postgres 16 container is running, when the integration test connects via the Drizzle client, then SELECT 1 returns 1 and the client closes cleanly",
        "Given drizzle-kit is configured, when 'pnpm --filter @monopilot/db migrate' runs against an empty database, then it reports zero pending migrations and exits 0",
    ],
    test_strategy=[
        "RED: write packages/db/__tests__/connection.integration.test.ts asserting SELECT 1 = 1 before lib/client.ts exists",
        "Run 'pnpm --filter @monopilot/db test' against a docker compose Postgres 16",
    ],
    risk_red_lines=[
        "Do not commit DATABASE_URL with real credentials",
        "Do not use a non-Postgres dialect",
    ],
    skills=SKILLS_TDD,
    context_budget="35k",
    estimated_effort="1-2h",
)

# T-003: events.enum.ts lock
task(
    "T-003",
    "events.enum.ts source-of-truth lock with fa.* / brief.* / org.* / lp.* / wo.* / quality.* / shipment.* prefixes",
    category="infra",
    subcategory="enum-lock",
    task_type="T1-schema",
    parent_feature="cross-cutting enum locks",
    priority=50,
    prd_refs=["§10"],
    description="Lock outbox event_type strings as a single TypeScript const map. Foundation aggregates only — module-specific events added by later tasks.",
    details=(
        "Create packages/outbox/src/events.enum.ts exporting EventType const object. Foundation entries: org.created, user.invited, role.assigned, audit.recorded, fa.created, fa.allergens_changed, brief.created, lp.received, wo.ready, quality.recorded, shipment.created. "
        "Format regex enforced: ^[a-z]+(\\.[a-z_]+)+$. Export ALL_EVENTS readonly array. Add JSDoc comment naming aggregate prefix per §10. Add CODEOWNERS entry blocking modification without architect review. "
        "fa.* is canonical for the NPD finished-article aggregate even after the ADR-034 product table rename — assert this in a test."
    ),
    scope_files=[
        "packages/outbox/src/events.enum.ts [create]",
        "packages/outbox/src/__tests__/events.test.ts [create]",
        "CODEOWNERS [modify]",
    ],
    out_of_scope=OOS_GENERIC + ["Do not add events for unimplemented modules (no scanner.*, oee.*, finance.* yet)"],
    dependencies=["T-001"],
    parallel_safe_with=["T-004", "T-005"],
    acceptance_criteria=[
        "Given the events.enum.ts file is loaded, when ALL_EVENTS is iterated, then no duplicate values exist and every value matches /^[a-z]+(\\.[a-z_]+)+$/",
        "Given fa.* aggregate is canonical per §10, when the test asserts EventType.FA_CREATED === 'fa.created' and EventType.FA_ALLERGENS_CHANGED === 'fa.allergens_changed', then both pass",
        "Given CODEOWNERS contains 'packages/outbox/src/events.enum.ts @architect', when 'git check-attr' is run, then ownership is reported",
    ],
    test_strategy=[
        "RED: write packages/outbox/src/__tests__/events.test.ts asserting no dupes + format regex + canonical fa.* values before events.enum.ts exists",
        "Run 'pnpm --filter @monopilot/outbox test'",
    ],
    risk_red_lines=[
        "Do not introduce free-form event_type strings outside this enum",
        "Do not collapse fa.* and product.* — they are reserved for different aggregates",
    ],
    skills=SKILLS_TDD,
    context_budget="25k",
    estimated_effort="0.5-1h",
)

# T-004: permissions.enum.ts lock
task(
    "T-004",
    "permissions.enum.ts source-of-truth lock with org.access.admin / org.schema.admin SoD pair",
    category="auth",
    subcategory="enum-lock",
    task_type="T1-schema",
    parent_feature="cross-cutting enum locks",
    priority=50,
    prd_refs=["§3", "§13"],
    description="Lock RBAC permission strings. Includes the F-U4 ACCESS/ADMIN pillar split: org.access.admin and org.schema.admin must both exist and be mutually exclusive at grant time.",
    details=(
        "Create packages/rbac/src/permissions.enum.ts exporting Permission const map: org.access.admin, org.schema.admin, org.scim.write, fa.create, fa.edit, brief.convert_to_fa, ref.edit, audit.read, outbox.admin, impersonate.tenant. "
        "Export ALL_PERMISSIONS readonly array and SOD_EXCLUSIVE_PAIRS = [['org.access.admin','org.schema.admin']] enforcing SOC 2 CC6.3 separation-of-duties. Format regex ^[a-z]+(\\.[a-z_]+)+$. Add CODEOWNERS lock."
    ),
    scope_files=[
        "packages/rbac/src/permissions.enum.ts [create]",
        "packages/rbac/src/__tests__/permissions.test.ts [create]",
        "CODEOWNERS [modify]",
    ],
    out_of_scope=OOS_GENERIC + ["Do not implement RBAC enforcement in this task — only the enum (T-014 wires it)"],
    dependencies=["T-001"],
    parallel_safe_with=["T-003", "T-005"],
    acceptance_criteria=[
        "Given the permissions enum is loaded, when ALL_PERMISSIONS is iterated, then every value matches the dot-format regex and there are no duplicates",
        "Given SOC 2 CC6.3 separation-of-duties is required (PRD §3 F-U4), when SOD_EXCLUSIVE_PAIRS is inspected, then it contains exactly the tuple ['org.access.admin','org.schema.admin']",
        "Given org.access.admin and org.schema.admin must both exist, when both keys are read, then they resolve to those exact strings",
    ],
    test_strategy=[
        "RED: write packages/rbac/src/__tests__/permissions.test.ts asserting SoD pair and format regex before permissions.enum.ts exists",
        "Run 'pnpm --filter @monopilot/rbac test'",
    ],
    risk_red_lines=[
        "Do not let a single role grant both org.access.admin and org.schema.admin without the dual-control flag (validation will be added in T-014; the enum constant must already encode the pair)",
    ],
    skills=SKILLS_TDD,
    context_budget="25k",
    estimated_effort="0.5-1h",
)

# T-005: marker discipline + module map docs
task(
    "T-005",
    "Marker discipline ADR + 15-module registry seed file",
    category="docs",
    subcategory="adr",
    task_type="docs",
    parent_feature="governance",
    priority=80,
    prd_refs=["§1", "§2", "§4"],
    description="Codify the four marker tags ([UNIVERSAL], [APEX-CONFIG], [EVOLVING], [LEGACY-D365]) as ADR-035 and seed the 15-module registry as JSON consumed by 02-SETTINGS later.",
    details=(
        "Write _foundation/decisions/ADR-035-marker-discipline.md documenting the four markers, when each is used, and the 'no fragment without a marker' rule (PRD §2). "
        "Create _foundation/registry/modules.json with the 15-row table from PRD §4.3 (id, slug, phase, build_order, file, dependencies). Add a CI script scripts/check-markers.mjs that fails when a PRD/ADR file in _foundation or root has a heading lacking a marker tag (allow-list for executive summary)."
    ),
    scope_files=[
        "_foundation/decisions/ADR-035-marker-discipline.md [create]",
        "_foundation/registry/modules.json [create]",
        "scripts/check-markers.mjs [create]",
    ],
    out_of_scope=OOS_GENERIC + ["Do not modify PRD content"],
    dependencies=[],
    parallel_safe_with=["T-003", "T-004"],
    acceptance_criteria=[
        "Given _foundation/registry/modules.json is loaded, when parsed as JSON, then it contains exactly 15 entries with ids 00..15 and matches the PRD §4.3 dependencies column",
        "Given ADR-035 exists, when the CI script scripts/check-markers.mjs runs against _foundation/decisions, then it exits 0 (no missing markers)",
    ],
    test_strategy=[
        "Run 'node scripts/check-markers.mjs' and capture exit code",
        "Run 'jq length _foundation/registry/modules.json' and assert == 15",
    ],
    risk_red_lines=[
        "Do not invent module slugs not in PRD §4.3",
    ],
    skills=SKILLS_DOCS,
    context_budget="25k",
    estimated_effort="0.5-1h",
)

# T-006: tenants + organizations + users baseline schema (R13 cols)
task(
    "T-006",
    "Baseline schema migration — tenants, organizations, users with R13 identity columns",
    category="data",
    subcategory="migration",
    task_type="T1-schema",
    parent_feature="00-FOUNDATION-impl-d DB+RLS",
    priority=80,
    prd_refs=["§8", "§10"],
    description="Drizzle migration 001 creating tenants, organizations, users tables. Every business table carries the §10 R13 identity column block.",
    details=(
        "Author packages/db/schema/baseline.ts with three Drizzle tables: tenants (id UUID PK, name TEXT, region_cluster TEXT NOT NULL CHECK IN ('eu','us'), data_plane_url TEXT), organizations (id PK, tenant_id FK, name, industry_code TEXT CHECK IN ('bakery','pharma','fmcg','generic')), users (id PK, tenant_id FK, email CITEXT UNIQUE per tenant, display_name). "
        "All tables MUST include §10 R13 columns: id UUID DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, created_at TIMESTAMPTZ DEFAULT now(), created_by_user UUID, created_by_device TEXT, app_version TEXT, model_prediction_id UUID NULL, epcis_event_id UUID NULL, external_id TEXT, schema_version INT NOT NULL DEFAULT 1. "
        "Generate packages/db/migrations/001-baseline.sql via drizzle-kit. Integration test asserts INFORMATION_SCHEMA shows every R13 column on each table."
    ),
    scope_files=[
        "packages/db/schema/baseline.ts [create]",
        "packages/db/migrations/001-baseline.sql [create]",
        "packages/db/__tests__/baseline.integration.test.ts [create]",
    ],
    out_of_scope=OOS_GENERIC + ["No RLS policies in this task (T-007). No roles or RBAC tables (T-014)."],
    dependencies=["T-002"],
    parallel_safe_with=["T-003", "T-004"],
    acceptance_criteria=[
        "Given migration 001 is applied to a fresh Postgres 16 database, when SELECT * FROM information_schema.columns WHERE table_name IN ('tenants','organizations','users') runs, then every R13 column from PRD §10 is present on every row",
        "Given organizations.industry_code has a CHECK constraint, when an INSERT with industry_code='unknown' is attempted, then it is rejected by the database",
        "Given the integration test packages/db/__tests__/baseline.integration.test.ts runs, then it asserts the §10 R13 columns array length = 10 and exits 0",
    ],
    test_strategy=[
        "RED: write packages/db/__tests__/baseline.integration.test.ts listing all R13 columns and asserting presence before baseline.ts exists",
        "Run 'pnpm --filter @monopilot/db test'",
    ],
    risk_red_lines=[
        "Do not omit any R13 column — adding them later is migration hell (PRD §10 explicit)",
        "Do not enable RLS in this migration",
    ],
    skills=SKILLS_TDD_VERIFY,
    context_budget="50k",
    estimated_effort="1-3h",
)

# T-007: RLS baseline policies
task(
    "T-007",
    "RLS baseline policies on tenants/organizations/users with LEAKPROOF SECURITY DEFINER tenant context",
    category="data",
    subcategory="security",
    task_type="T1-schema",
    parent_feature="00-FOUNDATION-impl-d DB+RLS",
    priority=80,
    prd_refs=["§5", "§8"],
    description="Enable PostgreSQL RLS on every business table. Use a LEAKPROOF SECURITY DEFINER wrapper to inject current_setting('app.tenant_id'). Tests run with an app role, never superuser.",
    details=(
        "Migration 002-rls-baseline.sql: ALTER TABLE tenants/organizations/users ENABLE ROW LEVEL SECURITY; create policy USING (tenant_id = current_setting('app.tenant_id')::uuid) WITH CHECK same. "
        "Create function app.set_tenant(uuid) SECURITY DEFINER LEAKPROOF that calls set_config('app.tenant_id', $1::text, true). Create role 'app_user' (NOSUPERUSER NOINHERIT) granted USAGE on schema and SELECT/INSERT/UPDATE on the three tables. "
        "Playwright/integration test connects as 'app_user', sets tenant A, inserts a row, switches to tenant B, attempts to read tenant A's row, and asserts zero rows returned."
    ),
    scope_files=[
        "packages/db/migrations/002-rls-baseline.sql [create]",
        "packages/db/__tests__/rls.cross-tenant.integration.test.ts [create]",
    ],
    out_of_scope=OOS_GENERIC + ["No business module tables here — only the three baseline ones from T-006"],
    dependencies=["T-006"],
    parallel_safe_with=[],
    acceptance_criteria=[
        "Given RLS is enabled on tenants/organizations/users, when 'app_user' connects with app.tenant_id set to tenant A and SELECTs a row owned by tenant B, then zero rows are returned",
        "Given the LEAKPROOF SECURITY DEFINER function app.set_tenant(uuid) exists, when pg_proc is queried, then prosecdef=true AND proleakproof=true",
        "Given a test attempts to set app.tenant_id from outside app.set_tenant, when 'app_user' tries 'SET app.tenant_id = ...' directly, then the policy still treats it as unset and returns zero rows for cross-tenant SELECT",
    ],
    test_strategy=[
        "RED: write packages/db/__tests__/rls.cross-tenant.integration.test.ts with two-tenant scenario before policies exist",
        "Run 'pnpm --filter @monopilot/db test:integration -- rls.cross-tenant'",
    ],
    risk_red_lines=[
        "Tests MUST connect as 'app_user', never as superuser (PRD §5 explicit)",
        "Do not use SECURITY DEFINER without LEAKPROOF — RLS bypass risk",
    ],
    skills=SKILLS_TDD_VERIFY,
    context_budget="50k",
    estimated_effort="1-3h",
)

# T-008: outbox_events table + worker stub
task(
    "T-008",
    "outbox_events table migration + worker stub publishing to in-memory queue",
    category="data",
    subcategory="event-bus",
    task_type="T1-schema",
    parent_feature="00-FOUNDATION-impl-e outbox",
    priority=80,
    prd_refs=["§10"],
    description="Migration 003 creating outbox_events table per §10 plus a TypeScript worker that polls unconsumed rows and publishes to a pluggable queue (in-memory adapter for tests).",
    details=(
        "Migration 003-outbox.sql creating outbox_events(id BIGSERIAL PK, tenant_id UUID NOT NULL, event_type TEXT NOT NULL, aggregate_type TEXT NOT NULL, aggregate_id UUID NOT NULL, payload JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), consumed_at TIMESTAMPTZ, app_version TEXT NOT NULL) plus the partial index on (tenant_id, created_at) WHERE consumed_at IS NULL. "
        "Implement packages/outbox/src/worker.ts with a runOnce() function that selects unconsumed rows, publishes via a Queue interface (in-memory adapter), and stamps consumed_at. event_type values must be members of EventType from T-003. Vitest E2E test inserts an outbox row, runs the worker, and asserts the in-memory queue received it and consumed_at is set."
    ),
    scope_files=[
        "packages/db/migrations/003-outbox.sql [create]",
        "packages/outbox/src/worker.ts [create]",
        "packages/outbox/src/queue.ts [create]",
        "packages/outbox/src/__tests__/worker.e2e.test.ts [create]",
    ],
    out_of_scope=OOS_GENERIC + ["Do not implement Azure Service Bus adapter (deferred per PRD §14 open item)"],
    dependencies=["T-003", "T-006"],
    parallel_safe_with=["T-007"],
    acceptance_criteria=[
        "Given outbox_events exists and a row is inserted with event_type='audit.recorded', when worker.runOnce() executes, then the in-memory queue contains exactly one message and the row's consumed_at is set",
        "Given event_type is constrained to EventType members, when an insertion uses 'invalid.event' (not in EventType), then the worker rejects publishing and the test fails fast",
        "Given the partial index on (tenant_id, created_at) WHERE consumed_at IS NULL exists, when EXPLAIN runs the unconsumed query, then it uses the index",
    ],
    test_strategy=[
        "RED: write packages/outbox/src/__tests__/worker.e2e.test.ts asserting publish + consumed_at flip before worker.ts exists",
        "Run 'pnpm --filter @monopilot/outbox test'",
    ],
    risk_red_lines=[
        "Do not lose events — publish must be at-least-once with idempotent stamping",
        "Do not publish events whose event_type is not in EventType",
    ],
    skills=SKILLS_TDD_VERIFY,
    context_budget="50k",
    estimated_effort="1-3h",
)

# T-009: audit_events table 13-field
task(
    "T-009",
    "audit_events 13-field append-only table with retention_class CHECK",
    category="data",
    subcategory="audit",
    task_type="T1-schema",
    parent_feature="00-FOUNDATION-impl-h audit",
    priority=80,
    prd_refs=["§11"],
    description="Migration 004 creating the F-U3 13-field audit_events table with append-only enforcement and retention_class enum.",
    details=(
        "Migration 004-audit.sql per PRD §11: id BIGSERIAL PK, tenant_id UUID NOT NULL, occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(), actor_user_id UUID, actor_type TEXT CHECK IN ('user','system','scim','impersonation'), impersonator_id UUID, action TEXT NOT NULL, resource_type TEXT NOT NULL, resource_id TEXT NOT NULL, before_state JSONB, after_state JSONB, ip_address INET, user_agent TEXT, request_id UUID NOT NULL, retention_class TEXT DEFAULT 'standard' CHECK IN ('security','standard','operational','ephemeral'). "
        "Create three indexes per PRD. Append-only enforcement: REVOKE UPDATE,DELETE FROM app_user; create CHECK trigger that raises when actor_type='impersonation' AND impersonator_id IS NULL. Test inserts each retention class, attempts UPDATE as app_user (must fail), and asserts impersonation guard."
    ),
    scope_files=[
        "packages/db/migrations/004-audit.sql [create]",
        "packages/db/__tests__/audit.integration.test.ts [create]",
    ],
    out_of_scope=OOS_GENERIC + ["No retention job (Glacier rotation) in this task — that is operational"],
    dependencies=["T-007"],
    parallel_safe_with=["T-008"],
    acceptance_criteria=[
        "Given audit_events exists, when information_schema is queried, then exactly the 13 PRD-listed columns plus retention_class are present and the four-value CHECK on retention_class is enforced",
        "Given app_user attempts UPDATE audit_events SET action='x' WHERE id=1, when the statement runs, then PostgreSQL rejects it with a permission or RLS error",
        "Given an INSERT with actor_type='impersonation' and impersonator_id IS NULL, when committed, then the trigger raises and the INSERT is rolled back",
    ],
    test_strategy=[
        "RED: write packages/db/__tests__/audit.integration.test.ts covering 13-field, immutability, impersonation guard before migration exists",
        "Run 'pnpm --filter @monopilot/db test:integration -- audit'",
    ],
    risk_red_lines=[
        "Append-only is non-negotiable per F-U3 — no superadmin DELETE path in this task",
        "Do not mark before_state/after_state NOT NULL — create has no before, delete has no after",
    ],
    skills=SKILLS_TDD_VERIFY,
    context_budget="50k",
    estimated_effort="1-3h",
)

# T-010: tenant_idp_config DDL
task(
    "T-010",
    "tenant_idp_config table per F-A2 with §5.x default seed values",
    category="auth",
    subcategory="schema",
    task_type="T1-schema",
    parent_feature="00-FOUNDATION-impl-f auth",
    priority=80,
    prd_refs=["§8.x", "§5.x", "§13"],
    description="Migration 005 creating tenant_idp_config exactly as specified in PRD §8.x DDL block, plus a seed function that creates a row with §5.x + F-U5 defaults whenever a tenant is inserted.",
    details=(
        "Migration 005-tenant-idp-config.sql copying the verbatim DDL from PRD §8.x: provider_type CHECK IN ('saml','oidc','password','magic'), idle_timeout_min INT DEFAULT 60, session_max_h INT DEFAULT 8, mfa_required BOOLEAN DEFAULT true, mfa_required_for_roles TEXT[] DEFAULT ARRAY['org.access.admin','org.schema.admin'], mfa_allowed_methods TEXT[] DEFAULT ARRAY['totp'], password_complexity TEXT DEFAULT 'strong'. "
        "Add a trigger AFTER INSERT ON tenants that inserts a default tenant_idp_config row. Test inserts a tenant and asserts the row exists with the F-U5 defaults (§13 success criteria)."
    ),
    scope_files=[
        "packages/db/migrations/005-tenant-idp-config.sql [create]",
        "packages/db/__tests__/tenant-idp-config.integration.test.ts [create]",
    ],
    out_of_scope=OOS_GENERIC + ["No SAML/SCIM endpoint wiring (T-011, T-012)"],
    dependencies=["T-006"],
    parallel_safe_with=["T-007", "T-008", "T-009"],
    acceptance_criteria=[
        "Given a new tenant is inserted, when the AFTER INSERT trigger fires, then exactly one tenant_idp_config row exists with provider_type='password', idle_timeout_min=60, session_max_h=8, mfa_required=true, mfa_required_for_roles={'org.access.admin','org.schema.admin'}, password_complexity='strong'",
        "Given an UPDATE attempts to set provider_type='ldap', when the statement runs, then the CHECK constraint rejects it",
        "Given the integration test runs, then it asserts every default value listed in PRD §13 F-U5 is present on the seeded row",
    ],
    test_strategy=[
        "RED: write packages/db/__tests__/tenant-idp-config.integration.test.ts asserting the F-U5 defaults before the migration exists",
        "Run 'pnpm --filter @monopilot/db test:integration -- tenant-idp-config'",
    ],
    risk_red_lines=[
        "MFA-by-default for both org.access.admin and org.schema.admin is a F-U5 success criterion — do not relax it",
    ],
    skills=SKILLS_TDD_VERIFY,
    context_budget="40k",
    estimated_effort="1-2h",
)

# T-011: GoTrue/Supabase auth wiring + helpers
task(
    "T-011",
    "Supabase Auth (GoTrue) wiring with @supabase/auth-helpers-nextjs and 15-min access / 60-min idle",
    category="auth",
    subcategory="identity",
    task_type="T2-api",
    parent_feature="00-FOUNDATION-impl-f auth",
    priority=80,
    prd_refs=["§5.x"],
    description="Configure Supabase Auth as the primary IdP per §5.x: 15-min access token, rotating refresh, 60-min idle, 8-h absolute, magic-link 7-day TTL.",
    details=(
        "Add @supabase/supabase-js and @supabase/auth-helpers-nextjs to apps/web. Create lib/auth/supabase-server.ts and lib/auth/supabase-browser.ts factories. Configure access TTL=15min, refresh rotation enabled, idle=60min (read from tenant_idp_config), session_max=8h. "
        "Implement Server Action signInWithMagicLink(email) that generates a signed 7-day TTL token. Add middleware.ts validating the session JWT and setting app.tenant_id via app.set_tenant(uuid) (T-007 wrapper). Vitest unit tests on the helpers with a mocked Supabase client. Playwright E2E covering the magic-link round-trip against a Supabase local instance."
    ),
    scope_files=[
        "apps/web/lib/auth/supabase-server.ts [create]",
        "apps/web/lib/auth/supabase-browser.ts [create]",
        "apps/web/middleware.ts [create]",
        "apps/web/app/(auth)/actions.ts [create]",
        "apps/web/__tests__/auth/magic-link.e2e.test.ts [create]",
        "apps/web/package.json [modify]",
    ],
    out_of_scope=OOS_GENERIC + ["No SAML in this task (T-012). No SCIM (T-013). No TOTP MFA (T-015)."],
    dependencies=["T-001", "T-010"],
    parallel_safe_with=["T-007", "T-008", "T-009"],
    acceptance_criteria=[
        "Given a Supabase local instance is running, when signInWithMagicLink('user@example.com') is called and the resulting token is consumed within 7 days, then a session is established and the access token TTL header is 15 minutes",
        "Given a signed-in user has been idle 61 minutes, when the next request hits middleware.ts, then it returns 401 and forces re-authentication",
        "Given a successful sign-in, when the request reaches a server action, then current_setting('app.tenant_id') resolves to the user's tenant UUID (set via app.set_tenant)",
    ],
    test_strategy=[
        "RED: write apps/web/__tests__/auth/magic-link.e2e.test.ts asserting the 15-min/60-min/8-h windows before middleware.ts exists",
        "Run 'pnpm --filter web test:e2e -- magic-link'",
    ],
    risk_red_lines=[
        "Do not store JWT secrets in the repo",
        "Do not bypass app.set_tenant in middleware — RLS depends on it",
    ],
    skills=SKILLS_TDD_VERIFY,
    context_budget="60k",
    estimated_effort="2-3h",
)

# T-012: SAML via boxyhq
task(
    "T-012",
    "SAML 2.0 SP via @boxyhq/saml-jackson with /api/auth/saml/{login,callback,logout,metadata} routes",
    category="auth",
    subcategory="federation",
    task_type="T2-api",
    parent_feature="00-FOUNDATION-impl-f auth",
    priority=80,
    prd_refs=["§5.x", "§8.x"],
    description="Wire @boxyhq/saml-jackson as the SAML SP. Each tenant maps to one IdP via tenant_idp_config (metadata_url, entity_id, x509_cert). JIT provisioning gated by tenant_idp_config.jit_provisioning.",
    details=(
        "Install @boxyhq/saml-jackson. Create apps/web/app/api/auth/saml/login/route.ts, callback/route.ts, logout/route.ts, metadata/route.ts using the Jackson SDK. "
        "Configure Jackson with the Drizzle Postgres adapter (or its own table prefixed 'saml_'). Read tenant_idp_config row for each request to resolve metadata_url + x509_cert. On callback, if jit_provisioning=true and email is unknown, INSERT into users with the org_default_role role. Integration test uses a saml-jackson mock IdP and asserts a successful round-trip ends with a valid Supabase session."
    ),
    scope_files=[
        "apps/web/app/api/auth/saml/login/route.ts [create]",
        "apps/web/app/api/auth/saml/callback/route.ts [create]",
        "apps/web/app/api/auth/saml/logout/route.ts [create]",
        "apps/web/app/api/auth/saml/metadata/route.ts [create]",
        "apps/web/lib/auth/saml.ts [create]",
        "apps/web/__tests__/auth/saml.integration.test.ts [create]",
    ],
    out_of_scope=OOS_GENERIC + ["No OIDC in this task (deferred per §5.x)", "No UI for SAML config (lives in 02-SETTINGS)"],
    dependencies=["T-010", "T-011"],
    parallel_safe_with=["T-013", "T-015"],
    acceptance_criteria=[
        "Given a tenant has tenant_idp_config.provider_type='saml' with valid metadata, when an unauthenticated user hits /api/auth/saml/login, then they are redirected to the IdP's SSO URL with a signed AuthnRequest",
        "Given a SAML response arrives at /api/auth/saml/callback for an unknown email and jit_provisioning=true, when processed, then a users row is created with org_default_role and a Supabase session is established",
        "Given enforce_for_non_admins=true, when a non-admin tries password sign-in, then it is rejected with 403",
    ],
    test_strategy=[
        "RED: write apps/web/__tests__/auth/saml.integration.test.ts using saml-jackson's test IdP harness before the routes exist",
        "Run 'pnpm --filter web test:integration -- saml'",
    ],
    risk_red_lines=[
        "Do not skip x509 signature validation",
        "Do not provision into a tenant that didn't initiate the flow — verify tenant_id from RelayState",
    ],
    skills=SKILLS_TDD_VERIFY,
    context_budget="70k",
    estimated_effort="2-3h",
)

# T-013: SCIM 2.0
task(
    "T-013",
    "SCIM 2.0 /Users and /Groups endpoints with argon2id-hashed bearer tokens",
    category="auth",
    subcategory="provisioning",
    task_type="T2-api",
    parent_feature="00-FOUNDATION-impl-f auth",
    priority=80,
    prd_refs=["§5.x", "§8.x"],
    description="SCIM 2.0 RFC 7644 endpoints (/Users, /Groups) scoped to a single tenant. Bearer token argon2id-verified against tenant_idp_config.scim_token_hash. Soft-delete via active=false.",
    details=(
        "Create apps/web/app/api/scim/v2/Users/route.ts (GET list, POST create) plus [id]/route.ts (GET, PATCH, DELETE). Same shape for Groups. Token middleware: argon2.verify(authorization.replace('Bearer ',''), tenant_idp_config.scim_token_hash). "
        "On success, set app.tenant_id and grant request the org.scim.write permission. Soft-delete: PATCH active=false → users.deleted_at=now() and audit_events row with action='user.deactivated_via_scim'. "
        "Integration test issues a token, hits POST /Users, then GET /Users, asserts argon2id rejection of an invalid token, and asserts cross-tenant token reuse fails."
    ),
    scope_files=[
        "apps/web/app/api/scim/v2/Users/route.ts [create]",
        "apps/web/app/api/scim/v2/Users/[id]/route.ts [create]",
        "apps/web/app/api/scim/v2/Groups/route.ts [create]",
        "apps/web/lib/scim/middleware.ts [create]",
        "apps/web/__tests__/scim/users.integration.test.ts [create]",
    ],
    out_of_scope=OOS_GENERIC + ["No SCIM token issuance UI (lives in 02-SETTINGS)", "No /Schemas or /ServiceProviderConfig discovery (deferred)"],
    dependencies=["T-010", "T-011"],
    parallel_safe_with=["T-012", "T-015"],
    acceptance_criteria=[
        "Given a SCIM bearer token whose argon2id hash matches tenant_idp_config.scim_token_hash for tenant A, when POST /scim/v2/Users runs, then a user is created in tenant A and SELECT scoped to tenant B returns zero rows",
        "Given an invalid bearer token, when any SCIM route is called, then it returns 401 in <10ms (argon2 verify path) and writes an audit_events row with retention_class='security'",
        "Given a PATCH active=false arrives, when processed, then users.deleted_at is set and an audit_events row with action='user.deactivated_via_scim' is written",
    ],
    test_strategy=[
        "RED: write apps/web/__tests__/scim/users.integration.test.ts covering token verify + cross-tenant + soft-delete before routes exist",
        "Run 'pnpm --filter web test:integration -- scim'",
    ],
    risk_red_lines=[
        "Do not store SCIM tokens in plaintext anywhere",
        "Do not skip the cross-tenant guard — SCIM is a high-risk surface",
    ],
    skills=SKILLS_TDD_VERIFY,
    context_budget="60k",
    estimated_effort="2-3h",
)

# T-014: RBAC enforcement (system roles + grant guard)
task(
    "T-014",
    "RBAC enforcement library with org.access.admin / org.schema.admin SoD grant guard",
    category="auth",
    subcategory="rbac",
    task_type="T2-api",
    parent_feature="00-FOUNDATION-impl-g RBAC",
    priority=80,
    prd_refs=["§3", "§8"],
    description="Implement role/permission tables, role-grant Server Action, and a guard that refuses to grant org.schema.admin to a user who already holds org.access.admin (and vice versa) unless dual_control_required=false.",
    details=(
        "Migration 006-rbac.sql: roles(id, tenant_id, slug UNIQUE per tenant, system BOOLEAN), role_permissions(role_id, permission TEXT), user_roles(user_id, role_id). Seed two system roles per tenant: 'org.access.admin' and 'org.schema.admin'. "
        "Add packages/rbac/src/grant.ts exporting grantRole(userId, roleSlug) that throws 'sod_violation' when granting one of the SoD pair to a user already holding the other (uses SOD_EXCLUSIVE_PAIRS from T-004). "
        "Add org_security_policies(tenant_id PK, dual_control_required BOOLEAN DEFAULT true). When dual_control_required=true, second-admin approval is required (record approval token). Vitest covers the SoD violation, the dual-control approval path, and seed correctness."
    ),
    scope_files=[
        "packages/db/migrations/006-rbac.sql [create]",
        "packages/rbac/src/grant.ts [create]",
        "packages/rbac/src/__tests__/grant.test.ts [create]",
    ],
    out_of_scope=OOS_GENERIC + ["No RBAC UI (lives in 02-SETTINGS)"],
    dependencies=["T-004", "T-006"],
    parallel_safe_with=["T-008", "T-009", "T-010"],
    acceptance_criteria=[
        "Given a user holds 'org.access.admin', when grantRole(userId, 'org.schema.admin') is called and dual_control_required=true with no approval, then it throws 'sod_violation'",
        "Given dual_control_required=true and a valid second-admin approval token is supplied, when the same grant runs, then it succeeds and writes an audit_events row with action='role.assigned' retention_class='security'",
        "Given a fresh tenant is created, when seed runs, then both 'org.access.admin' and 'org.schema.admin' system roles exist for that tenant",
    ],
    test_strategy=[
        "RED: write packages/rbac/src/__tests__/grant.test.ts covering SoD violation + dual-control approval + seed before grant.ts exists",
        "Run 'pnpm --filter @monopilot/rbac test'",
    ],
    risk_red_lines=[
        "Do not allow a single admin to bypass the SoD guard by editing org_security_policies in the same transaction",
    ],
    skills=SKILLS_TDD_VERIFY,
    context_budget="50k",
    estimated_effort="2-3h",
)

# T-015: TOTP MFA via otplib + argon2 recovery codes + WebAuthn UI stub
task(
    "T-015",
    "TOTP MFA enrolment via otplib with argon2id recovery codes (WebAuthn placeholder disabled)",
    category="auth",
    subcategory="mfa",
    task_type="T2-api",
    parent_feature="00-FOUNDATION-impl-f auth",
    priority=80,
    prd_refs=["§5.x"],
    description="TOTP RFC 6238 enrolment (30-s window, 6-digit) using otplib. Recovery codes hashed argon2id (memory=64MiB, t=3, p=1), one-time use. WebAuthn surface remains disabled per Phase 3 deferral.",
    details=(
        "Create packages/auth/src/totp.ts wrapping otplib.authenticator. Add server actions enrollTotp() (returns provisioning URI + 10 recovery codes) and verifyTotp(code). Persist mfa_secrets(user_id, secret_encrypted, enrolled_at) and recovery_codes(user_id, code_hash, used_at). "
        "Encrypt secret with libsodium secretbox using a per-tenant key derived from a master env var. Recovery codes hashed argon2id and one-time-use enforced (set used_at, reject reuse). "
        "Vitest unit covers the 30-s TOTP window, recovery-code one-time-use, and asserts WebAuthn is exposed as a disabled-with-tooltip stub when called server-side."
    ),
    scope_files=[
        "packages/auth/src/totp.ts [create]",
        "packages/auth/src/recovery.ts [create]",
        "packages/db/migrations/007-mfa.sql [create]",
        "packages/auth/src/__tests__/totp.test.ts [create]",
    ],
    out_of_scope=OOS_GENERIC + ["WebAuthn enrolment is deferred to Phase 3 per §5.x — only the disabled stub is shipped here"],
    dependencies=["T-010", "T-011"],
    parallel_safe_with=["T-012", "T-013"],
    acceptance_criteria=[
        "Given a user enrolls in TOTP, when verifyTotp() is called with a code generated for the same secret within the 30-s window, then it returns true; outside the window, false",
        "Given a recovery code is used once, when the same code is submitted again, then verification returns false and an audit_events row with action='mfa.recovery_replay_attempt' is written",
        "Given WebAuthn is requested, when the server action is invoked, then it returns {disabled: true, reason: 'phase_3_deferred'} without contacting the WebAuthn API",
    ],
    test_strategy=[
        "RED: write packages/auth/src/__tests__/totp.test.ts covering window, replay-protection, and WebAuthn stub before totp.ts exists",
        "Run 'pnpm --filter @monopilot/auth test'",
    ],
    risk_red_lines=[
        "Recovery codes MUST be hashed argon2id, never stored plaintext",
        "Do not enable WebAuthn — Phase 3 deferral is explicit (§5.x)",
    ],
    skills=SKILLS_TDD_VERIFY,
    context_budget="55k",
    estimated_effort="2-3h",
)

# T-016: Verify-PIN argon2 step-up
task(
    "T-016",
    "Verify-PIN step-up auth with argon2id (m=64MiB,t=3,p=1) + lockout policy",
    category="auth",
    subcategory="step-up",
    task_type="T2-api",
    parent_feature="00-FOUNDATION-impl-f auth",
    priority=80,
    prd_refs=["§5.x"],
    description="Short-lived PIN for destructive admin actions. Stored as argon2id hash (memory=64MiB, t=3, p=1). Rate limit identical to login.",
    details=(
        "Add packages/auth/src/verify-pin.ts: setPin(userId, pin) hashes via argon2.hash(pin, {type: argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1}). verifyPin(userId, pin) calls argon2.verify and decrements a per-user attempt counter; after 5 failures within 10 minutes the account is soft-locked for 15 minutes (login lockout policy). "
        "Persist user_pins(user_id PK, pin_hash, attempts_count INT, locked_until TIMESTAMPTZ). Tests cover correct verify, lockout after 5 wrong attempts, and unlock after 15 minutes via fake timers."
    ),
    scope_files=[
        "packages/auth/src/verify-pin.ts [create]",
        "packages/db/migrations/008-pins.sql [create]",
        "packages/auth/src/__tests__/verify-pin.test.ts [create]",
    ],
    out_of_scope=OOS_GENERIC + ["No PIN reset UI in this task"],
    dependencies=["T-010"],
    parallel_safe_with=["T-015"],
    acceptance_criteria=[
        "Given a PIN is set with setPin, when verifyPin is called with the same plaintext, then it returns true and the database stores only the argon2id hash (no plaintext anywhere)",
        "Given 5 wrong attempts in 10 minutes, when the 6th attempt is made, then verifyPin returns 'locked' and locked_until is set 15 minutes ahead",
        "Given the argon2 parameters, when the hash is decoded, then memory_cost=65536 (64MiB), time_cost=3, parallelism=1",
    ],
    test_strategy=[
        "RED: write packages/auth/src/__tests__/verify-pin.test.ts covering hash params, lockout, unlock with fake timers before verify-pin.ts exists",
        "Run 'pnpm --filter @monopilot/auth test'",
    ],
    risk_red_lines=[
        "PIN must NEVER be stored plaintext or with reversible encryption",
        "Lockout must be enforced server-side; do not rely on client-side counter",
    ],
    skills=SKILLS_TDD_VERIFY,
    context_budget="40k",
    estimated_effort="1-2h",
)

# T-017: Reference.DeptColumns + zod runtime
task(
    "T-017",
    "Reference.DeptColumns + Reference.FieldTypes + json-schema-to-zod runtime engine",
    category="data",
    subcategory="schema-driven",
    task_type="T1-schema",
    parent_feature="00-FOUNDATION schema-driven",
    priority=80,
    prd_refs=["§6", "§5"],
    description="Author the DeptColumns metadata tables and a Zod-runtime that compiles a row set into a JSON schema and a Zod resolver.",
    details=(
        "Migration 009-schema-driven.sql: Reference.DeptColumns(id, tenant_id, dept_code, column_key, field_type, is_required, validation_dsl JSONB, schema_version), Reference.FieldTypes(code PK, ts_type, json_schema JSONB), Reference.Formulas(id, tenant_id, formula_key, expression). "
        "Implement packages/schema-runtime/src/compile.ts: given a tenant_id + dept_code, query DeptColumns + FieldTypes, emit JSON schema, convert via json-schema-to-zod, return a Zod resolver. LRU cache keyed by (tenant_id, schema_version). "
        "Vitest covers: 5 column types compile, schema_version bump invalidates cache, Zod resolver rejects out-of-spec payload."
    ),
    scope_files=[
        "packages/db/migrations/009-schema-driven.sql [create]",
        "packages/schema-runtime/src/compile.ts [create]",
        "packages/schema-runtime/src/__tests__/compile.test.ts [create]",
    ],
    out_of_scope=OOS_GENERIC + ["No Admin UI wizard in this task — that lives in 02-SETTINGS"],
    dependencies=["T-006"],
    parallel_safe_with=["T-018", "T-019"],
    acceptance_criteria=[
        "Given DeptColumns rows for dept_code='core' with 5 fields (string, number, date, enum, formula), when compile('core') runs, then it returns a Zod schema that accepts a valid payload and rejects a payload missing a required field with a structured error",
        "Given the same compile call is invoked twice with the same schema_version, when the second call runs, then the LRU cache returns in <1ms (no DB query)",
        "Given schema_version is bumped, when compile() runs again, then the cache misses and the new resolver reflects the new column set",
    ],
    test_strategy=[
        "RED: write packages/schema-runtime/src/__tests__/compile.test.ts covering all three AC before compile.ts exists",
        "Run 'pnpm --filter @monopilot/schema-runtime test'",
    ],
    risk_red_lines=[
        "Do not bypass the schema_version cache — that path is the source of stale form errors",
    ],
    skills=SKILLS_TDD,
    context_budget="55k",
    estimated_effort="2-3h",
)

# T-018: Reference.Rules + DSL executor stub
task(
    "T-018",
    "Reference.Rules table + ADR-029 DSL executor stub for cascading/gate/conditional/workflow",
    category="data",
    subcategory="rule-engine",
    task_type="T1-schema",
    parent_feature="00-FOUNDATION rule-engine",
    priority=80,
    prd_refs=["§7"],
    description="Reference.Rules schema + a TypeScript executor that evaluates a single ADR-029 rule definition against a sample event. No UI, no rule-versioning UI.",
    details=(
        "Migration 010-rules.sql: Reference.Rules(id, tenant_id, rule_id TEXT, rule_type TEXT CHECK IN ('cascading','conditional_required','gate','workflow'), definition_json JSONB, version INT, active_from TIMESTAMPTZ, active_to TIMESTAMPTZ NULL). "
        "Implement packages/rule-engine/src/executor.ts: input = (rule, event_payload), output = { fired: boolean, actions: Action[], on_fail: object }. Support the four rule_types with the cascading + gate examples from PRD §7. "
        "Add a dry-run mode that does NOT side-effect (no outbox writes, no DB mutations). Vitest exercises the §7 allergen_changeover_gate example end-to-end."
    ),
    scope_files=[
        "packages/db/migrations/010-rules.sql [create]",
        "packages/rule-engine/src/executor.ts [create]",
        "packages/rule-engine/src/__tests__/executor.test.ts [create]",
    ],
    out_of_scope=OOS_GENERIC + ["No Admin UI rule wizard (02-SETTINGS)", "No rule versioning UI"],
    dependencies=["T-006"],
    parallel_safe_with=["T-017", "T-019"],
    acceptance_criteria=[
        "Given the §7 allergen_changeover_gate JSON rule, when executor runs against a wo.status_change.READY event with prev_wo.allergens overlapping next_wo.allergen_free_claim, then fired=true and the actions list contains require: cleaning_validation_checklist_signed and require: atp_swab_result max_rlu=10",
        "Given dry-run mode, when the executor runs against the same rule, then no rows are inserted into outbox_events or any other table",
        "Given rule_type='unknown', when executor is invoked, then it throws an explicit error (not silent pass)",
    ],
    test_strategy=[
        "RED: write packages/rule-engine/src/__tests__/executor.test.ts replicating the §7 example before executor.ts exists",
        "Run 'pnpm --filter @monopilot/rule-engine test'",
    ],
    risk_red_lines=[
        "Dry-run MUST be side-effect-free — that is the contract from PRD §7 + §14 open items",
    ],
    skills=SKILLS_TDD,
    context_budget="55k",
    estimated_effort="2-3h",
)

# T-019: dept taxonomy + 7-dept seed
task(
    "T-019",
    "Configurable department taxonomy seed (ADR-030) with 7 Apex depts and dept_overrides JSONB",
    category="data",
    subcategory="taxonomy",
    task_type="T5-seed",
    parent_feature="00-FOUNDATION dept taxonomy",
    priority=100,
    prd_refs=["§9"],
    description="Migration 011 creating Reference.Departments + tenant.dept_overrides JSONB. Seed the 7 Apex depts (core/technical/packaging/mrp/planning/production/price) for the Apex tenant with [APEX-CONFIG] marker.",
    details=(
        "Migration 011-departments.sql: Reference.Departments(id, tenant_id, code TEXT, display_name, role_description, marker TEXT). Add organizations.dept_overrides JSONB DEFAULT '{}'::jsonb. "
        "Seed 7 rows for the Apex tenant per PRD §9 table. Test asserts the 7 codes exist and the marker column equals 'APEX-CONFIG' for each. Test also asserts a second tenant can opt-out of the seed (dept_overrides={'merge': {'mrp+planning': 'supply_chain'}})."
    ),
    scope_files=[
        "packages/db/migrations/011-departments.sql [create]",
        "packages/db/seeds/apex-departments.sql [create]",
        "packages/db/__tests__/departments.integration.test.ts [create]",
    ],
    out_of_scope=OOS_GENERIC + ["No dept-override runtime engine (deferred per ADR-030)"],
    dependencies=["T-006"],
    parallel_safe_with=["T-017", "T-018"],
    acceptance_criteria=[
        "Given the Apex departments seed runs, when SELECT code FROM Reference.Departments WHERE tenant_id=apex runs, then the result equals exactly {core, technical, packaging, mrp, planning, production, price}",
        "Given a second tenant inserts dept_overrides='{\"merge\":{\"mrp+planning\":\"supply_chain\"}}', when read back, then the JSONB roundtrips exactly",
        "Given the marker column, when queried for Apex rows, then every row has marker='APEX-CONFIG'",
    ],
    test_strategy=[
        "RED: write packages/db/__tests__/departments.integration.test.ts asserting all 3 AC before the migration exists",
        "Run 'pnpm --filter @monopilot/db test:integration -- departments'",
    ],
    risk_red_lines=[
        "Do not split MRP — PRD §9 explicit decision (#15)",
    ],
    skills=SKILLS_TDD,
    context_budget="40k",
    estimated_effort="1-2h",
)

# T-020: Reference.ManufacturingOperations + cascade rule
task(
    "T-020",
    "Reference.ManufacturingOperations schema + bakery/pharma/fmcg/generic seeds (ADR-028 extension)",
    category="data",
    subcategory="manufacturing",
    task_type="T1-schema",
    parent_feature="00-FOUNDATION manufacturing-operations",
    priority=100,
    prd_refs=["§9.1"],
    description="Create the Reference.ManufacturingOperations table per §9.1 with the per-tenant uniqueness constraint and seed bakery + pharma + fmcg + generic operation sets.",
    details=(
        "Migration 012-manufacturing-ops.sql copying the verbatim DDL from PRD §9.1 (id UUID, tenant_id UUID, operation_name TEXT, process_suffix TEXT, description, operation_seq INT, industry_code TEXT, is_active BOOLEAN, marker TEXT) plus UNIQUE(tenant_id, process_suffix) and CHECK(process_suffix ~ '^[A-Z0-9]{2,4}$'). "
        "Seed four industry sets: bakery (Mix/Knead/Proof/Bake → MX/KN/PR/BK), pharma (Synthesis/Separation/Crystallization/Drying → SY/SE/CZ/DR), fmcg (Mix/Fill/Seal/Label → MX/FL/SL/LB), generic (Process_A..D → PA/PB/PC/PD). "
        "Test asserts the four seed sets exist, the unique-per-tenant constraint blocks duplicates, and the regex check rejects '!!' as a suffix."
    ),
    scope_files=[
        "packages/db/migrations/012-manufacturing-ops.sql [create]",
        "packages/db/seeds/manufacturing-operations.sql [create]",
        "packages/db/__tests__/manufacturing-ops.integration.test.ts [create]",
    ],
    out_of_scope=OOS_GENERIC + ["No 02-SETTINGS Admin UI editor (Phase C1)", "No intermediate_code_pN cascade engine (T-021)"],
    dependencies=["T-006", "T-019"],
    parallel_safe_with=["T-021", "T-018"],
    acceptance_criteria=[
        "Given the four industry seeds run for one tenant, when SELECT industry_code, count(*) FROM Reference.ManufacturingOperations runs, then bakery=4, pharma=4, fmcg=4, generic=4",
        "Given an INSERT with process_suffix='MX' for a tenant that already has 'MX', when committed, then PostgreSQL rejects with the unique-violation error",
        "Given an INSERT with process_suffix='!!', when attempted, then the CHECK constraint rejects it",
    ],
    test_strategy=[
        "RED: write packages/db/__tests__/manufacturing-ops.integration.test.ts asserting seeds + uniqueness + regex before migration exists",
        "Run 'pnpm --filter @monopilot/db test:integration -- manufacturing-ops'",
    ],
    risk_red_lines=[
        "Do not hardcode operation_name in code — PRD §9.1 makes it ORG-CONFIG",
    ],
    skills=SKILLS_TDD,
    context_budget="50k",
    estimated_effort="1-3h",
)

# T-021: cascade rule manufacturing_operation_N → intermediate_code_pN
task(
    "T-021",
    "Cascading rule manufacturing_operation_N → intermediate_code_pN with fa.intermediate_code_changed event",
    category="data",
    subcategory="rule-cascade",
    task_type="T4-wiring-test",
    parent_feature="00-FOUNDATION manufacturing-operations",
    priority=100,
    prd_refs=["§9.1", "§7"],
    description="Wire the §9.1 Chain-2 cascade rule using the rule executor (T-018), the manufacturing operations seed (T-020), and the outbox (T-008). Emit fa.intermediate_code_changed.",
    details=(
        "Insert the JSON rule definition from PRD §9.1 into Reference.Rules (rule_id='manufacturing_operation_to_intermediate_code_cascade', rule_type='cascading'). Implement packages/rule-engine/src/cascade-handler.ts that listens for fa.manufacturing_operation_N.changed (N=1..4), runs the executor against the rule, looks up Reference.ManufacturingOperations.process_suffix, generates intermediate_code_pN = '<prefix>-<process_suffix>-<seq>' (prefix from Reference.CodePrefixes default 'WIP'), updates the row, and emits fa.intermediate_code_changed via the outbox. "
        "Add fa.intermediate_code_changed to events.enum.ts (T-003) extension test. E2E test inserts a fa row, sets manufacturing_operation_1='Mix' for a bakery tenant, runs the handler, and asserts intermediate_code_p1 like 'WIP-MX-%' plus the outbox event."
    ),
    scope_files=[
        "packages/rule-engine/src/cascade-handler.ts [create]",
        "packages/db/seeds/cascade-rules.sql [create]",
        "packages/outbox/src/events.enum.ts [modify]",
        "packages/rule-engine/src/__tests__/cascade-mfg.e2e.test.ts [create]",
    ],
    out_of_scope=OOS_GENERIC + ["No regenerate-intermediate-codes wizard (Phase C1)"],
    dependencies=["T-008", "T-018", "T-020"],
    parallel_safe_with=[],
    acceptance_criteria=[
        "Given a bakery tenant and a fa row, when manufacturing_operation_1 is set to 'Mix' and the cascade handler runs, then intermediate_code_p1 matches /^WIP-MX-\\d{7}$/ and an outbox row with event_type='fa.intermediate_code_changed' is emitted",
        "Given operation_name 'Mix' is missing from Reference.ManufacturingOperations for the tenant, when the handler runs, then it throws 'operation_not_found' and rolls back without partial updates",
        "Given a pharma tenant with operation_name='Synthesis', when the handler runs, then intermediate_code_pN matches /^WIP-SY-\\d{7}$/ (WIP prefix override would come from Reference.CodePrefixes; default WIP for pharma in this seed)",
    ],
    test_strategy=[
        "RED: write packages/rule-engine/src/__tests__/cascade-mfg.e2e.test.ts replicating §9.1 §Chain-2 example before cascade-handler.ts exists",
        "Run 'pnpm --filter @monopilot/rule-engine test:e2e'",
    ],
    risk_red_lines=[
        "Do not partial-update on lookup miss — atomicity is required",
        "Do not bypass the outbox for the resulting event",
    ],
    skills=SKILLS_TDD_VERIFY,
    context_budget="60k",
    estimated_effort="2-3h",
)

# T-022: i18n scaffold pl/en/uk/ro
task(
    "T-022",
    "i18n scaffold with next-intl + ICU MessageFormat for pl/en/uk/ro baseline",
    category="infra",
    subcategory="i18n",
    task_type="T2-api",
    parent_feature="00-FOUNDATION-impl-i i18n",
    priority=100,
    prd_refs=["§5", "§11"],
    description="Set up next-intl with four locales pl, en, uk, ro. Locale-aware date/number formatters. ICU MessageFormat (no string concat).",
    details=(
        "Install next-intl. Add apps/web/i18n/{pl,en,uk,ro}.json with at least 5 keys (auth.signin.title, auth.signin.email, common.cancel, common.save, common.error.generic). Add app/[locale]/layout.tsx wrapping NextIntlClientProvider. "
        "Add lib/i18n/format.ts exporting formatDate(date, locale) and formatNumber(n, locale) using Intl.* with the locale list. "
        "Vitest unit test asserts ICU-formatted plural rules render correctly for each of the 4 locales (pl: dwa+kilka+wiele cases; ro: 1+few+other). "
        "Add a CI lint that fails if any tsx file outside lib/i18n contains a hardcoded user-facing string longer than 3 characters not wrapped in t() (allow-list URLs, code idents)."
    ),
    scope_files=[
        "apps/web/i18n/pl.json [create]",
        "apps/web/i18n/en.json [create]",
        "apps/web/i18n/uk.json [create]",
        "apps/web/i18n/ro.json [create]",
        "apps/web/lib/i18n/format.ts [create]",
        "apps/web/lib/i18n/__tests__/format.test.ts [create]",
        "apps/web/app/[locale]/layout.tsx [create]",
        "scripts/lint-no-hardcoded-strings.mjs [create]",
    ],
    out_of_scope=OOS_GENERIC + ["No translation memory or vendor wiring"],
    dependencies=["T-001"],
    parallel_safe_with=["T-006", "T-008", "T-009"],
    acceptance_criteria=[
        "Given the four locale files exist with the same key set, when lib/i18n/format.test.ts runs, then ICU plural rules pass for pl (1/few/many), en (one/other), uk (1/few/many), ro (1/few/other)",
        "Given a tsx file contains a hardcoded literal '\"Save changes\"', when 'node scripts/lint-no-hardcoded-strings.mjs' runs, then it exits non-zero with the offending file:line",
        "Given a request to /pl/some-page, when middleware resolves the locale, then NextIntlClientProvider receives 'pl' and the date formatter returns a Polish-localised date",
    ],
    test_strategy=[
        "RED: write apps/web/lib/i18n/__tests__/format.test.ts asserting plural rules for the 4 locales before format.ts exists",
        "Run 'pnpm --filter web test'",
    ],
    risk_red_lines=[
        "Do not concatenate translated fragments — ICU MessageFormat only (PRD §11)",
    ],
    skills=SKILLS_TDD,
    context_budget="45k",
    estimated_effort="1-2h",
)

# T-023: GS1-first identifier helpers
task(
    "T-023",
    "GS1-first identifier helpers (GTIN/SSCC/GLN/GRAI/GDTI parsers + check-digit)",
    category="infra",
    subcategory="gs1",
    task_type="T2-api",
    parent_feature="00-FOUNDATION GS1",
    priority=100,
    prd_refs=["§5", "§10"],
    description="Implement GS1 General Specs 24.0 parsers + check-digit validators for GTIN-13/14, SSCC-18, GLN-13, GRAI, GDTI. Used as preferred IDs over local SKUs.",
    details=(
        "Create packages/gs1/src/check-digit.ts exporting computeMod10(digits: string): string (GS1 standard mod-10). "
        "Create packages/gs1/src/parse.ts exporting parseGTIN(s), parseSSCC(s), parseGLN(s), parseGRAI(s), parseGDTI(s) — each returns {valid: boolean, digits: string, error?: string}. "
        "Vitest covers a known-good set: GTIN '5901234123457', SSCC '376104250021234566', plus malformed cases (length wrong, check-digit wrong)."
    ),
    scope_files=[
        "packages/gs1/src/check-digit.ts [create]",
        "packages/gs1/src/parse.ts [create]",
        "packages/gs1/src/__tests__/parse.test.ts [create]",
    ],
    out_of_scope=OOS_GENERIC + ["No GS1-128 AI parser (deferred to scanner module)"],
    dependencies=["T-001"],
    parallel_safe_with=["T-022", "T-024"],
    acceptance_criteria=[
        "Given known-good GTIN '5901234123457', when parseGTIN runs, then valid=true and digits='5901234123457'",
        "Given a tampered GTIN '5901234123458' (last digit wrong), when parseGTIN runs, then valid=false and error='check_digit_mismatch'",
        "Given an SSCC '376104250021234566', when parseSSCC runs, then valid=true; given a 17-digit SSCC, valid=false and error='length'",
    ],
    test_strategy=[
        "RED: write packages/gs1/src/__tests__/parse.test.ts asserting check-digit and length cases before parse.ts exists",
        "Run 'pnpm --filter @monopilot/gs1 test'",
    ],
    risk_red_lines=[
        "Do not invent custom mod-10 — match GS1 General Specs 24.0",
    ],
    skills=SKILLS_TDD,
    context_budget="35k",
    estimated_effort="1-2h",
)

# T-024: idempotent mutation helper
task(
    "T-024",
    "Idempotent mutation helper with client-generated UUID v7 transaction_id",
    category="infra",
    subcategory="idempotency",
    task_type="T2-api",
    parent_feature="00-FOUNDATION idempotency",
    priority=100,
    prd_refs=["§10"],
    description="Server helper that accepts a client-generated UUID v7 transaction_id and returns deterministic responses on replay (R14).",
    details=(
        "Add packages/db/migrations/013-idempotency.sql creating idempotency_keys(transaction_id UUID PK, tenant_id UUID NOT NULL, request_hash TEXT NOT NULL, response_json JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT now()). "
        "Implement packages/server/src/idempotent.ts exporting withIdempotency<T>(transactionId, requestPayload, handler) that: (1) hashes requestPayload, (2) selects existing row by transaction_id, (3) if hit and request_hash matches → returns stored response, (4) if hit and hash mismatches → throws 'idempotency_conflict', (5) if miss → runs handler, stores response, returns. "
        "Vitest covers: replay returns same response without re-running handler; hash mismatch throws; concurrent first-call uses ON CONFLICT DO NOTHING for safety."
    ),
    scope_files=[
        "packages/db/migrations/013-idempotency.sql [create]",
        "packages/server/src/idempotent.ts [create]",
        "packages/server/src/__tests__/idempotent.test.ts [create]",
    ],
    out_of_scope=OOS_GENERIC + ["No scanner-specific PWA wiring (separate module)"],
    dependencies=["T-006"],
    parallel_safe_with=["T-022", "T-023"],
    acceptance_criteria=[
        "Given withIdempotency is called twice with the same transaction_id and identical payload, when both calls complete, then handler is invoked exactly once and both calls return the identical response_json",
        "Given the second call uses the same transaction_id but a different payload, when invoked, then it throws 'idempotency_conflict' and no row is mutated",
        "Given the transaction_id is not a valid UUID v7 (version nibble != 7), when invoked, then it throws 'invalid_transaction_id'",
    ],
    test_strategy=[
        "RED: write packages/server/src/__tests__/idempotent.test.ts covering all three AC before idempotent.ts exists",
        "Run 'pnpm --filter @monopilot/server test'",
    ],
    risk_red_lines=[
        "Replay must NOT re-run side-effects — that is the whole contract",
    ],
    skills=SKILLS_TDD_VERIFY,
    context_budget="45k",
    estimated_effort="1-2h",
)

# T-025: packages/ui workspace + design tokens + Modal primitive
task(
    "T-025",
    "packages/ui workspace bootstrap + design-tokens.css + Modal primitive (Radix Dialog wrapper)",
    category="ui",
    subcategory="primitives",
    task_type="T3-ui",
    parent_feature="00-FOUNDATION-impl-j UI primitives",
    priority=80,
    prd_refs=["§5.y"],
    description="Create the @monopilot/ui workspace package with design-tokens.css and the Modal primitive that wraps @radix-ui/react-dialog (size sm/md/lg/xl, dismissible flag, focus trap, return focus).",
    details=(
        "Create packages/ui/package.json (name '@monopilot/ui'), packages/ui/tokens.css (CSS custom properties for color/space/radius/typography), packages/ui/src/Modal.tsx wrapping Radix Dialog with size token + dismissible prop. "
        "Add ESLint no-restricted-imports blocking '@radix-ui/react-dialog' from anywhere outside packages/ui. "
        "Storybook 8 set up in packages/ui/.storybook with one story per size variant. axe-core CI step runs on every PR via a Vitest test using @axe-core/playwright. "
        "Add packages/ui/test/assertModalA11y.ts helper used by every modal RTL test downstream. "
        "There is no Foundation UX spec; the Settings prototype owns the canonical access modal patterns. Parity AC must reference the access-screens.jsx invite modal as the structural reference because it is the first concrete consumer."
    ),
    scope_files=[
        "packages/ui/package.json [create]",
        "packages/ui/tokens.css [create]",
        "packages/ui/src/Modal.tsx [create]",
        "packages/ui/.storybook/main.ts [create]",
        "packages/ui/.storybook/Modal.stories.tsx [create]",
        "packages/ui/test/assertModalA11y.ts [create]",
        "packages/ui/src/__tests__/Modal.test.tsx [create]",
        ".eslintrc.js [modify]",
        "design/Monopilot Design System/settings/access-screens.jsx:131-154 [ref]",
    ],
    out_of_scope=OOS_GENERIC + ["No Stepper/Field/ReasonInput/Summary in this task — those are T-026 to T-029"],
    dependencies=["T-001"],
    parallel_safe_with=["T-022", "T-024"],
    acceptance_criteria=[
        "Given the Modal primitive renders, when compared to the invite-modal pattern in design/Monopilot Design System/settings/access-screens.jsx:131-154, then it matches structurally (header with title + close button, body with form-grid-2, footer with Cancel + primary action right-aligned), visually (uses Radix Dialog primitive — not native <dialog> — and reads sizes from tokens.css), and interactionally (ESC closes, focus is trapped inside the dialog while open, focus returns to the invoking trigger on close) — verified by Modal.test.tsx and the Storybook a11y addon",
        "Given an external file outside packages/ui imports '@radix-ui/react-dialog', when ESLint runs, then it fails with no-restricted-imports",
        "Given a Storybook build runs in CI with @axe-core/playwright, when the four size stories (sm/md/lg/xl) are scanned, then zero serious or critical a11y violations are reported",
        "Given assertModalA11y(container) is called in any modal RTL test, when invoked, then it asserts role='dialog', aria-modal='true', aria-labelledby is set, and focus is trapped",
    ],
    test_strategy=[
        "RED: write packages/ui/src/__tests__/Modal.test.tsx with the parity assertion (compare to access-screens.jsx:131-154 invite modal hierarchy) plus a11y assertions before Modal.tsx exists",
        "Run 'pnpm --filter @monopilot/ui test && pnpm --filter @monopilot/ui storybook:build && pnpm --filter @monopilot/ui test:a11y'",
    ],
    risk_red_lines=[
        "Do not let downstream packages import @radix-ui/react-dialog directly — drift is the explicit failure mode in PRD §5.y",
        "Do not skip axe-core in CI",
    ],
    skills=SKILLS_TDD_VERIFY,
    context_budget="60k",
    estimated_effort="2-3h",
)

# T-026: Stepper primitive
task(
    "T-026",
    "Stepper primitive with Back/Next/Jump/Restart and persisted step state",
    category="ui",
    subcategory="primitives",
    task_type="T3-ui",
    parent_feature="00-FOUNDATION-impl-j UI primitives",
    priority=100,
    prd_refs=["§5.y"],
    description="Multi-step wizard primitive (Stepper) with Back/Next/Jump-to-step/Restart actions, progress indicator, and persisted step state. Used by the 10 MODAL-SCHEMA Wizard pattern (P1).",
    details=(
        "Implement packages/ui/src/Stepper.tsx: receives steps: {id,label,canEnter?}[] and currentStep, emits onChange. Renders nav with aria-current='step', a Back button (disabled at step 0), a Next button (disabled when current step has validation errors), and a Jump menu when canEnter() returns true. Persists step state via a stepperStore (Zustand) keyed by a wizard id passed in props. "
        "Add Storybook story 'Stepper/8-step-wizard' replicating the email_template_edit_modal multi-step pattern. The Settings prototype's email_template_edit_modal (modals.jsx:141-259) is the canonical 8-step wizard reference."
    ),
    scope_files=[
        "packages/ui/src/Stepper.tsx [create]",
        "packages/ui/src/stepper-store.ts [create]",
        "packages/ui/.storybook/Stepper.stories.tsx [create]",
        "packages/ui/src/__tests__/Stepper.test.tsx [create]",
        "design/Monopilot Design System/settings/modals.jsx:141-259 [ref]",
    ],
    out_of_scope=OOS_GENERIC + ["No business-logic step transitions in this task"],
    dependencies=["T-025"],
    parallel_safe_with=["T-027", "T-028", "T-029"],
    acceptance_criteria=[
        "Given the Stepper renders, when compared to the email_template_edit_modal in design/Monopilot Design System/settings/modals.jsx:141-259, then it matches structurally (top nav with N step labels, body slot, footer with Back + Next + a Cancel slot), visually (uses Radix Tabs underlying primitive — not raw divs — with same density tokens from tokens.css), and interactionally (Back disabled on step 0, Next disabled when current step has validation errors, ESC behaviour follows Modal contract) — verified by Stepper.test.tsx counting buttons + asserting disabled states",
        "Given the user navigates Back/Next, when stepperStore is inspected, then current_step is persisted across re-renders without prop drilling",
        "Given canEnter(step3) returns false, when the user clicks Jump-to-step-3, then the click is rejected and currentStep does not change",
    ],
    test_strategy=[
        "RED: write packages/ui/src/__tests__/Stepper.test.tsx asserting parity (button count, disabled states, ESC handling) before Stepper.tsx exists",
        "Run 'pnpm --filter @monopilot/ui test'",
    ],
    risk_red_lines=[
        "Do not bypass the Modal primitive when used inside a Dialog — Stepper composes inside Modal, never replaces it",
    ],
    skills=SKILLS_TDD_VERIFY,
    context_budget="50k",
    estimated_effort="2-3h",
)

# T-027: Field primitive (RHF + Zod)
task(
    "T-027",
    "Field primitive — RHF Controller + Zod resolver wrapper with label/hint/error/required states",
    category="ui",
    subcategory="primitives",
    task_type="T3-ui",
    parent_feature="00-FOUNDATION-impl-j UI primitives",
    priority=100,
    prd_refs=["§5.y", "§5"],
    description="Field primitive wrapping React Hook Form Controller + Zod resolver. Renders label, hint, error message, required-mark, inline-validation states.",
    details=(
        "packages/ui/src/Field.tsx: props = { name, label, hint?, required?, type, schema? }. Internally uses useFormContext() (caller wraps with FormProvider) and Controller. Exposes 'error', 'success', 'idle' states via aria-invalid + aria-describedby. "
        "Inline validation triggers on blur and on form submit. Required-mark is a visible asterisk wrapped in <span aria-label='required'>. "
        "The Settings invite-modal in access-screens.jsx:139-145 (Email/Role/Site fields) is the canonical structural reference. Field.test.tsx parity asserts the same label-on-top + input-below + hint-below structure as access-screens.jsx:139-145."
    ),
    scope_files=[
        "packages/ui/src/Field.tsx [create]",
        "packages/ui/.storybook/Field.stories.tsx [create]",
        "packages/ui/src/__tests__/Field.test.tsx [create]",
        "design/Monopilot Design System/settings/access-screens.jsx:139-145 [ref]",
    ],
    out_of_scope=OOS_GENERIC + ["No business validation rules in this task"],
    dependencies=["T-025"],
    parallel_safe_with=["T-026", "T-028", "T-029"],
    acceptance_criteria=[
        "Given the Field primitive renders, when compared to the invite-modal field block in design/Monopilot Design System/settings/access-screens.jsx:139-145, then it matches structurally (label on top, input below, optional hint/error below), visually (uses shadcn Input as the inner primitive — no raw <input>), and interactionally (validation runs on blur and on submit, error message replaces hint when present, aria-invalid='true' is set on error) — verified by Field.test.tsx",
        "Given a Zod schema rejects the value, when the user blurs the field, then aria-invalid='true' is set and the resolver error message renders below the input",
        "Given required=true, when the field renders, then a visible asterisk is present with aria-label='required'",
    ],
    test_strategy=[
        "RED: write packages/ui/src/__tests__/Field.test.tsx asserting parity + a11y before Field.tsx exists",
        "Run 'pnpm --filter @monopilot/ui test'",
    ],
    risk_red_lines=[
        "Do not render a raw <input> — must use the shadcn Input wrapper to keep visual parity with prototypes",
    ],
    skills=SKILLS_TDD_VERIFY,
    context_budget="45k",
    estimated_effort="1-2h",
)

# T-028: ReasonInput primitive
task(
    "T-028",
    "ReasonInput primitive (textarea + char counter + minLength enforcement, default 10)",
    category="ui",
    subcategory="primitives",
    task_type="T3-ui",
    parent_feature="00-FOUNDATION-impl-j UI primitives",
    priority=100,
    prd_refs=["§5.y"],
    description="Reusable destructive-with-reason primitive consumed by P5 Override-with-reason and P9 Confirm-destructive-with-reason patterns.",
    details=(
        "packages/ui/src/ReasonInput.tsx: props = { name, minLength?: number = 10, placeholder? }. Renders a shadcn Textarea with a live character counter '{n}/{minLength}+' below right-aligned. Submit-blocked while length<minLength. "
        "Settings flag_edit_modal (modals.jsx:72-108) demonstrates the pattern with reason text + audit storage; ReasonInput must compose inside that modal. Storybook story 'ReasonInput/min-10-default' covers idle/typing/met-min/exceeded states."
    ),
    scope_files=[
        "packages/ui/src/ReasonInput.tsx [create]",
        "packages/ui/.storybook/ReasonInput.stories.tsx [create]",
        "packages/ui/src/__tests__/ReasonInput.test.tsx [create]",
        "design/Monopilot Design System/settings/modals.jsx:72-108 [ref]",
    ],
    out_of_scope=OOS_GENERIC + ["No outbox event emission — that is the calling component's responsibility"],
    dependencies=["T-025"],
    parallel_safe_with=["T-026", "T-027", "T-029"],
    acceptance_criteria=[
        "Given the ReasonInput renders, when compared to the flag_edit_modal reason block in design/Monopilot Design System/settings/modals.jsx:72-108, then it matches structurally (textarea + counter + submit-disabled when below min), visually (uses shadcn Textarea — not raw <textarea>), and interactionally (counter updates on every keystroke, aria-describedby points to the counter, parent submit button is disabled while length<minLength) — verified by ReasonInput.test.tsx",
        "Given minLength=10 and the user types 9 chars, when reading the parent form's submit button, then it is disabled with aria-disabled='true'",
        "Given the user types 11 chars, when reading the same button, then it is enabled",
    ],
    test_strategy=[
        "RED: write packages/ui/src/__tests__/ReasonInput.test.tsx asserting parity + counter + disabled-state before ReasonInput.tsx exists",
        "Run 'pnpm --filter @monopilot/ui test'",
    ],
    risk_red_lines=[
        "Do not couple ReasonInput to a specific outbox event — it is a primitive only",
    ],
    skills=SKILLS_TDD_VERIFY,
    context_budget="35k",
    estimated_effort="1-2h",
)

# T-029: Summary primitive
task(
    "T-029",
    "Summary primitive — read-only key/value list with optional diff highlighting",
    category="ui",
    subcategory="primitives",
    task_type="T3-ui",
    parent_feature="00-FOUNDATION-impl-j UI primitives",
    priority=100,
    prd_refs=["§5.y"],
    description="Read-only key/value summary used by P8/P9 Confirm patterns and P10 Preview-compare. Supports optional diff highlighting (added/changed/removed).",
    details=(
        "packages/ui/src/Summary.tsx: props = { rows: { label: string; before?: ReactNode; after: ReactNode; status?: 'unchanged'|'added'|'changed'|'removed' }[] }. Renders a <dl> with <dt>/<dd>. When status='changed' or 'added' or 'removed', applies a coloured left-border via tokens.css (no inline styles). "
        "The Settings schema_view_modal (modals.jsx:111-138) uses the same key/value pattern as a baseline; parity references that prototype. Diff variants get their own Storybook stories."
    ),
    scope_files=[
        "packages/ui/src/Summary.tsx [create]",
        "packages/ui/.storybook/Summary.stories.tsx [create]",
        "packages/ui/src/__tests__/Summary.test.tsx [create]",
        "design/Monopilot Design System/settings/modals.jsx:111-138 [ref]",
    ],
    out_of_scope=OOS_GENERIC + ["No data fetching in this task — caller passes rows"],
    dependencies=["T-025"],
    parallel_safe_with=["T-026", "T-027", "T-028"],
    acceptance_criteria=[
        "Given the Summary renders rows in unchanged mode, when compared to the schema_view_modal key/value block in design/Monopilot Design System/settings/modals.jsx:111-138, then it matches structurally (dl with dt/dd pairs in the same order as the rows prop), visually (uses tokens.css for spacing — no inline styles), and interactionally (no interactive controls; entirely read-only with role='term'/'definition') — verified by Summary.test.tsx",
        "Given a row has status='changed', when rendered, then a coloured left-border (via the design token --color-warning) is applied and the row's accessible name includes 'changed'",
        "Given an empty rows array, when rendered, then the component renders an EmptyState fallback (T-030 dependency satisfied via prop fallback) without crashing",
    ],
    test_strategy=[
        "RED: write packages/ui/src/__tests__/Summary.test.tsx asserting parity + diff variants before Summary.tsx exists",
        "Run 'pnpm --filter @monopilot/ui test'",
    ],
    risk_red_lines=[
        "Do not use inline styles for diff colours — must come from tokens.css for tenant theming hook (PRD §5.y)",
    ],
    skills=SKILLS_TDD_VERIFY,
    context_budget="35k",
    estimated_effort="1-2h",
)

# T-030: 5 tuning primitives
task(
    "T-030",
    "Tuning primitives RunStrip + EmptyState + TabsCounted + CompactActivity + DryRunButton + deriveRunHistory",
    category="ui",
    subcategory="tuning",
    task_type="T3-ui",
    parent_feature="00-FOUNDATION-impl-j UI primitives",
    priority=100,
    prd_refs=["§5.y"],
    description="Five tuning primitives ported from prototypes plus the deriveRunHistory() helper. Each is a primitive — no business data dependency.",
    details=(
        "Implement packages/ui/src/{RunStrip,EmptyState,TabsCounted,CompactActivity,DryRunButton}.tsx and packages/ui/src/run-history.ts (deriveRunHistory). "
        "RunStrip: horizontal status pill list. EmptyState: icon + title + body + action (already present in access-screens.jsx:39-43, parity reference). TabsCounted: shadcn Tabs with a numeric badge per tab. CompactActivity: terse activity-feed list (one row, one timestamp, one user). DryRunButton: Button variant tagged 'dry-run' (warning colour). deriveRunHistory(events: OutboxEvent[]): RunHistoryRow[] groups outbox events by aggregate_id. "
        "Storybook story per primitive. EmptyState parity reference is access-screens.jsx:39-43. Vitest covers deriveRunHistory grouping logic; RTL covers parity for EmptyState specifically."
    ),
    scope_files=[
        "packages/ui/src/RunStrip.tsx [create]",
        "packages/ui/src/EmptyState.tsx [create]",
        "packages/ui/src/TabsCounted.tsx [create]",
        "packages/ui/src/CompactActivity.tsx [create]",
        "packages/ui/src/DryRunButton.tsx [create]",
        "packages/ui/src/run-history.ts [create]",
        "packages/ui/.storybook/Tuning.stories.tsx [create]",
        "packages/ui/src/__tests__/tuning.test.tsx [create]",
        "design/Monopilot Design System/settings/access-screens.jsx:39-43 [ref]",
    ],
    out_of_scope=OOS_GENERIC + ["No business data wiring — primitives only"],
    dependencies=["T-025"],
    parallel_safe_with=["T-026", "T-027", "T-028", "T-029"],
    acceptance_criteria=[
        "Given the EmptyState primitive renders with icon + title + body + action, when compared to the EmptyState usage in design/Monopilot Design System/settings/access-screens.jsx:39-43, then it matches structurally (icon emoji slot, title text, body text, single action button), visually (uses tokens.css padding and uses shadcn Button — not raw <button>), and interactionally (action onClick fires on Enter and Space) — verified by tuning.test.tsx",
        "Given a list of outbox events grouped by aggregate_id, when deriveRunHistory(events) runs, then it returns one RunHistoryRow per aggregate_id with newest-first ordering and a count of events",
        "Given DryRunButton is rendered with role='button', when inspected, then it carries the 'dry-run' variant class and a tooltip 'Preview only — no changes saved' (matches the rule_dry_run_modal pattern)",
    ],
    test_strategy=[
        "RED: write packages/ui/src/__tests__/tuning.test.tsx covering EmptyState parity + deriveRunHistory + DryRunButton variant before primitives exist",
        "Run 'pnpm --filter @monopilot/ui test'",
    ],
    risk_red_lines=[
        "Do not let any tuning primitive depend on a specific data domain — they must remain reusable across all 12 modules",
    ],
    skills=SKILLS_TDD_VERIFY,
    context_budget="55k",
    estimated_effort="2-3h",
)

# T-031: 10 MODAL-SCHEMA pattern templates
task(
    "T-031",
    "10 MODAL-SCHEMA pattern templates (P1..P10) wired in Storybook + assertModalA11y coverage",
    category="ui",
    subcategory="patterns",
    task_type="T3-ui",
    parent_feature="00-FOUNDATION-impl-j UI primitives",
    priority=100,
    prd_refs=["§5.y"],
    description="One Storybook template per MODAL-SCHEMA pattern (P1 Wizard, P2 SimpleForm, P3 DualPath, P4 Picker, P5 Override-with-reason, P6 Simple, P7 Async-with-states, P8 Confirm-destructive-type-to-confirm, P9 Confirm-destructive-with-reason, P10 Preview-compare).",
    details=(
        "Add packages/ui/.storybook/patterns/{P1..P10}.stories.tsx, each composing the Modal/Stepper/Field/ReasonInput/Summary primitives + tuning primitives where applicable. Reference _shared/MODAL-SCHEMA.md for the exact contract per pattern. "
        "Each story file includes an axe-core scan via @axe-core/playwright. Each pattern test in packages/ui/src/__tests__/patterns.test.tsx invokes assertModalA11y(container) (T-025 helper). "
        "P1 Wizard parity: design/Monopilot Design System/settings/modals.jsx:141-259 (email_template_edit_modal). P5/P9 reason parity: modals.jsx:72-108 (flag_edit_modal). P10 Preview-compare parity: modals.jsx:18-69 (rule_dry_run_modal)."
    ),
    scope_files=[
        "packages/ui/.storybook/patterns/P1-Wizard.stories.tsx [create]",
        "packages/ui/.storybook/patterns/P2-SimpleForm.stories.tsx [create]",
        "packages/ui/.storybook/patterns/P3-DualPath.stories.tsx [create]",
        "packages/ui/.storybook/patterns/P4-Picker.stories.tsx [create]",
        "packages/ui/.storybook/patterns/P5-OverrideWithReason.stories.tsx [create]",
        "packages/ui/.storybook/patterns/P6-Simple.stories.tsx [create]",
        "packages/ui/.storybook/patterns/P7-AsyncWithStates.stories.tsx [create]",
        "packages/ui/.storybook/patterns/P8-ConfirmDestructiveType.stories.tsx [create]",
        "packages/ui/.storybook/patterns/P9-ConfirmDestructiveReason.stories.tsx [create]",
        "packages/ui/.storybook/patterns/P10-PreviewCompare.stories.tsx [create]",
        "packages/ui/src/__tests__/patterns.test.tsx [create]",
        "_shared/MODAL-SCHEMA.md [ref]",
        "design/Monopilot Design System/settings/modals.jsx:18-69 [ref]",
        "design/Monopilot Design System/settings/modals.jsx:72-108 [ref]",
        "design/Monopilot Design System/settings/modals.jsx:141-259 [ref]",
    ],
    out_of_scope=OOS_GENERIC + ["No real data — all stories use mock data"],
    dependencies=["T-025", "T-026", "T-027", "T-028", "T-029", "T-030"],
    parallel_safe_with=[],
    acceptance_criteria=[
        "Given the P1 Wizard story renders, when compared to design/Monopilot Design System/settings/modals.jsx:141-259 (email_template_edit_modal, 8-step wizard), then it matches structurally (8 step labels, Stepper composes inside Modal), visually (Radix Dialog + tokens.css), and interactionally (Back disabled at step 0, Next disabled when step has validation errors, ESC dismisses only when dismissible=true) — verified by patterns.test.tsx",
        "Given the P10 Preview-compare story renders, when compared to design/Monopilot Design System/settings/modals.jsx:18-69 (rule_dry_run_modal), then it matches structurally (left/right panels with Summary primitive on the right, DryRunButton in footer), visually (tokens.css spacing), and interactionally (DryRunButton click triggers a mocked async with loading/result/error states) — verified by patterns.test.tsx",
        "Given assertModalA11y(container) is invoked for each of the 10 patterns, when the test suite runs, then all 10 patterns pass with zero serious or critical axe-core violations",
    ],
    test_strategy=[
        "RED: write packages/ui/src/__tests__/patterns.test.tsx covering P1, P10, and assertModalA11y for all 10 patterns before the story files exist",
        "Run 'pnpm --filter @monopilot/ui test && pnpm --filter @monopilot/ui storybook:build && pnpm --filter @monopilot/ui test:a11y'",
    ],
    risk_red_lines=[
        "Do not deviate from MODAL-SCHEMA.md — that file is normative per PRD §5.y",
        "Do not skip axe-core for any pattern",
    ],
    skills=SKILLS_TDD_VERIFY,
    context_budget="80k",
    estimated_effort="3-5h",
)

# T-032: Regulatory roadmap artifact
task(
    "T-032",
    "Regulatory roadmap artifact under _foundation/regulatory/ with FSMA 204 / EUDR / Peppol / KSeF deadlines",
    category="docs",
    subcategory="regulatory",
    task_type="docs",
    parent_feature="governance",
    priority=120,
    prd_refs=["§11", "§14"],
    description="Create _foundation/regulatory/ with one markdown per regulation (FSMA 204, EUDR, Peppol BE, EU ViDA, BRCGS Issue 10, EU FIC 1169/2011 + 2021/382, Polska KSeF) plus a quarterly review process doc.",
    details=(
        "Create _foundation/regulatory/README.md (review process, quarterly cadence). One file per regulation listing: enforcement date, scope (which modules), key fields/events impacted, source URL, last reviewed date. "
        "Add scripts/check-regulatory-staleness.mjs that fails CI when any regulatory doc has last_reviewed_at older than 100 days."
    ),
    scope_files=[
        "_foundation/regulatory/README.md [create]",
        "_foundation/regulatory/fsma-204.md [create]",
        "_foundation/regulatory/eudr.md [create]",
        "_foundation/regulatory/peppol-be.md [create]",
        "_foundation/regulatory/eu-vida.md [create]",
        "_foundation/regulatory/brcgs-issue-10.md [create]",
        "_foundation/regulatory/eu-fic-1169-2011.md [create]",
        "_foundation/regulatory/polska-kseF.md [create]",
        "scripts/check-regulatory-staleness.mjs [create]",
    ],
    out_of_scope=OOS_GENERIC + ["No implementation — this is documentation only"],
    dependencies=["T-005"],
    parallel_safe_with=["T-022", "T-023", "T-024"],
    acceptance_criteria=[
        "Given seven regulation files exist under _foundation/regulatory/, when each file is parsed, then each contains exactly the keys: title, enforcement_date, scope_modules, last_reviewed_at, source_url",
        "Given a file has last_reviewed_at older than 100 days, when 'node scripts/check-regulatory-staleness.mjs' runs, then it exits non-zero with the offending filename",
    ],
    test_strategy=[
        "Run 'node scripts/check-regulatory-staleness.mjs' against fixtures and capture exit codes",
    ],
    risk_red_lines=[
        "Do not invent enforcement dates — copy from PRD §11 table only",
    ],
    skills=SKILLS_DOCS,
    context_budget="30k",
    estimated_effort="1-2h",
)

# T-033: PostHog feature flags wiring
task(
    "T-033",
    "PostHog self-host feature flags wiring with per-tenant targeting",
    category="infra",
    subcategory="feature-flags",
    task_type="T2-api",
    parent_feature="00-FOUNDATION feature-flags",
    priority=120,
    prd_refs=["§5", "§8"],
    description="Wire PostHog (self-host) for feature flags with per-tenant evaluation. Server-side flag evaluation only; no client SDK exposure of internal flags.",
    details=(
        "Install posthog-node. Add lib/feature-flags/index.ts exposing isEnabled(flagKey, { tenantId, userId }): boolean using PostHog's group identification (group='tenant', key=tenantId). "
        "Add a thin admin endpoint GET /api/internal/flags?tenant=... returning the resolved flag set for the current tenant (org.access.admin only). "
        "Vitest mocks the PostHog client and asserts: (1) per-tenant override resolves correctly, (2) unknown flag returns false (fail-closed), (3) the admin endpoint is 403 for non-admins."
    ),
    scope_files=[
        "apps/web/lib/feature-flags/index.ts [create]",
        "apps/web/app/api/internal/flags/route.ts [create]",
        "apps/web/__tests__/feature-flags.test.ts [create]",
    ],
    out_of_scope=OOS_GENERIC + ["No client SDK in this task — server-side only"],
    dependencies=["T-001", "T-014"],
    parallel_safe_with=["T-022", "T-023"],
    acceptance_criteria=[
        "Given a flag 'foo' is enabled for tenant A and disabled for tenant B in PostHog, when isEnabled('foo', { tenantId: 'A' }) is called, then it returns true; for 'B' it returns false",
        "Given an unknown flag 'does-not-exist', when isEnabled is called, then it returns false (fail-closed)",
        "Given a non-admin requests GET /api/internal/flags, when the request is processed, then it returns 403",
    ],
    test_strategy=[
        "RED: write apps/web/__tests__/feature-flags.test.ts covering all three AC before lib/feature-flags/index.ts exists",
        "Run 'pnpm --filter web test'",
    ],
    risk_red_lines=[
        "Do not expose internal flag keys to non-admin clients — that leaks the roadmap",
    ],
    skills=SKILLS_TDD,
    context_budget="40k",
    estimated_effort="1-2h",
)

# T-034: drift detection daily job
task(
    "T-034",
    "Schema drift detection daily job comparing information_schema vs Reference.DeptColumns",
    category="infra",
    subcategory="ops",
    task_type="T4-wiring-test",
    parent_feature="00-FOUNDATION ops",
    priority=120,
    prd_refs=["§6", "§11"],
    description="Daily job that diff-checks the live Postgres information_schema against Reference.DeptColumns and reports drift. Failure mode is a logged audit_events row + alerting webhook.",
    details=(
        "Create packages/ops/src/drift-detect.ts that: (1) loads all DeptColumns rows, (2) loads information_schema.columns for the corresponding tables, (3) computes diff (missing in DB, extra in DB, type mismatch), (4) writes an audit_events row with action='schema.drift_detected' retention_class='operational' and the diff in after_state, (5) returns the diff. "
        "Add a /api/internal/cron/drift route invoked by a cron schedule. Vitest E2E inserts a desync (DeptColumns row with no matching DDL) and asserts the job detects + records it. Document deploying as a Vercel cron in scripts/cron.json."
    ),
    scope_files=[
        "packages/ops/src/drift-detect.ts [create]",
        "apps/web/app/api/internal/cron/drift/route.ts [create]",
        "scripts/cron.json [create]",
        "packages/ops/src/__tests__/drift-detect.e2e.test.ts [create]",
    ],
    out_of_scope=OOS_GENERIC + ["No auto-fix path in this task — detection only"],
    dependencies=["T-009", "T-017"],
    parallel_safe_with=["T-033"],
    acceptance_criteria=[
        "Given a DeptColumns row references column_key='foo' on a table where information_schema reports no 'foo' column, when drift-detect runs, then it returns diff.missing_in_db = ['foo'] and writes an audit_events row with action='schema.drift_detected' retention_class='operational'",
        "Given DeptColumns and information_schema agree, when drift-detect runs, then diff is empty and no audit row is written",
        "Given the cron route is hit without the internal cron header, when processed, then it returns 401",
    ],
    test_strategy=[
        "RED: write packages/ops/src/__tests__/drift-detect.e2e.test.ts covering both paths before drift-detect.ts exists",
        "Run 'pnpm --filter @monopilot/ops test:e2e'",
    ],
    risk_red_lines=[
        "Do not write to audit_events with retention_class!='operational' from this job — taxonomy is fixed in T-009",
    ],
    skills=SKILLS_TDD_VERIFY,
    context_budget="50k",
    estimated_effort="2-3h",
)

# Build manifest + coverage
TASK_IDS = [f"T-{i:03d}" for i in range(1, 35)]

manifest = {
    "source_prd": SOURCE_PRD,
    "root_path": ROOT,
    "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "generator": "prd-decompose-hybrid",
    "pipeline_name": "kira_dev",
    "task_count": len(TASK_IDS),
    "tasks": [f"tasks/{tid}.json" for tid in TASK_IDS],
    "coverage_file": "coverage.md",
}
(OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")

# Coverage map (PRD section → task)
coverage_rows = [
    ("§1", "Six architectural principles", "T-005"),
    ("§2", "Marker discipline (4 markers)", "T-005"),
    ("§3", "Personas + Org Admin / Schema Admin SoD split (F-U4)", "T-004, T-014"),
    ("§4.1", "PRD writing phases", "T-005 (registry seed)"),
    ("§4.2", "Build sequence + Phase E-0 + impl-j addendum (F-A4)", "T-001, T-005, T-025"),
    ("§4.3", "15-module table + ADR-034 product rename", "T-005, T-006"),
    ("§5 Tech stack — Next.js + RSC + TS strict + tailwind", "monorepo bootstrap", "T-001"),
    ("§5 Tech stack — Postgres 16 + JSONB hybrid + RLS", "DB scaffold", "T-002, T-006, T-007"),
    ("§5 Tech stack — Outbox + Zod runtime + i18n + GS1 + idempotent", "infra wiring", "T-008, T-017, T-022, T-023, T-024"),
    ("§5 Tech stack — feature flags PostHog", "feature-flags wiring", "T-033"),
    ("§5.x Auth & Identity (F-A1, 6 OSS libs)", "Supabase + SAML + SCIM + TOTP + verify-PIN", "T-011, T-012, T-013, T-015, T-016"),
    ("§5.y UI primitives @monopilot/ui (F-A3) + 10 MODAL-SCHEMA patterns", "primitives + Storybook + axe", "T-025, T-026, T-027, T-028, T-029, T-030, T-031"),
    ("§6 Schema-driven foundation (ADR-028)", "DeptColumns + Zod runtime", "T-017"),
    ("§7 Rule engine DSL (ADR-029)", "Reference.Rules + executor stub", "T-018"),
    ("§8 Multi-tenant L1-L4 (ADR-031) + RLS + tenant_idp_config (F-A2)", "tenants/orgs + RLS + idp config", "T-006, T-007, T-010"),
    ("§9 Configurable dept taxonomy (ADR-030)", "Reference.Departments + dept_overrides", "T-019"),
    ("§9.1 Manufacturing Operations Pattern", "Reference.ManufacturingOperations + cascade", "T-020, T-021"),
    ("§10 Outbox + R13 cols + GS1-first + idempotency", "outbox_events + GS1 + idempotency", "T-003, T-006, T-008, T-023, T-024"),
    ("§11 i18n + Audit log F-U3 (13-field, retention tiers) + regulatory", "i18n + audit_events + regulatory", "T-022, T-009, T-032"),
    ("§12 ADRs 028-031 active + R1-R15 candidate", "marker discipline + governance", "T-005"),
    ("§13 Success criteria + F-U5 (MFA-by-default, NIST password, idle 60min, SSO baseline, magic-link 7d)", "tenant_idp_config seed + tests", "T-010, T-011"),
    ("§13 Niefunkcjonalne — drift detection + RLS coverage 100%", "drift detection job + RLS test", "T-007, T-034"),
    ("§14 Open items — pre-Phase-D ADR review / regulatory artifact / dry-run scope", "regulatory + dry-run mode", "T-018 (dry-run), T-032 (regulatory)"),
    ("§15 References", "out-of-scope per PRD §15 (links only)", "none — PRD links only, not a deliverable"),
]

cov_lines = [
    "# PRD Coverage — 00-FOUNDATION-PRD.md (v4.2)",
    "",
    "## Coverage by PRD section",
    "",
    "| PRD ref | Requirement | Task file(s) | Status |",
    "|---|---|---|---|",
]
for ref, req, tids in coverage_rows:
    if tids.startswith("none"):
        cov_lines.append(f"| {ref} | {req} | none | out-of-scope per PRD §15 (PRD-internal references) |")
    else:
        cov_lines.append(f"| {ref} | {req} | {tids} | covered |")

cov_lines += [
    "",
    "## Coverage by category",
    "",
    "### data (12 tasks)",
    "| PRD ref | Task | Subcategory |",
    "|---|---|---|",
    "| §5, §10 | T-002 | scaffold |",
    "| §8, §10 | T-006 | migration |",
    "| §5, §8 | T-007 | security |",
    "| §10 | T-008 | event-bus |",
    "| §11 | T-009 | audit |",
    "| §6, §5 | T-017 | schema-driven |",
    "| §7 | T-018 | rule-engine |",
    "| §9 | T-019 | taxonomy |",
    "| §9.1 | T-020 | manufacturing |",
    "| §9.1, §7 | T-021 | rule-cascade |",
    "",
    "### auth (6 tasks)",
    "| PRD ref | Task | Subcategory |",
    "|---|---|---|",
    "| §3, §13 | T-004 | enum-lock |",
    "| §8.x, §5.x | T-010 | schema |",
    "| §5.x | T-011 | identity |",
    "| §5.x, §8.x | T-012 | federation |",
    "| §5.x, §8.x | T-013 | provisioning |",
    "| §3, §8 | T-014 | rbac |",
    "| §5.x | T-015 | mfa |",
    "| §5.x | T-016 | step-up |",
    "",
    "### ui (7 tasks)",
    "| PRD ref | Task | Subcategory |",
    "|---|---|---|",
    "| §5.y | T-025 | primitives |",
    "| §5.y | T-026 | primitives |",
    "| §5.y, §5 | T-027 | primitives |",
    "| §5.y | T-028 | primitives |",
    "| §5.y | T-029 | primitives |",
    "| §5.y | T-030 | tuning |",
    "| §5.y | T-031 | patterns |",
    "",
    "### infra (5 tasks)",
    "| PRD ref | Task | Subcategory |",
    "|---|---|---|",
    "| §5, §4.2-AMENDMENT | T-001 | scaffold |",
    "| §10 | T-003 | enum-lock |",
    "| §5, §11 | T-022 | i18n |",
    "| §5, §10 | T-023 | gs1 |",
    "| §10 | T-024 | idempotency |",
    "| §5, §8 | T-033 | feature-flags |",
    "| §6, §11 | T-034 | ops |",
    "",
    "### docs (2 tasks)",
    "| PRD ref | Task | Subcategory |",
    "|---|---|---|",
    "| §1, §2, §4 | T-005 | adr |",
    "| §11, §14 | T-032 | regulatory |",
    "",
    "## Gaps",
    "",
    "| PRD ref | Requirement | Status |",
    "|---|---|---|",
    "| §14 open #4 (hard-lock semantyka ADR-028) | developer-only vs superadmin-only | out-of-scope per PRD §14 (Phase B.2 / C1 — not Foundation) |",
    "| §14 open #5 (rule engine versioning v1/v2) | versioning UI/runtime | out-of-scope per PRD §14 (Phase D+ implementation) |",
    "| §14 open #7 (commercial upstream brief) | NPD source decision | out-of-scope per PRD §4 (01-NPD module) |",
    "| §14 open #11 (LLM platform Claude/Azure/Modal) | platform decision | out-of-scope per PRD §14 (open question, deferred) |",
    "| §14 open #12 (Peppol vendor) | Storecove/Pagero/Tradeshift | out-of-scope per PRD §14 (Phase C4 / 11-SHIPPING) |",
    "| §14 open #13 (pre-Phase-D ADR review 001-019) | ADR triage | out-of-scope per PRD §14 (separate session, Phase C start) |",
    "| §11 — Out-of-scope Monopilot (GL/AP/AR/HR/CRM/On-prem/Blockchain/Autonomous LLM) | n/a | explicitly out-of-scope per PRD §11 |",
]

(OUT / "coverage.md").write_text("\n".join(cov_lines) + "\n")

print(f"Generated {len(TASK_IDS)} tasks + manifest + coverage.")
