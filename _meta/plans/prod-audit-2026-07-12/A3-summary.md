# Wave A3 — Implementation Summary (2026-07-12)

Worktree: `fix/A3` @ `/Users/mariuszkrawczyk/Projects/monopilot-worktrees/A3`  
Spec: `_meta/plans/prod-audit-2026-07-12/A3-spec.md`  
**No new migration** (next free = 486; not used).

## Gates

| Gate | Result |
|------|--------|
| `pnpm --filter web exec tsc --noEmit` | **CLEAN** |
| Touched vitest (7 files, 53 tests) | **PASS** |
| `pnpm --filter web run build` | **PASS** (triggered: `updateWorkOrder` input shape now accepts `null` for `scheduledStartTime` / `productionLineId`) |

## Diff overview (`git diff --stat`)

23 modified files + 2 new (`apps/web/lib/planning/production-line-site.ts`, `.test.ts`).  
Primary choke points: `production-line-site.ts`, `create-work-order-core.ts`, `create-work-order-chain.ts`, `update-work-order.ts`, `resolve-stage-production-line.ts`, `scheduler-actions.ts`, `wo-detail-screen.tsx`, i18n + scheduler page labels.

---

## S1 (P1) — Cross-site production line on WO create/edit

### Root cause
1. **Create/update** never validated that `production_line_id.site_id` matched the WO's resolved `site_id`.
2. **Chain create** auto-assigned FG `production_line_id` from `loadStageProductionLineIds` even when the user selected **None**, picking routing/NPD lines that could belong to another site.

### Fix (diff locations)
| File | Change |
|------|--------|
| `apps/web/lib/planning/production-line-site.ts` | **NEW** — `fetchActiveProductionLineSite`, `productionLineMatchesWoSite` |
| `apps/web/app/.../work-orders/_actions/shared.ts` | `line_site_mismatch` error union |
| `create-work-order-core.ts` | Reject line when site ≠ WO site before INSERT |
| `update-work-order.ts` | Load WO `site_id`; `ensureProductionLineForWoSite()` before UPDATE |
| `create-work-order-chain.ts` | FG uses **only** `input.productionLineId` (no stage-map fallback) |
| `resolve-stage-production-line.ts` | `woSiteId` param; null cross-site resolved lines via `pl_site` lateral |
| `create-wo-modal.tsx` | `line_site_mismatch` in error label map |

### Repro (prod)
1. Create WO at warehouse/site A with production line from site B (or None).
2. Observe WO attached to site B's line.

### Test
- `createWorkOrder.test.ts` — `A3-S1: rejects a production line assigned to another site`
- `createWorkOrder.test.ts` — `A3-S1: keeps production_line_id null when no line is selected`
- `update-work-order.test.ts` — cross-site line → `line_site_mismatch`
- `production-line-site.test.ts` — site match helper

### NEW raw SQL (PREPARE-check)

**`fetchActiveProductionLineSite`** (`production-line-site.ts`):

```sql
select pl.id::text as id, pl.site_id::text as site_id
  from public.production_lines pl
 where pl.org_id = app.current_org_id()
   and pl.id = $1::uuid
   and pl.status = 'active'
 limit 1
```

**`loadStageProductionLineIds`** — full statement (`resolve-stage-production-line.ts`; bind `$4` = `woSiteId`):

