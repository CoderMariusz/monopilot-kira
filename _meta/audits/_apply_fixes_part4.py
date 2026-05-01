#!/usr/bin/env python3
"""Part 4: cleanup remaining 3 distinct unresolved patterns."""
import json
import re
from pathlib import Path

PL_DIR = Path("/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/prototype-labels")

# Custom remediations
SPECIAL_REMEDIATIONS = {
    # bom-list.jsx → KPI (KpiTile) — file has KpiTile export
    "unresolved:bom-list.jsx → KPI (KpiTile)": "design/Monopilot Design System/technical/bom-list.jsx#KpiTile",
    # bol_sign_modal — typo? closest master match is bol_sign_upload_modal
    "unresolved:bol_sign_modal": "bol_sign_upload_modal",
    # bare _shared/ — keep as unresolved (no info to resolve)
    "unresolved:_shared/": "unresolved:_shared/",
}

def fix_deps(entries):
    changed = 0
    for e in entries:
        deps = e.get("depends_on_prototypes", [])
        new_deps = []
        for d in deps:
            if d in SPECIAL_REMEDIATIONS:
                new_d = SPECIAL_REMEDIATIONS[d]
                if new_d != d:
                    changed += 1
                new_deps.append(new_d)
            else:
                new_deps.append(d)
        # de-dupe
        seen = set()
        uniq = []
        for x in new_deps:
            if x not in seen:
                seen.add(x)
                uniq.append(x)
        e["depends_on_prototypes"] = uniq
    return changed

# Master
with open(PL_DIR / "master-index.json") as f:
    master = json.load(f)
n = fix_deps(master)
with open(PL_DIR / "master-index.json", "w") as f:
    json.dump(master, f, indent=2, ensure_ascii=False)
print(f"master: changed {n} deps")

# Per-module
total = 0
for p in PL_DIR.glob("prototype-index-*.json"):
    with open(p) as f:
        d = json.load(f)
    n = fix_deps(d["entries"])
    if n:
        with open(p, "w") as f:
            json.dump(d, f, indent=2, ensure_ascii=False)
        total += n
        print(f"{p.name}: changed {n} deps")
print(f"per-module total changed: {total}")

# Final stats
def list_all_deps():
    deps = []
    for e in master:
        for d in e.get("depends_on_prototypes", []):
            deps.append(d)
    for p in sorted(PL_DIR.glob("prototype-index-*.json")):
        with open(p) as f:
            data = json.load(f)
        for e in data["entries"]:
            for x in e.get("depends_on_prototypes", []):
                deps.append(x)
    return deps

# Reload master after cleanup
with open(PL_DIR / "master-index.json") as f:
    master = json.load(f)
all_deps = list_all_deps()
total = len(all_deps)
unresolved = sum(1 for d in all_deps if d.startswith("unresolved:"))
canonical = total - unresolved
print(f"\nfinal: total={total}, canonical={canonical} ({100*canonical/total:.1f}%), unresolved={unresolved}")

# Distinct unresolved
print("distinct unresolved:")
for u in sorted(set(d for d in all_deps if d.startswith("unresolved:"))):
    print(f"  {u}")
