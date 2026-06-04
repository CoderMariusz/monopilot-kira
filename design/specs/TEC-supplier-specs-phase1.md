# TEC Supplier Specs — Phase 1 Upload/View/Review Brief

**Task:** T-072
**PRD refs:** docs/prd/03-TECHNICAL-PRD.md §5.5, §15A.3, §15A.5
**Status:** BRIEF — implementable by later schema/API/UI tasks without rediscovery.
**Marker:** [UNIVERSAL]
**Depends on:** T-005 (supplier schema foundation)

---

## 1. What supplier_specs Is (and Is Not)

### Specs taxonomy (PRD §15A.5)

| Concept | Owner | Definition |
|---|---|---|
| `supplier_spec` | Technical (Phase 1) | Supplier-provided raw material/component parameters, certificates, allergens, cost/quality constraints and approved supplier facts |
| `customer_spec` | Commercial/NPD | Outgoing product spec promised to a customer; packaging, label, claims, nutritional/compliance |
| `factory_spec` / `internal_product_spec` | Technical | Manufacturing-facing spec maintained by Technical for BOM, process, allergens, shelf-life, print specs, QC limits |

`supplier_specs` is distinct from `customer_spec` and from `factory_specs`/`internal_product_spec`. The `specs_screen` (TEC-086) must label which taxonomy it renders. Do not collapse `supplier_specs` into a generic `reference_tables.specifications` row.

### Phase 1 scope

Phase 1 = **internal Technical-maintained master data** with upload/view/review actions.

Phase 2 (out of scope here): Supplier portal upload, supplier negotiation, external document workflow.

---

## 2. Document Metadata Schema (PRD §5.5)

The `supplier_specs` table schema (defined in PRD §5.5 and implemented by T-075):

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `org_id` | UUID NOT NULL | RLS via `app.current_org_id()` |
| `item_id` | UUID NOT NULL | FK to `items` |
| `supplier_code` | TEXT NOT NULL | Soft reference; not a hard FK to a suppliers table |
| `supplier_status` | TEXT | `pending` / `approved` / `blocked` |
| `spec_document_url` | TEXT | S3/Blob storage URL |
| `document_sha256` | TEXT | Integrity hash |
| `document_mime_type` | TEXT | e.g. `application/pdf` |
| `spec_version` | TEXT NOT NULL | Supplier-assigned version string |
| `issued_date` | DATE | |
| `effective_from` | DATE NOT NULL | Default `CURRENT_DATE` |
| `expiry_date` | DATE | Null = no expiry |
| `lifecycle_status` | TEXT | `draft` / `active` / `expired` / `superseded` / `blocked` |
| `review_status` | TEXT | `pending` / `approved` / `rejected` / `blocked` |
| `review_notes` | TEXT | Reviewer notes |
| `cost_review_blocked` | BOOLEAN | Block RM usability cost check |
| `spec_review_blocked` | BOOLEAN | Block RM usability spec check |
| `approved_by` | UUID | FK to `users` |
| `approved_at` | TIMESTAMPTZ | |
| `rejected_by` | UUID | FK to `users` |
| `rejected_at` | TIMESTAMPTZ | |
| `rejection_reason` | TEXT | Required on rejection |
| `declared_allergens` | TEXT[] | Supplier-declared allergen codes (soft refs) |
| `declared_attrs` | JSONB | Nutrition, origin, certifications |
| `certificate_refs` | JSONB | COA/BRCGS/organic/etc metadata array |
| `uploaded_at` | TIMESTAMPTZ | |
| `uploaded_by` | UUID | FK to `users` |

**Uniqueness constraint:** At most one active approved non-expired spec per `(org_id, item_id, supplier_code)`:
```sql
CREATE UNIQUE INDEX supplier_specs_one_active_approved
  ON supplier_specs(org_id, item_id, supplier_code)
  WHERE lifecycle_status = 'active' AND review_status = 'approved';
```

---

## 3. Status Transitions

### lifecycle_status

