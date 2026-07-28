# RUN 09/20 — MRP netting, dates and mixed supply

Read `AGENT-BASE.md`, `MON-domain-planning`, `MON-domain-warehouse`, `MON-domain-technical`.

Build or identify owned demand with on-hand, open PO, open WO, safety stock, reorder/lot rules and blocked supplier. Run MRP at boundary horizons and sites. Manually calculate gross demand, scheduled receipts, projected balance, net requirements and lot rounding. Test rerun idempotency, suggested-order acceptance/edit/delete, date propagation, inactive item/supplier behavior, stale cache and site leakage.

