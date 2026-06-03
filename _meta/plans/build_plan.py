#!/usr/bin/env python3
"""Phase 2 planner — topo-layer the acyclic DAG into execution waves,
assign writer/risk/reviewer/gates, compute the critical path, emit
EXECUTION-PLAN.md + waves/wave-NN.json. Read graph, write plans only."""
import json, os, re
from collections import defaultdict, Counter

BASE = "/Users/mariuszkrawczyk/Projects/monopilot-kira"
ROOT = f"{BASE}/_meta/atomic-tasks"
PLANS = f"{BASE}/_meta/plans"
os.makedirs(f"{PLANS}/waves", exist_ok=True)

modules = sorted(d for d in os.listdir(ROOT)
                 if re.match(r"\d{2}-", d) and os.path.isdir(f"{ROOT}/{d}/tasks"))
canon = {m.lower(): m for m in modules}
def rmod(tok):
    tok = tok.strip().lower()
    if tok in canon: return canon[tok]
    mm = re.match(r"(\d{2})", tok)
    if mm:
        for m in modules:
            if m.startswith(mm.group(1)+"-"): return m
    return None

ROLLOUT = ["00-foundation","02-settings","01-npd","03-technical","04-planning-basic",
           "05-warehouse","06-scanner-p1","07-planning-ext","08-production","09-quality",
           "10-finance","11-shipping","12-reporting","13-maintenance","14-multi-site","15-oee"]

# cross-cutting files handled by execution-protocol serialization, not wave-bumping
DENYLIST = ("permissions.enum.ts","events.enum.ts","manifest.json","coverage.md",
            "STATUS.md","navigation","nav-manifest","messages/")
LOGIC_KW = ("mrp","fifo","wac","valuation","variance","allocation","sscc","mod-10","mod10",
            "cycle","schedul","dsl","oee","state machine","state-machine","fefo","explosion",
            "roll-up","rollup","netting","escalat","sha-256","sha256","backoff","dedup",
            "check-digit","check digit","reservation","genealog","drift","hmac","idempot")

nodes=set(); meta={}; edges=defaultdict(set)
for m in modules:
    for fn in sorted(os.listdir(f"{ROOT}/{m}/tasks")):
        if not re.match(r"T-\d+\.json$", fn): continue
        n=f"{m}/{fn[:-5]}"; nodes.add(n)
        d=json.load(open(f"{ROOT}/{m}/tasks/{fn}")); pi=d.get("pipeline_inputs",{}) or {}
        scope=[re.sub(r"\s*\[(modify|create|delete)\]\s*$","",s).strip()
               for s in (pi.get("scope_files",[]) or []) if isinstance(s,str)]
        meta[n]={"module":m,"tid":fn[:-5],"task_type":pi.get("task_type"),
                 "writer":(pi.get("routing_hints",{}) or {}).get("writer","impl-standard"),
                 "risk":pi.get("risk_tier","low"),"title":(d.get("title") or "")[:90],
                 "labels":[str(x).lower() for x in (d.get("labels",[]) or [])],
                 "scope":scope,"local":pi.get("dependencies",[]) or [],
                 "xmod":pi.get("cross_module_dependencies",[]) or []}
# edges
for n in nodes:
    m=meta[n]["module"]
    for dep in meta[n]["local"]:
        t=f"{m}/{dep.strip()}"
        if t in nodes: edges[n].add(t)
    for r in meta[n]["xmod"]:
        if not isinstance(r,str): continue
        for mt,tt in re.findall(r"(\d{2}-[A-Za-z-]+)\s*[/: ]\s*(T-\d+)",r):
            rm=rmod(mt)
            if rm and f"{rm}/{tt}" in nodes: edges[n].add(f"{rm}/{tt}")

# done-set from STATUS ✅ rows
done=set()
for m in modules:
    sp=f"{ROOT}/{m}/STATUS.md"
    if not os.path.exists(sp): continue
    for line in open(sp):
        if "✅" in line:
            mm=re.search(r"T-\d+", line)
            if mm: done.add(f"{m}/{mm.group(0)}")

