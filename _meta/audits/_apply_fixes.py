#!/usr/bin/env python3
"""Apply audit-2026-04-30 fixes to prototype-labels."""
import json
import os
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path("/Users/mariuszkrawczyk/Projects/monopilot-kira")
PL_DIR = ROOT / "_meta/prototype-labels"
ARCHIVE = PL_DIR / "_archive"
TS = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
GENERATOR = "audit-fix-2026-04-30"

ALL_MODULES = [
    "finance", "maintenance", "multi-site", "npd", "oee",
    "planning", "planning-ext", "production", "quality", "reporting",
    "scanner", "settings", "shipping", "technical", "warehouse"
]

# State tracking
report = {
    "before": {},
    "after": {},
    "actions": [],
    "deferred": [],
}

def log_action(defect, action, result, evidence=""):
    report["actions"].append({
        "defect": defect, "action": action, "result": result, "evidence": evidence
    })
    print(f"[{result}] {defect}: {action} ({evidence})")

# =============================================================
# Step 0: capture before-state counts
# =============================================================
with open(PL_DIR / "master-index.json") as f:
    master = json.load(f)
report["before"]["master_count"] = len(master)
report["before"]["per_module_files_initial"] = sorted(
    p.name for p in PL_DIR.glob("prototype-index-*.json")
)
report["before"]["wrappers_count"] = 0  # initial scan
for p in PL_DIR.glob("prototype-index-*.json"):
    with open(p) as f:
        d = json.load(f)
    if isinstance(d, dict) and "entries" in d:
        report["before"]["wrappers_count"] += 1

# =============================================================
# BLOCKER 1 — Warehouse haiku/sonnet split
# =============================================================
ARCHIVE.mkdir(parents=True, exist_ok=True)

src_haiku_json = PL_DIR / "prototype-index-warehouse-haiku.json"
dst_haiku_json = ARCHIVE / "prototype-index-warehouse-haiku.json"
if src_haiku_json.exists():
    shutil.move(str(src_haiku_json), str(dst_haiku_json))
    log_action("BLOCKER1", "archive warehouse-haiku.json", "FIXED", str(dst_haiku_json))

src_sonnet_json = PL_DIR / "prototype-index-warehouse-sonnet.json"
dst_warehouse_json = PL_DIR / "prototype-index-warehouse.json"
if src_sonnet_json.exists():
    shutil.move(str(src_sonnet_json), str(dst_warehouse_json))
    log_action("BLOCKER1", "rename warehouse-sonnet.json -> warehouse.json", "FIXED", str(dst_warehouse_json))

src_haiku_md = PL_DIR / "translation-notes-warehouse-haiku.md"
dst_haiku_md = ARCHIVE / "translation-notes-warehouse-haiku.md"
if src_haiku_md.exists():
    shutil.move(str(src_haiku_md), str(dst_haiku_md))
    log_action("BLOCKER1/HIGH7", "archive warehouse-haiku.md", "FIXED", str(dst_haiku_md))

src_sonnet_md = PL_DIR / "translation-notes-warehouse-sonnet.md"
dst_warehouse_md = PL_DIR / "translation-notes-warehouse.md"
if src_sonnet_md.exists():
    shutil.move(str(src_sonnet_md), str(dst_warehouse_md))
    log_action("BLOCKER1/HIGH7", "rename warehouse-sonnet.md -> warehouse.md", "FIXED", str(dst_warehouse_md))

# Verify canonical content matches master (3 samples)
with open(dst_warehouse_json) as f:
    wh_data = json.load(f)
master_warehouse = [e for e in master if e.get("module") == "warehouse"]
m_labels = {e["label"] for e in master_warehouse}
s_labels = {e["label"] for e in wh_data}
if m_labels == s_labels:
    log_action("BLOCKER1-verify", "warehouse labels match master", "FIXED",
               f"{len(s_labels)} labels identical")
else:
    log_action("BLOCKER1-verify", "warehouse labels diverge from master", "FAILED",
               f"diff={m_labels ^ s_labels}")

