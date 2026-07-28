# RUN 05/20 — Nested WIP→WIP→FG nutrition, cost and cascade

## Verdict

**FAIL — 9 production defects: 1 P0, 6 P1 and 2 P2.**

Target: `https://monopilot-kira.vercel.app` · deployment `dpl_F8hRCBXB7tdWmNKqMHD7LxnMy3Vm` · commit `2eb57cf7b90c23d4c55afeb01116eaabc3250385` · Vercel state `READY`.

The Codex/Sol browser walk created a two-level WIP chain and a new `NPD-023` / `FG-023` project, using deliberately unequal decimal ratios. Recursive nutrition and pilot scaling are mathematically correct. The run nevertheless found a server-accepted self-cycle, broken clone-on-write propagation, stale and incomplete WIP costing, an unguarded pilot workflow at G0, and two stale UI paths. All writes were made through the visible production UI; source was inspected read-only only after the browser observations. The project, pilot plan and disposable cycle were deleted/archived at the end.

## Scenario matrix

| Scenario | Result | Evidence / observation |
|---|---|---|
| Two-level WIP→WIP→FG recipe | PASS | Parent WIP `0.73/0.27`, then `0.69/0.31`; FG `0.823456/0.176544`; all component totals equal exactly `1.000000`. [initial](evidence/R05-02-nested-live-math.yml), [edited](evidence/R05-13-v3-locked-math.yml) |
| Recursive nutrition | PASS | Energy changed `803.07 → 778.96 kJ/100g`; manual delta is `0.823456 × 0.04 × (832−100) = 24.1108`. Fat/saturates/carbs/sugars/protein also changed coherently. |
| Recipe cascade | **FAIL / P2** | Newly saved WIP first said `No sub-recipe`; refresh revealed the correct nested tree, but every terminal ingredient incorrectly said `Max depth reached`. [before](evidence/R05-03-cascade-empty.yml), [after](evidence/R05-04-cascade-after-refresh.yml) |
| WIP definition process CRUD | PASS persistence | Duration `1.25 h`, additional `3.3333`, throughput `2.5 kg/h`, setup `7.7777`, yield `91.25%`, crew `3 × 11.1111/h` all survived navigation. [values](evidence/R05-05-wip-process-values.yml), [detail](evidence/R05-06-wip-process-detail.yml) |
| Active WIP edit/versioning | **FAIL / P1** | Clone-on-write created active v3 and archived v2, but `NPD-023` stayed pinned to v2 with no update notice; manual delete/re-add was required. [v3](evidence/R05-07-wip-v3-clone.yml), [stale project](evidence/R05-08-no-stale-banner.yml) |
| Cycle/self-reference rejection | **FAIL / P0** | The WIP picker offered its own item and the server saved it at quantity `1` as v2. [picker](evidence/R05-09-self-reference-ui-allowed.yml), [saved cycle](evidence/R05-10-self-cycle-saved.yml) |
| Live WIP cost hydration | **FAIL / P1** | Immediately after add, WIP cost was blank and raw FG cost `£0.14/kg`; refresh hydrated the same saved row and changed cost to `£130.83/kg`. The defect repeated after v3 re-pin. |
| WIP process/yield costing | **FAIL / P1** | UI uses material-only `£150.0437/kg` for v3 and omits definition labor/setup/yield; expected canonical WIP cost is about `£187.9619/kg`. [math state](evidence/R05-13-v3-locked-math.yml) |
| Full Costing & Nutrition compute | **FAIL / P1** | With average batch `100.125` and explicit zero overrides, Compute returns only `persistence_failed`. [screen](evidence/R05-11-costing-persistence-failed.yml), [response](evidence/R05-costing-response.txt) |
| Formulation lock/unlock | PASS | Lock disabled fields; correct e-sign unlocked and re-lock succeeded, with no `VERSION_NOT_LOCKED` recurrence. |
| Pilot plan at G0 | **FAIL / P1** | A project still labelled `Brief · G0 Idea` accepted a production line, date, quantity, yield and duration; Create pilot WO reached the material gate. [G0 state](evidence/R05-12a-pilot-at-g0.yml) |
| Pilot quantity scale / guard | PASS | `12.345 × 0.823456 = 10.16556432 → 10.1656 kg`; `12.345 × 0.176544 = 2.17943568 → 2.1794 kg`; server named `ING-SUGAR: SUPPLIER_SPEC_NOT_ACTIVE`. [evidence](evidence/R05-12-pilot-scale-and-guard.yml) |
| Delete/archive cleanup | PASS with stale UI | Project route became Page not found and `FG-023` became Blocked; WIP archive persisted after refresh. [project](evidence/R05-15-cleanup-project-deleted.yml), [FG](evidence/R05-16-cleanup-fg-blocked.yml), [WIP](evidence/R05-14-cleanup-wip-archived.yml) |

