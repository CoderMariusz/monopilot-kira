# Maintenance — MWO work orders + PM schedules (CMMS) (module guide)

> Per-module deep guide. Every claim below is anchored to a real file under
> `apps/web/…` or `packages/…`; nothing is invented. Maintenance is **module 13**
> (`13-maintenance` in `.claude/skills/MON-project-overview/SKILL.md`; canonical
> permission family `mnt.*.*`, event prefix `maintenance.*`). The Polish name is
> **Utrzymanie ruchu**.
>
> The **live surface is one screen**: `/maintenance`
> (`apps/web/app/[locale]/(app)/(modules)/maintenance/page.tsx`, nav link
> `/pl/maintenance`) — a two-view screen that renders a **Maintenance Work Order
> (MWO) list** + a read-only **PM schedule list**. It is backed by **one Server
> Actions file** (`maintenance/_actions/mwo-actions.ts`) with 5 actions plus a
> permission probe, all inside one `withOrgContext` txn each.
>
> The full **CMMS schema** — 15 tables: assets/equipment, technicians, PM
> schedules, MWO core + checklists + LOTO, spare parts (×4), calibration,
> sanitation, history — ships in the DB
> (`packages/db/migrations/201-maintenance-schema-foundation.sql` +
> `packages/db/schema/maintenance.ts`), but **only 2 of those 15 tables are read
> or written by any action** (`maintenance_work_orders` + `maintenance_schedules`,
> via the soft `public.machines` link from `migration 290`). The other 13 tables
> are an **orphan schema foundation** (see Known gaps). Routes are written without
> the `[locale]` prefix. Last reviewed against the working tree (Wave-8 lane CL1
> first vertical; the live MWO slice landed in commit `b690eb23`).
>
> **Cross-module note (don't duplicate):** downtime events feed **OEE** and
> production pauses, but that link is owned by **08-production**
> (`downtime_events`) and consumed by **15-oee** for MTBF/MTTR. Maintenance only
> carries a **soft `downtime_event_id` column** on an MWO; the auto-MWO-from-
> downtime flow is **not wired** (see §f.).

---

## a. Overview

Maintenance, as it is actually built, lets a maintenance planner **raise, run and
close a reactive work order against a machine**. A user opens `/maintenance`,
sees the MWO list (status tabs + counts + search), clicks **+ New mWO**, picks a
**machine** (from the real `public.machines` registry, not the unbuilt
`equipment` asset registry — see gaps), enters a title + problem description +
priority + optional due date, and submits. The MWO is born in state **`open`**
and walks a small hardcoded lifecycle: `open → in_progress → completed`, with
`cancelled` as a side branch. A read-only **PM schedules** view lists the
preventive/calibration/sanitation/inspection schedules from
`maintenance_schedules` (joined to the `equipment` registry for code/name).

That is the whole live module. There is **no asset/equipment CRUD, no PM cron
engine, no breakdown/repair logging beyond the MWO completion note, no LOTO
e-sign, no calibration capture, no sanitation capture, no spare-parts stock or
issue, and no MWO detail page** — all of those have schema + RBAC strings but no
Server Action or page (`packages/db/schema/maintenance.ts`, migration 201).

The one action file (`maintenance/_actions/mwo-actions.ts`) is the **first
enforcement point** of the `mnt.*` RBAC family that migration 202 seeded but
nothing consumed until this slice (`mwo-actions.ts:21-28`). The MWO state machine
is **server-side and hardcoded** (`LEGAL_TRANSITIONS`, `mwo-actions.ts:88-95`) —
the PRD's "workflow-as-data" engine is a later slice
(`mwo-actions.ts:13-19`,`maintenance.ts:196-197`). Every transition row-locks the
MWO (`for update`) and re-asserts the from-state in the `UPDATE`'s `WHERE` so two
concurrent transitions serialize (`mwo-actions.ts:502-541`). Two lifecycle outbox
events are emitted into `outbox_events` — `maintenance.mwo.created` (on create) and
`maintenance.mwo.completed` (on completion) — but **no consumer reads them** (see
§f.).

The asset master the module actually uses is **`public.machines`** (02-settings
owner, migration 042), reached as a **soft uuid** `machine_id` added by migration
290 (`290-maintenance-mwo-machine-link.sql:31-37`) — validated org-scoped inside
the action, no hard FK, mirroring the migration-201 cross-module convention. The
`maintenance_work_orders.equipment_id` hard-FK column (to the `equipment` asset
registry) stays untouched because that registry is empty/unbuilt
(`290…:9-19`).

---

## b. Function inventory

> Reads/writes name the Postgres tables touched. "Gate" is the permission checked
> server-side **inside** the action via the local `hasPermission` helper
> (`mwo-actions.ts:179-195`, which checks BOTH the normalized `role_permissions`
> table AND the legacy `roles.permissions` jsonb cache for the string). A missing
> permission returns a typed `{ ok:false, reason:'forbidden' }`, never a 500. The
> `mnt.*` family is seeded to the org-admin role family + a maintenance
> operator/technician role family by migration 202 §(B) — the #1 403-everywhere
> fix (`202-maintenance-outbox-and-rbac-seed.sql:167-323`).

### MWO + PM actions (the only live actions) — `maintenance/_actions/mwo-actions.ts`

| Action (file) | What it does | Reads / writes | Gate | Reverse / correction |
|---|---|---|---|---|
| `listMwos({status?,machineId?,limit?})` (`mwo-actions.ts:283`) | `/maintenance` list loader. Per-state tab counts over the WHOLE org set, then the filtered page (status tab + optional machine, `order by created_at desc`, limit ≤200). Left-joins `machines` for code/name; falls back `title → requester_reason → mwo_number` so a pre-290 row never shows blank. **Pure read.** | reads `maintenance_work_orders`, `machines`; writes nothing | `mnt.asset.read` | — (read) |
| `listMachinesForMwo()` (`mwo-actions.ts:348`) | Active machines for the create-modal dropdown (`status='active'`, org-scoped, limit 500, `order by code`). | reads `machines` | `mnt.asset.read` | — (read) |
| `listPmSchedules()` (`mwo-actions.ts:576`) | Read-only PM schedule list — `maintenance_schedules` left-joined to `equipment` for code/name, `order by next_due_date asc nulls last`. The PM **cron engine + editor are not built** (T-003/T-009 follow-ons, `mwo-actions.ts:571-575`). | reads `maintenance_schedules`, `equipment` | `mnt.asset.read` | — (read) |
| `getMwoPermissions()` (`mwo-actions.ts:266`) | Server-resolved RBAC flags (`canRead/canCreate/canExecute/canCancel`) driving which buttons the client island renders; mutations re-check anyway. Returns all-false on any error (fail-closed). | reads `user_roles`, `roles`, `role_permissions` | — (probe; gates downstream) | — |
| `createMwo({machineId,title,description?,priority,dueDate?,downtimeEventId?})` (`mwo-actions.ts:384`) | Create a manual **`reactive`** MWO in state **`open`**. Validates the soft machine link org-scoped (`not_found` if absent). Allocates `mwo_number = MWO-YYYY-NNNNN` under a **per-org advisory xact lock** (`pg_advisory_xact_lock`) so concurrent creates never collide on the `(org_id, mwo_number)` unique. `source` = `auto_downtime` when a `downtimeEventId` is supplied, else `manual_request`. Emits `maintenance.mwo.created`. | reads `machines`; writes `maintenance_work_orders`, `outbox_events` | `mnt.mwo.request` | `transitionMwo(...,'cancelled')` |
| `transitionMwo({mwoId,to,note?})` (`mwo-actions.ts:489`) | Move an MWO along `LEGAL_TRANSITIONS`. `to='in_progress'` stamps `started_at`; `to='completed'` stamps `completed_at` + computes `actual_duration_min` (now − started, ≥0) + saves `completion_notes`; `to='cancelled'` saves `cancellation_reason`. Row-locked `for update`; `UPDATE` re-asserts the from-state (`and w.state = $5`). Emits `maintenance.mwo.completed` in the SAME txn on completion. | writes `maintenance_work_orders`, `outbox_events` | start/complete → `mnt.mwo.execute`; cancel → `mnt.mwo.cancel` (SoD: admin/manager-only per the 202 seed) | — (no un-complete; `completed`/`cancelled` are terminal) |

**Action count inventoried: 6** (3 read: `listMwos`, `listMachinesForMwo`,
`listPmSchedules`; 1 RBAC probe: `getMwoPermissions`; 2 write: `createMwo`,
`transitionMwo`). There are **no asset, technician, PM-edit, LOTO, calibration,
sanitation, spare-parts, or history actions** anywhere in the tree — those tables
have schema + RBAC strings but no code (see §f.).

### RBAC family seeded but mostly unenforced — `packages/rbac/src/permissions.enum.ts`

> The full `mnt.*` family (18 strings, `ALL_MAINTENANCE_PERMISSIONS`,
> `permissions.enum.ts:354-388`,`:794-813`) is seeded by migration 202; only the
> **4 strings below** are read by any code. The rest are declared-but-dead until
> their slices land.

| Permission | Seeded (mig 202) | Read by code? | Where |
|---|---|---|---|
| `mnt.asset.read` | ✅ admin + operator | ✅ | nav gate (`module-registry.ts:18`,`:237`) + all 3 reads (`mwo-actions.ts:52`) |
| `mnt.mwo.request` | ✅ admin + operator | ✅ | `createMwo` (`mwo-actions.ts:53`,`:395`) |
| `mnt.mwo.execute` | ✅ admin + operator | ✅ | `transitionMwo` start/complete (`mwo-actions.ts:54`,`:497-499`) |
| `mnt.mwo.cancel` | ✅ admin only (SoD) | ✅ | `transitionMwo` cancel (`mwo-actions.ts:55`,`:498`) |
| `mnt.asset.edit` / `.deactivate`, `mnt.mwo.approve` / `.assign` / `.sign`, `mnt.pm.create` / `.skip`, `mnt.calib.record` / `.upload_cert`, `mnt.spare.consume` / `.adjust` / `.reorder`, `mnt.loto.apply` / `.clear` | ✅ (operator subset per §4 least-privilege, `202…:215-228`) | ❌ **no reader** | — (their actions are unbuilt) |

---

## c. State machine

### MWO lifecycle (`LEGAL_TRANSITIONS`, `mwo-actions.ts:88-95`)

The DB CHECK admits **6 states** (`maintenance_work_orders_state_check`,
`201…:178-179`): `requested | approved | open | in_progress | completed |
cancelled`. The live slice only **creates** `open` rows and only drives the
hardcoded subset below; `requested`/`approved` rows can pre-exist via SQL/seeds
(the future PM-engine / work-request triage slice, D-MNT-9) and are
**cancellable but not startable** here.

```
 (requested ─┐
  approved ──┤── cancel ─► cancelled (terminal)
             │
   open ─────start──► in_progress ──complete──► completed (terminal)
    │                      │
    └────── cancel ────────┴────── cancel ─────► cancelled (terminal)
```

| State (`maintenance_work_orders.state`) | Legal `to` | Who writes it | Notes |
|---|---|---|---|
| `requested` | `cancelled` | (seeds / future WR slice) | Not created by this slice; cancel-only escape so orphan seeds never stick. |
| `approved` | `cancelled` | (future WR slice) | Same — cancel-only. |
| `open` | `in_progress`, `cancelled` | `createMwo` (all new rows) | The starting state of every UI-created MWO. |
| `in_progress` | `completed`, `cancelled` | `transitionMwo` (start) | Stamps `started_at`. |
| `completed` | — (terminal) | `transitionMwo` (complete) | Stamps `completed_at` + `actual_duration_min` + `completion_notes`; emits `maintenance.mwo.completed`. |
| `cancelled` | — (terminal) | `transitionMwo` (cancel) | Saves `cancellation_reason`. No "uncancel." |

The machine is enforced **twice**: the client renders only state-legal +
permitted row actions (`mwo-list.client.tsx:438-490` — `open→Start`,
`in_progress→Complete`, `Cancel` when `canCancel`), and `transitionMwo`
re-validates against `LEGAL_TRANSITIONS` server-side — an illegal verb returns
`invalid_transition` (`mwo-actions.ts:514-520`); the `for update` lock +
from-state re-assertion in the `UPDATE` serialize concurrent writers
(`mwo-actions.ts:503-547`).

State transitions are **NOT enforced by a DB trigger** — they are a Server-Action
concern by design (`201…:145-147`,`maintenance.ts:196-197`). There is no
`wo_events`-style immutable ledger here (contrast 08-production); the only trail
is the MWO row's own timestamp/note columns + the `maintenance_history` table,
which **is never written** (see §f.).

<!-- screenshot: /maintenance MWO list (status tabs + counts + search + table) -->
<!-- screenshot: /maintenance PM schedules view (read-only) + MWO create modal -->

---

## d. User how-tos

> Button labels below are the resolved English copy from the staged
> `maintenance-mwo` bundle (`_meta/i18n-staging/maintenance-mwo.json`, loaded by
> `maintenance-labels.ts` — the namespace is **not yet merged into next-intl**,
> see §f.); the `data-testid`s in parentheses are the stable anchors in
> `maintenance/_components/mwo-list.client.tsx`.

### (i) Raise a work order (reactive MWO)

1. Open **Maintenance** from the sidebar (`/maintenance`). The nav entry is gated
   on `mnt.asset.read` (`module-registry.ts:18`,`:237`); the page re-checks it
   inside every read action.
2. With the **Work orders** view selected (`mwo-view-mwos`), click **+ New mWO**
   (`mwo-create-open`) — the button only renders if you hold `mnt.mwo.request`.
3. In the modal (`mwo-create-modal`): pick a **Machine** (`mwo-create-machine` —
   the real `public.machines` list; if your org has no active machines you get an
   honest "no machines" notice `mwo-create-no-machines`), enter a **Title**
   (`mwo-create-title`, ≥3 chars), an optional **Problem description**
   (`mwo-create-description` → stored in `requester_reason`), a **Priority**
   (`mwo-create-priority`), and an optional **Due date** (`mwo-create-due-date`).
4. Submit (`mwo-create-submit`) → `createMwo`. The MWO is created in state
   `open` with `source='manual_request'`, gets `MWO-YYYY-NNNNN`, and the list
   refreshes.

### (ii) Start / complete / cancel an MWO

1. In the list, on an **`open`** row click **Start** (`mwo-start-<id>`); on an
   **`in_progress`** row click **Complete** (`mwo-complete-<id>`). Both need
   `mnt.mwo.execute`. **Cancel** (`mwo-cancel-<id>`) shows on any non-terminal row
   when you hold `mnt.mwo.cancel`.
2. A confirm modal (`mwo-transition-modal`) opens. **Complete** and **Cancel**
   take an optional **note** (`mwo-transition-note` → `completion_notes` /
   `cancellation_reason`); **Start** takes none. Confirm
   (`mwo-transition-confirm`) → `transitionMwo`.
3. On completion the MWO's `actual_duration_min` is computed from
   `started_at → now`, and `maintenance.mwo.completed` is emitted. An illegal
   move surfaces the "not a legal transition" error (`mwo-transition-error`); a
   permission miss surfaces the forbidden error.

### (iii) Filter / find an MWO

- Click a **status tab** (`mwo-tab-<state>`) to filter by state; each tab shows a
  live count. Type in **search** (`mwo-search`) to match MWO #, title, machine
  code or machine name (client-side over the loaded page). Empty states are
  honest: `mwo-empty` (no MWOs at all) vs `mwo-empty-filtered` (filtered out).
- An open/in-flight row past its **due date** is highlighted red with an
  **Overdue** badge (`mwo-overdue-<id>`, `mwo-list.client.tsx:355`,`:383-387`).

### (iv) View PM schedules (read-only)

1. Toggle the **PM schedules** view (`mwo-view-pm`). The table (`pm-schedule-card`)
   lists each schedule's **Equipment / Type / Interval / Next due / Last completed
   / Active** from `maintenance_schedules`.
2. This view is **read-only** — there is no PM create/edit/skip UI in the build
   (the editor + cron engine are unbuilt, `mwo-actions.ts:571-575`). Rows appear
   only if `maintenance_schedules` was seeded by SQL, since no action writes it.

### (v) Where breakdown/repair detail, LOTO, calibration, spares would live

They **do not exist in the UI yet.** Breakdown/repair "logging" is limited to the
MWO's completion note + `actual_duration_min`; there is no MWO detail page, no
LOTO dual-sign, no calibration capture, no spare-parts issue. The tables for all
of these exist (`packages/db/schema/maintenance.ts`) but no screen or action
touches them (see §f.).

---

## e. Data sources (Supabase tables)

Live MWO + PM reads/writes (the only tables any action touches):

- `maintenance_work_orders` — MWO core, 6-state (`201…:149-191`). The live slice
  writes `state`, `source`, `type='reactive'`, `priority`, `machine_id` (soft,
  mig 290), `title`, `due_date`, `requester_reason`, `requester_user_id`,
  `started_at`, `completed_at`, `actual_duration_min`,
  `completion_notes`/`cancellation_reason`. `equipment_id` (hard FK to the asset
  registry) is **never set** by the UI — machine MWOs use the soft `machine_id`
  instead (`290…:9-19`).
- `maintenance_schedules` — PM/calibration/sanitation/inspection schedules
  (`201…:111-142`); **read-only** in this slice (`listPmSchedules`). No action
  writes `next_due_date` / `last_completed_at`, so the cron columns are static.
- `machines` — **02-settings owned** (migration 042); the real asset registry the
  MWO links to via the soft `machine_id` (`290…`). Read for the dropdown + list
  join, never written here.

Governance / cross-cutting:

- `role_permissions` + `roles.permissions` — the `mnt.*` family (dual storage),
  seeded by migration 202 §(B) to the org-admin + maintenance-operator role
  families, with an `after insert` trigger so new orgs inherit it
  (`202…:292-323`). The local `hasPermission` reads both (`mwo-actions.ts:179-195`).
- `outbox_events` — admits the 9 maintenance event types + `spare.reorder_*`
  (CHECK regenerated by migration 202 §(A), `202…:61-68`,`:147`); the live slice
  emits exactly **2**: `maintenance.mwo.created` and `maintenance.mwo.completed`
  (`mwo-actions.ts:197-215`,`:458`,`:551`).

Maintenance-owned schema **defined but not read/written by any action** (migration
201, `packages/db/schema/maintenance.ts`):

- `maintenance_settings` (§9.1) — per (org,site) tunables incl. `mtbf_target_hours`,
  `calibration_warning_days`, `requires_loto_default`.
- `technician_profiles` (§9.2) — maintenance staff + skills/certs.
- `equipment` (§9.3) — the 5-level asset registry (site→area→line→machine→
  component); only **read** (joined for PM code/name), never written — the asset
  CRUD is unbuilt.
- `mwo_checklists` (§9.6), `mwo_loto_checklists` (§9.7) — execution checklist +
  LOTO dual-e-sign (OSHA 1910.147; `zero_energy_verified_by` + `released_by`).
- `spare_parts` (§9.8), `maintenance_spare_parts_stock` (§9.9),
  `spare_parts_transactions` (§9.10), `mwo_spare_parts` (§9.11) — the spare-parts
  CMMS (separate from 03-technical `items`, D-MNT-6).
- `calibration_instruments` (§9.12), `calibration_records` (§9.13) — instrument
  registry + immutable certs (21 CFR Part 11 `certificate_sha256`,
  `retention_until` GENERATED +7y BRCGS).
- `sanitation_checklists` (§9.14) — CIP + allergen-change dual-sign + ATP RLU
  (+7y retention).
- `maintenance_history` (§9.15) — append-only denormalized audit trail (+7y
  retention); **never written** by any action.

Cross-module identities are **soft uuids** (no Drizzle `.references()`,
`maintenance.ts:31-38`): `equipment.parent_line_id` / `assigned_operation_id`,
`maintenance_work_orders.downtime_event_id` (→ 08-production `downtime_events`),
`spare_parts.supplier_id`, `*.warehouse_id`, `sanitation_checklists.line_id`.

---

## f. Known gaps / TODO

Grounded in the code that was read — no guesses:

1. **13 of the 15 CMMS tables are an orphan schema foundation.** Only
   `maintenance_work_orders` (write) and `maintenance_schedules` +
   `equipment`/`machines` (read) are touched by any action. `maintenance_settings`,
   `technician_profiles`, `mwo_checklists`, `mwo_loto_checklists`, the four
   `spare_parts*`/`mwo_spare_parts` tables, `calibration_instruments`,
   `calibration_records`, `sanitation_checklists`, and `maintenance_history`
   exist in `packages/db/schema/maintenance.ts` + migration 201 with full CHECKs,
   RLS, indexes and GENERATED retention columns, but **no Server Action or page
   reads or writes them**. Asset CRUD, PM cron/editor, LOTO, calibration,
   sanitation, spare-parts and history are all unimplemented.

2. **The asset master is split: the UI uses `machines`, the schema FK is
   `equipment`.** `maintenance_work_orders.equipment_id` hard-FKs the unbuilt
   `equipment` registry, so the live slice links MWOs to the real
   02-settings `public.machines` table via a soft `machine_id` added by migration
   290 (`290…:9-19`). Until the `equipment` registry is populated (and an
   asset-CRUD screen exists), MWOs carry `machine_id` and `equipment_id` stays
   NULL — two parallel asset identities to reconcile.

3. **14 of the 18 `mnt.*` permissions are declared but dead.** Only
   `mnt.asset.read`, `mnt.mwo.request`, `mnt.mwo.execute`, `mnt.mwo.cancel` are
   read by code; `mnt.asset.edit/.deactivate`, `mnt.mwo.approve/.assign/.sign`,
   `mnt.pm.create/.skip`, `mnt.calib.record/.upload_cert`,
   `mnt.spare.consume/.adjust/.reorder`, `mnt.loto.apply/.clear` are seeded
   (`202…:195-228`) and in the enum (`permissions.enum.ts:354-388`) but have no
   reader — their actions are unbuilt.

4. **The 2 emitted outbox events have no live consumer.**
   `maintenance.mwo.created` / `maintenance.mwo.completed` are persisted to
   `outbox_events` but, per `MON-project-overview`, there is no running
   `apps/worker` dispatcher. The documented consumers — 15-OEE
   `mwo.completed → MTBF/MTTR` (D-MNT-3), 09-quality `calibration.failed`
   auto-hold, 08-production `sanitation.allergen_change → changeover gate`
   (D-MNT-14), 05-warehouse spare reorder (`events.enum.ts:224-238`) — are
   **seams, not delivered**. The other 7 maintenance event types are admitted by
   the CHECK but **never emitted** (no calibration/LOTO/sanitation/PM-due action
   exists).

5. **Downtime → OEE linkage is NOT a maintenance feature.** OEE's MTBF/MTTR is
   computed from `oee_snapshots` ÷ `downtime_events` — both **08-production owned**
   — inside the 15-oee `oee_shift_metrics` view (`203-oee-schema-foundation.sql:289-296`);
   it does **not** read maintenance MWOs. Maintenance only carries a soft
   `downtime_event_id` column and a `source='auto_downtime'` value. **Nothing
   auto-creates an MWO from a downtime event**: a code search for `auto_downtime`/
   `oee_trigger`/`calibration_alert` writers finds only the manual optional
   `downtimeEventId` param on `createMwo` (`mwo-actions.ts:168-169`,`:427`) and
   tests — the P2 auto-MWO trigger (T-017) is unwired.

6. **No MWO detail page, no checklist/repair-logging UI.** The list rows have no
   drill-in; breakdown/repair "logging" is just the completion note +
   `actual_duration_min` on the MWO row. The PRD's MWO checklists
   (`mwo_checklists`), LOTO, and `maintenance_history` event rows are never
   created. `mwo_spare_parts` cost roll-up into `actual_cost` does not happen
   (the column is never written).

7. **PM schedules are read-only and static.** `listPmSchedules` only reads;
   nothing writes `next_due_date` / `last_completed_at`, and there is no PM cron
   (the `idx_schedules_next_due` partial index + `maintenance.pm.due` event exist
   for an engine that isn't built, `201…:137-139`). Rows appear only if seeded by
   SQL.

8. **i18n is not merged into next-intl.** The `maintenance` namespace is resolved
   from a **staged** bundle `_meta/i18n-staging/maintenance-mwo.json` via a
   bespoke loader (`maintenance-labels.ts:1-18`), not the live `apps/web/i18n/*`
   files — only `en` + `pl` real values exist; the loader humanizes any missing
   key. When merged it collapses to a thin `getTranslations` wrapper
   (`maintenance-labels.ts:14-16`).

9. **`site_id` is day-1 nullable across all 15 tables with org-only RLS.** Every
   table carries a nullable `site_id` with no FK / no registry; the RLS predicate
   is org-only (`app.current_org_id()`) until 14-multi-site T-030 lands
   `app.current_site_id()` (`maintenance.ts:25-28`, `201…:7-11`,`:462-464`). The
   live MWO inserts never set `site_id`.

The action count and every gap above is derived from the files cited; the only
live maintenance code is the `/maintenance` page + the
`mwo-actions.ts` 6-action file over `maintenance_work_orders` /
`maintenance_schedules` / `machines`, and the rest of the CMMS schema is unwired.