# =============================================================
# HIGH 6 — Move 6 mistagged settings entries to other modules
# Done BEFORE wrapping, while indexes are still bare arrays.
# =============================================================
MOVE_MAP = {
    "sites_screen": ("multi-site", "multi-site"),
    "settings_shifts_screen": ("oee", "oee"),
    "shifts_screen": ("oee", "oee"),  # in case the per-module form differs
    "devices_screen": ("scanner", "scanner"),
    "products_screen": ("technical", "technical"),
    "boms_screen": ("technical", "technical"),
    "partners_screen": ("technical", "technical"),
}

# Per-module move
settings_path = PL_DIR / "prototype-index-settings.json"
with open(settings_path) as f:
    settings_entries = json.load(f)

moved_entries = []  # (entry, target_module)
remaining = []
for e in settings_entries:
    if e["label"] in MOVE_MAP:
        target_mod, _ = MOVE_MAP[e["label"]]
        moved_entries.append((e, target_mod))
    else:
        remaining.append(e)

# Group moved by target module
from collections import defaultdict
by_target = defaultdict(list)
for e, tm in moved_entries:
    by_target[tm].append(e)

for tm, entries in by_target.items():
    target_path = PL_DIR / f"prototype-index-{tm}.json"
    with open(target_path) as f:
        target_data = json.load(f)
    target_data.extend(entries)
    with open(target_path, "w") as f:
        json.dump(target_data, f, indent=2, ensure_ascii=False)
    log_action("HIGH6", f"moved {len(entries)} entries to {tm}", "FIXED",
               f"labels={[e['label'] for e in entries]}")

# Save settings minus moved
with open(settings_path, "w") as f:
    json.dump(remaining, f, indent=2, ensure_ascii=False)
log_action("HIGH6-settings", f"removed {len(moved_entries)} from settings", "FIXED",
           f"new size={len(remaining)}")

# =============================================================
# HIGH 6b — Update master-index.json: re-prefix moved labels
# =============================================================
# In master, the labels are: settings_shifts_screen, sites_screen, etc.
# After move, the master entry's `module` field should change too,
# AND the prefixed label should match the destination module.
PREFIX_RENAME_IN_MASTER = {
    # current_label -> (new_label, new_module)
    "sites_screen": ("multi-site_sites_screen", "multi-site"),
    "settings_shifts_screen": ("oee_shifts_screen", "oee"),
    "devices_screen": ("scanner_devices_screen", "scanner"),
    "products_screen": ("technical_products_screen", "technical"),
    "boms_screen": ("technical_boms_screen", "technical"),
    "partners_screen": ("technical_partners_screen", "technical"),
}

moved_master_count = 0
for e in master:
    if e["label"] in PREFIX_RENAME_IN_MASTER:
        new_label, new_mod = PREFIX_RENAME_IN_MASTER[e["label"]]
        old_label = e["label"]
        e["label"] = new_label
        e["module"] = new_mod
        moved_master_count += 1
        log_action("HIGH6-master", f"re-tagged {old_label} -> {new_label} ({new_mod})", "FIXED")

if moved_master_count != 6:
    log_action("HIGH6-master-count", f"expected 6 moves, got {moved_master_count}", "PARTIAL",
               "some labels in MOVE_MAP not present in master")

# =============================================================
# HIGH 4 — gate_checklist_panel ui_pattern: dashboard -> dashboard-tile
# =============================================================
def fix_high4(entries, label_match="gate_checklist_panel", file_match="npd/gate-screens.jsx"):
    fixed = 0
    for e in entries:
        if e.get("label") == label_match and file_match in e.get("file", "") and e.get("ui_pattern") == "dashboard":
            e["ui_pattern"] = "dashboard-tile"
            fixed += 1
    return fixed

n = fix_high4(master)
log_action("HIGH4-master", f"set ui_pattern=dashboard-tile on gate_checklist_panel", "FIXED" if n else "NOT_FOUND", f"matches={n}")

npd_path = PL_DIR / "prototype-index-npd.json"
with open(npd_path) as f:
    npd_entries = json.load(f)
