/**
 * CI guard (plan C2 §1.9): multi-write Server Actions must run inside ONE
 * withOrgContext transaction OR be caller-tx services (first arg ctx.client).
 *
 * Pattern follows settings-wiring-contract.test.ts — static AST scan, no live DB.
 */
import { describe, expect, it } from 'vitest';

import {
  formatInventoryTable,
  scanMultiWriteActions,
  type MultiWriteActionEntry,
} from './lib/multi-write-transaction-analyzer';

/** Extend when a deliberate exception is reviewed (should stay empty). */
const ALLOWLIST = new Set<string>();

function key(entry: MultiWriteActionEntry): string {
  return `${entry.file}::${entry.functionName}`;
}

describe('multi-write transaction contract', () => {
  const inventory = scanMultiWriteActions();

  it('inventory is non-empty (sweep ran)', () => {
    expect(inventory.length).toBeGreaterThan(50);
  });

  it('has no multi-write actions without a transaction boundary', () => {
    const violations = inventory.filter(
      (entry) => entry.status === 'violation' && !ALLOWLIST.has(key(entry)),
    );

    if (violations.length > 0) {
      const detail = violations
        .map(
          (v) =>
            `${v.file} → ${v.functionName} (${v.writeCount} writes, withOrgContext=${v.withOrgContextCount})`,
        )
        .join('\n');
      expect.fail(`multi-write without tx:\n${detail}`);
    }

    expect(violations).toEqual([]);
  });

  it('documents inventory snapshot (atomic paths only)', () => {
    const wrapped = inventory.filter((e) => e.status === 'atomic-wrapped').length;
    const callerTx = inventory.filter((e) => e.status === 'atomic-caller-tx').length;
    expect(wrapped + callerTx).toBe(inventory.length);
    // Table is emitted on demand when debugging — keep a smoke sample so the formatter stays wired.
    expect(formatInventoryTable(inventory.slice(0, 3))).toContain('| action |');
  });
});
