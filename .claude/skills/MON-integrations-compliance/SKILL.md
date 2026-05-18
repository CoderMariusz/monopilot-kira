---
name: MON-integrations-compliance
description: Use when implementing tasks involving D365 export (R15 anti-corruption), BRCGS POD/retention, CFR 21 Part 11 e-signature, GS1 SSCC-18 labels, or GDPR registry/exports. Regulatory hard constraints.
version: 1.0.0
model: opus
---

# MON-integrations-compliance — Regulatory & Integration Playbook

**Purpose:** implementation playbook for monopilot-kira tasks that touch external integrations (D365) or regulatory artifacts (BRCGS Issue 9, CFR 21 Part 11, GS1 SSCC-18, GDPR). These domains have **non-negotiable hard constraints** — get them wrong and you fail an audit, leak PII, or corrupt the system-of-record split with D365.

**Triggering signals** (any one of these = invoke this skill):
- Task touches `apps/web/app/.../d365/*` or `packages/*/d365/*` or any outbox event consumer wired to D365
- Task involves POD, BOL, packing list, shipment audit trail, HACCP/CCP log, calibration record, NCR
- Task involves an e-signature flow (NCR close, LOTO sign-off, calibration sign-off, BOL signing, recipe approval, deviation closure)
- Task involves SSCC-18 generation, GS1 prefix, label printing for shipping
- Task adds a new PII column, builds an SAR/erasure flow, or schedules retention enforcement

**Required reading (in order):**
1. `_foundation/contracts/d365-posture.md` — canonical D365 posture (R15 ancestor, export-only, allowed/forbidden uses, DLQ shape)
2. `_meta/audits/2026-05-14-fixer-F17-shipping-cleanup.md` — SSCC + BRCGS POD red lines as applied to 11-shipping tasks
3. `_meta/audits/2026-05-14-fixer-F13-finance-cleanup.md` — D365 export-only red lines as applied to 10-finance tasks
4. `_meta/audits/2026-05-14-fixer-F19-maintenance-cleanup.md` — e-sign (T-124) and outbox (T-112) wiring in 13-maintenance
5. `_meta/specs/event-naming-convention.md` — aggregate prefixes + ISA-95 dot format
6. `_foundation/contracts/gdpr.md` if/when present (Phase E contract; may not exist yet — see §GDPR below for the contract-T-113/T-114 shape)
7. `_foundation/contracts/backup-policy.md` if/when present (retention enforcement for regulated tables)
8. Sample tasks: `_meta/atomic-tasks/10-finance/tasks/T-014.json`, `_meta/atomic-tasks/11-shipping/tasks/T-020.json`, `_meta/atomic-tasks/13-maintenance/tasks/T-004.json`

---

## D365 ERP integration (R15 anti-corruption adapter)

**Direction: EXPORT-ONLY.** monopilot-kira is the system-of-record for production, quality, shipping, and maintenance data. D365 owns financial postings and customer master. The R15 anti-corruption adapter pattern keeps these worlds isolated.

### HARD RULE — never mutate D365-owned fields locally
D365-owned fields that MUST NOT be written by monopilot-kira code paths:
- `factory_release_state` (D365 decides release; we mirror, never set)
- Customer billing address (D365 customer master)
- GL account chart-of-accounts entries (D365 financials)
- Item master fields populated from a D365 pull job (we treat as advisory; on conflict, see d365-posture.md §5.2 — Monopilot wins for production-side state but never overwrites the D365-supplied financial/master fields back into D365)

The R15 adapter excludes these fields from its outbound payload mapper and rejects any attempt to include them.

### Stage 5 dispatcher pattern
```
outbox_events (row written in same Server Action txn)
    → dispatcher worker picks up rows where dispatched_at IS NULL
    → R15 adapter transforms row.payload → D365 OData/REST payload
    → POST to D365 (with idempotency key = aggregate_id + event_type + sequence)
    → on 2xx: UPDATE outbox_events SET dispatched_at = now()
    → on transient 5xx / timeout / rate limit: exponential backoff per d365-posture.md §6.4 (mirrors T-008)
    → on permanent 4xx (auth, schema mismatch): write DLQ row + alert operator (NO retry)
```

