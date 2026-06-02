# Autonomy & Remote Operation — run unattended, watch from your phone

This run is designed to execute **unattended on a dedicated local machine** with
full tool autonomy, pushing questions/updates to your phone. This doc explains
the autonomy profile, the safety posture, and how to see/steer it from a phone.

## Autonomy profile: UNATTENDED (default for the long-run)

The orchestrator runs continuously and does **not** block at routine phase gates.
Instead it **proceeds automatically** and sends a phone push at each milestone.
It blocks for a decision **only** when one of these is true:

- **Irreversible / out-of-scope action:** force-push, history rewrite, pushing to
  `main`, deleting non-generated files it didn't create, or anything outside the
  integration branch + worktrees.
- **Genuine requirement ambiguity** it cannot resolve from the code, task JSON, or
  skills (and a wrong guess would be expensive to undo).
- **Cross-provider review deadlock** — Claude and Codex disagree after 2 rounds.
- **Skill deletion** in Phase 3.

Everything else: it picks the sensible default, logs the decision in its summary,
and continues. When it does block, it uses `AskUserQuestion` (visible in the
attached session) **and** fires a phone push so you know to weigh in.

> The orchestrator calls `bash .claude/hooks/notify.sh "<message>"` at each phase
> gate, each wave completion, and each blocking question. Set `KIRA_NOTIFY_URL`
> (see below) or those pushes are silent no-ops.

## Permission posture (full control)

`.claude/settings.json` sets `permissions.defaultMode: "bypassPermissions"`, so
Claude does **not** stop to ask permission for tool calls (no "potentially
dangerous command" prompts). A tiny `deny` list blocks only catastrophic,
self-defeating actions (force-push to main, `rm -rf /`/`~`) — these protect the
run itself, not you from Claude; empty the list if you truly want zero guardrails.

Two ways to launch with this posture:

```bash
# A) rely on the committed settings.json (defaultMode: bypassPermissions)
claude

# B) belt-and-suspenders: also pass the flag
claude --dangerously-skip-permissions
```

Use a **dedicated branch** (e.g. `kira/long-run`), never `main`. The machine
should hold nothing sensitive — bypass mode means Claude can run anything not in
the deny list.

## Phone notifications (one-way alerts)

1. Pick a hard-to-guess ntfy topic, e.g. `monopilot-kira-7f3a9c`.
2. Install the **ntfy** app on your phone, subscribe to that topic.
3. On the run machine:
   ```bash
   export KIRA_NOTIFY_URL="https://ntfy.sh/monopilot-kira-7f3a9c"
   ```
   (put it in your shell profile so it survives reboots). Any service that accepts
   a plain POST body works — ntfy is just the zero-setup default.

Now your phone buzzes on: phase-gate summaries, wave pass/fail, and "needs your
input" — even while you're away from the desk.

## Seeing AND steering from your phone (two-way)

A push tells you *that* a decision is needed; to actually **answer** from your
phone you need to reach the live session. Pick one:

### Recommended: local run inside tmux, reached over SSH

Keeps everything on your machine (so `codex-plugin-cc` + local DB + worktrees all
work) and lets you attach from a phone SSH app (Blink, Termius, Tailscale SSH):

```bash
# on the run machine
tmux new -s kira
export KIRA_NOTIFY_URL="https://ntfy.sh/<your-topic>"
cd /path/to/monopilot-kira && git switch kira/long-run
claude            # paste the master prompt; detach with Ctrl-b d
```

From the phone: SSH in, `tmux attach -t kira`, read the live transcript, type your
answer to any `AskUserQuestion`, detach again. Use **Tailscale** (or your LAN +
port-forward) so the machine is reachable without exposing SSH publicly.

### Alternative: Claude Code on the web / mobile app

`code.claude.com` sessions run in **cloud** containers that the Claude mobile app
shows and steers natively — great phone UX, but it is **not** your local machine,
so `codex-plugin-cc`, your local Postgres, and local worktrees may not be present.
Given you chose hard-wired Codex on your own machine, prefer the tmux+SSH route;
use the web route only if you move the whole run into a cloud environment that has
Codex available.

## Practical expectation

With UNATTENDED + bypass + notifications, a typical session: you paste the master
prompt before leaving, your phone pings after each phase with a one-paragraph
summary, and it only asks you to attach for the handful of real decisions above.
The Walking Skeleton (login + shell + DB-backed nav) is the first thing it makes
real, so the deployed app becomes clickable early — not at the end.
