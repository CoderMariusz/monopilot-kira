// ============ QA-002 Holds List + QA-002a Hold Detail ============

const QaHoldsList = ({ role, onOpenHold, onNav, openModal }) => {
  const [tab, setTab] = React.useState("active");
  const [search, setSearch] = React.useState("");
  const [priority, setPriority] = React.useState("all");
  const [refType, setRefType] = React.useState("all");
  const [selected, setSelected] = React.useState(new Set());

  const activeStates = ["open", "investigating", "escalated"];
  const visible = QA_HOLDS.filter(h =>
    (tab === "active" ? activeStates.includes(h.status) :
     tab === "all" ? true :
     h.status === tab) &&
    (priority === "all" || h.priority === priority) &&
    (refType === "all" || h.refType === refType) &&
    (!search ||
      h.id.toLowerCase().includes(search.toLowerCase()) ||
      h.refId.toLowerCase().includes(search.toLowerCase()) ||
      h.reason.toLowerCase().includes(search.toLowerCase()))
  );

  const canRelease = role === "Quality Lead";
  const counts = {
    open: QA_HOLDS.filter(h => h.status === "open").length,
    invest: QA_HOLDS.filter(h => h.status === "investigating").length,
    avg: 2.1,
    today: QA_HOLDS.filter(h => h.status === "released" && h.releasedAt?.startsWith("2026-04-21")).length,
  };

  const toggle = id => {
    const n = new Set(selected); if (n.has(id)) n.delete(id); else n.add(id); setSelected(n);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={() => onNav("dashboard")}>Quality</a> · Holds</div>
          <h1 className="page-title">Holds</h1>
          <div className="muted" style={{fontSize: 12}}>{QA_HOLDS.length} total · {counts.open} open · {counts.invest} investigating · Avg age {counts.avg}d</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm">⇪ Export CSV</button>
          <button className="btn btn-primary btn-sm" onClick={() => openModal("holdCreate")}>＋ Create Hold</button>
        </div>
      </div>

      {/* Summary KPI strip */}
      <div className="kpi-row" style={{gridTemplateColumns: "repeat(4, 1fr)"}}>
        <div className="kpi red" onClick={() => { setTab("open"); }}><div className="kpi-label">Open</div><div className="kpi-value">{counts.open}</div><div className="kpi-sub">Unreleased, awaiting action</div></div>
        <div className="kpi amber" onClick={() => { setTab("investigating"); }}><div className="kpi-label">Investigating</div><div className="kpi-value">{counts.invest}</div><div className="kpi-sub">Root cause review</div></div>
        <div className="kpi"><div className="kpi-label">Avg hold age (days)</div><div className="kpi-value">{counts.avg}</div><div className="kpi-sub">Rolling 30d</div></div>
        <div className="kpi green"><div className="kpi-label">Released today</div><div className="kpi-value">0</div><div className="kpi-sub">Cleared in last 24h</div></div>
      </div>

      {/* Tabs */}
      <div className="tabs-bar">
        {[
          { k: "active", l: "Active", c: QA_HOLDS.filter(h => activeStates.includes(h.status)).length },
          { k: "all", l: "All", c: QA_HOLDS.length },
          { k: "open", l: "Open", c: counts.open },
          { k: "investigating", l: "Investigating", c: counts.invest },
          { k: "released", l: "Released", c: QA_HOLDS.filter(h => h.status === "released").length },
          { k: "quarantined", l: "Quarantined", c: QA_HOLDS.filter(h => h.status === "quarantined").length },
        ].map(t => (
          <button key={t.k} className={"tab-btn " + (tab === t.k ? "on" : "")} onClick={() => setTab(t.k)}>
            {t.l} <span className="count">{t.c}</span>
          </button>
        ))}
      </div>

      <div className="filter-bar">
        <input type="text" placeholder="Search hold # or reference…" value={search} onChange={e => setSearch(e.target.value)} style={{width: 240}}/>
        <select value={priority} onChange={e => setPriority(e.target.value)} style={{width: 130}}>
          <option value="all">All priorities</option>
          <option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
        </select>
        <select style={{width: 160}}>
          <option>All reason categories</option>
          {[...new Set(QA_HOLD_REASONS.map(r => r.category))].map(c => <option key={c}>{c}</option>)}
        </select>
        <div className="pills">
          {["all", "LP", "Batch", "WO", "PO", "GRN"].map(t => (
            <button key={t} className={"pill " + (refType === t ? "on" : "")} onClick={() => setRefType(t)}>{t === "all" ? "All refs" : t}</button>
          ))}
        </div>
        <span className="spacer"></span>
        <button className="clear-all" onClick={() => { setSearch(""); setPriority("all"); setRefType("all"); }}>Clear</button>
        <span className="muted" style={{fontSize: 12}}>{visible.length} rows</span>
      </div>

      {selected.size > 0 && (
        <div className="card" style={{padding: "8px 14px", marginBottom: 10, background: "var(--blue-050)", borderColor: "var(--blue)"}}>
          <div className="row-flex">
            <b>{selected.size} selected</b>
            <span className="spacer"></span>
            <button className="btn btn-secondary btn-sm" disabled={!canRelease}>Release selected</button>
            <button className="btn btn-secondary btn-sm">⇪ Export selected</button>
          </div>
        </div>
      )}

      <div className="card" style={{padding: 0}}>
        <table>
          <thead>
            <tr>
              <th style={{width: 32}}><input type="checkbox" onChange={() => setSelected(selected.size ? new Set() : new Set(visible.map(h => h.id)))}/></th>
              <th>Hold #</th>
              <th>Ref type</th>
              <th>Reference</th>
              <th>Reason</th>
              <th>Priority</th>
              <th>Status</th>
              <th style={{textAlign: "right"}}>Days held</th>
              <th>Est. release</th>
              <th>Created by</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(h => {
              const overdue = h.estRelease && h.estRelease < "2026-04-21" && activeStates.includes(h.status);
              const rowCls = h.status === "escalated" ? "row-escalated"
                           : h.daysHeld > 3 ? "row-overdue"
                           : "";
              return (
                <tr key={h.id} className={rowCls} style={{opacity: h.status === "released" ? 0.6 : 1, cursor: "pointer"}} onClick={() => onOpenHold(h.id)}>
                  <td onClick={e => e.stopPropagation()}><input type="checkbox" checked={selected.has(h.id)} onChange={() => toggle(h.id)}/></td>
                  <td><span className="dcode">{h.id}</span></td>
                  <td><span className="qa-badge badge-draft">{h.refType}</span></td>
                  <td className="mono" style={{fontSize: 11, color: "var(--blue)"}}>{h.refId}</td>
                  <td style={{fontSize: 11}} title={h.reason}>{h.reason.length > 40 ? h.reason.substring(0, 40) + "…" : h.reason}</td>
                  <td><PriorityBadge p={h.priority}/></td>
                  <td><StatusBadge s={h.status}/></td>
                  <td className="num mono" style={{color: h.daysHeld > 3 ? "var(--red-700)" : "var(--text)"}}>{h.daysHeld}</td>
                  <td className="mono" style={{fontSize: 11, background: overdue ? "#fef3c7" : undefined, padding: "2px 4px"}}>{h.estRelease || "—"}</td>
                  <td style={{fontSize: 11}}>{h.createdBy}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <button className="btn btn-ghost btn-sm" onClick={() => onOpenHold(h.id)}>View</button>
                    {activeStates.includes(h.status) && canRelease && (
                      <button className="btn btn-sm" style={{background: "var(--green)", color: "#fff", border: 0, marginLeft: 4}} onClick={() => openModal("holdRelease", h)}>Release</button>
                    )}
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr><td colSpan={11} style={{textAlign: "center", padding: 40, color: "var(--muted)"}}>
                <div style={{fontSize: 32, opacity: 0.3}}>🔒</div>
                <div style={{fontSize: 14, marginTop: 8, color: "var(--text)"}}>No holds found</div>
                <div style={{fontSize: 12, marginTop: 4}}>No holds match your current filters. Try adjusting filters or create a new hold.</div>
                <button className="btn btn-primary btn-sm" style={{marginTop: 10}} onClick={() => openModal("holdCreate")}>＋ Create Hold</button>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
};

// ============ QA-002a Hold Detail ============
const QaHoldDetail = ({ holdId, role, onBack, onNav, openModal }) => {
  const h = QA_HOLDS.find(x => x.id === holdId) || QA_HOLD_DETAIL;
  const detail = h.id === QA_HOLD_DETAIL.id ? QA_HOLD_DETAIL : { ...QA_HOLD_DETAIL, ...h, heldItems: [{ lp: h.refId, qtyHeld: h.holdQty, qtyReleased: 0, status: "held", notes: "" }] };
  const [tab, setTab] = React.useState("items");
  const canRelease = role === "Quality Lead";
  const isReleased = h.status === "released";

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={() => onNav("dashboard")}>Quality</a> · <a onClick={onBack}>Holds</a> · {h.id}</div>
          <h1 className="page-title" style={{display: "flex", alignItems: "center", gap: 10}}>
            <a onClick={onBack} style={{fontSize: 14, color: "var(--blue)", cursor: "pointer", fontWeight: 400}}>← Holds</a>
            <span>{h.id}</span>
            <StatusBadge s={h.status}/>
            <PriorityBadge p={h.priority}/>
          </h1>
        </div>
      </div>

      {isReleased && (
        <div className="signed-banner">
          <span className="sb-ic">🔒</span>
          <div>This hold was released on <b>{h.releasedAt}</b> by <b>{h.releasedBy}</b>. Disposition: <b>{h.disposition}</b>. Record is immutable (21 CFR Part 11).</div>
        </div>
      )}

      <div className="qa-detail-layout">
        <div>
          <div className="qa-detail-card">
            <h4>Hold context</h4>
            <div className="qa-detail-field"><span className="label">Reference</span><span className="value"><span className="qa-badge badge-draft">{h.refType}</span> <span className="mono" style={{color: "var(--blue)", marginLeft: 6}}>{h.refId}</span></span></div>
            <div className="qa-detail-field"><span className="label">Product</span><span className="value">{h.product}</span></div>
            <div className="qa-detail-field"><span className="label">Reason</span><span className="value">{h.reason}</span></div>
            <div className="qa-detail-field"><span className="label">Category</span><span className="value">{h.reasonCat}</span></div>
            <div className="qa-detail-field"><span className="label">Disposition</span><span className="value">{detail.disposition || "Pending"}</span></div>
            <div className="qa-detail-field"><span className="label">Created by</span><span className="value">{h.createdBy} · <span className="mono">{h.createdAt}</span></span></div>
            <div className="qa-detail-field"><span className="label">Est. release</span><span className="value mono">{h.estRelease || "—"}</span></div>
            {h.notes && <div className="qa-detail-field" style={{flexDirection: "column"}}><span className="label">Notes</span><span className="value" style={{background: "var(--gray-050)", padding: "6px 8px", borderRadius: 4, fontSize: 11, marginTop: 4}}>{h.notes}</span></div>}
          </div>

          {/* Tabs */}
          <div className="tabs-bar" style={{marginTop: 10}}>
            <button className={"tab-btn " + (tab === "items" ? "on" : "")} onClick={() => setTab("items")}>Held Items <span className="count">{detail.heldItems?.length || 0}</span></button>
            <button className={"tab-btn " + (tab === "activity" ? "on" : "")} onClick={() => setTab("activity")}>Activity Log <span className="count">{detail.events?.length || 0}</span></button>
          </div>

          {tab === "items" && (
            <div className="card" style={{padding: 0}}>
              <table>
                <thead><tr><th>LP</th><th style={{textAlign: "right"}}>Qty held (kg)</th><th style={{textAlign: "right"}}>Qty released (kg)</th><th>Status</th><th>Notes</th><th>Actions</th></tr></thead>
                <tbody>
                  {(detail.heldItems || []).map((it, i) => (
                    <tr key={i}>
                      <td className="mono" style={{color: "var(--blue)"}}>{it.lp}</td>
                      <td className="num mono">{it.qtyHeld}</td>
                      <td className="num mono muted">{it.qtyReleased}</td>
                      <td><span className={"qa-badge badge-" + (it.status === "held" ? "hold" : it.status === "released" ? "released" : "closed")}>{it.status}</span></td>
                      <td style={{fontSize: 11}}>{it.notes || "—"}</td>
                      <td>{canRelease && !isReleased && <button className="btn btn-ghost btn-sm" onClick={() => openModal("holdRelease", h)}>Release partially</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === "activity" && (
            <div className="card" style={{padding: 14}}>
              <div className="q-timeline">
                {(detail.events || []).map((e, i) => (
                  <div key={i} className="q-tl-item">
                    <span className={"q-tl-dot " + e.type}></span>
                    <div><b style={{fontSize: 12}}>{e.op}</b> · {e.user}</div>
                    <div className="q-tl-meta">{e.t}</div>
                    <div className="q-tl-json">Changed fields: {e.fields}</div>
                  </div>
                ))}
                {(!detail.events || detail.events.length === 0) && <div className="muted" style={{fontSize: 12}}>No activity recorded.</div>}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="qa-detail-sidebar">
          <div className="qa-detail-card">
            <h4>Linked records</h4>
            <div className="qa-detail-field"><span className="label">NCR</span><span className="value">{h.linkedNcr ? <a className="dcode" onClick={() => onNav("ncr")}>{h.linkedNcr}</a> : <span className="muted">No NCR linked</span>}</span></div>
            <div className="qa-detail-field"><span className="label">Source inspection</span><span className="value">{detail.sourceInsp ? <a className="dcode" onClick={() => onNav("incoming")}>{detail.sourceInsp}</a> : <span className="muted">—</span>}</span></div>
            <div className="qa-detail-field"><span className="label">Hold qty (total)</span><span className="value mono">{h.holdQty} kg</span></div>
            <div className="qa-detail-field"><span className="label">LPs on hold</span><span className="value mono">{detail.lps || 1}</span></div>
          </div>

          <div className="qa-detail-card">
            <h4>Actions</h4>
            {!isReleased && activeStates_includes(h.status) && canRelease && (
              <button className="btn btn-sm" style={{background: "var(--green)", color: "#fff", border: 0, width: "100%", marginBottom: 6}} onClick={() => openModal("holdRelease", h)}>Release Hold</button>
            )}
            {!isReleased && (
              <>
                <button className="btn btn-secondary btn-sm" style={{width: "100%", marginBottom: 6}}>Escalate</button>
                <button className="btn btn-secondary btn-sm" style={{width: "100%", marginBottom: 6}}>Link NCR</button>
                <button className="btn btn-secondary btn-sm" style={{width: "100%"}}>Add note</button>
              </>
            )}
            {isReleased && <button className="btn btn-secondary btn-sm" style={{width: "100%"}}>Download audit PDF</button>}
          </div>

          <div className="qa-detail-card" style={{fontSize: 10, color: "var(--muted)", lineHeight: 1.5}}>
            <b>Regulation:</b> V-QA-HOLD-006 — critical holds require segregation of duties (creator ≠ releaser). Release blocked if same user.
          </div>
        </div>
      </div>
    </>
  );
};

// helper
const activeStates_includes = s => ["open", "investigating", "escalated"].includes(s);

Object.assign(window, { QaHoldsList, QaHoldDetail });
