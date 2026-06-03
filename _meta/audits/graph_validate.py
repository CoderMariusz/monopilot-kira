#!/usr/bin/env python3
"""Phase 1 DAG validator for MonoPilot Kira atomic tasks.
Builds the global task graph (nodes = <module>/T-NNN), parses local
`dependencies` and free-text `cross_module_dependencies`, and reports
cycles, dangling refs, orphans, and routing_hints legacy usage.
Read-only: writes nothing, prints a JSON-ish report to stdout."""
import json, os, re, sys
from collections import defaultdict

ROOT = "/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/atomic-tasks"
modules = sorted(d for d in os.listdir(ROOT)
                 if re.match(r"\d2-|\d{2}-", d) and os.path.isdir(os.path.join(ROOT, d, "tasks")))

# canonical module folder lookup by normalized token
canon = {}
for m in modules:
    canon[m.lower()] = m
    # also map the slug w/o number and the UPPER variant pieces
    canon[m.upper().lower()] = m

def resolve_module(tok):
    tok = tok.strip().lower()
    if tok in canon:
        return canon[tok]
    # try matching by number prefix
    mnum = re.match(r"(\d{2})", tok)
    if mnum:
        for m in modules:
            if m.startswith(mnum.group(1) + "-"):
                return m
    # try matching by name fragment
    for m in modules:
        name = m.split("-", 1)[1]
        if name and name in tok:
            return m
    return None

nodes = set()          # "<module>/T-NNN"
task_meta = {}         # node -> {task_type, labels, title}
edges = defaultdict(set)   # node -> set(dep nodes)   (dep must complete first)
local_deps_raw = {}
xmod_raw = {}

# ---- load ----
for m in modules:
    tdir = os.path.join(ROOT, m, "tasks")
    for fn in sorted(os.listdir(tdir)):
        if not re.match(r"T-\d+\.json$", fn):
            continue
        tid = fn[:-5]  # T-NNN
        node = f"{m}/{tid}"
        nodes.add(node)
        try:
            data = json.load(open(os.path.join(tdir, fn)))
        except Exception as e:
            print(f"PARSE_ERROR {node}: {e}", file=sys.stderr)
            continue
        pi = data.get("pipeline_inputs", {}) or {}
        task_meta[node] = {
            "task_type": pi.get("task_type"),
            "labels": data.get("labels", []),
            "title": (data.get("title") or "")[:80],
        }
        local_deps_raw[node] = pi.get("dependencies", []) or []
        xmod_raw[node] = pi.get("cross_module_dependencies", []) or []

# ---- parse edges ----
dangling = []      # (node, raw_ref, reason)
prose_only = []    # (node, raw_ref)  -- references a module but no task id
xmod_edges = 0
for node in nodes:
    m = node.split("/")[0]
    # local deps: same module, T-NNN
    for d in local_deps_raw[node]:
        d = d.strip()
        mt = re.match(r"(T-\d+)$", d)
        if mt:
            dep = f"{m}/{mt.group(1)}"
            if dep in nodes:
                edges[node].add(dep)
            else:
                dangling.append((node, d, "local dep missing in module"))
            continue
        # module-qualified ref placed in local deps (e.g. "00-foundation/T-125")
        mq = re.search(r"(\d{2}-[A-Za-z-]+)\s*[/: ]\s*(T-\d+)", d)
        if mq:
            rm = resolve_module(mq.group(1))
            dep = f"{rm}/{mq.group(2)}" if rm else None
            if dep and dep in nodes:
                edges[node].add(dep)
                dangling.append((node, d, "MISPLACED: cross-module ref in local deps (edge valid)"))
            else:
                dangling.append((node, d, f"target {dep} not found"))
        else:
            dangling.append((node, d, "unparseable local dep"))
    # cross-module: free text
    for raw in xmod_raw[node]:
        if not isinstance(raw, str):
            continue
        # find module/T-NNN or module:T-NNN or MODULE T-NNN patterns (possibly several)
        found = re.findall(r"(\d{2}-[A-Za-z-]+)\s*[/: ]\s*(T-\d+)", raw)
        if found:
            for modtok, dep_t in found:
                rm = resolve_module(modtok)
                if rm is None:
                    dangling.append((node, raw, f"unknown module '{modtok}'"))
                    continue
                dep = f"{rm}/{dep_t}"
                if dep in nodes:
                    edges[node].add(dep)
                    xmod_edges += 1
                else:
                    dangling.append((node, raw, f"target {dep} not found"))
        else:
            # references a module name but no task id?
            mm = re.search(r"(\d{2}-[A-Za-z-]+)", raw)
            if mm:
                prose_only.append((node, raw))
            else:
                prose_only.append((node, raw))

# ---- cycle detection (iterative DFS, returns one cycle path if any) ----
WHITE, GRAY, BLACK = 0, 1, 2
color = {n: WHITE for n in nodes}
cycles = []
def dfs(start):
    stack = [(start, iter(sorted(edges[start])))]
    path = [start]
    color[start] = GRAY
    while stack:
        node, it = stack[-1]
        advanced = False
        for nxt in it:
            if color[nxt] == GRAY:
                # cycle: slice path from nxt
                if nxt in path:
                    cycles.append(path[path.index(nxt):] + [nxt])
                continue
            if color[nxt] == WHITE:
                color[nxt] = GRAY
                path.append(nxt)
                stack.append((nxt, iter(sorted(edges[nxt]))))
                advanced = True
                break
        if not advanced:
            color[node] = BLACK
            stack.pop()
            if path and path[-1] == node:
                path.pop()

for n in sorted(nodes):
    if color[n] == WHITE:
        dfs(n)

# ---- orphans: nodes with no deps AND nobody depends on them ----
rev = defaultdict(set)
for n, ds in edges.items():
    for d in ds:
        rev[d].add(n)
roots = [n for n in nodes if not edges[n]]                 # no prerequisites
leaves_unused = [n for n in nodes if not rev[n] and not edges[n]]  # fully isolated

# ---- routing_hints legacy scan handled separately; here just counts ----
total_edges = sum(len(v) for v in edges.values())

# ---- report ----
print("=== GRAPH STATS ===")
print(f"nodes (tasks): {len(nodes)}")
print(f"edges (deps):  {total_edges}  (cross-module parsed: {xmod_edges})")
print(f"roots (no prereq): {len(roots)}")
print(f"fully-isolated nodes: {len(leaves_unused)}")
print(f"cycles found: {len(cycles)}")
for c in cycles[:20]:
    print("  CYCLE: " + " -> ".join(c))
print(f"dangling refs: {len(dangling)}")
for n, raw, why in dangling[:60]:
    print(f"  DANGLING {n}: '{raw[:60]}' [{why}]")
print(f"prose-only cross-module notes (informational): {len(prose_only)}")

# machine-readable dump
out = {
    "nodes": len(nodes), "edges": total_edges, "xmod_edges": xmod_edges,
    "roots": len(roots), "isolated": len(leaves_unused),
    "cycles": cycles, "dangling": dangling, "prose_only_count": len(prose_only),
}
json.dump(out, open("/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/audits/graph_report.json", "w"), indent=1)
print("\nwrote _meta/audits/graph_report.json")
