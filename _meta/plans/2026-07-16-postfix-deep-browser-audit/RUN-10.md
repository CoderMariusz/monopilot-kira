# RUN 10/20 — Transfer orders and cross-site conservation

Read `AGENT-BASE.md`, `MON-domain-planning`, `MON-domain-warehouse`, `MON-multi-tenant-site`.

Create an owned TO with duplicate product lines and mixed quantities/UoM. Test same-warehouse/self-transfer guard, edit after release, partial ship/receipt, over-receipt, cancel/reversal, double-submit and refresh. Reconcile each item/UoM separately across source stock, in-transit and destination stock; verify civil dates, site/warehouse selectors, status transitions and CRUD/correctability.

