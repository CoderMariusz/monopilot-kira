# T-136 FA detail shell — structural parity report

Prototype anchor: prototypes/design/Monopilot Design System/npd/fa-screens.jsx:300-401 (fa_detail)

| Prototype region (lines) | Production element |
| --- | --- |
| breadcrumb eyebrow (331) | section > div.text-xs uppercase (npd.faDetail.eyebrow) |
| FA code mono (335) | span.font-mono.text-blue-700 |
| product name (336) | h1 |
| status_overall badge (337) | Badge[data-testid=fa-detail-status] (tone by status) |
| ⚡ Built badge (338) | Badge[data-testid=fa-detail-built] |
| subnav-inline tab bar (387-398) | FaTabs [data-slot=tabs-list] 3 SECTION triggers (Core / Commercial & Planning / Production & Technical) + BOM + History (A3 SLICE 2) |
| tab bodies (402-413) | FaSectionWrapper stacks the unchanged dept bodies per section; History = real FaHistoryTab (T-027); BOM = real FaBomTab (SCR-03h, Lane 12) |

Deviations: A3 SLICE 2 regroups the 7 dept tabs into 3 owner-facing sections (Core / Commercial+Planning+Procurement / Production+Technical+MRP) reusing the dept-tab components verbatim; BOM + History keep their own tabs; the flat 7-dept DeptStatusStrip is unchanged so per-dept gates survive; Formulations/Risks/Docs out of scope here; gate-progress strip + right panel are T-137/T-138.