```sql
with stages as (
       select s.item_id,
              s.is_fg
         from unnest($1::uuid[], $2::boolean[]) as s(item_id, is_fg)
     )
     select s.item_id::text as item_id,
            case
              when coalesce(
                routing_line.line_id,
                wip_item_line.line_id,
                wip_def_line.line_id,
                fg_process_line.line_id,
                project_line.production_line_id
              ) is null then null
              when pl_site.site_id is null or pl_site.site_id = $4::uuid
                then coalesce(
                  routing_line.line_id,
                  wip_item_line.line_id,
                  wip_def_line.line_id,
                  fg_process_line.line_id,
                  project_line.production_line_id
                )::text
              else null
            end as production_line_id
       from stages s
       left join lateral (
         select ro.line_id
           from public.routings r
           join public.routing_operations ro
             on ro.routing_id = r.id
            and ro.org_id = r.org_id
          where r.org_id = app.current_org_id()
            and r.item_id = s.item_id
            and r.status in ('active', 'draft', 'approved')
          order by case r.status when 'active' then 0 when 'approved' then 1 else 2 end,
                   r.version desc,
                   ro.op_no * case when s.is_fg then -1 else 1 end
          limit 1
       ) routing_line on true
       left join lateral (
         select wp.line_id
           from public.npd_wip_processes wp
          where wp.org_id = app.current_org_id()
            and not s.is_fg
            and wp.wip_item_id = s.item_id
          order by wp.display_order asc, wp.created_at asc, wp.id asc
          limit 1
       ) wip_item_line on true
       left join lateral (
         select wp.line_id
           from public.wip_definitions wd
           join public.npd_wip_processes wp
             on wp.org_id = wd.org_id
            and wp.wip_definition_id = wd.id
          where wd.org_id = app.current_org_id()
            and not s.is_fg
            and wd.item_id = s.item_id
          order by wp.display_order asc, wp.created_at asc, wp.id asc
          limit 1
       ) wip_def_line on true
       left join lateral (
         select wp.line_id
           from public.prod_detail pd
           join public.npd_wip_processes wp
             on wp.org_id = pd.org_id
            and wp.prod_detail_id = pd.id
          where pd.org_id = app.current_org_id()
            and s.is_fg
            and pd.item_id = s.item_id
          order by wp.display_order desc, wp.created_at desc, wp.id desc
          limit 1
       ) fg_process_line on true
       left join lateral (
         select p.production_line_id
           from public.items fg
           join public.npd_projects p
             on p.org_id = fg.org_id
            and p.product_code = fg.item_code
          where fg.org_id = app.current_org_id()
            and fg.id = $3::uuid
          limit 1
       ) project_line on true
       left join lateral (
         select pl.site_id
           from public.production_lines pl
          where pl.org_id = app.current_org_id()
            and pl.id = coalesce(
              routing_line.line_id,
              wip_item_line.line_id,
              wip_def_line.line_id,
              fg_process_line.line_id,
              project_line.production_line_id
            )
          limit 1
       ) pl_site on true
```

---

## S2 (P1) — Planned/scheduled date dropped on create AND edit

### Root cause
- **Edit modal** always sent `scheduledStartTime` (even when unchanged), and could not send explicit `null` to clear.
- **Update action** types did not accept `scheduledStartTime: null`; omitted vs clear was ambiguous.

Create path was already wired through `createWorkOrder` → core INSERT; prod gap was primarily on **edit** dirty-send + null-clear semantics.

### Fix (diff locations)
| File | Change |
|------|--------|
| `edit-wo-modal.tsx` | Send `scheduledStartTime` only when date input differs from initial; support `null` clear |
| `update-work-order.ts` | `scheduledStartTime?: string \| null`; CASE `$14` flag for partial UPDATE |
| `[id]/page.tsx`, `wo-detail-view.tsx` | Types allow `scheduledStartTime: string \| null` |

### Repro (prod)
1. Set scheduled start in create or edit modal.
2. Save → detail shows blank / old value.

### Test
- `createWorkOrder.test.ts` — `uses an explicit document number and site…` asserts `scheduledStartTime` persisted on create
- `update-work-order.test.ts` — `updates a draft WO…` (set), `clears scheduled start time when null is explicitly present`, `keeps scheduled start time when it is omitted`

### NEW raw SQL
None (existing `UPDATE public.work_orders … scheduled_start_time = CASE WHEN $14 …`).

---

## S3 (P1) — `qty_entered` / `qty_entered_uom` NULL for box entry

