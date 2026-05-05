# ADR-035 Marker Discipline [UNIVERSAL]

Status: Accepted
Date: 2026-05-05
PRD reference: docs/prd/00-FOUNDATION-PRD.md §1, §2, §4, §W0-v4.3
Task reference: T-005 / TASK-000209

## [UNIVERSAL] Decision

Monopilot PRDs, ADRs, ACP-ready task prompts, and module registry seed data use explicit marker discipline so readers can tell whether a requirement is universal product behavior, Apex customer configuration, still-evolving design, or legacy D365 compatibility.

Business-domain docs/tasks MUST use `org_id` for business data-plane scope and the canonical finished-good domain/event prefix `fg.*`. `fa.*` or `FA` may appear only when documenting a legacy compatibility alias during migration; it is never the primary new contract.

The module registry lives at `_foundation/registry/modules.json` and is seeded from `docs/prd/00-FOUNDATION-PRD.md` §4.3. Each entry carries `business_scope_column: "org_id"` so downstream ACP task generation does not reintroduce business-table `tenant_id` columns.

## [UNIVERSAL] Marker definitions

- [UNIVERSAL] Product-wide, customer-agnostic rules that all modules inherit unless a later ADR explicitly changes them.
- [APEX-CONFIG] Apex-specific configuration, seed data, labels, toggles, or deployment choices that must remain configurable and must not become hard-coded product behavior.
- [EVOLVING] Known incomplete or provisional design areas that can be refined by later PRDs/ADRs without being treated as stable contract.
- [LEGACY-D365] Compatibility requirements for existing Dynamics 365, Builder, SQL, export, import, or naming contracts during migration.

## [UNIVERSAL] Wave0 domain naming rule

Wave0 locks these naming rules for every business-domain doc and ACP task:

1. Business rows, RLS policies, audit/outbox rows, role grants, and R13 skeletons use `org_id` as the application/business data-plane scope column.
2. Tenant/control-plane concepts may exist above org scope, but new business tables do not add business-table `tenant_id` columns.
3. Finished-good domain events and contracts use `fg.*` as the canonical prefix.
4. `fa.*` / `FA` is allowed only as a [LEGACY-D365] legacy compatibility alias while migration requires it.
5. RLS language must use the safe non-spoofable org-context pattern; app users must not rely on unsafe direct custom GUC `SET`, and functions must not be declared `LEAKPROOF` unless proven valid and necessary.

## [UNIVERSAL] ACP-ready task discipline

ACP-ready tasks generated from these docs must stay atomic and local:

- Lower numeric priority means earlier pickup.
- Dependencies use local `T-XXX` IDs.
- Cross-module blockers belong in `pipeline_inputs.cross_module_dependencies` and in the task prompt.
- For this Wave0 foundation registry task, exactly one atomic task type is permitted: `T1-schema`.
- ACP import payloads use top-level TaskCreate fields only (`title`, `prompt`, `labels`, `priority`, `max_attempts`, `pipeline_name`, `pipeline_inputs`), with mandatory `pipeline_inputs.root_path`; generated ACP fields such as `task_id`, `status`, or `project_id` are not authored into task JSON.

## [UNIVERSAL] Domain glossary reference

If `_foundation/glossary/domain-terms.md` exists, writers and task generators should treat it as the Wave0 domain glossary reference for naming checks. This ADR intentionally references that path without requiring T-048 to have run; missing glossary output must not make marker checks fail at runtime.

## [APEX-CONFIG] Apex configuration boundary

Apex-specific names, module labels, import defaults, customer terminology, and D365 deployment details are configuration or migration context. They may seed examples, but they must not override the [UNIVERSAL] `org_id` and `fg.*` rules for new product contracts.

## [EVOLVING] Future extension points

The marker allowlist and checker can grow as additional front matter or non-business headings are standardized. Any expansion must be explicit and narrow so unmarked business PRD/ADR headings still fail closed.

## [LEGACY-D365] Compatibility boundary

Legacy D365, Builder, SQL, and export/import aliases are documented under [LEGACY-D365]. These aliases are temporary compatibility aids and must name the canonical replacement when one exists; for finished goods the replacement is `fg.*` for new domain/event contracts.