### Failure mode — DLQ, not silent retry
- D365 has its own idempotency keys; blind retry is dangerous (double-posts).
- Permanent errors (4xx auth/config/schema) route directly to DLQ; operator must intervene.
- Transient errors (5xx, timeout, 429) follow the T-008 exponential backoff (1s, 2s, 4s, 8s, 16s, 32s, max N attempts). After max → DLQ.
- DLQ row shape: see d365-posture.md §6.2 — `org_id`, `job_type`, `sub_capability`, `error_class`, `error_message`, `payload_ref`, `failed_at`, `retry_count`, `alert_sent`.

### Capability gating
Every push sub-capability defaults to `false`. An `org_id` without an explicit `push_*` opt-in MUST NOT have any data leave the platform. The dispatcher reads the capability registry on every dispatch tick.

### Canonical risk red-line template (paste into `risk_red_lines` of any D365 task)
```
D365 integration is strictly export-only per R15 anti-corruption contract
(_foundation/contracts/d365-posture.md §3, §7) — MUST NOT mutate D365-owned
fields (factory_release_state, customer billing addr, GL chart) locally.
Any push sub-capability must be gated by the 02-SETTINGS capability registry
(default false). Permanent errors route to DLQ + operator alert; never silent retry.
```

---

## BRCGS Issue 9 compliance

monopilot-kira targets BRCGS Issue 9 (Food Safety standard). The most concrete obligations land on shipping, quality, and maintenance.

### 7-year retention (BRCGS Issue 9 §3.5 / §14.4)
Records that MUST be retained for 7 years:
- Shipping POD (proof of delivery), BOL (bill of lading), packing list
- Non-conformance records (NCR), CAPA records, deviation logs
- HACCP plan revisions, CCP monitoring logs, swab/environmental results
- Calibration records, sanitation records, allergen-changeover records
- All audit-trail rows referencing the above

**Canonical risk red-line (paste verbatim):**
```
Records retained 7 years per BRCGS Issue 9 §3.5 / §14.4 — DELETE / TRUNCATE
is forbidden on this table. Retention enforcement is policy-driven (see
_foundation/contracts/backup-policy.md when present); rows older than 7y
may be archived but never purged before the 7y boundary.
```

### POD hash (immutable evidence)
POD records carry a SHA-256 hash over canonical fields. Hash inputs are deterministic and ordered:
```
sha256(delivery_time_iso || "\n" ||
       signer_name || "\n" ||
       signer_role || "\n" ||
       photo_hash || "\n" ||
       gps_lat || "\n" || gps_lon || "\n" ||
       bol_id || "\n" ||
       sscc_list_joined_sorted)
```
- Compute server-side only (never trust client). Store `pod_hash` column + the source fields used.
- Hash MUST be re-verifiable from row contents (regression test required).
- Reference: F17 audit, "BRCGS POD markers" category (10 tasks: T-010, T-018, T-020, T-021, T-023, T-024, T-025, T-031 in 11-shipping).

### Immutable audit trail
- Append-only tables: `audit_log`, `pod_records`, `bol_signatures`, `ccp_log`, `calibration_log`, `e_sign_records`.
- No UPDATE, no DELETE policy at the DB layer (RLS + table grant locks down to INSERT/SELECT only).
- The 09-QUALITY T-064 consume-gate (`holdsGuard`) must be called by every quality-hold consumer (see F17 Category 2 — 13 tasks needed this dep).

### Traceability (forward + backward LP)
- Given any License Plate (LP) ID, the system must traverse:
  - Backward → source LPs (ingredients, sub-assemblies, batch)
  - Forward → destination LPs (shipped pallets, customer deliveries)
- Single traversal must complete in seconds (target: <5s for a 5-hop chain).
- This is `lp.*` event-driven (`lp.received`, `lp.moved`); see event naming registry.

---

