#!/usr/bin/env python3
"""Generate ACP-importable task JSON payloads for 02-SETTINGS module.

Output: tasks/T-NNN.json  + manifest.json + coverage.md

Run from this directory:  python3 _generate.py
"""
from __future__ import annotations

import json
import pathlib
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).parent
TASK_DIR = ROOT / "tasks"
TASK_DIR.mkdir(parents=True, exist_ok=True)

ROOT_PATH = "/Users/mariuszkrawczyk/Projects/monopilot-kira"
PRD = "02-SETTINGS-PRD.md"
NOW = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

# Tracks for coverage table
COVERAGE_ROWS: list[dict] = []
TASKS: list[dict] = []


def add_task(
    *, num: int, title: str, prompt: str, labels: list[str], priority: int,
    category: str, subcategory: str, task_type: str, parent_feature: str,
    prd_refs: list[str], description: str, details: str,
    scope_files: list[str], acceptance_criteria: list[str],
    test_strategy: list[str], risk_red_lines: list[str],
    skills: list[str], dependencies: list[str] | None = None,
    parallel_safe_with: list[str] | None = None,
    out_of_scope: list[str] | None = None,
    context_budget: str = "40k", estimated_effort: str = "1-3h",
    prototype_match: bool = False,
    cov_section: str = "", cov_requirement: str = "",
) -> str:
    tid = f"T-{num:03d}"
    pi = {
        "root_path": ROOT_PATH,
        "prd_task_id": tid,
        "source_prd": PRD,
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
        "out_of_scope": out_of_scope or ["broaden scope beyond listed files", "implement future-phase features"],
        "dependencies": dependencies or [],
        "parallel_safe_with": parallel_safe_with or [],
        "acceptance_criteria": acceptance_criteria,
        "test_strategy": test_strategy,
        "risk_red_lines": risk_red_lines,
        "skills": skills,
        "checkpoint_policy": {
            "required_checkpoints": ["RED", "GREEN", "REVIEW", "CLOSEOUT"],
            "closeout_requires": [
                "changed_files",
                "test_commands_and_results",
                "acceptance_criteria_status",
                "deviations_from_prd",
                "git_status",
            ],
        },
        "routing_hints": {
            "red": "hermes_gpt55",
            "implementation": "hermes_gpt55",
            "review": "opus_if_high_risk_or_ui_or_architecture",
            "close": "spark_low_risk_else_opus",
        },
        "prototype_match": prototype_match,
    }
    payload = {
        "title": f"{tid} — {title}",
        "prompt": prompt,
        "labels": labels,
        "priority": priority,
        "max_attempts": 3,
        "pipeline_name": "kira_dev",
        "pipeline_inputs": pi,
    }
    out = TASK_DIR / f"{tid}.json"
    out.write_text(json.dumps(payload, indent=2, ensure_ascii=False))
    TASKS.append({"id": tid, "title": title, "category": category, "subcategory": subcategory, "task_type": task_type})
    if cov_section:
        for ref in (cov_section.split(",") if isinstance(cov_section, str) else cov_section):
            COVERAGE_ROWS.append({
                "section": ref.strip(),
                "requirement": cov_requirement or title,
                "task": f"tasks/{tid}.json",
                "status": "covered",
            })
    return tid


def std_prompt(task_id: str, title: str, body: str, ac: list[str], red_cmd: str, files: list[str]) -> str:
    files_block = "\n".join(f"- {f}" for f in files)
    ac_block = "\n".join(f"- {a}" for a in ac)
    return f"""# {task_id} — {title}

## Goal
{body.strip()}

## Files in scope
{files_block}

## Acceptance criteria (all must hold)
{ac_block}

## Test strategy (RED first)
1. Add a failing test that exercises the acceptance criteria above. The RED command is:
   `{red_cmd}`
2. Run RED — it must fail before any production code is written.
3. Implement the smallest change needed for GREEN.
4. Re-run RED command — must pass.
5. Run `pnpm typecheck` and `pnpm lint` in the changed package; both must pass.

## Risk red lines
- Do not edit files outside the listed scope without documenting why in CLOSEOUT.
- Do not weaken existing acceptance criteria from prior tasks.
- Do not introduce REST endpoints; use Server Actions per stack contract.
- Do not commit secrets or vault keys.

## Closeout evidence required
- changed_files (with line counts)
- exact test commands and outputs (RED→GREEN, typecheck, lint)
- acceptance_criteria_status (one row per AC: pass/fail)
- deviations_from_prd (or "none")
- git_status

Stack: TS + Next.js App Router + Drizzle + pnpm + vitest + Playwright + Server Actions. Primitives in `packages/ui`. PRD: `02-SETTINGS-PRD.md` v3.5.
"""


# ─────────────────────────────────────────────────────────────────────────────
# WAVE 0 — enum locks (P0)
# ─────────────────────────────────────────────────────────────────────────────