n = fix_high4(npd_entries)
log_action("HIGH4-npd", f"set ui_pattern=dashboard-tile on gate_checklist_panel (npd)", "FIXED" if n else "NOT_FOUND", f"matches={n}")

# =============================================================
# HIGH 5 — approval_history_timeline interaction: view -> read-only
# =============================================================
def fix_high5(entries):
    fixed = 0
    for e in entries:
        if e.get("label") == "approval_history_timeline" and "npd/gate-screens.jsx" in e.get("file", "") and e.get("interaction") == "view":
            e["interaction"] = "read-only"
            fixed += 1
    return fixed

n = fix_high5(master)
log_action("HIGH5-master", f"set interaction=read-only on approval_history_timeline", "FIXED" if n else "NOT_FOUND", f"matches={n}")

n = fix_high5(npd_entries)
log_action("HIGH5-npd", f"set interaction=read-only on approval_history_timeline (npd)", "FIXED" if n else "NOT_FOUND", f"matches={n}")

# Save NPD now (with HIGH4+HIGH5 fixes)
with open(npd_path, "w") as f:
    json.dump(npd_entries, f, indent=2, ensure_ascii=False)

# =============================================================
# HIGH 9 — depends_on_prototypes canonicalization
# =============================================================
# Build a label -> file map from master (the source of truth)
label_to_file = {e["label"]: e["file"] for e in master}
# Also map bare-label forms (after stripping module prefix) to canonical master form
bare_to_master = {}
for e in master:
    label = e["label"]
    bare_to_master.setdefault(label, []).append(label)
    # try to find a "bare" form by removing the leading module_
    mod = e["module"]
    pref = mod + "_"
    if label.startswith(pref):
        bare = label[len(pref):]
        bare_to_master.setdefault(bare, []).append(label)

# Known shadcn/Radix primitives (component-name only)
PRIMITIVE_NAMES = {
    "ActState","AllSitesBanner","Banner","BestBeforeSheet","BlockFullscreen","BottomActions","Btn",
    "Content","ExpiryCell","FefoDeviationSheet","Field","GRNStatus","GhostBtn","ISTStatus",
    "ItemTypeBadge","KPI card","LPStatus","LaneHealth","LanguageSheet","LogoutSheet","LpLockedSheet",
    "Ltree","MiniGrid","Modal","MoveType","PartialConsumeSheet","PrinterPickerSheet","QAStatus",
    "QtyKeypadSheet","ReasonInput","ReasonPickerSheet","RepStatus","ScaffoldedScreen","ScanErrorSheet",
    "ScanInputArea","ShelfMode","SiteCrumb","SiteRef","SiteTypeBadge","SourceChip","StatusChip",
    "StatusDot","Stepper","StepsBar","Summary","Toast","Topbar",
}

# Patterns for various ad-hoc syntaxes
RE_PAREN_LIST = re.compile(r"^(.*?\.jsx)\s*\(([^)]+)\)\s*$")  # "file.jsx (A, B)"
RE_ARROW = re.compile(r"^(.*?\.jsx)\s*→\s*(\S+)\s*$")          # "file.jsx → Comp"
RE_SHARED_SLASH = re.compile(r"^_shared/(.+)$")                # "_shared/Modal" or "_shared/ (...)"
RE_SHARED_PAREN = re.compile(r"^_shared/\s*\(([^)]+)\)\s*$")   # "_shared/ (A, B)"
RE_HASH = re.compile(r"^(.+\.jsx)#(.+)$")                       # canonical