## Findings

### PF-R05-01 — P0 — A WIP definition can contain itself

On the disposable definition `NIGHT-R05-CYCLE-1106`, **Add ingredient** offered the definition's own item. Selecting it and saving quantity `1 kg` succeeded and produced a new persisted version. There was no client warning or server rejection.

- Expected: reject direct self-reference and any indirect WIP cycle atomically before the version is committed.
- Actual: invalid recursive master data is accepted. Some readers have depth/cycle brakes, but that only prevents infinite recursion; it does not make the recipe valid and may silently turn cyclic contribution into zero/missing.
- Source correlation: [`wip-definition-schemas.ts`](../../../../apps/web/app/[locale]/(app)/(modules)/technical/wip-library/_actions/wip-definition-schemas.ts) validates ingredient IDs and quantities but not the graph; [`wip-definition-actions.ts`](../../../../apps/web/app/[locale]/(app)/(modules)/technical/wip-library/_actions/wip-definition-actions.ts) writes the composition without a reachability check. [`wip-cost.ts`](../../../../apps/web/lib/npd/wip-cost.ts) later breaks a seen cycle as zero/missing, confirming downstream defensive handling rather than write-time integrity.
- Impact: invalid BOM genealogy/cost/nutrition can be versioned and potentially referenced by projects; different consumers may fail or silently truncate it differently.
- Evidence: [own item selectable](evidence/R05-09-self-reference-ui-allowed.yml), [self-cycle persisted](evidence/R05-10-self-cycle-saved.yml).

The self row was removed through the UI, a clean v3 was saved, and the disposable definition was archived. No live self-cycle was left behind.

### PF-R05-02 — P1 — Clone-on-write creates v3 but never notifies projects pinned to v2

Editing active parent WIP v2 from `0.73 WIP-019 + 0.27 flour` to `0.69 + 0.31` correctly created a new active v3 ID and archived v2. `NPD-023`, however, continued to display the old ratios, old nutrition and old cost. It showed no stale-version banner or update action. A full page navigation did not fix the reference; deleting and re-adding the WIP was the only visible way to pin v3.

Source correlation explains the exact browser result:

- [`wip-definition-actions.ts`](../../../../apps/web/app/[locale]/(app)/(modules)/technical/wip-library/_actions/wip-definition-actions.ts) calls `fanOutDefinitionNotifications` with the **new** clone ID;
- that fan-out finds projects only where `formulation_ingredients.wip_definition_id = newId`, while all existing projects still point to the superseded old ID;
- [`get-stale-wip-refs.ts`](../../../../apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/_lib/get-stale-wip-refs.ts) evaluates the referenced ID and notifications, but does not follow `supersedes_wip_definition_id` to the active successor.

This defeats the intended safe version-propagation workflow: projects silently remain on an archived recipe and operators are not told that the master definition changed. Evidence: [v3 clone](evidence/R05-07-wip-v3-clone.yml), [project still on v2/no banner](evidence/R05-08-no-stale-banner.yml).

### PF-R05-03 — P1 — Newly added WIP shows materially false cost until a hard refresh

The defect reproduced twice:

1. Immediately after adding parent v2, recursive nutrition populated but its `£/kg` field was blank; live raw FG cost was only sugar, `£0.14/kg`, and after-yield cost `£0.15/kg`.
2. After navigation, without editing the recipe, the WIP field became `158.7129…` and raw FG cost became `£130.8343/kg`.
3. After manually replacing v2 with v3, nutrition updated immediately but cost again stayed `£0.14/kg` until reload; it then became `£123.6956/kg` raw / `£131.94/kg` after yield.

[`formulation-editor.tsx`](../../../../apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/formulation/_components/formulation-editor.tsx) creates a new WIP row with `costPerKgEur: ''` and schedules a save. The server resolves the persisted master cost, but the client does not merge the saved row or refetch it. This presents a fake margin of more than 95% in this scenario until a hard refresh. Evidence: [immediate state](evidence/R05-02-nested-live-math.yml), [after refresh](evidence/R05-04-cascade-after-refresh.yml), [repeat on v3](evidence/R05-13-v3-locked-math.yml).

