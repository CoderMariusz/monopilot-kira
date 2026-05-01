#!/usr/bin/env python3
"""Final verification: assert all 7 verification conditions from the brief."""
import json
import sys
from pathlib import Path

PL_DIR = Path("/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/prototype-labels")
ARCHIVE = PL_DIR / "_archive"

results = []
def vassert(cond, msg, evidence=""):
    status = "PASS" if cond else "FAIL"
    results.append((status, msg, evidence))
    print(f"  [{status}] {msg}" + (f" — {evidence}" if evidence else ""))
    return cond

# Load master
with open(PL_DIR / "master-index.json") as f:
    master = json.load(f)

# 1. master-index has 514 entries
vassert(len(master) == 514, "master-index has 514 entries", f"actual={len(master)}")

# 2. Every per-module index has 5-key wrapper
per_module_files = sorted(PL_DIR.glob("prototype-index-*.json"))
expected_keys = {"module", "generated_at", "generator", "mode", "entries"}
all_wrapped = True
total_entries = 0
for p in per_module_files:
    with open(p) as f:
        d = json.load(f)
    if not (isinstance(d, dict) and expected_keys <= set(d.keys())):
        all_wrapped = False
        print(f"     missing keys in {p.name}: {expected_keys - set(d.keys() if isinstance(d, dict) else {})}")
    else:
        total_entries += len(d["entries"])
vassert(all_wrapped, f"all {len(per_module_files)} per-module indexes have 5-key wrapper")

# 3. Sum of per-module entries == master entries (after backfill)
vassert(total_entries == len(master),
        "sum of per-module entries equals master entries",
        f"per-module={total_entries}, master={len(master)}")

# 4. No bare-primitive depends_on_prototypes anywhere
PRIMITIVE_NAMES = {
    "ActState","AllSitesBanner","Banner","BestBeforeSheet","BlockFullscreen","BottomActions","Btn",
    "Content","ExpiryCell","FefoDeviationSheet","Field","GRNStatus","GhostBtn","ISTStatus",
    "ItemTypeBadge","KPI card","LPStatus","LaneHealth","LanguageSheet","LogoutSheet","LpLockedSheet",
    "Ltree","MiniGrid","Modal","MoveType","PartialConsumeSheet","PrinterPickerSheet","QAStatus",
    "QtyKeypadSheet","ReasonInput","ReasonPickerSheet","RepStatus","ScaffoldedScreen","ScanErrorSheet",
    "ScanInputArea","ShelfMode","SiteCrumb","SiteRef","SiteTypeBadge","SourceChip","StatusChip",
    "StatusDot","Stepper","StepsBar","Summary","Toast","Topbar",
}
all_deps = []
for e in master:
    for d in e.get("depends_on_prototypes", []):
        all_deps.append(("master", e["label"], d))
for p in per_module_files:
    with open(p) as f:
        data = json.load(f)
    for e in data["entries"]:
        for x in e.get("depends_on_prototypes", []):
            all_deps.append((p.name, e["label"], x))

bare_prims = [(s, l, d) for s, l, d in all_deps if d in PRIMITIVE_NAMES]
vassert(len(bare_prims) == 0, "no bare-primitive depends_on_prototypes remain",
        f"found={len(bare_prims)}")

# Check all deps follow allowed patterns
master_labels = {e["label"] for e in master}
import re
def dep_kind(d):
    if d.startswith("primitive:"): return "primitive"
    if d.startswith("unresolved:"): return "unresolved"
    if "#" in d: return "hash"
    if d in master_labels: return "label"
    return "other"

from collections import Counter
kinds = Counter(dep_kind(d) for _,_,d in all_deps)
print(f"     dep distribution: {dict(kinds)}")
vassert(kinds.get("other", 0) == 0, "no 'other' (uncanonicalized) deps",
        f"other={kinds.get('other', 0)}")

# 5. HIGH 4-5 corrections present
gate = next((e for e in master if e["label"] == "gate_checklist_panel"), None)
vassert(gate and gate.get("ui_pattern") == "dashboard-tile",
        "gate_checklist_panel.ui_pattern == dashboard-tile",
        f"actual={gate and gate.get('ui_pattern')}")

