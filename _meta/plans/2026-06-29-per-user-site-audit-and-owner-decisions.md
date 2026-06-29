# 2026-06-29 — Per-user-site RLS + NPD-DYN audit: shipped fixes + open owner decisions

Four read-only audit lanes (NPD-DYN field catalog, per-user-site RLS correctness, NPD/WO
lifecycle dead-ends, Settings/RBAC) ran against the code shipped in the prior session. This
records what was FIXED this session and the items that need an OWNER decision before fixing
(they touch the security/UX model, not just a bug).

Reference: live audit findings IDs (F-1..F-8 per lane) are in the session transcript.

## SHIPPED THIS SESSION (HEAD after = see git log; migs 385-386 applied + recorded live)

1. **mig 385 — quality_holds is org-global, NOT site-scoped (CRITICAL).** mig 383 mistakenly
   added a per-user-site RESTRICTIVE policy to `quality_holds`. The consume/ship/pack/pick/LP-ops
   gates read holds via `v_active_holds` (SECURITY INVOKER), so once sites are assigned a site-A
   operator consuming an LP whose hold was raised at site B would see ZERO active holds → the
   safety gate FALSE-PASSES and held material is consumed silently (T-064 / BRCGS). Dropped the
   one mis-applied policy; the PERMISSIVE org policy (tenant isolation) is untouched. Verified:
   `quality_holds` now has only `quality_holds_org_context`; the other 10 site policies intact.
2. **mig 386 — new-org NPD catalog seeding.** New orgs got `Reference.DeptColumns` (mig 095
   trigger) but NOT the dynamic catalog (`npd_departments`/`npd_field_catalog`/`npd_department_field`)
   the FA/FG forms + dept-close gate read → blank NPD config + every dept closeable with no
   required-field enforcement. Added `trg_seed_npd_dynamic_catalog` (fires after the DeptColumns
   seed) re-running mig 370's proven backfill scoped to `NEW.id`, + a one-time backfill for any
   existing org missing it. Verified end-to-end (rolled-back txn): a fresh org seeds 7 depts /
   64 fields / 64 links.
3. **UI/NPD polish** (one commit): locale-flip links (FG list, NPD dashboard, recipe ingredient
   link, FG→Technical BOM button — all hard-redirected to /en for /pl users); assign-sites +
   role-assign dialogs now `router.refresh()` after save (Site/Role column was stale until reload);
   `datetime` catalog field now renders the date control (was falling through to text);
   `update-fa-cell` write path now requires `visible=true` (matches render + gate).
4. **5 pre-existing red .ts tests repaired** (stale mocks/assertions; zero prod change). Web
   suite for those files: 85/85 green.

## OPEN — NEED OWNER DECISION (deferred; all are NO-OP today, 0 user_sites rows)

### D1 — Cross-site Transfer Orders break under per-user-site RLS (audit2 F-2, HIGH)
A transfer order spans two sites. Once a user is restricted to site A, `shipTransferOrder` /
`receiveTransferOrder` / `fetchLines` silently lose the LP rows at the OTHER site (license_plates
is site-RLS'd) → `insufficient_stock` on ship, zero-row receives, false "not reversible" in the UI.
- **Decision needed:** should a site-restricted user be able to operate a cross-site TO at all?
  - (a) YES → the TO LP-resolution reads must run org-scoped via a SECURITY DEFINER function
    (bypass the LP site policy for the specific TO's lines). Recommended — TOs are inherently
    cross-site.
  - (b) NO → require TO operators to be assigned to BOTH the source and destination site; add a
    clear pre-flight error instead of silent partial results.

### D2 — Genealogy / traceability truncates at the site boundary (audit2 F-3, HIGH, regulatory)
`queryGenealogy` (recursive CTE over license_plates) + the quality trace upstream reads are
site-RLS'd. A site-restricted user gets an INCOMPLETE ancestor chain with NO error — dangerous for
a recall investigation (BRCGS/GS1 traceability must be complete).
- **Recommendation:** trace/genealogy is a regulatory read and should ALWAYS be org-complete →
  wrap the genealogy + trace queries in a SECURITY DEFINER function that bypasses the LP site
  policy. Low controversy; just needs the definer-wrap migration + repoint. Flagging as a decision
  only because it formally widens what a restricted user can see (cross-site lineage).

### D3 — Custom NPD departments cannot be closed (audit1 F-8, design)
The admin "Settings → NPD Fields" lets you create CUSTOM departments, but `closeDeptSection` /
`getRequiredFieldsForDept` hardcode `z.enum(DEPT_VALUES)` = the 7 canonical depts, and
`public.product` has only 7 `closed_*` columns. So a custom dept renders a "Close" button that
always errors `INVALID_INPUT`.
- **Decision needed:** do you want custom departments to be closeable? If yes this needs a real
  model change (a `npd_department_closures` table keyed by department_id, replacing the 7 fixed
  `closed_*` columns) — a meaningful migration, not a quick fix. If "the 7 canonical depts are
  enough", we should instead HIDE the Close affordance for custom depts (cheap) and treat custom
  depts as informational-only. **This is directly relevant to the dynamic-departments feature you
  added — please decide the intent.**

### D4 — schedule_outputs site policy is a permanent no-op (audit2 F-5, MED)
`schedule_outputs` got a site RESTRICTIVE policy (mig 383) but `createWorkOrder`/MRP never set
`site_id` and no trigger populates it → every row has `site_id=null` → `user_can_see_site(null)`
is always true → the policy never restricts. Fail-OPEN (safe, no leak/breakage), but the table is
effectively unscoped. Fix when convenient: a BEFORE INSERT trigger to fill `site_id` from the WO's
line site + a backfill (mirrors mig 379/380). Low urgency.

### D5 — Holds list is now org-wide for everyone (consequence of mig 385, FYI)
Because mig 385 removed the site policy from `quality_holds`, a site-restricted user's holds LIST
shows ALL org active holds. This is intentional and safety-positive (holds are org-wide). If you
ever want the holds LIST visually filtered per site as a pure view nicety, add an app-layer WHERE
on the LIST query ONLY — never re-add an RLS policy (that re-breaks the gate). No action needed
unless you dislike the org-wide list.

### D6 — "Unassign all sites = unrestricted" (audit settings F-4, FYI)
In the assign-sites dialog, saving with NOTHING checked deletes all rows → the user becomes
UNRESTRICTED (sees ALL sites), not "no access". The dialog shows a blue hint explaining this. It
is intentional/disclosed, but is a footgun for an admin who expects "nothing checked = no access".
- **Decision:** keep as-is (assignment is opt-in; empty = unrestricted), or add a confirm step for
  the all-unchecked case?

## MINOR FOLLOW-UPS (no decision needed; small, do opportunistically)
- `createLine`/`upsertLine` maps a duplicate line code to generic `persistence_failed`; `createSite`
  maps the same unique-violation to friendly `duplicate_code`. Add 'duplicate_code' to
  `UpsertLineResult` + catch 23505 (then the settings-wiring test can assert the friendly error).
- grn_items / sales_orders have no site RLS (audit2 F-6/F-7) — currently SAFE because every read
  reaches them through a site-gated license_plates join; only a concern if a future query reads
  them directly without a site-owning parent. Note for whoever adds such a query.
- audit1 F-4 (zero-required-field dept: modal Confirm disabled while the DB gate would allow close)
  and F-7 (null validation_json coerced to {}) — both LOW/cosmetic.
