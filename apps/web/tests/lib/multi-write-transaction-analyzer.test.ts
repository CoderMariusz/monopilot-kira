import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { analyzeFile } from './multi-write-transaction-analyzer';

const APPS_WEB_ROOT = path.resolve(__dirname, '../..');
const FIXTURE = path.join(
  APPS_WEB_ROOT,
  'tests/fixtures/_actions/multi-write-violation-helper.ts',
);

describe('multi-write-transaction-analyzer', () => {
  it('flags an unwrapped action with direct INSERT + same-file helper audit as violation', () => {
    const entries = analyzeFile(APPS_WEB_ROOT, FIXTURE, { force: true });
    const hit = entries.find((e) => e.functionName === 'violatingHelperWriteAction');
    expect(hit).toBeDefined();
    expect(hit?.writeCount).toBeGreaterThanOrEqual(2);
    expect(hit?.status).toBe('violation');
  });
});