### PF-R05-04 — P1 — Live WIP cost omits definition process labor, setup and WIP yield

All process inputs persisted, but the live formulation uses exactly the material-only WIP amount:

| Component | Manual calculation |
|---|---:|
| v3 materials | `0.69 × 217.23 + 0.31 × 0.50 = £150.043700/kg` |
| labor + additional | `(3 × 11.1111) / 2.5 + 3.3333 / (2.5 × 1.25) = £14.399976/kg` |
| setup amortization | `(7.7777 × 3) / (1234.567 × 0.823456) = £0.0229518/kg` |
| WIP after 87.5% definition yield | `(150.0437 + 14.399976 + 0.0229518) / 0.875 = £187.961860/kg` |

The UI's WIP row remains `£150.043700`, exactly the first line, proving that the other persisted inputs were omitted. Consequently:

- UI FG raw: `0.823456 × 150.0437 + 0.176544 × 0.8 = £123.695620/kg`;
- UI after FG yield: `123.695620 / 0.9375 = £131.941995/kg` (`£131.94`, exact for the incomplete input);
- expected with WIP process/setup/yield: about `£154.919557/kg` raw and `£165.247527/kg` after FG yield.

The canonical helper in [`wip-cost.ts`](../../../../apps/web/lib/npd/wip-cost.ts) supports these terms, and the full compute path in [`compute.ts`](../../../../apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/costing/_actions/compute.ts) has a definition-process fallback. The live material path shown in the browser does not apply it. Evidence: [persisted process inputs](evidence/R05-06-wip-process-detail.yml), [v3 recipe/cost](evidence/R05-13-v3-locked-math.yml).

### PF-R05-05 — P1 — Canonical Costing & Nutrition compute fails for a complete nested-WIP input

The costing page first correctly required average batch quantity. After saving `100.125`, overhead override `0` and logistics override `0`, **Compute** returned `{"ok":false,"error":"persistence_failed"}` and rendered only a generic failure. It produced no authoritative calculation or WIP cost materialization.

This blocks the intended path that should include definition process cost and leaves users with the incomplete live total described above. [`compute.ts`](../../../../apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/costing/_actions/compute.ts) logs the caught exception but collapses every unexpected failure to `persistence_failed`; the exact production SQL/runtime cause requires log correlation and is not guessed here. Evidence: [UI](evidence/R05-11-costing-persistence-failed.yml), [server response](evidence/R05-costing-response.txt).

### PF-R05-06 — P1 — Pilot operations are accepted while the project is still at G0 Brief

`NPD-023` visibly remained `Brief · G0 Idea`, yet the UI and server accepted a pilot date, production line, `12.345 kg`, `87.65%` yield and `2.75 h` duration. **Create pilot WO** was enabled and executed far enough to reach the supplier-spec material guard.

[`upsert-pilot-run.ts`](../../../../apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/pilot/_actions/upsert-pilot-run.ts) checks project existence and authorization, but not the current NPD stage. [`create-pilot-wo.ts`](../../../../apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/pilot/_actions/create-pilot-wo.ts) enforces formulation/BOM/line/material prerequisites but likewise does not require Pilot/G3/G4 eligibility. Thus early-stage users can reserve production intent and attempt a WO before approval/readiness controls. Evidence: [persisted pilot at G0](evidence/R05-12a-pilot-at-g0.yml), [WO attempt and concrete guard](evidence/R05-12-pilot-scale-and-guard.yml).

### PF-R05-07 — P1 — WIP cost currency is relabelled from euro to pounds without a visible conversion

The WIP picker displayed `WIP-019` as `€217.230000/kg`. The cascade then used the identical numeric `217.230` under a `£` label, and the parent material equation consumed it unchanged. No exchange rate, conversion date or source currency was shown.

This is consistent with [`item-picker.tsx`](../../../../apps/web/app/[locale]/(app)/(npd)/_components/item-picker.tsx), which hardcodes `€` around `costPerKgEur`, while the formulation/cascade renders the same field under `£`. The claim is deliberately limited to the observable presentation and unchanged numeric value; this run did not use database access to infer the item's true accounting currency. Downstream evidence of the unchanged `217.230 £` value is in the [expanded cascade](evidence/R05-04-cascade-after-refresh.yml).

