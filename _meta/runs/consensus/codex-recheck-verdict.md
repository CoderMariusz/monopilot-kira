UPDATED VERDICT: **SIGN-OFF**

P0 resolved: **yes**. [147-restore-fa-edit-outbox-event.sql](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/147-restore-fa-edit-outbox-event.sql:40) includes `fa.edit`. Mechanical set diff confirms migration 147 is a strict superset of migration 144: `81 + fa.edit = 82`, with **no dropped events** and no duplicates.

P1 resolved: **yes**. [events.enum.ts](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/outbox/src/events.enum.ts:10) has canonical `FG_EDIT = 'fg.edit'`, and [events.enum.ts](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/outbox/src/events.enum.ts:75) aliases `'fa.edit'` to `fg.edit`. The worker and cron route still normalize every row at [worker.ts](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/outbox/src/worker.ts:44) and [route.ts](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/api/internal/cron/outbox/route.ts:95).

No new P0s found. Settings, foundation, and NPD event groups remain present in the 147 CHECK union.

Verification run: `pnpm --filter @monopilot/outbox exec vitest run src/__tests__/events.test.ts` passed, 7/7 tests.