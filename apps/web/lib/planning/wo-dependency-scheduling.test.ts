import { describe, expect, it } from 'vitest';

import {
  dependencyEarliestStartMs,
  planDependencyConstrainedScheduling,
  type WoSchedulingDependencyEdge,
} from './wo-dependency-scheduling';

const WIP = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FG = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const WIP2 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function edge(parentWoId: string, childWoId: string): WoSchedulingDependencyEdge {
  return { parentWoId, childWoId };
}

describe('planDependencyConstrainedScheduling', () => {
  it('orders upstream child before downstream parent', () => {
    const plan = planDependencyConstrainedScheduling([FG, WIP], [edge(FG, WIP)]);
    expect(plan.orderedWoIds).toEqual([WIP, FG]);
    expect(plan.cyclicWoIds.size).toBe(0);
    expect(plan.childrenByParent.get(FG)).toEqual([WIP]);
  });

  it('detects cyclic subgraph nodes', () => {
    const plan = planDependencyConstrainedScheduling(
      [FG, WIP, WIP2],
      [edge(FG, WIP), edge(WIP, WIP2), edge(WIP2, FG)],
    );
    expect(plan.cyclicWoIds.size).toBe(3);
    expect(plan.orderedWoIds).toEqual([]);
  });

  it('ignores edges outside the candidate WO set', () => {
    const OTHER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const plan = planDependencyConstrainedScheduling([FG, WIP], [edge(FG, WIP), edge(FG, OTHER)]);
    expect(plan.orderedWoIds).toEqual([WIP, FG]);
    expect(plan.childrenByParent.get(FG)).toEqual([WIP, OTHER]);
  });

  it('keeps parent dependency on upstream child outside the candidate set', () => {
    const IN_PROGRESS_WIP = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const plan = planDependencyConstrainedScheduling([FG], [edge(FG, IN_PROGRESS_WIP)]);
    expect(plan.orderedWoIds).toEqual([FG]);
    expect(plan.childrenByParent.get(FG)).toEqual([IN_PROGRESS_WIP]);
  });

  it('prefers earlier due dates among simultaneously available nodes', () => {
    const LATE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const EARLY = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const compare = (a: string, b: string) => {
      const due = new Map([
        [LATE, 2],
        [EARLY, 1],
        [WIP, 0],
        [FG, 3],
      ]);
      return (due.get(a) ?? 0) - (due.get(b) ?? 0);
    };
    const plan = planDependencyConstrainedScheduling(
      [FG, WIP, LATE, EARLY],
      [edge(FG, WIP)],
      compare,
    );
    expect(plan.orderedWoIds.indexOf(EARLY)).toBeLessThan(plan.orderedWoIds.indexOf(LATE));
    expect(plan.orderedWoIds.indexOf(WIP)).toBeLessThan(plan.orderedWoIds.indexOf(FG));
  });
});

describe('dependencyEarliestStartMs', () => {
  it('returns the latest upstream child end time', () => {
    const childrenByParent = new Map<string, string[]>([[FG, [WIP, WIP2]]]);
    const plannedEndByWoId = new Map<string, number>([
      [WIP, 1_000],
      [WIP2, 2_500],
    ]);
    expect(dependencyEarliestStartMs(FG, childrenByParent, plannedEndByWoId)).toBe(2_500);
  });

  it('returns null when a required upstream child has no planned end', () => {
    expect(
      dependencyEarliestStartMs(FG, new Map([[FG, [WIP]]]), new Map()),
    ).toBeNull();
  });

  it('returns 0 when the parent has no upstream children', () => {
    expect(dependencyEarliestStartMs(FG, new Map(), new Map())).toBe(0);
  });
});
