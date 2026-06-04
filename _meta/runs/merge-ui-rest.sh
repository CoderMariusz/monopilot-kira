#!/usr/bin/env bash
set -uo pipefail
cd /Users/mariuszkrawczyk/Projects/monopilot-kira
union_json() {
python3 - "$1" <<'PY'
import sys,json,subprocess
f=sys.argv[1]
def show(s):
    return subprocess.run(['git','show',f'{s}:{f}'],capture_output=True,text=True).stdout
o_s,t_s=show(':2'),show(':3')
if not o_s.strip() or not t_s.strip():
    open(f,'w').write(o_s if o_s.strip() else t_s); sys.exit(0)
o=json.loads(o_s); t=json.loads(t_s)
def dm(a,b):
    for k,v in b.items(): a[k]=dm(a[k],v) if k in a and isinstance(a.get(k),dict) and isinstance(v,dict) else v
    return a
json.dump(dm(o,t),open(f,'w'),ensure_ascii=False,indent=2); open(f,'a').write('\n')
PY
}
union_pkg() {
python3 - "$1" <<'PY'
import sys,json,subprocess
f=sys.argv[1]
o=json.loads(subprocess.run(['git','show',':2:'+f],capture_output=True,text=True).stdout)
t=json.loads(subprocess.run(['git','show',':3:'+f],capture_output=True,text=True).stdout)
for sec in ('dependencies','devDependencies','scripts'):
    if sec in t: o.setdefault(sec,{}); o[sec].update(t[sec]); o[sec]=dict(sorted(o[sec].items()))
json.dump(o,open(f,'w'),indent=2); open(f,'a').write('\n')
PY
}
for T in T-079 T-108 T-109 T-110 T-128 T-129; do
  W=/Users/mariuszkrawczyk/Projects/kira-wt/$T
  git -C "$W" add -A >/dev/null 2>&1
  git -C "$W" commit -q -m "feat(01-npd): $T (Wave D UI) — parity, real data, tsc0. kira-ui

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" >/dev/null 2>&1
  git merge --no-ff "wt/$T" -m "merge(01-npd): $T [Wave D]" >/dev/null 2>&1
  had=$(git diff --name-only --diff-filter=U)
  if [ -z "$had" ]; then echo "$T merged clean"; continue; fi
  bad=0
  while IFS= read -r cf; do
    [ -z "$cf" ] && continue
    case "$cf" in
      *i18n/*.json) union_json "$cf"; git add "$cf" ;;
      *package.json) union_pkg "$cf"; git add "$cf" ;;
      pnpm-lock.yaml) git checkout --ours "$cf" 2>/dev/null; git add "$cf" ;;
      *) echo "$T UNRESOLVED: $cf"; bad=1 ;;
    esac
  done <<< "$had"
  if [ "$bad" -eq 0 ] && [ -z "$(git diff --name-only --diff-filter=U)" ]; then
    git commit -q --no-edit && echo "$T merged(resolved)"
  else echo "$T ABORT"; git merge --abort; fi
done
