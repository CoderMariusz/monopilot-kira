# T-136 FA detail shell — structural parity report

Prototype anchor: prototypes/design/Monopilot Design System/npd/fa-screens.jsx:300-401 (fa_detail)

| Prototype region (lines) | Production element |
| --- | --- |
| breadcrumb eyebrow (331) | section > div.text-xs uppercase (npd.faDetail.eyebrow) |
| FA code mono (335) | span.font-mono.text-blue-700 |
| product name (336) | h1 |
| status_overall badge (337) | Badge[data-testid=fa-detail-status] (tone by status) |
| ⚡ Built badge (338) | Badge[data-testid=fa-detail-built] |
| subnav-inline tab bar (387-398) | FaTabs [data-slot=tabs-list] 8 dept triggers |
| tab bodies (402-413) | deferred-empty Card per tab; History = real FaHistoryTab (T-027) |

Deviations: 12-tab prototype reduced to 8 dept tabs per task contract (BOM/Formulations/Risks/Docs out of scope); gate-progress strip + right panel are T-137/T-138.