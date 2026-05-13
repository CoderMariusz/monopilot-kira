// ============================================================
// SET-013 / SET-025 — Audit Log Viewer (full filterable)
// route: /settings/audit-logs
// spec: design/02-SETTINGS-UX.md §SET-025 (line 1316)
// Partition-aware paginated query. Caller's org_id only.
// ============================================================

const AUDIT_ACTION_BADGE = (action) => {
  const map = {
    insert: "badge-blue",
    update: "badge-gray",
    delete: "badge-red",
    schema_migrate: "badge-amber",
    rule_deploy: "badge-blue",
    tenant_variation_apply: "badge-amber",
  };
  return <span className={"badge " + (map[action] || "badge-gray")} style={{ fontSize: 9, textTransform: "uppercase" }}>{action.replace(/_/g, " ")}</span>;
};

const RowDiffPanel = ({ changes }) => (
  <div style={{ padding: "12px 18px", background: "var(--gray-100)" }}>
    <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--muted)", fontWeight: 600, marginBottom: 6 }}>old_data → new_data (JSON diff)</div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>Before <span className="badge badge-gray" style={{ fontSize: 9, marginLeft: 4 }}>old_data</span></div>
        <pre className="mono" style={{ margin: 0, fontSize: 11, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
{`{\n${changes.map(c => `  "${c.field}": ${JSON.stringify(c.from)}`).join(",\n")}\n}`}
        </pre>
      </div>
      <div style={{ background: "var(--green-050a)", border: "1px solid var(--green-050)", borderRadius: "var(--radius)", padding: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>After <span className="badge badge-green" style={{ fontSize: 9, marginLeft: 4 }}>new_data</span></div>
        <pre className="mono" style={{ margin: 0, fontSize: 11, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
{`{\n${changes.map(c => `  "${c.field}": ${JSON.stringify(c.to)}`).join(",\n")}\n}`}
        </pre>
      </div>
    </div>
  </div>
);

const computeDateRangePreset = (preset) => {
  const today = new Date("2026-05-13");
  const to = today.toISOString().slice(0, 10);
  const d = new Date(today);
  let days = 0;
  if (preset === "today") days = 0;
  else if (preset === "7d") days = 7;
  else if (preset === "30d") days = 30;
  else if (preset === "90d") days = 90;
  else return { from: "", to: "" };
  d.setDate(d.getDate() - days);
  return { from: d.toISOString().slice(0, 10), to };
};

const AuditLogFullScreen = () => {
  const all = window.SETTINGS_AUDIT_FULL || [];
  const today = "2026-05-13";

  // Filters
  const [dateRange, setDateRange] = React.useState(computeDateRangePreset("7d"));
  const [datePreset, setDatePreset] = React.useState("7d");
  const [userFilter, setUserFilter] = React.useState("all");
  const [actionFilter, setActionFilter] = React.useState("all");
  const [tableFilter, setTableFilter] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [expanded, setExpanded] = React.useState(null);
  const [page, setPage] = React.useState(1);
  const pageSize = 50;

  const users = Array.from(new Set(all.map(e => e.user))).sort();

  // Filtered set
  const filtered = all
    .filter(e => userFilter   === "all" || e.user === userFilter)
    .filter(e => actionFilter === "all" || e.action === actionFilter)
    .filter(e => !tableFilter  || e.table.toLowerCase().includes(tableFilter.toLowerCase()))
    .filter(e => !search       || JSON.stringify(e).toLowerCase().includes(search.toLowerCase()))
    .filter(e => {
      const d = e.at.split(" ")[0];
      return (!dateRange.from || d >= dateRange.from) && (!dateRange.to || d <= dateRange.to);
    })
    .sort((a, b) => b.at.localeCompare(a.at));

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  // Partition warning if span >30 days
  const spanDays = dateRange.from && dateRange.to ? Math.round((new Date(dateRange.to) - new Date(dateRange.from)) / 86400000) : 999;
  const partitionCount = Math.max(1, Math.ceil(spanDays / 30));
  const showWarn = spanDays > 30 && filtered.length > 200;

  // Apply preset
  const applyPreset = (p) => {
    setDatePreset(p);
    if (p === "custom") return;
    setDateRange(computeDateRangePreset(p));
    setPage(1);
  };

  const resetFilters = () => {
    setUserFilter("all"); setActionFilter("all"); setTableFilter(""); setSearch("");
    applyPreset("7d");
    setPage(1);
  };

  return (
    <>
      <PageHead
        title="Audit logs"
        sub="Full audit trail of all settings mutations. Partitioned monthly, retained 7 years. Org-scoped to your tenant only."
        actions={<>
          <button className="btn btn-secondary btn-sm">Export filtered results</button>
        </>}
      />

      {/* Org-scope notice */}
      <div className="alert alert-blue" style={{ marginBottom: 12, fontSize: 12 }}>
        Showing entries for <strong>Apex Foods Sp. z o.o.</strong> (your org). Cross-tenant viewing requires <span className="mono">impersonate.tenant</span> — not granted to your role.
      </div>

      {/* Filter bar */}
      <div className="sg-section" style={{ marginBottom: 12 }}>
        <div style={{ padding: "12px 14px" }}>
          {/* Top row: date presets */}
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
            <span className="muted" style={{ fontSize: 11, fontWeight: 600 }}>RANGE</span>
            {["today", "7d", "30d", "90d", "custom"].map((p) => (
              <button key={p} className="btn btn-sm" onClick={() => applyPreset(p)} style={{
                background: datePreset === p ? "var(--blue)" : "#fff", color: datePreset === p ? "#fff" : "var(--text)",
                border: "1px solid " + (datePreset === p ? "var(--blue)" : "var(--border)"),
                fontSize: 11, padding: "3px 10px",
              }}>{p === "today" ? "Today" : p === "custom" ? "Custom" : "Last " + p}</button>
            ))}
            {(datePreset === "custom" || dateRange.from) && (
              <>
                <input type="date" value={dateRange.from} onChange={(e) => { setDatePreset("custom"); setDateRange({ ...dateRange, from: e.target.value }); }} style={{ fontSize: 11 }} />
                <span className="muted" style={{ fontSize: 11 }}>to</span>
                <input type="date" value={dateRange.to}   onChange={(e) => { setDatePreset("custom"); setDateRange({ ...dateRange, to:   e.target.value }); }} style={{ fontSize: 11 }} />
              </>
            )}
            <span className="muted mono" style={{ fontSize: 10, marginLeft: 8 }}>~{partitionCount} partition{partitionCount > 1 ? "s" : ""} will be scanned</span>
          </div>

          {/* Second row: user / action / table / search */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} style={{ fontSize: 12, minWidth: 160 }}>
              <option value="all">All users</option>
              {users.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
            <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} style={{ fontSize: 12 }}>
              <option value="all">All actions</option>
              <option value="insert">insert</option>
              <option value="update">update</option>
              <option value="delete">delete</option>
              <option value="schema_migrate">schema_migrate</option>
              <option value="rule_deploy">rule_deploy</option>
              <option value="tenant_variation_apply">tenant_variation_apply</option>
            </select>
            <input value={tableFilter} onChange={(e) => setTableFilter(e.target.value)} placeholder="Table contains…" className="mono" style={{ width: 200, fontSize: 12 }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search field values…" style={{ flex: 1, minWidth: 180, fontSize: 12 }} />
            <button className="btn btn-ghost btn-sm" onClick={resetFilters}>Reset</button>
            <span className="muted" style={{ fontSize: 11 }}>{filtered.length} of {all.length} entries</span>
          </div>
        </div>
      </div>

      {showWarn && (
        <div className="alert alert-amber" style={{ marginBottom: 12, fontSize: 12 }}>
          <strong>Large date range.</strong> {spanDays} days span ~{partitionCount} monthly partitions. Query may take longer. Consider narrowing to ≤30 days for fast EXPLAIN-verified scans.
        </div>
      )}

      {/* Table */}
      <Section title={`Activity (${filtered.length} entries)`}>
        {filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center" }}>
            <div className="muted" style={{ fontSize: 14, marginBottom: 6 }}>No audit log entries for selected filters.</div>
            <button className="btn btn-secondary btn-sm" onClick={resetFilters}>Reset filters</button>
          </div>
        ) : (
          <>
            <table style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ width: 28 }}></th>
                  <th>Timestamp</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Table</th>
                  <th>Record ID</th>
                  <th>Changed fields</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((e) => {
                  const open = expanded === e.id;
                  return (
                    <React.Fragment key={e.id}>
                      <tr style={{ cursor: "pointer", background: open ? "var(--blue-050)" : undefined }} onClick={() => setExpanded(open ? null : e.id)}>
                        <td><span style={{ display: "inline-block", transform: open ? "rotate(90deg)" : "none", transition: "transform 0.1s", color: "var(--muted)" }}>▸</span></td>
                        <td className="mono" style={{ fontSize: 11, whiteSpace: "nowrap" }}>{e.at}</td>
                        <td style={{ fontSize: 12 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div>
                              <div style={{ fontWeight: 500 }}>{e.user}</div>
                              {e.user_email && <div className="muted mono" style={{ fontSize: 10 }}>{e.user_email}</div>}
                            </div>
                            {e.impersonating && <span className="badge badge-amber" style={{ fontSize: 9 }}>impersonating</span>}
                          </div>
                        </td>
                        <td>{AUDIT_ACTION_BADGE(e.action)}</td>
                        <td className="mono" style={{ fontSize: 11 }}>{e.table}</td>
                        <td className="mono muted" style={{ fontSize: 11 }}>{e.record_id}</td>
                        <td>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {e.changes.slice(0, 3).map((c, i) => <span key={i} className="badge badge-gray" style={{ fontSize: 9 }}>{c.field}</span>)}
                            {e.changes.length > 3 && <span className="badge badge-gray" style={{ fontSize: 9 }}>+{e.changes.length - 3} more</span>}
                          </div>
                        </td>
                        <td className="mono muted" style={{ fontSize: 11 }}>{e.ip || "—"}</td>
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan={8} style={{ padding: 0 }}><RowDiffPanel changes={e.changes} /></td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination */}
            <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="muted" style={{ fontSize: 11 }}>
                Page {page} of {totalPages} · {pageSize} rows per page
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}>← Prev</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}>Next →</button>
              </div>
            </div>
          </>
        )}
      </Section>
    </>
  );
};

Object.assign(window, { AuditLogFullScreen });
