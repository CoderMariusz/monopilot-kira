// ============ QA-001 — Quality Dashboard ============

const QaDashboard = ({ role, onNav, openModal }) => {
  const [tab, setTab] = React.useState("inspections");
  const [dismissed, setDismissed] = React.useState(new Set());
  const visibleAlerts = QA_CRITICAL_ALERTS.filter(a => !dismissed.has(a.text));

  const recentInsp = QA_INSPECTIONS.slice(0, 8);
  const recentNcrs = QA_NCRS.slice(0, 6);
  const recentReadings = QA_CCPS.flatMap(c => c.readings.map(r => ({ ...r, ccpCode: c.code, step: c.step, unit: c.unit }))).sort((a,b) => b.t.localeCompare(a.t)).slice(0, 8);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={() => onNav("dashboard")}>Quality</a> · Dashboard</div>
          <h1 className="page-title">Quality — dashboard</h1>
          <div className="muted" style={{fontSize: 12}}>WH-Factory-A · Data refreshed 12s ago · <b>Auto 60s</b></div>
        </div>
        <div className="row-flex">
          <select style={{width: 140}}><option>Today</option><option>Last 7 days</option><option>Last 30 days</option><option>Custom…</option></select>
          <select style={{width: 160}} disabled><option>WH-Factory-A (locked P1)</option></select>
          <button className="btn btn-secondary btn-sm">↻ Refresh</button>
        </div>
      </div>

      {/* KPI row — 6 cards */}
      <div className="kpi-row" style={{gridTemplateColumns: "repeat(6, 1fr)"}}>
        {QA_KPIS.map(k => (
          <div key={k.k} className={"kpi " + k.accent} onClick={() => onNav(k.target)}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Critical Alerts panel */}
      {visibleAlerts.length > 0 ? (
        <div className="critical-panel">
          <div className="critical-panel-head">
            <span style={{fontSize: 16}}>⚠</span>
            <h3>Critical Quality Alerts</h3>
            <span className="badge badge-red" style={{fontSize: 10}}>{visibleAlerts.length} active</span>
            <span className="spacer"></span>
            <a style={{fontSize: 11, color: "var(--blue)", cursor: "pointer"}}>View all →</a>
          </div>
          <div className="critical-alert-grid">
            {visibleAlerts.slice(0, 4).map((a, i) => (
              <div key={i} className="critical-alert-card">
                <div className="cac-type">{a.type} · <SeverityBadge s={a.severity}/></div>
                <div style={{fontSize: 12}}>{a.text}</div>
                <div style={{marginTop: 8, display: "flex", gap: 8}}>
                  <button className="btn btn-primary btn-sm" onClick={() => onNav(a.link === "ccp_dev" ? "ccpdev" : a.link)}>Investigate →</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setDismissed(new Set([...dismissed, a.text]))}>Dismiss</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="alert-box alert-green" style={{marginBottom: 14, fontSize: 12}}><span>✓</span><div>No critical quality alerts — all systems normal.</div></div>
      )}

      {/* Tabbed recent records */}
      <div className="card" style={{padding: 0}}>
        <div className="tabs-bar" style={{padding: "4px 14px 0", borderBottom: "1px solid var(--border)"}}>
          <button className={"tab-btn " + (tab === "inspections" ? "on" : "")} onClick={() => setTab("inspections")}>Inspections <span className="count">{QA_INSPECTIONS.length}</span></button>
          <button className={"tab-btn " + (tab === "ncrs" ? "on" : "")} onClick={() => setTab("ncrs")}>NCRs <span className="count">{QA_NCRS.length}</span></button>
          <button className={"tab-btn " + (tab === "haccp" ? "on" : "")} onClick={() => setTab("haccp")}>HACCP Monitoring <span className="count">{recentReadings.length}</span></button>
        </div>

        {tab === "inspections" && (
          <table>
            <thead><tr><th>Inspection #</th><th>Type</th><th>Product</th><th>Status</th><th>Inspector</th><th>Scheduled</th></tr></thead>
            <tbody>
              {recentInsp.map(i => (
                <tr key={i.id} style={{cursor: "pointer"}} onClick={() => onNav("incoming")}>
                  <td><span className="dcode">{i.id}</span></td>
                  <td><span className="qa-badge badge-pending">Incoming</span></td>
                  <td>{i.product}</td>
                  <td><StatusBadge s={i.status}/></td>
                  <td style={{fontSize: 11}}>{i.assignedTo || <span className="muted">Unassigned</span>}</td>
                  <td className="mono" style={{fontSize: 11}}>{i.scheduled}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === "ncrs" && (
          <table>
            <thead><tr><th>NCR #</th><th>Title</th><th>Severity</th><th>Status</th><th>Detected by</th><th>Response due</th></tr></thead>
            <tbody>
              {recentNcrs.map(n => (
                <tr key={n.id} style={{cursor: "pointer"}} onClick={() => onNav("ncr")} className={n.overdue ? "row-overdue" : ""}>
                  <td><span className="dcode">{n.id}</span></td>
                  <td style={{fontSize: 11}}>{n.title}</td>
                  <td><SeverityBadge s={n.severity}/></td>
                  <td><StatusBadge s={n.status}/></td>
                  <td style={{fontSize: 11}}>{n.source.type}</td>
                  <td style={{fontSize: 11}} className={n.overdue ? "" : ""}>
                    <span className="mono" style={{color: n.overdue ? "var(--red-700)" : "var(--text)"}}>{n.responseDue}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === "haccp" && (
          <table>
            <thead><tr><th>CCP</th><th>Step</th><th>Measured</th><th>Within limits</th><th>Recorded by</th><th>Recorded at</th></tr></thead>
            <tbody>
              {recentReadings.map((r, i) => (
                <tr key={i} style={{cursor: "pointer"}} onClick={() => onNav("ccp")}>
                  <td><span className="dcode">{r.ccpCode}</span></td>
                  <td style={{fontSize: 11}}>{r.step}</td>
                  <td className="mono" style={{fontSize: 11}}>{r.v} {r.unit}</td>
                  <td><ResultBadge r={r.within ? "pass" : "fail"}/></td>
                  <td style={{fontSize: 11}}>{r.user}</td>
                  <td className="mono" style={{fontSize: 11}}>{r.t}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{textAlign: "center", padding: "10px 0"}}>
          <a style={{fontSize: 12, color: "var(--blue)", cursor: "pointer"}} onClick={() => onNav(tab === "inspections" ? "incoming" : tab === "ncrs" ? "ncr" : "ccp")}>
            View all {tab} →
          </a>
        </div>
      </div>

      {/* Quick actions bar */}
      <div style={{marginTop: 14, display: "flex", gap: 8, justifyContent: "flex-end"}}>
        <button className="btn btn-secondary btn-sm" onClick={() => onNav("audit")}>📜 Audit Trail</button>
        <button className="btn btn-secondary btn-sm" onClick={() => openModal("holdCreate")}>＋ Create Hold</button>
        <button className="btn btn-secondary btn-sm" onClick={() => openModal("ncrCreate")}>＋ Create NCR</button>
        <button className="btn btn-primary btn-sm" onClick={() => openModal("ccpReading")}>＋ New Inspection / Reading</button>
      </div>
    </>
  );
};

Object.assign(window, { QaDashboard });
