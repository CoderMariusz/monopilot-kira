#!/usr/bin/env python3
"""Scan TS/JS files for pg parameters bound with conflicting types.

pg infers a parameter's type from its FIRST cast in the statement. A `$n`
used as both `::uuid` and bare text (or with two different casts) fails at
BIND time (22P02/42804) BEFORE any CASE/COALESCE evaluates — invisible to
mock-client tests. This caught wave-F2's only production escape
(quality_holds batch reference: `case when $1='batch' then null else $2::uuid end`
paired with a bare `$2`).

Usage:
  python3 scripts/scan-dual-cast-params.py <file.ts> [more files...]
  git diff --name-only <base> | grep '\\.ts$' | xargs python3 scripts/scan-dual-cast-params.py

Exit 0 = clean, 1 = findings (prints file / template-literal offset / param / evidence).
Heuristic: inspects every backtick template literal that looks like SQL
(contains a $n placeholder). Flags a param when it has >=2 distinct casts,
or a non-text cast plus at least one bare (uncast) occurrence.
"""
import re
import sys

FINDINGS = 0


def scan(path: str) -> None:
    global FINDINGS
    try:
        src = open(path, encoding="utf-8").read()
    except OSError as e:
        print(f"WARN cannot read {path}: {e}", file=sys.stderr)
        return
    for m in re.finditer(r"`[^`]*`", src, re.S):
        sql = m.group(0)
        if "$" not in sql:
            continue
        params = set(re.findall(r"\$(\d+)", sql))
        for p in sorted(params, key=int):
            casts = set(re.findall(r"\$" + p + r"::(\w+)", sql))
            bare = len(re.findall(r"\$" + p + r"(?![:\d])", sql))
            if len(casts) > 1 or (casts and casts != {"text"} and bare > 0):
                line = src[: m.start()].count("\n") + 1
                print(
                    f"{path}:{line}: param ${p} casts={sorted(casts)} bare_uses={bare}"
                    " — pg types a param from its first cast; split into separate params"
                )
                FINDINGS += 1


def main() -> int:
    files = sys.argv[1:]
    if not files:
        print(__doc__)
        return 2
    for f in files:
        scan(f)
    if FINDINGS:
        print(f"\n{FINDINGS} dual-typed parameter finding(s).")
        return 1
    print("clean: no dual-typed pg parameters found.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
