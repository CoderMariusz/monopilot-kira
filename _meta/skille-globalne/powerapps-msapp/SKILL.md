---
name: powerapps-msapp
description: Use when inspecting, auditing, editing, or repacking a Microsoft Power Apps canvas app (.msapp file) — unpacking source, reading Power Fx YAML, extracting SharePoint/Dataverse schema, fixing delegation/App-Checker issues, authoring new screens, and producing an importable .msapp with the pac CLI.
---

# Working with Power Apps canvas apps (.msapp)

A `.msapp` is an OPC/ZIP package. You can read it with `unzip`, but to produce an **importable** modified
app you must repack with the Power Platform CLI (`pac canvas pack`). Editing the YAML and re-zipping by hand
is NOT reliable (Power Apps loads the compiled `Controls/`, and checksums matter).

## 0. One-time toolchain (macOS, no sudo)
```bash
curl -sSL https://dot.net/v1/dotnet-install.sh | bash -s -- --channel 8.0 --install-dir "$HOME/.dotnet"
export DOTNET_ROOT="$HOME/.dotnet"; export PATH="$HOME/.dotnet:$HOME/.dotnet/tools:$PATH"
export DOTNET_CLI_TELEMETRY_OPTOUT=1
# The LATEST pac dotnet tool is broken on macOS ("DotnetToolSettings.xml not found").
# Pin a working version:
dotnet tool install --global Microsoft.PowerApps.CLI.Tool --version 1.43.6
pac="$HOME/.dotnet/tools/pac"   # usually here
```
`pac canvas pack/unpack` is **preview**. `unpack` may emit `Error PA3011 Roundtrip validation failed` — this
is a known self-check bug; the sources are still written and usable. `bt-uploader/dotnet does not exist`
lines are harmless telemetry noise. `Warning PA2001 Checksum mismatch` on pack is expected after edits.

## 1. Inspect without tooling
```bash
unzip -o -q app.msapp -d raw_unpack     # note: zip uses Windows backslash paths internally
```
Top-level contents:
- `Src/*.pa.yaml`     — GA "Power Fx in YAML" source (what Studio's source view / git integration shows). CLEAN.
- `Controls/*.json`   — the compiled control tree (what the runtime actually loads).
- `References/DataSources.json` — connected data sources + embedded schema (see §3).
- `Properties.json`, `Header.json` — app metadata (DocVersion, MSAppStructureVersion).
- `AppCheckerResult.sarif` — App Checker findings (delegation, accessibility, perf). Parse with python (§4).

## 2. The TWO YAML dialects (don't mix them)
| | GA `.pa.yaml` (inside msapp, Studio view) | PASopa `.fx.yaml` (pac unpack/pack input) |
|---|---|---|
| screen | `Screens:` -> `Name:` -> `Properties:`/`Children:` | `Name As screen:` (flat) |
| control | `- ctrl:`  `Control: Label@2.5.1`  `Properties:` | `ctrl As label:` then `Prop: =expr` |
| values | every prop `=<PowerFx>` | every prop `=<PowerFx>`, `ZIndex` required |
Author for **packing** in `.fx.yaml`. Show the user the **GA `.pa.yaml`** form for Studio. Copy
`Control: Type@version` strings from existing screens so versions match.

## 3. Extract data-source schema (SharePoint/Dataverse columns)
`References/DataSources.json` -> each `ConnectedDataSourceInfo` has `DataEntityMetadataJson` = `{guid: jsonString}`;
the json string parses to an object whose columns are at `schema.items.properties`.
```python
import json
d=json.load(open('References/DataSources.json'))
ds=d['DataSources'] if isinstance(d,dict) else d
for s in ds:
    if s.get('Type')!='ConnectedDataSourceInfo': continue
    meta=s['DataEntityMetadataJson']
    for guid,val in meta.items():
        props=json.loads(val)['schema']['items']['properties']
        cols=[c for c in props if c not in ('ID','Title') and not c.startswith(('OData__','@','_x','{'))]
        print(s['Name'], len(cols), cols)
```
`DatasetName`/`webUrl` reveal the SharePoint site. Lookups appear as `Col#Id` (int) + `Col` (object).

## 4. Triage App Checker SARIF
```python
import json,collections
r=json.load(open('AppCheckerResult.sarif'))['runs'][0]['results']
print(collections.Counter(x['ruleId'] for x in r).most_common(30))
```
Priority order of rules (functional impact first):
1. `app-SuggestRemoteExecutionHint*` — **delegation**: query runs locally and silently truncates at the
   row limit (default 500, max 2000). #1 cause of "data is missing / app not working".
2. `app-ForAllWithMutation`, `app-CollectingReadOnlyTable` — side-effect / write correctness.
3. `app-CountRowsGalleryAllItems`, `app-InefficientDelayLoading` — performance.
4. `app-UnusedVariables` — dead code. `acc-*` — accessibility (real but lower urgency).

## 5. Delegation cheat-sheet (SharePoint)
Delegable: `Filter/LookUp/Search/Sort/SortByColumns` with `=, <>, <, >, <=, >=, StartsWith, And, Or, Not`.
NOT delegable (truncates): `in`, `Search` on >1 col combos, `CountRows`/`Sum`/`Average` over filtered list,
nested table ops, `LookUp` on a calculated/complex column. Fix: push filters to delegable operators, pre-load
small reference lists with `Collect` in `OnStart`, or store a delegable scalar column instead of computing.

## 6. Edit + repack workflow
```bash
pac canvas unpack --msapp app.msapp --sources ./src   # PA3011 may appear; sources still written
# add a new screen:
#   1) write ./src/Src/scrNew.fx.yaml   (.fx.yaml dialect)
#   2) append "scrNew" to ScreenOrder in ./src/CanvasManifest.json
pac canvas pack --msapp app_v2.msapp --sources ./src   # PA2001 checksum warning is fine
# verify a screen landed:
unzip -o -q app_v2.msapp -d /tmp/v && grep -rl scrNew /tmp/v   # control compiled into Controls\NNN.json
```
Always have the user **import the packed msapp into a DEV/sandbox environment first** and re-save in Studio —
the preview packer can produce subtly different output. The durable deliverable is the source + a written
guide (SharePoint columns to add + Studio steps), with the packed msapp as a testable extra.

## 7. Authoring tips
- Match existing conventions: read 1-2 existing screens for fonts, colors (often global vars like
  `gblColPrimary`), header rectangles, gallery patterns, control versions.
- New SharePoint columns are added in SharePoint (list settings), not in the msapp; the app picks them up on
  refresh. Choice/Lookup/Person columns surface as objects with `.Value`/`.Id`/`.DisplayName`.
- Test formulas for blank/zero math: wrap divisors in `If(x=0,...)` or use `Coalesce`.
