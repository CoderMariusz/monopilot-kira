# Static bug hunt: Planning WOs, TOs, scheduler

## Findings

### P1 — Changeovers are calculated between work orders on different production lines

Evidence:

- [`sequence-solver.ts:258`](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/scheduler/_actions/sequence-solver.ts:258) builds one global WO sequence.
- [`sequence-solver.ts:277`](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/scheduler/_actions/sequence-solver.ts:277) uses the preceding item in that global sequence as `previous`.
- [`sequence-solver.ts:281`](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/scheduler/_actions/sequence-solver.ts:281) calculates a changeover from that item without checking that both WOs use the same line.
- [`sequence-solver.ts:286`](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/scheduler/_actions/sequence-solver.ts:286) then adds this unrelated changeover to the destination line’s start time.
- [`sequence-solver.ts:291`](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/scheduler/_actions/sequence-solver.ts:291) also includes it in the reported cumulative changeover cost.

Failure scenario: WO-A on Line 1 is followed globally by WO-B on Line 2. The solver charges Line 2 for an allergen cleanup from WO-A even though WO-A never ran there. Conversely, the real preceding job on Line 2 is ignored. Draft assignments therefore contain incorrect start times and changeover requirements.

Suggested fix: sequence each line independently, or derive `previous` from a per-line tail and calculate changeover only against the last WO scheduled on the same line.

---

### P1 — A WO longer than daily capacity silently bypasses capacity enforcement

Evidence:

- [`sequence-solver.ts:183`](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/scheduler/_actions/sequence-solver.ts:183) checks the entire run duration against one day’s remaining capacity.
- [`sequence-solver.ts:187`](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/scheduler/_actions/sequence-solver.ts:187) moves the WO to the next day whenever its duration exceeds the daily capacity.
- [`sequence-solver.ts:172`](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/scheduler/_actions/sequence-solver.ts:172) repeats this only 400 times.
- [`sequence-solver.ts:200`](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/scheduler/_actions/sequence-solver.ts:200) returns the original `earliestMs` after exhausting the guard, without reserving capacity or returning an error.

Failure scenario: an 8-hour WO with a configured 6-hour daily capacity can never pass the check. After 400 iterations it is nevertheless scheduled at the original time, potentially directly over other work, while its capacity usage is not recorded.

Suggested fix: define an explicit policy for multi-day WOs. Either split their load across daily buckets or reject the run as infeasible; never fall back to an unchecked start.

---

### P1 — Cross-midnight WOs consume capacity only from their starting day

Evidence:

- [`sequence-solver.ts:184`](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/scheduler/_actions/sequence-solver.ts:184) chooses exactly one capacity bucket using the proposed start.
- [`sequence-solver.ts:187`](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/scheduler/_actions/sequence-solver.ts:187) compares the complete duration only with that bucket.
- [`sequence-solver.ts:193`](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/scheduler/_actions/sequence-solver.ts:193) records the complete duration in that same start-day bucket.
- By contrast, the board’s reporting calculation correctly splits intervals at UTC day boundaries at [`board.ts:210`](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/schedule/_lib/board.ts:210).

Failure scenario: a four-hour WO starting at 23:00 is charged as four hours on day one and zero on day two. Later jobs can use the full configured capacity on day two even though the line is occupied until 03:00. Solver capacity and displayed utilization consequently disagree.

Suggested fix: intersect each WO interval with every affected capacity-day bucket, validating and reserving the overlap in each bucket.

---

### P1 — Repeated WIP components link dependencies to the first matching material row

Evidence:

- [`create-work-order-chain.ts:211`](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/work-orders/_actions/create-work-order-chain.ts:211) creates a distinct child WO for every WIP BOM line.
- [`create-work-order-chain.ts:213`](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/work-orders/_actions/create-work-order-chain.ts:213) calculates each line’s required quantity independently.
- [`create-work-order-chain.ts:504`](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/work-orders/_actions/create-work-order-chain.ts:504) later iterates those child WOs, but [`create-work-order-chain.ts:505`](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/work-orders/_actions/create-work-order-chain.ts:505) identifies the associated FG material only by `productId` using `find()`.
- [`create-work-order-chain.ts:518`](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/work-orders/_actions/create-work-order-chain.ts:518) persists that ambiguous material ID and quantity into the dependency.

Failure scenario: an FG BOM contains the same WIP item on two lines, with different quantities or scrap. Two child WOs are created, but both dependencies point to the first matching `wo_materials` row and carry its required quantity. Stage genealogy and readiness calculations become incorrect for the second WO.

Suggested fix: retain the BOM-line/material identity while creating each child and link by `bom_item_id` or BOM line ID, not product ID alone.

---

### P2 — Capacity-block wall-clock times are always interpreted as UTC

Evidence:

- The database stores capacity reservations as separate `date` and timezone-free `time` values at [`423-planning-capacity-blocks.sql:12`](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/423-planning-capacity-blocks.sql:12).
- [`board.ts:122`](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/schedule/_lib/board.ts:122) constructs an instant by appending `Z` to those values.
- [`board.ts:123`](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/schedule/_lib/board.ts:123) and [`board.ts:124`](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/schedule/_lib/board.ts:124) therefore force every block into UTC without consulting the site timezone.

Failure scenario: a 09:00–11:00 plant reservation in Europe/London renders at 10:00–12:00 local during BST. The offset changes across DST boundaries, so conflicts with timestamptz WO bars are shifted seasonally.

Suggested fix: define capacity-block times in the site’s IANA timezone and convert them to instants server-side, including explicit handling for nonexistent or duplicated DST wall times. Alternatively, store `timestamptz` boundaries directly.

## Clean areas verified

- Transfer receipt reversal locks the TO, linkage, source LP, and destination LP together before validation.
- Receipt reversal requires an exact full-destination-LP quantity match and rejects reserved, allocated, shipped, and consumed destination stock.
- Reversal restores source quantity, voids destination quantity, clears `dest_lp_id`, rerolls TO status, and writes stock moves, state history, audit, and outbox records in one org transaction.
- Direct cancellation of a partially received TO is blocked until received LPs are reversed.
- TO quantity arithmetic uses fixed-scale bigint helpers rather than JavaScript floating point.
- Manual rescheduling rejects zero/negative intervals and validates active-line/site compatibility.
- WO dependency-cycle detection is org-scoped and checks the affected WO before rescheduling.
- Board overlap comparison correctly treats touching intervals as non-conflicting.
- Board utilization splits WO intervals across UTC day boundaries.
- Scheduler duration derivation rejects zero/negative master durations and falls back to a positive duration.
- Planning capacity tables enforce nonnegative available and required hours.
- Reviewed queries consistently use `org_id` and `app.current_org_id()`.

## Not covered

- MRP, purchasing, suppliers, production execution, warehouse flows outside TO ship/receive/reversal, and NPD behavior except direct stage-line linkage.
- Browser rendering, accessibility, translation completeness, and prototype parity.
- Live Supabase trigger inventory or live-data probes.
- Runtime concurrency testing and database integration tests.
- Performance/load behavior for very large scheduler runs.
- Previously enumerated known bugs were intentionally not re-reported.

No files were modified and no test suites were run; this was a read-only static inspection.
