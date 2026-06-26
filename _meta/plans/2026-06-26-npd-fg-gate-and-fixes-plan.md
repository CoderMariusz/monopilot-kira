# NPD FG architecture + gate discoverability + supplier/allergen fixes + dead-end sweep

Source: background Workflow `npd-fg-and-fixes-investigation` (wf_57de775c-9e6), 2026-06-26.
Owner interactive-loop session. This plan captures the investigation + precise specs.

## Already SHIPPED this session (verified live unless noted)
- NPD create blocker → native date picker (calendar). VERIFIED.
- Gate checklist toggle (`FOR UPDATE` on nullable outer-join side) → `for update of gci`. VERIFIED.
- Project delete (outbox event_type not in CHECK) → best-effort event behind SAVEPOINT. VERIFIED.
- Item detail List price row + 4-locale i18n. VERIFIED.
- "Add supplier" submit button → `btn-primary`.
- Gate "Completed by" UUID → user name (join public.users).
- Gate-checklist DISCOVERABILITY: "Gate checklist" link button in project header next to "Advance stage" (the tickable page `/pipeline/[id]/gate` had NO nav link). Deploying.
- Pack weight (g) inputs (create wizard + brief) → `<input type="number">`. Deploying.

## 1. FG architecture — RECOMMENDATION (owner's big question)
**Finding:** "FG" = `public.product` (a.k.a. FA / Factory Article). `npd_projects.product_code` is NULL until the project advances to the **packaging** stage, at which point `createFgCandidate` (gate-helpers.ts:405-493) inserts a `public.product` row `FG-{PROJECT_CODE}` and back-links it. "Finished good not found" (`/fa/[productCode]/page.tsx:567`) appears when you open an FG code that has no `public.product` row yet (project not advanced to packaging). The escape-hatch action `createOrMapFgCandidateAtG3` exists but is **wired to zero UI**. `public.items` (item_type='fg') is a SEPARATE operational table (Technical/WO/BOM) — creating a Technical FG item does NOT create the NPD `public.product`.

**Recommendation:** FG creatable from **BOTH**, default = **NPD project**:
1. Wire `createOrMapFgCandidateAtG3` to a "Create / Link Finished Good" panel on the project (shown whenever `product_code IS NULL`), modes: `create` (auto code `FG-{code}`, override allowed) + `map` (link an existing FA code). RBAC `npd.gate.advance`.
2. Surface FG status in the project header: `FG: {product_code}` (link to /fa) when set, else "No FG assigned yet".
3. Dashboard pipeline preview: link to `/fa/{product_code}` only when non-null (today it wrongly uses project code → 404s).
4. Technical→Items (item_type='fg') stays the operational item master, NOT the NPD FG creation path. The `public.product → public.items` bridge happens at handoff (`promoteToProduction`).

**Open decisions (owner):**
- FA code prefix: `createFa` enforces `^FA[A-Z0-9]+$` but auto-candidate is `FG-{code}`. Canonical prefix — FA or FG?
- Advance-to-packaging: keep silent auto-create FG, or pause to confirm/supply the code?
- "Create/Link FG" panel: only on packaging stage, or on any stage when product_code is null?
- Retroactively link an existing standalone FA to a project (map mode UI)? 

## 2. Gate evidence + screen consolidation (owner design direction)
Owner wants: each checklist item to hold CONTENT — a big paste field (e.g. "Product concept") + optional attachment + the tick; and questions whether there are too many screens to consolidate.
- `gate_checklist_items` already has `evidence_file` (text). Add `evidence_note` (text) for the paste field. Per-item UI: expand → textarea + optional link/file + tick.
- Consolidation: embed the CURRENT gate's checklist into the relevant stage screen (G0/Idea → Brief) so you fill brief + tick/evidence in one place. Aligns with NPD-DYN (#57 configurable field catalog).
- Attachments (real file upload) need a storage backend → later; note/link now.