## CFR 21 Part 11 e-signature (uses T-124)

CFR 21 Part 11 governs electronic records and electronic signatures for FDA-regulated environments. monopilot-kira applies it pragmatically to BRCGS-adjacent flows and to recipe/quality approvals.

### Foundation primitive
All e-signature flows route through the `@monopilot/e-sign` foundation package (task T-124, see [[MON-foundation-primitives]]). NEVER roll a custom e-sign at the module layer.

### When required (and which mode)
| Flow | Mode | Reason |
|---|---|---|
| NCR close | `signEvent` | Single QA approver per BRCGS workflow |
| Deviation close | `signEvent` | Single approver |
| BOL release / shipment sign-off | `signEvent` | Single shipping clerk |
| LOTO sign-off (apply + clear) | `dualSign` | Two independent technicians (FDA + BRCGS dual sign-off) |
| Calibration sign-off | `dualSign` | Calibrator + verifier (per BRCGS metrology rule) |
| Recipe approval | `dualSign` | NPD + QA dual sign-off |
| Standard cost approval (finance) | `signEvent` | Finance owner |

Reference: F19 audit Category 3 — 8 tasks in 13-maintenance gained T-124 dep (T-001, T-004, T-006, T-007, T-009, T-012, T-013, T-028).

### Signature record shape (immutable)
Every e-sign produces one row in `e_sign_records`:
```
{
  id,                    -- uuid v7
  org_id,
  subject_id,            -- the entity being signed (ncr_id, loto_id, ...)
  subject_type,          -- 'ncr' | 'loto' | 'calibration' | 'bol' | 'recipe' | 'std_cost' | 'deviation'
  user_id,               -- signer (auth.users.id)
  user_id_2,             -- second signer for dualSign; NULL for signEvent
  timestamp,             -- server-side now() at signature commit
  reason,                -- free-text reason / meaning of signature
  replay_nonce,          -- single-use; rejected on second submission
  signature_hash,        -- sha256(subject_id || user_id || ts || reason || nonce)
  retention_class        -- 'security' for 7y retention
}
```

### Password verification
- The signer's password is verified through Supabase auth (`signInWithPassword` against the current session's email, or a re-auth endpoint).
- Password is NEVER stored, hashed locally, or transmitted to any non-Supabase service.
- See [[MON-foundation-primitives]] T-124 for the canonical wrapper.

### Ordering rule (load-bearing)
Always issue the e-sign **BEFORE** the state transition, in the **SAME Server Action transaction**:
```ts
await db.transaction(async (tx) => {
  const sig = await signEvent(tx, { subject_id, subject_type, user_id, reason, nonce })
  if (!sig.ok) throw new Error('e-sign failed')
  await tx.update(ncr).set({ status: 'closed' }).where(...)
  await tx.insert(outbox_events).values({ event_type: 'quality.ncr.closed', ... })
})
```
If the e-sign fails, the whole transaction rolls back — no orphan state changes, no orphan audit rows.

---

## GS1 SSCC-18 labels (shipping)

The Serial Shipping Container Code (SSCC) identifies a logistics unit (pallet, case, container). monopilot-kira generates SSCCs for outbound shipments.

### Format
SSCC-18 = 18 digits structured as:
```
[ Extension digit (1) ] [ GS1 Company Prefix (7–10) ] [ Serial reference (7–10) ] [ Check digit (1) ]
```
Total = 18 digits. Extension digit is the assignment-authority allocation (typically `0`–`9`); GS1 Company Prefix is org-issued; serial is org-controlled; check digit is computed.

### Check digit — server-side mod-10 (NEVER trust client)
GS1 mod-10 algorithm over the first 17 digits:
1. From right to left (across the first 17), multiply each digit alternately by 3 and 1 (rightmost ×3).
2. Sum the products.
3. Check digit = (10 − (sum mod 10)) mod 10.

