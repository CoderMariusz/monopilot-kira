#!/usr/bin/env python3
"""Generate EXECUTION-PLAN.md from wave-NN.json + plan_stats.json, run sanity checks."""
import json, os, re
from collections import Counter, defaultdict
BASE="/Users/mariuszkrawczyk/Projects/monopilot-kira"; PLANS=f"{BASE}/_meta/plans"
S=json.load(open(f"{PLANS}/plan_stats.json"))
waves={}
for w in range(1,S['waves']+1):
    p=f"{PLANS}/waves/wave-{w:02d}.json"
    if os.path.exists(p): waves[w]=json.load(open(p))
ROLLOUT=["00-foundation","02-settings","01-npd","03-technical","04-planning-basic",
  "05-warehouse","06-scanner-p1","07-planning-ext","08-production","09-quality",
  "10-finance","11-shipping","12-reporting","13-maintenance","14-multi-site","15-oee"]

# sanity checks
seen={}; errors=[]
allwaves={}
for w,d in waves.items():
    for t in d['tasks']:
        key=f"{t['module']}/{t['task_id']}"
        allwaves[key]=w
        if key in seen: errors.append(f"DUP {key} in waves {seen[key]} & {w}")
        seen[key]=w
for w,d in waves.items():
    for t in d['tasks']:
        for dep in t['deps']:
            dw=allwaves.get(dep)
            if dw is not None and dw>=w:
                errors.append(f"ORDER {t['module']}/{t['task_id']}(w{w}) <- {dep}(w{dw})")
        if t['task_type']=='T3-ui' and 'G2-parity' not in t['gates']:
            errors.append(f"NO-G2 {t['module']}/{t['task_id']}")
        if t['risk_tier']=='high' and 'G4-xprovider' not in t['gates']:
            errors.append(f"NO-G4X {t['module']}/{t['task_id']}")

# serialization hotspots: scope files across many tasks
filecount=Counter()
for m in ROLLOUT:
    td=f"{BASE}/_meta/atomic-tasks/{m}/tasks"
    if not os.path.isdir(td): continue
    for fn in os.listdir(td):
        if not re.match(r"T-\d+\.json$",fn): continue
        d=json.load(open(f"{td}/{fn}")); pi=d.get("pipeline_inputs",{}) or {}
        for s in (pi.get("scope_files",[]) or []):
            if isinstance(s,str):
                f=re.sub(r"\s*\[(modify|create|delete)\]\s*$","",s).strip()
                if f and "*" not in f: filecount[f]+=1
hot=[(f,c) for f,c in filecount.most_common(12) if c>=4]

L=[]
L.append("# MonoPilot Kira — Execution Plan (Phase 2, 2026-06-02)\n")
L.append(f"Generated from the consolidated acyclic DAG. **{S['tasks']} tasks** "
         f"({S['done']} ✅ done / {S['pending']} pending) across **{S['waves']} dependency waves**.\n")
L.append("> Waves = the **global dependency layering** (done prerequisites pinned to "
         "Wave 0). Actual execution is **module-by-module** in the rollout order below "
         "(`/kira:run-module`), each module running its tasks in wave order, ≤7 concurrent "
         "worktrees, cross-module deps gated by other modules' STATUS. A wave is a "
         "dependency layer, **not** a 'run 159 tasks at once' instruction.\n")

L.append("## Wave 0 — Walking Skeleton (DONE ✅)\n")
L.append("Login (Supabase Auth) + app shell + nav + DB-backed pages are live; `pnpm build` "
         "green (Phase 0 `SKELETON-REALITY.md`). The 126 done tasks (foundation 77, settings "
         "48, +misc) are pinned to Wave 0 and skipped by Phase 4 brownfield. Residual skeleton "
         "follow-ups (T-129 RLS, T-130 RBAC-nav) are scheduled below, not in Wave 0.\n")

L.append("## The four gates (per `02-QUALITY-GATES.md`)\n")
L.append("- **G1 — tests run for real**, output captured (every task).\n"
         "- **G2 — prototype parity** (T3-ui only): literal JSX anchor + screenshot/axe evidence.\n"
         "- **G3 — deps satisfied** before start (encoded by wave order + cross-module STATUS).\n"
         "- **G4 — cross-provider review** for high-risk; cheaper self-check for low-risk. Writer never signs off its own work.\n")

L.append("## Model routing summary (per `01-MODEL-ROUTING.md`)\n")
wd=S['writer']
L.append(f"- **Codex** primary implementer: `impl-standard` {wd.get('impl-standard',0)} + "
         f"`impl-logic` {wd.get('impl-logic',0)} = **{wd.get('impl-standard',0)+wd.get('impl-logic',0)} tasks**.\n"
         f"- **Opus** UI: `impl-ui` **{wd.get('impl-ui',0)}** (parity is architectural) + `plan` {wd.get('plan',0)} (T0/docs).\n"
         f"- **Sonnet/Codex** tests: `test` **{wd.get('test',0)}**.\n"
         f"- Review pairing: Codex-written→Claude reviews (Opus high / Sonnet low); Opus-UI→Codex reviews.\n")
