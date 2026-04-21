// ============ QA-009 NCR List + QA-009a NCR Detail ============

const QaNcrList = ({ onOpenNcr, onNav, openModal }) => {
  const [status, setStatus] = React.useState("all");
  const [severity, setSeverity] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [type, setType] = React.useState("all");
  const [selected, setSelected] = React.useState(new Set());

  const visible = QA_NCRS.filter(n =>
    (status === "all" || n.status === status) &&
    (severity === "all" || n.severity === severity) &&
    (type === "all" || n.type === type) &&
    (!search || n.id.toLowerCase().includes(search.toLowerCase()) || n.title.toLowerCase().includes(search.toLowerCase()))
  );

  const counts = {
    draft: QA_NCRS.filter(n => n.status === "draft").length,
    open: QA_NCRS.filter(n => n.status === "open").length,
    invest: QA_NCRS.filter(n => n.status === "investigating").length,
    capa: 0,
    closed: QA_NCRS.filter(n => n.status === "closed").length,
    overdue: QA_NCRS.filter(n => n.overdue).length,
    critOpen: QA_NCRS.filter(n => n.severity === "critical" && (n.status !== "closed" && n.status !== "cancelled")).length,
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={() => onNav("dashboard")}>Quality</a> · NCR</div>
          <h1 className="page-title">Non-Conformance Reports</h1>
          <div className="muted" style={{fontSize: 12}}>{QA_NCRS.length} total · {counts.open + counts.invest} open · {counts.closed} closed · Avg resolution 2.8d</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm">⇪ Export</button>
          <button className="btn btn-primary btn-sm" onClick={() => openModal("ncrCreate")}>＋ Create NCR</button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="kpi-row" style={{gridTemplateColumns: "repeat(4, 1fr)"}}>
        <div className="kpi red"><div className="kpi-label">Open NCRs</div><div className="kpi-value">{counts.open + counts.invest}</div><div className="kpi-sub">Draft + open + investigating</div></div>
        <div className="kpi red"><div className="kpi-label">Overdue</div><div className="kpi-value">{counts.overdue}</div><div className="kpi-sub">Past response_due_at</div></div>
        <div className="kpi red"><div className="kpi-label">Critical open</div><div className="kpi-value">{counts.critOpen}</div><div className="kpi-sub">Escalated within 24h</div></div>
        <div className="kpi"><div className="kpi-label">Avg resolution (days)</div><div className="kpi-value">2.8</div><div className="kpi-sub">Rolling 30d</div></div>
      </div>

      {/* Kanban-style pipeline */}
      <div className="kanban-strip">
        <div className="kanban-col draft"  onClick={() => setStatus("draft")}><div className="kc-label">Draft</div><div className="kc-count">{counts.draft}</div></div>
        <div className="kanban-col open"   onClick={() => setStatus("open")}><div className="kc-label">Open</div><div className="kc-count">{counts.open}</div></div>
        <div className="kanban-col invest" onClick={() => setStatus("investigating")}><div className="kc-label">Investigating</div><div className="kc-count">{counts.invest}</div></div>
        <div className="kanban-col capa"><div className="kc-label">Awaiting CAPA (P2)</div><div className="kc-count">—</div></div>
        <div className="kanban-col closed" onClick={() => setStatus("closed")}><div className="kc-label">Closed</div><div className="kc-count">{counts.closed}</div></div>
      </div>

      <div className="filter-bar">
        <input type="text" placeholder="Search NCR # or title…" value={search} onChange={e => setSearch(e.target.value)} style={{width: 260}}/>
        <select value={status} onChange={e => setStatus(e.target.value)} style={{width: 140}}>
          <option value="all">All statuses</option>
          <option value="draft">Draft</option><option value="open">Open</option><option value="investigating">Investigating</option><option value="closed">Closed</option>
        </select>
        <div className="pills">
          {["all", "critical", "major", "minor"].map(s => (
            <button key={s} className={"pill " + (severity === s ? "on" : "")} onClick={() => setSeverity(s)}>{s === "all" ? "All severity" : s}</button>
          ))}
        </div>
        <select value={type} onChange={e => setType(e.target.value)} style={{width: 160}}>
          <option value="all">All types</option>
          <option value="quality">Quality</option><option value="yield_issue">Yield issue</option>
          <option value="allergen_deviation">Allergen deviation</option><option value="supplier">Supplier</option>
          <option value="process">Process</option><option value="complaint_related">Complaint-related</option>
        </select>
        <span className="spacer"></span>
        <button className="clear-all" onClick={() => { setSearch(""); setStatus("all"); setSeverity("all"); setType("all"); }}>Clear</button>
        <span className="muted" style={{fontSize: 12}}>{visible.length} rows</span>
      </div>

      {selected.size > 0 && (
        <div className="card" style={{padding: "8px 14px", marginBottom: 10, background: "var(--blue-050)"}}>
          <div className="row-flex"><b>{selected.size} selected</b><span className="spacer"></span>
            <button className="btn btn-secondary btn-sm">Assign selected</button>
            <button className="btn btn-secondary btn-sm">⇪ Export selected</button>
          </div>
        </div>
      )}

      <div className="card" style={{padding: 0}}>
        <table>
          <thead>
            <tr>
              <th style={{width: 32}}><input type="checkbox" onChange={() => setSelected(selected.size ? new Set() : new Set(visible.map(n => n.id)))}/></th>
              <th>NCR #</th><th>Title</th><th>Severity</th><th>Type</th><th>Status</th>
              <th>Source</th><th>Detected</th><th>Response due</th><th>Assigned to</th><th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map(n => {
              const toggle = e => { e.stopPropagation(); const nx = new Set(selected); if (nx.has(n.id)) nx.delete(n.id); else nx.add(n.id); setSelected(nx); };
              const rowCls = n.overdue ? "row-overdue" : n.severity === "critical" ? "row-critical" : "";
              return (
                <tr key={n.id} className={rowCls} style={{cursor: "pointer"}} onClick={() => onOpenNcr(n.id)}>
                  <td onClick={toggle}><input type="checkbox" checked={selected.has(n.id)} onChange={() => {}}/></td>
                  <td><span className="dcode">{n.id}</span></td>
                  <td style={{fontSize: 11, maxWidth: 240}} title={n.title}>{n.title.substring(0, 60)}{n.title.length > 60 ? "…" : ""}</td>
                  <td><SeverityBadge s={n.severity}/></td>
                  <td><span className="qa-badge badge-draft">{n.type.replace("_", " ")}</span></td>
                  <td><StatusBadge s={n.status}/></td>
                  <td style={{fontSize: 11}}><div>{n.source.type}</div><div className="mono" style={{fontSize: 10, color: "var(--blue)"}}>{n.source.ref}</div></td>
                  <td className="mono" style={{fontSize: 11}}>{n.detectedAt.substring(0, 10)}<div className="muted" style={{fontSize: 10}}>{n.daysAgo}d ago</div></td>
                  <td className="mono" style={{fontSize: 11, background: n.overdue ? "#fee2e2" : undefined, padding: "2px 4px", color: n.overdue ? "var(--red-700)" : "var(--text)"}}>{n.responseDue.substring(0, 16)}</td>
                  <td style={{fontSize: 11}}>{n.assignedTo || <span className="muted">Unassigned</span>}</td>
                  <td onClick={e => e.stopPropagation()}><button className="btn btn-ghost btn-sm" onClick={() => onOpenNcr(n.id)}>View</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
};

// ============ QA-009a NCR Detail ============
const QaNcrDetail = ({ ncrId, role, onBack, onNav, openModal }) => {
  const n = QA_NCRS.find(x => x.id === ncrId) || QA_NCRS[0];
  const d = n.id === QA_NCR_DETAIL.id ? QA_NCR_DETAIL : { ...QA_NCR_DETAIL, id: n.id, title: n.title, severity: n.severity, type: n.type, status: n.status, detectedAt: n.detectedAt, product: { code: n.product.split(" ")[0], name: n.product }, responseDue: n.responseDue, assignedTo: n.assignedTo };
  const isClosed = n.status === "closed";
  const canClose = role === "Quality Lead" && d.rootCause && n.status !== "closed";
  const isYield = d.type === "yield_issue";

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={() => onNav("dashboard")}>Quality</a> · <a onClick={onBack}>NCR</a> · {n.id}</div>
          <h1 className="page-title" style={{display: "flex", alignItems: "center", gap: 10}}>
            <a onClick={onBack} style={{fontSize: 14, color: "var(--blue)", cursor: "pointer", fontWeight: 400}}>← NCRs</a>
            <span>{n.id}</span>
            <SeverityBadge s={n.severity}/>
            <StatusBadge s={n.status}/>
          </h1>
        </div>
      </div>

      {n.overdue && (
        <div className="alert-box alert-red" style={{marginBottom: 10, fontSize: 12}}>
          <span>⚠</span>
          <div><b>Response overdue.</b> Response was due {d.responseDue}. Escalation rule V-QA-NCR-007 will auto-escalate to Quality Director in 24h.</div>
        </div>
      )}

      {isClosed && (
        <div className="signed-banner">
          <span className="sb-ic">🔒</span>
          <div>NCR was closed on <b>{n.closedAt}</b>. Closure is immutable (21 CFR Part 11). SHA-256 signature stored.</div>
        </div>
      )}

      <div className="qa-detail-layout">
        <div>
          {/* Header / description */}
          <div className="qa-detail-card">
            <h4>NCR</h4>
            <div style={{display: "flex", gap: 8, marginBottom: 8}}>
              <span className="qa-badge badge-draft">{d.type.replace("_", " ")}</span>
              <SeverityBadge s={d.severity}/>
              {d.severity === "major" && <span className="reg-tag">BRCGS Issue 10 §3.8 — response ≤ 48h</span>}
              {d.severity === "critical" && <span className="reg-tag">BRCGS Issue 10 §3.8 — response ≤ 24h</span>}
            </div>
            <div style={{fontSize: 14, fontWeight: 600, marginBottom: 6}}>{d.title}</div>
            <div style={{fontSize: 12, lineHeight: 1.5}}>{d.description}</div>
            <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10, fontSize: 12}}>
              <div><span className="muted">Detected by:</span> {d.detectedBy}</div>
              <div><span className="muted">Detected at:</span> <span className="mono">{d.detectedAt}</span></div>
              <div><span className="muted">Location:</span> {d.detectedLocation}</div>
              <div><span className="muted">Product:</span> {d.product.code} · {d.product.name}</div>
              <div><span className="muted">Affected qty:</span> <span className="mono">{d.affectedQty} kg</span> {d.severity === "major" && <span className="reg-tag" style={{marginLeft: 4}}>BRCGS §3.7</span>}</div>
              <div><span className="muted">Response due:</span> <span className="mono" style={{color: n.overdue ? "var(--red-700)" : "var(--text)"}}>{d.responseDue}</span></div>
            </div>
          </div>

          {isYield && (
            <div className="qa-detail-card">
              <h4>Yield details</h4>
              <div className="reg-tag" style={{marginBottom: 8}}>Regulation: BRCGS Issue 10 §3.7</div>
              <div style={{display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, fontSize: 12}}>
                <div><span className="muted">Target yield %</span><div style={{fontSize: 18, fontWeight: 600, fontFamily: "var(--font-mono)"}}>92%</div></div>
                <div><span className="muted">Actual yield %</span><div style={{fontSize: 18, fontWeight: 600, fontFamily: "var(--font-mono)", color: "var(--amber-700)"}}>86%</div></div>
                <div><span className="muted">Claim %</span><div style={{fontSize: 18, fontWeight: 600, fontFamily: "var(--font-mono)"}}>-6%</div></div>
                <div><span className="muted">Est. claim (EUR)</span><div style={{fontSize: 18, fontWeight: 600, fontFamily: "var(--font-mono)", color: "var(--red-700)"}}>€1,440</div></div>
              </div>
            </div>
          )}

          <div className="qa-detail-card">
            <h4>Investigation</h4>
            <Field label="Root cause" required={n.status === "investigating" || n.status === "closed"} help="Required before close — V-QA-NCR-005">
              <textarea defaultValue={d.rootCause} placeholder="Document root cause analysis…" disabled={isClosed} rows={3}/>
            </Field>
            <Field label="Root cause category">
              <select defaultValue={d.rootCauseCategory} disabled={isClosed}>
                <option value="">— Select —</option>
                <option>contamination</option><option>process_failure</option><option>equipment_failure</option><option>human_error</option><option>supplier</option><option>specification</option><option>other</option>
              </select>
            </Field>
            <Field label="Immediate action taken">
              <textarea defaultValue={d.immediateAction} placeholder="What was done immediately to contain the issue…" disabled={isClosed} rows={3}/>
            </Field>
          </div>

          <div className="qa-detail-card" style={{opacity: 0.7}}>
            <h4>CAPA <span className="badge badge-blue" style={{fontSize: 9, marginLeft: 6}}>P2</span></h4>
            <div style={{fontSize: 12, color: "var(--muted)"}}>CAPA — Phase 2 (Epic 8G). No CAPA assigned. <a style={{color: "var(--blue)", cursor: "pointer"}}>Assign CAPA (P2)</a></div>
          </div>

          {/* Sticky action bar */}
          {!isClosed && (
            <div className="qa-action-bar">
              <button className="btn btn-secondary btn-sm">Save changes</button>
              <span className="spacer"></span>
              {n.status === "draft" && <button className="btn btn-primary btn-sm">Submit for investigation</button>}
              {n.status === "open" && <button className="btn btn-primary btn-sm">Start investigating</button>}
              {n.status === "investigating" && <button className="btn btn-sm" style={{background: "var(--green)", color: "#fff", border: 0}} onClick={() => openModal("ncrClose", d)}>🔒 Close NCR</button>}
            </div>
          )}
          {isClosed && (
            <div className="qa-action-bar">
              <span className="spacer"></span>
              <button className="btn btn-secondary btn-sm">⎙ Download NCR report</button>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="qa-detail-sidebar">
          <div className="qa-detail-card">
            <h4>Linked records</h4>
            <div className="qa-detail-field"><span className="label">Hold</span><span className="value">{d.linkedHold ? <a className="dcode" onClick={() => onNav("holds")}>{d.linkedHold}</a> : <span className="muted">—</span>}</span></div>
            <div className="qa-detail-field"><span className="label">Inspection</span><span className="value">{d.linkedInspection ? <a className="dcode" onClick={() => onNav("incoming")}>{d.linkedInspection}</a> : <span className="muted">—</span>}</span></div>
            <div className="qa-detail-field"><span className="label">CCP deviation</span><span className="value">{d.linkedCcpDeviation ? <a className="dcode" onClick={() => onNav("ccpdev")}>{d.linkedCcpDeviation}</a> : <span className="muted">—</span>}</span></div>
            <div className="qa-detail-field"><span className="label">Complaint</span><span className="value">{d.linkedComplaint ? <a className="dcode">{d.linkedComplaint}</a> : <span className="muted">—</span>}</span></div>
          </div>

          <div className="qa-detail-card">
            <h4>Status workflow</h4>
            <div style={{fontSize: 11, color: "var(--muted)", marginBottom: 6}}>Current: <StatusBadge s={n.status}/></div>
            {n.status === "draft" && <button className="btn btn-primary btn-sm" style={{width: "100%", marginBottom: 4}}>→ Submit (open)</button>}
            {n.status === "open" && <button className="btn btn-primary btn-sm" style={{width: "100%", marginBottom: 4}}>→ Start investigating</button>}
            {n.status === "investigating" && <>
              <button className="btn btn-secondary btn-sm" style={{width: "100%", marginBottom: 4}} disabled>→ Awaiting CAPA (P2)</button>
              <button className="btn btn-sm" style={{width: "100%", background: "var(--green)", color: "#fff", border: 0}} onClick={() => openModal("ncrClose", d)}>🔒 Close NCR</button>
            </>}
            {n.status === "closed" && <a style={{fontSize: 11, color: "var(--blue)", cursor: "pointer"}}>Re-open (with reason)</a>}
          </div>

          <div className="qa-detail-card">
            <h4>Activity</h4>
            <div className="q-timeline">
              {(d.events || []).map((e, i) => (
                <div key={i} className="q-tl-item">
                  <span className={"q-tl-dot " + e.type}></span>
                  <div style={{fontSize: 11}}><b>{e.op}</b> · {e.user}</div>
                  <div className="q-tl-meta">{e.t}</div>
                  <div style={{fontSize: 11, color: "var(--text)"}}>{e.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {d.severity === "critical" && (
            <div className="qa-detail-card" style={{fontSize: 10, color: "var(--muted)", lineHeight: 1.5, background: "#fef2f2", borderColor: "var(--red)"}}>
              <b>V-QA-NCR-006</b> — critical NCRs require dual sign (quality_lead + prod_manager) at close.
            </div>
          )}
        </div>
      </div>
    </>
  );
};

Object.assign(window, { QaNcrList, QaNcrDetail });