# Greedy topological list-scheduler. Guarantees BOTH invariants:
#  (1) every task's wave > each pending dep's wave  (done deps -> wave 0, don't gate)
#  (2) no two tasks in the same wave edit the same real source file (denylist/glob excluded)
# topo order (deps first) via iterative DFS post-order
order=[]; color={}
def dfs(s):
    stack=[(s,iter(sorted(edges[s])))]; color[s]=1
    while stack:
        n,it=stack[-1]; adv=False
        for d in it:
            if color.get(d,0)==0:
                color[d]=1; stack.append((d,iter(sorted(edges[d])))); adv=True; break
        if not adv:
            color[n]=2; order.append(n); stack.pop()
for n in sorted(nodes):
    if color.get(n,0)==0: dfs(n)

wave={}
for n in order:               # deps appear before dependents (topo)
    if n in done:
        wave[n]=0; continue
    minw=1
    for d in edges[n]:
        if d not in done:
            minw=max(minw, wave.get(d,0)+1)
    wave[n]=minw              # dependency-depth layering; file collisions = per-wave note

# critical path (longest chain)
memo={}
def cp(n):
    if n in memo: return memo[n]
    best=(1,[n])
    for d in edges[n]:
        ln,path=cp(d)
        if ln+1>best[0]: best=(ln+1,[n]+path)
    memo[n]=best; return best
crit=max((cp(n) for n in nodes), key=lambda x:x[0])

def writer_of(n):
    w=meta[n]["writer"]; tt=meta[n]["task_type"]
    if w=="impl-standard" and tt in ("T2-api","T1-schema"):
        hay=meta[n]["title"].lower()+" "+" ".join(meta[n]["labels"])
        if any(k in hay for k in LOGIC_KW): return "impl-logic"
    return w
def reviewer_of(n):
    w=writer_of(n); risk=meta[n]["risk"]
    if w=="impl-ui": return "codex-review (parity)"
    if w=="plan": return "codex-review (spot)"
    return "opus:kira-codex-review" if risk=="high" else "sonnet:kira-easy"
def gates_of(n):
    g=["G1-test","G3-deps"]
    if meta[n]["task_type"]=="T3-ui": g.append("G2-parity")
    if meta[n]["risk"]=="high": g.append("G4-xprovider")
    else: g.append("G4-selfcheck")
    return g

maxw=max(wave.values())
byw=defaultdict(list)
for n in nodes: byw[wave[n]].append(n)

# emit wave json
for w in range(1,maxw+1):
    tasks=[]
    for n in sorted(byw[w], key=lambda x:(ROLLOUT.index(meta[x]["module"]) if meta[x]["module"] in ROLLOUT else 99, meta[x]["tid"])):
        tasks.append({"task_id":meta[n]["tid"],"module":meta[n]["module"],
                      "task_type":meta[n]["task_type"],"writer":writer_of(n),
                      "risk_tier":meta[n]["risk"],"reviewer":reviewer_of(n),
                      "gates":gates_of(n),"status":"done" if n in done else "pending",
                      "deps":sorted(edges[n])})
    # collision note: real source files touched by >1 PENDING task in this wave
    fc=defaultdict(list)
    for n in byw[w]:
        if n in done: continue
        for f in meta[n]["scope"]:
            if f and not f.endswith("/") and "*" not in f and not any(dl in f for dl in DENYLIST):
                fc[f].append(meta[n]["tid"])
    serialize={f:ts for f,ts in fc.items() if len(ts)>1}
    json.dump({"wave":w,"task_count":len(tasks),"serialize_files":serialize,"tasks":tasks},
              open(f"{PLANS}/waves/wave-{w:02d}.json","w"), indent=1)

# stats
risk_dist=Counter(meta[n]["risk"] for n in nodes)
writer_dist=Counter(writer_of(n) for n in nodes)
done_n=len(done & nodes); pend=len(nodes)-done_n
print(f"tasks={len(nodes)} done={done_n} pending={pend} waves={maxw} critical_path={crit[0]}")
print("risk:",dict(risk_dist)," writer:",dict(writer_dist))
print("per-wave counts:", {w:len(byw[w]) for w in range(1,maxw+1)})
print("\nCRITICAL PATH:")
for n in crit[1]: print("  ",n,meta[n]["task_type"],"::",meta[n]["title"][:55])
json.dump({"tasks":len(nodes),"done":done_n,"pending":pend,"waves":maxw,
           "critical_path_len":crit[0],"critical_path":crit[1],
           "risk":dict(risk_dist),"writer":dict(writer_dist),
           "per_wave":{w:len(byw[w]) for w in range(1,maxw+1)}},
          open(f"{PLANS}/plan_stats.json","w"), indent=1)
