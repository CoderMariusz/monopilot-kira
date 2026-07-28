# RUN 14/20 — Consumption, FEFO, holds, substitutions and genealogy

Read `AGENT-BASE.md`, `MON-domain-production`, `MON-domain-warehouse`, `MON-domain-quality`.

On owned stock/WO, test FEFO suggestion and manual LP choice; QA/hold/expiry/site/UoM gates; exact, under, over, 0.48 and catch-weight consumption; allowed substitution/deviation; double-submit and reversal/correction. Reconcile required, consumed and remaining quantities and trace genealogy both directions after refresh. Attempt safe hold-after-selection race through UI, not APIs.

