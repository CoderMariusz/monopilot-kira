# PROPOSED — create MON-domain-scanner skill (build-readiness gap)

> Status: PROPOSAL (not a task). Build-readiness gap for 06-scanner-p1.

## Why
05-warehouse has a rich `MON-domain-warehouse` skill; **06-scanner-p1 has none**. MON-domain-warehouse documents the 05→scanner *contract* but not the scanner module's own implementation law. Scanner has substantial module-specific concerns not covered by generic MON-t3-ui / Mon-ui:
- PWA in monorepo, `/scanner/*` route-group (NOT responsive desktop — ADR-006), dark slate-900, touch ≥48/64/72/80dp, mobile 390x844 evidence policy.
- 3-method input parity (hardware wedge / @zxing camera / manual), `detectScannerCapabilities()` timing heuristic.
- Auth: username+PIN bcrypt (separate from password), kiosk(60s)/personal(300s) modes, 5-fail lockout, forced rotation, max-1-session.
- Error severity model D9 (block/warn/info/success) + reason_code-on-warn → scanner_audit_log.
- Canonical writes: scanner OWNS scanner_sessions/scanner_audit_log(30d)/scanner_devices/users.scanner_pin_hash; MUST delegate wo_outputs/wo_waste_log to 08, LP ops to 05 (see B4).
- Offline = P2 (detection stub only P1); SSCC-18/QR/DataMatrix = P2.
- API envelope `{success,data,error{code,severity,context}}`, error-code registry (SC_*/SC_LP_*/SC_WO_*…), idempotency `X-Client-Operation-Id`.

## Recommendation
Author `.claude/skills/MON-domain-scanner/SKILL.md` covering the above + cross-links to MON-domain-warehouse (contract), MON-domain-production (output/consume delegation), MON-domain-quality (inspect/NCR/consume gate T-064), MON-foundation-primitives (outbox/withOrgContext), MON-multi-tenant-site (org_id + site_id on sessions/audit). Required reading before any 06 task. Run /kira:skills-overhaul or skill-creator.