```
draft → active (on Technical approval)
active → expired (when expiry_date < CURRENT_DATE)
active → superseded (when a newer approved version replaces it)
active → blocked (Technical blocks it)
```

### review_status

```
pending → approved (Technical approves)
pending → rejected (Technical rejects with reason)
approved → blocked (Technical blocks after approval)
```

### Combined RM usability gate

RM usability passes only when **all** of:
1. `supplier_status = 'approved'`
2. `lifecycle_status = 'active'`
3. `review_status = 'approved'`
4. `expiry_date IS NULL OR expiry_date >= CURRENT_DATE`
5. `cost_review_blocked = false`
6. `spec_review_blocked = false`

---

## 4. Upload/View/Review Flow

### 4.1 Upload (Technical role)

**UI state:** `TEC-086 Specifications List` (specs_screen) → "Upload Supplier Spec" button.
**Permission required:** `technical.items.edit` (or a dedicated `technical.supplier_specs.upload`).

**Upload modal fields:**
- Item (autocomplete, required)
- Supplier Code (text, required)
- Spec Version (text, required)
- Issued Date (date picker)
- Effective From (date picker, default today)
- Expiry Date (date picker, optional)
- Document file (PDF/DOCX/XLSX, max 10 MB)
- Declared Allergens (multi-select from `reference_tables.allergens_reference`)
- Certificate references (repeatable: type + issuer + valid_until)
- Notes

**On submit:** Record created with `lifecycle_status = 'draft'`, `review_status = 'pending'`. Record visible in supplier_specs list immediately. Storage: persist `spec_document_url` + `document_sha256`; do not implement supplier portal.

**Server action:** `uploadSupplierSpec(payload)` in `apps/web/actions/technical/supplier-specs/upload.ts`.
Emits `supplier_specs.uploaded` outbox event.

---

### 4.2 View (any Technical role)

**UI state:** `TEC-086 Specifications List` → row click → detail slide-over or detail page.

