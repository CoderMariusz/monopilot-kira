// ============ SCR-07-02 — Changeover Matrix Editor ============

// Classify cell value to heatmap class
const classifyCell = (val) => {
  if (val === "BLKD") return "blocked";
  if (val === 0)      return "none";
  if (val <= 15)      return "low";
  if (val <= 45)      return "med";
  return "high";
};

const PextMatrix = ({ role, onNav, openModal }) => {
  const [tab, setTab] = React.useState("default");
  const [edits, setEdits] = React.useState({}); // "FROM→TO" -> newValue
  const [showHistory, setShowHistory] = React.useState(false);
  const [selectedLine, setSelectedLine] = React.useState(null);

  const isEdited = Object.keys(edits).length > 0;
  const canEdit = role === "Planner" || role === "Admin";

  const cellVal = (from, to) => {
    const k = `${from}→${to}`;
    if (edits[k] !== undefined) return edits[k];
    return PEXT_MATRIX[from][to];
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Scheduler</a> · Changeover matrix editor</div>
          <h1 className="page-title">Changeover Matrix Editor</h1>
          <div className="muted" style={{fontSize:12}}>
            N×N allergen matrix feeding <span className="mono">allergen_sequencing_optimizer_v2</span> · {PEXT_ALLERGEN_CODES.length}×{PEXT_ALLERGEN_CODES.length} cells
          </div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm" onClick={()=>openModal("matrixImport")}>⇪ Import CSV</button>
          <button className="btn btn-secondary btn-sm">⇩ Export CSV</button>
          <button className="btn btn-primary btn-sm" disabled={!isEdited || !canEdit} onClick={()=>openModal("matrixPublish", { changed: Object.keys(edits).length })}>
            Save &amp; Publish {isEdited && `(${Object.keys(edits).length})`}
          </button>
        </div>
      </div>

      {/* Active version banner */}
      <div className="alert-green alert-box" style={{marginBottom:12, borderLeftColor:"var(--green)"}}>
        <span>✓</span>
        <div style={{flex:1}}>
          <b>Active Version: {PEXT_MATRIX_VERSIONS[0].v}</b> · Published {PEXT_MATRIX_VERSIONS[0].date} by {PEXT_MATRIX_VERSIONS[0].user}
          <div style={{fontSize:11, color:"var(--muted)", marginTop:2}}>{PEXT_MATRIX_VERSIONS[0].notes}</div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={()=>setShowHistory(!showHistory)}>
          {showHistory ? "✕ Hide history" : "▦ View history"}
        </button>
        <button className="btn btn-ghost btn-sm" disabled>↶ Revert</button>
      </div>

      {isEdited && (
        <div className="alert-amber alert-box" style={{marginBottom:12}}>
          <span>⚠</span>
          <div>You have <b>{Object.keys(edits).length}</b> unsaved cell changes. Click "Save &amp; Publish" to create version <b>{"v" + (parseInt(PEXT_MATRIX_VERSIONS[0].v.slice(1)) + 1)}</b>.</div>
        </div>
      )}

      {showHistory && (
        <div className="vers-panel" style={{marginBottom:12}}>
          <div style={{padding:"10px 14px", borderBottom:"1px solid var(--border)", fontSize:12, fontWeight:600}}>Version history ({PEXT_MATRIX_VERSIONS.length})</div>
          {PEXT_MATRIX_VERSIONS.map(v => (
            <div key={v.v} className={"vers-item " + (v.active ? "current" : "")}>
              <div className="vi-head">
                <span className="vi-num">{v.v}</span>
                {v.active && <span className="badge badge-green" style={{fontSize:9}}>Active</span>}
                <span className="muted" style={{fontSize:11}}>{v.date} · by {v.user} · {v.cellsChanged} cells</span>
              </div>
              <div className="vi-notes">"{v.notes}"</div>
              <div className="vi-actions">
                <button className="btn btn-sm btn-secondary" onClick={()=>openModal("matrixDiff", { version: v })}>View diff</button>
                {!v.active && <button className="btn btn-sm btn-ghost" onClick={()=>openModal("matrixRestore", { version: v })}>↶ Restore</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="tabs-bar" style={{marginBottom:12, borderBottom:"1px solid var(--border)"}}>
        <button className={"tab-btn " + (tab === "default" ? "on" : "")} onClick={()=>setTab("default")} style={{padding:"8px 14px", border:0, background:"transparent", borderBottom: tab==="default" ? "2px solid var(--blue)" : "2px solid transparent", fontWeight:500, cursor:"pointer"}}>
          Default Matrix
        </button>
        <button className={"tab-btn " + (tab === "overrides" ? "on" : "")} onClick={()=>setTab("overrides")} style={{padding:"8px 14px", border:0, background:"transparent", borderBottom: tab==="overrides" ? "2px solid var(--blue)" : "2px solid transparent", fontWeight:500, cursor:"pointer"}}>
          Per-Line Overrides {Object.keys(PEXT_LINE_OVERRIDES).length > 0 && <span className="badge badge-amber" style={{marginLeft:6, fontSize:9}}>{Object.keys(PEXT_LINE_OVERRIDES).length}</span>}
        </button>
        <button className={"tab-btn " + (tab === "reviews" ? "on" : "")} onClick={()=>setTab("reviews")} style={{padding:"8px 14px", border:0, background:"transparent", borderBottom: tab==="reviews" ? "2px solid var(--blue)" : "2px solid transparent", fontWeight:500, cursor:"pointer"}}>
          Review Requests <span className="badge badge-red" style={{marginLeft:6, fontSize:9}}>{PEXT_MATRIX_REVIEWS.length}</span>
        </button>
      </div>

      {tab === "default" && (
        <>
          <div className="cm-wrap">
            <div className="cm-scroll">
              <table className="cm-table">
                <thead>
                  <tr>
                    <th className="cm-corner">FROM \ TO</th>
                    {PEXT_ALLERGEN_CODES.map(to => (
                      <th key={to}>{to}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PEXT_ALLERGEN_CODES.map(from => (
                    <tr key={from}>
                      <th>{from}</th>
                      {PEXT_ALLERGEN_CODES.map(to => {
                        const v = cellVal(from, to);
                        const isDiag = from === to;
                        const cls = isDiag ? "diag" : classifyCell(v);
                        const modKey = `${from}→${to}`;
                        const isMod = PEXT_MATRIX_MODIFIED.has(modKey) || edits[modKey] !== undefined;
                        return (
                          <td key={to}
                              className={"cm-cell " + cls}
                              onClick={()=> !isDiag && openModal("matrixCell", {
                                from, to, value: v,
                                onSave: (newVal) => {
                                  const next = { ...edits };
                                  if (newVal === PEXT_MATRIX[from][to]) delete next[modKey];
                                  else next[modKey] = newVal;
                                  setEdits(next);
                                }
                              })}
                              title={isDiag ? "Diagonal — always 0 min" : `${from} → ${to}: ${v === "BLKD" ? "BLOCKED (segregation)" : v + " min"}`}>
                            {isMod && !isDiag && <span className="cm-mod-dot"></span>}
                            {isDiag ? "—" : v === "BLKD" ? "BLKD" : v + "m"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="cm-legend">
              <span className="cmlg"><span className="cmlg-swatch" style={{background:"#f0fdf4"}}></span>0 min (none)</span>
              <span className="cmlg"><span className="cmlg-swatch" style={{background:"#dcfce7"}}></span>1–15 min (low)</span>
              <span className="cmlg"><span className="cmlg-swatch" style={{background:"#fef3c7"}}></span>16–45 min (medium)</span>
              <span className="cmlg"><span className="cmlg-swatch" style={{background:"#fee2e2"}}></span>&gt;45 min (high)</span>
              <span className="cmlg"><span className="cmlg-swatch" style={{background:"#ede9fe"}}></span>BLOCKED (segregation)</span>
              <span className="spacer" style={{flex:1}}></span>
              <span className="muted" style={{fontSize:10}}><span style={{color:"var(--blue)"}}>●</span> = modified from seed</span>
            </div>
          </div>
        </>
      )}

      {tab === "overrides" && (
        <>
          <div className="alert-blue alert-box" style={{marginBottom:10, fontSize:12}}>
            <span>ⓘ</span>
            <div>Per-line overrides take precedence over the default matrix. The solver reads: line_override → default.</div>
          </div>
          {PEXT_LINES.map(line => {
            const ovr = PEXT_LINE_OVERRIDES[line.id] || [];
            const expanded = selectedLine === line.id;
            return (
              <div key={line.id} className="card" style={{marginBottom:8, padding:0}}>
                <div style={{padding:"10px 14px", display:"flex", alignItems:"center", gap:10, cursor:"pointer", background:"var(--gray-050)"}} onClick={()=>setSelectedLine(expanded ? null : line.id)}>
                  <span style={{width:14, fontFamily:"var(--font-mono)", color:"var(--muted)"}}>{expanded ? "▼" : "▶"}</span>
                  <div style={{flex:1}}>
                    <div className="mono" style={{fontWeight:600}}>{line.id} · {line.name}</div>
                    <div style={{fontSize:11, color:"var(--muted)"}}>{ovr.length} cell override{ovr.length !== 1 ? "s" : ""}</div>
                  </div>
                  {ovr.length > 0 ? <span className="badge badge-amber" style={{fontSize:10}}>{ovr.length} overrides</span> : <span className="muted" style={{fontSize:11}}>No overrides</span>}
                  <button className="btn btn-secondary btn-sm" onClick={(e)=>{e.stopPropagation(); openModal("matrixCell", { from: "CEREAL", to: "MILK", value: 15, lineId: line.id });}}>{ovr.length > 0 ? "Edit" : "＋ Add override"}</button>
                </div>
                {expanded && ovr.length > 0 && (
                  <table style={{borderTop:"1px solid var(--border)"}}>
                    <thead><tr><th>Pair</th><th>Default</th><th>Override</th><th>Delta</th><th>Notes</th><th></th></tr></thead>
                    <tbody>
                      {ovr.map((o,i) => (
                        <tr key={i}>
                          <td className="mono">{o.from} → {o.to}</td>
                          <td className="mono">{o.defaultMin} min</td>
                          <td className="mono" style={{color:"#92400e", fontWeight:600}}>{o.overrideMin} min</td>
                          <td className={"mono " + (o.overrideMin > o.defaultMin ? "exp-red" : "")}>{o.overrideMin > o.defaultMin ? "+" : ""}{o.overrideMin - o.defaultMin} min</td>
                          <td style={{fontSize:11, color:"var(--muted)", fontStyle:"italic"}}>{o.notes}</td>
                          <td><button className="btn btn-ghost btn-sm">Edit</button> <button className="btn btn-ghost btn-sm" style={{color:"var(--red)"}}>Remove</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
          <div style={{marginTop:10}}><button className="btn btn-secondary btn-sm">＋ Add override for a line</button></div>
        </>
      )}

      {tab === "reviews" && (
        <>
          <div className="alert-amber alert-box" style={{marginBottom:10, fontSize:12}}>
            <span>⚠</span>
            <div><b>{PEXT_MATRIX_REVIEWS.length} review requests awaiting admin action.</b> Planners can submit requests for BLOCKED cells; admins unblock via <span className="mono">segregation_required = false</span>.</div>
          </div>
          <div className="card" style={{padding:0}}>
            <table>
              <thead>
                <tr>
                  <th>Request ID</th>
                  <th>Pair</th>
                  <th>Submitted by</th>
                  <th>Submitted at</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {PEXT_MATRIX_REVIEWS.map(r => (
                  <tr key={r.id}>
                    <td className="mono" style={{fontWeight:600}}>{r.id}</td>
                    <td className="mono">{r.from} → {r.to}</td>
                    <td>{r.user}</td>
                    <td className="mono" style={{fontSize:11}}>{r.when}</td>
                    <td style={{fontSize:11}}>{r.reason}</td>
                    <td><span className="badge badge-amber" style={{fontSize:10}}>Pending admin</span></td>
                    <td>
                      {role === "Admin" ? <>
                        <button className="btn btn-sm btn-primary">✓ Unblock</button>{" "}
                        <button className="btn btn-sm btn-ghost">Reject</button>
                      </> : <span className="muted" style={{fontSize:11}}>Admin only</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
};

Object.assign(window, { PextMatrix });