### PF-R05-08 — P2 — Cascade is stale after save and labels ordinary leaves as max-depth failures

Immediately after adding the newly created parent WIP, expansion said `No sub-recipe`. A hard navigation then revealed the expected parent → WIP-019 → butter/sugar/flour tree and inherited gluten/milk allergens. Every terminal ingredient was nevertheless followed by `Max depth reached`, even though these were ordinary leaves and the configured recursion ceiling had not been reached.

The first state is stale hydration; the second conflates “leaf has no sub-recipe” with “recursion truncated”. Both make it difficult to distinguish missing composition from a healthy terminal ingredient. Evidence: [empty immediately after save](evidence/R05-03-cascade-empty.yml), [tree after refresh with false max-depth labels](evidence/R05-04-cascade-after-refresh.yml).

### PF-R05-09 — P2 — Successful WIP archive leaves the detail page in an active/editable state

Archive confirmation succeeded, but the current page continued to show Draft/active controls, the reusable switch and **Archive** button. Only a full navigation showed `Archived` and disabled editing. This reproduced on both the disposable self-cycle definition and the parent definition, so it is not a one-off race. Evidence: [stale immediately after archive](evidence/R05-14a-archive-stale-before-refresh.yml), [persisted archived state after navigation](evidence/R05-14-cleanup-wip-archived.yml).

## Calculation checks

| Calculation | Manual | UI | Verdict |
|---|---:|---:|---|
| FG ingredient mass | `0.823456 + 0.176544` | `1.000000 kg` | PASS |
| Pilot parent WIP | `12.345 × 0.823456` | `10.1656 kg` | PASS rounding |
| Pilot sugar | `12.345 × 0.176544` | `2.1794 kg` | PASS rounding |
| v3 material WIP | `0.69×217.23 + 0.31×0.50` | `£150.043700/kg` | PASS material-only |
| v3 canonical WIP incl. labor/setup/yield | `£187.961860/kg` | `£150.043700/kg` | **FAIL** |
| UI FG raw from displayed inputs | `£123.695620/kg` | `£123.6956/kg` | PASS exact math on incomplete cost |
| UI FG after 93.75% yield | `£131.941995/kg` | `£131.94/kg` | PASS rounding |
| Expected FG after complete WIP cost | `£165.247527/kg` | `£131.94/kg` | **FAIL completeness** |
| Nutrition energy change | `0.823456×0.04×(832−100)=24.1108` | `803.07→778.96` (`24.11`) | PASS |

## Dedupe and prior-fix verification

| Prior item | Result |
|---|---|
| WIP↔FG nutrition parity | **PASS** — nested nutrition propagated through two WIP levels and responded to the ratio edit with mathematically correct values. |
| WIP material-cost cascade | **PARTIAL** — nested material values propagate after refresh, but definition process/setup/yield is omitted (PF-R05-03/04). |
| WIP recipe source / cascade | **PARTIAL** — definition ingredients eventually load correctly; immediate expansion and terminal status remain false (PF-R05-08). |
| S19 `VERSION_NOT_LOCKED` | **PASS** — lock, e-sign unlock and re-lock completed without the old field mismatch. |
| C037 concrete pilot-WO message | **PASS** — `ING-SUGAR: SUPPLIER_SPEC_NOT_ACTIVE` was shown. |
| C027 linked FG lifecycle | **PASS** — deleting `NPD-023` left `FG-023` Blocked, not Active. |

## Cleanup and retained artifacts

- Deleted the owned pilot plan; no pilot WO was created because the supplier-spec guard blocked it.
- Removed the self-reference, saved a clean successor version and archived the disposable cycle definition.
- Deleted `NPD-023` through visible UI and verified its direct route returns Page not found.
- Verified linked `FG-023` is **Blocked**.
- Archived the final parent WIP v3 after project deletion and verified its detail state after navigation.
- The superseded parent v2 was already archived by clone-on-write. No owned active WIP definition or live self-cycle remains.

## Limitations

- The exact exception behind Costing `persistence_failed` requires production runtime logs; the browser proves the failure but not the failing SQL statement.
- The material gate correctly prevented creation of a pilot WO, so downstream production execution was not forced in this run.
- This run used the visible application only for mutations and did not query production tables directly; currency finding PF-R05-07 is therefore limited to the visible labels and unchanged displayed numeric value.