def normalize_dep(dep, host_module=None):
    """Return list of normalized dep strings (one input may yield multiple)."""
    s = dep.strip()
    if not s:
        return [s]

    # Already canonical
    m = RE_HASH.match(s)
    if m:
        return [s]

    # _shared/ (A, B, ...) -> primitive list
    m = RE_SHARED_PAREN.match(s)
    if m:
        comps = [c.strip() for c in m.group(1).split(",")]
        return [f"primitive:{c}" for c in comps if c]

    # _shared/CompName -> primitive:CompName
    m = RE_SHARED_SLASH.match(s)
    if m:
        rest = m.group(1).strip()
        if not rest:
            return [f"unresolved:{s}"]
        if "(" in rest or " " in rest:
            # weird form; treat as unresolved
            return [f"unresolved:{s}"]
        return [f"primitive:{rest}"]

    # file.jsx (A, B, ...) -> file.jsx#A, file.jsx#B
    m = RE_PAREN_LIST.match(s)
    if m:
        file_, complist = m.group(1), m.group(2)
        comps = [c.strip() for c in complist.split(",")]
        # determine prefix: if file is "modals.jsx" assume same-module modals; not knowable -> use as-is
        # If host_module provided and file is bare "modals.jsx", prefix with module path
        file_norm = file_
        if "/" not in file_:
            # bare filename — try to qualify with host module
            if host_module:
                file_norm = f"design/Monopilot Design System/{host_module}/{file_}"
            else:
                # leave bare; consumer will need to resolve
                file_norm = file_
        return [f"{file_norm}#{c}" for c in comps if c]

    # file.jsx → Comp
    m = RE_ARROW.match(s)
    if m:
        file_, comp = m.group(1), m.group(2)
        if "/" not in file_:
            if host_module:
                file_ = f"design/Monopilot Design System/{host_module}/{file_}"
        return [f"{file_}#{comp}"]

    # Bare primitive name
    if s in PRIMITIVE_NAMES:
        return [f"primitive:{s}"]

    # Bare label-like name (snake_case word) — try to resolve via master
    if re.match(r"^[a-z][a-z0-9_]+$", s):
        # try to match as label or bare label
        if s in label_to_file:
            return [s]  # canonical master label, leave as-is (label form is OK per skill)
        if s in bare_to_master:
            cands = bare_to_master[s]
            if len(cands) == 1:
                return [cands[0]]
            # ambiguous — prefer same-module match if host_module known
            if host_module:
                same = [c for c in cands if c.startswith(host_module + "_") or c == s]
                if len(same) == 1:
                    return [same[0]]
            return [f"unresolved:{s}"]
        return [f"unresolved:{s}"]

    # Already starts with sentinel
    if s.startswith("primitive:") or s.startswith("unresolved:"):
        return [s]

    return [f"unresolved:{s}"]


def normalize_entries(entries, host_module=None):
    total = 0
    canonicalized = 0
    for e in entries:
        deps = e.get("depends_on_prototypes", [])
        new_deps = []
        for d in deps:
            normed = normalize_dep(d, host_module=host_module)
            new_deps.extend(normed)
            total += 1
            if len(normed) == 1 and normed[0] == d:
                # already canonical or unchanged
                canonicalized += 1
        # de-dupe preserving order
        seen = set()
        uniq = []
        for x in new_deps:
            if x not in seen:
                seen.add(x)
                uniq.append(x)
        e["depends_on_prototypes"] = uniq
    return total

# Apply to master
total_master_deps = normalize_entries(master, host_module=None)
log_action("HIGH9-master", f"normalized {total_master_deps} dep refs in master", "FIXED")

# Apply to each per-module index
# Note: settings, npd already in memory, written back. Let's reload everything fresh after HIGH4/5/6.
# We'll do per-module normalization in the wrap step below, treating each mod's host_module.

# =============================================================
# BLOCKER 3 + BLOCKER 2 — Wrap each per-module index
# =============================================================
WRAPPED_MODULES = []
for mod in ALL_MODULES:
    p = PL_DIR / f"prototype-index-{mod}.json"
    if not p.exists():
        log_action(f"BLOCKER3-{mod}", "file missing", "FAILED", str(p))
        continue
    with open(p) as f:
        data = json.load(f)
    if isinstance(data, dict) and "entries" in data:
        entries = data["entries"]
    else:
        entries = data

    # Normalize deps in this per-module index
    normalize_entries(entries, host_module=mod)

    wrapped = {
        "module": mod,
        "generated_at": TS,
        "generator": GENERATOR,
        "mode": "labeling",
        "entries": entries,
    }
    with open(p, "w") as f:
        json.dump(wrapped, f, indent=2, ensure_ascii=False)
    WRAPPED_MODULES.append(mod)
    log_action(f"BLOCKER3-{mod}", f"wrapped with {len(entries)} entries", "FIXED")

