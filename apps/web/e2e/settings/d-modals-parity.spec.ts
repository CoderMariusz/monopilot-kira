/**
 * Thin per-group shim for the Wave-6 settings parity harness.
 * Group: GROUP_D_MODALS. See _catalog.ts (routes + literal prototype anchors) and
 * _runner.ts (real screenshot + axe + parity_report.json capture).
 * Runnable only against a live authenticated preview
 * (PLAYWRIGHT_BASE_URL + PLAYWRIGHT_AUTH_STORAGE); otherwise BLOCKED_AUTH skip.
 */
import { GROUP_D_MODALS } from './_catalog';
import { registerParityGroup } from './_runner';

registerParityGroup(GROUP_D_MODALS);
