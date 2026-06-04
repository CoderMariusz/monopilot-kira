# PROPOSED TASK STUB — scaffold packages/domain (phantom package, blocks 14-b + 14-c)

> Proposal only. Not added to any manifest/STATUS.

## Problem (evidence)
- `14-multi-site` tasks T-009, T-010, T-011, T-013, T-014 target `packages/domain/src/transfer-orders/` and
  `packages/domain/src/transport-lanes/`. **`packages/domain` does not exist** (reality audit
  `_meta/audits/reality/14-multi-site-REALITY.md` risk #1). No task in 14 or 00-foundation creates it.
- Blocks the entire inter-site TO (14-b) and transport-lanes (14-c) sub-modules.

## Proposed scope
- Decide owner: most likely a **00-foundation** scaffold task (shared package) OR a 14-a prerequisite.
- Scaffold `packages/domain` (package.json, tsconfig, build wiring in turbo/pnpm workspace, vitest config).
- Define the conventional layout (`src/<aggregate>/{actions,state-machine,...}.ts`) used by 14-b/14-c tasks.
- Add a placeholder export + smoke test so dependent tasks can import.

## Acceptance
- `pnpm --filter @monopilot/domain build` + `test` pass; T-009..T-014 can import from `@monopilot/domain`.

## Risk tier: medium (scaffolding). 
## Cross-module: 00-foundation (likely owner) + 14-multi-site (consumer).
</content>
