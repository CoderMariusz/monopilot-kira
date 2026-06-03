#!/usr/bin/env python3
"""Phase 1 consolidation mutator — surgical, logged, idempotent-ish.
1. Break the 7 cycles via 6 explicit back-edge removals.
2. Reclassify module-qualified refs out of local `dependencies` into
   `cross_module_dependencies` (local deps keep only bare T-NNN).
3. Normalize `routing_hints` -> {writer, reviewer} new tokens; set risk_tier.
Writes task JSONs in place (indent=2, ensure_ascii=False, preserves key order)."""
import json, os, re, sys

ROOT = "/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/atomic-tasks"
modules = sorted(d for d in os.listdir(ROOT)
                 if re.match(r"\d{2}-", d) and os.path.isdir(os.path.join(ROOT, d, "tasks")))

# ---- 1. cycle-break removals: (module, task, field, value-substring-to-drop) ----
CYCLE_CUTS = [
    ("09-quality", "T-030", "xmod", "T-063"),   # contract-pin runs AFTER wiring
    ("09-quality", "T-040", "xmod", "T-063"),
    ("09-quality", "T-041", "xmod", "T-063"),
    ("09-quality", "T-052", "local", "T-041"),  # DSL rule before auto-create wiring
    ("09-quality", "T-046", "local", "T-044"),  # modal before detail page that hooks it
    ("01-npd",     "T-058", "local", "T-095"),  # API before the UI that calls it
]
cut_map = {}
for m, t, field, val in CYCLE_CUTS:
    cut_map.setdefault((m, t), []).append((field, val))

WRITER_BY_TYPE = {
    "T1-schema": "impl-standard", "T2-api": "impl-standard", "T5-seed": "impl-standard",
    "T3-ui": "impl-ui", "T4-wiring-test": "test", "T4-e2e": "test",
    "T0-root": "plan", "docs": "plan",
}
HIGH_KEYWORDS = ("security", "rls", "money", "financ", "cost", "valuation", "variance",
                 "e-sign", "esign", "dual-sign", "dual sign", "gdpr", "brcgs", "gs1",
                 "sscc", "d365", "payment", "p0-blocker", "compliance", "haccp", "ccp",
                 "allergen", "loto", "audit", "rbac", "auth")

log = {"cycle_cuts": [], "reclassified": 0, "risk_high": 0, "risk_low": 0, "routing_norm": 0, "files": 0}

LOCAL_BARE = re.compile(r"^T-\d+$")
MODQUAL = re.compile(r"(\d{2}-[A-Za-z-]+)\s*[/: ]\s*(T-\d+)")

for m in modules:
    tdir = os.path.join(ROOT, m, "tasks")
    for fn in sorted(os.listdir(tdir)):
        if not re.match(r"T-\d+\.json$", fn):
            continue
        tid = fn[:-5]
        path = os.path.join(tdir, fn)
        data = json.load(open(path))
        pi = data.get("pipeline_inputs")
        if not isinstance(pi, dict):
            continue
        changed = False

        local = pi.get("dependencies", []) or []
        xmod = pi.get("cross_module_dependencies", []) or []
        if not isinstance(xmod, list):
            xmod = [xmod] if xmod else []

        # --- 1. cycle cuts ---
        for field, val in cut_map.get((m, tid), []):
            if field == "local":
                before = list(local)
                local = [d for d in local if d.strip() != val]
                if local != before:
                    changed = True
                    log["cycle_cuts"].append(f"{m}/{tid} local-=({val})")
            else:  # xmod
                before = list(xmod)
                xmod = [r for r in xmod if not (isinstance(r, str) and val in r)]
                if xmod != before:
                    changed = True
                    log["cycle_cuts"].append(f"{m}/{tid} xmod-=({val})")

        # --- 2. reclassify module-qualified local deps -> xmod ---
        new_local, moved = [], []
        for d in local:
            ds = d.strip()
            if LOCAL_BARE.match(ds):
                new_local.append(ds)
            else:
                moved.append(ds)   # module-qualified OR prose -> cross-module note
        if moved:
            for mv in moved:
                if mv not in xmod:
                    xmod.append(mv)
            local = new_local
            changed = True
            log["reclassified"] += len(moved)

        # --- 3. risk_tier ---
        ttype = pi.get("task_type")
        hay = " ".join(str(x) for x in (data.get("labels", []) or [])).lower()
        hay += " " + str(pi.get("category", "")).lower() + " " + str(pi.get("subcategory", "")).lower()
        hay += " " + str(pi.get("parent_feature", "")).lower()
        high = (ttype in ("T1-schema", "T3-ui")) or any(k in hay for k in HIGH_KEYWORDS)
        risk = "high" if high else "low"
        if pi.get("risk_tier") != risk:
            pi["risk_tier"] = risk
            changed = True
        log["risk_high" if high else "risk_low"] += 1

        # --- 3b. routing_hints normalization ---
        writer = WRITER_BY_TYPE.get(ttype, "impl-standard")
        reviewer = "codex-review" if writer in ("impl-ui", "plan") else "review-codex-work"
        new_rh = {"writer": writer, "reviewer": reviewer}
        if pi.get("routing_hints") != new_rh:
            pi["routing_hints"] = new_rh
            changed = True
            log["routing_norm"] += 1

        pi["dependencies"] = local
        if xmod:
            pi["cross_module_dependencies"] = xmod

        if changed:
            json.dump(data, open(path, "w"), indent=2, ensure_ascii=False)
            log["files"] += 1

print(json.dumps(log, indent=1))
print(f"\ncycle cuts applied: {len(log['cycle_cuts'])}")
for c in log["cycle_cuts"]:
    print("  ", c)
