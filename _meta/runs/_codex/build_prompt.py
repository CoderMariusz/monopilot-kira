#!/usr/bin/env python3
"""Build a Codex implementation prompt for a 00-foundation task.
Usage: python3 build_prompt.py T-NNN  ->  writes /tmp/codex-T-NNN.md
"""
import json, sys

MODULE = '00-foundation'
BASE = f'_meta/atomic-tasks/{MODULE}/tasks'

PREAMBLE = """You are the Codex implementer for MonoPilot Kira task {t}, running inside an isolated git worktree on branch wt/{t} (integration branch = kira/long-run). Work ONLY in this worktree. DO NOT git commit (the .git metadata is outside your sandbox and commit will fail — the orchestrator commits for you). Just leave your changes in the working tree.

MANDATORY PROJECT RULES (read first):
- Read the root AGENTS.md and CLAUDE.md for hard rules.
- Wave0 lock: use `org_id` NOT `tenant_id`; RLS via `app.current_org_id()` NOT raw current_setting.
- TDD: write the failing test FIRST (RED), then implement to GREEN. Do NOT self-declare GREEN — actually RUN the tests and include the real output in your final message.
- pnpm. Commands: `pnpm install` at root to link new workspace packages; `pnpm --filter <pkg> test`; `pnpm --filter web vitest run <path>`; `pnpm lint`; `pnpm typecheck`. DB tests need a real Postgres; local Docker may be UNAVAILABLE — if so, write DB-dependent tests to RUN against process.env.DATABASE_URL when set and SKIP cleanly otherwise (the orchestrator validates real-DB behavior on a Supabase branch). Do NOT claim DB correctness from a fake/in-memory pool.
- Stay strictly within the scope_files below. Do not touch unrelated files. Migration filenames are taken verbatim from scope_files / orchestrator override — never invent numbers (current highest is 052; ask via the override note).
- Canonical owners + enum locks are sacred (see AGENTS.md). Do not fork canonical RBAC/grant/event logic — import and call it.
- At the end of your final message, include: changed files, exact commands you ran, their REAL output (pass/fail counts), and any deviations/carry-forwards.

ACCEPTANCE CRITERIA (all must pass with real test evidence):
{ac}

SCOPE FILES:
{sf}

RISK RED-LINES:
{rl}

=== TASK CONTRACT ===
"""

def build(t):
    p = f'{BASE}/{t}.json'
    d = json.load(open(p))
    pi = d.get('pipeline_inputs', {}) or {}
    ac = pi.get('acceptance_criteria', []) or []
    sf = pi.get('scope_files', []) or []
    rl = pi.get('risk_red_lines', pi.get('risk_red_line', [])) or []
    if isinstance(rl, str):
        rl = [rl]
    text = PREAMBLE.format(
        t=t,
        ac='\n'.join('  - ' + a for a in ac) or '  (none listed — infer from contract)',
        sf='\n'.join('  - ' + s for s in sf) or '  (none listed)',
        rl='\n'.join('  - ' + r for r in rl) or '  (none listed)',
    ) + d['prompt']
    out = f'/tmp/codex-{t}.md'
    open(out, 'w').write(text)
    print(f'{out} ({len(text)} chars)')

if __name__ == '__main__':
    for t in sys.argv[1:]:
        build(t)
