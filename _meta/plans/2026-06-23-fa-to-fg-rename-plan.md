# fa → FG rename — execution plan & owner decision (2026-06-23)

Owner decision #4 was "rename fa → FG NOW, dedicated isolated wave." On scoping (full
read-only inventory, 2026-06-23) this is **NOT a single mechanical rename** — it is 3
coordinated lanes plus **one new owner decision** that must be made first. It was therefore
DEFERRED from the autonomous run (it changes live URLs + live event contracts + needs a
destructive data migration, none of which can be browser-verified while deploy/push is
session-blocked). Everything needed to execute it deliberately is below.

## 🚨 Blocking owner decision (decide BEFORE any code change)
**Product codes physically start with `FA`.** `packages/validation/src/v01-product-code.ts:1`
is `/^FA[A-Z0-9]+$/`, and every row in `public.product` has a code like `FA0043`, `FA5101`.
Two options:
- **(A) Keep existing codes as `FA*` forever; only NEW codes use `FG*`.** Low risk — change
  the regex to accept both (`/^F[AG][A-Z0-9]+$/`) or generate `FG*` going forward while old
  codes stay. No data migration. **Recommended.**
- **(B) Rename ALL existing codes `FA*` → `FG*`.** Destructive multi-table data migration:
  `product.product_code` + every FK that stores the code (`bom_headers.fa_code` & product_id,
  risks, docs, `fa_allergen_overrides`, `fa_benchmarks`, `fa_builder_outputs`,
  `outbox_events.aggregate_id`, `audit_log.resource_id`, …). HIGH risk; needs a careful,
  reversible data migration + full verification.

This decision gates Step 8 below. Steps 1–7 can proceed under option (A) without touching data.

## Compat-view status (good news)
The main entity rename is **already done**: `public.product` is the real table (mig 075),
`public.fa` is a read-only compat VIEW (write-blocked by trigger). App code already queries
`public.product` directly. So the highest-risk table rename is NOT pending.

## Execution order (safest-first) — 3 lanes
**LANE 1 — cosmetic (LOW risk, no migration, ~100 files):**
- Step 1: fix the 3 hardcoded "Factory Article" copy strings still in
  `(npd)/fa/[productCode]/page.tsx:704,716`, `docs/page.tsx:45`, `_components/fa-tabs.tsx:185`
  (the i18n catalog already says "Finished Good" — these pages are a stale partial rename).
- Step 2: rename internal `Fa*` TS identifiers (~103 exports: `FaListTable`, `FaListRow`,
  `FaDetailPage`, …) — file-scoped; watch the cross-module imports from
  `(npd)/fa/actions/search-items` (planning/quality/shipping import `FaCreateModal`/types).
- Step 3: rename route dir `(npd)/fa` → `(npd)/fg` + nav `npd-nav.ts:54` `route:"/fa"`→`"/fg"`
  + 6 hardcoded `href="/fa/…"` literals + the 5 E2E specs that assert `/fa/` URLs. **MED risk:
  changes live URLs** — must browser-verify no 404s after deploy.

**LANE 2 — outbox events + permissions (HIGH risk, coordinated migration + code in one commit):**
- Step 4: permission strings — migration renaming `fa.create`/`fa.delete`/`npd.fa.*` rows in
  BOTH `role_permissions` and the `roles.permissions` jsonb cache to `fg.*`, in lockstep with
  the app RBAC checks (`fa/page.tsx:73`, `layout.tsx:61-63`, …). App + migration must land
  together or every check 403s.
- Step 5: Tier-A events — `create-fa.ts` emits `fa.created`, `update-fa-cell.ts` emits
  `fa.edit`; these already normalize to `fg.*` via `LegacyEventAlias`. Switch emit sites to
  `fg.*` (no migration needed — aliases cover it).
- Step 6: Tier-B events — 9 canonical `fa.*` events (`fa.built`, `fa.cascade`, `fa.deleted`,
  `fa.dept_closed/reopened`, `fa.recipe_changed`, `fa.template_applied`, `fa.built_reset`,
  `fa.core_closed`) are full `EventType` members in the **live `outbox_events` CHECK** with
  existing rows. Needs: (a) migration replacing the CHECK (drop 9 `fa.*`, add 9 `fg.*`) +
  `UPDATE outbox_events SET event_type='fg.…' WHERE event_type='fa.…'`; (b) update 5 emitter
  files + `events.enum.ts` + `event-types.ts` + `packages/outbox/src/emit-fa-event.ts`. The
  drift-gate test enforces enum↔CHECK parity — must land atomically.

**LANE 3 — secondary DB objects (HIGH risk, one ALTER migration per object):**
- Step 7: `fa_benchmarks`, `fa_allergen_overrides`, `fa_builder_outputs` (tables);
  `fa_status_overall`, `fa_bom_view` (views); `bom_headers.fa_code` (column); `get_fa_bom()`
  (function); `fa_allergen_override_action` (pg enum) — each an ALTER … RENAME + its Drizzle
  schema file + the raw-SQL action sites. Independent of UI/routes; do one at a time.

**Step 8 — product codes:** only after the owner decision above. Under (A) just widen the
regex; under (B) author the destructive data migration carefully.

## Recommendation
1. Owner picks (A) or (B) for product codes (recommend **A** — no destructive data migration).
2. Run LANE 1 as one Codex/mechanical pass → **browser-verify the new `/fg` routes return
   200 (no 404s)** on a deploy preview before merging.
3. Run LANE 2 as one atomic commit (migration + code) → verify drift-gate + a CCP/HACCP/NPD
   event flow still emits/consumes.
4. Run LANE 3 one object at a time.
This is a focused human-supervised session (browser verification is essential because Steps 3
change URLs and Steps 4/6 change live contracts) — not an autonomous fire-and-forget rename.

(Full per-file inventory with grep commands + counts is in the autonomous-run transcript
2026-06-23; reproduce with: `find apps/web/app -type d -name fa`, `grep "'fa\." packages/outbox/src/events.enum.ts`,
`grep -rl "Factory Article" apps/web`, `grep fa_code packages/db/migrations`.)
