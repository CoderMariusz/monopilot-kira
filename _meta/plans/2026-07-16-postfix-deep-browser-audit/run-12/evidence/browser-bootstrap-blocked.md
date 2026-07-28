# RUN 12 browser bootstrap evidence

- Attempted at: 2026-07-18 (Europe/London session)
- Target: `https://monopilot-kira.vercel.app`
- Expected deployment supplied by the run contract:
  `dpl_F8hRCBXB7tdWmNKqMHD7LxnMy3Vm` /
  `2eb57cf7b90c23d4c55afeb01116eaabc3250385`
- No production page was reached and no production record was read or mutated.

## Browser-client results

1. Runtime-selected browser:
   `agent.browsers.getForUrl("https://monopilot-kira.vercel.app/")`
   returned `No browser is available`.
2. The prescribed bootstrap troubleshooting was read and
   `agent.browsers.list()` returned `[]`.
3. After the orchestrator independently reported an IAB backend, the exact
   explicit selection `agent.browsers.get("iab")` returned
   `Browser is not available: iab`.

## Disallowed fallback avoided

The shared Playwright/Chrome profile reported that it was already in use by
another process. No second browser was launched, no profile files were removed,
and no process was killed. The run stopped rather than bypassing the
single-browser/sequential-auditor contract.