# Save master with HIGH4/5/6 + dep normalization
with open(PL_DIR / "master-index.json", "w") as f:
    json.dump(master, f, indent=2, ensure_ascii=False)
log_action("master-save", "saved master with HIGH4/5/6 + HIGH9 normalization", "FIXED")

# =============================================================
# HIGH 8 — Translation-notes backfill
# =============================================================
# Lists per the audit (§2.7)
MISSING_NOTES = {
    "finance": ["cost_center_gl_mapping_modal"],
    "npd": ["gate_checklist_panel", "advance_gate_modal", "gate_approval_modal", "approval_history_timeline"],
    "reporting": [
        "error_log_modal", "refresh_confirm_modal", "run_now_confirm_modal",
        "p2_toast_modal", "access_denied_modal",
        # The audit said 10 missing for reporting; list 5 — find others by scanning
    ],
}

def find_entry_by_label(module, bare_label):
    """Find entry in per-module index matching label (bare or prefixed)."""
    p = PL_DIR / f"prototype-index-{module}.json"
    with open(p) as f:
        data = json.load(f)
    entries = data["entries"] if isinstance(data, dict) else data
    for e in entries:
        if e["label"] == bare_label or e["label"].endswith("_" + bare_label):
            return e
    return None

def get_all_module_labels(module):
    p = PL_DIR / f"prototype-index-{module}.json"
    with open(p) as f:
        data = json.load(f)
    entries = data["entries"] if isinstance(data, dict) else data
    return [e["label"] for e in entries]

# For reporting, compute the actual missing set by scanning translation-notes file for each label
def compute_missing(module):
    notes_path = PL_DIR / f"translation-notes-{module}.md"
    if not notes_path.exists():
        return []
    text = notes_path.read_text()
    labels = get_all_module_labels(module)
    missing = []
    for lab in labels:
        # check both prefixed and bare
        bare = lab
        for prefix in [module + "_", "settings_", "production_", "scanner_"]:
            if bare.startswith(prefix):
                bare = bare[len(prefix):]
                break
        if (lab not in text) and (bare not in text):
            missing.append(lab)
    return missing

actual_missing = {}
for mod in ["finance", "npd", "reporting"]:
    actual_missing[mod] = compute_missing(mod)
    print(f"actual missing in {mod}: {len(actual_missing[mod])}: {actual_missing[mod]}")

def make_stub(entry):
    label = entry["label"]
    file_ = entry["file"]
    lines = entry["lines"]
    shadcn = entry.get("shadcn_equivalent")
    if isinstance(shadcn, list):
        shadcn_str = ", ".join(shadcn) if shadcn else "TBD-pending-review"
    else:
        shadcn_str = shadcn or "TBD-pending-review"
    bugs = entry.get("known_bugs")
    if isinstance(bugs, list):
        bugs_str = ", ".join(bugs) if bugs else "_none recorded_"
    else:
        bugs_str = bugs or "_none recorded_"
    return f"""
## {label} — `{file_}:{lines}`

- **shadcn equivalent:** {shadcn_str}
- **known bugs:** {bugs_str}
- **gotchas:** _to be filled when this prototype is translated; this is an audit-generated stub (2026-04-30)._
"""

stub_count = 0
for mod, labels in actual_missing.items():
    notes_path = PL_DIR / f"translation-notes-{mod}.md"
    if not notes_path.exists():
        log_action(f"HIGH8-{mod}", "notes file missing", "FAILED", str(notes_path))
        continue
    appendix = "\n\n---\n\n## Audit-generated stubs (2026-04-30)\n\nThe following entries were missing per-component sections at audit time.\n"
    for lab in labels:
        e = find_entry_by_label(mod, lab)
        if e is None:
            log_action(f"HIGH8-{mod}-{lab}", "label not found in index", "DEFERRED",
                       "could not generate stub")
            continue
        appendix += make_stub(e)
        stub_count += 1
    if labels:
        with open(notes_path, "a") as f:
            f.write(appendix)
        log_action(f"HIGH8-{mod}", f"appended {len(labels)} stubs", "FIXED")