Pseudocode:
```ts
function gs1Mod10(seventeenDigits: string): number {
  let sum = 0
  for (let i = 0; i < 17; i++) {
    const d = Number(seventeenDigits[16 - i])
    sum += d * (i % 2 === 0 ? 3 : 1)
  }
  return (10 - (sum % 10)) % 10
}
```

### GS1 Company Prefix sourcing
- Stored on `organizations.gs1_company_prefix` (02-settings module).
- NEVER hardcode in env config, code constants, or client config. Always read from the `organizations` table at SSCC generation time.
- Reference: F17 audit Category 4c — 6 SSCC tasks (T-020, T-021, T-022, T-028, T-031, T-032) all required this fix.

### Carrier mapping
- The SSCC is the canonical logistics-unit ID. Carriers map their tracking IDs to our SSCC, not the reverse.
- Never overwrite an SSCC after generation. SSCCs are immutable; if a label needs reprinting, regenerate from the stored record (same SSCC), do not allocate a new one.

### Required test
Every SSCC generator MUST ship with a fixture containing at least one known-good 18-digit SSCC and verify:
- `gs1Mod10(known.slice(0,17)) === Number(known[17])`
- Round-trip: generate → check digit verify → re-parse passes.

---

## GDPR registry + dispatcher (T-113 / T-114)

monopilot-kira processes PII (operator names, signer identities, contact data on shipments, calibration technician records). GDPR demands a registry of all PII columns plus a dispatcher that can execute Subject Access Requests (SAR) and erasure within the legal window.

### Registry contract (T-113)
- Source: `_foundation/contracts/gdpr.md` (Phase E contract — create if absent; register every PII column there in the SAME PR as the migration that adds the column).
- Registry row shape (one per PII column):
```yaml
- table: e_sign_records
  column: user_id
  category: PII                # PII | sensitive | financial
  legal_basis: legitimate_interest  # consent | contract | legal_obligation | legitimate_interest
  retention: security_7y       # references backup-policy.md class
  erasure_strategy: keep_audit_fk_anonymize_email
```
- Categories:
  - **PII** — directly identifies a natural person (name, email, phone, employee_id)
  - **sensitive** — special-category GDPR Art. 9 (health, biometric); none expected in monopilot-kira P1, flag for review if introduced
  - **financial** — financial identifier (bank, VAT, payment); often retained under tax law overriding GDPR erasure window

### Dispatcher (T-114, scheduled)
- Cron worker reads `gdpr_requests` queue (SAR | erasure) and dispatches to the registry-driven handler.
- **SAR**: registry → for each row in each table, project the PII columns scoped by subject (user_id / employee_id) → emit consolidated JSON to a signed download URL (24h TTL).
- **Erasure**: registry → for each PII column with `erasure_strategy = anonymize`, SET column = NULL or a deterministic pseudonym; KEEP foreign keys to audit rows (CFR 21 + BRCGS demand audit-trail integrity).
- Erasure on `e_sign_records.user_id` MUST follow the `keep_audit_fk_anonymize_email` strategy: keep the FK so the audit trail still resolves, replace the displayed email/name with `[anonymized]`. The audit trail's integrity outweighs the erasure right where law permits (CFR 21 Part 11, BRCGS Issue 9 §3.5).

### Scheduled retention enforcement (T-114 cron)
- Daily job consults the registry + backup-policy.md and:
  - Archives rows past their retention class (e.g. non-regulated user analytics past 13 months).
  - NEVER purges rows tagged `retention_class = security_7y` until 7y elapsed.
- Logs every action to `gdpr_dispatcher_log` (append-only).

### Canonical risk red-line (paste verbatim)
```
Any new PII column MUST be added to the GDPR registry
(_foundation/contracts/gdpr.md) in the same PR as the migration (contract T-113).
Erasure strategy MUST preserve audit-trail foreign keys
(CFR 21 Part 11 + BRCGS Issue 9 §3.5 override the bare erasure right).
```

---

## Event naming convention (recap)

Format: `<aggregate>.<verb_phrase>` — lowercase, snake_case verbs, past-tense, ≤64 chars. See `_meta/specs/event-naming-convention.md` for the full spec and aggregate registry.

