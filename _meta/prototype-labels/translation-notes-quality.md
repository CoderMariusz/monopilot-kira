# Quality Module — Prototype Translation Notes

Scanned: 2026-04-23  
Source files: `design/Monopilot Design System/quality/` (8 JSX files + BACKLOG.md)  
Components indexed: 30  
Total estimated translation time: ~2,715 min (~45 dev-hours)

---

## Cross-Cutting Patterns (apply to ALL quality components)

### E-Signature (21 CFR Part 11)
- The `esign-block` CSS pattern appears in 7 modals: HoldRelease, SpecSign, CcpReading, CcpDeviationLog, ESign (generic), AllergenDualSign, NcrClose.
- **Production**: Build a single shared `<ESignBlock>` server component that accepts `{ user, timestamp, meaning }` props from server session. Never pass PIN or PIN-hash from client to a rendered prop.
- PIN verification MUST call a Server Action (`POST /api/auth/verify-pin`) using PBKDF2 comparison against the stored user PIN hash. The `verified` state on the client is set from the server response. The Sign button is disabled until server confirms.
- `BL-QA-06` — plain `<input type="password">` is flagged as inadequate (OQ#8). Build a virtual numeric keypad component to defeat keyloggers. Medium priority.

### Dual-Sign Pattern (SoD)
- Appears in: `hold_release_modal` (V-QA-HOLD-006), `ncr_close_modal` (V-QA-NCR-006), `allergen_dual_sign_modal`.
- **Production**: Segregation-of-duties MUST be enforced server-side by comparing `hold.created_by_user_id !== session.userId`. Never rely on client `sodBlock` guard alone.
- For dual-sign flows (NcrClose critical, AllergenDualSign): the second PIN must belong to a different authenticated session. In production this means the second signer must log in with their own credentials on the same screen or a separate session — not just a second PIN entry for the same logged-in user.

### Mock Data → Database
- All `QA_*` constants (QA_HOLDS, QA_NCRS, QA_INSPECTIONS, QA_CCPS, QA_HACCP_PLANS, QA_SPECS, QA_AUDIT, QA_ALLERGEN_GATES, QA_DEVIATIONS, QA_TEMPLATES, QA_SAMPLING_PLANS) → replace with Drizzle queries in Server Components.
- Prefer `Promise.all([queryA, queryB])` for dashboard aggregations to avoid sequential waterfalls.

### Immutability / Signed Records
- `signed-banner` pattern (isSigned/isClosed/isReleased) → in production, derive from DB timestamps (`signed_at`, `closed_at`, `released_at`); never from client state.
- After any signing event: all editable fields must switch to `disabled={true}` or be rendered as static text. Server Component reads the timestamp and renders the read-only variant.

### Hardcoded Labels / i18n
- All user-visible strings are hardcoded in Polish/English. → `next-intl` keys required. Regulation references (V-QA-NCR-005, BRCGS §3.8, etc.) should also map to i18n keys so they can be localized.

### URL-Based State
- Client-side filter state (`useState` for status/severity/search) → URL `searchParams` in production. This allows deep-linking, browser back/forward, and Server Component data fetching without client-side refetch.

---

## Modals (modals.jsx)

### M-01 — `hold_create_modal` (lines 22–96)

**Pattern:** CRUD form with conditional validation + SoD warning  
**Key rules:** V-QA-HOLD-002 (reference FK check), V-QA-HOLD-005 (disposition before release), V-QA-HOLD-006 (SoD)

| Prototype pattern | Production equivalent |
|---|---|
| `window.Modal` primitive | `@radix-ui/react-dialog` Dialog via shadcn |
| Local `useState` per field | `useForm` + `zodResolver`; schema `.superRefine` for cross-field (reasonNotesRequired) |
| `QA_HOLD_REASONS` mock array | Drizzle `SELECT * FROM hold_reason_codes ORDER BY label` in Server Component |
| `isCritical` alert box client-side | Alert shown client-side (acceptable); SoD enforcement is server-only |
| Priority pills | shadcn `ToggleGroup` or custom pill with `aria-pressed` |
| Disposition + estRelease | shadcn `Select` + `DatePicker` (react-day-picker wrapped) |
| `onClick` → `onClose` | Server Action `createHold(formData)` with role guard; emit `quality_hold_created` outbox event |
| Hardcoded Polish labels | `next-intl` `t()` keys |

**Known bugs:** BL-QA-07 — hold reference picker has no autocomplete; plain text input requires user to know exact LP/WO/PO number.

---

### M-02 — `hold_release_modal` (lines 99–156)

**Pattern:** Destructive action + e-sign + SoD enforcement  
**Key rules:** V-QA-HOLD-005, V-QA-HOLD-006

| Prototype pattern | Production equivalent |
|---|---|
| `sodBlock` client guard | Server Action checks `hold.created_by_user_id !== session.userId` before committing; 409 on violation |
| `pin` state + 6-digit check | ESignBlock component; PIN verified via Server Action before enabling Release button |
| `Summary` component | shadcn `dl`/`dt`/`dd` or two-column read-only Card |
| `ReasonInput` with minLength | Textarea + Zod `min(10)` + character counter `<FormDescription>` |
| Green "Release Hold" button | shadcn `Button variant="default"` with green class override, or custom `variant="success"` |
| Mock `creatorIsSameUser` | Never trust: always recompute server-side from DB |

**Known bugs:** BL-QA-06 — plain `<input type="password">` for PIN.

---

### M-03 — `spec_sign_modal` (lines 159–206)

**Pattern:** Pre-approval checklist + e-sign  
**Key rules:** V-QA-SPEC-002, V-QA-SPEC-003, V-QA-SPEC-005

| Prototype pattern | Production equivalent |
|---|---|
| `checks[]` hardcoded booleans | Server pre-flight query: verify all parameters have `test_method`, min≤target≤max, `approved_by_role = quality_lead` |
| Checklist items | shadcn `Checkbox` list; read-only (server-computed); failed checks block the Sign button |
| Blue info box (allergen snapshot) | Alert; allergen snapshot happens inside Server Action on approval commit |
| ESign block | Shared ESignBlock; PIN verified server-side |
| "Approve Specification" → immutable | Server Action: `UPDATE specs SET status='active', approved_by=..., approved_at=now()` |

---

### M-04 — `template_create_modal` (lines 209–245)

**Pattern:** CRUD form + dynamic parameter list  

| Prototype pattern | Production equivalent |
|---|---|
| `params` state array | `useFieldArray` from react-hook-form |
| Inline table with editable rows | Table + Input per cell; `remove(i)` on delete |
| Category select | Reference data from `inspection_template_categories` table |
| Save Template | Server Action upsert to `inspection_templates` + `inspection_template_params` |
| `editing` prop | Same modal used for create and edit; `data` prop determines upsert vs insert |

---

### M-05 — `sample_draw_modal` (lines 248–297)

**Pattern:** AQL form + live auto-decision  

| Prototype pattern | Production equivalent |
|---|---|
| `decision` computed client-side | Mirror same logic server-side in Server Action; client shows preview only |
| `plan` from mock `QA_INSPECTION_DETAIL` | Join `sampling_plans` to inspection on server; pass as prop |
| `remaining = sampleSize - samplesTaken` | Computed server-side; `max` attribute on input from prop |
| Auto-NCR on reject decision | Server Action side-effect: if `defects >= plan.reject` → INSERT `ncr_reports` draft |
| Green/amber/red alert | shadcn Alert with variant derived from `decision` prop |

---

### M-06 — `ncr_create_modal` (lines 300–382)

**Pattern:** Multi-path form (3 NCR types) + conditional validation  
**Key rules:** V-QA-NCR-003 (yield), V-QA-NCR-004 (allergen)

| Prototype pattern | Production equivalent |
|---|---|
| `type` state → conditional blocks | `useWatch('type')` controlling conditional `FormSection` renders |
| Yield block (targetYield/actualYield/claim) | Zod cross-field validation; `claimValue` computed server-side on submit |
| `allergenLink` required condition | Zod `superRefine`; allergen link FK-validated server-side |
| Product/assignedTo selects | Server-loaded option lists; product should be `Combobox` (shadcn) for large catalogs |
| `dueMap` severity→hours | Stored in rule registry V-QA-NCR-001; read from DB |
| Save as draft + Submit | Two Server Actions: `saveNcrDraft`, `submitNcr`; submitNcr validates `description.length >= 20` |

---

### M-07 — `ncr_close_modal` (lines 385–466)

**Pattern:** Pre-close checklist + conditional dual-sign  
**Key rules:** V-QA-NCR-005 (root cause required), V-QA-NCR-006 (dual sign for critical)

| Prototype pattern | Production equivalent |
|---|---|
| `checks[]` hardcoded booleans | Server pre-flight: query rootCause, immediateAction, linked holds |
| Dual-sign grid (isCritical) | Two ESignBlock components in responsive grid; second block gated on `ncr.severity === 'critical'` |
| `rcCat` select | Reference data from `ncr_root_cause_categories` table |
| `qaPin` + `pmPin` both 6 digits | Both PINs verified by Server Action before closing; distinct user IDs required |
| Immutable close | Server Action: set `status='closed'`, `closed_at=now()`; row-level DB trigger blocks future UPDATEs |

---

### M-08 — `ccp_reading_modal` (lines 469–551)

**Pattern:** CCP entry form + live limit check + conditional e-sign  
**Key rules:** V-QA-CCP-005 (sign required for biological/allergen hazards)

| Prototype pattern | Production equivalent |
|---|---|
| `ccpDef` from `QA_CCPS` mock | Server-fetched from `ccp_definitions`; pass as prop to client modal |
| `withinLimits` computation | Client preview only; server recomputes on save using DB `limit_min`/`limit_max` |
| `hazardSignRequired` flag | Server-side: `ccp.hazard_type IN ('biological','allergen')` → e-sign required |
| Green/red alert on limit check | shadcn Alert; variant from server-validated result on save |
| Auto-NCR + auto-hold on out-of-limits | Server Action side-effect on save when `within_limits=false` |
| CCP grouped `optgroup` select | shadcn `Select` with group support or `Combobox` with section headers |

---

### M-09 — `ccp_deviation_log_modal` (lines 554–594)

**Pattern:** Deviation log form + conditional e-sign

| Prototype pattern | Production equivalent |
|---|---|
| Severity auto-derived from hazardType | DB-computed or Server Action derived; `<select>` should be read-only/disabled display |
| `action` with min 10 chars | `ReasonInput` → Textarea + Zod `min(10)` |
| Linked monitoring record search | Async Combobox with debounced `GET /api/quality/ccp-readings?q=` |
| `signReq` boolean | Same logic as M-08; Server Action enforces regardless of client value |

---

### M-10 — `esign_modal` (lines 597–634)

**Pattern:** Generic e-sign primitive (shared across module)

| Prototype pattern | Production equivalent |
|---|---|
| `setVerified(pin.length === 6)` after timeout | Server Action `POST /api/auth/verify-pin`; client sets `verified` from response |
| `meaning` prop | Passed from parent; drives `signature_meaning` in audit log; never client-computed |
| Server timestamp display | Always rendered server-side from session; never `new Date()` on client |
| SHA-256 hash reference | Server computes `hash(userId + isoTimestamp + recordContent)`; stored in `esignatures` table |

**Known bugs:** BL-QA-06 — plain masked input inadequate for anti-keylogger requirement.

---

### M-11 — `allergen_dual_sign_modal` (lines 637–697)

**Pattern:** ATP-gated dual-sign with override  
**Key rules:** V-QA-ALLERGEN-001, V-QA-ALLERGEN-002

| Prototype pattern | Production equivalent |
|---|---|
| `atpOver` client check | Server pre-flight: query `gate.atp_rlu > gate.atp_threshold` |
| `approveBlocked` gate | Server Action returns 422 if blocked; client shows error; override only allowed if `riskLevel = 'low'` (from DB) |
| Override justification | Zod `min(10)`; override event logged to `allergen_gate_overrides` audit table |
| First signer shown (read-only) | From DB `first_signed_by_user_id` JOIN users; immutable once set |
| Reject gate button | Separate Server Action; stores `reject_reason`; status → 'rejected' |
| Allergen delta display | From `allergens_removed[]` and `allergens_added[]` text[] DB columns |

---

### M-12 — `audit_export_modal` (lines 700–756)

**Pattern:** Async export with prepare + download  

| Prototype pattern | Production equivalent |
|---|---|
| `setTimeout 1200ms` mock | Real streaming export via Route Handler `GET /api/quality/audit/export` |
| Format pills (CSV/JSON) | `RadioGroup`; drives `Accept` header or `format` query param |
| Scope/user selects | Filter params to Drizzle WHERE; validate date range ≤ 365 days |
| Export is itself an audit event | Server Action/Route Handler inserts `quality_audit_log` record before streaming |
| Download link | Presigned S3/R2 URL or streaming attachment; never embed data in modal state |

---

### M-13 — `delete_with_reason_modal` (lines 759–780)

**Pattern:** Destructive delete with audit reason  

| Prototype pattern | Production equivalent |
|---|---|
| `reason.length >= 10` | Zod `min(10)` + character counter |
| Delete button `variant="danger"` | shadcn `Button variant="destructive"` |
| "Cannot be undone for active/signed records" | Server Action validates `status IN ('draft')` before DELETE; active/signed → 409 |
| `entity` + `id` props | Typed discriminated union prop for multi-entity reuse |
| Audit trail note | Server Action: INSERT `quality_audit_log` row with `op='DELETE'`, `reason=formData.reason` before DELETE |

---

### M-14 — `inspection_assign_modal` (lines 783–816)

**Pattern:** Simple assignment picker

| Prototype pattern | Production equivalent |
|---|---|
| Inspector select options hardcoded | Drizzle `SELECT id, name FROM users WHERE role IN ('quality_inspector','quality_lead')` |
| Priority override | Server Action updates `quality_inspections.priority`; no separate validation needed |
| Assign Server Action | Sets `assigned_to_user_id`, `status='assigned'`, `assigned_at=now()`; emits `inspection_assigned` event |
| Notes optional | Stored in `inspection_notes` field; no min length validation |

---

## Dashboard (dashboard.jsx)

### QA-001 — `qa_dashboard` (lines 3–147)

**Pattern:** Multi-KPI dashboard with tabbed recent records  

| Prototype pattern | Production equivalent |
|---|---|
| `QA_KPIS` mock array | `Promise.all` of 6 Drizzle aggregation queries; counts for holds/NCRs/inspections/CCPs |
| `QA_CRITICAL_ALERTS` mock | Server query: `quality_alerts` view joining holds+NCRs+CCPs WHERE severity='critical' AND NOT dismissed |
| `dismissed` local Set | Per-user `user_dismissed_alerts` table; dismiss = Server Action updating DB |
| 3-tab table (Inspections/NCRs/HACCP) | shadcn `Tabs`; each tab server-fetched with `Suspense` boundary; 8/6/8 rows sliced |
| Auto 60s refresh note | Next.js `revalidate` tag or SWR with `refreshInterval: 60000`; avoid polling in prod |
| Quick actions bar | URL-based modal state via `searchParams` preferred over prop-drilled `openModal` |

---

## NCR Screens (ncr-screens.jsx)

### QA-009 — `ncr_list` (lines 3–123)

**Pattern:** Search/filter list with kanban pipeline strip + bulk actions

| Prototype pattern | Production equivalent |
|---|---|
| Client-side filter state | URL `searchParams`; Server Component receives and builds Drizzle WHERE |
| Kanban strip (status counts) | Server aggregation: `SELECT status, COUNT(*) FROM ncr_reports GROUP BY status` |
| `counts.overdue` | Server: `COUNT WHERE response_due_at < now() AND status NOT IN ('closed','cancelled')` |
| Bulk selection Set | Client UI only; bulk export/assign → Server Actions with ID arrays |
| `overdue` row highlight | Server-computed boolean prop per row |
| Avg resolution 2.8d hardcoded | Server: `AVG(EXTRACT(EPOCH FROM (closed_at - detected_at))/86400)` rolling 30d |
| Export button | Route Handler streaming CSV/Excel |

### QA-009a — `ncr_detail` (lines 126–283)

**Pattern:** Two-column detail view with investigation form + status workflow sidebar

| Prototype pattern | Production equivalent |
|---|---|
| Two-column grid (1fr 380px) | CSS Grid; sticky action bar uses `position: sticky; bottom: 0` |
| Root cause textarea | `disabled={isClosed}` driven by server-fetched `status` prop; autosave on blur |
| CAPA card opacity-0.7 | shadcn Card with `data-state="disabled"` + `opacity-50`; Epic 8G / BL-QA-01 |
| `q-timeline` events | `SELECT * FROM ncr_events WHERE ncr_id=? ORDER BY created_at DESC` |
| Status workflow sidebar | Server-driven state machine; transitions call Server Actions mapped to allowed states |
| `overdue` banner | Server: `response_due_at < now()` → pass as boolean prop |
| SignedBanner | Alert; shown when `closed_at IS NOT NULL` |

---

## Inspection Screens (inspection-screens.jsx)

### QA-005 — `incoming_inspection_list` (lines 3–97)

**Pattern:** Tabbed search/filter list with inline row actions

| Prototype pattern | Production equivalent |
|---|---|
| Status tabs | shadcn Tabs + URL searchParam; counts from server aggregation |
| Overdue count + warning | Server: `COUNT WHERE urgency='overdue' AND status NOT IN ('completed','cancelled')` |
| GRN/PO dual-line cell | Two-line td with mono styling; FK joins to `grn_receipts` + `purchase_orders` |
| Sampling plan column | Join to `sampling_plans.code` |
| Row actions (Assign/Start/View) | Conditional buttons from server-computed `status` prop |

### QA-005a — `inspection_detail` (lines 100–297)

**Pattern:** Inline measurement form with auto-result computation + action bar

| Prototype pattern | Production equivalent |
|---|---|
| `measurements` state + `updateMeasured` | `useFieldArray`; auto-result via `useWatch` + Zod transform; server re-validates on submit |
| `overallResult` computation | Mirror server-side in Server Action; client preview only |
| `failReason` + `failNotes` | Conditional section; V-QA-INSP-006 validated server-side |
| "Auto-NCR draft will be created" banner | Note to user; NCR INSERT happens in Server Action on fail submit |
| Right sidebar (GRN/Product/Spec/Sampling/LPs) | Server Component; all FK joins server-side; no client state |
| Action bar (pass/fail/cond submit buttons) | Each triggers `openModal('eSign')` → after confirm → Server Action finalizes inspection |
| `isSigned` banner | `signed_at IS NOT NULL` from DB; render immutable view |

---

## Holds Screens (holds-screens.jsx)

### QA-002 — `holds_list` (lines 3–161)

**Pattern:** Tabbed list with bulk select + inline release action

| Prototype pattern | Production equivalent |
|---|---|
| Status tabs (active composite) | `active` tab = `WHERE status = ANY('{open,investigating,escalated}')` |
| Priority/refType/search filters | URL searchParams → Drizzle WHERE chaining |
| Bulk release | Server Action: array of hold IDs; each validated for SoD; RBAC quality_lead only |
| KPI strip | Single query: `COUNT(*) FILTER WHERE status=...` for each state |
| `overdue` per row | Server: `est_release_date < now() AND status = ANY(active_states)` |
| Empty state CTA | shadcn empty state pattern with "Create Hold" button |
| `activeStates_includes` helper | DB WHERE clause; not a client helper |

### QA-002a — `hold_detail` (lines 164–286)

**Pattern:** Two-column detail with tabbed held-items table + activity log

| Prototype pattern | Production equivalent |
|---|---|
| `heldItems` table | `SELECT * FROM quality_hold_items WHERE hold_id=? JOIN lps` |
| Partial release button | Server Action with `item_id + released_qty`; RBAC + SoD enforced |
| Activity log tab | `SELECT * FROM quality_hold_events WHERE hold_id=? ORDER BY created_at DESC` |
| Linked records (NCR/inspection) | FK lookups; `null` shown as `—`; each link navigates to detail page |
| `activeStates_includes` runtime call | Typo in prototype (`activeStates_includes` not in scope); fix in production with proper import |
| Download audit PDF | Route Handler generating PDF with hold record + release signature |

---

## Specification Screens (specs-screens.jsx)

### QA-003 — `specs_list` (lines 3–79)

**Pattern:** Filter list with status/appliesTo pills

| Prototype pattern | Production equivalent |
|---|---|
| Status/appliesTo pills | URL searchParams; `WHERE status=? AND applies_to=?` |
| `expiringSoon` highlight | Server: `eff_until < now() + interval '30 days' AND status='active'` |
| `params/critical` columns | Aggregate: `COUNT(*)` and `COUNT(*) FILTER WHERE critical=true` from `spec_parameters` |
| `RegTags` component | Reusable Badge list from `regs text[]` column |
| `approvedBy/approvedAt` | JOIN `users` on `approved_by_user_id` |

### QA-003a — `spec_wizard` (lines 82–302)

**Pattern:** 3-step wizard with dynamic parameter builder

| Prototype pattern | Production equivalent |
|---|---|
| `step` state (header/params/review) | URL searchParam `?step=1/2/3`; allows safe back navigation |
| Header step form | `useForm` + zod; spec_code uniqueness validated async on blur |
| `toggleReg` Set for regulations | shadcn ToggleGroup or multi-select; stored as `text[]` in DB |
| `params` useFieldArray | Dynamic list; add-param side panel = inlined form with local state cleared on Add |
| `minMaxInvalid` Zod cross-field | `z.superRefine`: `min <= max` per numeric parameter |
| FA prefix allergen snapshot note | Remove client prefix check; allergen snapshot happens server-side on approval commit |
| `Stepper` component | shadcn Stepper or custom step indicator with completed/active/pending variants |
| Version auto 'v1' | Server-set; never expose editable version field to client |

### QA-003b — `spec_detail` (lines 305–420)

**Pattern:** Two-column detail with allergen profile + parameters table

| Prototype pattern | Production equivalent |
|---|---|
| `allergen-grid` CSS | shadcn Grid; data from `spec_allergen_profile` JSONB snapshot column |
| Parameters table | Read-only; `critical` rows styled via CSS class prop |
| Clone to new version | Server Action: `INSERT INTO specs SELECT ..., version+1, status='draft' WHERE id=?` |
| Approve button (under_review) | RBAC: role=quality_lead only; opens spec_sign_modal |
| SignedBanner | `approved_at IS NOT NULL` from DB |
| Download PDF | Route Handler: Puppeteer or pdf-lib rendering spec detail + signatures |

---

## HACCP Screens (haccp-screens.jsx)

### QA-013 — `haccp_plans` (lines 3–106)

**Pattern:** Tree sidebar + CCP card detail view

| Prototype pattern | Production equivalent |
|---|---|
| `haccp-tree` sidebar | shadcn NavigationMenu or custom `<ul>` with L0/L1 indentation classes |
| `selectedPlan` state | URL searchParam `?planId=...`; Server Component fetches plan + CCPs |
| CCP spark dots (pass/fail) | Recharts ScatterChart dots or tiny SVG; pass/fail from `within_limits` |
| Approve Plan e-sign | Opens `esign_modal` with meaning='approved'; Server Action updates `status='active'` |
| deviations count per CCP | `COUNT(*) FILTER WHERE within_limits=false` in CCP aggregate query |

### QA-014 — `ccp_monitoring` (lines 109–226)

**Pattern:** Timeline chart + filter list

| Prototype pattern | Production equivalent |
|---|---|
| `allReadings flatMap` | Drizzle JOIN: `ccp_monitoring_records JOIN ccp_definitions JOIN haccp_plans` |
| Timeline chart (CSS dots) | Recharts `ScatterChart` or `ComposedChart`; `ReferenceArea` for critical limit band |
| `compliance` computed | Server: `COUNT FILTER WHERE within_limits=true / COUNT(*)` for today |
| `deviations24h` | Server: `COUNT WHERE within_limits=false AND recorded_at > now() - interval '24h'` |
| Chart CCP selector | Controls recharts data; server-fetch readings for selected CCP on change |

### QA-015 — `ccp_deviations` (lines 229–299)

**Pattern:** Action list with sign-off + corrective action

| Prototype pattern | Production equivalent |
|---|---|
| QA_DEVIATIONS mock | `SELECT * FROM ccp_deviation_records JOIN ccp_definitions JOIN ncr_reports` |
| Sign off button | Opens `esign_modal` meaning='witnessed'; Server Action updates `signed_at`, `signed_by_user_id` |
| `row-major` for missing corrective action | Server-computed boolean: `corrective_action IS NULL` |
| HazardBadge component | shadcn Badge with variant map: biological→red, chemical→amber, physical→slate, allergen→red |

### QA-016 — `allergen_gates` (lines 302–422)

**Pattern:** List with right-side drawer + dual-sign action

| Prototype pattern | Production equivalent |
|---|---|
| `drawer` state → `drawer-side` CSS | shadcn `Sheet side="right"`; open/close via `open={!!drawer}` |
| Cleaning checklist in drawer | Static `<ul>` with tick/cross; checklist JSON stored in gate record |
| ATP threshold comparison | From DB `atp_rlu` and `atp_threshold` columns; never recomputed in UI |
| pending2nd/approvedToday/rejected KPI | Server: `COUNT GROUP BY status` |
| Sign (2nd) button | RBAC: `role=quality_lead AND gate.status='pending_second_sign'` |
| Download evidence PDF | Route Handler: PDF with cleaning checklist + both signatures + ATP result |

---

## Other Screens (other-screens.jsx)

### QA-004 — `qa_templates` (lines 3–54)

**Pattern:** Card gallery with filter

| Prototype pattern | Production equivalent |
|---|---|
| `gallery-grid` CSS | CSS Grid auto-fill; each card = shadcn Card |
| `QA_TEMPLATES` mock | Drizzle: `SELECT t.*, COUNT(p.*) AS params_count, ARRAY_AGG(p.name) AS preview FROM inspection_templates t JOIN inspection_template_params p GROUP BY t.id` |
| Category pills | URL searchParam; server WHERE filter |
| "Use in spec" button | Navigate to spec wizard with `?templateId=` param; populate `useFieldArray` from template params |

### QA-008 — `sampling_plans` (lines 57–114)

**Pattern:** Reference data list with filter

| Prototype pattern | Production equivalent |
|---|---|
| `QA_SAMPLING_PLANS` mock | Drizzle `SELECT * FROM sampling_plans` with status/type/applies_to WHERE |
| Filter pills (type/status/appliesTo) | shadcn ToggleGroup or pill buttons; URL searchParams |
| Edit button | Opens CRUD modal for sampling plan; `samplingCreate` modal referenced but not in prototype |
| `num mono` class | `font-mono text-right tabular-nums` Tailwind classes |

### QA-021 — `audit_trail` (lines 117–229)

**Pattern:** Immutable audit log with expandable rows + export

| Prototype pattern | Production equivalent |
|---|---|
| `QA_AUDIT` mock | Drizzle `quality_audit_log` table (insert-only, no UPDATE/DELETE allowed at DB level) |
| `expanded` Set for row toggle | shadcn `Collapsible` or custom TR expansion; `useReducer` preferred over `Set` state |
| `audit-diff` two-column JSON | shadcn `ScrollArea`; syntax-highlight with `shiki` (server) or `Prism` (client) |
| SIGN event inline signature detail | JOIN `esignatures ON record_id`; display `signature_hash` truncated + copy button |
| Op filter pills (INSERT/UPDATE/DELETE/SIGN/...) | URL searchParam `ops=INSERT,SIGN`; server WHERE `op = ANY(ARRAY[...])` |
| Export → audit-logged | Route Handler inserts own audit record before streaming response |
| 7-year retention reference | Enforced via DB retention policy (Postgres TTL rule or cron); not UI-controlled |

### QA-099 — `qa_settings` (lines 272–395)

**Pattern:** 5-tab settings page with forms + read-only tables

| Prototype pattern | Production equivalent |
|---|---|
| `tab` state | URL searchParam `?tab=general`; each tab = separate Server Component |
| Hold reason duration table | Inline editable inputs; bulk save Server Action; RBAC quality_lead only |
| Regulations checkbox matrix | `tenant_settings.quality_regulations text[]` column; Server Action updates array |
| Notifications matrix | `notification_settings(event_key, channel, enabled)` table; one row per cell |
| Retention tab read-only | Server Component only; no form; administrator contact CTA |
| Rules tab DSL table | `rule_registry` table; `batch_release_gate_v1` shown with P2 badge; link to 02-Settings |
| CCP escalation delay field | `tenant_settings.ccp_escalation_delay_minutes int`; 0–3600 range Zod validation |

---

## Known Bugs Cross-Reference (from BACKLOG.md, Quality section)

| BACKLOG ID | Description | Priority | Affects components |
|---|---|---|---|
| BL-QA-01 | Full CAPA workflow (P2 Epic 8G) — NCR detail shows placeholder only | P2 | `ncr_detail` |
| BL-QA-02 | Batch Release gate (QA-010) — P2 placeholder screen | P2 | N/A (P2 screen) |
| BL-QA-03 | CoA templates + generation (QA-011/012) — P2 placeholder | P2 | N/A (P2 screen) |
| BL-QA-04 | In-process / Final inspection screens — P2 placeholders | P2 | `QaInProcessP2`, `QaFinalP2` |
| BL-QA-05 | Full 9-step first-login onboarding overlay (spec §6.3) | Low | N/A |
| BL-QA-06 | Virtual-keypad PIN anti-keylogger (OQ#8) — plain masked input | **Medium** | All 7 e-sign flows |
| BL-QA-07 | Real-time spec search autocomplete for hold-create picker | Low | `hold_create_modal` |
| BL-PROD-05 | `.btn-danger` missing from shared CSS (falls back to primary) | **HIGH** | `hold_release_modal`, `ncr_close_modal`, `delete_with_reason_modal` |

**Note on BL-PROD-05:** The `.btn-danger` / `btn btn-danger` class is used in `HoldReleaseModal` ("🔒 Release Hold"), `NcrCloseModal` ("🔒 Close NCR"), and `DeleteWithReasonModal` ("Delete"). In production these MUST use `shadcn Button variant="destructive"` to ensure correct red styling. Do not map `.btn-danger` to default Button.

---

## P2 Screens (not indexed — below 20-line threshold or placeholder-only)

- `QaInProcessP2` (inspection-screens.jsx lines 300–325) — P2 placeholder; Epic 8F
- `QaFinalP2` (inspection-screens.jsx lines 327–344) — P2 placeholder; Epic 8F
- `QaBatchReleaseP2` (other-screens.jsx lines 398–415) — P2 placeholder; Epic 8F
- `QaCoaP2` (other-screens.jsx lines 417–434) — P2 placeholder; Epic 8J
- `QaScannerRef` (other-screens.jsx lines 232–269) — reference card gallery only; scanner flows live in module 06
- `QaModalGallery` (modals.jsx lines 836–870) — dev gallery only; not production screen

---

*Generated by prototype-labels scan agent — 2026-04-23*
