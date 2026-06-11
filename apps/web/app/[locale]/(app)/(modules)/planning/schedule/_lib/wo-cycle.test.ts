/**
 * V-PLAN-WO-CYCLE pure validator tests (audit F-C14 / mig 177 promise).
 * Test contract per MON-domain-planning: every wo_dependencies write path must
 * reject a 2-node AND a 3-node cycle — covered here at the validator level.
 */
import { describe, expect, it } from 'vitest';

import { findCycleInvolving, wouldCreateCycle, type WoDependencyEdge } from './wo-cycle';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const D = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const edge = (parentWoId: string, childWoId: string): WoDependencyEdge => ({ parentWoId, childWoId });

describe('wouldCreateCycle (V-PLAN-WO-CYCLE)', () => {
  it('rejects a 2-node cycle: A→B exists, adding B→A closes the loop', () => {
    expect(wouldCreateCycle([edge(A, B)], edge(B, A))).toBe(true);
  });

  it('rejects a 3-node cycle: A→B→C exists, adding C→A closes the loop', () => {
    expect(wouldCreateCycle([edge(A, B), edge(B, C)], edge(C, A))).toBe(true);
  });

  it('rejects a self-loop edge', () => {
    expect(wouldCreateCycle([], edge(A, A))).toBe(true);
  });

  it('accepts a forward edge in a chain (A→B→C, adding A→C)', () => {
    expect(wouldCreateCycle([edge(A, B), edge(B, C)], edge(A, C))).toBe(false);
  });

  it('accepts an edge between disconnected components', () => {
    expect(wouldCreateCycle([edge(A, B), edge(C, D)], edge(B, C))).toBe(false);
  });

  it('accepts a diamond (A→B, A→C, adding B→D and C→D stay acyclic)', () => {
    const edges = [edge(A, B), edge(A, C), edge(B, D)];
    expect(wouldCreateCycle(edges, edge(C, D))).toBe(false);
  });
});

describe('findCycleInvolving (defensive read-side guard)', () => {
  it('returns null for an acyclic chain', () => {
    expect(findCycleInvolving([edge(A, B), edge(B, C)], A)).toBeNull();
  });

  it('returns the loop path when the WO sits on a 2-node cycle', () => {
    const cycle = findCycleInvolving([edge(A, B), edge(B, A)], A);
    expect(cycle).toEqual([A, B, A]);
  });

  it('returns the loop path when the WO sits on a 3-node cycle', () => {
    const cycle = findCycleInvolving([edge(A, B), edge(B, C), edge(C, A)], A);
    expect(cycle).toEqual([A, B, C, A]);
  });

  it('returns null when a cycle exists elsewhere but does not involve the WO', () => {
    // B→C→B is cyclic, but A only feeds INTO it and is not on the loop —
    // termination is the point of this case (visited-set must hold).
    expect(findCycleInvolving([edge(A, B), edge(B, C), edge(C, B)], A)).toBeNull();
  });

  it('returns null for a WO with no edges at all', () => {
    expect(findCycleInvolving([], A)).toBeNull();
  });
});
