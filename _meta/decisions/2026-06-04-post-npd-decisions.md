# Post-01-npd human decisions (2026-06-04)
1. In-the-meantime work (parallel): (a) fix 01-npd gaps G-1 FaCreateModal wiring + G-2 RBAC vocab; (b) apply settings RBAC matrix (sidecar mig 211 -> 150); (c) hotfix outbox cron per-row try/catch; (d) Phase-0 audit 03-technical.
2. 02-settings: **formally RE-OPEN sign-off** (reachability was really broken — warehouse unreachable + ~24-30 unseeded perms; live survived only via hand-seed). Full gate again after fix.
3. Outbox event source-of-truth: **ENUM-AUTHORITATIVE** — events.enum.ts is SoT; DB CHECK generated/validated from it; CI/drift gate enforces enum<->CHECK sync. (+ cron poison-pill hotfix.)
4. Next module after 01-npd acceptance: **03-technical** (unblocks 01-npd Sensory + 04-planning deps).
