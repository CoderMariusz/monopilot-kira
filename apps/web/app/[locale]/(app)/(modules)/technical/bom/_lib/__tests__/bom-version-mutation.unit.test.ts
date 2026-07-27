/**
 * @vitest-environment node
 * BOM version mutation matrix — mirrors server guards for top-level detail CTAs.
 */
import { describe, expect, it } from 'vitest';

// This file lives in _lib/__tests__, so the module under test is one level up.
// It used to import '../_lib/bom-version-mutation' → _lib/_lib/… which does not
// exist, and the whole suite failed to load instead of testing anything.
import {
  bomVersionMutationBlockedKey,
  isBomVersionMutationAllowed,
} from '../bom-version-mutation';

describe('isBomVersionMutationAllowed', () => {
  it('draft keeps add, save, and delete available', () => {
    expect(isBomVersionMutationAllowed('draft', 'addComponent')).toBe(true);
    expect(isBomVersionMutationAllowed('draft', 'saveVersion')).toBe(true);
    expect(isBomVersionMutationAllowed('draft', 'deleteVersion')).toBe(true);
  });

  it('in_review allows add and save but not delete', () => {
    expect(isBomVersionMutationAllowed('in_review', 'addComponent')).toBe(true);
    expect(isBomVersionMutationAllowed('in_review', 'saveVersion')).toBe(true);
    expect(isBomVersionMutationAllowed('in_review', 'deleteVersion')).toBe(false);
  });

  it('active and technical_approved allow add/save fork paths', () => {
    expect(isBomVersionMutationAllowed('active', 'addComponent')).toBe(true);
    expect(isBomVersionMutationAllowed('active', 'saveVersion')).toBe(true);
    expect(isBomVersionMutationAllowed('active', 'deleteVersion')).toBe(false);
    expect(isBomVersionMutationAllowed('technical_approved', 'addComponent')).toBe(true);
    expect(isBomVersionMutationAllowed('technical_approved', 'saveVersion')).toBe(true);
    expect(isBomVersionMutationAllowed('technical_approved', 'deleteVersion')).toBe(false);
  });

  it('superseded and archived block all three mutations', () => {
    for (const status of ['superseded', 'archived'] as const) {
      expect(isBomVersionMutationAllowed(status, 'addComponent')).toBe(false);
      expect(isBomVersionMutationAllowed(status, 'saveVersion')).toBe(false);
      expect(isBomVersionMutationAllowed(status, 'deleteVersion')).toBe(false);
    }
  });
});

describe('bomVersionMutationBlockedKey', () => {
  it('maps terminal statuses to specific blocked keys', () => {
    expect(bomVersionMutationBlockedKey('archived', 'addComponent')).toBe('addComponentBlockedArchived');
    expect(bomVersionMutationBlockedKey('superseded', 'saveVersion')).toBe('saveVersionBlockedSuperseded');
    expect(bomVersionMutationBlockedKey('active', 'deleteVersion')).toBe('deleteStatusBlocked');
  });
});

// ── Delete is conditional, not "draft ⇒ yes" ─────────────────────────────────
// deleteBomVersion refuses a draft with `only_version` (versionCount <= 1) and with
// `snapshot_referenced` (snapshotCount > 0). The matrix promised Delete regardless,
// so the button was enabled for operations the server then rejected.
describe('deleteVersion mirrors the server-side count guards', () => {
  const deletable = { versionCount: 3, snapshotCount: 0 };

  it('allows deleting a draft that has siblings and no snapshots', () => {
    expect(isBomVersionMutationAllowed('draft', 'deleteVersion', deletable)).toBe(true);
    expect(bomVersionMutationBlockedKey('draft', 'deleteVersion', deletable)).toBeNull();
  });

  it('blocks the ONLY version with the only-version reason, not the status reason', () => {
    const counts = { versionCount: 1, snapshotCount: 0 };
    expect(isBomVersionMutationAllowed('draft', 'deleteVersion', counts)).toBe(false);
    expect(bomVersionMutationBlockedKey('draft', 'deleteVersion', counts)).toBe('deleteOnlyVersion');
  });

  it('blocks a snapshot-referenced draft with the snapshot reason', () => {
    const counts = { versionCount: 4, snapshotCount: 1 };
    expect(isBomVersionMutationAllowed('draft', 'deleteVersion', counts)).toBe(false);
    expect(bomVersionMutationBlockedKey('draft', 'deleteVersion', counts)).toBe('deleteSnapshotBlocked');
  });

  it('reports only_version first when both conditions block, like the server does', () => {
    const counts = { versionCount: 1, snapshotCount: 9 };
    expect(bomVersionMutationBlockedKey('draft', 'deleteVersion', counts)).toBe('deleteOnlyVersion');
  });

  it('keeps the status reason for non-draft versions whatever the counts say', () => {
    expect(isBomVersionMutationAllowed('active', 'deleteVersion', deletable)).toBe(false);
    expect(bomVersionMutationBlockedKey('active', 'deleteVersion', deletable)).toBe('deleteStatusBlocked');
    expect(bomVersionMutationBlockedKey('in_review', 'deleteVersion', deletable)).toBe('deleteStatusBlocked');
  });

  it('leaves add/save untouched by the delete counts (no new over-blocking)', () => {
    const worst = { versionCount: 1, snapshotCount: 9 };
    expect(isBomVersionMutationAllowed('draft', 'addComponent', worst)).toBe(true);
    expect(isBomVersionMutationAllowed('draft', 'saveVersion', worst)).toBe(true);
    expect(isBomVersionMutationAllowed('active', 'addComponent', worst)).toBe(true);
    expect(isBomVersionMutationAllowed('active', 'saveVersion', worst)).toBe(true);
  });
});
