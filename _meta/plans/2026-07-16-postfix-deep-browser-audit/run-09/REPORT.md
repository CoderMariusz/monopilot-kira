# RUN 09/20 — MRP demand, supply, horizons and procurement suggestions

## Verdict

**FAIL — 5 new production defects: 4 P1 and 1 P2.**

Target: `https://monopilot-kira.vercel.app` · deployment `dpl_F8hRCBXB7tdWmNKqMHD7LxnMy3Vm` · commit `2eb57cf7b90c23d4c55afeb01116eaabc3250385` · Vercel state `READY`.

Marker: `NIGHT-R09-20260717T144638Z`.

The browser walk built an isolated MRP chain through the visible production UI: active RM and FG, approved BOM, active supplier with 9-day lead time, confirmed PO with a partial receipt, QA-released LP, draft WO, three forecast buckets and a reorder threshold. It then ran MRP repeatedly at 4/8/12/26-week horizons, under Main Factory, another site and All sites, with an active and blocked supplier.

The core decimal arithmetic, QA promotion, open-PO remainder, forecast horizon inclusion and deterministic no-save reruns work. The operational output is nevertheless unsafe: saved runs fail, the item summary exposes only the first bucket's replenishment as if it covered the full-horizon shortage, site-scoped supply is combined with global demand/configuration, and a blocked supplier remains the named BUY source. The UI also hides the late/release-date state already computed for lead-time-constrained suggestions.

All mutations were made through the visible production UI. Product source was inspected read-only only after browser reproduction.

## Owned production data

| Object | State at closeout |
|---|---|
| RM | `RM-R09-144638`, Active, base UoM kg |
| FG | `FG-R09-144638`, Active, base UoM kg |
| Supplier | `SUP-R09-144638`, restored to Active, GBP, lead time 9 days |
| BOM | FG v1 Approved; RM component `2.500000 kg`, operation BAKE |
| PO | `PO-R09-144638`, Confirmed, ordered `12.375000 kg`, remaining `5.250000 kg` |
| Receipt / LP | `GRN-20260717-0003`; `LP-1784300629425-8DKW`, `7.125000 kg`, Available + Released |
| WO | `WO-202607-0029`, Draft, `8.400 kg`, Main Factory / LINE02, no pinned factory release |
| Forecast | W29 `8.400`, W30 `3.600`, W40 `12.345` kg |
| Reorder threshold | min `15.875000 kg`, fixed reorder lot `4.000000 kg`, preferred own supplier |

## Scenario matrix

