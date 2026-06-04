VERDICT: BLOCK

**Findings**

P0 — RBAC overgrant to `org.schema.admin`  
[150-settings-rbac-matrix-seed.sql](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/150-settings-rbac-matrix-seed.sql:50) puts `org.schema.admin` in the full admin grant family, then grants dangerous capabilities including `impersonate.tenant`, D365 secret rotation/test connection, users/roles management, SSO/SCIM, and security edits. This conflicts with the locked SoD model where `org.access.admin` and `org.schema.admin` are exclusive ([permissions.test.ts](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/rbac/src/__tests__/permissions.test.ts:225)); migration 149’s org-admin family also excludes `org.schema.admin`. Suggested fix: remove `org.schema.admin` from the broad admin-family join and grant only schema-scoped permissions plus the literal `org.schema.admin` gate where needed.

P0 — `returnTo` sanitizer still permits open redirects via backslash/control normalization  
[product-create-wizard.client.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/products/new/product-create-wizard.client.tsx:27) only rejects non-`/` and `//` paths. `%2F%5Cevil.example.com` decodes to `/\evil.example.com`, passes the guard, and URL parsers normalize it to `https://evil.example.com/`; `%2F%09%2F%2Fevil.example.com` has the same issue. Suggested fix: reject decoded values containing backslashes or ASCII controls/whitespace, then validate with `new URL(decoded, origin)` and require same origin before `router.push`.

P2 — Some reviewed Server Actions still do not use runtime zod validation  
[company/page.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(admin)/settings/company/page.tsx:132) accepts typed but unparsed `SaveCompanyProfileInput`; [import-csv.ts](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/actions/reference/import-csv.ts:265) uses manual parsing rather than zod. Both have RBAC/`withOrgContext`; this is a contract/parity nit, not the blocker.

**Checks Run**

`pnpm --filter @monopilot/outbox test -- src/__tests__/check-drift.test.ts src/__tests__/events.test.ts` passed.  
`pnpm --filter web exec vitest run --config vitest.ui.config.ts app/[locale]/(app)/(npd)/products/new/__tests__/product-create-wizard.test.tsx` passed, but it does not cover the backslash/control redirect payloads.  
`actions/infra/crud.test.ts` passed inside the combined run; `actions/reference/csv.integration.test.ts` failed because local DB `mariuszkrawczyk` does not exist.