Examples relevant to this skill:
- `shipping.bol.signed` — BOL e-sign committed (audit-emit)
- `shipping.pod.captured` — POD hash written
- `shipping.shipment.epcis_commissioning` — SSCC commissioned for a logistics unit
- `quality.calibration.approved` — calibration dualSign committed
- `quality.ncr.closed` — NCR signEvent committed
- `quality.ccp_out_of_spec` — CCP excursion logged
- `finance.standard_cost.approved` — std cost signEvent committed
- `mnt.loto.applied` / `mnt.loto.cleared` — LOTO dualSign committed
- `org.gdpr_request.received` — GDPR SAR/erasure queued

Reserved prefixes — do not invent: `fa.*`, `brief.*`, `org.*`, `user.*`, `role.*`, `lp.*`, `wo.*`, `audit.*`, `quality.*`, `shipment.*`. New prefixes MUST land in `lib/outbox/events.enum.ts` + the spec in the same PR.

See [[MON-foundation-primitives]] for the events.enum.ts source of truth.

---

## Acceptance criteria templates

Use these as a starting point and adapt per task. AC count cap is 4 (atomicity gate); use AND-fusion to keep the cap.

### D365 export task
```
AC1: Given an outbox row with event_type matching the dispatcher filter AND
     org_id has push_<sub_capability>=true, when the dispatcher tick runs,
     then it POSTs to D365 with idempotency_key = aggregate_id + event_type +
     sequence AND on 2xx sets dispatched_at = now().
AC2: Given the dispatcher returns a discriminated result { ok: true } | { ok: false, class: 'transient'|'permanent' },
     when class='permanent', then a DLQ row is written with org_id + error_class + alert_sent=true
     AND no retry is scheduled.
AC3: Given the payload would include a D365-owned field (factory_release_state, customer billing addr, GL chart),
     then the R15 mapper REJECTS the payload at build time (unit test asserts rejection).
AC4: Risk red line included verbatim in risk_red_lines: "D365 integration is strictly export-only per R15 anti-corruption contract…".
```

### BRCGS-affected task
```
AC1: Given a write to <regulated_table> succeeds, then the row is immutable
     (UPDATE/DELETE blocked by RLS + table grant) AND audit_log row is appended.
AC2: Given the POD/BOL/etc record is queried, then pod_hash recomputed from
     canonical fields equals the stored pod_hash (hash verification round-trip).
AC3: Given a retention sweep runs with rows aged <7y, then no row from
     <regulated_table> is purged (assertion on row count pre/post).
AC4: Risk red line included verbatim: "Records retained 7 years per BRCGS Issue 9 §3.5…".
```

### E-sign task
```
AC1: Given a state transition that requires e-sign, when the Server Action runs,
     then signEvent/dualSign is invoked BEFORE the state mutation in the SAME
     transaction AND on failure the transaction rolls back (no state change, no outbox row).
AC2: Given dualSign required, when user_id_2 = user_id, then the action FAILS
     with INDEPENDENT_SIGNER_REQUIRED (test asserts).
AC3: Given a signature commits, then an e_sign_records row is written with
     replay_nonce, signature_hash, retention_class='security' AND the row is
     immutable (UPDATE blocked).
AC4: Given a replay attack reuses the same nonce, then the second call is rejected.
```

### SSCC task
```
AC1: Given gs1Mod10(known17) is called with a known-good fixture, then it
     returns the known check digit (mod-10 unit test).
AC2: Given organizations.gs1_company_prefix is set for org X, when a new SSCC
     is generated for org X, then the prefix segment of the SSCC matches the
     org's stored prefix (NOT an env constant).
AC3: Given an SSCC is generated, then it is 18 digits AND the recomputed check
     digit equals digit[17] (round-trip verification).
AC4: Given a re-print is requested for an existing logistics_unit, then the
     SAME SSCC is returned (no new allocation; immutable).
```

