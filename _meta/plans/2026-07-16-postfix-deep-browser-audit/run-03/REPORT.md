# RUN 03/20 — Item masters, UoM conversions and decimal invariants

## Verdict

**FAIL — 6 production defects reproduced: 4 P1 and 2 P2.**

Target: `https://monopilot-kira.vercel.app` · deployment `dpl_F8hRCBXB7tdWmNKqMHD7LxnMy3Vm` · commit `2eb57cf7b90c23d4c55afeb01116eaabc3250385` · Vercel state `READY`.

The walk was executed directly in the Codex/Sol Playwright browser with visible UI mutations only. It covered raw-material and finished-good create/edit/lifecycle paths, catch weight, shelf life, packaging hierarchy, duplicate/product-code handling, exact decimal boundaries and Settings → Units & conversions. Persistence claims were checked after hard navigation. Source was read only after browser reproduction.

## Scenario matrix

| Scenario | Result | Evidence / observation |
|---|---|---|
| Product-code syntax | PASS | `NIGHT R03/INVALID` was blocked before creation; separators allowed by the stated convention worked. |
| Duplicate item code | PASS | Reusing `NIGHT-R03-0806-RM` produced a specific organization-scoped duplicate message and did not overwrite the original. [result](evidence/R03-13-duplicate-item-result.yml) |
| Raw-material create/edit and price precision | PASS | `0.0049` persisted exactly; `0.005` remained distinct after edit and hard navigation; negative price was blocked. [created](evidence/R03-02-rm-created.yml), [precision](evidence/R03-04-duplicate-uom-persisted.yml) |
| Base/secondary UoM invariant | **FAIL / P1** | The item was saved with both Base UoM and Secondary UoM equal to `g`; the review omitted Secondary UoM. [review](evidence/R03-03-edit-duplicate-uom-review.yml), [persisted](evidence/R03-04-duplicate-uom-persisted.yml) |
| Catch-weight create invariant | **FAIL / P1** | A catch-weight FG was created with nominal, gross max and tolerance all null even though the screen says all are required. Gross max has no input at all. [ready](evidence/R03-05-catch-weight-empty-ready.yml), [persisted](evidence/R03-06-catch-weight-null-persisted.yml) |
| Shelf-life invariant | **FAIL / P1** | `Has shelf life` + `0` days + blank mode reached Ready and persisted as `0 d`; later corrected to `365 d (use_by)`. [ready](evidence/R03-07-catch-zero-shelf-ready.yml), [persisted](evidence/R03-08-catch-zero-shelf-persisted.yml) |
| Valid Box hierarchy and arithmetic | PASS | `10 × 0.48 pcs = 4.8 pcs`, with `20` boxes/pallet, persisted exactly after hard navigation. [review](evidence/R03-14-valid-pack-ready.yml), [durable result](evidence/R03-18-valid-pack-and-catch-cleanup.yml) |
| Fractional count validation | **FAIL / P2** | `0.48` each/box and `2.5` boxes/pallet were labelled Ready; only submit rejected them with generic `Please check the values`. [ready](evidence/R03-16-fractional-pack-ready.yml), [rejection](evidence/R03-17-fractional-pack-server-reject.yml) |
| UoM registry availability in item master | **FAIL / P2** | Settings contained `mg`, `t`, `box`, `EACH` and `pallet`, but item Base/Secondary UoM selectors exposed only kg/g/l/ml/pcs/m/cm. |
| Unit/conversion create and edit | **FAIL / P1** | Add unit failed for factors `0.0049`, `0.005` and `1`; editing `g` and creating a custom pcs→box conversion also returned POST 500 with reference `494781054`. A subsequent transition replaced the route with the global error screen. [console](evidence/R03-console-errors.txt), [custom conversion](evidence/R03-11-custom-conversion-500.yml) |
| Blocked→Active lifecycle regression | PASS | The blocked raw material could be edited back to Active, persisted after hard navigation, and then safely blocked again for cleanup. |
| Cleanup | PASS with retained soft-deactivated records | Both owned items are Blocked. The duplicate Secondary UoM was cleared; no UoM/conversion row was created by the failing actions. [safe RM](evidence/R03-20-rm-cleanup-safe.yml), [FG](evidence/R03-18-valid-pack-and-catch-cleanup.yml) |

## Findings

### PF-R03-01 — P1 — Item master permits identical base and secondary UoM