| Scenario | Result | Evidence / observation |
|---|---|---|
| Baseline MRP, no save | PASS | MRP ran without writes and exposed the baseline metrics. [baseline](evidence/R09-02-mrp-baseline.yml) |
| Owned RM/FG/BOM/supplier | PASS | BOM approval correctly required sourcing first; after linking the active supplier, v1 approved. [BOM](evidence/R09-03-owned-bom-draft.yml) |
| Exact PO and partial receipt | PASS | `12.375 − 7.125 = 5.250 kg` open supply persisted. [PO](evidence/R09-04-owned-po-draft.yml), [receipt](evidence/R09-05-partial-receipt.yml) |
| Pending-QA stock exclusion | PASS | Before QA release, MRP on-hand for the RM was `0.000`; open PO was `5.250`. [MRP](evidence/R09-07-owned-mrp-nosave.yml) |
| QA release promotes inventory | PASS | LP changed Received/Pending to Available/Released, retained `7.125000 kg`, and survived hard refresh. [LP](evidence/R09-09-lp-qa-released-refresh.yml) |
| Reorder threshold create/edit/refresh | PASS | Create persisted; edit `4.000→4.125`, refresh, and edit back to `4.000` all worked. [final state](evidence/R09-08-reorder-threshold-refresh.yml) |
| 4-week forecast netting | PASS demand / **FAIL action summary** | Demand `8.4 + 3.6 = 12.000`; summary still presents only `MAKE 9`. [run](evidence/R09-10-mrp-4w-after-qa.yml) |
| Deterministic no-save rerun | PASS | Immediate 4-week rerun reproduced all KPIs and owned rows exactly. [rerun](evidence/R09-11-mrp-4w-repeat.yml) |
| 8-week horizon | PASS boundary | Same `12.000` demand as 4 weeks; W40 correctly excluded. |
| 12-week horizon | PASS demand / **FAIL action summary** | W40 included; total owned FG demand `24.345`, but action remained `MAKE 9`. [run](evidence/R09-12-mrp-12w.yml) |
| 26-week horizon | PASS demand / **FAIL action summary** | Demand stayed `24.345`, action remained `MAKE 9`. [run](evidence/R09-13-mrp-26w.yml) |
| Save MRP run | **FAIL / P1** | Reproduced twice, including after idle relogin and hard navigation: `MRP run failed. Try again.` No new persisted run appeared for Main Factory. [retry](evidence/R09-14-save-run-retry-failed.yml) |
| Main Factory site | PASS raw supply / **FAIL mixed scope** | RM showed on-hand `7.125`, PO `5.250`; global forecast and threshold also applied. |
| `tester1` site | **FAIL / P1** | Main Factory supply disappeared, but the same global forecast and threshold remained, producing RM `BUY 16` and FG demand `24.345`. [run](evidence/R09-16-mrp-site-tester1.yml) |
| All sites | PASS aggregation / **FAIL scope model** | Owned supply returned while the same global demand/configuration remained. [run](evidence/R09-17-mrp-all-sites.yml) |
| Block preferred supplier | PASS transition / **FAIL suggestion** | Block persisted after refresh, but MRP still named the Blocked supplier and emitted `BUY 12`. [supplier](evidence/R09-18-supplier-blocked-refresh.yml), [MRP](evidence/R09-19-mrp-blocked-supplier.yml) |
| Restore supplier/site | PASS | Supplier restored Active, site restored Main Factory, final MRP refresh showed the active supplier. [final](evidence/R09-20-final-restored-mrp.yml) |
| WO release gate | PASS | Release stayed Draft and returned the actionable factory-spec/BOM guard; BOM/factory versions and material snapshot remained empty. [guard](evidence/R09-15-wo-release-blocked.yml) |
| Suggested-order CRUD | BLOCKED | The screen is read-only until a run is persisted; persistence fails, so suggestion selection/conversion/edit/cancel could not be exercised with owned data. |

## Findings

### PF-R09-01 — P1 — “Save this run” fails while the identical read-only MRP succeeds

The same owned dataset runs successfully and deterministically with **Save this run** off. Turning it on returns only `MRP run failed. Try again.` Immediate history remains empty for Main Factory. The failure reproduced before and after a hard navigation, idle relogin and fresh 12-week run, so it is not stale client state.

This blocks the persisted requirement ledger and the only planned-order workflow. It also prevents CRUD/convert testing and leaves operators with a transient summary instead of an auditable planning result.

Source correlation narrows the failure to the persistence-only branch:

- [`mrp.ts`](../../../../apps/web/app/[locale]/(app)/(modules)/planning/_actions/mrp.ts) successfully completes all reads and `computeMrpPhased`, then enters `persistMrpRun` only when `persist=true`.
- The action catches every database/write failure and collapses it to generic `persistence_failed`, hiding which header, requirement, planned-order or outbox write failed.
- [`mrp.test.tsx`](../../../../apps/web/app/[locale]/(app)/(modules)/planning/mrp/__tests__/mrp.test.tsx) verifies a mocked successful persist response, not the production-shaped database transaction.

Add a production-schema integration test for the complete `mrp_runs → mrp_requirements → mrp_planned_orders → outbox` transaction, retain the database cause in server telemetry with a correlation ID, and surface a safe actionable error. Evidence: [first failure](evidence/R09-06-first-owned-mrp.yml), [independent retry](evidence/R09-14-save-run-retry-failed.yml).

### PF-R09-02 — P1 — The item summary shows the first bucket order as if it covered the full-horizon shortage

The owned FG has exact forecast demand:

- 4/8 weeks: `8.400 + 3.600 = 12.000 kg`
- 12/26 weeks: `8.400 + 3.600 + 12.345 = 24.345 kg`

MRP displays the correct total demand and final net (`-12.000` or `-24.345`) but always shows only `MAKE 9 kg`. A planner reading the summary can therefore release 9 kg against a 12 kg or 24.345 kg shortage.

