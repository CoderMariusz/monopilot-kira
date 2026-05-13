// ============================================================
// SET-033 — Schema Migrations Queue
// route: /settings/schema/migrations
// spec: design/02-SETTINGS-UX.md §SET-033 (line 683)
// Tracks L1 promotion requests from submitted to completed/rolled-back.
// ============================================================

const MIGRATION_STATUS_BADGE = (status) => {
  const map = {
    pending:     { cls: "badge-amber", label: "Pending"     },
    approved:    { cls: "badge-blue",  label: "Approved"    },
    running:     { cls: "badge-blue",  label: "Running…",   pulse: true },
    completed:   { cls: "badge-green", label: "Completed"   },
    failed:      { cls: "badge-red",   label: "Failed"      },
    rolled_back: { cls: "badge-gray",  label: "Rolled back" },
  };
  const m = map[status] || { cls: "badge-gray", label: status };
  return (
    <span className={"badge " + m.cls} style={{ fontSize: 10, position: "relative" }}>
      {m.pulse && <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 3, background: "currentColor", marginRight: 4, animation: "smq-pulse 1.2s ease-in-out infinite" }} />}
      {m.label}
    </span>
  );
};

// Crude SQL highlighter — wraps keywords/strings in tinted spans.
const sqlKeywords = /\b(BEGIN|COMMIT|ROLLBACK|ALTER|TABLE|ADD|COLUMN|IF|NOT|EXISTS|UPDATE|SET|WHERE|FROM|AND|OR|INSERT|INTO|VALUES|DELETE|CREATE|DROP|REFERENCES|SELECT|NULL|TRUE|FALSE|INTEGER|TEXT|UUID|VARCHAR|TIMESTAMP|BOOLEAN)\b/g;
const sqlComments = /(--[^\n]*)/g;
const sqlStrings  = /('[^']*')/g;
const highlightSql = (sql) => {
  // Tokenize by replacing each match with a sentinel and rebuilding.
  // Keep it simple — we render lines individually so React can place spans.
  const tokens = [];
  let working = sql.replace(sqlComments, (m) => { tokens.push({ k: "c", v: m }); return `\u0000${tokens.length - 1}\u0000`; });
  working    = working.replace(sqlStrings,  (m) => { tokens.push({ k: "s", v: m }); return `\u0000${tokens.length - 1}\u0000`; });
  working    = working.replace(sqlKeywords, (m) => { tokens.push({ k: "k", v: m }); return `\u0000${tokens.length - 1}\u0000`; });
  const parts = working.split(/\u0000(\d+)\u0000/);
  return parts.map((p, i) => {
    if (i % 2 === 0) return p;
    const tok = tokens[parseInt(p, 10)];
    const color = tok.k === "k" ? "var(--blue-700)" : tok.k === "s" ? "var(--green-700)" : "var(--muted)";
    const weight = tok.k === "k" ? 600 : 400;
    const fontStyle = tok.k === "c" ? "italic" : "normal";
    return <span key={"t" + i} style={{ color, fontWeight: weight, fontStyle }}>{tok.v}</span>;
  });
};

const TimelineDot = ({ status }) => {
  const color = status === "completed" ? "var(--green)" : status === "failed" ? "var(--red)" : status === "rolled_back" ? "var(--gray-500)" : status === "running" ? "var(--blue)" : "var(--amber)";
  return <span style={{ width: 8, height: 8, borderRadius: 4, background: color, display: "inline-block" }} />;
};

const MigrationDetailPanel = ({ row, onCollapse }) => (
  <tr className="smq-detail">
    <td colSpan={8} style={{ background: "var(--gray-100)", padding: 0 }}>
      <div style={{ padding: "16px 18px", display: "grid", gridTemplateColumns: "1fr 280px", gap: 18 }}>
        {/* SQL panel (read-only CodeMirror-like) */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--muted)", fontWeight: 600 }}>Migration script</div>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <span className="badge badge-gray" style={{ fontSize: 9 }}>SQL</span>
              <span className="badge badge-gray" style={{ fontSize: 9 }}>Read only</span>
            </div>
          </div>
          <pre style={{ margin: 0, padding: 12, background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", fontSize: 11.5, lineHeight: 1.55, fontFamily: "ui-monospace, SFMono-Regular, monospace", whiteSpace: "pre-wrap", maxHeight: 320, overflow: "auto" }}>
{row.migration_script.split("\n").map((line, i) => (
  <div key={i} style={{ display: "flex", gap: 12 }}>
    <span style={{ color: "var(--gray-300)", userSelect: "none", textAlign: "right", minWidth: 24 }}>{i + 1}</span>
    <span style={{ flex: 1 }}>{highlightSql(line)}</span>
  </div>
))}
          </pre>

          {row.result_notes && (
            <div className={"alert " + (row.status === "failed" ? "alert-red" : row.status === "rolled_back" ? "alert-amber" : row.status === "running" ? "alert-blue" : "alert-blue")} style={{ marginTop: 10, fontSize: 12 }}>
              <strong style={{ marginRight: 6 }}>Notes:</strong>{row.result_notes}
            </div>
          )}
        </div>

        {/* Timeline */}
        <div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--muted)", fontWeight: 600, marginBottom: 6 }}>Timeline</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px", background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
            {row.timeline.map((t, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "12px 1fr", gap: 8, alignItems: "flex-start" }}>
                <div style={{ paddingTop: 4 }}><TimelineDot status={t.status} /></div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{t.note}</div>
                  <div className="muted mono" style={{ fontSize: 10 }}>{t.at}</div>
                </div>
              </div>
            ))}
          </div>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 10, width: "100%" }} onClick={onCollapse}>Collapse ↑</button>
        </div>
      </div>
    </td>
  </tr>
);