### Root cause
- **Chain create** did not thread `quantityEntered` / `quantityEnteredUom` into FG `createWorkOrderCore`.
- **Core** gated persistence on truthy entered qty; empty-string edge case skipped writes.

### Fix (diff locations)
| File | Change |
|------|--------|
| `create-work-order-chain.ts` | Pass `quantityEntered` + `quantityEnteredUom` to FG core |
| `createWorkOrder.ts` | Forward qty fields into chain |
| `create-work-order-core.ts` | `if (input.quantityEntered !== undefined && input.quantityEntered !== '')` → always bind `qty_entered` / `qty_entered_uom` |

### Repro (prod)
1. Create WO, enter qty in **box** UoM.
2. DB row has `planned_quantity` but `qty_entered` / `qty_entered_uom` NULL.

### Test
- `createWorkOrder.test.ts` — `A3-S3: persists qty_entered and qty_entered_uom for box entry`

### NEW raw SQL
None (existing INSERT column list unchanged; bind values now populated).

---

## S4 (P2) — WO list & detail stale after mutations

### Root cause
`createWorkOrder` and `updateWorkOrder` succeeded without `revalidateLocalized` on list/detail routes (release/delete already revalidated).

### Fix (diff locations)
| File | Change |
|------|--------|
| `createWorkOrder.ts` | `revalidateLocalized('/planning/work-orders')` + detail path on success |
| `update-work-order.ts` | Same after successful UPDATE |

### Repro (prod)
1. Create/edit WO.
2. List/detail unchanged until hard refresh.

### Test
- `createWorkOrder.test.ts` — revalidate assertions in success path
- `update-work-order.test.ts` — `A3-S4` revalidate list + detail

### NEW raw SQL
None.

---

## S9 (P1) — Scheduler includes DRAFT + cross-site WOs

### Root cause
`loadOpenWorkOrders` used a broad status set (included DRAFT) and did not constrain WOs/lines to the **active site** from `getActiveSiteId`.

### Fix (diff locations)
| File | Change |
|------|--------|
| `scheduler-actions.ts` | `SCHEDULABLE_WO_STATUSES = ['RELEASED']`; join `production_lines pl`; site predicates on `wo.site_id` / `pl.site_id`; bind `$4` = active site |

### Repro (prod)
1. Open scheduler with site filter active.
2. Run solve → DRAFT WOs and lines from other sites appear in board/solve input.

### Test
- `scheduler-actions.test.ts` — `A3-S9: scopes the solver input to RELEASED work orders on the active site`

### NEW raw SQL (PREPARE-check)

**`loadOpenWorkOrders`** — full SELECT with new join + WHERE clauses (`scheduler-actions.ts`; `$1` = statuses, `$2` = horizon, `$3` = line filter, `$4` = site):

