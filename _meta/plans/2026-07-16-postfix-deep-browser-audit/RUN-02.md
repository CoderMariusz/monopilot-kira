# RUN 02/20 — Sites, warehouses, lines, locations and infrastructure correctability

Read `AGENT-BASE.md`, `MON-domain-settings`, `MON-domain-technical`, `MON-multi-tenant-site`.

Build an owned site→warehouse→line→location/printer/dock chain. Test duplicate codes, rename propagation, timezone/civil-date behavior, inactive-parent child creation, cross-site reassignment, dependency-safe delete/deactivate/reactivate, refresh persistence, map/selector labels, and whether every created master can be corrected without orphaning children.