### GDPR task
```
AC1: Given a migration introduces a new PII column, when the migration PR is
     submitted, then _foundation/contracts/gdpr.md has a registry entry for the
     new (table, column, category, retention, erasure_strategy) (CI assertion).
AC2: Given an SAR for subject S, when the dispatcher runs, then the export JSON
     contains every PII column tagged for subject S across all registered tables
     (round-trip test with a seeded fixture).
AC3: Given an erasure request for subject S, then PII columns are nulled/pseudonymized
     per erasure_strategy AND audit-trail foreign keys to S remain resolvable.
AC4: Risk red line included verbatim: "Any new PII column MUST be added to the GDPR registry…".
```

---

## Hard rules table (one-glance)

| # | Rule | Source |
|---|---|---|
| 1 | D365 is **EXPORT-ONLY**; never mutate D365-owned fields locally | d365-posture.md §3, §7; F13 audit |
| 2 | Every D365 push sub-capability defaults to `false`; requires explicit per-`org_id` opt-in | d365-posture.md §2.2 |
| 3 | D365 permanent errors → DLQ + alert; never silent retry | d365-posture.md §6.1 |
| 4 | BRCGS-regulated records retained 7 years; no DELETE before boundary | BRCGS Issue 9 §3.5; F17 audit |
| 5 | POD hash = SHA-256 over canonical fields; recomputable from row | F17 audit Category 3 |
| 6 | Audit/POD/e-sign tables are append-only (no UPDATE/DELETE) | BRCGS Issue 9; CFR 21 Part 11 |
| 7 | All e-sign flows route through `@monopilot/e-sign` T-124; never custom | F19 audit Category 3 |
| 8 | LOTO + calibration + recipe approval use `dualSign` (two independent signers) | F19 audit; BRCGS metrology |
| 9 | E-sign commits BEFORE state transition in the SAME txn | CFR 21 Part 11 |
| 10 | E-sign password verified via Supabase auth; never stored locally | T-124 spec |
| 11 | SSCC check digit computed server-side with GS1 mod-10 | GS1 standard |
| 12 | GS1 Company Prefix read from `organizations.gs1_company_prefix`, never from env/code | F17 audit Category 4c |
| 13 | SSCCs are immutable; reprints reuse the same code | GS1 standard |
| 14 | Every new PII column registered in `_foundation/contracts/gdpr.md` in the same PR as the migration | T-113 contract |
| 15 | GDPR erasure preserves audit-trail FKs (anonymize, do not delete the audit row) | CFR 21 Part 11 + BRCGS §3.5 override |
| 16 | Event type lowercase, past-tense, `<aggregate>.<verb_phrase>`, ≤64 chars | event-naming-convention.md |
| 17 | New aggregate prefixes land in `lib/outbox/events.enum.ts` + spec in the same PR | event-naming-convention.md §Format rules |

---

## Cross-links

- [[MON-foundation-primitives]] — T-112 outbox, T-113 GDPR registry, T-114 GDPR dispatcher, T-124 e-sign
- [[MON-multi-tenant-site]] — org_id scoping for D365 capability registry and GDPR exports
- [[MON-domain-shipping]] — SSCC, BOL, POD, EPCIS commissioning specifics
- [[MON-domain-finance]] — D365 finance push paths (production confirmation, std cost approval)
- [[MON-domain-quality]] — NCR close, CCP log, calibration sign-off, holdsGuard (T-064)
- [[MON-domain-maintenance]] — LOTO dualSign, calibration dualSign, MWO outbox events
- `_foundation/contracts/d365-posture.md` — D365 posture canonical contract
- `_foundation/contracts/gdpr.md` (Phase E) — PII registry source of truth
- `_meta/specs/event-naming-convention.md` — event aggregate prefix registry
- `_meta/audits/2026-05-14-fixer-F17-shipping-cleanup.md` — applied SSCC + BRCGS rules
- `_meta/audits/2026-05-14-fixer-F13-finance-cleanup.md` — applied D365 export-only rules
- `_meta/audits/2026-05-14-fixer-F19-maintenance-cleanup.md` — applied e-sign + outbox wiring
