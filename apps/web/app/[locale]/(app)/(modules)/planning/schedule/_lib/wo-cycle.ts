/**
 * V-PLAN-WO-CYCLE — pure acyclicity validators for the wo_dependencies DAG.
 *
 * Migration 177 explicitly delegates cycle prevention to the service layer:
 *   "Cycle prevention for wo_dependencies is SERVICE-LAYER (DFS / topological
 *    sort, V-PLAN-WO-CYCLE, T-020). The DB only enforces UNIQUE(org_id,
 *    parent_wo_id, child_wo_id)." — 177-planning-schedule-outputs-dag.sql:16-17
 * That validator was promised and never built (audit F-C14). This module is the
 * canonical pure implementation; every wo_dependencies WRITE path must call
 * `wouldCreateCycle` before insert/update, and read-side consumers (e.g. the
 * schedule board's rescheduleWorkOrder) call `findCycleInvolving` as a
 * defensive guard against pre-existing corrupt graphs (a cycle = silent
 * infinite scheduling loop at solver time, per MON-domain-planning).
 *
 * Pure functions only — no 'use server', no I/O. Edges are directed
 * parent → child (predecessor → successor).
 */

export type WoDependencyEdge = {
  parentWoId: string;
  childWoId: string;
};

function buildAdjacency(edges: readonly WoDependencyEdge[]): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const children = adjacency.get(edge.parentWoId);
    if (children) children.push(edge.childWoId);
    else adjacency.set(edge.parentWoId, [edge.childWoId]);
  }
  return adjacency;
}

/**
 * True when `target` is reachable from `from` following parent→child edges.
 * Iterative DFS — wo_dependencies graphs are small (per-org plan horizon) but
 * recursion depth must never be an attack surface.
 */
function reaches(adjacency: Map<string, string[]>, from: string, target: string): boolean {
  const stack: string[] = [from];
  const visited = new Set<string>();
  while (stack.length > 0) {
    const node = stack.pop() as string;
    if (node === target) return true;
    if (visited.has(node)) continue;
    visited.add(node);
    const children = adjacency.get(node);
    if (children) stack.push(...children);
  }
  return false;
}

/**
 * V-PLAN-WO-CYCLE core check: would adding `candidate` (parent → child) close
 * a cycle in the existing edge set?
 *
 * A new edge parent→child closes a cycle iff parent is already reachable from
 * child. Self-loops are always cycles (the DB also rejects them via
 * wo_dependencies_no_self_loop_check — this keeps the validator total).
 */
export function wouldCreateCycle(
  edges: readonly WoDependencyEdge[],
  candidate: WoDependencyEdge,
): boolean {
  if (candidate.parentWoId === candidate.childWoId) return true;
  const adjacency = buildAdjacency(edges);
  return reaches(adjacency, candidate.childWoId, candidate.parentWoId);
}

/**
 * Defensive read-side guard: if the EXISTING graph already contains a cycle
 * that `woId` sits on, return that cycle as a node path
 * `[woId, ..., woId]`; otherwise null.
 *
 * `woId` is on a cycle iff it is reachable from itself. DFS keeps the current
 * path so the offending loop can be reported verbatim.
 */
export function findCycleInvolving(
  edges: readonly WoDependencyEdge[],
  woId: string,
): string[] | null {
  const adjacency = buildAdjacency(edges);
  // Each stack frame: the node and the path that led to it.
  const stack: Array<{ node: string; path: string[] }> = [{ node: woId, path: [woId] }];
  const expanded = new Set<string>();
  while (stack.length > 0) {
    const frame = stack.pop() as { node: string; path: string[] };
    const children = adjacency.get(frame.node);
    if (!children) continue;
    for (const child of children) {
      if (child === woId) return [...frame.path, woId];
      if (expanded.has(child)) continue;
      expanded.add(child);
      stack.push({ node: child, path: [...frame.path, child] });
    }
  }
  return null;
}