**Reproduction:** edit `NIGHT-R03-0806-RM` → set Base UoM `g` while Secondary UoM remains `g` → continue through review → Save → hard navigate.

- Expected: Secondary UoM must be empty or different from Base UoM.
- Actual: both values persisted as `g`; the review screen did not display Secondary UoM, so the contradiction was invisible before save.
- Contract gap: create/update schemas validate each value against the closed enum but never compare them at [`shared.ts:248`](<../../../../apps/web/app/[locale]/(app)/(modules)/technical/items/_actions/shared.ts>) and [`shared.ts:290`](<../../../../apps/web/app/[locale]/(app)/(modules)/technical/items/_actions/shared.ts>); `basicValid` likewise checks only that the base value exists at [`item-create-wizard.tsx:445`](<../../../../apps/web/app/[locale]/(app)/(modules)/technical/items/_components/item-create-wizard.tsx>).
- Impact: any conversion or quantity flow that treats the secondary unit as a distinct measure receives an undefined 1:1 self-conversion.
- Evidence: [review](evidence/R03-03-edit-duplicate-uom-review.yml), [hard-navigation truth](evidence/R03-04-duplicate-uom-persisted.yml).

### PF-R03-02 — P1 — Catch-weight invariant is informational text only

**Reproduction:** create a Finished good → Weight mode `Catch weight` → leave all revealed fields blank → Next → Create.

- Expected: nominal weight, gross-weight maximum and tolerance are mandatory and server-enforced.
- Actual: the UI says they are required, but Next and Create remain enabled. The record persisted with all three null. After nominal `0.48` and tolerance `2.5` were added, gross max still remained null because no Gross weight max input exists.
- Root-cause correlation: the wizard state/payload contains no `grossWeightMax`; the catch reveal renders only nominal and variance fields around [`item-create-wizard.tsx:900`](<../../../../apps/web/app/[locale]/(app)/(modules)/technical/items/_components/item-create-wizard.tsx>). Both create/update schemas make the three values independently optional and have no catch-mode `superRefine` at [`shared.ts:250`](<../../../../apps/web/app/[locale]/(app)/(modules)/technical/items/_actions/shared.ts>).
- Impact: catch-weight SKUs can enter production without a legal/operational upper bound, weakening weigh-out, yield and tolerance gates.
- Evidence: [Ready despite nulls](evidence/R03-05-catch-weight-empty-ready.yml), [persisted nulls](evidence/R03-06-catch-weight-null-persisted.yml), [post-correction detail](evidence/R03-18-valid-pack-and-catch-cleanup.yml).

### PF-R03-03 — P1 — Shelf-life can be enabled with zero days and no mode

**Reproduction:** enable `Has shelf life` → enter `0` days → leave Shelf-life mode blank → Next → Save → hard navigate.

- Expected: enabled shelf life requires a positive day count and a mode (`use_by` or `best_before`).
- Actual: review showed Ready and the durable detail showed `Shelf life 0 d` with no mode.
- Root-cause correlation: both schemas use `int().nonnegative().optional()` and do not couple days to mode at [`shared.ts:258`](<../../../../apps/web/app/[locale]/(app)/(modules)/technical/items/_actions/shared.ts>) and [`shared.ts:299`](<../../../../apps/web/app/[locale]/(app)/(modules)/technical/items/_actions/shared.ts>). The UI uses `min={0}` and validates neither cross-field condition.
- Impact: expiry/FEFO behavior cannot distinguish immediate expiry from incomplete configuration.
- Evidence: [review](evidence/R03-07-catch-zero-shelf-ready.yml), [durable `0 d`](evidence/R03-08-catch-zero-shelf-persisted.yml).

### PF-R03-04 — P1 — Every Units & conversions mutation fails with the same production error

**Reproduction:** Settings → Units & conversions, then independently:

1. Add Mass unit `N17R03U` with factor `0.0049`, `0.005`, or `1`.
2. Edit `g` name only.
3. Add custom conversion `N17R03 PCS to Box`, pcs→box, factor `0.48`.

All valid submissions produced POST 500 / digest `494781054`; no row persisted. The failure was not reliably contained: the route later rendered the global `Something went wrong` boundary with the same reference.

