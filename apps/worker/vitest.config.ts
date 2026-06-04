import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 120000,
    // The GDPR erasure cron is a GLOBAL system sweep: claimNextPendingRequest()
    // selects ANY pending public.gdpr_erasure_requests row (no org filter, run on
    // the BYPASSRLS system-actor pool). Two cron integration suites running in
    // parallel against the same database therefore cross-claim each other's
    // pending rows. Disable cross-file parallelism so these DB-backed suites are
    // isolated and deterministic. Unit suites are fast, so the cost is negligible.
    fileParallelism: false,
  },
});
