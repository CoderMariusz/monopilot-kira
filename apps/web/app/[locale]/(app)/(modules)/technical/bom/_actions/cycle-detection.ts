/**
 * 03-technical BOM create (T-013) — cycle / self-reference detection (V-TEC-13).
 *
 * Pure, DB-free graph logic so it is unit-testable in isolation. The Server Action
 * resolves the active-BOM component graph for the caller's org under RLS and hands
 * it to `detectCycle` as a plain adjacency map (parent product_code → component
 * product_codes). Adding the new BOM's parent → its component edges must NOT create
 * a cycle reachable back to the parent.
 *
 * - Self-reference (a line component == the parent) is rejected early (a 1-node cycle).
 * - A path parent → … → parent over ACTIVE BOMs is a cycle (DFS).
 */

export type BomGraph = Map<string, Set<string>>;

/** Build an adjacency map from `{ parent, component }` edge rows. */
export function buildGraph(edges: ReadonlyArray<{ parent: string; component: string }>): BomGraph {
  const graph: BomGraph = new Map();
  for (const { parent, component } of edges) {
    if (!graph.has(parent)) graph.set(parent, new Set());
    graph.get(parent)!.add(component);
  }
  return graph;
}

/**
 * Returns true when introducing edges `parent → component` (for each component in
 * `newComponents`) would create a cycle in `existing` (i.e. some component can
 * already reach `parent`), OR when a component equals `parent` (self-reference).
 */
export function detectCycle(
  existing: BomGraph,
  parent: string,
  newComponents: ReadonlyArray<string>,
): boolean {
  for (const component of newComponents) {
    // Self-reference: a 1-node cycle (V-TEC-13 early reject).
    if (component === parent) return true;
    // If `component` can already reach `parent` over active BOMs, the new edge closes a loop.
    if (reaches(existing, component, parent)) return true;
  }
  return false;
}

/** DFS: can `from` reach `target` following edges in `graph`? */
function reaches(graph: BomGraph, from: string, target: string): boolean {
  const stack: string[] = [from];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node === target) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    const next = graph.get(node);
    if (next) for (const n of next) if (!seen.has(n)) stack.push(n);
  }
  return false;
}
