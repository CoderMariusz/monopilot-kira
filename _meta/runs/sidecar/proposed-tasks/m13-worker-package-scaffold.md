# PROPOSED TASK STUB — scaffold apps/worker (phantom package, blocks 13 workers + 14 activation)

> Proposal only. Not added to any manifest/STATUS. Cross-listed for 13 + 14.

## Problem (evidence)
- `13-maintenance` T-009 (PM cron engine) + T-017 (auto-downtime consumer) target `apps/worker/src/maintenance/*`.
- `14-multi-site` T-011 + T-030 target `apps/worker/src/jobs/*`.
- **`apps/worker` does not exist** (reality audits for both modules flag it PHANTOM with no owning task).
- 00-foundation T-111/T-112 (outbox + per-tenant worker loop) are the natural home but are themselves unbuilt.

## Proposed scope
- Confirm `apps/worker` is created by **00-foundation T-111/T-112** (preferred). If those tasks only create the
  outbox/dispatcher primitive without the app shell, add an explicit scaffold task.
- Scaffold `apps/worker` (package.json, entrypoint/cron runner, outbox-consumer registration mechanism,
  per-tenant loop, vitest + testcontainers config).
- Ensure module consumers (13 maintenance/*, 14 jobs/*) can register handlers without further scaffolding.

## Acceptance
- `apps/worker` builds + runs the cron/consumer loop; 13 T-009/T-017 + 14 T-011/T-030 can register their handlers.

## Risk tier: medium (scaffolding, but core to outbox correctness).
## Cross-module: 00-foundation (owner), 13-maintenance + 14-multi-site (consumers).
</content>
