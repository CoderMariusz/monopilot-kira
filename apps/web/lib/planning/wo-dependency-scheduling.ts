/**
 * wo_dependencies scheduling helpers — child (upstream WIP) must finish before
 * parent (downstream FG) starts. Shared by the scheduler solver and any future
 * read-side placement consumers.
 *
 * Edge direction matches the DB: parent_wo_id → child_wo_id (FG depends on WIP).
 */

export type WoSchedulingDependencyEdge = {
  parentWoId: string;
  childWoId: string;
};

export type DependencySchedulingPlan = {
  /** Placement order: every child is listed before its parents. */
  orderedWoIds: string[];
  /** parentWoId → upstream child wo ids that must finish first. */
  childrenByParent: Map<string, string[]>;
  /** WO ids that sit on a cycle in the candidate subgraph. */
  cyclicWoIds: Set<string>;
};

function compareIds(a: string, b: string): number {
  return a.localeCompare(b);
}

/**
 * Topological order with children before parents. Nodes on cycles are excluded
 * from `orderedWoIds` and listed in `cyclicWoIds`.
 */
export function planDependencyConstrainedScheduling(
  woIds: readonly string[],
  edges: readonly WoSchedulingDependencyEdge[],
  compareAvailableIds: (a: string, b: string) => number = compareIds,
): DependencySchedulingPlan {
  const woSet = new Set(woIds);
  const relevantEdges = edges.filter((edge) => woSet.has(edge.parentWoId));

  const childrenByParent = new Map<string, string[]>();
  const parentsOfChild = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const id of woIds) {
    inDegree.set(id, 0);
  }

  for (const edge of relevantEdges) {
    const children = childrenByParent.get(edge.parentWoId) ?? [];
    children.push(edge.childWoId);
    childrenByParent.set(edge.parentWoId, children);

    if (!woSet.has(edge.childWoId)) continue;

    const parents = parentsOfChild.get(edge.childWoId) ?? [];
    parents.push(edge.parentWoId);
    parentsOfChild.set(edge.childWoId, parents);

    inDegree.set(edge.parentWoId, (inDegree.get(edge.parentWoId) ?? 0) + 1);
  }

  const queue = [...woIds]
    .filter((id) => (inDegree.get(id) ?? 0) === 0)
    .sort(compareAvailableIds);
  const orderedWoIds: string[] = [];

  while (queue.length > 0) {
    const node = queue.shift() as string;
    orderedWoIds.push(node);
    for (const parent of parentsOfChild.get(node) ?? []) {
      const next = (inDegree.get(parent) ?? 0) - 1;
      inDegree.set(parent, next);
      if (next === 0) {
        queue.push(parent);
        queue.sort(compareAvailableIds);
      }
    }
  }

  const cyclicWoIds = new Set(woIds.filter((id) => !orderedWoIds.includes(id)));
  return { orderedWoIds, childrenByParent, cyclicWoIds };
}

/** Earliest parent start (ms) from already-placed upstream children. */
export function dependencyEarliestStartMs(
  parentWoId: string,
  childrenByParent: Map<string, string[]>,
  plannedEndByWoId: Map<string, number>,
): number | null {
  const children = childrenByParent.get(parentWoId) ?? [];
  if (children.length === 0) return 0;

  let earliest = 0;
  for (const childId of children) {
    const childEnd = plannedEndByWoId.get(childId);
    if (childEnd === undefined) return null;
    earliest = Math.max(earliest, childEnd);
  }
  return earliest;
}