**Detail fields shown:**
- All metadata fields from §2
- Status badges (lifecycle + review + supplier status)
- RM usability gate summary (pass/fail with reason per check)
- Certificate refs rendered as expandable list
- Allergen compatibility note (cross-reference to item's allergen profile)
- Document download link (pre-signed URL)

**No edit** on an approved/active spec without creating a new version.

---

### 4.3 Review (Technical approval role)

**UI state:** Detail page → "Approve" / "Reject" / "Block" action buttons.
**Permission required:** `technical.items.edit` + `quality_lead` or `owner` role.

**Approve flow:**
1. Click "Approve".
2. Confirm modal: "Approve supplier spec [version] for [item] from [supplier]?"
3. Optional review notes field.
4. On confirm: `review_status → approved`; if `lifecycle_status = 'draft'` → `lifecycle_status → active`. `approved_by` + `approved_at` recorded.
5. Emits `supplier_specs.approved` outbox event.

**Reject flow:**
1. Click "Reject".
2. Modal with required `rejection_reason` text field.
3. On confirm: `review_status → rejected`; `lifecycle_status` remains `draft` or → `blocked` (if previously active).
4. Emits `supplier_specs.rejected` outbox event.

**Block flow:**
1. Click "Block" (available on active/approved specs).
2. Modal with required reason.
3. On confirm: `supplier_status → blocked`; RM usability immediately fails with `SUPPLIER_NOT_APPROVED`.
4. Emits `supplier_specs.blocked` outbox event.

**Audit evidence:** Every status change recorded in `audit_log` with `action_reason`; `approved_by`/`rejected_by` user IDs stored on the record.

---

## 5. PO/TO Actual Deviations and Non-conformance (PRD §15A.3)

**Rule: PO actuals do not overwrite approved supplier_specs or BOM `cost_per_kg`.**

When a Purchase Order receipt reveals a deviation (price, spec, allergen, shelf-life):
1. PO module records the actual values.
2. A `non_conformance.requested` outbox event is emitted by Technical with payload (PRD §5.5 schema).
3. The event is consumed by 09-QUALITY for NCR lifecycle.
4. `supplier_specs` row is unchanged until `approveSupplierSpecReview` is explicitly called by Technical role.

**Rule: Transfer Orders do not change Technical master specification.**
TO can affect inventory availability, lot genealogy, shelf-life remaining; if a TO reveals an issue, it triggers non-conformance/review, not spec mutation.

**Server action:** `proposeSupplierSpecReview(payload)` creates a review task; does NOT mutate `supplier_specs`.
**Server action:** `approveSupplierSpecReview(reviewId)` — only this action may apply approved changes to `supplier_specs` from a PO-triggered review proposal.

---

## 6. RM Usability Hooks (PRD §15A.3)

Before using an RM in a BOM line or factory operation, the system validates:

| Check | Condition to pass | Failure code |
|---|---|---|
| Approved supplier | `supplier_status = 'approved'` | `SUPPLIER_NOT_APPROVED` |
| Active approved non-expired supplier_spec | lifecycle + review + expiry gate from §3 | `SUPPLIER_SPEC_INACTIVE` / `SUPPLIER_SPEC_EXPIRED` / `SUPPLIER_SPEC_NOT_APPROVED` |
| Allergen compatibility | Item allergen profile compatible with FG BOM allergen constraints | `ALLERGEN_INCOMPATIBLE` |
| Active item | `items.status = 'active'` | `ITEM_NOT_ACTIVE` |
| Cost/spec review not blocked | `cost_review_blocked = false` AND `spec_review_blocked = false` | `COST_REVIEW_BLOCKED` / `SPEC_REVIEW_BLOCKED` |
| QC/release status (if configured) | Org-configured quality gate passes | `QC_STATUS_BLOCKED` |

The validation must return a typed result with all failing checks listed (not just the first failure), so UI can show the exact blocking reason.

---

## 7. Candidate API Routes / Server Actions

All in `apps/web/actions/technical/supplier-specs/`:

| Action | Method | Notes |
|---|---|---|
| `listSupplierSpecs(filters)` | GET (read) | Paginated; org-scoped; filters: item, supplier_code, review_status, lifecycle_status |
| `getSupplierSpecDetail(id)` | GET (read) | Full record + RM usability gate summary |
| `uploadSupplierSpec(payload)` | POST (write) | Creates draft record; stores document metadata |
| `approveSupplierSpec(id, notes?)` | POST (write) | `review_status → approved`; `lifecycle_status → active` |
| `rejectSupplierSpec(id, reason)` | POST (write) | `review_status → rejected` |
| `blockSupplierSpec(id, reason)` | POST (write) | `supplier_status → blocked` |
| `proposeSupplierSpecReview(payload)` | POST (write) | Creates review task from PO/TO deviation; does NOT mutate spec |
| `approveSupplierSpecReview(reviewId)` | POST (write) | Applies approved review changes |
| `checkRmUsability(itemId, orgId)` | GET (read) | Returns typed `{ pass: boolean, checks: UsabilityCheck[] }` |

Route path prefix: `/api/technical/supplier-specs/`

---

## 8. Candidate UI States

| State | Screen/Modal | Notes |
|---|---|---|
| Specs List | TEC-086 Specifications List (`specs_screen`) | Filter by item, supplier, status |
| Upload modal | Inline modal on TEC-086 | Fields from §4.1 |
| Spec detail | Slide-over or dedicated page | Fields from §4.2 |
| Review decision modal | Inline confirm modal | Approve/Reject/Block flows from §4.3 |
| RM usability gate | Inline badge on BOM line / Item detail | Pass/fail per check from §6 |
| Non-conformance trigger | Toast / notification | After PO deviation detected |

---

## 9. Out of Scope (Phase 1)

- Supplier portal (Phase 2 per PRD §4.2 "Supplier portal integration")
- External supplier negotiation and document workflow
- Implementing API routes (this brief names candidates; implementation is T-075 and paired UI tasks)
- Implementing UI components (implementation is separate T3-ui tasks)
- D365 supplier_specs sync (D365 is optional integration; no hard FK on `d365_item_id`)
