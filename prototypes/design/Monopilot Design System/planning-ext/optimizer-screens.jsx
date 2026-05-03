// ============ Optimizer-focused screens: Pending Review, Capacity Projection ============

// -------- SCR-07-01b (full-page pending review — linked from KPI + sub-nav) --------
const PextPendingFullPage = ({ role, onNav, openModal }) => {
  const [actions, setActions] = React.useState({});
  const [groupFilter, setGroupFilter] = React.useState("all");

  const eff = (a) => actions[a.id] || a.status;
  const pending = PEXT_ASSIGNMENTS.filter(a => eff(a) === "draft");
  const overridden = PEXT_ASSIGNMENTS.filter(a => eff(a) === "overridden");
  const approved = PEXT_ASSIGNMENTS.filter(a => eff(a) === "approved");

  const rows = groupFilter === "pending" ? pending :
               groupFilter === "overridden" ? overridden :
               groupFilter === "approved" ? approved :
               PEXT_ASSIGNMENTS;

  const approve = (id) => setActions({ ...actions, [id]: "approved" });
  const reject  = (id) => setActions({ ...actions, [id]: "rejected" });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Scheduler</a> · Pending review</div>
          <h1 className="page-title">Pending review — assignments queue</h1>
          <div className="muted" style={{fontSize:12}}>
            {pending.length} draft · {approved.length} approved · {overridden.length} overridden ·
            <span className="mono" style={{marginLeft:6}}>OPT-0042</span> (last run)
          </div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm">⇪ Export queue CSV</button>
          <button className="btn btn-primary btn-sm" onClick={()=>openModal("approveAll", { count: pending.length })}>✓ Approve all draft ({pending.length})</button>
        </div>
      </div>

      <div className="kpi-row-4">
        <div className="kpi blue"><div className="kpi-label">In queue</div><div className="kpi-value">{PEXT_ASSIGNMENTS.length}</div><div className="kpi-sub">Across 1 active run</div></div>
        <div className="kpi amber"><div className="kpi-label">Pending</div><div className="kpi-value">{pending.length}</div><div className="kpi-sub">Draft awaiting review</div></div>
        <div className="kpi green"><div className="kpi-label">Approved</div><div className="kpi-value">{approved.length}</div><div className="kpi-sub">Committed to WOs</div></div>
        <div className="kpi amber"><div className="kpi-label">Overridden</div><div className="kpi-value">{overridden.length}</div><div className="kpi-sub">Manual adjust logged</div></div>
      </div>

      <div className="filter-bar">
        <div className="pills">
          <button className={"pill " + (groupFilter === "all" ? "on" : "")} onClick={()=>setGroupFilter("all")}>All ({PEXT_ASSIGNMENTS.length})</button>
          <button className={"pill " + (groupFilter === "pending" ? "on" : "")} onClick={()=>setGroupFilter("pending")}>Pending ({pending.length})</button>
          <button className={"pill " + (groupFilter === "approved" ? "on" : "")} onClick={()=>setGroupFilter("approved")}>Approved ({approved.length})</button>
          <button className={"pill " + (groupFilter === "overridden" ? "on" : "")} onClick={()=>setGroupFilter("overridden")}>Overridden ({overridden.length})</button>
        </div>
        <select style={{width:140}}><option>All lines</option>{PEXT_LINES.map(l => <option key={l.id}>{l.id}</option>)}</select>
        <select style={{width:120}}><option>All shifts</option><option>Shift A</option><option>Shift B</option></select>
        <input placeholder="Search WO / FA code…" style={{width:180}}/>
        <span className="spacer"></span>
        <button className="clear-all">Clear filters</button>
      </div>

      <div className="card" style={{padding:0}}>
        <table>
          <thead>
            <tr>
              <th style={{width:32}}>#</th>
              <th style={{width:100}}>WO</th>
              <th>Product</th>
              <th style={{width:90}}>Line</th>
              <th style={{width:70}}>Shift</th>
              <th style={{width:130}}>Planned start</th>
              <th style={{width:110}}>Allergen</th>
              <th style={{width:70}}>Score</th>
              <th style={{width:100}}>CO before</th>
              <th style={{width:110}}>Status</th>
              <th style={{width:180}}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(a => {
              const st = eff(a);
              const date = PEXT_DATES[a.day];
              return (
                <tr key={a.id} style={{cursor:"pointer"}}>
                  <td className="mono muted">#{a.rank}</td>
                  <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{a.wo}</td>
                  <td><span className="mono" style={{fontSize:11, color:"var(--muted)"}}>{a.fa}</span> · {a.prod}</td>
                  <td className="mono">{a.line}</td>
                  <td className="mono">{a.shift}</td>
                  <td className="mono" style={{fontSize:11}}>{date.label} {a.start}:00</td>
                  <td><AllergenPills codes={a.allergen}/></td>
                  <td className="mono num" style={{fontWeight:600}}>{a.score}</td>
                  <td className="mono">{a.coBefore} min {a.coBefore > 45 ? <span className="badge badge-red" style={{fontSize:9, marginLeft:4}}>HIGH</span> : a.coBefore > 15 ? <span className="badge badge-amber" style={{fontSize:9, marginLeft:4}}>MED</span> : ""}</td>
                  <td><AssnStatus s={st}/></td>
                  <td>
                    {st === "draft" && <>
                      <button className="btn btn-sm btn-primary" onClick={()=>approve(a.id)}>Approve</button>{" "}
                      <button className="btn btn-sm btn-secondary" onClick={()=>reject(a.id)}>Reject</button>{" "}
                      <button className="btn btn-sm btn-ghost" onClick={()=>openModal("override", { wo: a })}>…</button>
                    </>}
                    {st === "approved" && <span className="muted" style={{fontSize:11}}>Approved · by Monika</span>}
                    {st === "overridden" && <span className="muted" style={{fontSize:11}}>Overridden · <a style={{color:"var(--blue)", cursor:"pointer"}}>view log</a></span>}
                    {st === "rejected" && <span className="muted" style={{fontSize:11}}>Rejected</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
};

// -------- Capacity projection screen — finite-capacity engine's projection ---------
const PextCapacityProjection = ({ onNav }) => {
  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Scheduler</a> · Capacity projection</div>
          <h1 className="page-title">Line capacity projection (7-day horizon)</h1>
          <div className="muted" style={{fontSize:12}}>
            Output from <span className="mono">finite_capacity_solver_v1</span> · utilisation = planned_kg_h ÷ line_cap_kg_h
          </div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm">↻ Refresh projection</button>
          <button className="btn btn-secondary btn-sm">⇪ Export CSV</button>
        </div>
      </div>

      <div className="alert-amber alert-box" style={{marginBottom:10}}>
        <span>⚠</span>
        <div>
          <b>2 capacity violations detected (V-SCHED-04 soft):</b>{" "}
          <span className="mono">LINE-03</span> Wed 23 Apr (104% util) ·{" "}
          <span className="mono">LINE-03</span> Wed 23 Apr shift B (107% util). Consider splitting WO-2026-0126 or moving WO-2026-0127 to LINE-01.
        </div>
      </div>

      <div className="card" style={{padding:0, marginBottom:12}}>
        <table>
          <thead>
            <tr>
              <th>Line</th>
              <th>Cap (kg/h)</th>
              {PEXT_DATES.map(d => <th key={d.day} className="mono" style={{fontSize:10}}>{d.label}</th>)}
              <th style={{textAlign:"right"}}>Avg</th>
            </tr>
          </thead>
          <tbody>
            {PEXT_LINES.map(line => {
              const byDay = PEXT_DATES.map(d => {
                const row = PEXT_CAPACITY_PROJECTION.find(p => p.line === line.id && p.day === d.day);
                return row ? row.pct : null;
              });
              const avg = Math.round(byDay.filter(v=>v!==null).reduce((a,v)=>a+v,0) / byDay.filter(v=>v!==null).length || 0);
              return (
                <tr key={line.id}>
                  <td>
                    <div className="mono" style={{fontWeight:600}}>{line.id}</div>
                    <div style={{fontSize:11, color:"var(--muted)"}}>{line.name}</div>
                  </td>
                  <td className="mono num">{line.cap_kg_h}</td>
                  {byDay.map((pct, i) => (
                    <td key={i} className="num" style={{padding:4}}>
                      {pct !== null ? (
                        <div style={{background: pct > 100 ? "#fee2e2" : pct > 90 ? "#fef3c7" : "#dcfce7", padding:"5px 8px", borderRadius:4, fontFamily:"var(--font-mono)", fontSize:11, fontWeight:600, color: pct > 100 ? "#991b1b" : pct > 90 ? "#92400e" : "#166534"}}>
                          {pct}%
                        </div>
                      ) : <span className="muted">—</span>}
                    </td>
                  ))}
                  <td className="num mono" style={{fontWeight:700}}>{avg}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h3 style={{marginTop:14, marginBottom:8, fontSize:13}}>Per-line micro-utilisation bars</h3>
      <div className="card" style={{padding:14}}>
        {PEXT_LINES.map(line => {
          const byDay = PEXT_DATES.slice(0,5).map(d => {
            const row = PEXT_CAPACITY_PROJECTION.find(p => p.line === line.id && p.day === d.day);
            return row ? row.pct : 0;
          });
          return (
            <div key={line.id} style={{marginBottom:10}}>
              <div style={{fontSize:12, fontFamily:"var(--font-mono)", fontWeight:600, marginBottom:4}}>{line.id} · {line.name}</div>
              {byDay.map((pct,i) => (
                <div key={i} className="line-util-bar">
                  <span className="lub-lbl">{PEXT_DATES[i].label.slice(0,3)} {PEXT_DATES[i].iso.slice(8)}</span>
                  <span className="lub-track">
                    <span className={"lub-fill " + (pct > 100 ? "over" : pct > 90 ? "warn" : pct > 80 ? "" : "low")}
                          style={{width: Math.min(pct, 100) + "%"}}></span>
                  </span>
                  <span className="lub-pct">{pct}%</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
};

Object.assign(window, { PextPendingFullPage, PextCapacityProjection });
