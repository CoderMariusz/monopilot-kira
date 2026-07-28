# RUN 13/20 — Production execution state machine and downtime

Read `AGENT-BASE.md`, `MON-domain-production`, `MON-domain-oee`, `MON-domain-settings`.

Execute an owned released WO through start/pause/resume/complete with shift, operator, downtime reason and repeated actions. Test illegal transitions, negative/zero downtime, timestamps, refresh/two-tab staleness, line/site gates, completion prerequisites and output-less completion. Reconcile elapsed/planned/run time and confirm snapshots/audit/timeline update once without duplicate events.