const SchemaMigrationsScreen = ({ openModal, onOpenDiff }) => {
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [expanded, setExpanded] = React.useState(null);

  const rows = window.SETTINGS_MIGRATIONS;
  const filtered = rows.filter((r) => statusFilter === "all" || r.status === statusFilter);

  const counts = rows.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});

  return (
    <>
      <style>{`@keyframes smq-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
      <PageHead
        title="Schema migrations queue"
        sub="Track L1 promotion requests from submission to completion. Reviewed and executed by MonoPilot superadmin."
        actions={<>
          <button className="btn btn-secondary btn-sm">Export queue CSV</button>
        </>}
      />

      <div className="alert alert-blue" style={{ marginBottom: 12, fontSize: 12 }}>
        Admins can <strong>request</strong> L1 promotions from the column wizard or schema browser. Approval and execution are handled by the MonoPilot superadmin team.
      </div>

      {/* Filter pills */}
      <div className="sg-section" style={{ marginBottom: 12 }}>
        <div style={{ padding: "10px 14px", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {[
            { code: "all",          label: "All",          count: rows.length },
            { code: "pending",      label: "Pending",      count: counts.pending      || 0 },
            { code: "approved",     label: "Approved",     count: counts.approved     || 0 },
            { code: "running",      label: "Running",      count: counts.running      || 0 },
            { code: "completed",    label: "Completed",    count: counts.completed    || 0 },
            { code: "failed",       label: "Failed",       count: counts.failed       || 0 },
            { code: "rolled_back",  label: "Rolled back",  count: counts.rolled_back  || 0 },
          ].map((p) => {
            const on = statusFilter === p.code;
            return (
              <button key={p.code} className="btn btn-sm" onClick={() => setStatusFilter(p.code)}
                style={{
                  background: on ? "var(--blue)" : "#fff",
                  color: on ? "#fff" : "var(--text)",
                  border: "1px solid " + (on ? "var(--blue)" : "var(--border)"),
                  display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", fontSize: 12, borderRadius: 14,
                }}>
                {p.label}
                <span style={{ background: on ? "rgba(255,255,255,0.2)" : "var(--gray-050)", borderRadius: 8, padding: "0 6px", fontSize: 10 }}>{p.count}</span>
              </button>
            );
          })}
          <span className="muted" style={{ marginLeft: "auto", fontSize: 11 }}>{filtered.length} of {rows.length} migrations</span>
        </div>
      </div>

      {/* Table */}
      <Section title="Migration requests">
        {filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center" }}>
            <div className="muted" style={{ fontSize: 14, marginBottom: 6 }}>No migration requests for the selected filter.</div>
            <button className="btn btn-secondary btn-sm" onClick={() => setStatusFilter("all")}>Show all</button>
          </div>
        ) : (
          <table style={{ width: "100%" }}>
            <thead>
              <tr>
                <th style={{ width: 28 }}></th>
                <th>Migration ID</th>
                <th>Table / Column</th>
                <th>Action</th>
                <th>Requested by</th>
                <th>Requested at</th>
                <th>Approved by</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const open = expanded === r.id;
                return (
                  <React.Fragment key={r.id}>
                    <tr style={{ cursor: "pointer", background: open ? "var(--blue-050)" : undefined }} onClick={() => setExpanded(open ? null : r.id)}>
                      <td><span style={{ display: "inline-block", transform: open ? "rotate(90deg)" : "none", transition: "transform 0.1s", color: "var(--muted)" }}>▸</span></td>
                      <td className="mono" style={{ fontSize: 11 }}>{r.id}</td>
                      <td><span className="mono" style={{ fontSize: 12 }}>{r.table} / {r.col}</span></td>
                      <td><span className="badge badge-gray" style={{ fontSize: 9 }}>{r.action}</span></td>
                      <td style={{ fontSize: 12 }}>{r.requested_by}</td>
                      <td className="mono muted" style={{ fontSize: 11 }}>{r.requested_at}</td>
                      <td style={{ fontSize: 12 }}>{r.approved_by || <span className="muted">—</span>}</td>
                      <td>{MIGRATION_STATUS_BADGE(r.status)}</td>
                      <td style={{ textAlign: "right" }}>
                        <button className="btn btn-ghost btn-sm" title="View migration script" onClick={(e) => { e.stopPropagation(); setExpanded(open ? null : r.id); }}>👁 View</button>
                        {onOpenDiff && <button className="btn btn-ghost btn-sm" title="Open schema diff" onClick={(e) => { e.stopPropagation(); onOpenDiff(r.id); }} style={{ marginLeft: 4 }}>⇆ Diff</button>}
                        {r.status === "pending" && (
                          <button className="btn btn-ghost btn-sm" title="Cancel" onClick={(e) => { e.stopPropagation(); /* cancel mock */ }} style={{ color: "var(--red-700)", marginLeft: 4 }}>✕ Cancel</button>
                        )}
                      </td>
                    </tr>
                    {open && <MigrationDetailPanel row={r} onCollapse={() => setExpanded(null)} />}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>
    </>
  );
};

Object.assign(window, { SchemaMigrationsScreen });
