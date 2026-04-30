// ============ SCR-07-03 — Forecast Upload / View ============

const PextForecasts = ({ role, onNav, openModal }) => {
  const [prophetEnabled, setProphetEnabled] = React.useState(PEXT_FORECAST_STATUS.p2Enabled);
  const [sourceFilter, setSourceFilter] = React.useState("all");
  const rows = PEXT_FORECASTS.filter(f => sourceFilter === "all" || f.source === sourceFilter);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Scheduler</a> · Demand forecasts</div>
          <h1 className="page-title">Demand forecasts</h1>
          <div className="muted" style={{fontSize:12}}>
            Source: <b>Manual</b> (P1) · Prophet ML: <span className="badge badge-gray" style={{fontSize:9}}>P2</span> ·
            {" "}Feeds <span className="mono">include_forecast=true</span> solver runs
          </div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm" onClick={()=>setProphetEnabled(!prophetEnabled)}>
            {prophetEnabled ? "✓ Prophet ON (P2 preview)" : "○ Prophet OFF"}
          </button>
          <button className="btn btn-primary btn-sm" onClick={()=>openModal("forecastUpload")}>⇪ Upload forecast CSV</button>
        </div>
      </div>

      {/* Status banner */}
      <div className="card" style={{padding:"12px 14px", marginBottom:10}}>
        <div className="row-flex" style={{fontSize:12, marginBottom:6}}>
          <b>Source:</b> <FcstSource s={PEXT_FORECAST_STATUS.source}/>
          <span style={{marginLeft:10}}>Last upload: <span className="mono">{PEXT_FORECAST_STATUS.lastUpload}</span> by <b>{PEXT_FORECAST_STATUS.lastUploadBy}</b></span>
          <span className="spacer" style={{flex:1}}></span>
          <span className="mono">Coverage: {PEXT_FORECAST_STATUS.weekFrom} → {PEXT_FORECAST_STATUS.weekTo} ({PEXT_FORECAST_STATUS.weeksCovered} weeks) · {PEXT_FORECAST_STATUS.productsCovered} products</span>
        </div>
      </div>

      {/* P2 — Prophet health (rendered when flag on) */}
      {prophetEnabled && (
        <>
          <div className="alert-blue alert-box" style={{marginBottom:10, fontSize:12}}>
            <span>ⓘ</span>
            <div><b>P2 preview:</b> Prophet ML forecasting active. Manual overrides still allowed per-cell.</div>
          </div>
          <div className="fcst-health">
            <div className="fh-card">
              <div className="fh-lbl">Forecaster status</div>
              <div className="fh-val" style={{color:"var(--green)"}}>● Healthy</div>
              <div className="fh-sub">Service: prophet-forecaster-v1</div>
            </div>
            <div className="fh-card">
              <div className="fh-lbl">Last retrain</div>
              <div className="fh-val">01:00 UTC</div>
              <div className="fh-sub">{PEXT_FCST_HEALTH.productsTrained} products · {PEXT_FCST_HEALTH.duration}</div>
            </div>
            <div className="fh-card">
              <div className="fh-lbl">SMAPE (30d rolling)</div>
              <div className="fh-val" style={{color:"var(--green)"}}>{PEXT_FCST_HEALTH.smape30d}%</div>
              <div className="fh-sub">Target &lt;20% · green</div>
            </div>
            <div className="fh-card">
              <div className="fh-lbl">Data freshness</div>
              <div className="fh-val">{PEXT_FCST_HEALTH.staleDays}d</div>
              <div className="fh-sub">Stale threshold: 7d</div>
            </div>
          </div>
        </>
      )}

      <div className="filter-bar">
        <input placeholder="Search product code / name…" style={{width:220}}/>
        <select style={{width:150}} value={sourceFilter} onChange={e=>setSourceFilter(e.target.value)}>
          <option value="all">All sources</option>
          <option value="manual">Manual</option>
          <option value="prophet">ML Prophet</option>
          <option value="overridden">Overridden</option>
        </select>
        <input placeholder="Week from" style={{width:120}} defaultValue="2026-W17"/>
        <input placeholder="Week to" style={{width:120}} defaultValue="2026-W24"/>
        <span className="spacer"></span>
        <button className="btn btn-ghost btn-sm">Download template</button>
      </div>

      <div className="card" style={{padding:0}}>
        <table className="fcst-table">
          <thead>
            <tr>
              <th className="prod">Product</th>
              {PEXT_FORECAST_WEEKS.map(w => <th key={w} title={w}>{w.slice(5)}</th>)}
              <th>Source</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(f => (
              <tr key={f.code}>
                <td className="prod">
                  <div className="mono" style={{fontSize:11, fontWeight:600}}>{f.code}</div>
                  <div style={{fontSize:11}}>{f.name}</div>
                </td>
                {f.w.map((v, i) => (
                  <td key={i} className={f.source === "overridden" && i < 3 ? "overridden" : ""}
                      title={f.source === "overridden" && i < 3 && f.overrideFrom ? `Overridden from ${f.overrideFrom} kg by ${f.overrideBy} on ${f.overrideDate}` : null}>
                    {v}
                  </td>
                ))}
                <td style={{fontFamily:"inherit"}}>
                  <FcstSource s={f.source}/>
                  {f.source === "prophet" && f.smape !== undefined && (
                    <div style={{fontSize:10, color: f.smape < 20 ? "var(--green)" : "var(--amber)", fontFamily:"var(--font-mono)", marginTop:2}}>SMAPE: {f.smape}%</div>
                  )}
                </td>
                <td style={{fontFamily:"inherit", fontSize:11, color:"var(--muted)"}}>
                  {f.source === "overridden" ? f.overrideDate + " by " + f.overrideBy : "2026-04-18 by Monika Nowak"}
                </td>
                <td style={{fontFamily:"inherit"}}>
                  <button className="btn btn-ghost btn-sm">Override</button>
                  <button className="btn btn-ghost btn-sm">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* P2 Chart view (Prophet) — simplified SVG sparklines */}
      {prophetEnabled && (
        <div style={{marginTop:16}}>
          <h3 style={{fontSize:13, marginBottom:8}}>Forecast vs actual (last 4 products, P2 preview)</h3>
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10}}>
            {rows.slice(0,4).map(f => {
              const pts = f.w.map((v,i) => ({ x: i * 40 + 10, y: 60 - (v / Math.max(...f.w)) * 50 }));
              const pathD = pts.map((p,i) => (i === 0 ? "M" : "L") + p.x + "," + p.y).join(" ");
              return (
                <div key={f.code} className="card" style={{padding:10}}>
                  <div style={{fontSize:11, fontWeight:600, marginBottom:4}}>{f.code} · {f.name}</div>
                  <div className="fcst-spark">
                    <svg viewBox="0 0 340 60">
                      <path d={pathD} fill="none" stroke="#22c55e" strokeWidth="2"/>
                      {pts.map((p,i) => <circle key={i} cx={p.x} cy={p.y} r="2" fill="#22c55e"/>)}
                    </svg>
                    <div className="spark-today" style={{left:"37%"}}></div>
                  </div>
                  <div style={{display:"flex", justifyContent:"space-between", fontSize:10, color:"var(--muted)", marginTop:4}}>
                    <span>W17</span><span>W20</span><span className="mono" style={{color:"var(--blue)"}}>| today</span><span>W24</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
};

Object.assign(window, { PextForecasts });
