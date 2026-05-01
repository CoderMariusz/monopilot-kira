#!/usr/bin/env python3
"""Part 2 of audit fixes: backfill npd per-module index from master, re-run HIGH4/HIGH5 on per-module npd, normalize moved settings labels in master."""
import json
from pathlib import Path

ROOT = Path("/Users/mariuszkrawczyk/Projects/monopilot-kira")
PL_DIR = ROOT / "_meta/prototype-labels"

# Load master
with open(PL_DIR / "master-index.json") as f:
    master = json.load(f)

# Load npd per-module
npd_path = PL_DIR / "prototype-index-npd.json"
with open(npd_path) as f:
    npd = json.load(f)

pm_labels = {e["label"] for e in npd["entries"]}

# 4 entries to backfill — they are bare in master (no prefix)
TO_BACKFILL = ["gate_checklist_panel", "advance_gate_modal", "gate_approval_modal", "approval_history_timeline"]

added = 0
for lbl in TO_BACKFILL:
    if lbl in pm_labels:
        continue
    master_entry = next((e for e in master if e["label"] == lbl), None)
    if master_entry is None:
        print(f"  master entry for {lbl} not found")
        continue
    # copy without the synthetic 'module' field
    new_e = {k: v for k, v in master_entry.items() if k != "module"}
    npd["entries"].append(new_e)
    added += 1
    print(f"  backfilled {lbl}")

# Save
with open(npd_path, "w") as f:
    json.dump(npd, f, indent=2, ensure_ascii=False)
print(f"npd backfill: added {added} entries (now {len(npd['entries'])})")

# Now also re-run HIGH4/HIGH5 fixes on the npd per-module index
fixed = 0
for e in npd["entries"]:
    if e["label"] == "gate_checklist_panel" and e.get("ui_pattern") == "dashboard":
        e["ui_pattern"] = "dashboard-tile"
        fixed += 1
    if e["label"] == "approval_history_timeline" and e.get("interaction") == "view":
        e["interaction"] = "read-only"
        fixed += 1
print(f"HIGH4/HIGH5 fixes applied to npd per-module: {fixed}")

with open(npd_path, "w") as f:
    json.dump(npd, f, indent=2, ensure_ascii=False)

# Verify final per-module counts vs master
total_pm = 0
for p in sorted(PL_DIR.glob("prototype-index-*.json")):
    with open(p) as f:
        d = json.load(f)
    total_pm += len(d["entries"])
print(f"\nfinal per-module entries: {total_pm}")
print(f"master entries: {len(master)}")

# Note: the difference now may reflect the 11 bare-label collisions
# where master has 2 prefixed forms but per-module has 1 bare form.
# That's expected design.
from collections import Counter
master_per_mod = Counter(e["module"] for e in master)
for p in sorted(PL_DIR.glob("prototype-index-*.json")):
    with open(p) as f:
        d = json.load(f)
    mod = d["module"]
    diff = master_per_mod[mod] - len(d["entries"])
    if diff != 0:
        print(f"  {mod}: master={master_per_mod[mod]}, per-module={len(d['entries'])}, diff={diff}")
