# Run 16 — root source verification

This is a read-only source trace performed by the root auditor after the browser
walk. It corroborates the browser observations; it is not a replacement for the
production reproduction.

## PF-R16-01 — numeric result is trusted from the client

- `apps/web/app/[locale]/(app)/(modules)/quality/inspections/[inspectionId]/_components/inspection-detail.client.tsx:200-230`
  stores `actual` and the operator-selected `pass` flag independently and sends
  both to the action.
- `apps/web/app/[locale]/(app)/(modules)/quality/_actions/inspection-actions.ts:175-188`
  validates only that `actual` is a non-empty string and `pass` is a boolean; it
  does not validate the active specification's min/max bounds.
- `apps/web/app/[locale]/(app)/(modules)/quality/_actions/inspection-actions.ts:887-922`
  persists the supplied JSON unchanged.

This matches the production observation that `5.5001` was saved as PASS against
the active maximum `5.5000`.

## PF-R16-02 — LP Fail branch does not create a hold

- `apps/web/app/[locale]/(app)/(modules)/quality/_actions/inspection-actions.ts:350-372`
  creates a hold for a failed GRN inspection.
- `apps/web/app/[locale]/(app)/(modules)/quality/_actions/inspection-actions.ts:395-435`
  maps an LP Fail to `qa_status='rejected'`, but calls
  `createInspectionHoldIfMissing` only when `decision === 'hold'`.

The source contains no NCR creation in this decision path. This matches the
fresh-list production check: the LP became Rejected, while neither an owned hold
nor an owned NCR appeared.

## PF-R16-03 — server contract supports links but the create UI omits them

- `apps/web/app/[locale]/(app)/(modules)/quality/ncrs/_components/ncr-create-modal.client.tsx:139-146`
  submits only type, severity, title, description and optional affected quantity.
- The rendered form at the same file's lines `222-277` exposes only those fields.
- `apps/web/app/[locale]/(app)/(modules)/quality/_actions/ncr-actions.ts:561-625`
  already accepts and persists `referenceType`, `referenceId`, `productId` and
  `linkedHoldId`.

The missing links are therefore a UI wiring gap, not a database capability
blocker.

## PF-R16-04 — close refresh does not update client-owned status

- `apps/web/app/[locale]/(app)/(modules)/quality/ncrs/[ncrId]/_components/ncr-detail.client.tsx:152-156`
  copies the initial server status into client state.
- The close callback at lines `500-509` calls only `router.refresh()` and never
  updates that client state to `closed`.

The existing client island is preserved across the RSC refresh, so the local
`investigating` state and its controls remain until a hard navigation remounts it.

## PF-R16-05 — raw Zod text is returned and rendered

- `apps/web/app/[locale]/(app)/(modules)/quality/_actions/inspection-actions.ts:887-923`
  catches `recordSchema.parse` and returns `err.message`; for a Zod error this is
  the structured issue array.
- `apps/web/app/[locale]/(app)/(modules)/quality/inspections/[inspectionId]/_components/inspection-detail.client.tsx:219-228`
  interpolates that message directly into the operator-facing error.

## PF-R16-06 — deployed translation already contains the appended notice

At production SHA `2eb57cf7b90c23d4c55afeb01116eaabc3250385`,
`_meta/i18n-staging/quality-ncrs.json:87` has the complete closed banner ending
in `SHA-256 signature stored.`. The component at
`apps/web/app/[locale]/(app)/(modules)/quality/ncrs/[ncrId]/_components/ncr-detail.client.tsx:243-244`
then appends `closedBannerSigned` when a signature hash exists, producing the
same sentence twice.

The checkout currently also contains an unrelated, uncommitted repair-lane edit
that separates those two strings. It is not part of the production SHA and was
not counted as proof that production is fixed.