hist = next((e for e in master if e["label"] == "approval_history_timeline"), None)
vassert(hist and hist.get("interaction") == "read-only",
        "approval_history_timeline.interaction == read-only",
        f"actual={hist and hist.get('interaction')}")

# Per-module (npd) check
with open(PL_DIR / "prototype-index-npd.json") as f:
    npd = json.load(f)
npd_gate = next((e for e in npd["entries"] if e["label"] == "gate_checklist_panel"), None)
vassert(npd_gate and npd_gate.get("ui_pattern") == "dashboard-tile",
        "npd gate_checklist_panel.ui_pattern == dashboard-tile",
        f"actual={npd_gate and npd_gate.get('ui_pattern')}")
npd_hist = next((e for e in npd["entries"] if e["label"] == "approval_history_timeline"), None)
vassert(npd_hist and npd_hist.get("interaction") == "read-only",
        "npd approval_history_timeline.interaction == read-only",
        f"actual={npd_hist and npd_hist.get('interaction')}")

# 6. Six settings entries removed from settings, present in destinations
with open(PL_DIR / "prototype-index-settings.json") as f:
    settings = json.load(f)
settings_labels = {e["label"] for e in settings["entries"]}
moved_bare = {"sites_screen", "shifts_screen", "settings_shifts_screen", "devices_screen", "products_screen", "boms_screen", "partners_screen"}
intersection = moved_bare & settings_labels
vassert(not intersection, "moved entries not present in settings",
        f"intersection={intersection}")

# Check destinations
DESTINATIONS = {
    "sites_screen": "multi-site",
    "shifts_screen": "oee",
    "devices_screen": "scanner",
    "products_screen": "technical",
    "boms_screen": "technical",
    "partners_screen": "technical",
}
for label, target in DESTINATIONS.items():
    with open(PL_DIR / f"prototype-index-{target}.json") as f:
        d = json.load(f)
    found = any(e["label"] == label for e in d["entries"])
    vassert(found, f"{label} present in {target}/per-module")

# Master-index re-prefixed
master_label_set = {e["label"] for e in master}
expected_master_labels = {
    "multi-site_sites_screen", "oee_shifts_screen", "scanner_devices_screen",
    "technical_products_screen", "technical_boms_screen", "technical_partners_screen",
}
for new_lbl in expected_master_labels:
    vassert(new_lbl in master_label_set, f"master has {new_lbl}")

# 7. _archive exists with warehouse-haiku files
vassert(ARCHIVE.is_dir(), "_archive/ subfolder exists")
vassert((ARCHIVE / "prototype-index-warehouse-haiku.json").exists(),
        "_archive/prototype-index-warehouse-haiku.json exists")
vassert((ARCHIVE / "translation-notes-warehouse-haiku.md").exists(),
        "_archive/translation-notes-warehouse-haiku.md exists")

# Bonus: canonical file exists
vassert((PL_DIR / "prototype-index-warehouse.json").exists(),
        "prototype-index-warehouse.json (canonical) exists")
vassert((PL_DIR / "translation-notes-warehouse.md").exists(),
        "translation-notes-warehouse.md (canonical) exists")
vassert(not (PL_DIR / "prototype-index-warehouse-sonnet.json").exists(),
        "warehouse-sonnet.json renamed (no longer at original path)")
vassert(not (PL_DIR / "prototype-index-warehouse-haiku.json").exists(),
        "warehouse-haiku.json moved out of main dir")

# Summary
passes = sum(1 for s,_,_ in results if s == "PASS")
fails = sum(1 for s,_,_ in results if s == "FAIL")
print(f"\n=== {passes} PASS / {fails} FAIL ===")

# Save results
with open("/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/audits/_verify_results.json", "w") as f:
    json.dump({"results": results, "passes": passes, "fails": fails,
               "deps_total": len(all_deps),
               "deps_distribution": dict(kinds),
               "master_count": len(master),
               "per_module_total": total_entries}, f, indent=2)

sys.exit(0 if fails == 0 else 1)
