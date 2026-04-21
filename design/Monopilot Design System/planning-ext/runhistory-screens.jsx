// ============ SCR-07-04 — Scheduler Run History ============

const PextRunHistory = ({ role, onNav, openModal }) => {
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [selectedRun, setSelectedRun] = React.useState(null);

  const rows = PEXT_RUNS.filter(r =>
    (typeFilter === "all" || r.type === typeFilter) &&
    (statusFilter === "all" || r.status === statusFilter)
  );

  if (selectedRun) {
    return <PextRunDetail run={selectedRun} onBack={()=>setSelectedRun(null)} onNav={onNav}/>;
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Scheduler</a> · Run history</div>
          <h1 className="page-title">Scheduler run history</h1>
          <div className="muted" style={{fontSize:12}}>
            Audit trail of all <span className="mono">scheduler_runs</span> · {PEXT_RUNS.length} runs in last 30 days
          </div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm">⇪ Export CSV</button>
        </div>
      </div>

      <div className="kpi-row-4">
        {PEXT_RUN_KPIS.map(k => (
          <div key={k.k} className={"kpi " + k.accent}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="filter-bar">
        <input placeholder="Search run_id…" style={{width:180}}/>
        <select style={{width:140}} value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}>
          <option value="all">All types</option>
          <option value="schedule">Schedule</option>
          <option value="dry_run">Dry-run</option>
        </select>
        <select style={{width:140}} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="converged">Converged</option>
          <option value="partial">Partial</option>
          <option value="failed">Failed</option>
          <option value="preview">Preview</option>
        </select>
        <input type="date" style={{width:140}} defaultValue="2026-04-14"/>
        <span className="muted">to</span>
        <input type="date" style={{width:140}} defaultValue="2026-04-21"/>
        <select style={{width:130}}><option>All users</option><option>Monika Nowak</option><option>m.krawczyk</option></select>
        <span className="spacer"></span>
        <button className="clear-all">Clear</button>
      </div>

      <div className="card" style={{padding:0}}>
        <table>
          <thead>
            <tr>
              <th>Run ID</th>
              <th>Initiated</th>
              <th>Horizon</th>
              <th>Lines</th>
              <th>Dur.</th>
              <th>WOs</th>
              <th>Overrides</th>
              <th>CO total</th>
              <th>Util avg</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const rowCls = "runhist-row " + (r.status === "failed" ? "failed" : r.status === "partial" ? "partial" : r.status === "preview" ? "preview" : "converged");
              const durCls = r.dur === 0 ? "muted" : r.dur < 60 ? "" : r.dur < 120 ? "exp-amber" : "exp-red";
              return (
                <tr key={r.id} className={rowCls} onClick={()=>setSelectedRun(r)}>
                  <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{r.id}</td>
                  <td>
                    <div className="mono" style={{fontSize:11}}>{r.started}</div>
                    <div style={{fontSize:10, color:"var(--muted)"}}>by {r.user}</div>
                  </td>
                  <td className="mono">{r.horizon}</td>
                  <td className="mono">{r.lines}</td>
                  <td className={"mono " + durCls}>{r.dur === 0 ? "—" : r.dur + "s"}</td>
                  <td className="num mono">{r.wos || "—"}</td>
                  <td className="num mono">{r.overrides}</td>
                  <td className="mono">{r.coMinutes || "—"} min</td>
                  <td className="mono">{r.util ? r.util.toFixed(1) + "%" : "—"}</td>
                  <td>
                    <RunStatus s={r.status}/>
                    {r.fallback && <div><span className="badge badge-amber" style={{fontSize:9, marginTop:3}}>v1 fallback</span></div>}
                    {r.superseded && <div><span className="badge badge-gray" style={{fontSize:9, marginTop:3}}>Superseded</span></div>}
                  </td>
                  <td>
                    <button className="btn btn-sm btn-secondary" onClick={(e)=>{e.stopPropagation(); setSelectedRun(r);}}>View</button>{" "}
                    <button className="btn btn-sm btn-ghost" disabled={r.status === "failed" || role !== "Planner"} onClick={(e)=>{e.stopPropagation(); openModal("rerunConfirm", { run: r });}}>Re-run</button>
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

// -------- Run Detail (SCR-07-04-DETAIL) --------
const PextRunDetail = ({ run, onBack, onNav }) => {
  const d = run.id === "OPT-0042" ? PEXT_RUN_DETAIL : {
    ...PEXT_RUN_DETAIL,
    id: run.id, uuid: run.uuid, status: run.status,
    completedAt: run.started, duration: run.dur,
    outputSummary: { ...PEXT_RUN_DETAIL.outputSummary, scheduled: run.wos, coTotal: run.coMinutes, utilAvg: run.util, overrides: run.overrides }
  };
  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("runs")}>Run history</a> · <span className="mono">{d.id}</span></div>
          <h1 className="page-title">Scheduler run <span className="mono">{d.id}</span> <RunStatus s={d.status}/></h1>
          <div className="muted" style={{fontSize:12}}>
            UUID: <span className="mono">{d.uuid}</span> · initiated {d.startedAt} by <b>{d.initiatedBy}</b>
          </div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm" onClick={onBack}>← Back</button>
          <button className="btn btn-secondary btn-sm">⇪ Export</button>
          <button className="btn btn-primary btn-sm" disabled={d.status === "failed"}>↻ Re-run</button>
        </div>
      </div>

      {run.status === "failed" && (
        <div className="alert-red alert-box" style={{marginBottom:10}}>
          <span>✕</span>
          <div><b>Run failed.</b> {run.error}</div>
        </div>
      )}
      {run.status === "partial" && (
        <div className="alert-amber alert-box" style={{marginBottom:10}}>
          <span>⚠</span>
          <div><b>Partial schedule.</b> Solver timed out at 120s. {run.wos} of 22 WOs scheduled. Unscheduled: WO-2026-0126, WO-2026-0127, WO-2026-0128. Run again with smaller horizon.</div>
        </div>
      )}

      <div className="run-detail-grid">
        <div>
          <div className="run-meta-card">
            <h3 style={{fontSize:13, margin:"0 0 10px", fontWeight:600}}>Run metadata</h3>
            <div className="rm-row"><span className="k">Run ID</span><span className="v">{d.id}</span></div>
            <div className="rm-row"><span className="k">UUID</span><span className="v" style={{fontSize:10}}>{d.uuid}</span></div>
            <div className="rm-row"><span className="k">Status</span><span className="v"><RunStatus s={d.status}/></span></div>
            <div className="rm-row"><span className="k">Queued at</span><span className="v">{d.queuedAt}</span></div>
            <div className="rm-row"><span className="k">Started at</span><span className="v">{d.startedAt}</span></div>
            <div className="rm-row"><span className="k">Completed at</span><span className="v">{d.completedAt}</span></div>
            <div className="rm-row"><span className="k">Solve duration</span><span className="v">{d.duration}s ({(d.duration*1000).toLocaleString()}ms)</span></div>
            <div className="rm-row"><span className="k">Horizon</span><span className="v">{d.horizon}</span></div>
            <div className="rm-row"><span className="k">Lines included</span><span className="v">{d.lines.join(", ")}</span></div>
            <div className="rm-row"><span className="k">Include forecast</span><span className="v">{d.includeForecast ? "Yes" : "No"}</span></div>
            <div className="rm-row"><span className="k">Optimizer</span><span className="v" style={{fontSize:10}}>{d.optimizerVersion}</span></div>
            <div className="rm-row"><span className="k">Initiated by</span><span className="v">{d.initiatedBy}</span></div>
          </div>

          <div className="run-meta-card" style={{marginTop:10}}>
            <h3 style={{fontSize:13, margin:"0 0 10px", fontWeight:600}}>Input snapshot <span style={{fontSize:10, color:"var(--muted)", marginLeft:6}}>(collapsible)</span></h3>
            <div className="rm-row"><span className="k">WO count</span><span className="v">{d.inputSnapshot.woCount}</span></div>
            <div className="rm-row"><span className="k">Forecast week range</span><span className="v">{d.inputSnapshot.forecastWeekFrom} → {d.inputSnapshot.forecastWeekTo}</span></div>
            <div className="rm-row"><span className="k">Lines availability</span><span className="v" style={{fontSize:11}}>{Object.keys(d.inputSnapshot.linesAvailability).length} full</span></div>
            <div style={{marginTop:6}}><a style={{color:"var(--blue)", cursor:"pointer", fontSize:11}}>[View full snapshot JSON →]</a></div>
          </div>
        </div>

        <div>
          <div className="run-meta-card">
            <h3 style={{fontSize:13, margin:"0 0 10px", fontWeight:600}}>Output summary</h3>
            <div className="rm-row"><span className="k">WOs scheduled</span><span className="v"><b style={{color:"var(--green)"}}>{d.outputSummary.scheduled}</b> / {d.outputSummary.total}</span></div>
            <div className="rm-row"><span className="k">Unscheduled</span><span className="v">{d.outputSummary.unscheduled}</span></div>
            <div className="rm-row"><span className="k">Total CO</span><span className="v">{d.outputSummary.coTotal} min <span className="badge badge-green" style={{fontSize:9, marginLeft:4}}>{d.outputSummary.coDelta > 0 ? "+" : ""}{d.outputSummary.coDelta} vs prev</span></span></div>
            <div className="rm-row"><span className="k">Avg util</span><span className="v">{d.outputSummary.utilAvg}%</span></div>
            <div className="rm-row"><span className="k">Overrides</span><span className="v">{d.outputSummary.overrides}</span></div>
            <div className="rm-row"><span className="k">Fallback</span><span className="v">{d.outputSummary.fallback ? <span className="badge badge-amber" style={{fontSize:9}}>Yes — v1 heuristic</span> : "No"}</span></div>

            <h4 style={{fontSize:11, textTransform:"uppercase", letterSpacing:"0.04em", color:"var(--muted)", margin:"12px 0 6px"}}>Utilisation by line</h4>
            {Object.entries(d.outputSummary.utilByLine).map(([line, pct]) => (
              <div key={line} className="line-util-bar">
                <span className="lub-lbl">{line}</span>
                <span className="lub-track"><span className={"lub-fill " + (pct > 95 ? "warn" : pct < 80 ? "low" : "")} style={{width: pct + "%"}}></span></span>
                <span className="lub-pct">{pct.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Assignment table */}
      <h3 style={{marginTop:14, marginBottom:8, fontSize:13}}>Assignments ({PEXT_ASSIGNMENTS.length})</h3>
      <div className="card" style={{padding:0, marginBottom:12}}>
        <table>
          <thead>
            <tr><th>Rank</th><th>WO</th><th>Product</th><th>Line</th><th>Shift</th><th>Planned start</th><th>Dur.</th><th>Score</th><th>Status</th><th>Approved by</th></tr>
          </thead>
          <tbody>
            {PEXT_ASSIGNMENTS.slice(0,12).map(a => (
              <tr key={a.id}>
                <td className="mono muted">#{a.rank}</td>
                <td className="mono" style={{color:"var(--blue)", fontWeight:600}}>{a.wo}</td>
                <td style={{fontSize:11}}><span className="mono muted">{a.fa}</span> · {a.prod}</td>
                <td className="mono">{a.line}</td>
                <td className="mono">{a.shift}</td>
                <td className="mono" style={{fontSize:11}}>{PEXT_DATES[a.day].label} {a.start}:00</td>
                <td className="mono">{(a.end-a.start).toFixed(1)}h</td>
                <td className="mono" style={{fontWeight:600}}>{a.score}</td>
                <td><AssnStatus s={a.status}/></td>
                <td style={{fontSize:11}}>{a.status === "approved" ? "Monika Nowak" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Override log */}
      {d.overrides && d.overrides.length > 0 && (
        <>
          <h3 style={{marginTop:14, marginBottom:8, fontSize:13}}>Override log ({d.overrides.length})</h3>
          <div>
            {d.overrides.map((o, i) => (
              <div key={i} className="override-log-item">
                <div className="oli-head">
                  <span className="badge badge-amber" style={{fontSize:9}}>Overridden</span>
                  <span className="oli-when">{o.when}</span>
                  <span>by <b className="oli-user">{o.user}</b></span>
                  <span className="spacer" style={{flex:1}}></span>
                  <span className="mono" style={{fontWeight:600}}>{o.wo}</span>
                  <span style={{fontSize:11}}>· {o.fa}</span>
                </div>
                <div className="oli-diff">
                  <div><span className="muted">Original:</span> {o.from.line} / {o.from.shift} / {o.from.time}</div>
                  <div><span className="muted">Override:</span> {o.to.line} / {o.to.shift} / {o.to.time}</div>
                </div>
                <div className="oli-reason">
                  <b>{o.reason}</b> — "{o.note}"
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
};

Object.assign(window, { PextRunHistory, PextRunDetail });
