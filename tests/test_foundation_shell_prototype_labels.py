import json
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
LABEL_DIR = REPO_ROOT / "_meta" / "prototype-labels"
FOUNDATION_INDEX = LABEL_DIR / "prototype-index-foundation-shell.json"
MASTER_INDEX = LABEL_DIR / "master-index.json"

EXPECTED_FOUNDATION_LABELS = [
    "foundation_shell_tokens",
    "foundation_navigation_manifest",
    "foundation_app_sidebar",
    "foundation_app_topbar",
    "foundation_app_shell_layout",
    "foundation_page_header_settings_nav",
    "foundation_scanner_frame",
    "foundation_module_route_contract",
    "foundation_browser_parity_gate",
]

# The browser parity gate is an evidence harness contract, not a reusable master
# prototype label. The master index should expose the eight reusable labels used by
# shell implementation tasks, including the module-route contract label.
EXPECTED_MASTER_FOUNDATION_LABELS = [
    label for label in EXPECTED_FOUNDATION_LABELS if label != "foundation_browser_parity_gate"
]

REQUIRED_ENTRY_FIELDS = {
    "label",
    "file",
    "lines",
    "component_type",
    "ui_pattern",
    "module",
}


def _load_json(path: Path):
    assert path.exists(), f"Required prototype-label metadata file is missing: {path}"
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def _entries(payload):
    if isinstance(payload, dict):
        entries = payload.get("entries")
    else:
        entries = payload
    assert isinstance(entries, list), "prototype label payload must be a list or an object with entries[]"
    return entries


def _entries_by_label(entries):
    by_label = {}
    for entry in entries:
        assert isinstance(entry, dict), f"prototype label entry must be an object, got {entry!r}"
        label = entry.get("label")
        assert isinstance(label, str) and label, f"prototype label entry missing label: {entry!r}"
        assert label not in by_label, f"duplicate prototype label entry: {label}"
        by_label[label] = entry
    return by_label


def _assert_prototype_file_and_line_range(entry):
    rel_file = entry["file"]
    lines = entry["lines"]
    assert isinstance(rel_file, str) and rel_file.startswith("prototypes/design/"), (
        f"{entry['label']} must cite a prototype file, got {rel_file!r}"
    )
    assert isinstance(lines, str) and "-" in lines, f"{entry['label']} must use 'start-end' lines, got {lines!r}"
    start_s, end_s = lines.split("-", 1)
    start, end = int(start_s), int(end_s)
    assert start >= 1 and end >= start, f"{entry['label']} has invalid line range {lines!r}"

    path = REPO_ROOT / rel_file
    assert path.exists(), f"{entry['label']} cites missing prototype file: {rel_file}"
    file_line_count = len(path.read_text(encoding="utf-8").splitlines())
    assert end <= file_line_count, (
        f"{entry['label']} cites {rel_file}:{lines}, but file has only {file_line_count} lines"
    )


def test_foundation_shell_index_contains_exact_nine_valid_foundation_labels():
    entries = _entries(_load_json(FOUNDATION_INDEX))
    by_label = _entries_by_label(entries)

    assert sorted(by_label) == sorted(EXPECTED_FOUNDATION_LABELS)
    assert len(by_label) == 9

    for label in EXPECTED_FOUNDATION_LABELS:
        entry = by_label[label]
        missing_fields = REQUIRED_ENTRY_FIELDS - set(entry)
        assert missing_fields == set(), f"{label} missing required fields: {sorted(missing_fields)}"
        assert entry["label"].startswith("foundation_"), f"{label} must use foundation_* label namespace"
        assert entry["module"] == "foundation", f"{label} must set module='foundation'"
        assert isinstance(entry["component_type"], str) and entry["component_type"].strip(), (
            f"{label} must declare a non-empty component_type"
        )
        assert isinstance(entry["ui_pattern"], str) and entry["ui_pattern"].strip(), (
            f"{label} must declare a non-empty ui_pattern"
        )
        _assert_prototype_file_and_line_range(entry)


def test_master_index_exposes_exact_eight_reusable_foundation_shell_labels():
    entries = _entries(_load_json(MASTER_INDEX))
    foundation_entries = [
        entry
        for entry in entries
        if isinstance(entry, dict)
        and entry.get("module") == "foundation"
        and isinstance(entry.get("label"), str)
        and entry["label"].startswith("foundation_")
    ]
    by_label = _entries_by_label(foundation_entries)

    assert sorted(by_label) == sorted(EXPECTED_MASTER_FOUNDATION_LABELS)
    assert len(by_label) == 8

    for label in EXPECTED_MASTER_FOUNDATION_LABELS:
        entry = by_label[label]
        missing_fields = REQUIRED_ENTRY_FIELDS - set(entry)
        assert missing_fields == set(), f"{label} missing required fields in master index: {sorted(missing_fields)}"
        assert entry["module"] == "foundation"
        _assert_prototype_file_and_line_range(entry)