- Expected: valid create/edit/conversion mutations commit, refresh and remain CRUD-correctable.
- Actual: the read-only table loads, but its create/edit/custom-conversion write surface is unusable.
- Source correlation: all three flows are wired to the same Server Action family in [`manage-units.ts:258`](<../../../../apps/web/app/[locale]/(app)/(admin)/settings/units/_actions/manage-units.ts>), [`manage-units.ts:322`](<../../../../apps/web/app/[locale]/(app)/(admin)/settings/units/_actions/manage-units.ts>) and [`manage-units.ts:370`](<../../../../apps/web/app/[locale]/(app)/(admin)/settings/units/_actions/manage-units.ts>). Browser evidence establishes a common production failure; runtime logs are still needed to resolve the suppressed digest to the exact SQL/transaction statement.
- Impact: administrators cannot add lb/case/customer-specific conversions or correct an existing factor/name.
- Evidence: [console](evidence/R03-console-errors.txt), [custom conversion failure](evidence/R03-11-custom-conversion-500.yml).

### PF-R03-05 — P2 — Settings UoM registry is disconnected from item selectors

The Settings table visibly contains active units beyond the item wizard's list (`mg`, `t`, `box`, `EACH`, `pallet`). Nevertheless, both Base and Secondary UoM selectors expose only kg/g/l/ml/pcs/m/cm.

- Expected: the organization's UoM registry is the selectable source of truth, subject to category compatibility.
- Actual: item create/edit uses a compile-time seven-value list.
- Root cause: `CANONICAL_UOMS` is hardcoded at [`shared.ts:56`](<../../../../apps/web/app/[locale]/(app)/(modules)/technical/items/_actions/shared.ts>) and the wizard directly maps it at [`item-create-wizard.tsx:407`](<../../../../apps/web/app/[locale]/(app)/(modules)/technical/items/_components/item-create-wizard.tsx>).
- Impact: even after PF-R03-04 is fixed, newly configured units still cannot be assigned to item masters.

### PF-R03-06 — P2 — Fractional packaging counts pass the client review and fail only generically on submit

**Reproduction:** edit Box hierarchy → set Each per box `0.48` and Boxes per pallet `2.5` → Next.

- Expected: integer-only fields reject the values on Step 3 with a targeted message.
- Actual: Step 4 calculated a fractional hierarchy and displayed `Ready to save`; submit then returned only `Please check the values and try again`.
- Root cause: client validity checks only finite `> 0` at [`item-create-wizard.tsx:460`](<../../../../apps/web/app/[locale]/(app)/(modules)/technical/items/_components/item-create-wizard.tsx>), while the server correctly applies `int().positive()` at [`shared.ts:131`](<../../../../apps/web/app/[locale]/(app)/(modules)/technical/items/_actions/shared.ts>).
- Impact: the user completes the wizard with apparently valid data and receives non-actionable feedback at the last step.
- Evidence: [Ready state](evidence/R03-16-fractional-pack-ready.yml), [generic rejection](evidence/R03-17-fractional-pack-server-reject.yml).

## Prior-fix verification

| Prior issue | Result |
|---|---|
| S6 precision / `0.48 → 0` | **PASS** for item price and pack quantity persistence: `0.0049`, `0.005` and `0.48` remained distinct and the valid Box calculation was exact. |
| S17 catch-weight | **FAIL / regression gap** — downstream catch-weight handling may be fixed, but the master-data gate still permits a catch item without gross max and even without nominal/tolerance. |
| A6 blocked→active product transition | **PASS** — status could be changed from Blocked back to Active through Edit and survived hard navigation. |
| Product-code and duplicate handling | **PASS** — syntax and organization-scoped duplicate feedback behaved correctly. |

## Cleanup and retained artifacts

- `NIGHT-R03-0806-RM` is Blocked, has no Secondary UoM, and retains exact list price `0.005` for evidence.
- `NIGHT-R03-0806-FG` is Blocked and now has a valid `365 d (use_by)` shelf life plus a durable Box hierarchy (`10 × 0.48 pcs = 4.8 pcs`, 20 boxes/pallet). Gross weight max cannot be corrected because the product exposes no input.
- No UoM or custom-conversion row was created; the failing actions rolled back or never committed.
- Item master exposes no delete lifecycle, so the two safe blocked audit records remain documented.

## Limitations

- No safe unit-delete test was possible because unit creation is broken and deleting a seeded production unit would be destructive.
- Cross-module consumption of the new item was not mutated in this run; later Planning/Production runs cover picker freshness and quantity use.
- Production hides the server stack behind digest `494781054`; exact PF-R03-04 SQL root cause requires runtime-log correlation during the fix campaign.