L.append(f"- **Risk tiers:** {S['risk'].get('high',0)} high / {S['risk'].get('low',0)} low "
         "(T1-schema + T3-ui always high; +security/money/regulatory).\n")

L.append("## Module rollout order (foundation-first, brownfield)\n")
L.append("Run the most-built first, complete it, sign off, then advance:\n\n")
L.append("| # | Module | Pending | Note |\n|---|---|---:|---|\n")
pend_by_mod=Counter()
for w,d in waves.items():
    for t in d['tasks']:
        if t['status']=='pending': pend_by_mod[t['module']]+=1
notes={"00-foundation":"complete P0 holes: T-129 RLS→T-111/112 worker→T-121 rate-limit→T-124 e-sign",
 "02-settings":"parity evidence for 57 UI + T-122 migration + SCIM fix",
 "01-npd":"greenfield: T-001 product schema gates 130+","03-technical":"greenfield: domain schema + D365 namespace",
 "04-planning-basic":"greenfield: src/ remap; MRP/WO","05-warehouse":"greenfield: LP/FEFO — gates scanner/prod/ship",
 "06-scanner-p1":"needs apps/scanner workspace","07-planning-ext":"needs Python solver svc; blocked on 04",
 "08-production":"owns wo_outputs/oee_snapshots","09-quality":"T-064 consume gate","10-finance":"NUMERIC-exact; D365 R15",
 "11-shipping":"deepest chain (critical path)","12-reporting":"needs packages/reporting + source tables",
 "13-maintenance":"e-sign/worker deps","14-multi-site":"migration renumber; packages/domain","15-oee":"read-only on 08 oee_snapshots"}
for i,m in enumerate(ROLLOUT,1):
    L.append(f"| {i} | {m} | {pend_by_mod.get(m,0)} | {notes.get(m,'')} |\n")

L.append("\n## Critical path (longest structural chain = "+str(S['critical_path_len'])+")\n")
L.append("Bottom 6 are ✅ done (foundation base), so the **effective pending critical path is "
         "the 10-task 11-shipping chain** — the min wall-clock for full completion:\n\n")
for n in S['critical_path']:
    L.append(f"- `{n}`\n")

L.append("\n## Per-wave summary\n")
L.append("| Wave | Tasks | Pending | Top modules | Writers (std/logic/ui/test/plan) | Risk H/L |\n|---:|---:|---:|---|---|---|\n")
for w in sorted(waves):
    ts=waves[w]['tasks']; pend=sum(1 for t in ts if t['status']=='pending')
    bm=Counter(t['module'] for t in ts); wr=Counter(t['writer'] for t in ts); rk=Counter(t['risk_tier'] for t in ts)
    top=", ".join(f"{m.split('-')[0]}:{c}" for m,c in bm.most_common(4))
    wmix=f"{wr.get('impl-standard',0)}/{wr.get('impl-logic',0)}/{wr.get('impl-ui',0)}/{wr.get('test',0)}/{wr.get('plan',0)}"
    L.append(f"| {w} | {len(ts)} | {pend} | {top} | {wmix} | {rk.get('high',0)}/{rk.get('low',0)} |\n")

L.append("\n## Serialization points (cross-cutting files — execution must serialize edits)\n")
for f,c in hot:
    L.append(f"- `{f}` — touched by {c} tasks (append-serialize; never two in parallel)\n")
L.append("\nThe per-module RBAC permission enum (`packages/rbac/src/permissions.enum.ts`) is the "
         "biggest hotspot: each module's first task appends its `mod.*` strings. These are the "
         "P0 first-commit blockers — run each module's enum task **first + alone** in its wave.\n")

# detailed waves 1-3
for w in (1,2,3):
    if w not in waves: continue
    L.append(f"\n## Wave {w} — full detail ({len(waves[w]['tasks'])} tasks)\n")
    L.append("| Task | Module | Type | Writer | Risk | Gates | Status |\n|---|---|---|---|---|---|---|\n")
    for t in waves[w]['tasks']:
        L.append(f"| {t['task_id']} | {t['module']} | {t['task_type']} | {t['writer']} | "
                 f"{t['risk_tier']} | {' '.join(t['gates'])} | {t['status']} |\n")

L.append("\n## Sanity checks\n")
if errors:
    L.append(f"**{len(errors)} ISSUES:**\n")
    for e in errors[:50]: L.append(f"- {e}\n")
else:
    L.append("✅ Every task in exactly one wave. ✅ No task precedes a dependency. "
             "✅ Every T3-ui carries G2-parity. ✅ Every high-risk task carries G4-xprovider.\n")

open(f"{PLANS}/EXECUTION-PLAN.md","w").write("".join(L))
print(f"wrote EXECUTION-PLAN.md  ({len(''.join(L))} bytes)")
print("sanity errors:",len(errors))
for e in errors[:10]: print("  ",e)
