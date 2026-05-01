# Task taxonomy — category / subcategory

Standard taxonomy for classifying decomposed tasks. Use this when running
`prd-decompose-hybrid` so that 100+ tasks from a large PRD corpus group into
navigable blocks ("10 modals, 15 endpoints, 8 migrations") instead of a flat ID list.

## Rules

1. Every task gets exactly **one** `category` (top-level) and exactly **one** `subcategory` (granular).
2. If a task genuinely cross-cuts (e.g., "add auth middleware + login modal + users table"), **split it** — that is a coverage-matrix signal that the PRD paragraph is too big for one task.
3. If no subcategory fits, use the catch-all `other` within the category — and open a follow-up to extend this taxonomy rather than inventing ad-hoc labels.
4. Until `kira-hq add-task --category/--subcategory` exists (backlogged), encode classification as a **prefix in the description**: `[category/subcategory] <one-sentence description>`. Example: `[ui/modal] Add-user modal dialog triggered from Users table header.`

## Top-level categories

| Category       | Use for                                                      |
|----------------|--------------------------------------------------------------|
| `ui`           | Frontend user-facing components / pages                      |
| `api`          | Backend HTTP/WS surface exposed to clients                   |
| `data`         | Database schemas, migrations, models, queries                |
| `infra`        | Deploy, CI/CD, config, secrets, observability                |
| `auth`         | Authentication / authorization / session                     |
| `docs`         | Documentation artifacts (READMEs, ADRs, user guides)         |
| `test`         | Test infrastructure/harnesses (NOT per-task test code)       |
| `integration`  | Cross-system wiring (3rd-party APIs, internal bridges)       |

## Subcategories

### ui
`modal`, `table`, `form`, `menu`, `page`, `layout`, `nav`, `chart`, `drawer`, `toast`, `other`

### api
`endpoint-get`, `endpoint-post`, `endpoint-mutation`, `middleware`, `websocket`, `job`, `other`

(Use `endpoint-mutation` for PUT/PATCH/DELETE collectively; split only if the task is genuinely about one verb.)

### data
`migration`, `seed`, `model`, `query`, `index`, `view`, `rule`, `other`

(`rule` = stored DSL / rule-engine metadata tables and serialized rule definitions — the *data* side of a rule engine. Use `api/middleware` or `api/job` for the *runtime* that evaluates them.)

### infra
`ci`, `docker`, `config`, `secrets`, `monitoring`, `deploy`, `queue`, `other`

(`queue` = message bus, outbox worker infra, broker provisioning — Kafka/Azure Service Bus/RabbitMQ/etc.)

### auth
`login`, `rbac`, `session`, `oauth`, `other`

### docs
`readme`, `api-docs`, `adr`, `user-guide`, `regulatory`, `other`

(`regulatory` = compliance roadmaps, standards-mapping docs — FSMA, EUDR, BRCGS, FIC, GDPR, Peppol mandates, etc.)

### test
`fixture`, `harness`, `e2e-setup`, `other`

(Unit/integration tests for a feature live inside that feature's task, not here.)

### integration
`telegram`, `hermes-bridge`, `supabase`, `vercel`, `d365`, `peppol`, `edi`, `gs1`, `epcis`, `other`

(`d365` = Microsoft Dynamics 365 adapters/DMF/OData. `peppol` = Peppol AP / e-invoicing. `edi` = EDIFACT/ANSI X12 exchanges. `gs1` = GS1-128, GTIN/SSCC/GLN parsing. `epcis` = EPCIS event emission/consumption. Extend this list with new subcategories as projects grow — keep additions in this file, not scattered in task descriptions.)

## Example classifications

| Task title (abbreviated)                    | Prefix                         |
|---------------------------------------------|--------------------------------|
| Add-user modal with email validation        | `[ui/modal]`                   |
| Users list table with sorting               | `[ui/table]`                   |
| `POST /api/users` endpoint + validation     | `[api/endpoint-post]`          |
| Alembic migration: `users` table schema     | `[data/migration]`             |
| Seed default roles on first boot            | `[data/seed]`                  |
| JWT middleware verifying session cookie     | `[auth/session]`               |
| Pre-commit hook running ruff + mypy         | `[infra/ci]`                   |
| ADR-004: decision to use Postgres over MySQL| `[docs/adr]`                   |
| Pytest fixture spawning test Postgres       | `[test/fixture]`               |
| Telegram bridge reliability retry loop      | `[integration/telegram]`       |

## Coverage matrix grouping

When generating `docs/plans/YYYY-MM-DD-<prd>-coverage.md`, group the coverage
table by `category` so the reader sees the shape of the work:

```markdown
## ui (18 tasks)
| PRD section | task | subcategory |
| §4.2        | T-12 | modal       |
| §4.3        | T-13 | table       |
...

## api (23 tasks)
| PRD section | task | subcategory |
| §5.1        | T-30 | endpoint-post |
...
```

This reveals imbalance early ("45 ui tasks and 2 data tasks — did we forget the
migration work?") which a flat list hides.