The cause is deterministic in [`mrp-compute.ts`](../../../../apps/web/app/[locale]/(app)/(modules)/planning/_actions/mrp-compute.ts): the phased loop creates a suggestion per shortage bucket, but `summaryAction` is assigned only when it is null, so the rolled-up row keeps the first bucket's rounded suggestion. The row then combines that first action with full-horizon totals. Later bucket suggestions are only available through persisted planned orders, which are unavailable because PF-R09-01 blocks persistence.

Either show all bucket suggestions in no-save mode, or make the item summary explicit (`next order: 9 kg`, plus total suggested quantity and remaining shortage). Never label a first-bucket order as the sole action beside full-horizon demand. Evidence: [4 weeks](evidence/R09-10-mrp-4w-after-qa.yml), [12 weeks](evidence/R09-12-mrp-12w.yml), [26 weeks](evidence/R09-13-mrp-26w.yml).

### PF-R09-03 — P1 — Site-filtered supply is combined with global forecast and threshold rows

Under Main Factory, the owned RM has `7.125` on-hand and `5.250` open PO. Switching to `tester1` correctly removes both supply sources, yet the same site-null forecast and reorder threshold remain active. The owned FG therefore carries `24.345 kg` demand in both sites, and the RM threshold produces a fresh `BUY 16 kg` in `tester1`. All-sites mode applies the same demand again at the aggregate level.

This is a mixed-grain MRP model: supply is site-specific, while site-null demand/configuration is treated as belonging to every selected site. Running MRP per site can duplicate one organization-level forecast into multiple procurement/production plans.

The SQL in [`mrp.ts`](../../../../apps/web/app/[locale]/(app)/(modules)/planning/_actions/mrp.ts) confirms the mismatch:

- on-hand and WO supply require the selected `site_id`;
- forecasts, sales orders, POs and thresholds use `site_id is null OR site_id = current_site`, so a global row is included in every specific site;
- the top-bar tooltip simultaneously says only work orders, LPs and OEE are site-filtered, although MRP visibly changes by site.

Define one unambiguous rule. Prefer requiring explicit site allocation before site-level MRP; otherwise include site-null demand only in All-sites mode and show it as unallocated. Add a two-site test proving one global forecast cannot be planned twice. Evidence: [Main Factory](evidence/R09-12-mrp-12w.yml), [`tester1`](evidence/R09-16-mrp-site-tester1.yml), [All sites](evidence/R09-17-mrp-all-sites.yml).

### PF-R09-04 — P1 — MRP recommends a new BUY against a blocked supplier

Blocking `SUP-R09-144638` persisted and the supplier page states that blocked suppliers cannot be selected on new purchase orders. A fresh MRP run nevertheless displayed the preferred supplier as **Blocked** and emitted `BUY 12 kg` with no warning, suppression or alternative.

Counting the already-confirmed PO remainder is correct—it is committed supply. Naming a blocked supplier on a new procurement suggestion is not.

[`mrp.ts`](../../../../apps/web/app/[locale]/(app)/(modules)/planning/_actions/mrp.ts) soft-joins the threshold supplier and returns its status without filtering eligibility. [`mrp-compute.ts`](../../../../apps/web/app/[locale]/(app)/(modules)/planning/_actions/mrp-compute.ts) copies `preferred_supplier_id` into every BUY action regardless of status. Non-blocked supplier filtering exists only later inside persisted planned-order creation, a path currently unreachable because saving fails.

Apply procurement eligibility before rendering any suggestion. A blocked preferred supplier should produce an explicit “supplier blocked—select replacement” exception and must not be convertible into a PO. Evidence: [blocked state](evidence/R09-18-supplier-blocked-refresh.yml), [unsafe suggestion](evidence/R09-19-mrp-blocked-supplier.yml).

### PF-R09-05 — P2 — Time-phased BUY logic hides lead-time lateness and makes the quantity look arithmetically wrong

For Main Factory the summary shows:

- horizon total position: `7.125 + 5.250 = 12.375 kg`;
- minimum: `15.875 kg`;
- fixed lot: `4.000 kg`;
- visible action: `BUY 12 kg`, due `2026-07-17`;
- supplier lead time: 9 days.