log_action("HIGH8-total", f"appended {stub_count} stubs total", "FIXED")

# =============================================================
# README.md — document conventions for BLOCKER 2
# =============================================================
readme_path = PL_DIR / "README.md"
readme_content = """# Prototype labels

This directory contains prototype-labeling artifacts produced by the
`prototype-labeling` skill (see `.claude/skills/prototype-labeling/SKILL.md`).

## Files

- `master-index.json` — canonical, deduped index across all modules. Every entry
  carries a synthetic `module` field. Where two modules use the same bare label
  (e.g. `delete_confirm_modal`), the master form is module-prefixed
  (`maintenance_delete_confirm_modal`, `planning_delete_confirm_modal`, …).
- `prototype-index-<module>.json` — per-module index, wrapper format:
  ```json
  {
    "module": "<module>",
    "generated_at": "<ISO 8601>",
    "generator": "<model or human>",
    "mode": "labeling",
    "entries": [ ... 13-field objects ... ]
  }
  ```
  Per-module entries use **bare semantic labels** (no module prefix) for
  human readability inside the file. Uniqueness is guaranteed by the
  `(module, label)` compound key — the wrapper's `module` field provides
  disambiguation. The same bare label may appear in multiple modules
  (e.g. `delete_confirm_modal` exists in maintenance, planning, reporting).
- `translation-notes-<module>.md` — human-readable companion to each per-module
  index.
- `_archive/` — vestigial files retained for historical context only. Tools
  must not consume `_archive/` content.

## depends_on_prototypes syntax

After audit-fix-2026-04-30, every entry uses one of these forms:

- `<file-path>#<componentExport>` — canonical reference to a component in a
  specific JSX file (e.g. `design/Monopilot Design System/finance/modals.jsx#StdCostCreateModal`).
- `<bare-or-prefixed-label>` — reference to another entry's master `label`.
- `primitive:<ComponentName>` — reference to a shadcn/Radix primitive
  (Modal, Field, Btn, Topbar, …); not a project prototype.
- `unresolved:<original-text>` — sentinel for refs that could not be
  auto-canonicalized; needs human review.

## Audit history

- 2026-04-30 — `_meta/audits/2026-04-30-prototype-labeling-integrity.md`
  identified BLOCKER + HIGH defects. Remediation log:
  `_meta/audits/2026-04-30-prototype-labeling-fix-report.md`.
"""
with open(readme_path, "w") as f:
    f.write(readme_content)
log_action("BLOCKER2-readme", "wrote README.md documenting (module, label) compound key", "FIXED",
           str(readme_path))

# =============================================================
# Verification
# =============================================================
print("\n=== VERIFICATION ===")
verify_results = []

def vassert(cond, msg):
    status = "PASS" if cond else "FAIL"
    verify_results.append((status, msg))
    print(f"  [{status}] {msg}")
    return cond

# Reload master
with open(PL_DIR / "master-index.json") as f:
    master_after = json.load(f)

# 1. master count
report["after"]["master_count"] = len(master_after)
vassert(len(master_after) == 514, f"master entry count = {len(master_after)} (expected 514)")

# 2. wrapper structure
wrapper_ok = 0
total_per_module_entries = 0
per_module_files = sorted(p.name for p in PL_DIR.glob("prototype-index-*.json"))
report["after"]["per_module_files"] = per_module_files
for fn in per_module_files:
    with open(PL_DIR / fn) as f:
        d = json.load(f)
    if isinstance(d, dict) and {"module","generated_at","generator","mode","entries"} <= set(d.keys()):
        wrapper_ok += 1
        total_per_module_entries += len(d["entries"])
    else:
        print(f"    NOT WRAPPED: {fn}")
report["after"]["wrappers_count"] = wrapper_ok
vassert(wrapper_ok == len(per_module_files), f"wrappers={wrapper_ok}/{len(per_module_files)} files")

