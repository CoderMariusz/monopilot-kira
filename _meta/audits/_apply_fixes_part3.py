#!/usr/bin/env python3
"""Part 3: Re-normalize depends_on_prototypes with smarter logic.
Uses each entry's own module for ambiguous-bare-label resolution,
and properly recognizes _shared/modals.jsx (X, Y) as a paren-list (not a _shared/ catch).
"""
import json
import re
from pathlib import Path

ROOT = Path("/Users/mariuszkrawczyk/Projects/monopilot-kira")
PL_DIR = ROOT / "_meta/prototype-labels"

# Load master
with open(PL_DIR / "master-index.json") as f:
    master = json.load(f)

label_to_file = {e["label"]: e["file"] for e in master}
master_labels = set(label_to_file.keys())
all_master_modules = {e["module"] for e in master}

# Build bare-form -> [prefixed forms]
bare_to_master = {}
for e in master:
    label = e["label"]
    mod = e["module"]
    pref = mod + "_"
    if label.startswith(pref):
        bare = label[len(pref):]
        bare_to_master.setdefault(bare, []).append(label)
    # also tag the label itself
    bare_to_master.setdefault(label, []).append(label)

PRIMITIVE_NAMES = {
    "ActState","AllSitesBanner","Banner","BestBeforeSheet","BlockFullscreen","BottomActions","Btn",
    "Content","ExpiryCell","FefoDeviationSheet","Field","GRNStatus","GhostBtn","ISTStatus",
    "ItemTypeBadge","KPI card","LPStatus","LaneHealth","LanguageSheet","LogoutSheet","LpLockedSheet",
    "Ltree","MiniGrid","Modal","MoveType","PartialConsumeSheet","PrinterPickerSheet","QAStatus",
    "QtyKeypadSheet","ReasonInput","ReasonPickerSheet","RepStatus","ScaffoldedScreen","ScanErrorSheet",
    "ScanInputArea","ShelfMode","SiteCrumb","SiteRef","SiteTypeBadge","SourceChip","StatusChip",
    "StatusDot","Stepper","StepsBar","Summary","Toast","Topbar",
}

# Fixed regexes — paren-list FIRST, then arrow, then _shared/, then plain
RE_PAREN_LIST = re.compile(r"^(.*?\.jsx)\s*\(([^)]+)\)\s*$")
RE_ARROW = re.compile(r"^(.+?)\s*→\s*(\S+)\s*$")
RE_HASH = re.compile(r"^(.+\.jsx)#(.+)$")
RE_SHARED_PAREN = re.compile(r"^_shared/\s*\(([^)]+)\)\s*$")
RE_SHARED_SLASH = re.compile(r"^_shared/(.+)$")


def normalize_dep(dep, host_module=None):
    s = dep.strip()
    if not s:
        return [s]
    if s.startswith("primitive:") or s.startswith("unresolved:"):
        # Re-strip and re-evaluate — strip the prefix first to retry resolution
        if s.startswith("unresolved:"):
            inner = s[len("unresolved:"):]
            return normalize_dep(inner, host_module=host_module)
        return [s]

    # Already canonical
    if RE_HASH.match(s):
        return [s]

    # Paren list (file.jsx (A, B)) — covers "_shared/modals.jsx (Modal, Field)" too
    m = RE_PAREN_LIST.match(s)
    if m:
        file_, complist = m.group(1), m.group(2)
        comps = [c.strip() for c in complist.split(",")]
        # qualify file path
        if file_.startswith("_shared/"):
            file_norm = f"design/Monopilot Design System/{file_}"
        elif "/" not in file_:
            if host_module:
                file_norm = f"design/Monopilot Design System/{host_module}/{file_}"
            else:
                file_norm = file_
        else:
            # already has module prefix like "planning/modals.jsx"
            if not file_.startswith("design/"):
                file_norm = f"design/Monopilot Design System/{file_}"
            else:
                file_norm = file_
        return [f"{file_norm}#{c}" for c in comps if c]

    # Arrow (file.jsx → Comp)
    m = RE_ARROW.match(s)
    if m:
        file_, comp = m.group(1).strip(), m.group(2).strip()
        if file_.startswith("_shared/"):
            file_norm = f"design/Monopilot Design System/{file_}"
        elif "/" not in file_:
            if host_module:
                file_norm = f"design/Monopilot Design System/{host_module}/{file_}"
            else:
                file_norm = file_
        elif not file_.startswith("design/"):
            file_norm = f"design/Monopilot Design System/{file_}"
        else:
            file_norm = file_
        return [f"{file_norm}#{comp}"]

    # _shared/(A, B)
    m = RE_SHARED_PAREN.match(s)
    if m:
        comps = [c.strip() for c in m.group(1).split(",")]
        return [f"primitive:{c}" for c in comps if c]

    # _shared/CompName
    m = RE_SHARED_SLASH.match(s)
    if m:
        rest = m.group(1).strip()
        if not rest:
            return [f"unresolved:{s}"]
        return [f"primitive:{rest}"]

    # Bare primitive
    if s in PRIMITIVE_NAMES:
        return [f"primitive:{s}"]

    # Bare label
    if re.match(r"^[a-z][a-z0-9_]+$", s):
        # exact master label?
        if s in master_labels:
            return [s]
        if s in bare_to_master:
            cands = bare_to_master[s]
            if len(cands) == 1:
                return [cands[0]]
            # ambiguous — disambiguate by host_module
            if host_module:
                same = [c for c in cands if c.startswith(host_module + "_") or c == s]
                if len(same) == 1:
                    return [same[0]]
            return [f"unresolved:{s}"]
        return [f"unresolved:{s}"]

    return [f"unresolved:{s}"]