## 3. Supplier-spec edit/deactivate (25a) — SPEC (owner approved)
File anchors from investigation:
- Add to `technical/items/_actions/supplier-spec-actions.ts` (after createItemSupplierSpec):
  - `updateItemSupplierSpec(specId, {specVersion, issuedDate, effectiveFrom, expiryDate, approveNow})` — fetch row (item_id+before), UPDATE spec_version/dates (+approve sets supplier/lifecycle/review='active/approved', approved_by/at); audit 'item.supplier_spec.updated'; ITEMS_EDIT_PERMISSION.
  - `deactivateItemSupplierSpec(specId)` — set `lifecycle_status='superseded'` (NOT 'blocked'; preserve review_status), idempotent; audit 'item.supplier_spec.deactivated'.
  - Export `UpdateItemSupplierSpecResult` / `DeactivateItemSupplierSpecResult` types (no new error codes). Keep zod schemas non-exported (turbopack 'use server' rule).
- New client island `[item_code]/_components/supplier-spec-row-actions.client.tsx`: Edit modal (prefill) + Deactivate confirm; reuse Modal/Field pattern from supplier-spec-add.client.tsx; router.refresh() on success.
- `item-data-tabs.tsx` SupplierSpecsTab: add `rowActions?: (spec) => ReactNode` render-prop seam + conditional actions column (mirrors `addAction`).
- `page.tsx`: import the 2 actions + the island; pass `rowActions={canEdit ? ... : undefined}`.
- Decision: deactivate sets lifecycle 'superseded' (frees the active+approved unique slot; badge-gray not red). Warn in confirm dialog if deactivating the only active+approved spec (re-arms BOM SUPPLIER_NOT_APPROVED).

## 4. Allergen nutrition→profile auto-sync (25c) — SPEC (owner approved)
- Mapping (positional, both files agree 1:1): A01=gluten, A02=crustaceans, A03=eggs, A04=fish, A05=peanuts, A06=soybeans, A07=milk, A08=nuts, A09=celery, A10=mustard, A11=sesame, A12=sulphites, A13=lupin, A14=molluscs.
- In `[item_code]/_actions/upsert-nutrition.ts`: add `EU14_TO_ALLERGEN_CODE` const + `syncBriefDeclaredProfiles(client,itemId,orgId,userId,aCodes)` called after the RawMaterials upsert, before writeAudit. Upsert `public.item_allergen_profiles` (source='brief_declared', intensity='contains', confidence='declared') for selected; DELETE brief_declared rows for deselected; NEVER touch source IN ('cascaded','manual_override'). No migration, no new grant; ITEMS_EDIT_PERMISSION suffices.
- Defaults chosen: source='brief_declared', intensity='contains', silent delete on deselect, no ledger row, items.edit only. (Owner can revisit per-allergen intensity later.)

## 5. Dead-end sweep (owner-requested, prioritized)
- **HIGH** Supplier-spec rows (25a — fixing now).
- **HIGH** BOM co-products — read-only table, no edit/delete (`bom-detail-screen.tsx:437-473`). Add BomCoProductRowActions mirroring BomLineRowActions, gate on isEditable.
- **HIGH** HACCP CCPs — add-only, no per-row edit/delete (`quality/haccp/[id]/.../plan-detail.client.tsx:201-241`). UpsertCcpAction already passed; wire edit mode + row Edit button (draft only).
- **HIGH** Quality spec parameters — no per-parameter edit in draft (`quality/specifications/[specId]/.../spec-detail.client.tsx`). Add UpdateSpecParameter + row Edit (draft only). 21 CFR.
- **MED** Changeovers — create+sign only, no edit/cancel (`production/changeovers/.../changeovers-list.client.tsx`). Add Edit (pending only) + Cancel.
- **MED** NPD sensory — read-only by ownership; technical/sensory has no write path at all.
- **LOW** Technical tooling list (read mirror → routings); Technical lab-results (Quality-owned read). No fix needed.

## Next implementation order
1. 25a supplier edit/deactivate (HIGH, unblocks BOMs).
2. 25c allergen sync.
3. FG "Create/Link FG" wiring + header FG status (after owner decides prefix/auto-create).
4. Dead-end HIGHs: BOM co-products, HACCP CCP edit, spec-parameter edit.
5. Gate evidence note field + consolidation (aligns with NPD-DYN).
