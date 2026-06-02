# Autonomy & Remote Operation — run unattended, watch from your phone

This run is designed to execute **unattended on a dedicated local machine** with
full tool autonomy, pushing questions/updates to your phone. This doc explains
the autonomy profile, the safety posture, and how to see/steer it from a phone.

## Autonomy profile: UNATTENDED (default for the long-run)

The orchestrator runs continuously and does **not** block at routine phase/wave
gates. Instead it **proceeds automatically** and sends a phone push at each
milestone. There is **one routine stop by design — the module sign-off** (Phase
4): it finishes a whole module autonomously, presents the sign-off report, and
waits for your review before the next module. Apart from that, it blocks for a
decision **only** when one of these is true:

- **Module sign-off** — a module's buildable scope is done + Claude/Codex agree; it presents `_meta/runs/<NN>-SIGNOFF.md` and waits for your review/comments (this is the point you actually look at the product).
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

A push tells you *that* a decision is needed; to actually **read and answer** from
your phone, Claude Code has an official feature for exactly this — you do **not**
have to sit at the computer.

### Primary: Remote Control (this is the "dispatcher" you saw)

`claude remote-control` (server mode) or **`/remote-control`** inside a running
session shows a QR code + URL. Scan it with the **Claude phone app** (or open the
URL in a mobile browser) and your phone now drives the **same session running on
your Mac** — you read the live transcript, send messages/commands, and answer
`AskUserQuestion` prompts. Files, MCP servers, `codex-plugin-cc`, local Postgres
and worktrees all stay local and remain available. Docs:
https://code.claude.com/docs/en/remote-control

- **Mobile push:** with Remote Control active and recent Claude Code, enable
  `/config` → **Push when Claude decides** so the phone app buzzes when Claude
  finishes a long step or needs you (in addition to our `KIRA_NOTIFY_URL` push).
- **Limits (important):** the local Claude **process must stay alive** — so start
  it **inside `tmux`** (or `screen`) so a closed terminal/SSH drop doesn't kill it.
  A network outage > ~10 min times the remote link out (reconnect from the app).
  You can't reattach to a session whose local process already exited.

### Also useful: Channels (message the session from chat apps)

Connect a **Channel** (Telegram / Discord / iMessage) and forward messages into
the running session — Claude reads and reacts to them while you're away. Good for
firing off a quick instruction without opening the app's session view. Docs:
https://code.claude.com/docs/en/channels

### Fallback: tmux + SSH

If you'd rather not use Remote Control: run inside `tmux`, SSH in from a phone SSH
app (Blink/Termius) over **Tailscale**, and `tmux attach -t kira` to read/type
directly. Always works, no app dependency, but it's a raw terminal.

### What about Claude Code on the web?

`claude.ai/code` sessions are natively phone-visible but run in **Anthropic
cloud** containers, not your Mac — so `codex-plugin-cc`, local Postgres and local
worktrees may be absent. You chose hard-wired Codex on your own machine, so use
**Remote Control on the local run**; only move to the web route if you relocate
the whole run to a cloud env that has Codex.

## Recommended launch (everything wired)

```bash
# on your Mac
export KIRA_NOTIFY_URL="https://ntfy.sh/<your-topic>"   # one-way push backup
git switch kira/long-run
tmux new -s kira                                         # keeps the process alive
claude --dangerously-skip-permissions                    # paste the master prompt
#   then, inside the session:  /remote-control           # scan QR with phone app
#   (optionally)               connect a Channel
#   detach the terminal:       Ctrl-b d   (session keeps running)
```

## Practical expectation

You paste the master prompt before leaving and detach. Your phone pings on every
milestone (our `notify.sh` push + Remote Control's "Push when Claude decides").
The run is **module by module**: it builds a whole module autonomously, then
**STOPS at the module sign-off** and pings "Module NN ready for review". You open
the Claude app (Remote Control), read the sign-off + task→feature map, click the
module on the deployed Vercel/Supabase app, and reply with what's wrong — Claude
triages each comment (other-module gap vs. missing task here) and continues. The
Walking Skeleton (login + shell + DB-backed nav) is made real first, so the
deployed app is clickable early — not at the end.