# 3. sum of entries roughly matches master
report["after"]["per_module_total_entries"] = total_per_module_entries
print(f"  per-module total entries: {total_per_module_entries}")
print(f"  master entries: {len(master_after)}")

# 4. no bare-primitive depends_on_prototypes anywhere
def list_all_deps():
    deps = []
    for e in master_after:
        for d in e.get("depends_on_prototypes", []):
            deps.append(("master", e["label"], d))
    for fn in per_module_files:
        with open(PL_DIR / fn) as f:
            d = json.load(f)
        for e in d["entries"]:
            for x in e.get("depends_on_prototypes", []):
                deps.append((fn, e["label"], x))
    return deps

all_deps = list_all_deps()
bare_primitives = [d for d in all_deps if d[2] in PRIMITIVE_NAMES]
vassert(len(bare_primitives) == 0, f"bare-primitive deps remaining: {len(bare_primitives)}")

# 5. HIGH 4-5 corrected
gate_panel = next((e for e in master_after if e["label"] == "gate_checklist_panel"), None)
vassert(gate_panel and gate_panel["ui_pattern"] == "dashboard-tile",
        f"gate_checklist_panel.ui_pattern = {gate_panel and gate_panel.get('ui_pattern')}")
hist = next((e for e in master_after if e["label"] == "approval_history_timeline"), None)
vassert(hist and hist["interaction"] == "read-only",
        f"approval_history_timeline.interaction = {hist and hist.get('interaction')}")

# 6. moved settings entries gone from settings, present in destinations
with open(PL_DIR / "prototype-index-settings.json") as f:
    settings_after = json.load(f)
settings_labels = {e["label"] for e in settings_after["entries"]}
moved_labels = set(MOVE_MAP.keys())
vassert(not (moved_labels & settings_labels),
        f"moved labels still in settings: {moved_labels & settings_labels}")

# Check destinations contain them
for label, (target_mod, _) in MOVE_MAP.items():
    if label == "shifts_screen":
        continue  # alias
    with open(PL_DIR / f"prototype-index-{target_mod}.json") as f:
        d = json.load(f)
    found = any(e["label"] == label for e in d["entries"])
    vassert(found, f"{label} present in {target_mod}")

# 7. _archive exists with warehouse-haiku files
vassert(ARCHIVE.exists(), "_archive/ exists")
vassert((ARCHIVE / "prototype-index-warehouse-haiku.json").exists(),
        "_archive/prototype-index-warehouse-haiku.json exists")
vassert((ARCHIVE / "translation-notes-warehouse-haiku.md").exists(),
        "_archive/translation-notes-warehouse-haiku.md exists")

# 8. canonical pct
canonical = 0
non_canonical = 0
unresolved = 0
primitive_sentinel = 0
total = 0
for src, lbl, d in all_deps:
    total += 1
    if d.startswith("primitive:"):
        primitive_sentinel += 1
        canonical += 1
    elif d.startswith("unresolved:"):
        unresolved += 1
    elif "#" in d:
        canonical += 1
    elif d in {e["label"] for e in master_after}:
        # bare label that resolves to master entry
        canonical += 1
    else:
        non_canonical += 1

print(f"\n  deps total: {total}")
print(f"  canonical (#  or label or primitive): {canonical} ({100*canonical/total if total else 0:.1f}%)")
print(f"  unresolved: {unresolved}")
print(f"  non-canonical (ambiguous bare): {non_canonical}")

report["after"]["deps_total"] = total
report["after"]["deps_canonical"] = canonical
report["after"]["deps_unresolved"] = unresolved
report["after"]["deps_other"] = non_canonical

# Save state for fix-report
report["verify_results"] = verify_results
with open(ROOT / "_meta/audits/_fix_state.json", "w") as f:
    json.dump(report, f, indent=2, default=str)

# Summary
print("\n=== SUMMARY ===")
passes = sum(1 for s,_ in verify_results if s == "PASS")
fails = sum(1 for s,_ in verify_results if s == "FAIL")
print(f"Verifications: {passes} PASS, {fails} FAIL")
sys.exit(0 if fails == 0 else 1)