```sql
select
       wo.id::text,
       wo.org_id::text,
       wo.site_id::text,
       wo.wo_number,
       wo.product_id::text,
       i.item_code,
       i.name as item_name,
       wo.status,
       wo.planned_quantity::text,
       wo.uom,
       wo.production_line_id::text,
       wo.planned_start_date,
       wo.planned_end_date,
       wo.scheduled_start_time,
       wo.scheduled_end_time,
       coalesce(wo.planned_end_date, wo.scheduled_end_time, wo.planned_start_date, wo.created_at) as due_date,
       coalesce(ap.allergen_ids, '{}'::text[]) as allergen_ids,
       coalesce(routing_dur.routing_duration_ms, 0)::text as routing_duration_ms,
       coalesce(process_dur.process_duration_ms, 0)::text as process_duration_ms
     from public.work_orders wo
     left join public.items i
       on i.org_id = wo.org_id
      and i.id = wo.product_id
     left join public.production_lines pl
       on pl.org_id = wo.org_id
      and pl.id = wo.production_line_id
     left join lateral (
       select array_agg(distinct iap.allergen_code order by iap.allergen_code) as allergen_ids
         from public.item_allergen_profiles iap
        where iap.org_id = wo.org_id
          and iap.item_id = wo.product_id
     ) ap on true
     left join lateral (
       select
         round(
           (
             coalesce(sum(ro.setup_time_min), 0) * 60000
             + coalesce(
                 sum(ro.run_time_per_unit_sec::numeric * wo.planned_quantity::numeric) * 1000,
                 0
               )
           )
         )::bigint as routing_duration_ms
         from public.routings r
         join public.routing_operations ro
           on ro.routing_id = r.id
          and ro.org_id = r.org_id
        where r.org_id = wo.org_id
          and r.item_id = wo.product_id
          and r.status in ('active', 'approved')
          and (
            wo.production_line_id is null
            or ro.line_id = wo.production_line_id
          )
     ) routing_dur on true
     left join lateral (
       select
         round(
           coalesce(
             nullif(max(p.duration_hours::numeric), 0) * 3600000,
             case
               when max(p.throughput_per_hour::numeric) > 0
                 then (wo.planned_quantity::numeric / max(p.throughput_per_hour::numeric)) * 3600000
               else null
             end
           )
         )::bigint as process_duration_ms
         from public.npd_wip_processes p
         join public.prod_detail pd
           on pd.id = p.prod_detail_id
          and pd.org_id = p.org_id
        where p.org_id = wo.org_id
          and pd.item_id = wo.product_id
     ) process_dur on true
    where wo.org_id = app.current_org_id()
      and wo.status = any($1::varchar[])
      and coalesce(wo.planned_start_date, wo.scheduled_start_time, wo.created_at) < $2::timestamptz
      and ($3::uuid is null or wo.production_line_id = $3::uuid)
      and (
        $4::uuid is null
        or wo.site_id = $4::uuid
        or (wo.site_id is null and pl.site_id = $4::uuid)
      )
      and (
        $4::uuid is null
        or wo.production_line_id is null
        or pl.site_id is null
        or pl.site_id = $4::uuid
      )
    order by due_date asc, wo.id asc
```

Bind change: `$1` = `['RELEASED']` (was broader open-status set).

---

## S10 (P1) — `sod_violation` invisible in scheduler UI

### Root cause
`applySchedule` returned `{ ok: false, error: 'sod_violation' }` but `scheduler/page.tsx` `labels.errors` had no mapping; board showed generic/empty error.

### Fix (diff locations)
| File | Change |
|------|--------|
| `scheduler/page.tsx` | `sod_violation: t('errors.sod_violation')` in errors map |
| `apps/web/i18n/{en,pl,ro,uk}.json` | `Scheduler.errors.sod_violation` key |

### Repro (prod)
1. Apply schedule as same user who created the run (SoD violation).
2. UI silent / generic error.

### Test
- `scheduler-board.test.tsx` — `A3-S10: surfaces sod_violation from applySchedule in the UI`

### NEW raw SQL
None.

---

## N1 (P1) — Production summary integer-rounds kg (7.8 → 8)

### Root cause
`wo-detail-screen.tsx` used `Intl.NumberFormat` with `maximumFractionDigits: 0` and `Math.round(n)` for header/overview kg display.

### Fix (diff locations)
| File | Change |
|------|--------|
| `wo-detail-screen.tsx` | `DISPLAY_QTY_FMT` with `maximumFractionDigits: 3`; removed integer round before format |

### Repro (prod)
1. WO with 7.8 kg produced of 300 kg planned.
2. Header shows `8 / 300 kg`.

### Test
- `wo-detail-screen.test.tsx` — `A3-N1: renders fractional kg output in the header without integer rounding`

### NEW raw SQL
None (display-only).

---

## Notes / non-changes

- **No migration 486** — all fixes are app-layer validation, query filters, revalidation, and display formatting.
- **WO form line dropdown** not site-filtered in UI; rejection happens at write choke point (S1) per conservative scope.
- Changes left **uncommitted** in working tree per campaign instructions.