add_task(
    num=1,
    title="Lock settings permission enum (10 system role baseline)",
    prompt=std_prompt(
        "T-001", "Lock settings permission enum",
        body=(
            "Append a delimited SETTINGS_CORE permission group to `apps/web/lib/rbac/permissions.enum.ts` "
            "covering org/users/roles/audit/impersonate strings. Export `ALL_SETTINGS_CORE_PERMISSIONS`. "
            "Per PRD §3 [D2] the model is flat dot-namespaced strings; no derived 4-level matrix view."
        ),
        ac=[
            "Given the enum file is read, when imported, then it exposes exactly these new strings: 'settings.org.read', 'settings.org.update', 'settings.users.create', 'settings.users.deactivate', 'settings.users.invite', 'settings.roles.assign', 'settings.audit.read', 'settings.impersonate.tenant'.",
            "Given a permission key matches the regex `^settings\\.[a-z_]+\\.[a-z_]+$`, when the enum is parsed, then no duplicates exist (vitest assertion).",
            "Given the file is changed, when CODEOWNERS is read, then the file remains architect-locked (`apps/web/lib/rbac/permissions.enum.ts` listed under @architects).",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run apps/web/lib/rbac/permissions.test.ts",
        files=[
            "apps/web/lib/rbac/permissions.enum.ts [modify]",
            "apps/web/lib/rbac/permissions.test.ts [modify]",
            "CODEOWNERS [modify if missing entry]",
        ],
    ),
    labels=["prd", "auth", "permissions", "T1-schema", "p0-lock"],
    priority=50,
    category="auth",
    subcategory="permissions-enum",
    task_type="T1-schema",
    parent_feature="02-settings-a",
    prd_refs=["§3", "§5.1"],
    description="Lock settings permission enum strings (RBAC foundation for §3).",
    details=(
        "Append ONLY the 8 listed strings; do not include schema/rules/reference/d365/email/onboarding "
        "permissions yet (those come in T-002). Use the same pattern as the foundation enum: const "
        "object with JSDoc comments referencing PRD §3 line numbers. Add `ALL_SETTINGS_CORE_PERMISSIONS` "
        "as a typed array literal so tests can iterate."
    ),
    scope_files=[
        "apps/web/lib/rbac/permissions.enum.ts",
        "apps/web/lib/rbac/permissions.test.ts",
        "CODEOWNERS",
    ],
    acceptance_criteria=[
        "8 new permission strings present in enum, regex-validated, no duplicates.",
        "`ALL_SETTINGS_CORE_PERMISSIONS` exported and typed `Permission[]`.",
        "vitest covers regex + uniqueness; suite green via `pnpm vitest run apps/web/lib/rbac/permissions.test.ts`.",
        "CODEOWNERS keeps `apps/web/lib/rbac/permissions.enum.ts` architect-only.",
    ],
    test_strategy=[
        "RED: extend permissions.test.ts to assert presence of 8 new strings + regex + uniqueness; run vitest, expect failure.",
        "GREEN: append the strings, re-run test.",
        "Run `pnpm typecheck` after change.",
    ],
    risk_red_lines=[
        "Do not remove or rename existing permission strings.",
        "Do not introduce a parallel 4-level matrix model (rejected per §3 [D2]).",
    ],
    skills=["test-driven-development", "requesting-code-review"],
    cov_section="§3, §5.1",
    cov_requirement="10 system roles + flat permission enum (settings core)",
)

add_task(
    num=2,
    title="Extend settings permission enum (schema/rules/ref/infra/d365/email/onboarding/security)",
    prompt=std_prompt(
        "T-002", "Extend settings permission enum",
        body=(
            "Append the second SETTINGS_EXT permission group covering schema admin, rule registry, "
            "reference CRUD, infrastructure, D365, email, onboarding, security policy, SSO, SCIM, IP "
            "allowlist, and feature flags. Export `ALL_SETTINGS_EXT_PERMISSIONS`."
        ),
        ac=[
            "Given the enum file is read, when imported, then it exposes settings.schema.{view,edit,promote_l1}; settings.rules.view; settings.reference.{view,edit,import}; settings.infra.{view,edit}; settings.d365.{view,edit,toggle}; settings.email.{view,edit}; settings.onboarding.complete; settings.security.edit; settings.sso.{view,edit}; settings.scim.{view,edit}; settings.ip_allowlist.{view,edit}; settings.flags.{view,edit}.",
            "Given the file is parsed, when checked, then all new strings match `^settings\\.[a-z_]+\\.[a-z_0-9]+$` and zero duplicates exist.",
            "Given vitest runs `apps/web/lib/rbac/permissions.test.ts`, when executed, then ALL_SETTINGS_EXT_PERMISSIONS array length equals exactly the count of new strings declared.",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run apps/web/lib/rbac/permissions.test.ts",
        files=[
            "apps/web/lib/rbac/permissions.enum.ts [modify]",
            "apps/web/lib/rbac/permissions.test.ts [modify]",
        ],
    ),
    labels=["prd", "auth", "permissions", "T1-schema", "p0-lock"],
    priority=50,
    category="auth",
    subcategory="permissions-enum",
    task_type="T1-schema",
    parent_feature="02-settings-a",
    prd_refs=["§3", "§6", "§7", "§8", "§10", "§11", "§12", "§13", "§14"],
    description="Extend settings permission enum with all submodule (b/c/d/e) strings.",
    details=(
        "Same conventions as T-001. Group with delimiter comments (Schema, Rules, Reference, Infra, "
        "D365, Email, Onboarding, Security, SSO, SCIM, IP Allowlist, Flags). Include JSDoc per group "
        "with PRD section refs."
    ),
    scope_files=[
        "apps/web/lib/rbac/permissions.enum.ts",
        "apps/web/lib/rbac/permissions.test.ts",
    ],
    acceptance_criteria=[
        "All listed strings present; regex passes; uniqueness verified.",
        "`ALL_SETTINGS_EXT_PERMISSIONS` array exported, typed Permission[].",
        "vitest suite green.",
    ],
    test_strategy=[
        "RED: extend permissions.test.ts.",
        "GREEN: append strings.",
        "Run `pnpm typecheck`.",
    ],
    risk_red_lines=[
        "Do not introduce permissions outside settings namespace.",
        "Do not couple enum strings to specific UI components.",
    ],
    skills=["test-driven-development"],
    dependencies=["T-001"],
    cov_section="§6, §7, §8, §10, §11, §12, §13, §14",
    cov_requirement="Permission enum for schema/rules/ref/infra/d365/email/onboarding/security",
)

add_task(
    num=3,
    title="Lock settings outbox event enum",
    prompt=std_prompt(
        "T-003", "Lock settings outbox event enum",
        body=(
            "Append SETTINGS event group to `apps/web/lib/outbox/events.enum.ts` for org/user/role/"
            "module/reference/schema-migration/rule-deploy/sso/scim mutation events. Use ISA-95 dot "
            "format (e.g. `settings.org.created`)."
        ),
        ac=[
            "Given the enum is read, when listed, then events 'settings.org.created', 'settings.org.updated', 'settings.user.invited', 'settings.user.deactivated', 'settings.role.assigned', 'settings.module.toggled', 'settings.reference.row_updated', 'settings.schema.migration_requested', 'settings.rule.deployed', 'settings.sso.config_changed', 'settings.scim.token_created' exist.",
            "Given the file is parsed, when validated, then all new strings match `^settings\\.[a-z_]+\\.[a-z_]+$` and no duplicates exist.",
            "Given vitest runs `apps/web/lib/outbox/events.test.ts`, when executed, then suite is green.",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run apps/web/lib/outbox/events.test.ts",
        files=[
            "apps/web/lib/outbox/events.enum.ts [modify]",
            "apps/web/lib/outbox/events.test.ts [modify]",
        ],
    ),
    labels=["prd", "data", "outbox-events", "T1-schema", "p0-lock"],
    priority=50,
    category="data",
    subcategory="outbox-events",
    task_type="T1-schema",
    parent_feature="02-settings-foundation",
    prd_refs=["§5.6", "§7.3"],
    description="Lock settings outbox event enum strings.",
    details=(
        "Match the foundation outbox event style; group block delimited by comment; export "
        "ALL_SETTINGS_EVENTS array."
    ),
    scope_files=[
        "apps/web/lib/outbox/events.enum.ts",
        "apps/web/lib/outbox/events.test.ts",
    ],
    acceptance_criteria=[
        "11 new event strings present, regex-validated, unique.",
        "`ALL_SETTINGS_EVENTS` array exported.",
        "vitest suite green.",
    ],
    test_strategy=[
        "RED: extend events.test.ts.",
        "GREEN: append events.",
    ],
    risk_red_lines=[
        "Do not change event payload contracts here (separate task).",
    ],
    skills=["test-driven-development"],
    dependencies=[],
    parallel_safe_with=["T-001", "T-002"],
    cov_section="§5.6, §7.3",
    cov_requirement="Outbox events for settings mutations",
)

# ─────────────────────────────────────────────────────────────────────────────
# T1-schema migrations
# ─────────────────────────────────────────────────────────────────────────────

add_task(
    num=4,
    title="Drizzle migration: organizations + users + roles + modules core",
    prompt=std_prompt(
        "T-004", "Drizzle migration: organizations/users/roles/modules",
        body=(
            "Create Drizzle schema + SQL migration for §5.1 core identity tables: organizations, "
            "users, roles, modules, organization_modules. Include S-U7 invite_token_expires_at and "
            "S-U8 seat_limit. RLS enabled on org-scoped tables."
        ),
        ac=[
            "Given migration is applied, when `\\d organizations` is run, then columns include id, slug, name, logo_url, timezone, locale, currency, gs1_prefix, region, tier, seat_limit, onboarding_state, onboarding_completed_at, created_at, updated_at.",
            "Given migration is applied, when `\\d users` is run, then columns include invite_token and invite_token_expires_at TIMESTAMPTZ; CITEXT email; FK role_id → roles(id).",
            "Given migration is applied, when `SELECT current_setting('app.current_org_id')` is forced empty, then RLS denies SELECT on organizations rows (policy from §5 applied).",
            "Given drizzle-kit introspect runs, when compared to schema, then drift is zero.",
        ],
        red_cmd="pnpm --filter @monopilot/web drizzle-kit migrate && pnpm vitest run apps/web/db/migrations/__tests__/settings-core.test.ts",
        files=[
            "apps/web/db/schema/settings-core.ts [create]",
            "apps/web/db/migrations/00xx_settings_core.sql [create]",
            "apps/web/db/migrations/__tests__/settings-core.test.ts [create]",
        ],
    ),
    labels=["prd", "data", "settings-core-schema", "T1-schema"],
    priority=80,
    category="data",
    subcategory="settings-core-schema",
    task_type="T1-schema",
    parent_feature="02-settings-a",
    prd_refs=["§5.1", "S-U7", "S-U8"],
    description="Core identity tables: organizations, users, roles, modules.",
    details=(
        "Honor §5.1 SQL exactly. Use Drizzle pgTable; emit migration via drizzle-kit generate. "
        "Add RLS policies `USING (org_id = current_setting('app.current_org_id')::uuid)` for "
        "users/roles/organization_modules; organizations row guarded by id-based policy. "
        "Include CITEXT extension enable. Seat_limit nullable. invite_token_expires_at TIMESTAMPTZ."
    ),
    scope_files=[
        "apps/web/db/schema/settings-core.ts",
        "apps/web/db/migrations/",
        "apps/web/db/migrations/__tests__/settings-core.test.ts",
    ],
    acceptance_criteria=[
        "All 5 tables created with exact §5.1 columns + S-U7/S-U8 fields.",
        "RLS policies enabled and deny by default without app.current_org_id.",
        "drizzle-kit drift = 0.",
        "vitest pgTAP-style migration test green.",
    ],
    test_strategy=[
        "RED: write migration test asserting columns + policies.",
        "GREEN: emit migration via drizzle-kit, hand-edit policies.",
        "Run `pnpm db:test` (vitest with pglite or test container).",
    ],
    risk_red_lines=[
        "Do not weaken RLS by omitting policies.",
        "Do not embed raw secrets in seed.",
    ],
    skills=["test-driven-development"],
    dependencies=["T-001", "T-003"],
    cov_section="§5.1, S-U7, S-U8",
    cov_requirement="Core identity schema with seat_limit + invite TTL",
)

add_task(
    num=5,
    title="Drizzle migration: schema metadata (reference_schemas, schema_migrations)",
    prompt=std_prompt(
        "T-005", "Drizzle migration: schema metadata (ADR-028)",
        body=(
            "Create Drizzle + SQL migration for §5.2: reference_schemas + schema_migrations. RLS on "
            "org-scoped rows. Include CHECK constraint on data_type enum and tier enum."
        ),
        ac=[
            "Given migration is applied, when `\\d reference_schemas` is shown, then columns include all 14 from §5.2 plus UNIQUE(org_id, table_code, column_code).",
            "Given migration is applied, when `\\d schema_migrations` is shown, then status enum includes pending/approved/running/completed/failed/rolled_back.",
            "Given a row with data_type='boolean' is inserted, when constraint runs, then insert is rejected (only text/number/date/enum/formula/relation allowed).",
        ],
        red_cmd="pnpm --filter @monopilot/web drizzle-kit migrate && pnpm vitest run apps/web/db/migrations/__tests__/schema-metadata.test.ts",
        files=[
            "apps/web/db/schema/schema-metadata.ts [create]",
            "apps/web/db/migrations/ [create]",
            "apps/web/db/migrations/__tests__/schema-metadata.test.ts [create]",
        ],
    ),
    labels=["prd", "data", "schema-metadata", "T1-schema"],
    priority=80,
    category="data",
    subcategory="schema-metadata",
    task_type="T1-schema",
    parent_feature="02-settings-c",
    prd_refs=["§5.2", "ADR-028"],
    description="Schema admin wizard storage tables.",
    details=(
        "Use Postgres CHECK constraints for data_type and tier enums (do not create enum types — "
        "PRD style is TEXT + CHECK). Create indexes per common access (org_id, table_code)."
    ),
    scope_files=[
        "apps/web/db/schema/schema-metadata.ts",
        "apps/web/db/migrations/",
        "apps/web/db/migrations/__tests__/schema-metadata.test.ts",
    ],
    acceptance_criteria=[
        "Both tables created exactly per §5.2.",
        "data_type and tier CHECK constraints enforce allowed values.",
        "RLS policy on reference_schemas enforces org_id scope.",
        "vitest migration test green.",
    ],
    test_strategy=[
        "RED: assert table shape + constraint rejection.",
        "GREEN: emit migration.",
    ],
    risk_red_lines=[
        "Do not shortcut by allowing free-form data_type values.",
    ],
    skills=["test-driven-development"],
    dependencies=["T-004"],
    cov_section="§5.2",
    cov_requirement="reference_schemas + schema_migrations storage",
)

add_task(
    num=6,
    title="Drizzle migration: rule_definitions + rule_dry_runs (ADR-029)",
    prompt=std_prompt(
        "T-006", "Drizzle migration: rule registry tables",
        body=(
            "Create Drizzle + SQL migration for §5.3 rule registry: rule_definitions and rule_dry_runs. "
            "Read-only registry per Q2 decision; org-scoped RLS. Unique (org_id, rule_code, version)."
        ),
        ac=[
            "Given migration is applied, when `\\d rule_definitions` is shown, then UNIQUE(org_id, rule_code, version) constraint exists.",
            "Given migration is applied, when `\\d rule_dry_runs` is shown, then FK rule_definition_id → rule_definitions(id) is set ON DELETE CASCADE.",
            "Given a duplicate (org_id, rule_code, version) insert attempt runs, when committed, then PostgreSQL rejects with 23505.",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run apps/web/db/migrations/__tests__/rule-registry.test.ts",
        files=[
            "apps/web/db/schema/rule-registry.ts [create]",
            "apps/web/db/migrations/ [create]",
            "apps/web/db/migrations/__tests__/rule-registry.test.ts [create]",
        ],
    ),
    labels=["prd", "data", "rule-registry", "T1-schema"],
    priority=80,
    category="data",
    subcategory="rule-registry-schema",
    task_type="T1-schema",
    parent_feature="02-settings-d",
    prd_refs=["§5.3", "§7", "ADR-029"],
    description="Rule registry storage tables.",
    details=(
        "rule_type CHECK (cascading, conditional, gate, workflow). Tier CHECK (L1..L4). RLS scoped. "
        "Index on (org_id, rule_code) for registry list queries."
    ),
    scope_files=[
        "apps/web/db/schema/rule-registry.ts",
        "apps/web/db/migrations/",
        "apps/web/db/migrations/__tests__/rule-registry.test.ts",
    ],
    acceptance_criteria=[
        "Both tables created with §5.3 shape.",
        "Unique + FK constraints enforced.",
        "RLS policy applied.",
        "vitest migration test green.",
    ],
    test_strategy=[
        "RED: write migration test asserting shape + constraint.",
        "GREEN: emit migration.",
    ],
    risk_red_lines=[
        "Do not add edit endpoints — registry is read-only per Q2.",
    ],
    skills=["test-driven-development"],
    dependencies=["T-004"],
    parallel_safe_with=["T-005"],
    cov_section="§5.3, §7",
    cov_requirement="rule_definitions + rule_dry_runs schema",
)

add_task(
    num=7,
    title="Drizzle migration: tenant_variations + tenant_migrations (ADR-031)",
    prompt=std_prompt(
        "T-007", "Drizzle migration: multi-tenant L2 tables",
        body=(
            "Create Drizzle + SQL migration for §5.4 multi-tenant L2 storage: tenant_variations and "
            "tenant_migrations. Status enum CHECK on tenant_migrations."
        ),
        ac=[
            "Given migration is applied, when `\\d tenant_variations` is shown, then PRIMARY KEY (org_id) is set.",
            "Given migration is applied, when `\\d tenant_migrations` is shown, then status CHECK accepts only scheduled/canary/progressive/completed/rolled_back/force_scheduled.",
            "Given org row is deleted, when cascade runs, then matching tenant_variations row is removed.",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run apps/web/db/migrations/__tests__/tenant-l2.test.ts",
        files=[
            "apps/web/db/schema/tenant-l2.ts [create]",
            "apps/web/db/migrations/ [create]",
            "apps/web/db/migrations/__tests__/tenant-l2.test.ts [create]",
        ],
    ),
    labels=["prd", "data", "tenant-l2", "T1-schema"],
    priority=80,
    category="data",
    subcategory="tenant-l2-schema",
    task_type="T1-schema",
    parent_feature="02-settings-b",
    prd_refs=["§5.4", "§9", "ADR-031"],
    description="Tenant L2 variations + migration orchestration tables.",
    details=(
        "tenant_variations is 1:1 with organizations (PK org_id, FK CASCADE). tenant_migrations is "
        "history with canary_pct numeric + status CHECK + scheduled_by FK users."
    ),
    scope_files=[
        "apps/web/db/schema/tenant-l2.ts",
        "apps/web/db/migrations/",
        "apps/web/db/migrations/__tests__/tenant-l2.test.ts",
    ],
    acceptance_criteria=[
        "Both tables created per §5.4.",
        "Status CHECK constraint enforces enum.",
        "FK CASCADE behavior verified by test.",
        "vitest green.",
    ],
    test_strategy=[
        "RED: shape + cascade + CHECK reject test.",
        "GREEN: emit migration.",
    ],
    risk_red_lines=[
        "Do not couple tenant_variations to per-tenant DB schema (L4 deferred).",
    ],
    skills=["test-driven-development"],
    dependencies=["T-004"],
    parallel_safe_with=["T-005", "T-006"],
    cov_section="§5.4, §9",
    cov_requirement="tenant_variations + tenant_migrations storage",
)

add_task(
    num=8,
    title="Drizzle migration: reference_tables generic storage + materialized view per org",
    prompt=std_prompt(
        "T-008", "Drizzle migration: reference_tables generic storage",
        body=(
            "Create §5.5 reference_tables generic storage with PRIMARY KEY(org_id, table_code, "
            "row_key) + per-org materialized view template for hot dropdown lookups. RLS + audit "
            "trigger hook stub (audit log wired in T-014)."
        ),
        ac=[
            "Given migration is applied, when `\\d reference_tables` is shown, then PK is (org_id, table_code, row_key); columns include row_data JSONB + version + is_active + display_order.",
            "Given a row is upserted, when version is checked, then it auto-increments via UPDATE trigger (`reference_tables_version_inc`).",
            "Given a per-org materialized view function `refresh_reference_dropdowns(org_id, table_code)` is created, when invoked, then it refreshes a per-table MV (e.g. `mv_ref_pack_sizes_<org>`).",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run apps/web/db/migrations/__tests__/reference-tables.test.ts",
        files=[
            "apps/web/db/schema/reference-tables.ts [create]",
            "apps/web/db/migrations/ [create]",
            "apps/web/db/migrations/__tests__/reference-tables.test.ts [create]",
        ],
    ),
    labels=["prd", "data", "reference-tables", "T1-schema"],
    priority=80,
    category="data",
    subcategory="reference-tables-schema",
    task_type="T1-schema",
    parent_feature="02-settings-d",
    prd_refs=["§5.5", "§8.4"],
    description="Generic metadata-driven storage for 25 reference tables.",
    details=(
        "PRD §5.5 explicitly chose generic storage over 25 dedicated tables. Trigger increments "
        "`version` on UPDATE only when row_data differs. RLS applies to reference_tables. "
        "Materialized view is opt-in per (org_id, table_code) — not auto-created."
    ),
    scope_files=[
        "apps/web/db/schema/reference-tables.ts",
        "apps/web/db/migrations/",
        "apps/web/db/migrations/__tests__/reference-tables.test.ts",
    ],
    acceptance_criteria=[
        "Generic table shape per §5.5; PK + version + is_active.",
        "Version trigger auto-increments on row_data change.",
        "MV refresh function created and callable.",
        "vitest green.",
    ],
    test_strategy=[
        "RED: assert shape + trigger + MV refresh.",
        "GREEN: emit migration + plpgsql function.",
    ],
    risk_red_lines=[
        "Do not create dedicated per-table tables; PRD enforces generic storage.",
    ],
    skills=["test-driven-development"],
    dependencies=["T-004"],
    parallel_safe_with=["T-005", "T-006", "T-007"],
    cov_section="§5.5, §8.4",
    cov_requirement="reference_tables generic storage + version trigger",
)

add_task(
    num=9,
    title="Drizzle migration: infrastructure (warehouses/locations/machines/lines)",
    prompt=std_prompt(
        "T-009", "Drizzle migration: infrastructure tables",
        body=(
            "Create §5.6 infrastructure tables: warehouses, locations (with materialized ltree path), "
            "machines, production_lines, line_machines. Plus master tables allergens + org_allergens "
            "+ tax_codes."
        ),
        ac=[
            "Given migration is applied, when `\\d locations` is shown, then `path` is TEXT (materialized ltree) and indexed with `gist (path gist_trgm_ops)` (or btree if ltree extension absent — explicit fallback in migration).",
            "Given migration is applied, when `\\d allergens` is shown, then PK is `code` and seed migration loads EU-14 codes A01..A14.",
            "Given migration is applied, when `\\d tax_codes` is shown, then UNIQUE(org_id, code, effective_from) holds.",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run apps/web/db/migrations/__tests__/infra-master.test.ts",
        files=[
            "apps/web/db/schema/infra-master.ts [create]",
            "apps/web/db/migrations/ [create]",
            "apps/web/db/seeds/eu-14-allergens.sql [create]",
            "apps/web/db/migrations/__tests__/infra-master.test.ts [create]",
        ],
    ),
    labels=["prd", "data", "infrastructure", "T1-schema"],
    priority=80,
    category="data",
    subcategory="infra-master-schema",
    task_type="T1-schema",
    parent_feature="02-settings-e",
    prd_refs=["§5.6", "§12.1"],
    description="Warehouses, locations (ltree), machines, lines, master allergens/tax_codes.",
    details=(
        "ltree extension may or may not be available in target Postgres; if not, store path as text "
        "+ ascii separator '/'. Document the choice in migration comment. Seed EU-14 allergens A01..A14 "
        "with PL/EN names."
    ),
    scope_files=[
        "apps/web/db/schema/infra-master.ts",
        "apps/web/db/migrations/",
        "apps/web/db/seeds/eu-14-allergens.sql",
        "apps/web/db/migrations/__tests__/infra-master.test.ts",
    ],
    acceptance_criteria=[
        "All 7 tables created per §5.6.",
        "ltree (or fallback) path indexing operational.",
        "EU-14 allergens seeded.",
        "vitest green.",
    ],
    test_strategy=[
        "RED: assert shape + seed presence.",
        "GREEN: emit migration + seed.",
    ],
    risk_red_lines=[
        "Do not hard-fail if ltree extension unavailable — provide fallback.",
    ],
    skills=["test-driven-development"],
    dependencies=["T-004"],
    parallel_safe_with=["T-005", "T-006", "T-007", "T-008"],
    cov_section="§5.6, §12.1",
    cov_requirement="Infrastructure + master allergens + tax_codes schema",
)

add_task(
    num=10,
    title="Drizzle migration: audit_log monthly partitioning (ADR-008)",
    prompt=std_prompt(
        "T-010", "Drizzle migration: partitioned audit_log",
        body=(
            "Create §5.6 audit_log table partitioned by RANGE(created_at) monthly with auto-partition "
            "creation function `audit_log_create_partitions(months_ahead INT)`. Retain 7 years."
        ),
        ac=[
            "Given migration is applied, when `\\dt+` is shown, then `audit_log` is PARTITIONED BY RANGE (created_at) and 12 monthly child partitions exist for the current year.",
            "Given a row is inserted into audit_log with created_at in next month, when child partition is missing, then the migration's pg_cron-equivalent creator function auto-provisions it.",
            "Given an old partition older than 84 months exists, when the retention helper runs, then it is DETACHED (not dropped — manual archival).",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run apps/web/db/migrations/__tests__/audit-log.test.ts",
        files=[
            "apps/web/db/schema/audit-log.ts [create]",
            "apps/web/db/migrations/ [create]",
            "apps/web/db/migrations/__tests__/audit-log.test.ts [create]",
        ],
    ),
    labels=["prd", "data", "audit-log", "T1-schema"],
    priority=80,
    category="data",
    subcategory="audit-log-schema",
    task_type="T1-schema",
    parent_feature="02-settings-a",
    prd_refs=["§5.6", "ADR-008"],
    description="Partitioned audit_log with 7-year retention.",
    details=(
        "Use declarative partitioning (PARTITION BY RANGE). Provide `audit_log_create_partitions(N)` "
        "plpgsql function. Provide `audit_log_detach_old(months INT)` for retention. Schedule via "
        "pg_cron in a separate task (T-014)."
    ),
    scope_files=[
        "apps/web/db/schema/audit-log.ts",
        "apps/web/db/migrations/",
        "apps/web/db/migrations/__tests__/audit-log.test.ts",
    ],
    acceptance_criteria=[
        "audit_log partitioned monthly per ADR-008.",
        "12 child partitions created up-front for current year.",
        "Auto-create function operational.",
        "vitest green.",
    ],
    test_strategy=[
        "RED: assert partition count and creator function.",
        "GREEN: emit migration.",
    ],
    risk_red_lines=[
        "Do not drop old partitions automatically — DETACH only.",
    ],
    skills=["test-driven-development"],
    dependencies=["T-004"],
    parallel_safe_with=["T-005", "T-006", "T-007", "T-008", "T-009"],
    cov_section="§5.6, ADR-008",
    cov_requirement="Partitioned audit_log",
)

add_task(
    num=11,
    title="Drizzle migration: org_security_policies + login_attempts + password_history (S-U5)",
    prompt=std_prompt(
        "T-011", "Drizzle migration: security policy tables (S-U5)",
        body=(
            "Create §5.7 security tables with S-U5 amendments: password_complexity, password_expiry_days, "
            "session_idle_timeout_minutes (renamed), session_max_length_minutes, mfa_allowed_methods TEXT[]."
        ),
        ac=[
            "Given migration is applied, when `\\d org_security_policies` is shown, then columns include all S-U5 fields with their PRD defaults (12 / 'strong' / NULL / 5 / 60 / 480 / 5 / 'optional' / ['totp','sms']).",
            "Given a policy row insert sets `password_complexity='weird'`, when committed, then CHECK constraint rejects (only basic/standard/strong/custom allowed).",
            "Given migration creates `login_attempts` and `password_history`, when listed, then both have PK as defined in §5.7.",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run apps/web/db/migrations/__tests__/security-tables.test.ts",
        files=[
            "apps/web/db/schema/security.ts [create]",
            "apps/web/db/migrations/ [create]",
            "apps/web/db/migrations/__tests__/security-tables.test.ts [create]",
        ],
    ),
    labels=["prd", "auth", "security-policies", "T1-schema"],
    priority=80,
    category="auth",
    subcategory="security-policies-schema",
    task_type="T1-schema",
    parent_feature="02-settings-e",
    prd_refs=["§5.7", "§14.1", "S-U5"],
    description="Security policy + login attempts + password history.",
    details=(
        "All defaults exactly per §5.7 + §14.1 amendments. mfa_allowed_methods stored as TEXT[] with "
        "CHECK constraint that every element is in {totp, sms, webauthn}."
    ),
    scope_files=[
        "apps/web/db/schema/security.ts",
        "apps/web/db/migrations/",
        "apps/web/db/migrations/__tests__/security-tables.test.ts",
    ],
    acceptance_criteria=[
        "All three tables created with correct columns + defaults.",
        "CHECK constraints enforce enums.",
        "vitest green.",
    ],
    test_strategy=[
        "RED: shape + default + CHECK reject test.",
        "GREEN: emit migration.",
    ],
    risk_red_lines=[
        "Do not store plaintext passwords anywhere.",
    ],
    skills=["test-driven-development"],
    dependencies=["T-004"],
    parallel_safe_with=["T-005", "T-006", "T-007", "T-008", "T-009", "T-010"],
    cov_section="§5.7, §14.1, S-U5",
    cov_requirement="org_security_policies with S-U5 fields",
)

add_task(
    num=12,
    title="Drizzle migration: SSO + SCIM + IP allowlist (S-A1/S-A2/S-A3)",
    prompt=std_prompt(
        "T-012", "Drizzle migration: SSO + SCIM + IP allowlist",
        body=(
            "Create §14.5/14.6/14.7 tables: org_sso_config, scim_tokens, admin_ip_allowlist with "
            "argon2id token hashing column and CIDR INET column."
        ),
        ac=[
            "Given migration is applied, when `\\d org_sso_config` is shown, then idp_type CHECK accepts only saml_entra/saml_generic/oidc and `enforce_for_non_admins` defaults FALSE.",
            "Given migration is applied, when `\\d scim_tokens` is shown, then token_hash TEXT NOT NULL exists (no plaintext column).",
            "Given migration is applied, when `\\d admin_ip_allowlist` is shown, then `cidr` is INET NOT NULL with CHECK rejecting `0.0.0.0/0`.",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run apps/web/db/migrations/__tests__/sso-scim-ip.test.ts",
        files=[
            "apps/web/db/schema/sso-scim-ip.ts [create]",
            "apps/web/db/migrations/ [create]",
            "apps/web/db/migrations/__tests__/sso-scim-ip.test.ts [create]",
        ],
    ),
    labels=["prd", "auth", "sso-scim-ip", "T1-schema"],
    priority=80,
    category="auth",
    subcategory="sso-scim-ip-schema",
    task_type="T1-schema",
    parent_feature="02-settings-e",
    prd_refs=["§14.5", "§14.6", "§14.7", "S-A1", "S-A2", "S-A3"],
    description="SSO config, SCIM tokens, admin IP allowlist tables.",
    details=(
        "SSO oidc_client_secret is stored only as vault key reference. SCIM token_hash is argon2id "
        "(verification at runtime). IP allowlist CIDR INET with CHECK guarding against 0.0.0.0/0."
    ),
    scope_files=[
        "apps/web/db/schema/sso-scim-ip.ts",
        "apps/web/db/migrations/",
        "apps/web/db/migrations/__tests__/sso-scim-ip.test.ts",
    ],
    acceptance_criteria=[
        "Three tables created.",
        "CHECK constraints enforce idp_type and CIDR overlap rules.",
        "No plaintext columns for secrets.",
        "vitest green.",
    ],
    test_strategy=[
        "RED: shape + CHECK reject test.",
        "GREEN: emit migration.",
    ],
    risk_red_lines=[
        "Do not introduce plaintext secret column.",
        "Do not allow 0.0.0.0/0 in admin_ip_allowlist.",
    ],
    skills=["test-driven-development"],
    dependencies=["T-004"],
    parallel_safe_with=["T-011"],
    cov_section="§14.5, §14.6, §14.7, S-A1..A3",
    cov_requirement="SSO/SCIM/IP allowlist storage",
)

add_task(
    num=13,
    title="Drizzle migration: feature_flags_core + notification_preferences",
    prompt=std_prompt(
        "T-013", "Drizzle migration: feature_flags_core + notification_preferences",
        body=(
            "Create §10.2 feature_flags_core (built-in fallback) + §13.3 notification_preferences."
        ),
        ac=[
            "Given migration is applied, when `\\d feature_flags_core` is shown, then PK is (org_id, flag_code) and rolled_out_pct is INT default 0.",
            "Given migration is applied, when `\\d notification_preferences` is shown, then PK is (user_id, org_id, category, event).",
            "Given seed runs, when 4 core flags loaded, then maintenance_mode/integration.d365.enabled/scanner.pwa.enabled/npd.d365_builder.execute exist for the default org with is_enabled=false.",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run apps/web/db/migrations/__tests__/flags-prefs.test.ts",
        files=[
            "apps/web/db/schema/flags-prefs.ts [create]",
            "apps/web/db/migrations/ [create]",
            "apps/web/db/seeds/feature-flags-core.sql [create]",
            "apps/web/db/migrations/__tests__/flags-prefs.test.ts [create]",
        ],
    ),
    labels=["prd", "data", "flags-notifs", "T1-schema"],
    priority=80,
    category="data",
    subcategory="flags-notifs-schema",
    task_type="T1-schema",
    parent_feature="02-settings-b",
    prd_refs=["§10.2", "§13.3"],
    description="Feature flags fallback and notification preferences tables.",
    details="Seed exactly the 4 core flags from §10.2 list. PostHog flags are NOT mirrored here.",
    scope_files=[
        "apps/web/db/schema/flags-prefs.ts",
        "apps/web/db/migrations/",
        "apps/web/db/seeds/feature-flags-core.sql",
        "apps/web/db/migrations/__tests__/flags-prefs.test.ts",
    ],
    acceptance_criteria=[
        "Both tables created per spec.",
        "Seed loads 4 core flags.",
        "vitest green.",
    ],
    test_strategy=[
        "RED: shape + seed assertion.",
        "GREEN: emit migration + seed.",
    ],
    risk_red_lines=[
        "Do not mirror PostHog non-core flags into the fallback table.",
    ],
    skills=["test-driven-development"],
    dependencies=["T-004"],
    parallel_safe_with=["T-005", "T-006", "T-007", "T-008", "T-009", "T-010", "T-011", "T-012"],
    cov_section="§10.2, §13.3",
    cov_requirement="Feature flags core + notification prefs storage",
)

add_task(
    num=14,
    title="Audit trigger framework (write-on-change) + pg_cron retention",
    prompt=std_prompt(
        "T-014", "Audit trigger framework + pg_cron retention",
        body=(
            "Wire generic audit trigger that writes to `audit_log` on INSERT/UPDATE/DELETE for "
            "settings tables. Compute changed_fields. Schedule pg_cron job for partition "
            "creation + detach."
        ),
        ac=[
            "Given a row in users is updated, when the trigger fires, then audit_log gets (action='update', table_name='users', changed_fields[] populated, old_data + new_data JSONB).",
            "Given an UPDATE that does not change any column, when the trigger evaluates, then no audit_log row is written (skip-noop).",
            "Given pg_cron is enabled, when the daily job runs, then `audit_log_create_partitions(3)` and `audit_log_detach_old(84)` are invoked successfully.",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run apps/web/db/migrations/__tests__/audit-trigger.test.ts",
        files=[
            "apps/web/db/migrations/ [create]",
            "apps/web/db/migrations/__tests__/audit-trigger.test.ts [create]",
        ],
    ),
    labels=["prd", "data", "audit-trigger", "T1-schema"],
    priority=80,
    category="data",
    subcategory="audit-trigger",
    task_type="T1-schema",
    parent_feature="02-settings-a",
    prd_refs=["§5.6", "ADR-008"],
    description="Generic audit trigger writing to partitioned audit_log.",
    details=(
        "plpgsql FUNCTION audit_trigger() — read TG_TABLE_NAME, TG_OP, NEW/OLD, compute diff, write "
        "audit_log row with org_id from NEW.org_id (or OLD.org_id on DELETE). Attach trigger to "
        "users, roles, organization_modules, reference_tables, schema_migrations, rule_definitions."
    ),
    scope_files=[
        "apps/web/db/migrations/",
        "apps/web/db/migrations/__tests__/audit-trigger.test.ts",
    ],
    acceptance_criteria=[
        "Audit trigger created and attached to settings tables.",
        "changed_fields computation correct.",
        "Skip-noop guard works.",
        "pg_cron jobs scheduled.",
    ],
    test_strategy=[
        "RED: insert/update/delete and assert audit_log rows.",
        "GREEN: implement trigger.",
    ],
    risk_red_lines=[
        "Do not log sensitive secret columns (oidc_client_secret_vault_key etc.) verbatim.",
    ],
    skills=["test-driven-development"],
    dependencies=["T-004", "T-005", "T-006", "T-008", "T-009", "T-010", "T-011", "T-012"],
    cov_section="§5.6, ADR-008",
    cov_requirement="Generic audit trigger framework",
)

add_task(
    num=15,
    title="RLS policies + app.current_org_id middleware contract test",
    prompt=std_prompt(
        "T-015", "RLS contract: app.current_org_id enforcement",
        body=(
            "Add a contract test confirming RLS denies cross-tenant SELECT on every settings table. "
            "Add helper `withOrgContext(orgId, fn)` for Server Actions that runs `SET LOCAL "
            "app.current_org_id = ...` inside a transaction."
        ),
        ac=[
            "Given two orgs A and B exist, when a user authenticated as A reads users for B with `app.current_org_id` set to A, then the query returns 0 rows.",
            "Given the helper `withOrgContext(orgId, fn)` is invoked, when fn issues SQL, then SET LOCAL is active for the duration of the transaction only.",
            "Given the contract test runs across all 12 RLS-scoped tables, when executed, then each table denies cross-tenant access (12 assertions pass).",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run apps/web/lib/db/with-org-context.test.ts",
        files=[
            "apps/web/lib/db/with-org-context.ts [create]",
            "apps/web/lib/db/with-org-context.test.ts [create]",
        ],
    ),
    labels=["prd", "auth", "rls-contract", "T2-api"],
    priority=80,
    category="auth",
    subcategory="rls-helpers",
    task_type="T2-api",
    parent_feature="02-settings-a",
    prd_refs=["§5", "ADR-013"],
    description="RLS helper + cross-tenant contract test.",
    details=(
        "Helper opens transaction, runs SET LOCAL app.current_org_id = $1, calls fn, commits. "
        "Reject calls without orgId. Provide typed return."
    ),
    scope_files=[
        "apps/web/lib/db/with-org-context.ts",
        "apps/web/lib/db/with-org-context.test.ts",
    ],
    acceptance_criteria=[
        "Helper exists and is type-safe.",
        "Cross-tenant SELECT returns 0 rows on every settings table.",
        "vitest green for all 12 tables.",
    ],
    test_strategy=[
        "RED: write contract test for 12 tables.",
        "GREEN: implement helper + ensure RLS policies allow scope.",
    ],
    risk_red_lines=[
        "Do not bypass RLS by using a service role connection from app code.",
    ],
    skills=["test-driven-development"],
    dependencies=["T-004", "T-014"],
    cov_section="§5, ADR-013",
    cov_requirement="RLS contract test + withOrgContext helper",
)

# ─────────────────────────────────────────────────────────────────────────────
# T2-api — Server Actions (RBAC, users, roles, modules, references, schema, rules, security, sso, scim, ip, d365, email, onboarding, infra, l2, audit)
# ─────────────────────────────────────────────────────────────────────────────

add_task(
    num=16,
    title="Server Action: createOrganization + RBAC seed (10 system roles)",
    prompt=std_prompt(
        "T-016", "Server Action: createOrganization + role seed",
        body=(
            "Implement `createOrganization(input)` Server Action that creates an organization, seeds "
            "the 10 system roles (owner, admin, npd_manager, module_admin, planner, production_lead, "
            "quality_lead, warehouse_operator, auditor, viewer) with PRD-defined permissions arrays, "
            "and inserts an empty tenant_variations row."
        ),
        ac=[
            "Given valid input (slug, name, region='eu', tier='L2'), when action runs, then 1 organizations row + 10 roles rows + 1 tenant_variations row are inserted in a single transaction.",
            "Given a duplicate slug, when action runs, then it raises 'SLUG_TAKEN' typed error and rolls back.",
            "Given action commits, when outbox is queried, then `settings.org.created` event row is present.",
            "Given the role 'owner' is read, when permissions are inspected, then it includes every settings.* permission from T-001/T-002 enums.",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run apps/web/actions/orgs/create.test.ts",
        files=[
            "apps/web/actions/orgs/create.ts [create]",
            "apps/web/actions/orgs/create.test.ts [create]",
            "apps/web/lib/rbac/role-seed.ts [create]",
        ],
    ),
    labels=["prd", "api", "orgs-create", "T2-api"],
    priority=100,
    category="api",
    subcategory="orgs-create",
    task_type="T2-api",
    parent_feature="02-settings-a",
    prd_refs=["§3", "§5.1", "ADR-012"],
    description="Org creation + 10 system role seed Server Action.",
    details=(
        "Use Zod input schema. Wrap in withOrgContext NOT applicable here — org doesn't exist yet, "
        "so use a dedicated bootstrap connection that bypasses RLS only for organizations + roles + "
        "tenant_variations inserts. Outbox event must be transactional with the inserts."
    ),
    scope_files=[
        "apps/web/actions/orgs/create.ts",
        "apps/web/actions/orgs/create.test.ts",
        "apps/web/lib/rbac/role-seed.ts",
    ],
    acceptance_criteria=[
        "Single-transaction insert of org + 10 roles + tenant_variations.",
        "Duplicate slug → SLUG_TAKEN typed error.",
        "Outbox event written transactionally.",
        "Owner role has full settings.* permission set.",
    ],
    test_strategy=[
        "RED: assert 4 outcomes via vitest.",
        "GREEN: implement action.",
    ],
    risk_red_lines=[
        "Do not commit role permissions outside the locked enum.",
    ],
    skills=["test-driven-development"],
    dependencies=["T-001", "T-002", "T-003", "T-004", "T-007"],
    cov_section="§3, §5.1, ADR-012",
    cov_requirement="createOrganization + 10 system role seed",
)

add_task(
    num=17,
    title="Server Action: inviteUser with seat-limit pre-flight + 7-day TTL (S-U7/S-U8)",
    prompt=std_prompt(
        "T-017", "Server Action: inviteUser with seat-limit + TTL",
        body=(
            "Implement `inviteUser({email, roleCode, message?})` Server Action. Pre-flight per "
            "§5.1 comment: count active users vs seat_limit; reject SEAT_LIMIT_REACHED. Insert "
            "magic-link token with `invite_token_expires_at = now() + 7d`."
        ),
        ac=[
            "Given org has seat_limit=3 and 3 active users, when inviteUser runs, then it raises SEAT_LIMIT_REACHED (HTTP 409 surface) and inserts no row.",
            "Given a successful invite, when row is read, then invite_token_expires_at is exactly +7 days from now (±2s) and outbox event 'settings.user.invited' is present.",
            "Given an expired invite token is used to accept, when /api/auth/invite/accept runs, then it returns 410 GONE with INVITE_EXPIRED.",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run apps/web/actions/users/invite.test.ts",
        files=[
            "apps/web/actions/users/invite.ts [create]",
            "apps/web/actions/users/invite.test.ts [create]",
            "apps/web/app/api/auth/invite/accept/route.ts [create]",
        ],
    ),
    labels=["prd", "api", "users-invite", "T2-api"],
    priority=100,
    category="api",
    subcategory="users-invite",
    task_type="T2-api",
    parent_feature="02-settings-a",
    prd_refs=["§5.1", "S-U7", "S-U8", "V-SET-88", "V-SET-89"],
    description="inviteUser server action with seat-limit and 7-day TTL.",
    details=(
        "Pre-flight uses `SELECT seat_limit FROM organizations` + COUNT(active users). Token is "
        "Supabase Auth magic-link (configure JWT_EXP=604800 for invite). The accept route validates "
        "expires_at server-side."
    ),
    scope_files=[
        "apps/web/actions/users/invite.ts",
        "apps/web/actions/users/invite.test.ts",
        "apps/web/app/api/auth/invite/accept/route.ts",
    ],
    acceptance_criteria=[
        "Seat-limit pre-flight enforced (V-SET-89).",
        "TTL exactly 7 days enforced server-side (V-SET-88).",
        "Outbox event 'settings.user.invited' fires on success.",
        "Expired token returns 410 GONE.",
    ],
    test_strategy=[
        "RED: 3-case vitest (over-limit, success, expired).",
        "GREEN: implement action + accept route.",
    ],
    risk_red_lines=[
        "Do not allow client-side bypass of seat_limit check.",
        "Do not log invite tokens to stdout.",
    ],
    skills=["test-driven-development"],
    dependencies=["T-016"],
    cov_section="§5.1 S-U7, S-U8",
    cov_requirement="inviteUser server action with seat-limit + TTL",
)

add_task(
    num=18,
    title="Server Actions: assignRole, deactivateUser, resetPassword",
    prompt=std_prompt(
        "T-018", "Server Actions: role assign / deactivate / reset password",
        body=(
            "Implement three Server Actions: `assignRole(userId, roleCode)`, `deactivateUser(userId)`, "
            "`resetPassword(userId)`. Each guarded by `settings.users.*` or `settings.roles.assign` "
            "permission. Each emits outbox event."
        ),
        ac=[
            "Given the caller lacks `settings.roles.assign`, when assignRole runs, then it raises FORBIDDEN.",
            "Given deactivateUser runs successfully, when users row is read, then is_active=false and outbox event 'settings.user.deactivated' is present.",
            "Given resetPassword runs, when called, then it triggers Supabase Auth password reset email and revokes all active sessions for that user.",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run apps/web/actions/users/admin-actions.test.ts",
        files=[
            "apps/web/actions/users/assign-role.ts [create]",
            "apps/web/actions/users/deactivate.ts [create]",
            "apps/web/actions/users/reset-password.ts [create]",
            "apps/web/actions/users/admin-actions.test.ts [create]",
        ],
    ),
    labels=["prd", "api", "users-admin-actions", "T2-api"],
    priority=100,
    category="api",
    subcategory="users-admin-actions",
    task_type="T2-api",
    parent_feature="02-settings-a",
    prd_refs=["§3", "§5.1"],
    description="Role assignment, deactivation, password reset Server Actions.",
    details=(
        "Use a thin guard helper `requirePermission(perm)` that throws FORBIDDEN if the resolved "
        "user role lacks the permission. resetPassword must call Supabase Auth admin API + revoke "
        "all sessions in user_sessions (or equivalent)."
    ),
    scope_files=[
        "apps/web/actions/users/assign-role.ts",
        "apps/web/actions/users/deactivate.ts",
        "apps/web/actions/users/reset-password.ts",
        "apps/web/actions/users/admin-actions.test.ts",
    ],
    acceptance_criteria=[
        "Permission guards enforced.",
        "Outbox events for assign + deactivate.",
        "resetPassword revokes active sessions.",
    ],
    test_strategy=[
        "RED: per-action vitest case.",
        "GREEN: implement.",
    ],
    risk_red_lines=[
        "Do not allow self-deactivation (V-SET should reject).",
    ],
    skills=["test-driven-development"],
    dependencies=["T-016"],
    cov_section="§3, §5.1",
    cov_requirement="Role/deactivate/reset Server Actions",
)

add_task(
    num=19,
    title="Server Action: toggleModule + dependency check (V-SET-40)",
    prompt=std_prompt(
        "T-019", "Server Action: toggleModule with dependency chain check",
        body=(
            "Implement `toggleModule(moduleCode, enabled)` action. Reject disable if any downstream "
            "module is enabled (use `modules.dependencies` graph traversal). On enable, create "
            "organization_modules row if missing."
        ),
        ac=[
            "Given module '08-production' is enabled and admin tries to disable '04-planning-basic', when action runs, then it returns DISABLE_CHAIN_BLOCKED with the list of dependent modules.",
            "Given a valid toggle ON, when action commits, then organization_modules row has enabled=true, enabled_at=now(), enabled_by=user_id, and outbox event 'settings.module.toggled' is present.",
            "Given a valid toggle OFF on a leaf module, when action commits, then enabled=false and event is emitted.",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run apps/web/actions/modules/toggle.test.ts",
        files=[
            "apps/web/actions/modules/toggle.ts [create]",
            "apps/web/actions/modules/toggle.test.ts [create]",
        ],
    ),
    labels=["prd", "api", "modules-toggle", "T2-api"],
    priority=100,
    category="api",
    subcategory="modules-toggle",
    task_type="T2-api",
    parent_feature="02-settings-b",
    prd_refs=["§10.1", "V-SET-40"],
    description="Module toggle Server Action with dependency chain validation.",
    details=(
        "Walk modules.dependencies graph. Reject disable if any reverse-dep is enabled. Allow "
        "force-disable only with explicit `force: true` (separate test case). 15 modules from §10.1 "
        "table."
    ),
    scope_files=[
        "apps/web/actions/modules/toggle.ts",
        "apps/web/actions/modules/toggle.test.ts",
    ],
    acceptance_criteria=[
        "Chain check correct for 15-module graph.",
        "Outbox event emitted.",
        "Force flag bypasses with audit reason.",
    ],
    test_strategy=[
        "RED: 3 cases (block, ON, OFF).",
        "GREEN: implement.",
    ],
    risk_red_lines=[
        "Do not allow disabling 00-foundation or 02-settings (can_disable=false).",
    ],
    skills=["test-driven-development"],
    dependencies=["T-016"],
    cov_section="§10.1, V-SET-40",
    cov_requirement="toggleModule action",
)

add_task(
    num=20,
    title="Server Action: maintenance_mode + integration.d365.enabled flag flip with V-SET-42",
    prompt=std_prompt(
        "T-020", "Server Actions: feature_flags_core flip",
        body=(
            "Implement `setCoreFlag(flagCode, enabled, rolloutPct?)`. For "
            "`integration.d365.enabled=true`, V-SET-42 must run: 5 d365_constants rows present + "
            "test connection passed. For `maintenance_mode=true`, also set middleware kill-switch."
        ),
        ac=[
            "Given flag='integration.d365.enabled' and only 4 d365_constants rows exist, when flip to true is attempted, then action raises D365_CONSTANTS_MISSING.",
            "Given flag='maintenance_mode' and caller has settings.flags.edit, when flipped to true, then feature_flags_core row updated and outbox event 'settings.module.toggled' (with flag_code) emitted.",
            "Given flag flip succeeds, when audit_log queried, then a row with action='update' table_name='feature_flags_core' is present with old/new diff.",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run apps/web/actions/flags/set-core.test.ts",
        files=[
            "apps/web/actions/flags/set-core.ts [create]",
            "apps/web/actions/flags/set-core.test.ts [create]",
        ],
    ),
    labels=["prd", "api", "flags-core", "T2-api"],
    priority=100,
    category="api",
    subcategory="flags-core",
    task_type="T2-api",
    parent_feature="02-settings-b",
    prd_refs=["§10.2", "§11.4", "V-SET-42", "V-SET-50", "V-SET-52"],
    description="Core feature flag flip with V-SET-42 D365 pre-check.",
    details=(
        "V-SET-42 = 5 d365_constants rows populated; V-SET-50 = constants populated; V-SET-52 = test "
        "connection passes (call SM-08 logic from T-040 D365 test connection action). For "
        "non-D365 flags, only RBAC + audit are needed."
    ),
    scope_files=[
        "apps/web/actions/flags/set-core.ts",
        "apps/web/actions/flags/set-core.test.ts",
    ],
    acceptance_criteria=[
        "D365 pre-flight enforced.",
        "Audit log row written via trigger.",
        "Outbox event emitted.",
    ],
    test_strategy=[
        "RED: 3 cases (D365 fail, maintenance success, audit row).",
        "GREEN: implement.",
    ],
    risk_red_lines=[
        "Do not flip integration.d365.enabled without all guards.",
    ],
    skills=["test-driven-development"],
    dependencies=["T-013", "T-016"],
    cov_section="§10.2, §11.4, V-SET-42",
    cov_requirement="setCoreFlag with D365 pre-flight",
)

add_task(
    num=21,
    title="Server Actions: reference_tables CRUD (list/get/upsert/delete) + version optimistic lock",
    prompt=std_prompt(
        "T-021", "Server Actions: reference CRUD with optimistic lock",
        body=(
            "Implement reference_tables CRUD Server Actions: `listRows`, `getRow`, `upsertRow`, "
            "`softDeleteRow`. Use `version` for optimistic concurrency: client sends version; server "
            "rejects with VERSION_CONFLICT if mismatch."
        ),
        ac=[
            "Given client sends version=2 and current row has version=3, when upsertRow runs, then it raises VERSION_CONFLICT and returns the latest row.",
            "Given softDeleteRow runs on a row referenced by reference_schemas.dropdown_source, when committed, then a warning ('REFERENCED_BY_SCHEMA') is returned but the soft-delete proceeds (per V-SET-22 — warning, not blocker).",
            "Given upsertRow inserts new row, when MV refresh function exists, then it is invoked for that (org_id, table_code).",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run apps/web/actions/reference/crud.test.ts",
        files=[
            "apps/web/actions/reference/list.ts [create]",
            "apps/web/actions/reference/get.ts [create]",
            "apps/web/actions/reference/upsert.ts [create]",
            "apps/web/actions/reference/soft-delete.ts [create]",
            "apps/web/actions/reference/crud.test.ts [create]",
        ],
    ),
    labels=["prd", "api", "reference-crud", "T2-api"],
    priority=100,
    category="api",
    subcategory="reference-crud",
    task_type="T2-api",
    parent_feature="02-settings-d",
    prd_refs=["§8.3", "§8.4", "V-SET-20", "V-SET-21", "V-SET-22"],
    description="Reference tables CRUD Server Actions.",
    details=(
        "Use Zod schema generated per (org_id, table_code) from reference_schemas (T-024 generator). "
        "Concurrent edit detection: increment version only when row_data changed (trigger from T-008)."
    ),
    scope_files=[
        "apps/web/actions/reference/list.ts",
        "apps/web/actions/reference/get.ts",
        "apps/web/actions/reference/upsert.ts",
        "apps/web/actions/reference/soft-delete.ts",
        "apps/web/actions/reference/crud.test.ts",
    ],
    acceptance_criteria=[
        "VERSION_CONFLICT correctly raised.",
        "FK warning surfaces (V-SET-22).",
        "MV refresh on mutation.",
        "RBAC guards enforced via settings.reference.* permissions.",
    ],
    test_strategy=[
        "RED: 3 cases.",
        "GREEN: implement.",
    ],
    risk_red_lines=[
        "Do not skip version check.",
    ],
    skills=["test-driven-development"],
    dependencies=["T-008", "T-016"],
    cov_section="§8.3, §8.4",
    cov_requirement="Reference CRUD Server Actions",
)

add_task(
    num=22,
    title="Server Actions: reference CSV import + export with conflict report (V-SET-23)",
    prompt=std_prompt(
        "T-022", "Server Actions: reference CSV import/export",
        body=(
            "Implement `importReferenceCsv(tableCode, csv)` returning a preview report (insert/update/skip/error) "
            "plus `commitReferenceImport(reportId)` and `exportReferenceCsv(tableCode)`."
        ),
        ac=[
            "Given a CSV with headers that don't match reference_schemas.columns (case-insensitive trim), when importReferenceCsv runs, then it raises CSV_HEADER_MISMATCH (V-SET-23).",
            "Given the preview report shows 3 inserts, 2 updates, 1 skip, 1 error, when commitReferenceImport runs, then 5 rows are persisted (errors excluded) and the response summarizes counts.",
            "Given exportReferenceCsv runs for `pack_sizes`, when streamed, then it returns a CSV with header columns from reference_schemas and active rows only.",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run apps/web/actions/reference/csv.test.ts",
        files=[
            "apps/web/actions/reference/import-csv.ts [create]",
            "apps/web/actions/reference/export-csv.ts [create]",
            "apps/web/actions/reference/csv.test.ts [create]",
        ],
    ),
    labels=["prd", "api", "reference-csv", "T2-api"],
    priority=100,
    category="api",
    subcategory="reference-csv",
    task_type="T2-api",
    parent_feature="02-settings-d",
    prd_refs=["§8.5", "V-SET-23"],
    description="Reference CSV import/export with conflict detection.",
    details=(
        "Use `papaparse` for CSV parse. Preview report stored in transient table or temp dir keyed by "
        "reportId; expires in 1h. Commit re-validates. Export streams via Server Action returning a "
        "Response with Content-Disposition."
    ),
    scope_files=[
        "apps/web/actions/reference/import-csv.ts",
        "apps/web/actions/reference/export-csv.ts",
        "apps/web/actions/reference/csv.test.ts",
    ],
    acceptance_criteria=[
        "Header validation enforced (V-SET-23).",
        "Preview/commit two-step model works.",
        "Export streams CSV with correct headers.",
    ],
    test_strategy=[
        "RED: 3 cases.",
        "GREEN: implement.",
    ],
    risk_red_lines=[
        "Do not commit on import without explicit two-step confirmation.",
    ],
    skills=["test-driven-development"],
    dependencies=["T-021"],
    cov_section="§8.5, V-SET-23",
    cov_requirement="Reference CSV import/export",
)

add_task(
    num=23,
    title="Server Actions: schema admin wizard (addColumn/editColumn/deprecate + dry-run)",
    prompt=std_prompt(
        "T-023", "Server Actions: schema admin wizard",
        body=(
            "Implement `addSchemaColumn`, `editSchemaColumn`, `deprecateSchemaColumn` Server Actions "
            "writing to reference_schemas + schema_migrations. Tier auto-detection per §6.2; L1 "
            "promotion creates schema_migrations row with status='pending' (no DDL run)."
        ),
        ac=[
            "Given input data_type='boolean', when addSchemaColumn runs, then it raises INVALID_DATA_TYPE (V-SET-01) referencing the allowed enum.",
            "Given dropdown_source='nonexistent_table', when addSchemaColumn runs, then it raises DROPDOWN_SOURCE_FK_VIOLATION (V-SET-02).",
            "Given action='promote_l2_to_l1' triggered without approved_by, when committed, then schema_migrations.status='pending' and no DDL is executed (V-SET-03).",
            "Given concurrent edit detected (schema_version mismatch on publish), when action runs, then it raises CONCURRENT_EDIT (V-SET-04) returning the diff.",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run apps/web/actions/schema/wizard.test.ts",
        files=[
            "apps/web/actions/schema/add-column.ts [create]",
            "apps/web/actions/schema/edit-column.ts [create]",
            "apps/web/actions/schema/deprecate-column.ts [create]",
            "apps/web/actions/schema/wizard.test.ts [create]",
        ],
    ),
    labels=["prd", "api", "schema-wizard", "T2-api"],
    priority=100,
    category="api",
    subcategory="schema-wizard",
    task_type="T2-api",
    parent_feature="02-settings-c",
    prd_refs=["§6.1", "§6.2", "§6.3", "§6.7", "ADR-028"],
    description="Schema admin wizard Server Actions (no DDL).",
    details=(
        "Tier auto-detection table from §6.2: scope=universal→L1 (promotion path), variation→L2, "
        "org-specific→L3. L1 promotion creates schema_migrations row only — no DDL execution here."
    ),
    scope_files=[
        "apps/web/actions/schema/add-column.ts",
        "apps/web/actions/schema/edit-column.ts",
        "apps/web/actions/schema/deprecate-column.ts",
        "apps/web/actions/schema/wizard.test.ts",
    ],
    acceptance_criteria=[
        "V-SET-01..04 all enforced.",
        "L1 promotion routed to migration queue, never to live DDL.",
        "Outbox event 'settings.schema.migration_requested' emitted.",
    ],
    test_strategy=[
        "RED: 4 cases.",
        "GREEN: implement.",
    ],
    risk_red_lines=[
        "Do not execute DDL from this action — that lives in approver tooling out of scope.",
    ],
    skills=["test-driven-development"],
    dependencies=["T-005", "T-016"],
    cov_section="§6, ADR-028",
    cov_requirement="Schema wizard Server Actions",
)

add_task(
    num=24,
    title="Server Action: Zod runtime generator (per org_id + schema_version) + cache",
    prompt=std_prompt(
        "T-024", "Zod runtime schema generator",
        body=(
            "Implement `getZodSchemaForTable(tableCode)` that reads reference_schemas + builds a Zod "
            "schema using `json-schema-to-zod`. Cache per (org_id, table_code, schema_version)."
        ),
        ac=[
            "Given two consecutive calls within the cache TTL, when invoked, then the underlying DB query runs only once (cache hit on second call).",
            "Given a column with regex='^[A-Z]{3}$', when generated, then the Zod schema rejects 'abc' and accepts 'ABC'.",
            "Given a deprecated column referenced, when generation runs, then it is excluded (V-SET-05) and a debug log notes the omission.",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run apps/web/lib/schema/zod-runtime.test.ts",
        files=[
            "apps/web/lib/schema/zod-runtime.ts [create]",
            "apps/web/lib/schema/zod-runtime.test.ts [create]",
        ],
    ),
    labels=["prd", "api", "zod-runtime", "T2-api"],
    priority=100,
    category="api",
    subcategory="zod-runtime",
    task_type="T2-api",
    parent_feature="02-settings-c",
    prd_refs=["§6.5", "V-SET-05"],
    description="Server-side Zod schema generator with cache.",
    details=(
        "Cache via in-process LRU keyed on (org_id, table_code, schema_version), TTL 60s. Use "
        "react cache in RSC if applicable. Invalidation hook on schema_migrations completion."
    ),
    scope_files=[
        "apps/web/lib/schema/zod-runtime.ts",
        "apps/web/lib/schema/zod-runtime.test.ts",
    ],
    acceptance_criteria=[
        "Cache hit on repeat call.",
        "Regex validation honored.",
        "Deprecated columns excluded.",
    ],
    test_strategy=[
        "RED: 3 cases.",
        "GREEN: implement.",
    ],
    risk_red_lines=[
        "Do not eval untrusted user-supplied JSON Schema; sanitize input first.",
    ],
    skills=["test-driven-development"],
    dependencies=["T-005", "T-008"],
    cov_section="§6.5",
    cov_requirement="Zod runtime generator + cache",
)

add_task(
    num=25,
    title="Server Action: rule registry list/detail + dry-run results query (read-only)",
    prompt=std_prompt(
        "T-025", "Server Actions: rule registry read-only",
        body=(
            "Implement read-only Server Actions for rule registry: `listRules({type, dept, active, "
            "dryrunFail}?)`, `getRuleDetail(code, version?)`, `listRuleDryRuns(ruleId, paginate)`. "
            "No write endpoints (per Q2)."
        ),
        ac=[
            "Given filter type='gate', when listRules runs, then only rule_definitions rows where rule_type='gate' are returned, ordered by rule_code ASC.",
            "Given a rule has 3 versions, when getRuleDetail(code) is called without version, then it returns the active version (active_to IS NULL) plus a `versions[]` array of historical versions.",
            "Given the caller lacks settings.rules.view, when any action runs, then it raises FORBIDDEN.",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run apps/web/actions/rules/registry.test.ts",
        files=[
            "apps/web/actions/rules/list.ts [create]",
            "apps/web/actions/rules/get.ts [create]",
            "apps/web/actions/rules/dry-runs.ts [create]",
            "apps/web/actions/rules/registry.test.ts [create]",
        ],
    ),
    labels=["prd", "api", "rules-registry", "T2-api"],
    priority=100,
    category="api",
    subcategory="rules-registry",
    task_type="T2-api",
    parent_feature="02-settings-d",
    prd_refs=["§7.2", "§7.6"],
    description="Read-only rule registry Server Actions.",
    details=(
        "Per §7.6 surfaces SET-040 / SET-041. Return shape suitable for shadcn Tabs in detail view "
        "(definition_json, versions[], dry_runs[], audit summary)."
    ),
    scope_files=[
        "apps/web/actions/rules/list.ts",
        "apps/web/actions/rules/get.ts",
        "apps/web/actions/rules/dry-runs.ts",
        "apps/web/actions/rules/registry.test.ts",
    ],
    acceptance_criteria=[
        "Filter behavior correct.",
        "Active version resolved.",
        "RBAC enforced.",
    ],
    test_strategy=[
        "RED: 3 cases.",
        "GREEN: implement.",
    ],
    risk_red_lines=[
        "Do not introduce write endpoints in this task.",
    ],
    skills=["test-driven-development"],
    dependencies=["T-006", "T-016"],
    cov_section="§7.2, §7.6",
    cov_requirement="Rule registry read-only Server Actions",
)

add_task(
    num=26,
    title="CI deploy script: rules JSON → rule_definitions upsert with V-SET-14 schema check",
    prompt=std_prompt(
        "T-026", "Rules deploy migration script",
        body=(
            "Author CI deploy migration that scans `/rules/<type>/<rule_code>.json`, validates each "
            "against `<rule_code>.schema.json` (V-SET-14), and upserts rule_definitions (version+1, "
            "active_to=NULL on prior). Audit + outbox event on each deploy."
        ),
        ac=[
            "Given a rule JSON missing its sibling .schema.json file, when deploy runs, then it exits non-zero with V_SET_14_VIOLATION and writes nothing.",
            "Given a valid new rule JSON, when deploy runs, then a new rule_definitions row is inserted with version=N+1 and the prior version's active_to is set to now().",
            "Given the deploy commits, when outbox is queried, then 'settings.rule.deployed' event with deploy_ref=git_sha is present.",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run scripts/rules-deploy.test.ts",
        files=[
            "scripts/rules-deploy.ts [create]",
            "scripts/rules-deploy.test.ts [create]",
            "rules/.gitkeep [create]",
        ],
    ),
    labels=["prd", "infra", "rules-deploy", "T2-api"],
    priority=100,
    category="infra",
    subcategory="rules-deploy",
    task_type="T2-api",
    parent_feature="02-settings-d",
    prd_refs=["§7.3", "V-SET-14"],
    description="Rules CI deploy migration script.",
    details=(
        "Runs as Node script in CI. JSON Schema for each rule_type is in `rules/_schemas/<rule_type>.schema.json` "
        "(stub created in T-068). Idempotent: re-running with unchanged JSON should result in NO-OP, not version bump."
    ),
    scope_files=[
        "scripts/rules-deploy.ts",
        "scripts/rules-deploy.test.ts",
        "rules/.gitkeep",
    ],
    acceptance_criteria=[
        "V-SET-14 enforced.",
        "Version bump correct.",
        "Idempotent on no-change.",
        "Outbox event emitted.",
    ],
    test_strategy=[
        "RED: 3 cases via fixtures.",
        "GREEN: implement.",
    ],
    risk_red_lines=[
        "Do not run from app at request time — CI/CD only.",
    ],
    skills=["test-driven-development"],
    dependencies=["T-006"],
    cov_section="§7.3, V-SET-14",
    cov_requirement="Rules deploy migration script",
)

add_task(
    num=27,
    title="Server Actions: tenant_variations CRUD (dept overrides, rule variant, feature flags)",
    prompt=std_prompt(
        "T-027", "Server Actions: tenant_variations editor",
        body=(
            "Implement Server Actions: `getTenantVariations`, `setDeptOverrides(deptOverrides)`, "
            "`setRuleVariantOverrides(map)`, `setLocalFlag(flag, value)`. Each writes JSONB partial "
            "update + audit + outbox event."
        ),
        ac=[
            "Given setDeptOverrides input has duplicate target codes, when called, then it raises DUPLICATE_TARGET (V-SET-30).",
            "Given setRuleVariantOverrides references rule version that does not exist, when called, then it raises VARIANT_NOT_FOUND (V-SET-31).",
            "Given setLocalFlag toggles a flag, when committed, then audit_log row + outbox event 'settings.module.toggled' (with flag scope=tenant) are present.",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run apps/web/actions/tenant/variations.test.ts",
        files=[
            "apps/web/actions/tenant/get.ts [create]",
            "apps/web/actions/tenant/set-dept.ts [create]",
            "apps/web/actions/tenant/set-rule-variant.ts [create]",
            "apps/web/actions/tenant/set-local-flag.ts [create]",
            "apps/web/actions/tenant/variations.test.ts [create]",
        ],
    ),
    labels=["prd", "api", "tenant-variations", "T2-api"],
    priority=100,
    category="api",
    subcategory="tenant-variations",
    task_type="T2-api",
    parent_feature="02-settings-b",
    prd_refs=["§9.1", "§9.2", "§9.3", "V-SET-30", "V-SET-31"],
    description="Tenant L2 variations Server Actions.",
    details=(
        "Use JSONB jsonb_set for partial updates. Validate dept_overrides actions ('split', 'merge', "
        "'add', 'rename') against shape. Region change blocked here (V-SET-32 enforced in T-028)."
    ),
    scope_files=[
        "apps/web/actions/tenant/get.ts",
        "apps/web/actions/tenant/set-dept.ts",
        "apps/web/actions/tenant/set-rule-variant.ts",
        "apps/web/actions/tenant/set-local-flag.ts",
        "apps/web/actions/tenant/variations.test.ts",
    ],
    acceptance_criteria=[
        "All 4 actions implemented with V-SET-30..31 guards.",
        "Audit + outbox per mutation.",
    ],
    test_strategy=[
        "RED: 3 cases.",
        "GREEN: implement.",
    ],
    risk_red_lines=[
        "Do not allow rule_variant pointing to non-existent version.",
    ],
    skills=["test-driven-development"],
    dependencies=["T-007", "T-016"],
    cov_section="§9.1, §9.2, §9.3",
    cov_requirement="tenant_variations CRUD",
)

add_task(
    num=28,
    title="Server Actions: upgrade orchestration (preview/start/promote/rollback)",
    prompt=std_prompt(
        "T-028", "Server Actions: tenant_migrations orchestration",
        body=(
            "Implement `previewUpgrade(component, targetVersion)`, `startUpgrade(...)`, "
            "`promoteCanary(canaryPct)`, `rollbackUpgrade(migrationId)`. Region change blocked "
            "(V-SET-32). Force migration warnings (V-SET-33)."
        ),
        ac=[
            "Given previewUpgrade(component='rule_engine', target='v2'), when called, then it returns affected rows count + JSON diff vs current.",
            "Given a tenant tries `setRegion('us')` post-onboarding, when called, then it raises REGION_CHANGE_BLOCKED (V-SET-32) and instructs to open a support ticket.",
            "Given a migration row at canary_pct=10 and rollbackUpgrade is called within 7 days of completion, when committed, then status='rolled_back' and outbox event emitted.",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run apps/web/actions/tenant/upgrade.test.ts",
        files=[
            "apps/web/actions/tenant/preview-upgrade.ts [create]",
            "apps/web/actions/tenant/start-upgrade.ts [create]",
            "apps/web/actions/tenant/promote-canary.ts [create]",
            "apps/web/actions/tenant/rollback-upgrade.ts [create]",
            "apps/web/actions/tenant/upgrade.test.ts [create]",
        ],
    ),
    labels=["prd", "api", "tenant-upgrade", "T2-api"],
    priority=100,
    category="api",
    subcategory="tenant-upgrade",
    task_type="T2-api",
    parent_feature="02-settings-b",
    prd_refs=["§9.4", "§9.5", "V-SET-32", "V-SET-33"],
    description="Tenant upgrade orchestration Server Actions.",
    details=(
        "Rollback time-window 7 days post-completion (per §9.9 proposal). Open question: locked "
        "after 7d. Background job to do canary routing is a separate task (deferred — outside this "
        "decomposition's MVP)."
    ),
    scope_files=[
        "apps/web/actions/tenant/preview-upgrade.ts",
        "apps/web/actions/tenant/start-upgrade.ts",
        "apps/web/actions/tenant/promote-canary.ts",
        "apps/web/actions/tenant/rollback-upgrade.ts",
        "apps/web/actions/tenant/upgrade.test.ts",
    ],
    acceptance_criteria=[
        "Preview returns diff + impact count.",
        "Region change blocked.",
        "Rollback within 7d works.",
    ],
    test_strategy=[
        "RED: 3 cases.",
        "GREEN: implement.",
    ],
    risk_red_lines=[
        "Do not allow rollback after 7d window without explicit support ticket flag.",
    ],
    skills=["test-driven-development"],
    dependencies=["T-027"],
    cov_section="§9.4, §9.5",
    cov_requirement="tenant_migrations orchestration",
)

add_task(
    num=29,
    title="Server Actions: warehouses + locations + machines + lines CRUD",
    prompt=std_prompt(
        "T-029", "Server Actions: infrastructure CRUD",
        body=(
            "Implement Server Actions for warehouses/locations/machines/production_lines CRUD. "
            "V-SET-60..63 enforced. Uses ltree path math for level constraint."
        ),
        ac=[
            "Given a location row insert with parent.level=1 and own level=3, when validated, then it raises LEVEL_GAP (V-SET-60: must be parent.level+1).",
            "Given activateLine called on line with 0 machines, when run, then it raises NO_MACHINE (V-SET-62).",
            "Given deactivateWarehouse called when an active WO references it, when run, then it returns SOFT_WARNING_ACTIVE_WO and prompts force flag (V-SET-63).",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run apps/web/actions/infra/crud.test.ts",
        files=[
            "apps/web/actions/infra/warehouse.ts [create]",
            "apps/web/actions/infra/location.ts [create]",
            "apps/web/actions/infra/machine.ts [create]",
            "apps/web/actions/infra/line.ts [create]",
            "apps/web/actions/infra/crud.test.ts [create]",
        ],
    ),
    labels=["prd", "api", "infrastructure", "T2-api"],
    priority=100,
    category="api",
    subcategory="infra-crud",
    task_type="T2-api",
    parent_feature="02-settings-e",
    prd_refs=["§12.1", "§12.3", "V-SET-60", "V-SET-61", "V-SET-62", "V-SET-63"],
    description="Infrastructure CRUD Server Actions.",
    details="Materialize ltree path on insert/update via trigger or service-side derivation.",
    scope_files=[
        "apps/web/actions/infra/warehouse.ts",
        "apps/web/actions/infra/location.ts",
        "apps/web/actions/infra/machine.ts",
        "apps/web/actions/infra/line.ts",
        "apps/web/actions/infra/crud.test.ts",
    ],
    acceptance_criteria=[
        "V-SET-60..63 enforced.",
        "ltree path materialized.",
        "Outbox events on mutations.",
    ],
    test_strategy=[
        "RED: 3 cases.",
        "GREEN: implement.",
    ],
    risk_red_lines=[
        "Do not break referential integrity on hard-delete.",
    ],
    skills=["test-driven-development"],
    dependencies=["T-009", "T-016"],
    cov_section="§12",
    cov_requirement="Infrastructure CRUD Server Actions",
)

add_task(
    num=30,
    title="Server Actions: D365 constants CRUD + test connection (V-SET-50..53)",
    prompt=std_prompt(
        "T-030", "Server Actions: D365 constants + test connection",
        body=(
            "Implement `getD365Config`, `setD365Constant(key, value)`, `rotateD365Secret`, "
            "`testD365Connection()`. Connection test calls D365 OData metadata endpoint."
        ),
        ac=[
            "Given setD365Constant called for a key not in the 5 baseline + 6 P2 set, when run, then it raises UNKNOWN_CONSTANT.",
            "Given testD365Connection runs against an unreachable URL, when called, then it returns {status:'failed', reason} and writes audit_log row (action='update', table_name='d365_config', changed_fields=['last_test_at','last_test_status']).",
            "Given rotateD365Secret called, when committed, then the new secret is stored only as a vault key reference (no plaintext) and audit row is written.",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run apps/web/actions/d365/config.test.ts",
        files=[
            "apps/web/actions/d365/get.ts [create]",
            "apps/web/actions/d365/set-constant.ts [create]",
            "apps/web/actions/d365/rotate-secret.ts [create]",
            "apps/web/actions/d365/test-connection.ts [create]",
            "apps/web/actions/d365/config.test.ts [create]",
        ],
    ),
    labels=["prd", "api", "d365-config", "T2-api"],
    priority=100,
    category="api",
    subcategory="d365-config",
    task_type="T2-api",
    parent_feature="02-settings-e",
    prd_refs=["§11.1", "§11.3", "§11.6", "§11.7", "V-SET-50..53"],
    description="D365 constants + connection Server Actions.",
    details=(
        "Constants stored in reference_tables (table_code='d365_constants'). Secret rotation calls a "
        "vault adapter (interface + stub allowed). Test connection uses HTTPS GET to "
        "`<base_url>/$metadata` with OAuth bearer."
    ),
    scope_files=[
        "apps/web/actions/d365/get.ts",
        "apps/web/actions/d365/set-constant.ts",
        "apps/web/actions/d365/rotate-secret.ts",
        "apps/web/actions/d365/test-connection.ts",
        "apps/web/actions/d365/config.test.ts",
    ],
    acceptance_criteria=[
        "Constant whitelist enforced.",
        "Test connection writes audit row.",
        "Secret rotation never persists plaintext.",
    ],
    test_strategy=[
        "RED: 3 cases.",
        "GREEN: implement.",
    ],
    risk_red_lines=[
        "Do not store plaintext D365 secrets in DB.",
    ],
    skills=["test-driven-development"],
    dependencies=["T-021"],
    cov_section="§11",
    cov_requirement="D365 constants + test connection actions",
)

add_task(
    num=31,
    title="Server Actions: email_config CRUD + Resend test send (V-SET-70..72)",
    prompt=std_prompt(
        "T-031", "Server Actions: email_config + provider test",
        body=(
            "Implement email_config Reference CRUD (specialized wrapper) + `testEmailProvider()` "
            "that sends a probe email through Resend."
        ),
        ac=[
            "Given an email_config row activates with empty recipients_to, when committed, then it raises RECIPIENTS_EMPTY (V-SET-70).",
            "Given a body_template references a variable not in the event payload schema, when validated, then it raises UNKNOWN_TEMPLATE_VAR (V-SET-71).",
            "Given testEmailProvider runs against valid Resend creds, when called, then it returns {status:'ok', message_id} and writes audit row.",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run apps/web/actions/email/config.test.ts",
        files=[
            "apps/web/actions/email/upsert-config.ts [create]",
            "apps/web/actions/email/test-provider.ts [create]",
            "apps/web/actions/email/config.test.ts [create]",
        ],
    ),
    labels=["prd", "api", "email-config", "T2-api"],
    priority=100,
    category="api",
    subcategory="email-config",
    task_type="T2-api",
    parent_feature="02-settings-e",
    prd_refs=["§13.1", "§13.2", "§13.5", "V-SET-70..72"],
    description="Email config + Resend provider test.",
    details=(
        "Use Resend SDK behind a thin adapter (`packages/email/resend.ts`). Mustache template engine "
        "validation traverses `{{var}}` tokens vs an event payload schema map (per trigger_code)."
    ),
    scope_files=[
        "apps/web/actions/email/upsert-config.ts",
        "apps/web/actions/email/test-provider.ts",
        "apps/web/actions/email/config.test.ts",
    ],
    acceptance_criteria=[
        "V-SET-70..72 enforced.",
        "testEmailProvider sends probe + writes audit row.",
    ],
    test_strategy=[
        "RED: 3 cases (using mocked Resend).",
        "GREEN: implement.",
    ],
    risk_red_lines=[
        "Do not store provider API key in DB; use vault.",
    ],
    skills=["test-driven-development"],
    dependencies=["T-021"],
    cov_section="§13",
    cov_requirement="email_config + provider test actions",
)

add_task(
    num=32,
    title="Server Actions: org_security_policies upsert + MFA enrollment trigger",
    prompt=std_prompt(
        "T-032", "Server Action: security policy upsert with MFA enforce",
        body=(
            "Implement `upsertSecurityPolicy(policy)` and `forceMfaEnrollment(userId)`. Use Zod "
            "schema with all S-U5 fields. Reject mfa_allowed_methods including 'webauthn' (deferred "
            "Phase 3 — D7)."
        ),
        ac=[
            "Given input contains 'webauthn' in mfa_allowed_methods, when upsertSecurityPolicy runs, then it raises WEBAUTHN_DEFERRED.",
            "Given mfa_requirement changes from 'optional' to 'required_admins', when committed, then a background flag forces MFA enrollment on next admin login (V-SET-82) and outbox event 'settings.security.policy_changed' is emitted.",
            "Given password_min_length=4 input, when validated, then it raises BELOW_MIN_LENGTH (min 8 per §14.1).",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run apps/web/actions/security/policy.test.ts",
        files=[
            "apps/web/actions/security/upsert-policy.ts [create]",
            "apps/web/actions/security/force-mfa.ts [create]",
            "apps/web/actions/security/policy.test.ts [create]",
        ],
    ),
    labels=["prd", "auth", "security-policy", "T2-api"],
    priority=100,
    category="auth",
    subcategory="security-policy",
    task_type="T2-api",
    parent_feature="02-settings-e",
    prd_refs=["§5.7", "§14.1", "V-SET-80..83", "S-U5", "D7"],
    description="org_security_policies upsert + MFA force.",
    details=(
        "Mfa_requirement transition triggers a marker on users (e.g., requires_mfa_at) so middleware "
        "can enforce on next login. Password complexity 'strong' = NIST 800-63B regex + HIBP k-anon "
        "check (probe via /api/security/hibp-check at policy-save time but optional)."
    ),
    scope_files=[
        "apps/web/actions/security/upsert-policy.ts",
        "apps/web/actions/security/force-mfa.ts",
        "apps/web/actions/security/policy.test.ts",
    ],
    acceptance_criteria=[
        "WebAuthn rejected.",
        "MFA enforce trigger fires for admin role.",
        "Min-length floor enforced.",
    ],
    test_strategy=[
        "RED: 3 cases.",
        "GREEN: implement.",
    ],
    risk_red_lines=[
        "Do not enable WebAuthn until Phase 3 ADR.",
    ],
    skills=["test-driven-development"],
    dependencies=["T-011", "T-016"],
    cov_section="§5.7, §14.1",
    cov_requirement="Security policy upsert + MFA force",
)

add_task(
    num=33,
    title="Server Actions + route handlers: SSO config (SAML Entra) + test",
    prompt=std_prompt(
        "T-033", "SSO actions + SAML routes",
        body=(
            "Implement `upsertSsoConfig`, `testSamlConnection`, `disableSso`. Route handlers "
            "/api/auth/saml/login, /api/auth/saml/callback, /api/auth/saml/metadata using "
            "`@boxyhq/saml-jackson`."
        ),
        ac=[
            "Given upsertSsoConfig with idp_type='saml_entra' and missing metadata_url + x509_cert, when called, then it raises METADATA_REQUIRED.",
            "Given testSamlConnection succeeds, when called, then last_test_at is set, last_test_status='ok'; on failure status='failed' and enabled is forced to false (V-SET-85).",
            "Given /api/auth/saml/callback receives valid SAMLResponse, when processed, then user is JIT-provisioned (if jit_provisioning=true) with default_role_code, otherwise rejected.",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run apps/web/actions/sso/saml.test.ts",
        files=[
            "apps/web/actions/sso/upsert-config.ts [create]",
            "apps/web/actions/sso/test-connection.ts [create]",
            "apps/web/actions/sso/disable.ts [create]",
            "apps/web/app/api/auth/saml/[...slug]/route.ts [create]",
            "apps/web/actions/sso/saml.test.ts [create]",
        ],
    ),
    labels=["prd", "auth", "sso", "T2-api"],
    priority=100,
    category="auth",
    subcategory="sso",
    task_type="T2-api",
    parent_feature="02-settings-e",
    prd_refs=["§14.5", "V-SET-85", "S-A1"],
    description="SSO config + SAML route handlers.",
    details=(
        "Use @boxyhq/saml-jackson SP. OIDC variant out of scope here (Phase 2). Vault key reference "
        "for OIDC client secret is stored but unused for saml_entra path."
    ),
    scope_files=[
        "apps/web/actions/sso/upsert-config.ts",
        "apps/web/actions/sso/test-connection.ts",
        "apps/web/actions/sso/disable.ts",
        "apps/web/app/api/auth/saml/[...slug]/route.ts",
        "apps/web/actions/sso/saml.test.ts",
    ],
    acceptance_criteria=[
        "SAML metadata route returns SP XML.",
        "Test fail forces enabled=false.",
        "JIT provisioning honors default_role_code.",
    ],
    test_strategy=[
        "RED: 3 cases (mock IdP).",
        "GREEN: implement.",
    ],
    risk_red_lines=[
        "Do not log SAMLResponse payloads verbatim — they contain assertions.",
    ],
    skills=["test-driven-development"],
    dependencies=["T-012", "T-016"],
    cov_section="§14.5, S-A1",
    cov_requirement="SSO config + SAML routes",
)

add_task(
    num=34,
    title="SCIM 2.0 endpoints (Users + Groups) + token CRUD",
    prompt=std_prompt(
        "T-034", "SCIM 2.0 endpoints + token CRUD",
        body=(
            "Implement /scim/v2/Users + /scim/v2/Groups + /scim/v2/ServiceProviderConfig route "
            "handlers (GET/POST/PATCH/DELETE). Bearer-token auth via scim_tokens (argon2id verify). "
            "Token CRUD Server Actions: createScimToken, revokeScimToken."
        ),
        ac=[
            "Given a request with invalid Authorization, when /scim/v2/Users is hit, then it returns 401 with SCIM error JSON.",
            "Given POST /scim/v2/Users creates a user that exceeds seat_limit, when handled, then it returns 409 SEAT_LIMIT_REACHED (V-SET-86).",
            "Given PATCH /scim/v2/Users/:id with active=false, when applied, then users.is_active=false (soft delete, audit preserved).",
            "Given createScimToken returns plaintext only once, when stored, then DB has only argon2id hash (no plaintext column).",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run apps/web/app/api/scim/scim.test.ts",
        files=[
            "apps/web/app/api/scim/v2/Users/route.ts [create]",
            "apps/web/app/api/scim/v2/Users/[id]/route.ts [create]",
            "apps/web/app/api/scim/v2/Groups/route.ts [create]",
            "apps/web/app/api/scim/v2/ServiceProviderConfig/route.ts [create]",
            "apps/web/actions/scim/tokens.ts [create]",
            "apps/web/app/api/scim/scim.test.ts [create]",
        ],
    ),
    labels=["prd", "auth", "scim", "T2-api"],
    priority=100,
    category="auth",
    subcategory="scim",
    task_type="T2-api",
    parent_feature="02-settings-e",
    prd_refs=["§14.6", "V-SET-86", "S-A2"],
    description="SCIM 2.0 endpoints + token CRUD.",
    details=(
        "Implement RFC 7644 §3.5.2 PATCH ops (add/replace/remove). SCIM error format: "
        "`{schemas:['urn:ietf:params:scim:api:messages:2.0:Error'], status, detail, scimType}`. "
        "Bypass onboarding redirect guard."
    ),
    scope_files=[
        "apps/web/app/api/scim/v2/Users/route.ts",
        "apps/web/app/api/scim/v2/Users/[id]/route.ts",
        "apps/web/app/api/scim/v2/Groups/route.ts",
        "apps/web/app/api/scim/v2/ServiceProviderConfig/route.ts",
        "apps/web/actions/scim/tokens.ts",
        "apps/web/app/api/scim/scim.test.ts",
    ],
    acceptance_criteria=[
        "Auth + seat-limit enforced.",
        "PATCH ops correct.",
        "Token plaintext shown once only.",
    ],
    test_strategy=[
        "RED: 4 cases.",
        "GREEN: implement.",
    ],
    risk_red_lines=[
        "Do not store SCIM tokens plaintext.",
    ],
    skills=["test-driven-development"],
    dependencies=["T-012", "T-017"],
    cov_section="§14.6, S-A2",
    cov_requirement="SCIM endpoints + token management",
)

add_task(
    num=35,
    title="Edge middleware: IP allowlist + onboarding redirect guard + idle timeout",
    prompt=std_prompt(
        "T-035", "Edge middleware: IP allowlist + onboarding + idle timeout",
        body=(
            "Extend `apps/web/middleware.ts` with: (a) IP allowlist enforcement for /(admin) routes "
            "with SCIM + impersonation bypass; (b) onboarding redirect guard (admins → /onboarding, "
            "members → /onboarding/in-progress); (c) idle timeout enforcement using "
            "session_idle_timeout_minutes."
        ),
        ac=[
            "Given org has IP allowlist with 1 CIDR and request IP not in range hits /admin, when middleware runs, then it returns 403 IP_NOT_ALLOWED and writes audit_events row.",
            "Given onboarding_completed_at IS NULL and admin hits /admin/users, when middleware runs, then 302 redirect to /onboarding.",
            "Given session last_seen_at is older than session_idle_timeout_minutes, when middleware runs, then it forces logout (clears cookie) and redirects to /login?reason=idle.",
            "Given the request hits /scim/v2/Users with valid bearer, when middleware runs, then IP allowlist + onboarding guard are bypassed.",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run apps/web/middleware.test.ts",
        files=[
            "apps/web/middleware.ts [modify]",
            "apps/web/middleware.test.ts [create]",
            "apps/web/app/onboarding/in-progress/page.tsx [create]",
        ],
    ),
    labels=["prd", "auth", "edge-middleware", "T2-api"],
    priority=100,
    category="auth",
    subcategory="edge-middleware",
    task_type="T2-api",
    parent_feature="02-settings-e",
    prd_refs=["§14.3", "§14.7", "S-A3", "S-U4", "V-SET-83", "V-SET-87"],
    description="Edge middleware composition for security + onboarding.",
    details=(
        "Order: (1) public route bypass, (2) SCIM bearer bypass, (3) IP allowlist, (4) onboarding "
        "redirect, (5) idle timeout enforcement, (6) org_id resolve. Public routes: /login, "
        "/invite/accept, /scim/**, /api/auth/saml/**, /onboarding."
    ),
    scope_files=[
        "apps/web/middleware.ts",
        "apps/web/middleware.test.ts",
        "apps/web/app/onboarding/in-progress/page.tsx",
    ],
    acceptance_criteria=[
        "All 4 cases (4 ACs) hold.",
        "Bypass list correct.",
        "Audit row on 403.",
    ],
    test_strategy=[
        "RED: 4 cases.",
        "GREEN: implement.",
    ],
    risk_red_lines=[
        "Do not log full request headers (cookies/bearer).",
    ],
    skills=["test-driven-development"],
    dependencies=["T-011", "T-012", "T-017"],
    cov_section="§14.3, §14.7",
    cov_requirement="Edge middleware: IP allowlist + onboarding + idle",
)

add_task(
    num=36,
    title="Server Actions: admin_ip_allowlist CRUD with overlap-0.0.0.0/0 reject",
    prompt=std_prompt(
        "T-036", "Server Actions: IP allowlist CRUD",
        body=(
            "Implement `addIpRange(cidr, label)`, `removeIpRange(id)`, `listIpRanges()`. Reject CIDRs "
            "that overlap 0.0.0.0/0 (V-SET-87). Validate via Postgres INET CHECK + app-side ipaddr.js."
        ),
        ac=[
            "Given input cidr='0.0.0.0/0', when addIpRange runs, then it raises CIDR_OVERLAP_DEFAULT (V-SET-87).",
            "Given a valid /32, when added, then row exists and outbox event 'settings.ip_allowlist.changed' is emitted.",
            "Given the caller lacks settings.ip_allowlist.edit, when any action runs, then it raises FORBIDDEN.",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run apps/web/actions/security/ip-allowlist.test.ts",
        files=[
            "apps/web/actions/security/ip-allowlist-add.ts [create]",
            "apps/web/actions/security/ip-allowlist-remove.ts [create]",
            "apps/web/actions/security/ip-allowlist-list.ts [create]",
            "apps/web/actions/security/ip-allowlist.test.ts [create]",
        ],
    ),
    labels=["prd", "auth", "ip-allowlist", "T2-api"],
    priority=100,
    category="auth",
    subcategory="ip-allowlist",
    task_type="T2-api",
    parent_feature="02-settings-e",
    prd_refs=["§14.7", "V-SET-87", "S-A3"],
    description="Admin IP allowlist CRUD.",
    details="Use ipaddr.js for CIDR comparison. Outbox event for audit alignment with T-003.",
    scope_files=[
        "apps/web/actions/security/ip-allowlist-add.ts",
        "apps/web/actions/security/ip-allowlist-remove.ts",
        "apps/web/actions/security/ip-allowlist-list.ts",
        "apps/web/actions/security/ip-allowlist.test.ts",
    ],
    acceptance_criteria=[
        "0.0.0.0/0 rejected.",
        "RBAC enforced.",
        "Outbox event emitted.",
    ],
    test_strategy=[
        "RED: 3 cases.",
        "GREEN: implement.",
    ],
    risk_red_lines=[
        "Do not log full IP for legitimate admin events (only on 403).",
    ],
    skills=["test-driven-development"],
    dependencies=["T-012"],
    cov_section="§14.7, S-A3",
    cov_requirement="IP allowlist CRUD",
)

add_task(
    num=37,
    title="Server Actions: onboarding state (next/back/skip/restart/jump) + first_wo callback",
    prompt=std_prompt(
        "T-037", "Server Actions: onboarding state machine",
        body=(
            "Implement `advanceOnboardingStep`, `backOnboardingStep`, `jumpOnboardingStep(toStep)`, "
            "`skipOnboardingStep(step)`, `restartOnboarding`, `markFirstWoCreated`. Updates "
            "organizations.onboarding_state JSONB."
        ),
        ac=[
            "Given current_step=3 and skipOnboardingStep(4) runs, when committed, then completed_steps unchanged and skipped_steps=[4]; current_step advances to 5.",
            "Given jumpOnboardingStep(5) is called when 5 is not yet completed and not the current step, when run, then it raises ILLEGAL_JUMP (only completed-or-current steps allowed).",
            "Given markFirstWoCreated runs once, when committed, then onboarding_state.first_wo_at = now() and KPI snapshot for time_to_first_wo is computed (first_wo_at - started_at).",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run apps/web/actions/onboarding/state.test.ts",
        files=[
            "apps/web/actions/onboarding/advance.ts [create]",
            "apps/web/actions/onboarding/back.ts [create]",
            "apps/web/actions/onboarding/skip.ts [create]",
            "apps/web/actions/onboarding/jump.ts [create]",
            "apps/web/actions/onboarding/restart.ts [create]",
            "apps/web/actions/onboarding/first-wo.ts [create]",
            "apps/web/actions/onboarding/state.test.ts [create]",
        ],
    ),
    labels=["prd", "api", "onboarding-state", "T2-api"],
    priority=100,
    category="api",
    subcategory="onboarding-state",
    task_type="T2-api",
    parent_feature="02-settings-e",
    prd_refs=["§14.3", "S-U4"],
    description="Onboarding state machine actions.",
    details=(
        "Steps 1..6 per §14.4 (renumbered S-U1). Optional steps: 4, 5. Restart resets to {current_step:1, "
        "completed_steps:[], skipped_steps:[]} and requires confirm dialog (Pattern-07) — UI side."
    ),
    scope_files=[
        "apps/web/actions/onboarding/advance.ts",
        "apps/web/actions/onboarding/back.ts",
        "apps/web/actions/onboarding/skip.ts",
        "apps/web/actions/onboarding/jump.ts",
        "apps/web/actions/onboarding/restart.ts",
        "apps/web/actions/onboarding/first-wo.ts",
        "apps/web/actions/onboarding/state.test.ts",
    ],
    acceptance_criteria=[
        "All 6 actions implemented with state machine guards.",
        "first_wo_at persisted.",
        "Illegal jump rejected.",
    ],
    test_strategy=[
        "RED: 3 cases.",
        "GREEN: implement.",
    ],
    risk_red_lines=[
        "Do not allow skip on required steps (1, 2, 3, 6).",
    ],
    skills=["test-driven-development"],
    dependencies=["T-016"],
    cov_section="§14.3, S-U4",
    cov_requirement="Onboarding state machine actions",
)


# Manufacturing Operations (§8.9) Server Actions
add_task(
    num=38,
    title="Server Actions: Reference.ManufacturingOperations CRUD + reorder + reset-to-seed",
    prompt=std_prompt(
        "T-038", "Server Actions: manufacturing_operations CRUD",
        body=(
            "Implement CRUD + reorder + reset-to-seed for Reference.ManufacturingOperations: "
            "`listOperations`, `createOperation`, `updateOperation`, `deactivateOperation`, "
            "`reorderOperations`, `resetToSeed(industryCode)`. V-SET-MFG-01..06 enforced."
        ),
        ac=[
            "Given input process_suffix='Mx', when createOperation runs, then it raises INVALID_SUFFIX (V-SET-MFG-01: 2-4 chars uppercase alphanumeric).",
            "Given updateOperation tries to change operation_name on an existing row, when run, then it raises NAME_IMMUTABLE (per §8.9.4 'Edit mode').",
            "Given deactivateOperation called on op referenced by 5 active FAs, when run, then it returns CONFIRMATION_REQUIRED with referenced_count=5 (V-SET-MFG-04).",
            "Given resetToSeed('bakery') runs, when committed, then 4 bakery operations (Mix/Knead/Proof/Bake) are upserted and audit_log captures bulk action.",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run apps/web/actions/reference/manufacturing-ops.test.ts",
        files=[
            "apps/web/actions/reference/manufacturing-ops/list.ts [create]",
            "apps/web/actions/reference/manufacturing-ops/create.ts [create]",
            "apps/web/actions/reference/manufacturing-ops/update.ts [create]",
            "apps/web/actions/reference/manufacturing-ops/deactivate.ts [create]",
            "apps/web/actions/reference/manufacturing-ops/reorder.ts [create]",
            "apps/web/actions/reference/manufacturing-ops/reset-to-seed.ts [create]",
            "apps/web/actions/reference/manufacturing-ops.test.ts [create]",
        ],
    ),
    labels=["prd", "api", "manufacturing-ops", "T2-api"],
    priority=100,
    category="api",
    subcategory="manufacturing-ops",
    task_type="T2-api",
    parent_feature="02-settings-d",
    prd_refs=["§8.9", "V-SET-MFG-01..06", "ADR-034"],
    description="Reference.ManufacturingOperations CRUD + reorder + reset.",
    details=(
        "Storage: dedicated table per §8.9.2 (NOT generic reference_tables). marker='ORG-CONFIG' "
        "fixed. Suffix + name immutable on edit. Reorder is bulk update of operation_seq."
    ),
    scope_files=[
        "apps/web/actions/reference/manufacturing-ops/list.ts",
        "apps/web/actions/reference/manufacturing-ops/create.ts",
        "apps/web/actions/reference/manufacturing-ops/update.ts",
        "apps/web/actions/reference/manufacturing-ops/deactivate.ts",
        "apps/web/actions/reference/manufacturing-ops/reorder.ts",
        "apps/web/actions/reference/manufacturing-ops/reset-to-seed.ts",
        "apps/web/actions/reference/manufacturing-ops.test.ts",
    ],
    acceptance_criteria=[
        "V-SET-MFG-01..06 enforced.",
        "Suffix + name immutable on edit.",
        "Reset-to-seed produces correct row set per industry.",
    ],
    test_strategy=[
        "RED: 4 cases.",
        "GREEN: implement.",
    ],
    risk_red_lines=[
        "Do not change marker from 'ORG-CONFIG'.",
    ],
    skills=["test-driven-development"],
    dependencies=["T-008", "T-016"],
    cov_section="§8.9",
    cov_requirement="Manufacturing operations CRUD",
)

add_task(
    num=39,
    title="Migration: Reference.ManufacturingOperations table + per-industry seed",
    prompt=std_prompt(
        "T-039", "Migration: manufacturing_operations table + seed",
        body=(
            "Create dedicated table Reference.ManufacturingOperations per §8.9.2 plus seed inserts "
            "for Bakery/Pharmacy/FMCG/Generic industries. Indexes per §8.9.2 lines."
        ),
        ac=[
            "Given migration applied, when `\\d \"Reference.ManufacturingOperations\"` is shown, then UNIQUE(tenant_id, process_suffix) and UNIQUE(tenant_id, operation_name) hold.",
            "Given migration applied, when `\\di` is shown, then idx_manufacturing_ops_tenant_active and idx_manufacturing_ops_suffix exist.",
            "Given seed migration runs for a bakery tenant, when read, then 4 rows (Mix/Knead/Proof/Bake) are present with operation_seq 1..4 and industry_code='bakery'.",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run apps/web/db/migrations/__tests__/manufacturing-ops.test.ts",
        files=[
            "apps/web/db/schema/manufacturing-operations.ts [create]",
            "apps/web/db/migrations/ [create]",
            "apps/web/db/seeds/manufacturing-ops-seed.sql [create]",
            "apps/web/db/migrations/__tests__/manufacturing-ops.test.ts [create]",
        ],
    ),
    labels=["prd", "data", "manufacturing-ops-schema", "T1-schema"],
    priority=80,
    category="data",
    subcategory="manufacturing-ops-schema",
    task_type="T1-schema",
    parent_feature="02-settings-d",
    prd_refs=["§8.9.2", "§8.9.7", "ADR-034"],
    description="Manufacturing operations dedicated table + seeds.",
    details="Note table name is quoted-identifier per §8.9.2 (`\"Reference.ManufacturingOperations\"`).",
    scope_files=[
        "apps/web/db/schema/manufacturing-operations.ts",
        "apps/web/db/migrations/",
        "apps/web/db/seeds/manufacturing-ops-seed.sql",
        "apps/web/db/migrations/__tests__/manufacturing-ops.test.ts",
    ],
    acceptance_criteria=[
        "Table + indexes + uniques.",
        "Seed for 4 industries.",
        "vitest green.",
    ],
    test_strategy=[
        "RED: 3 cases.",
        "GREEN: emit.",
    ],
    risk_red_lines=[
        "Do not store seed under generic reference_tables.",
    ],
    skills=["test-driven-development"],
    dependencies=["T-004"],
    parallel_safe_with=["T-008"],
    cov_section="§8.9.2, §8.9.7",
    cov_requirement="ManufacturingOperations table + per-industry seed",
)

add_task(
    num=40,
    title="Server Action: cascade engine lookup for ManufacturingOperations (suffix → intermediate code)",
    prompt=std_prompt(
        "T-040", "Cascade engine: manufacturing_operations lookup",
        body=(
            "Implement `lookupManufacturingOperationSuffix(tenantId, opName)` with in-memory cache "
            "TTL=1h and fallback warning when not found (per §8.9.8). Wire into intermediate code "
            "generator interface."
        ),
        ac=[
            "Given operation_name='Mix' active for tenant, when looked up, then returns {process_suffix:'MX', operation_seq:1} from cache after first call.",
            "Given operation_name='Unknown' for tenant, when looked up, then returns {fallbackSuffix:'??', warning:'OPERATION_NOT_FOUND'} and logs to telemetry.",
            "Given operation_name='Mix' deactivated then re-activated, when cache TTL elapses, then second lookup reflects new state (re-fetch from DB).",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run apps/web/lib/cascade/manufacturing-ops-lookup.test.ts",
        files=[
            "apps/web/lib/cascade/manufacturing-ops-lookup.ts [create]",
            "apps/web/lib/cascade/manufacturing-ops-lookup.test.ts [create]",
        ],
    ),
    labels=["prd", "api", "cascade-engine", "T2-api"],
    priority=100,
    category="api",
    subcategory="cascade-engine",
    task_type="T2-api",
    parent_feature="02-settings-d",
    prd_refs=["§8.9.8"],
    description="Manufacturing ops cascade lookup with cache.",
    details="In-process LRU keyed on (tenant_id, operation_name); TTL configurable.",
    scope_files=[
        "apps/web/lib/cascade/manufacturing-ops-lookup.ts",
        "apps/web/lib/cascade/manufacturing-ops-lookup.test.ts",
    ],
    acceptance_criteria=[
        "Cache hit on second call.",
        "Fallback warning emitted.",
        "TTL invalidation works.",
    ],
    test_strategy=[
        "RED: 3 cases.",
        "GREEN: implement.",
    ],
    risk_red_lines=[
        "Do not silently substitute without logging.",
    ],
    skills=["test-driven-development"],
    dependencies=["T-038", "T-039"],
    cov_section="§8.9.8",
    cov_requirement="Manufacturing ops cascade lookup",
)

# ─────────────────────────────────────────────────────────────────────────────
# T3-ui — UI screens / modals (with prototype parity AC)
# ─────────────────────────────────────────────────────────────────────────────

def ui_task(
    num: int, title: str, screen_code: str, parent_feature: str,
    prd_section: str, proto_label: str, proto_path: str, proto_lines: str,
    body_extra: str, ac_extra: list[str], scope: list[str],
    deps: list[str], parallel: list[str] | None = None,
    parity_features: str = "the same form sections, same field labels, same shadcn primitives, same modals invoked from same triggers",
):
    parity_ac = (
        f"Given the production page renders, when compared to "
        f"`design/Monopilot Design System/{proto_path}:{proto_lines}` ({proto_label}), "
        f"then it has structural parity ({parity_features}), visual parity (same shadcn/Radix primitives — no drift to plain HTML, same density tokens), "
        f"and interaction parity (same enable/disable rules, same loading/empty/error states, same keyboard focus order) — verified by an RTL snapshot test plus the parity checklist embedded in `pipeline_inputs.details`."
    )
    ac_full = [parity_ac] + ac_extra
    ac_full = ac_full[:4]  # cap at 4
    add_task(
        num=num,
        title=title,
        prompt=std_prompt(
            f"T-{num:03d}", title,
            body=(
                f"Build {screen_code} ({proto_label}) following prototype "
                f"`design/Monopilot Design System/{proto_path}:{proto_lines}` 1:1 plus the production "
                f"contract notes below.\n\n"
                f"{body_extra}"
            ),
            ac=ac_full,
            red_cmd=f"pnpm --filter @monopilot/web vitest run {scope[1] if len(scope) > 1 else scope[0]}",
            files=scope,
        ),
        labels=["prd", "ui", screen_code.lower(), "T3-ui"],
        priority=100,
        category="ui",
        subcategory=screen_code.lower(),
        task_type="T3-ui",
        parent_feature=parent_feature,
        prd_refs=[prd_section],
        description=f"{screen_code} {proto_label} production component (prototype-parity).",
        details=(
            f"Prototype: design/Monopilot Design System/{proto_path}:{proto_lines}. "
            "Translation notes (canonical from prototype-index-settings.json): "
            "see `_meta/prototype-labels/translation-notes-settings.md` and the entry's `translation_notes` array. "
            "Production contract: data via Server Components (Drizzle); mutations via Server Actions; "
            "primitives from `packages/ui` only (no @radix-ui/react-dialog import outside packages/ui per §0). "
            "Parity checklist (verify item-by-item before GREEN):\n"
            "1. Section/region count + order matches prototype.\n"
            "2. Field labels + types match prototype.\n"
            "3. shadcn/Radix primitives match (Input, Select, Switch, Dialog etc).\n"
            "4. Action buttons present in same order with same enable/disable rules.\n"
            "5. Loading/empty/error states render per prototype.\n"
            "6. Modal triggers open the correct modal id (SM-NN).\n"
            "7. Keyboard focus order matches prototype.\n"
            "8. assertModalA11y() passes for any modals invoked."
        ),
        scope_files=scope,
        acceptance_criteria=ac_full,
        test_strategy=[
            "RED: write RTL test that mounts the page with mocked data and asserts the parity AC items + ac_extra coverage.",
            "GREEN: build component, wire Server Action(s).",
            f"Run `{f'pnpm --filter @monopilot/web vitest run {scope[1] if len(scope) > 1 else scope[0]}'}` and `pnpm typecheck`.",
        ],
        risk_red_lines=[
            "Do not import @radix-ui/react-dialog outside packages/ui (§0 ESLint rule).",
            "Do not paste prototype JSX wholesale — translate to production contract.",
            "Do not regress accessibility (axe violations = fail).",
        ],
        skills=["test-driven-development", "requesting-code-review"],
        dependencies=deps,
        parallel_safe_with=parallel or [],
        prototype_match=True,
        cov_section=prd_section,
        cov_requirement=f"{screen_code} UI ({proto_label})",
    )

# Onboarding wizard (SET-001 .. SET-006) — 6 screens
ui_task(
    num=41,
    title="SET-001 Org Profile step (gs1_prefix required, S-U2)",
    screen_code="SET-001",
    parent_feature="02-settings-e-onboarding",
    prd_section="§14.3 step 1",
    proto_label="company_profile_screen",
    proto_path="settings/org-screens.jsx",
    proto_lines="4-100",
    body_extra=(
        "Step 1 of the 6-step onboarding wizard. Fields: name, timezone, locale, currency, "
        "**gs1_prefix (required, regex per GS1 prefix length)**, logo (optional). On Next, "
        "the action `advanceOnboardingStep` is called from T-037."
    ),
    ac_extra=[
        "Given gs1_prefix is empty, when 'Next' is clicked, then the Zod schema rejects with 'GS1 Company Prefix is required for SSCC generation' (S-U2).",
        "Given form is valid and 'Next' is clicked, when action returns ok, then router.push to /onboarding/warehouse and onboarding_state.current_step=2.",
    ],
    scope=[
        "apps/web/app/onboarding/profile/page.tsx [create]",
        "apps/web/app/onboarding/profile/page.test.tsx [create]",
    ],
    deps=["T-016", "T-037"],
)

ui_task(
    num=42,
    title="SET-002 First Warehouse step",
    screen_code="SET-002",
    parent_feature="02-settings-e-onboarding",
    prd_section="§14.3 step 2",
    proto_label="warehouses_screen",
    proto_path="settings/org-screens.jsx",
    proto_lines="192-252",
    body_extra="Wizard step 2: create the first warehouse (name/type/code). Type defaults to 'finished'.",
    ac_extra=[
        "Given the form is valid (name + code + type), when submitted, then a warehouses row is inserted, organization_modules.first_warehouse_id is set, and the wizard advances to step 3.",
        "Given duplicate code within org, when submitted, then it raises CODE_TAKEN inline.",
    ],
    scope=[
        "apps/web/app/onboarding/warehouse/page.tsx [create]",
        "apps/web/app/onboarding/warehouse/page.test.tsx [create]",
    ],
    deps=["T-029", "T-037"],
)

ui_task(
    num=43,
    title="SET-003 First Location step (ltree path + zone + bin, S-U3)",
    screen_code="SET-003",
    parent_feature="02-settings-e-onboarding",
    prd_section="§14.3 step 3",
    proto_label="warehouses_screen",
    proto_path="settings/org-screens.jsx",
    proto_lines="192-252",
    body_extra=(
        "Step 3: create first location with ltree path (e.g., `FG › Zone A › Rack 1 › Bin 1`), zone "
        "label, and bin code. Replace prior 'zone/bin' thin spec per S-U3."
    ),
    ac_extra=[
        "Given the user enters a 4-level path, when submitted, then locations row is created with level=4, path materialized correctly, and the wizard advances.",
        "Given the path string contains an invalid separator, when validated, then the form shows 'Use ` › ` between segments' inline.",
    ],
    scope=[
        "apps/web/app/onboarding/location/page.tsx [create]",
        "apps/web/app/onboarding/location/page.test.tsx [create]",
    ],
    deps=["T-029", "T-037"],
)

ui_task(
    num=44,
    title="SET-004 First Product step (skippable redirect to 03-TECHNICAL)",
    screen_code="SET-004",
    parent_feature="02-settings-e-onboarding",
    prd_section="§14.3 step 4",
    proto_label="products_screen (legacy proxy)",
    proto_path="settings/data-screens.jsx",
    proto_lines="4-52",
    body_extra=(
        "Step 4 is a soft redirect to 03-TECHNICAL create-product flow. Skippable. Skip pushes step "
        "index to skipped_steps[]."
    ),
    ac_extra=[
        "Given user clicks Skip, when action runs, then skipOnboardingStep(4) is called and wizard advances to step 5.",
        "Given user clicks 'Open product editor', when invoked, then deep-link opens /products/new and on save returns to /onboarding/wo (step 5).",
    ],
    scope=[
        "apps/web/app/onboarding/product/page.tsx [create]",
        "apps/web/app/onboarding/product/page.test.tsx [create]",
    ],
    deps=["T-037"],
)

ui_task(
    num=45,
    title="SET-005 First Work Order step (skippable, persists first_wo_at)",
    screen_code="SET-005",
    parent_feature="02-settings-e-onboarding",
    prd_section="§14.3 step 5",
    proto_label="prototype: none (UX 02-SETTINGS-UX.md §wizard step 5)",
    proto_path="settings/org-screens.jsx",
    proto_lines="192-252",
    body_extra=(
        "Step 5: redirect to 04-PLANNING-BASIC create-WO flow. On WO create success callback, "
        "`markFirstWoCreated` is invoked (T-037). Skippable."
    ),
    ac_extra=[
        "Given user creates a WO, when callback fires, then markFirstWoCreated runs and onboarding_state.first_wo_at is set; KPI time_to_first_wo is computed in audit.",
        "Given user clicks Skip, when action runs, then skipped_steps includes 5 and step advances to 6.",
    ],
    scope=[
        "apps/web/app/onboarding/wo/page.tsx [create]",
        "apps/web/app/onboarding/wo/page.test.tsx [create]",
    ],
    deps=["T-037"],
)

ui_task(
    num=46,
    title="SET-006 Onboarding Completion (confetti + next-step cards, S-U1)",
    screen_code="SET-006",
    parent_feature="02-settings-e-onboarding",
    prd_section="§14.3 step 6",
    proto_label="prototype: none (UX 02-SETTINGS-UX.md §wizard completion)",
    proto_path="settings/org-screens.jsx",
    proto_lines="4-100",
    body_extra=(
        "Final step: confetti + 3 next-step cards linking to /admin/features, /admin/schema, "
        "/admin/rules. On 'Finish' the action sets organizations.onboarding_completed_at = now()."
    ),
    ac_extra=[
        "Given Finish is clicked, when action commits, then onboarding_completed_at = now() and middleware no longer redirects /admin to /onboarding.",
        "Given the page renders, when checked, then the 3 cards link to exactly /admin/features, /admin/schema, /admin/rules (matches §14.4 amended).",
    ],
    scope=[
        "apps/web/app/onboarding/completion/page.tsx [create]",
        "apps/web/app/onboarding/completion/page.test.tsx [create]",
    ],
    deps=["T-035", "T-037"],
)

# Modal primitives consumption — 11 modals (SM-01 .. SM-11)
ui_task(
    num=47,
    title="SM-01 RuleDryRunModal (read-only Pattern-10 preview)",
    screen_code="SM-01",
    parent_feature="02-settings-d-modals",
    prd_section="§0, §7.6",
    proto_label="rule_dry_run_modal",
    proto_path="settings/modals.jsx",
    proto_lines="18-69",
    body_extra=(
        "Read-only preview/compare modal (Pattern-10). Two-column grid (input JSON / result JSON). "
        "Calls T-025 listRuleDryRuns + a dev-only POST /api/rules/:code/dry-run mock."
    ),
    ac_extra=[
        "Given a sample input is loaded, when 'Run dry-run' is clicked, then the result panel shows pass/fail/warnings JSON within ≤5s.",
        "Given the modal opens, when the a11y helper assertModalA11y() runs, then 0 axe violations are reported.",
    ],
    scope=[
        "apps/web/components/settings/modals/rule-dry-run-modal.tsx [create]",
        "apps/web/components/settings/modals/rule-dry-run-modal.test.tsx [create]",
    ],
    deps=["T-025"],
)

ui_task(
    num=48,
    title="SM-02 FlagEditModal (Pattern-05 override-with-reason)",
    screen_code="SM-02",
    parent_feature="02-settings-b-modals",
    prd_section="§0, §10.2",
    proto_label="flag_edit_modal",
    proto_path="settings/modals.jsx",
    proto_lines="72-108",
    body_extra=(
        "Pattern-05 override-with-reason. Uses ReasonInput primitive (min 10 chars). Wires to "
        "T-020 setCoreFlag."
    ),
    ac_extra=[
        "Given reason text is <10 chars, when 'Save' is clicked, then form blocks submit and shows REASON_TOO_SHORT.",
        "Given an L1 flag is selected, when the save handler runs, then it routes to PromoteToL2Modal (SM-05) instead of direct save.",
    ],
    scope=[
        "apps/web/components/settings/modals/flag-edit-modal.tsx [create]",
        "apps/web/components/settings/modals/flag-edit-modal.test.tsx [create]",
    ],
    deps=["T-020"],
)

ui_task(
    num=49,
    title="SM-03 SchemaViewModal (Pattern-02 read-only summary)",
    screen_code="SM-03",
    parent_feature="02-settings-c-modals",
    prd_section="§0, §6.6",
    proto_label="schema_view_modal",
    proto_path="settings/modals.jsx",
    proto_lines="111-138",
    body_extra=(
        "Read-only summary of one reference_schemas row. Tier badge derived server-side; for L1 "
        "rows the alert points to L1-promotion path (T-023)."
    ),
    ac_extra=[
        "Given an L1 row, when modal opens, then alert text states 'Edit not available — open promotion request'.",
        "Given the modal opens, when assertModalA11y() runs, then 0 axe violations are reported.",
    ],
    scope=[
        "apps/web/components/settings/modals/schema-view-modal.tsx [create]",
        "apps/web/components/settings/modals/schema-view-modal.test.tsx [create]",
    ],
    deps=["T-023"],
)

ui_task(
    num=50,
    title="SM-04 EmailTemplateEditModal (Pattern-01 wizard, 3 steps)",
    screen_code="SM-04",
    parent_feature="02-settings-e-modals",
    prd_section="§0, §13.1",
    proto_label="email_template_edit_modal",
    proto_path="settings/modals.jsx",
    proto_lines="141-259",
    body_extra=(
        "3-step wizard: 1) trigger + recipients, 2) subject + body (variable picker), 3) preview + save. "
        "Uses Stepper primitive."
    ),
    ac_extra=[
        "Given step 2 inserts a {{var}} not in the event payload schema, when navigating to step 3, then the validation blocks with UNKNOWN_TEMPLATE_VAR (V-SET-71).",
        "Given the variable picker is opened, when search query 'fa_' is typed, then the list filters to variables starting with 'fa_'.",
    ],
    scope=[
        "apps/web/components/settings/modals/email-template-edit-modal.tsx [create]",
        "apps/web/components/settings/modals/email-template-edit-modal.test.tsx [create]",
    ],
    deps=["T-031"],
)

ui_task(
    num=51,
    title="SM-05 PromoteToL2Modal (Pattern-01+10 hybrid wizard)",
    screen_code="SM-05",
    parent_feature="02-settings-b-modals",
    prd_section="§0, §9.4",
    proto_label="promote_to_l2_modal",
    proto_path="settings/modals.jsx",
    proto_lines="262-375",
    body_extra=(
        "3-step wizard: 1) artefact + target, 2) preview diff (calls previewUpgrade T-028), "
        "3) reason ≥10 chars + start. RBAC Admin only."
    ),
    ac_extra=[
        "Given the user is not Admin, when the modal trigger fires, then the trigger button is disabled and the modal does not open.",
        "Given the diff step renders, when the impact card is shown, then affected_rows count comes from previewUpgrade response (no hardcoded value).",
    ],
    scope=[
        "apps/web/components/settings/modals/promote-to-l2-modal.tsx [create]",
        "apps/web/components/settings/modals/promote-to-l2-modal.test.tsx [create]",
    ],
    deps=["T-028"],
)

ui_task(
    num=52,
    title="SM-06 UserInviteModal (MODAL-INVITE-USER, Pattern-02)",
    screen_code="SM-06",
    parent_feature="02-settings-a-modals",
    prd_section="§0, §5.1",
    proto_label="user_invite_modal",
    proto_path="settings/modals.jsx",
    proto_lines="378-407",
    body_extra=(
        "Simple form modal. Email + role + optional personal message textarea. Calls T-017 inviteUser. "
        "Token TTL note (7 days) sourced from server config."
    ),
    ac_extra=[
        "Given email is invalid, when 'Send invite' is clicked, then form blocks submit with EMAIL_INVALID.",
        "Given seat-limit is reached, when action returns SEAT_LIMIT_REACHED, then a non-blocking alert is shown referencing 'Settings → Plan'.",
    ],
    scope=[
        "apps/web/components/settings/modals/user-invite-modal.tsx [create]",
        "apps/web/components/settings/modals/user-invite-modal.test.tsx [create]",
    ],
    deps=["T-017"],
)

ui_task(
    num=53,
    title="SM-07 RoleAssignModal (MODAL-ROLE-ASSIGNMENT, Pattern-04 picker)",
    screen_code="SM-07",
    parent_feature="02-settings-a-modals",
    prd_section="§0, §3",
    proto_label="role_assign_modal",
    proto_path="settings/modals.jsx",
    proto_lines="410-447",
    body_extra=(
        "Picker pattern. Async user lookup via shadcn Command (cmdk) with debounced search. Calls "
        "T-018 assignRole."
    ),
    ac_extra=[
        "Given a user is searched 'jane', when ≥250ms passes, then a single ILIKE Server Action call returns matches (no per-keystroke fetch).",
        "Given a role is assigned, when action commits, then the modal closes and the parent table re-renders via revalidatePath.",
    ],
    scope=[
        "apps/web/components/settings/modals/role-assign-modal.tsx [create]",
        "apps/web/components/settings/modals/role-assign-modal.test.tsx [create]",
    ],
    deps=["T-018"],
)

ui_task(
    num=54,
    title="SM-08 D365TestConnectionModal (MODAL-D365-CONNECTION-TEST, Pattern-07 + async)",
    screen_code="SM-08",
    parent_feature="02-settings-e-modals",
    prd_section="§0, §11.3",
    proto_label="d365_test_connection_modal",
    proto_path="settings/modals.jsx",
    proto_lines="450-489",
    body_extra=(
        "Confirm non-destructive + async submit. State machine: idle → pending → success | error. "
        "Calls T-030 testD365Connection."
    ),
    ac_extra=[
        "Given test fails, when result returns, then UI shows {status:'error', reason} and a Retry button is enabled.",
        "Given the modal opens, when assertModalA11y() runs, then 0 axe violations are reported.",
    ],
    scope=[
        "apps/web/components/settings/modals/d365-test-connection-modal.tsx [create]",
        "apps/web/components/settings/modals/d365-test-connection-modal.test.tsx [create]",
    ],
    deps=["T-030"],
)

ui_task(
    num=55,
    title="SM-09 PasswordResetModal (Pattern-09 destructive + ack)",
    screen_code="SM-09",
    parent_feature="02-settings-a-modals",
    prd_section="§0, §5.7",
    proto_label="password_reset_modal",
    proto_path="settings/modals.jsx",
    proto_lines="492-510",
    body_extra=(
        "Destructive + ack checkbox + dismissible=false. Confirm copy: 'Any active sessions will be revoked'. "
        "Calls T-018 resetPassword."
    ),
    ac_extra=[
        "Given the ack checkbox is unchecked, when 'Confirm' is clicked, then submit is blocked.",
        "Given confirm fires, when action returns, then a toast shows 'Password reset email sent' and the modal closes.",
    ],
    scope=[
        "apps/web/components/settings/modals/password-reset-modal.tsx [create]",
        "apps/web/components/settings/modals/password-reset-modal.test.tsx [create]",
    ],
    deps=["T-018"],
)

ui_task(
    num=56,
    title="SM-10 DeleteReferenceDataModal (MODAL-CONFIRM-DELETE, Pattern-08 type-to-confirm)",
    screen_code="SM-10",
    parent_feature="02-settings-d-modals",
    prd_section="§0, §8",
    proto_label="delete_reference_data_modal",
    proto_path="settings/modals.jsx",
    proto_lines="513-532",
    body_extra=(
        "Destructive type-to-confirm 'DELETE'. Pre-check via Server Action returns affected_count for "
        "orphan warning. Calls T-021 softDeleteRow."
    ),
    ac_extra=[
        "Given typed input != 'DELETE', when 'Confirm' is checked, then button stays disabled.",
        "Given pre-check returns affected_count=5, when modal opens, then alert text reads '5 rows referencing this code will be orphaned'.",
    ],
    scope=[
        "apps/web/components/settings/modals/delete-reference-data-modal.tsx [create]",
        "apps/web/components/settings/modals/delete-reference-data-modal.test.tsx [create]",
    ],
    deps=["T-021"],
)

ui_task(
    num=57,
    title="SM-11 RefRowEditModal (MODAL-REF-ROW-EDIT, Pattern-02 schema-driven)",
    screen_code="SM-11",
    parent_feature="02-settings-d-modals",
    prd_section="§0, §8",
    proto_label="ref_row_edit_modal",
    proto_path="settings/modals.jsx",
    proto_lines="535-572",
    body_extra=(
        "Simple form, schema-driven. Field list comes from reference_tables.columns metadata via "
        "T-024 getZodSchemaForTable(tableCode) — no hard-coded table name in component."
    ),
    ac_extra=[
        "Given the modal opens for table_code='allergens_reference', when fields render, then they reflect the current schema (column count + types) — not a hardcoded list.",
        "Given a Save click, when action returns ok, then revalidatePath() refreshes the parent table without full reload.",
    ],
    scope=[
        "apps/web/components/settings/modals/ref-row-edit-modal.tsx [create]",
        "apps/web/components/settings/modals/ref-row-edit-modal.test.tsx [create]",
    ],
    deps=["T-021", "T-024"],
)


# Page-level UI screens (SET-xxx)
ui_task(
    num=58,
    title="Company Profile screen (SET-010)",
    screen_code="SET-010",
    parent_feature="02-settings-a-ui",
    prd_section="§5.1, §12",
    proto_label="company_profile_screen",
    proto_path="settings/org-screens.jsx",
    proto_lines="4-100",
    body_extra=(
        "Org profile editor. Fields: name/timezone/locale/currency/gs1_prefix/region (read-only "
        "post-onboarding)/tier/seat_limit/logo. RHF + Zod. Logo upload to Vercel Blob via Server Action."
    ),
    ac_extra=[
        "Given user updates name + timezone and saves, when action returns ok, then organizations row updates and outbox event 'settings.org.updated' is emitted.",
        "Given user attempts to change region, when submitted, then the field is read-only with a tooltip 'Region change requires support ticket' (V-SET-32).",
    ],
    scope=[
        "apps/web/app/(admin)/settings/profile/page.tsx [create]",
        "apps/web/app/(admin)/settings/profile/page.test.tsx [create]",
    ],
    deps=["T-016", "T-027", "T-028"],
)

ui_task(
    num=59,
    title="Users screen (SET-011) — KPI tiles, table/cards, role pills filter (S-PU6)",
    screen_code="SET-011",
    parent_feature="02-settings-a-ui",
    prd_section="§3, §5.1",
    proto_label="users_screen",
    proto_path="settings/access-screens.jsx",
    proto_lines="4-151",
    body_extra=(
        "Users page with: KPI tiles (Active/Invited/Disabled/Seats used), Card vs Table view toggle "
        "(URL param ?view=cards|table), Role pills filter (4 categories per S-U6 + 'All'), search, "
        "inline role <Select> per row. Modals invoked: SM-06 (invite), SM-07 (assign role), SM-09 (reset password)."
    ),
    ac_extra=[
        "Given org has seat_limit=50 and 17 active users, when KPI tile renders, then 'Seats used 17 / 50' is shown — value sourced from server query, not hardcoded.",
        "Given URL is /settings/users?view=cards&role=manager, when page renders, then card view is active and only Manager-category users (npd_manager/module_admin/planner/production_lead/quality_lead) are listed.",
    ],
    scope=[
        "apps/web/app/(admin)/settings/users/page.tsx [create]",
        "apps/web/app/(admin)/settings/users/page.test.tsx [create]",
    ],
    deps=["T-016", "T-017", "T-018"],
)

ui_task(
    num=60,
    title="Security screen (SET-012) — password / 2FA / SSO / IP allowlist (S-A1..A3)",
    screen_code="SET-012",
    parent_feature="02-settings-e-ui",
    prd_section="§14.1, §14.5, §14.6, §14.7",
    proto_label="security_screen",
    proto_path="settings/access-screens.jsx",
    proto_lines="154-239",
    body_extra=(
        "Security policy page. Sections: password policy / session timeouts / 2FA settings / SSO / "
        "SCIM / IP allowlist / audit log preview (last 5). WebAuthn checkbox is `disabled` with "
        "tooltip 'Coming Phase 3' (D7)."
    ),
    ac_extra=[
        "Given user toggles SSO on without metadata configured, when save fires, then UI surfaces METADATA_REQUIRED inline (V-SET-85) and the toggle returns to off.",
        "Given the audit log preview renders, when read, then it shows the last 5 audit_log rows scoped to security actions (table_name IN org_security_policies/org_sso_config/scim_tokens/admin_ip_allowlist).",
    ],
    scope=[
        "apps/web/app/(admin)/settings/security/page.tsx [create]",
        "apps/web/app/(admin)/settings/security/page.test.tsx [create]",
    ],
    deps=["T-032", "T-033", "T-034", "T-036"],
)

ui_task(
    num=61,
    title="D365 Connection screen (SET-080)",
    screen_code="SET-080",
    parent_feature="02-settings-e-ui",
    prd_section="§11.3",
    proto_label="d365_connection_screen",
    proto_path="settings/admin-screens.jsx",
    proto_lines="27-103",
    body_extra=(
        "D365 OAuth + connection config. Test connection invokes SM-08. Toggle for "
        "integration.d365.enabled calls SM-08 first then T-020 setCoreFlag."
    ),
    ac_extra=[
        "Given the URL field input does not contain 'dynamics.com', when validated, then Zod rejects with URL_INVALID inline.",
        "Given user clicks Rotate secret, when action runs, then the password field is cleared and a toast confirms rotation; no plaintext is rendered.",
    ],
    scope=[
        "apps/web/app/(admin)/settings/integrations/d365/page.tsx [create]",
        "apps/web/app/(admin)/settings/integrations/d365/page.test.tsx [create]",
    ],
    deps=["T-020", "T-030", "T-054"],  # T-054 = SM-08
)

ui_task(
    num=62,
    title="D365 Mapping screen (SET-081 read-only)",
    screen_code="SET-081",
    parent_feature="02-settings-e-ui",
    prd_section="§11.3",
    proto_label="d365_mapping_screen",
    proto_path="settings/admin-screens.jsx",
    proto_lines="109-146",
    body_extra=(
        "Read-only mapping table. Direction filter (incoming/outgoing/both). Export CSV via Server "
        "Action. BL-TEC-01 banner: when allergens unmapped, render red alert."
    ),
    ac_extra=[
        "Given direction filter ?dir=outgoing, when page renders, then only outgoing rows are listed.",
        "Given Export CSV is clicked, when action runs, then a Response with Content-Disposition attachment is returned and includes header columns from d365_field_mapping.",
    ],
    scope=[
        "apps/web/app/(admin)/settings/integrations/d365/mapping/page.tsx [create]",
        "apps/web/app/(admin)/settings/integrations/d365/mapping/page.test.tsx [create]",
    ],
    deps=["T-030"],
)

ui_task(
    num=63,
    title="Rules Registry screen (SET-040)",
    screen_code="SET-040",
    parent_feature="02-settings-d-ui",
    prd_section="§7.6",
    proto_label="rules_registry_screen",
    proto_path="settings/admin-screens.jsx",
    proto_lines="152-210",
    body_extra=(
        "List + filter (type/coverage). Coverage badge: rule.last_dry_run_at < now() - interval '30 days' → "
        "missing. Export JSON via Server Action."
    ),
    ac_extra=[
        "Given filter type='gate' is applied, when page renders, then only gate-type rules are listed.",
        "Given a rule's last_dry_run_at is 31d old, when row renders, then row className highlights with a 'missing coverage' badge.",
    ],
    scope=[
        "apps/web/app/(admin)/settings/rules/page.tsx [create]",
        "apps/web/app/(admin)/settings/rules/page.test.tsx [create]",
    ],
    deps=["T-025"],
)

ui_task(
    num=64,
    title="Rule Detail screen (SET-041)",
    screen_code="SET-041",
    parent_feature="02-settings-d-ui",
    prd_section="§7.6",
    proto_label="rule_detail_screen",
    proto_path="settings/admin-screens.jsx",
    proto_lines="216-344",
    body_extra=(
        "Tabs: Definition / Versions / Dry-runs / Consumers / Audit. DSL JSON via CodeMirror "
        "read-only. Diff button opens version-vs-current side-by-side. Modal SM-01 invoked from dry-runs tab."
    ),
    ac_extra=[
        "Given tab id from URL hash #versions, when page mounts, then Tabs renders with 'versions' active (deep-link).",
        "Given diff is requested for version N-1 vs N, when action runs, then a JSON deep-diff is returned and rendered (BL-SET-03 notes: button enabled for non-current versions in production).",
    ],
    scope=[
        "apps/web/app/(admin)/settings/rules/[code]/page.tsx [create]",
        "apps/web/app/(admin)/settings/rules/[code]/page.test.tsx [create]",
    ],
    deps=["T-025", "T-047"],  # T-047 = SM-01
)

ui_task(
    num=65,
    title="Flags Admin screen (SET-071)",
    screen_code="SET-071",
    parent_feature="02-settings-b-ui",
    prd_section="§10.2, §10.3",
    proto_label="flags_admin_screen",
    proto_path="settings/admin-screens.jsx",
    proto_lines="350-408",
    body_extra=(
        "Tier-tabbed flags list (L1/L2/L3). Inline rollout progress. Edit opens SM-02 (Pattern-05 "
        "override-with-reason). L1 flag edit must redirect to SM-05 PromoteToL2Modal (per §10.4)."
    ),
    ac_extra=[
        "Given a row with tier=L1 is edited, when the Edit trigger fires, then SM-05 (PromoteToL2Modal) opens — not SM-02.",
        "Given env NEXT_PUBLIC_POSTHOG_URL is set, when page renders, then 'Open in PostHog' link points to that URL (no hardcode).",
    ],
    scope=[
        "apps/web/app/(admin)/settings/flags/page.tsx [create]",
        "apps/web/app/(admin)/settings/flags/page.test.tsx [create]",
    ],
    deps=["T-020", "T-048", "T-051"],  # T-048=SM-02, T-051=SM-05
)

ui_task(
    num=66,
    title="Schema Browser screen (SET-030)",
    screen_code="SET-030",
    parent_feature="02-settings-c-ui",
    prd_section="§6.6",
    proto_label="schema_browser_screen",
    proto_path="settings/admin-screens.jsx",
    proto_lines="414-469",
    body_extra=(
        "Schema columns list with table/tier/search filters. Row 'View' opens SM-03. L2/L3 'Edit' "
        "deep-links to SET-031 column edit wizard (separate task)."
    ),
    ac_extra=[
        "Given filters table='main_table' tier='L2' search='pack', when page renders, then only matching rows are listed.",
        "Given the user is not Admin, when an Edit link is shown for an L1 row, then the link is disabled with tooltip 'Use Promotion Request'.",
    ],
    scope=[
        "apps/web/app/(admin)/settings/schema/page.tsx [create]",
        "apps/web/app/(admin)/settings/schema/page.test.tsx [create]",
    ],
    deps=["T-023", "T-049"],  # T-049=SM-03
)

ui_task(
    num=67,
    title="Reference Data screen (SET-050)",
    screen_code="SET-050",
    parent_feature="02-settings-d-ui",
    prd_section="§8.6",
    proto_label="reference_data_screen",
    proto_path="settings/admin-screens.jsx",
    proto_lines="475-535",
    body_extra=(
        "Card grid of 25 reference tables. Selecting a card switches URL ?table=<code>; data grid "
        "renders schema-driven columns. Add/Edit invoke SM-11; Delete invokes SM-10. CSV import "
        "wizard (3-step) is separate task T-072."
    ),
    ac_extra=[
        "Given table_code='allergens_reference' is selected, when grid renders, then columns reflect the schema metadata fetched from reference_tables.columns (no hard-coded allergen branch).",
        "Given Import CSV is clicked, when action runs, then it routes to the CSV import wizard at /settings/reference/[code]/import.",
    ],
    scope=[
        "apps/web/app/(admin)/settings/reference/page.tsx [create]",
        "apps/web/app/(admin)/settings/reference/[code]/page.tsx [create]",
        "apps/web/app/(admin)/settings/reference/page.test.tsx [create]",
    ],
    deps=["T-021", "T-056", "T-057"],  # T-056=SM-10, T-057=SM-11
)

ui_task(
    num=68,
    title="Email Templates screen (SET-090)",
    screen_code="SET-090",
    parent_feature="02-settings-e-ui",
    prd_section="§13.4",
    proto_label="email_templates_screen",
    proto_path="settings/admin-screens.jsx",
    proto_lines="540-581",
    body_extra=(
        "Provider config + template list. Edit row opens SM-04. Test send button calls T-031 "
        "testEmailProvider. API key field shown as placeholder only — never returned from server."
    ),
    ac_extra=[
        "Given API key field is rendered, when DOM is inspected, then the input has type=password and value is empty (no plaintext).",
        "Given Test send is clicked with valid creds, when action returns ok, then a toast shows 'Probe sent — message_id <id>'.",
    ],
    scope=[
        "apps/web/app/(admin)/settings/email/page.tsx [create]",
        "apps/web/app/(admin)/settings/email/page.test.tsx [create]",
    ],
    deps=["T-031", "T-050"],  # T-050=SM-04
)

ui_task(
    num=69,
    title="Email Variables screen (SET-091)",
    screen_code="SET-091",
    parent_feature="02-settings-e-ui",
    prd_section="§13.4",
    proto_label="email_variables_screen",
    proto_path="settings/admin-screens.jsx",
    proto_lines="586-624",
    body_extra=(
        "Read-only grouped variables list. Group sections via shadcn Accordion. Copy-name button "
        "uses navigator.clipboard.writeText with toast on success."
    ),
    ac_extra=[
        "Given Search='order' is typed, when grid filters, then only variables with names containing 'order' remain.",
        "Given Copy is clicked on a variable, when handler runs, then navigator.clipboard.writeText is called with the variable name and a toast appears.",
    ],
    scope=[
        "apps/web/app/(admin)/settings/email/variables/page.tsx [create]",
        "apps/web/app/(admin)/settings/email/variables/page.test.tsx [create]",
    ],
    deps=["T-031"],
)

ui_task(
    num=70,
    title="Promotions screen (SET-063)",
    screen_code="SET-063",
    parent_feature="02-settings-b-ui",
    prd_section="§9.4",
    proto_label="promotions_screen",
    proto_path="settings/admin-screens.jsx",
    proto_lines="630-688",
    body_extra=(
        "Active vs History tabs (URL ?tab). Stage info cards from promotion_stages. RBAC Admin only. "
        "View diff opens SM-05 with prefilled record; Start opens SM-05 in create mode."
    ),
    ac_extra=[
        "Given the user is not Admin, when page is requested, then 403 page renders with 'Insufficient permissions'.",
        "Given URL is /settings/promotions?tab=history, when page renders, then history rows from tenant_migrations are listed (status IN completed/rolled_back).",
    ],
    scope=[
        "apps/web/app/(admin)/settings/promotions/page.tsx [create]",
        "apps/web/app/(admin)/settings/promotions/page.test.tsx [create]",
    ],
    deps=["T-028", "T-051"],  # T-051=SM-05
)

ui_task(
    num=71,
    title="Notifications screen (SET-092)",
    screen_code="SET-092",
    parent_feature="02-settings-e-ui",
    prd_section="§13.3",
    proto_label="notifications_screen",
    proto_path="settings/ops-screens.jsx",
    proto_lines="98-163",
    body_extra=(
        "Per-channel notification rule toggles. Slack 'Configure' deep-links to /settings/integrations?highlight=slack. "
        "Digest emails toggles (per-user vs per-org)."
    ),
    ac_extra=[
        "Given a row toggle changes, when action runs, then notification_rules update is isolated per row (no batch overwrite) and outbox event is emitted.",
        "Given Slack 'Configure' is clicked, when handler runs, then router.push to /settings/integrations?highlight=slack.",
    ],
    scope=[
        "apps/web/app/(admin)/settings/notifications/page.tsx [create]",
        "apps/web/app/(admin)/settings/notifications/page.test.tsx [create]",
    ],
    deps=["T-016"],
)

ui_task(
    num=72,
    title="Features screen (SET-070)",
    screen_code="SET-070",
    parent_feature="02-settings-b-ui",
    prd_section="§10.1, §10.3",
    proto_label="features_screen",
    proto_path="settings/ops-screens.jsx",
    proto_lines="166-198",
    body_extra=(
        "Module/feature toggles list. Premium/Beta badges from plan_tier. Toggle calls T-019 toggleModule. "
        "Plan check gates toggleability."
    ),
    ac_extra=[
        "Given a Premium feature on a Free plan, when toggle is rendered, then it is disabled with tooltip 'Upgrade plan to enable'.",
        "Given dependency check rejects, when toggle is changed, then a confirm dialog lists dependent modules and prompts force-disable (V-SET-40).",
    ],
    scope=[
        "apps/web/app/(admin)/settings/features/page.tsx [create]",
        "apps/web/app/(admin)/settings/features/page.test.tsx [create]",
    ],
    deps=["T-019"],
)

ui_task(
    num=73,
    title="Units (UoM) screen",
    screen_code="SET-094",
    parent_feature="02-settings-d-ui",
    prd_section="§8",
    proto_label="units_screen",
    proto_path="settings/data-screens.jsx",
    proto_lines="151-187",
    body_extra=(
        "Per-category UoM list with base unit derivation. Custom conversions section. Add via "
        "drawer or modal (lightweight, deferred to follow-up if not critical)."
    ),
    ac_extra=[
        "Given category 'mass' has base 'kg', when section renders, then row 'kg' has Base badge.",
        "Given there are zero custom conversions, when section renders, then empty state with 'Add custom conversion' link is shown.",
    ],
    scope=[
        "apps/web/app/(admin)/settings/units/page.tsx [create]",
        "apps/web/app/(admin)/settings/units/page.test.tsx [create]",
    ],
    deps=["T-021"],
)

ui_task(
    num=74,
    title="My Profile screen (SET-101 user prefs)",
    screen_code="SET-101",
    parent_feature="02-settings-account",
    prd_section="§14.2",
    proto_label="my_profile_screen",
    proto_path="settings/account-screens.jsx",
    proto_lines="3-75",
    body_extra=(
        "User profile page: avatar, name, email (disabled), language, timezone, password change "
        "(separate form), active sessions table (Revoke), 2FA section (stub linking to MFA enroll)."
    ),
    ac_extra=[
        "Given user changes language to 'en', when action commits, then user_preferences row updates and next-intl locale cookie is set in the response.",
        "Given user clicks Revoke on an active session, when action runs, then user_sessions row is deleted and the session token is invalidated server-side.",
    ],
    scope=[
        "apps/web/app/(admin)/account/profile/page.tsx [create]",
        "apps/web/app/(admin)/account/profile/page.test.tsx [create]",
    ],
    deps=["T-016"],
)

ui_task(
    num=75,
    title="My Notifications preferences screen",
    screen_code="SET-102",
    parent_feature="02-settings-account",
    prd_section="§13.3",
    proto_label="my_notifications_screen",
    proto_path="settings/account-screens.jsx",
    proto_lines="77-124",
    body_extra=(
        "Per-event notification preference toggles + browser push subscription + quiet hours. One "
        "Server Action handles all preference keys (`upsertUserNotificationPrefs(prefs)`)."
    ),
    ac_extra=[
        "Given the user toggles browser push ON, when handler runs, then navigator.serviceWorker is registered and PushManager.subscribe() is called; persistence stores the subscription handle.",
        "Given quiet_hours_from='22:00' and quiet_hours_to='07:00' are saved, when action commits, then user_preferences row reflects both fields.",
    ],
    scope=[
        "apps/web/app/(admin)/account/notifications/page.tsx [create]",
        "apps/web/app/(admin)/account/notifications/page.test.tsx [create]",
    ],
    deps=["T-016"],
)

ui_task(
    num=76,
    title="Integrations catalog screen (SET-110)",
    screen_code="SET-110",
    parent_feature="02-settings-e-ui",
    prd_section="§11.8",
    proto_label="integrations_screen",
    proto_path="settings/integrations.jsx",
    proto_lines="7-107",
    body_extra=(
        "Catalog grid + connected apps list. KPI tiles (connected/categories/sync 24h/failed). "
        "Recent sync activity table. View modes: list/grid via URL ?view=list|grid."
    ),
    ac_extra=[
        "Given URL is /settings/integrations?view=grid, when page renders, then grid layout component is rendered (not list).",
        "Given there are 3 failed syncs in the last 24h, when KPI tile renders, then the value reflects the aggregate query (not hardcoded).",
    ],
    scope=[
        "apps/web/app/(admin)/settings/integrations/page.tsx [create]",
        "apps/web/app/(admin)/settings/integrations/page.test.tsx [create]",
    ],
    deps=["T-030"],
)

ui_task(
    num=77,
    title="Manufacturing Operations List screen (SET-055)",
    screen_code="SET-055",
    parent_feature="02-settings-d-ui",
    prd_section="§8.9.4",
    proto_label="prototype: none (UX 02-SETTINGS-UX.md §8.9 reference)",
    proto_path="settings/admin-screens.jsx",
    proto_lines="475-535",  # parity vs reference_data_screen as parent pattern
    body_extra=(
        "Operations data grid. Reorder via drag-to-reorder (auto-save per drag → T-038 reorderOperations). "
        "Filter by industry_code + show-inactive toggle. Bulk action: 'Reset to seed data'."
    ),
    ac_extra=[
        "Given industry='bakery' filter is applied, when page renders, then only bakery rows are listed.",
        "Given row drag-to-reorder fires, when handler runs, then T-038 reorderOperations is called with the new (id, operation_seq) array.",
    ],
    scope=[
        "apps/web/app/(admin)/settings/reference/manufacturing-operations/page.tsx [create]",
        "apps/web/app/(admin)/settings/reference/manufacturing-operations/page.test.tsx [create]",
    ],
    deps=["T-038"],
)

ui_task(
    num=78,
    title="Manufacturing Operation Edit modal (SET-056)",
    screen_code="SET-056",
    parent_feature="02-settings-d-ui",
    prd_section="§8.9.4",
    proto_label="prototype: none (UX 02-SETTINGS-UX.md §8.9 form)",
    proto_path="settings/modals.jsx",
    proto_lines="535-572",  # parity vs ref_row_edit_modal as parent pattern
    body_extra=(
        "Add/Edit form modal. Edit mode shows operation_name + process_suffix as read-only (per "
        "§8.9.4 Edit mode rules). Validation V-SET-MFG-01..05."
    ),
    ac_extra=[
        "Given Edit mode opens for an existing op, when fields render, then operation_name and process_suffix are read-only text — not inputs.",
        "Given user enters process_suffix='M1@', when validated, then Zod rejects (uppercase alphanumeric only, V-SET-MFG-01).",
    ],
    scope=[
        "apps/web/components/settings/modals/manufacturing-operation-edit-modal.tsx [create]",
        "apps/web/components/settings/modals/manufacturing-operation-edit-modal.test.tsx [create]",
    ],
    deps=["T-038"],
)

# Audit log viewer (SET-013) — no perfect prototype match, parity vs UX
ui_task(
    num=79,
    title="Audit log viewer screen (SET-013) — partition-aware paginated query",
    screen_code="SET-013",
    parent_feature="02-settings-a-ui",
    prd_section="§5.6, ADR-008",
    proto_label="prototype: none (UX 02-SETTINGS-UX.md §audit log)",
    proto_path="settings/access-screens.jsx",
    proto_lines="154-239",  # security_screen audit preview as parity ref
    body_extra=(
        "Full audit log viewer with filters: table_name, action, user_id, date range. "
        "Pagination is partition-aware (date-range first to limit partition scan). "
        "Viewer scope = caller's org_id only."
    ),
    ac_extra=[
        "Given the caller has settings.audit.read but not impersonate.tenant, when page is requested with org_id != caller's org, then 403 is returned.",
        "Given a date range of 'last 7 days' is selected, when query runs, then only the relevant 1-2 partitions are scanned (verified by EXPLAIN).",
    ],
    scope=[
        "apps/web/app/(admin)/settings/audit/page.tsx [create]",
        "apps/web/app/(admin)/settings/audit/page.test.tsx [create]",
    ],
    deps=["T-010", "T-014"],
)


# ─────────────────────────────────────────────────────────────────────────────
# T4-wiring-test — E2E and integration
# ─────────────────────────────────────────────────────────────────────────────

add_task(
    num=80,
    title="E2E Playwright: 6-step onboarding wizard <15min P50 + jump/skip/restart guards",
    prompt=std_prompt(
        "T-080", "E2E Playwright: onboarding wizard happy path + edge cases",
        body=(
            "Playwright test suite that exercises the full 6-step onboarding wizard, asserts P50 "
            "<15min via timing, asserts jump-to-step rejects illegal jumps, restart resets state, "
            "and the redirect-while-incomplete guard works."
        ),
        ac=[
            "Given a fresh org, when an admin user steps through SET-001..006 with realistic typing, then onboarding_completed_at is set and (first_wo_at - started_at) < 900_000 ms (P50 target).",
            "Given onboarding_state.current_step=2 and the user clicks step 5 in the Stepper, when handler runs, then the click is no-op (target step not yet reachable).",
            "Given a deep-link to /admin/users while onboarding is incomplete, when middleware runs, then the user is 302-redirected to /onboarding.",
            "Given Restart is clicked + confirmed, when state is read, then current_step=1 and skipped_steps=[]; first_wo_at remains preserved (not reset).",
        ],
        red_cmd="pnpm --filter @monopilot/web playwright test e2e/onboarding-wizard.spec.ts",
        files=[
            "apps/web/e2e/onboarding-wizard.spec.ts [create]",
        ],
    ),
    labels=["prd", "test", "e2e-onboarding", "T4-wiring-test"],
    priority=120,
    category="test",
    subcategory="e2e-onboarding",
    task_type="T4-wiring-test",
    parent_feature="02-settings-e-onboarding",
    prd_refs=["§14.3", "S-U4"],
    description="E2E onboarding wizard happy path + edge cases.",
    details=(
        "Use Playwright fixture seeding a fresh org. Track timing with page.evaluate(performance.now). "
        "Assert middleware behavior with separate request context (not the wizard tab) — opening "
        "/admin/users in a new tab should redirect."
    ),
    scope_files=["apps/web/e2e/onboarding-wizard.spec.ts"],
    acceptance_criteria=[
        "Happy path completes within 15min target.",
        "Illegal jump no-op verified.",
        "Redirect guard verified.",
        "Restart preserves first_wo_at.",
    ],
    test_strategy=[
        "RED: write the suite first (skipped tests).",
        "GREEN: ensure UI/middleware satisfy all assertions.",
    ],
    risk_red_lines=[
        "Do not hard-code timing thresholds in production code.",
    ],
    skills=["test-driven-development", "verification-before-completion"],
    dependencies=["T-035", "T-041", "T-042", "T-043", "T-044", "T-045", "T-046"],
    cov_section="§14.3, S-U4",
    cov_requirement="E2E onboarding wizard",
)

add_task(
    num=81,
    title="E2E Playwright: invite → accept → first login flow with seat-limit + 7-day TTL",
    prompt=std_prompt(
        "T-081", "E2E Playwright: invite + accept + seat-limit",
        body=(
            "End-to-end suite for inviteUser → magic-link accept → first login. Asserts seat-limit "
            "rejection, expired-token rejection, and successful onboarding link from invite email."
        ),
        ac=[
            "Given seat_limit=2 and 2 active users, when admin tries inviteUser, then UI surfaces SEAT_LIMIT_REACHED and no DB row is created.",
            "Given a successful invite, when the user opens the magic-link within 7 days, then login succeeds and users.last_login_at is set.",
            "Given a magic-link is opened on day 8, when route runs, then the response is 410 GONE with INVITE_EXPIRED copy.",
        ],
        red_cmd="pnpm --filter @monopilot/web playwright test e2e/invite-accept.spec.ts",
        files=[
            "apps/web/e2e/invite-accept.spec.ts [create]",
        ],
    ),
    labels=["prd", "test", "e2e-invite", "T4-wiring-test"],
    priority=120,
    category="test",
    subcategory="e2e-invite",
    task_type="T4-wiring-test",
    parent_feature="02-settings-a",
    prd_refs=["§5.1", "S-U7", "S-U8"],
    description="E2E invite + accept + seat limit.",
    details="Use Mailcatcher / mailbox stub to retrieve magic link. Set system clock for TTL test.",
    scope_files=["apps/web/e2e/invite-accept.spec.ts"],
    acceptance_criteria=[
        "Seat-limit rejected.",
        "Successful flow within TTL.",
        "Expired link returns 410.",
    ],
    test_strategy=["RED: write suite. GREEN: ensure flows work."],
    risk_red_lines=["Do not bypass token TTL in test by writing past timestamps without clock advance."],
    skills=["test-driven-development"],
    dependencies=["T-017", "T-052", "T-059"],
    cov_section="§5.1 S-U7 S-U8",
    cov_requirement="E2E invite + seat limit",
)

add_task(
    num=82,
    title="E2E Playwright: SSO SAML round-trip with mock Entra IdP (S-A1)",
    prompt=std_prompt(
        "T-082", "E2E Playwright: SAML round-trip",
        body=(
            "Stand up a mock SAML IdP (e.g., samltest.id-style fixture or simple-saml-php container) "
            "and exercise upsertSsoConfig → testSamlConnection → /api/auth/saml/login → callback → "
            "JIT-provisioned login."
        ),
        ac=[
            "Given a valid IdP metadata URL is set, when testSamlConnection runs, then last_test_status='ok' is persisted.",
            "Given user clicks 'Sign in with SSO' on /login, when redirect → IdP → callback completes, then a users row is JIT-provisioned (jit_provisioning=true) with default_role_code='viewer'.",
            "Given enforce_for_non_admins=true and a non-admin tries password login, when /api/auth/login runs, then it rejects with PASSWORD_LOGIN_DISABLED.",
        ],
        red_cmd="pnpm --filter @monopilot/web playwright test e2e/sso-saml.spec.ts",
        files=[
            "apps/web/e2e/sso-saml.spec.ts [create]",
            "apps/web/e2e/fixtures/mock-idp/ [create directory]",
        ],
    ),
    labels=["prd", "test", "e2e-sso", "T4-wiring-test"],
    priority=120,
    category="test",
    subcategory="e2e-sso",
    task_type="T4-wiring-test",
    parent_feature="02-settings-e",
    prd_refs=["§14.5", "S-A1"],
    description="E2E SAML SSO round-trip.",
    details="Use a fixture IdP that signs assertions with a known cert; bake cert into the test config.",
    scope_files=[
        "apps/web/e2e/sso-saml.spec.ts",
        "apps/web/e2e/fixtures/mock-idp/",
    ],
    acceptance_criteria=[
        "Connection test succeeds.",
        "JIT provisioning works.",
        "enforce_for_non_admins blocks password login.",
    ],
    test_strategy=["RED: write suite + fixture. GREEN: implement."],
    risk_red_lines=["Do not commit real IdP certs/secrets."],
    skills=["test-driven-development"],
    dependencies=["T-033", "T-060"],
    cov_section="§14.5",
    cov_requirement="E2E SSO SAML round-trip",
)

add_task(
    num=83,
    title="Integration test: SCIM PATCH ops + bearer auth + seat-limit (S-A2)",
    prompt=std_prompt(
        "T-083", "Integration test: SCIM PATCH",
        body=(
            "vitest integration suite that exercises SCIM endpoints with bearer auth: POST/PATCH/DELETE "
            "Users + Groups; seat-limit enforcement; soft-delete on active=false; bypass for "
            "onboarding redirect."
        ),
        ac=[
            "Given org seat_limit=3 and 3 active users, when SCIM POST /Users creates user 4, then 409 with SEAT_LIMIT_REACHED is returned.",
            "Given PATCH /Users/:id with [{op:'replace', path:'active', value:false}], when applied, then users.is_active=false and is_audit_log row is written.",
            "Given a SCIM bearer hits /scim/v2/Users on an org with onboarding_completed_at IS NULL, when middleware runs, then the request is NOT redirected (bypass).",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run apps/web/app/api/scim/scim-integration.test.ts",
        files=[
            "apps/web/app/api/scim/scim-integration.test.ts [create]",
        ],
    ),
    labels=["prd", "test", "integration-scim", "T4-wiring-test"],
    priority=120,
    category="test",
    subcategory="integration-scim",
    task_type="T4-wiring-test",
    parent_feature="02-settings-e",
    prd_refs=["§14.6", "S-A2"],
    description="SCIM integration + bypass test.",
    details=(
        "Mount route handlers via Next test runner or supertest-style harness. Reuse argon2id verify "
        "from production code path."
    ),
    scope_files=["apps/web/app/api/scim/scim-integration.test.ts"],
    acceptance_criteria=[
        "Seat-limit enforced.",
        "PATCH active=false soft-deletes.",
        "Onboarding bypass works.",
    ],
    test_strategy=["RED: write tests. GREEN: implement."],
    risk_red_lines=["Do not log bearer tokens."],
    skills=["test-driven-development"],
    dependencies=["T-034"],
    cov_section="§14.6",
    cov_requirement="SCIM integration test",
)

add_task(
    num=84,
    title="E2E Playwright: schema admin wizard happy path (L2 add column + dry-run preview)",
    prompt=std_prompt(
        "T-084", "E2E Playwright: schema add column",
        body=(
            "End-to-end the schema admin wizard for adding an L2 column: Pick table → data_type → "
            "validation rules → blocking_rule → required_for_done → presentation → preview → save. "
            "Assert reference_schemas row + Zod regen + downstream form picks up new field."
        ),
        ac=[
            "Given an L2 column is added with regex='^[A-Z]{3}$', when the wizard saves, then reference_schemas row exists and Zod regen produces schema rejecting 'abc'.",
            "Given a downstream RHF form (e.g., NPD FA edit) is opened after publish, when fields render, then the new column appears with the correct label and placement.",
            "Given concurrent edit (schema_version mismatch), when publish fires, then UI surfaces CONCURRENT_EDIT and shows the diff (V-SET-04).",
        ],
        red_cmd="pnpm --filter @monopilot/web playwright test e2e/schema-wizard.spec.ts",
        files=[
            "apps/web/e2e/schema-wizard.spec.ts [create]",
        ],
    ),
    labels=["prd", "test", "e2e-schema-wizard", "T4-wiring-test"],
    priority=120,
    category="test",
    subcategory="e2e-schema-wizard",
    task_type="T4-wiring-test",
    parent_feature="02-settings-c",
    prd_refs=["§6.1", "§6.5", "V-SET-04"],
    description="E2E schema admin wizard add column.",
    details="Wizard target screen is SET-031 (column edit wizard) — covered indirectly via SET-030 and SM-03.",
    scope_files=["apps/web/e2e/schema-wizard.spec.ts"],
    acceptance_criteria=[
        "L2 add column flow completes.",
        "Zod regen reflects new column.",
        "Concurrent edit detected.",
    ],
    test_strategy=["RED: write spec. GREEN: ensure UI + Zod regen wired."],
    risk_red_lines=["Do not modify L1 schema in this test path."],
    skills=["test-driven-development"],
    dependencies=["T-023", "T-024", "T-066"],
    cov_section="§6, V-SET-04",
    cov_requirement="E2E schema wizard add column",
)

add_task(
    num=85,
    title="E2E Playwright: reference CSV import → preview → commit happy path",
    prompt=std_prompt(
        "T-085", "E2E Playwright: reference CSV import",
        body=(
            "End-to-end the CSV import wizard: upload → preview → commit. Assert summary counts "
            "match staged report and rows persist after commit."
        ),
        ac=[
            "Given a CSV with 3 inserts + 2 updates + 1 skip, when uploaded, then preview report shows the same counts.",
            "Given commit is clicked, when action returns, then 5 rows are persisted (errors excluded) and the table view reflects the new state.",
            "Given a CSV with mismatched header, when uploaded, then UI shows CSV_HEADER_MISMATCH and commit is blocked.",
        ],
        red_cmd="pnpm --filter @monopilot/web playwright test e2e/reference-csv.spec.ts",
        files=[
            "apps/web/e2e/reference-csv.spec.ts [create]",
        ],
    ),
    labels=["prd", "test", "e2e-csv-import", "T4-wiring-test"],
    priority=120,
    category="test",
    subcategory="e2e-csv-import",
    task_type="T4-wiring-test",
    parent_feature="02-settings-d",
    prd_refs=["§8.5"],
    description="E2E reference CSV import wizard.",
    details="Use small fixture CSVs in apps/web/e2e/fixtures/.",
    scope_files=["apps/web/e2e/reference-csv.spec.ts"],
    acceptance_criteria=[
        "Preview counts correct.",
        "Commit persists.",
        "Header mismatch blocks.",
    ],
    test_strategy=["RED: write spec + fixtures. GREEN: ensure UI."],
    risk_red_lines=["Do not skip the two-step preview/commit pattern."],
    skills=["test-driven-development"],
    dependencies=["T-022", "T-067"],
    cov_section="§8.5",
    cov_requirement="E2E CSV import",
)

add_task(
    num=86,
    title="E2E Playwright: D365 connection toggle gated by 5 constants + test pass (V-SET-42/50/52)",
    prompt=std_prompt(
        "T-086", "E2E Playwright: D365 toggle gating",
        body=(
            "Verify integration.d365.enabled toggle blocks until 5 constants populated AND test "
            "connection passes. Verify SM-08 modal flow."
        ),
        ac=[
            "Given only 4 of 5 d365_constants populated, when toggle ON is attempted, then UI surfaces D365_CONSTANTS_MISSING and toggle returns to off.",
            "Given 5 constants and test connection succeeds via SM-08, when toggle ON, then feature_flags_core.is_enabled=true persists and a 'Connected' badge renders.",
            "Given the OAuth secret is rotated, when handler runs, then the secret field is cleared and a toast confirms; no plaintext appears in DOM.",
        ],
        red_cmd="pnpm --filter @monopilot/web playwright test e2e/d365-toggle.spec.ts",
        files=[
            "apps/web/e2e/d365-toggle.spec.ts [create]",
        ],
    ),
    labels=["prd", "test", "e2e-d365", "T4-wiring-test"],
    priority=120,
    category="test",
    subcategory="e2e-d365",
    task_type="T4-wiring-test",
    parent_feature="02-settings-e",
    prd_refs=["§11.4", "V-SET-42", "V-SET-50", "V-SET-52"],
    description="E2E D365 toggle gating + secret rotation.",
    details="Mock D365 metadata endpoint via MSW or Playwright route interceptor.",
    scope_files=["apps/web/e2e/d365-toggle.spec.ts"],
    acceptance_criteria=[
        "Constants gating enforced.",
        "Toggle ON only after test pass.",
        "Secret rotation safe.",
    ],
    test_strategy=["RED: write spec. GREEN: implement gating."],
    risk_red_lines=["Do not weaken gating in test by env override."],
    skills=["test-driven-development"],
    dependencies=["T-020", "T-030", "T-061", "T-054"],
    cov_section="§11.4",
    cov_requirement="E2E D365 toggle gating",
)

add_task(
    num=87,
    title="E2E Playwright: IP allowlist 403 + SCIM bypass + impersonation bypass",
    prompt=std_prompt(
        "T-087", "E2E Playwright: IP allowlist + bypass paths",
        body=(
            "Verify edge middleware: when allowlist active, requests from outside CIDR get 403; "
            "SCIM bearer + superadmin impersonation are exempt."
        ),
        ac=[
            "Given the org has allowlist=['203.0.113.0/24'] and the request comes from 198.51.100.5, when /admin is hit, then 403 IP_NOT_ALLOWED is returned and audit row is written.",
            "Given a SCIM bearer hits /scim/v2/Users from an off-allowlist IP, when middleware runs, then the request succeeds (bypass).",
            "Given an active superadmin impersonation session hits /admin from an off-allowlist IP, when middleware runs, then the request succeeds and audit_log records the impersonation context.",
        ],
        red_cmd="pnpm --filter @monopilot/web playwright test e2e/ip-allowlist.spec.ts",
        files=[
            "apps/web/e2e/ip-allowlist.spec.ts [create]",
        ],
    ),
    labels=["prd", "test", "e2e-ip-allowlist", "T4-wiring-test"],
    priority=120,
    category="test",
    subcategory="e2e-ip-allowlist",
    task_type="T4-wiring-test",
    parent_feature="02-settings-e",
    prd_refs=["§14.7", "S-A3"],
    description="E2E IP allowlist enforcement + bypass paths.",
    details="Use Playwright `extraHTTPHeaders` to spoof X-Forwarded-For; enable middleware trust of trusted proxy header in test env only.",
    scope_files=["apps/web/e2e/ip-allowlist.spec.ts"],
    acceptance_criteria=[
        "403 returned for off-allowlist IP.",
        "SCIM bypass works.",
        "Impersonation bypass works.",
    ],
    test_strategy=["RED: write spec. GREEN: ensure middleware behavior."],
    risk_red_lines=["Do not trust X-Forwarded-For in production unless behind a known proxy."],
    skills=["test-driven-development"],
    dependencies=["T-035", "T-036"],
    cov_section="§14.7",
    cov_requirement="E2E IP allowlist + bypass",
)

add_task(
    num=88,
    title="E2E Playwright: 4 customer-facing role categories filter pills + KPI tile (S-U6)",
    prompt=std_prompt(
        "T-088", "E2E Playwright: role categories",
        body=(
            "Verify Users page renders 4-category role pills (Admin/Manager/Operator/Viewer) and "
            "KPI tiles per S-U6. role_categories mapping is consumed."
        ),
        ac=[
            "Given the Users page loads with 10 system roles seeded, when filter pill 'Operator' is clicked, then only warehouse_operator users are listed.",
            "Given KPI tile 'Active' renders, when read, then the value matches COUNT users WHERE is_active=true (no hardcode).",
            "Given the URL ?role=admin is loaded, when page renders, then both 'owner' and 'admin' system role users are listed (Admin category includes both).",
        ],
        red_cmd="pnpm --filter @monopilot/web playwright test e2e/users-categories.spec.ts",
        files=[
            "apps/web/e2e/users-categories.spec.ts [create]",
        ],
    ),
    labels=["prd", "test", "e2e-roles", "T4-wiring-test"],
    priority=120,
    category="test",
    subcategory="e2e-roles",
    task_type="T4-wiring-test",
    parent_feature="02-settings-a",
    prd_refs=["§3", "S-U6"],
    description="E2E 4 role categories on Users page.",
    details="role_categories reference table is read-only and seeded by T-091.",
    scope_files=["apps/web/e2e/users-categories.spec.ts"],
    acceptance_criteria=[
        "Pill filter scopes to category.",
        "KPI tiles dynamic.",
        "URL param honors category.",
    ],
    test_strategy=["RED: write spec. GREEN: ensure UI + mapping."],
    risk_red_lines=["Do not change role permission resolution to category-keyed; categories are presentational only."],
    skills=["test-driven-development"],
    dependencies=["T-059", "T-091"],
    cov_section="§3, S-U6",
    cov_requirement="E2E 4 role categories",
)

add_task(
    num=89,
    title="Integration test: audit_log partition rotation + 7-year retention DETACH",
    prompt=std_prompt(
        "T-089", "Integration test: audit_log partition lifecycle",
        body=(
            "vitest integration test that simulates a year of writes, asserts monthly partitions "
            "exist, and verifies the detach helper does not drop data."
        ),
        ac=[
            "Given the auto-create function runs ahead of writes, when 30 days pass simulated, then 12 child partitions exist and writes succeed without error.",
            "Given a partition older than 84 months exists and audit_log_detach_old(84) runs, when checked, then the partition is DETACHED (not dropped) and rows remain queryable via direct child reference.",
            "Given pg_cron is configured to run audit_log_create_partitions(3) daily, when the job runs, then a partition exists for now()+3 months.",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run apps/web/db/migrations/__tests__/audit-partition-lifecycle.test.ts",
        files=[
            "apps/web/db/migrations/__tests__/audit-partition-lifecycle.test.ts [create]",
        ],
    ),
    labels=["prd", "test", "integration-audit", "T4-wiring-test"],
    priority=120,
    category="test",
    subcategory="integration-audit",
    task_type="T4-wiring-test",
    parent_feature="02-settings-a",
    prd_refs=["§5.6", "ADR-008"],
    description="Audit log partition lifecycle test.",
    details="Use pg_cron in test container or directly invoke functions in test setUp.",
    scope_files=["apps/web/db/migrations/__tests__/audit-partition-lifecycle.test.ts"],
    acceptance_criteria=[
        "Partitions auto-created.",
        "Detach preserves data.",
        "Cron job creates +3 months ahead.",
    ],
    test_strategy=["RED: write test. GREEN: ensure functions."],
    risk_red_lines=["Do not DROP partitions automatically."],
    skills=["test-driven-development"],
    dependencies=["T-010", "T-014"],
    cov_section="§5.6, ADR-008",
    cov_requirement="Audit partition lifecycle",
)

add_task(
    num=90,
    title="Integration test: tenant_variations + dept_resolver runtime resolution",
    prompt=std_prompt(
        "T-090", "Integration test: dept_resolver",
        body=(
            "Test the runtime helper `dept_resolver(tenant_id, dept_code)` that maps L1 dept code → "
            "effective L2 dept after split/merge/add. Used by cascade engine + UI."
        ),
        ac=[
            "Given dept_overrides={split: technical → [food-safety, quality-lab]}, when dept_resolver('technical') is called, then it returns {effective: ['food-safety','quality-lab'], action:'split'}.",
            "Given dept_overrides={add: regulatory-affairs}, when dept_resolver('regulatory-affairs') runs, then it returns {effective:['regulatory-affairs'], action:'add'}.",
            "Given an unknown dept code, when dept_resolver runs, then it returns {effective: [], action:'unknown'} (no throw).",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run apps/web/lib/tenant/dept-resolver.test.ts",
        files=[
            "apps/web/lib/tenant/dept-resolver.ts [create]",
            "apps/web/lib/tenant/dept-resolver.test.ts [create]",
        ],
    ),
    labels=["prd", "test", "integration-l2", "T4-wiring-test"],
    priority=120,
    category="test",
    subcategory="integration-l2",
    task_type="T4-wiring-test",
    parent_feature="02-settings-b",
    prd_refs=["§9.2"],
    description="dept_resolver runtime helper.",
    details="Pure-function with DB read; cache per (tenant_id, sequence_token).",
    scope_files=[
        "apps/web/lib/tenant/dept-resolver.ts",
        "apps/web/lib/tenant/dept-resolver.test.ts",
    ],
    acceptance_criteria=[
        "Split returns correct array.",
        "Add returns correct.",
        "Unknown is non-throwing.",
    ],
    test_strategy=["RED: write tests. GREEN: implement."],
    risk_red_lines=["Do not silently swallow errors — return action='unknown' explicitly."],
    skills=["test-driven-development"],
    dependencies=["T-027"],
    cov_section="§9.2",
    cov_requirement="dept_resolver runtime",
)

# ─────────────────────────────────────────────────────────────────────────────
# T5-seed — Seed and reference data
# ─────────────────────────────────────────────────────────────────────────────

add_task(
    num=91,
    title="Seed: role_categories reference (4 customer-facing groups, S-U6)",
    prompt=std_prompt(
        "T-091", "Seed: role_categories reference",
        body=(
            "Insert role_categories rows mapping role_code → ui_category per §3 [S-U6]: 4 categories "
            "(Admin/Manager/Operator/Viewer) covering all 10 system roles."
        ),
        ac=[
            "Given seed runs, when SELECT * FROM role_categories returns 10 rows, then each system role is mapped to exactly one of {admin, manager, operator, viewer}.",
            "Given owner+admin rows are inspected, when read, then both have ui_category='admin'.",
            "Given seed is idempotent, when re-run, then the row count stays at 10 (no duplicates).",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run apps/web/db/seeds/__tests__/role-categories.test.ts",
        files=[
            "apps/web/db/migrations/ [create]",
            "apps/web/db/seeds/role-categories.sql [create]",
            "apps/web/db/seeds/__tests__/role-categories.test.ts [create]",
        ],
    ),
    labels=["prd", "data", "seed-role-categories", "T5-seed"],
    priority=120,
    category="data",
    subcategory="seed-role-categories",
    task_type="T5-seed",
    parent_feature="02-settings-a",
    prd_refs=["§3", "S-U6"],
    description="role_categories mapping seed (read-only).",
    details=(
        "Create role_categories table + seed in one migration. Schema: (role_code TEXT PK, "
        "ui_category TEXT CHECK IN (admin,manager,operator,viewer), color_hint TEXT)."
    ),
    scope_files=[
        "apps/web/db/migrations/",
        "apps/web/db/seeds/role-categories.sql",
        "apps/web/db/seeds/__tests__/role-categories.test.ts",
    ],
    acceptance_criteria=[
        "10-row seed.",
        "Categories correct.",
        "Idempotent.",
    ],
    test_strategy=["RED: write test. GREEN: emit migration + seed."],
    risk_red_lines=["Do not let categories drive permission resolution."],
    skills=["test-driven-development"],
    dependencies=["T-016"],
    cov_section="§3, S-U6",
    cov_requirement="role_categories seed",
)

add_task(
    num=92,
    title="Seed: 15 modules baseline + organization_modules defaults",
    prompt=std_prompt(
        "T-092", "Seed: modules baseline",
        body=(
            "Insert the 15 modules from §10.1 table with phase + dependencies + can_disable + "
            "default-enabled flag. organization_modules per-org defaults derived on createOrganization."
        ),
        ac=[
            "Given seed runs, when SELECT count(*) FROM modules, then 15 rows exist (00-foundation .. 15-oee).",
            "Given seed runs, when row 00-foundation is inspected, then can_disable=false.",
            "Given a fresh org is created via T-016, when organization_modules is queried, then default-enabled rows match §10.1 column 'Default enabled'.",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run apps/web/db/seeds/__tests__/modules.test.ts",
        files=[
            "apps/web/db/seeds/modules.sql [create]",
            "apps/web/db/seeds/__tests__/modules.test.ts [create]",
        ],
    ),
    labels=["prd", "data", "seed-modules", "T5-seed"],
    priority=120,
    category="data",
    subcategory="seed-modules",
    task_type="T5-seed",
    parent_feature="02-settings-b",
    prd_refs=["§10.1"],
    description="Modules baseline seed.",
    details="Per §10.1 table; do not include 16th module beyond OEE.",
    scope_files=[
        "apps/web/db/seeds/modules.sql",
        "apps/web/db/seeds/__tests__/modules.test.ts",
    ],
    acceptance_criteria=[
        "15 rows seeded.",
        "00-foundation cannot disable.",
        "Default-enabled set per spec.",
    ],
    test_strategy=["RED: write test. GREEN: emit seed."],
    risk_red_lines=["Do not enable Phase 2/3 modules by default."],
    skills=["test-driven-development"],
    dependencies=["T-004"],
    parallel_safe_with=["T-091"],
    cov_section="§10.1",
    cov_requirement="15 modules seed",
)

add_task(
    num=93,
    title="Seed: 25 reference table schemas (reference_schemas baseline)",
    prompt=std_prompt(
        "T-093", "Seed: reference_schemas baseline",
        body=(
            "Insert reference_schemas rows describing the 25 reference tables (§8.1) — column types, "
            "regex constraints, dropdown_source links. Required for schema-driven UI to render."
        ),
        ac=[
            "Given seed runs, when SELECT DISTINCT table_code FROM reference_schemas WHERE table_code LIKE 'reference.%', then 25 distinct codes exist.",
            "Given seed includes pack_sizes, when read, then it has columns pack_size (regex ^\\d+x\\d+cm$), display_order, is_active per §8.2.",
            "Given seed includes oee_alert_thresholds, when read, then oee_target_pct default reflects 70 (v3.4).",
        ],
        red_cmd="pnpm --filter @monopilot/web vitest run apps/web/db/seeds/__tests__/reference-schemas.test.ts",
        files=[
            "apps/web/db/seeds/reference-schemas.sql [create]",
            "apps/web/db/seeds/__tests__/reference-schemas.test.ts [create]",
        ],
    ),
    labels=["prd", "data", "seed-reference-schemas", "T5-seed"],
    priority=120,
    category="data",
    subcategory="seed-reference-schemas",
    task_type="T5-seed",
    parent_feature="02-settings-d",
    prd_refs=["§8.1", "§8.2", "§8.8"],
    description="Reference schemas seed for 25 tables.",
    details="Use the same SQL across orgs (org_id IS NULL = universal L1).",
    scope_files=[
        "apps/web/db/seeds/reference-schemas.sql",
        "apps/web/db/seeds/__tests__/reference-schemas.test.ts",
    ],
    acceptance_criteria=[
        "25 distinct table codes.",
        "Column metadata correct.",
        "v3.4 defaults applied.",
    ],
    test_strategy=["RED: write test. GREEN: emit seed."],
    risk_red_lines=["Do not seed org-scoped overrides."],
    skills=["test-driven-development"],
    dependencies=["T-005"],
    parallel_safe_with=["T-091", "T-092"],
    cov_section="§8.1, §8.2",
    cov_requirement="Reference schemas baseline seed",
)

# ─────────────────────────────────────────────────────────────────────────────
# Docs tasks
# ─────────────────────────────────────────────────────────────────────────────

add_task(
    num=94,
    title="ADR-034 docs: Generic Product Lifecycle Naming reference + ManufacturingOperations integration",
    prompt=std_prompt(
        "T-094", "Docs: ADR-034 + ManufacturingOperations integration",
        body=(
            "Author docs page describing how Reference.ManufacturingOperations + marker='ORG-CONFIG' "
            "interact with Templates (01-NPD §6) and Cascading Rules Chain 2/4 (01-NPD §13)."
        ),
        ac=[
            "Given the docs page is built, when rendered, then it includes a sequence diagram of cascade lookup (FA update → MO suffix → intermediate code generation).",
            "Given the docs page links ADR-034, when checked, then the link resolves to `_foundation/decisions/ADR-034-*.md`.",
            "Given the docs page lists the 4 industry seed sets, when checked, then Bakery/Pharmacy/FMCG/Generic are documented with the same row sets as T-039 seed.",
        ],
        red_cmd="pnpm --filter @monopilot/web docs:lint",
        files=[
            "docs/02-settings/manufacturing-operations.mdx [create]",
        ],
    ),
    labels=["prd", "docs", "manufacturing-ops-docs", "docs"],
    priority=150,
    category="docs",
    subcategory="manufacturing-ops-docs",
    task_type="docs",
    parent_feature="02-settings-d",
    prd_refs=["§8.9.14", "ADR-034"],
    description="Docs for Manufacturing Operations integration.",
    details="MDX with sequence diagram (mermaid) + table of seed rows.",
    scope_files=["docs/02-settings/manufacturing-operations.mdx"],
    acceptance_criteria=[
        "Sequence diagram present.",
        "ADR link resolves.",
        "Seed rows documented.",
    ],
    test_strategy=[
        "RED: write docs:lint check that asserts page exists + headings.",
        "GREEN: write MDX.",
    ],
    risk_red_lines=["Do not paste prototype JSX."],
    skills=["requesting-code-review"],
    dependencies=["T-038", "T-039"],
    cov_section="§8.9, ADR-034",
    cov_requirement="ManufacturingOperations docs",
)

add_task(
    num=95,
    title="Decisions log: lock D1..D8 from gap-backlog into _meta/decisions/",
    prompt=std_prompt(
        "T-095", "Decisions log: D1..D8",
        body=(
            "Create a decision document recording the resolutions to D1 (10 system roles + 4 UI "
            "categories), D2 (flat permission model), D3 (renumbered SET-001..006), D7 (WebAuthn "
            "deferred Phase 3), D8 (mistagged prototypes moved). Reference PRD v3.5 changelog."
        ),
        ac=[
            "Given the decision file exists, when read, then it lists each Dn with: decision, rationale (≤3 lines), date, source PRD section.",
            "Given the file is committed, when CI runs, then a links-check confirms each PRD section reference resolves.",
            "Given D8 is read, when verified against `_meta/prototype-labels/prototype-index-settings.json`, then no mistagged entries (sites/shifts/devices/products/boms/partners) remain in the settings index.",
        ],
        red_cmd="pnpm --filter @monopilot/web docs:links-check _meta/decisions/2026-04-30-settings-d1-d8.md",
        files=[
            "_meta/decisions/2026-04-30-settings-d1-d8.md [create]",
        ],
    ),
    labels=["prd", "docs", "decisions-log", "docs"],
    priority=150,
    category="docs",
    subcategory="decisions-log",
    task_type="docs",
    parent_feature="02-settings-foundation",
    prd_refs=["Changelog v3.5", "§3", "§14.4", "§14.1"],
    description="Decisions log for D1..D8.",
    details="One markdown table + section per decision. Single source of truth for downstream tasks.",
    scope_files=["_meta/decisions/2026-04-30-settings-d1-d8.md"],
    acceptance_criteria=[
        "All 8 decisions present.",
        "PRD links resolve.",
        "D8 verified against prototype index.",
    ],
    test_strategy=[
        "RED: write docs link-check test.",
        "GREEN: write decisions doc.",
    ],
    risk_red_lines=["Do not re-open settled decisions; reference PRD v3.5."],
    skills=["requesting-code-review"],
    dependencies=[],
    parallel_safe_with=["T-094"],
    cov_section="Changelog v3.5",
    cov_requirement="Decisions log D1..D8",
)

# Reference CSV import wizard UI
ui_task(
    num=96,
    title="Reference CSV Import Wizard screen (SET-053, 3-step Pattern-01)",
    screen_code="SET-053",
    parent_feature="02-settings-d-ui",
    prd_section="§8.6",
    proto_label="prototype: none (UX 02-SETTINGS-UX.md §reference-import)",
    proto_path="settings/admin-screens.jsx",
    proto_lines="475-535",  # parity vs reference_data_screen as parent pattern
    body_extra=(
        "3-step wizard: Upload → Preview (counts insert/update/skip/error) → Commit. Uses Stepper "
        "primitive. Calls T-022 importReferenceCsv + commitReferenceImport."
    ),
    ac_extra=[
        "Given the user uploads a CSV with mismatched header, when step 2 renders, then 'Header mismatch — expected: <list>' is shown and Commit is disabled.",
        "Given commit succeeds, when step 3 renders, then a summary panel shows actual persisted counts (returned by action) and the parent table view link routes back.",
    ],
    scope=[
        "apps/web/app/(admin)/settings/reference/[code]/import/page.tsx [create]",
        "apps/web/app/(admin)/settings/reference/[code]/import/page.test.tsx [create]",
    ],
    deps=["T-022"],
)

# Schema column edit wizard (SET-031) — UX-driven (no prototype)
ui_task(
    num=97,
    title="Schema Column Edit Wizard screen (SET-031, 8-step Pattern-01)",
    screen_code="SET-031",
    parent_feature="02-settings-c-ui",
    prd_section="§6.1, §6.6",
    proto_label="prototype: none (UX 02-SETTINGS-UX.md §schema-column-wizard, BL-SET-01 backlog)",
    proto_path="settings/modals.jsx",
    proto_lines="262-375",  # parity vs promote_to_l2_modal Stepper pattern
    body_extra=(
        "8-step wizard per §6.1: Pick table → dept → data_type → validation → blocking_rule → "
        "required_for_done → presentation → preview → save. Wires to T-023 addSchemaColumn."
    ),
    ac_extra=[
        "Given step 1 selects table='main_table', when step 2 renders, then dept dropdown options come from tenant_variations.dept_overrides (or 7-dept Apex baseline).",
        "Given step 8 publish fires concurrent edit, when action returns CONCURRENT_EDIT, then UI shows a diff modal and offers 'Reload latest'.",
    ],
    scope=[
        "apps/web/app/(admin)/settings/schema/new/page.tsx [create]",
        "apps/web/app/(admin)/settings/schema/new/page.test.tsx [create]",
    ],
    deps=["T-023", "T-066"],
)

# Schema diff viewer (SET-032)
ui_task(
    num=98,
    title="Schema Diff Viewer screen (SET-032)",
    screen_code="SET-032",
    parent_feature="02-settings-c-ui",
    prd_section="§6.6",
    proto_label="prototype: none (UX 02-SETTINGS-UX.md §schema-diff, BL-SET-02 backlog)",
    proto_path="settings/admin-screens.jsx",
    proto_lines="216-344",  # parity vs rule_detail_screen tabs as parent pattern
    body_extra=(
        "Side-by-side diff for reference_schemas N vs N-1 per column. Uses Tabs (current/diff) and "
        "react-diff-viewer (or pre-based renderer)."
    ),
    ac_extra=[
        "Given a column with 3 versions, when diff for v2 vs v3 is requested, then JSON deep-diff is rendered in unified view with added/removed/changed badges.",
        "Given there is no prior version, when v1 is selected, then the diff panel shows 'No prior version' empty state.",
    ],
    scope=[
        "apps/web/app/(admin)/settings/schema/[tableCode]/[columnCode]/diff/page.tsx [create]",
        "apps/web/app/(admin)/settings/schema/[tableCode]/[columnCode]/diff/page.test.tsx [create]",
    ],
    deps=["T-023", "T-066"],
)

# Schema migrations queue (SET-033) — admin view of pending L1 promotions
ui_task(
    num=99,
    title="Schema Migrations Queue screen (SET-033, L1 promotion tracker)",
    screen_code="SET-033",
    parent_feature="02-settings-c-ui",
    prd_section="§6.3, §6.6",
    proto_label="prototype: none (UX 02-SETTINGS-UX.md §schema-migrations)",
    proto_path="settings/admin-screens.jsx",
    proto_lines="630-688",  # parity vs promotions_screen tabs+table as parent pattern
    body_extra=(
        "List schema_migrations with status filter (pending/approved/running/completed/failed/rolled_back). "
        "Tracks L1 promotion requests admin-side. No write actions — superadmin handles approval."
    ),
    ac_extra=[
        "Given filter status='pending', when page renders, then only pending rows are listed and each row shows a 'View migration script' button (read-only).",
        "Given a row is clicked, when detail panel opens, then `migration_script` is shown in a read-only CodeMirror SQL view.",
    ],
    scope=[
        "apps/web/app/(admin)/settings/schema/migrations/page.tsx [create]",
        "apps/web/app/(admin)/settings/schema/migrations/page.test.tsx [create]",
    ],
    deps=["T-023"],
)

# L2 Tenant variations dashboard (SET-060)
ui_task(
    num=100,
    title="Tenant Variations Dashboard (SET-060)",
    screen_code="SET-060",
    parent_feature="02-settings-b-ui",
    prd_section="§9.7",
    proto_label="prototype: none (UX 02-SETTINGS-UX.md §tenant-variations)",
    proto_path="settings/admin-screens.jsx",
    proto_lines="350-408",  # parity vs flags_admin_screen list-with-actions
    body_extra=(
        "Lists active L2 overrides: dept_overrides + rule_variant_overrides + feature_flags. "
        "Each section has 'Edit' that opens dedicated editor (SET-061/062). Shows schema_extensions_count."
    ),
    ac_extra=[
        "Given the org has 2 dept_overrides + 3 rule variants set, when page renders, then each section header shows the correct count.",
        "Given Edit is clicked on a dept override, when navigation runs, then router.push to /settings/tenant/dept-taxonomy.",
    ],
    scope=[
        "apps/web/app/(admin)/settings/tenant/page.tsx [create]",
        "apps/web/app/(admin)/settings/tenant/page.test.tsx [create]",
    ],
    deps=["T-027"],
)

# Dept taxonomy editor (SET-061)
ui_task(
    num=101,
    title="Dept Taxonomy Editor (SET-061) — split/merge/add wizard (ADR-030)",
    screen_code="SET-061",
    parent_feature="02-settings-b-ui",
    prd_section="§9.2, §9.7, ADR-030",
    proto_label="prototype: none (UX 02-SETTINGS-UX.md §dept-taxonomy)",
    proto_path="settings/modals.jsx",
    proto_lines="262-375",  # parity vs promote_to_l2_modal Stepper pattern
    body_extra=(
        "Wizard for split/merge/add dept actions. Includes column_mapping picker for split. Calls "
        "T-027 setDeptOverrides."
    ),
    ac_extra=[
        "Given action='split' source='technical' targets=['food-safety','quality-lab'] without column_mapping, when submitted, then UI raises COLUMN_MAPPING_REQUIRED (V-SET-30).",
        "Given action='add' new code='regulatory-affairs', when submitted, then tenant_variations.dept_overrides JSONB receives the new entry.",
    ],
    scope=[
        "apps/web/app/(admin)/settings/tenant/dept-taxonomy/page.tsx [create]",
        "apps/web/app/(admin)/settings/tenant/dept-taxonomy/page.test.tsx [create]",
    ],
    deps=["T-027", "T-090"],
)

# Rule variant selector (SET-062)
ui_task(
    num=102,
    title="Rule Variant Selector (SET-062)",
    screen_code="SET-062",
    parent_feature="02-settings-b-ui",
    prd_section="§9.3, §9.7",
    proto_label="prototype: none (UX 02-SETTINGS-UX.md §rule-variant)",
    proto_path="settings/admin-screens.jsx",
    proto_lines="152-210",  # parity vs rules_registry_screen
    body_extra=(
        "Per-rule variant picker (v1/v2/...). Reads available versions from rule_definitions. "
        "Calls T-027 setRuleVariantOverrides."
    ),
    ac_extra=[
        "Given a rule has versions 1, 2 and the user selects v2, when saved, then tenant_variations.rule_variant_overrides[rule_code]='v2'.",
        "Given a non-existent version is forced via URL manipulation, when action runs, then it raises VARIANT_NOT_FOUND (V-SET-31).",
    ],
    scope=[
        "apps/web/app/(admin)/settings/tenant/rule-variants/page.tsx [create]",
        "apps/web/app/(admin)/settings/tenant/rule-variants/page.test.tsx [create]",
    ],
    deps=["T-027"],
)

# Module Toggles dashboard (SET-070 already covered by Features screen T-072 — keep dedicated)
ui_task(
    num=103,
    title="Module Toggles Dashboard (SET-070-grid)",
    screen_code="SET-070-grid",
    parent_feature="02-settings-b-ui",
    prd_section="§10.3",
    proto_label="features_screen (parity)",
    proto_path="settings/ops-screens.jsx",
    proto_lines="166-198",
    body_extra=(
        "15-module grid view with phase badge + dependency warnings. Distinct from per-tenant Features "
        "screen — this is the admin overview grid. Toggles call T-019."
    ),
    ac_extra=[
        "Given a module is disabled and a downstream module is enabled, when toggle is rendered, then a warning badge 'X dependents enabled' is shown and toggle requires confirm.",
        "Given the user clicks confirm with force=true, when action runs, then T-019 toggleModule executes and outbox event is emitted.",
    ],
    scope=[
        "apps/web/app/(admin)/settings/modules/page.tsx [create]",
        "apps/web/app/(admin)/settings/modules/page.test.tsx [create]",
    ],
    deps=["T-019"],
)


# ─────────────────────────────────────────────────────────────────────────────
# Manifest + coverage emission
# ─────────────────────────────────────────────────────────────────────────────

def write_manifest_and_coverage():
    task_files = sorted(p.name for p in TASK_DIR.glob("T-*.json"))
    manifest = {
        "source_prd": PRD,
        "root_path": ROOT_PATH,
        "generated_at": NOW,
        "generator": "prd-decompose-hybrid",
        "pipeline_name": "kira_dev",
        "task_count": len(task_files),
        "tasks": [f"tasks/{n}" for n in task_files],
        "coverage_file": "coverage.md",
    }
    (ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2))

    # Coverage file
    rows = COVERAGE_ROWS
    by_section: dict[str, list[dict]] = {}
    for r in rows:
        by_section.setdefault(r["section"], []).append(r)

    by_cat: dict[str, list[dict]] = {}
    for t in TASKS:
        by_cat.setdefault(t["category"], []).append(t)

    out = ["# PRD Coverage — 02-SETTINGS-PRD v3.5", ""]
    out.append("## Coverage by PRD section")
    out.append("")
    out.append("| PRD ref | Requirement | Task file | Status |")
    out.append("|---|---|---|---|")
    for section in sorted(by_section.keys()):
        for r in by_section[section]:
            req = r["requirement"].replace("|", "/")
            out.append(f"| {section} | {req} | {r['task']} | covered |")

    # Out-of-scope rows (PRD declares Phase 2/3 explicitly)
    out_of_scope = [
        ("§4.2", "Phase 2 features (multi-country VAT, waste categories, grade thresholds, fiscal calendar, target KPI, disposition codes, API keys, webhooks, MFA SMS, EmailConfig auto-triggers)", "out-of-scope per §4.2 (Phase 2)"),
        ("§4.3", "Phase 3 features (subscription/billing, CSV bulk users, IP whitelist per role, GDPR tooling, custom roles, L4 schemas)", "out-of-scope per §4.3 (Phase 3)"),
        ("§4.4", "Rule authoring UI; ad-hoc DDL via UI; tenant switching for non-superadmin; cross-tenant bulk ops", "out-of-scope per §4.4 (exclusions)"),
        ("§7.5", "Hard-lock semantyka rule registry approval", "out-of-scope per §7.5 (EVOLVING; deferred to 02-SETTINGS-d kickoff)"),
        ("§9.4 background canary worker", "Canary routing background job", "out-of-scope per §9.4 (background worker; T-028 Server Action only)"),
        ("§14.2 Phase 2/3 i18n", "DE/FR/UK/RO i18n", "out-of-scope per §4.2/§14.2 (Phase 2/3)"),
        ("§16.3 Open items", "Email provider Postmark; PostHog self-host infra spec; rollback time-window lock; reference MV refresh strategy bench", "out-of-scope per §16.3 (open items, deferred to sub-module kickoffs)"),
    ]
    for section, req, status in out_of_scope:
        out.append(f"| {section} | {req} | none | {status} |")

    out.append("")
    out.append("## Coverage by category")
    out.append("")
    for cat in sorted(by_cat.keys()):
        out.append(f"### {cat} ({len(by_cat[cat])} tasks)")
        out.append("")
        out.append("| Task | Subcategory | Type |")
        out.append("|---|---|---|")
        for t in sorted(by_cat[cat], key=lambda x: x["id"]):
            out.append(f"| {t['id']} | {t['subcategory']} | {t['task_type']} |")
        out.append("")

    out.append("## Gaps")
    out.append("")
    out.append("| PRD ref | Requirement | Status |")
    out.append("|---|---|---|")
    out.append("| (none) | — | resolved (every PRD section is either covered or explicitly out-of-scope above) |")
    out.append("")
    out.append("## Notes")
    out.append("")
    out.append("- 25 reference tables (§8.1) are covered by a single generic-CRUD set (T-021/022 + UI T-067) plus dedicated Manufacturing Operations (T-038/039/040 + T-077/078) and dedicated seed (T-093). Per-table seed tasks are intentionally NOT atomized further — `reference_schemas` (T-093) drives schema-driven CRUD for all 25 codes.")
    out.append("- 6 mistagged prototypes from prototype-index-settings.json (sites/shifts/devices/products/boms/partners) are documented as moved to other modules per D8 in T-095 decisions log; those are NOT covered here.")
    out.append("- Schema column edit wizard (SET-031), schema diff viewer (SET-032), and CSV import wizard (SET-053) carry parity AC against UX spec because no prototype exists (per Step 7 fallback).")
    (ROOT / "coverage.md").write_text("\n".join(out))


write_manifest_and_coverage()
print(f"Generated {len(TASKS)} tasks; manifest + coverage written.")