def normalize_entries_in_place(entries, host_module_extractor):
    for e in entries:
        deps = e.get("depends_on_prototypes", [])
        host_mod = host_module_extractor(e)
        new_deps = []
        for d in deps:
            normed = normalize_dep(d, host_module=host_mod)
            new_deps.extend(normed)
        # de-dupe preserving order
        seen = set()
        uniq = []
        for x in new_deps:
            if x not in seen:
                seen.add(x)
                uniq.append(x)
        e["depends_on_prototypes"] = uniq


# Master: use entry["module"]
normalize_entries_in_place(master, lambda e: e.get("module"))
with open(PL_DIR / "master-index.json", "w") as f:
    json.dump(master, f, indent=2, ensure_ascii=False)
print("re-normalized master")

# Per-module: use the wrapper's module
for p in PL_DIR.glob("prototype-index-*.json"):
    with open(p) as f:
        d = json.load(f)
    mod = d["module"]
    normalize_entries_in_place(d["entries"], lambda e: mod)
    with open(p, "w") as f:
        json.dump(d, f, indent=2, ensure_ascii=False)
    print(f"re-normalized {mod}")

# Final dep stats
from collections import Counter
def list_all_deps():
    deps = []
    for e in master:
        for d in e.get("depends_on_prototypes", []):
            deps.append(("master", e["label"], d))
    for p in sorted(PL_DIR.glob("prototype-index-*.json")):
        with open(p) as f:
            data = json.load(f)
        for e in data["entries"]:
            for x in e.get("depends_on_prototypes", []):
                deps.append((p.name, e["label"], x))
    return deps

all_deps = list_all_deps()
total = len(all_deps)
canonical = 0
unresolved = 0
primitive = 0
hashref = 0
labelref = 0
other = 0
master_labels_after = {e["label"] for e in master}
for src, lbl, d in all_deps:
    if d.startswith("primitive:"):
        primitive += 1
        canonical += 1
    elif d.startswith("unresolved:"):
        unresolved += 1
    elif "#" in d:
        hashref += 1
        canonical += 1
    elif d in master_labels_after:
        labelref += 1
        canonical += 1
    else:
        other += 1

print(f"\nTotal: {total}")
print(f"  primitive: {primitive}")
print(f"  hash-ref: {hashref}")
print(f"  label-ref: {labelref}")
print(f"  unresolved: {unresolved}")
print(f"  other: {other}")
print(f"  canonical %: {100*canonical/total:.1f}%")

# Sample unresolved
unresolved_samples = [d for _,_,d in all_deps if d.startswith("unresolved:")][:20]
print("\nSample unresolved:")
for u in unresolved_samples:
    print(f"  {u}")

# Distinct unresolved
distinct_unresolved = sorted(set(d for _,_,d in all_deps if d.startswith("unresolved:")))
print(f"\ndistinct unresolved: {len(distinct_unresolved)}")
for u in distinct_unresolved:
    print(f"  {u}")