A horizon-total top-up would be `ceil((15.875 − 12.375) / 4) × 4 = 4 kg`, so the visible `12 kg` appears wrong. Source inspection explains that MRP is actually filling the current ISO-week floor before the `5.250 kg` PO arrives in the next weekly bucket: `ceil((15.875 − 7.125) / 4) × 4 = 12 kg`. That time-phased logic is defensible, but none of the decisive facts are shown.

[`mrp-compute.ts`](../../../../apps/web/app/[locale]/(app)/(modules)/planning/_actions/mrp-compute.ts) computes `releaseDate` and `isLate` when lead time forces release before today. [`mrp-view.tsx`](../../../../apps/web/app/[locale]/(app)/(modules)/planning/mrp/_components/mrp-view.tsx) displays only quantity and due date; it omits bucket, release date, late/expedite state and the future receipt that caused the larger current-bucket order.

Show need-by bucket, planned release/arrival date, `Late/Expedite`, and a calculation drill-down per suggestion. Rename the summary action to “next bucket action” when it is not the horizon total. Evidence: [active supplier calculation](evidence/R09-10-mrp-4w-after-qa.yml), [9-day lead time](evidence/R09-08-reorder-threshold-refresh.yml).

## Exact calculations

| Check | Expected | Production | Verdict |
|---|---:|---:|---|
| PO remainder | `12.375 − 7.125 = 5.250 kg` | `5.250 kg` | PASS |
| QA-released on-hand | `7.125 kg` | `7.125 kg` | PASS |
| Main Factory horizon position | `7.125 + 5.250 − 0 = 12.375 kg` | `12.375 kg` | PASS |
| Current-bucket threshold lot | `ceil((15.875 − 7.125) / 4) × 4 = 12 kg` | `BUY 12 kg` | PASS engine / FAIL explanation |
| `tester1` threshold lot | `ceil(15.875 / 4) × 4 = 16 kg` | `BUY 16 kg` | PASS math / FAIL scope |
| FG 4/8-week demand | `8.400 + 3.600 = 12.000 kg` | `12.000 kg` | PASS |
| FG 12/26-week demand | `12.000 + 12.345 = 24.345 kg` | `24.345 kg` | PASS |
| FG summary action | must not imply `9` covers `12` or `24.345` | always `MAKE 9 kg` | FAIL |

## Prior-fix and guard verification

| Contract | Result |
|---|---|
| QA release promotes LP into MRP on-hand | **PASS** — `0.000 → 7.125`. |
| Partial receipt nets exact PO remainder | **PASS** — `5.250`. |
| Forecast auto-save and hard-refresh persistence | **PASS** — W29/W30/W40 retained exact decimals. |
| Forecast horizon boundary | **PASS** — W40 excluded at 8 weeks and included at 12/26 weeks. |
| Reorder-threshold create/edit | **PASS** — create, two edits and hard refreshes persisted. |
| Supplier blocked→active lifecycle | **PASS transition**, **FAIL MRP eligibility**. |
| WO factory-release guard | **PASS** — Draft WO could not release without a pinned factory spec/BOM bundle. |
| No-save rerun determinism | **PASS**. |
| Saved-run persistence | **FAIL**. |

## Cleanup and retained artifacts

- Top-bar site was restored to **Main Factory**.
- `SUP-R09-144638` was restored from Blocked to **Active** and verified after hard refresh.
- RM, FG, approved BOM, confirmed PO, released LP, forecast and reorder threshold remain as isolated audit fixtures.
- PO remainder remains `5.250000 kg`; LP remains Available + Released at `7.125000 kg`.
- `WO-202607-0029` remains Draft and unreleased; no production execution was started.
- No foreign record was edited, cancelled or deleted.

## Limitations

- The production UI offers only 4/8/12/26-week horizons; there is no 1-week option.
- Planned-order select/convert/edit/cancel could not be safely exercised with owned data because the required persisted run cannot be created.
- The MRP screen explicitly presents no-save output as read-only; it has no direct row-level create/edit/delete action.
- The owned WO intentionally lacked a completed factory release. Its release guard was tested; production start was not attempted.
- No direct database mutation, API bypass, product-code edit, build, typecheck or dependency installation was performed.

## Finding count

| Severity | Count |
|---|---:|
| P0 | 0 |
| P1 | 4 |
| P2 | 1 |
| **Total** | **5** |

