// ============ SCR-07-06 — Allergen Sequencing Review (v2 overlay on Planning base) ============

const PextSequencing = ({ role, onNav, openModal }) => {
  const [previewMode, setPreviewMode] = React.useState(false);
  const [previewRunState, setPreviewRunState] = React.useState("idle"); // idle | running | done

  const startPreview = () => {
    setPreviewRunState("running");
    setTimeout(() => {
      setPreviewRunState("done");
      setPreviewMode(true);
    }, 1200);
  };

  const v2 = PEXT_SEQUENCING_V2;
  const savingMin = v2.baselineCoMinutes - v2.totalCoMinutes;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Scheduler</a> · Allergen sequencing (v2)</div>
          <h1 className="page-title">Allergen sequencing — v2 overlay</h1>
          <div className="muted" style={{fontSize:12}}>
            Extends <a style={{color:"var(--blue)", cursor:"pointer"}}>Planning › Sequencing</a> with full optimizer v2 output.
            Rule: <span className="mono">{v2.ruleId}</span>
          </div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm" disabled={previewRunState === "running"} onClick={startPreview}>
            {previewRunState === "running" ? "Running preview…" : "◎ Preview sequence (dry-run)"}
          </button>
          <button className="btn btn-primary btn-sm">↯ Commit to schedule</button>
          <button className="btn btn-ghost btn-sm" style={{color:"var(--red)"}} onClick={()=>openModal("disableV2")}>Disable v2</button>
        </div>
      </div>

      {/* v2 enhancement banner */}
      <div className="seq-enhance-banner">
        <span style={{fontSize:18}}>✦</span>
        <div style={{flex:1}}>
          <b>Allergen Optimizer v2 ACTIVE</b> — rule <span className="mono">{v2.ruleId}</span><br/>
          <span style={{fontSize:11, color:"var(--muted)"}}>
            Fallback: <span className="mono">{v2.fallback}</span> (standby) ·
            Enforces <b>V-SCHED-05</b> (changeover between differing allergens) + <b>V-SCHED-06</b> (minutes ≥ matrix lookup)
          </span>
        </div>
        <a style={{color:"var(--blue)", fontSize:11, cursor:"pointer"}} onClick={()=>onNav("rules")}>View rule in Settings →</a>
      </div>

      {/* Changeover cost summary */}
      <div className="kpi-row-4">
        <div className="kpi green">
          <div className="kpi-label">Total changeover (v2)</div>
          <div className="kpi-value">{v2.totalCoMinutes} min</div>
          <div className="kpi-sub">Current horizon — 7 days</div>
        </div>
        <div className="kpi amber">
          <div className="kpi-label">v1 heuristic baseline</div>
          <div className="kpi-value">{v2.baselineCoMinutes} min</div>
          <div className="kpi-sub">If v1 ran this horizon</div>
        </div>
        <div className="kpi green">
          <div className="kpi-label">CO reduction</div>
          <div className="kpi-value" style={{color:"var(--green)"}}>−{savingMin} min</div>
          <div className="kpi-sub">{v2.savingPct}% saving · Target ≥30%</div>
        </div>
        <div className="kpi blue">
          <div className="kpi-label">Cross-line moves</div>
          <div className="kpi-value">{v2.crossLineMovedCount}</div>
          <div className="kpi-sub">WOs re-assigned between lines</div>
        </div>
      </div>

      {/* Progress bar toward target */}
      <div className="card" style={{padding:"10px 14px", marginBottom:12}}>
        <div style={{display:"flex", justifyContent:"space-between", fontSize:11, marginBottom:6}}>
          <span>CO reduction progress (target ≥30%)</span>
          <span className="mono"><b>{v2.savingPct}%</b> / 30% target</span>
        </div>
        <div className="solver-progress"><span style={{width: Math.min(v2.savingPct / 30 * 100, 100) + "%", background: v2.savingPct >= 30 ? "linear-gradient(90deg, #22c55e, #16a34a)" : "linear-gradient(90deg, #f59e0b, #d97706)"}}></span></div>
        <div style={{fontSize:11, color:"var(--green-700)", marginTop:4}}>✓ Target met — 0 fallback activations in last 7 days</div>
      </div>

      {/* Preview mode (dry-run) comparison */}
      {previewMode && (
        <>
          <div className="alert-blue alert-box" style={{marginBottom:10}}>
            <span>◎</span>
            <div>
              <b>Dry-run preview</b> — proposed v2 sequence shown side-by-side against current.
              {" "}Delta: <b style={{color:"var(--green)"}}>{v2.crossLineMovedCount} WOs re-sequenced · {v2.baselineCoMinutes - v2.totalCoMinutes} min saved</b>.
              {" "}This dry-run expires in 24h if neither committed nor discarded.
            </div>
          </div>

          <div className="sequence-compare">
            <div className="sequence-panel baseline">
              <div className="sequence-panel-head">Current (v1 heuristic) — total CO: {v2.baselineCoMinutes} min</div>
              {PEXT_SEQ_BASELINE.map(s => (
                <div key={s.rank} className="sequence-step">
                  <span className="seq-rank">#{s.rank}</span>
                  <div>
                    <div className="mono" style={{fontSize:11, fontWeight:600, color:"var(--blue)"}}>{s.wo}</div>
                    <div style={{fontSize:11}}>{s.fa} · <span className="mono muted" style={{fontSize:10}}>{s.line}</span></div>
                    <AllergenPills codes={s.allergen.split("+")}/>
                  </div>
                  <span className="seq-co">
                    {s.coBefore > 0 ? `+${s.coBefore}m` : "0"}
                  </span>
                </div>
              ))}
            </div>
            <div className="sequence-panel proposed">
              <div className="sequence-panel-head">Proposed (v2 optimizer) — total CO: {v2.totalCoMinutes} min <span className="badge badge-green" style={{fontSize:9, marginLeft:6}}>−{savingMin} min</span></div>
              {PEXT_SEQ_PROPOSED.map(s => (
                <div key={s.rank} className={"sequence-step " + (s.moved ? "moved" : "")}>
                  <span className="seq-rank">#{s.rank}</span>
                  <div>
                    <div className="mono" style={{fontSize:11, fontWeight:600, color:"var(--blue)"}}>{s.wo} {s.moved && <span className="badge badge-blue" style={{fontSize:9, marginLeft:4}}>MOVED</span>}</div>
                    <div style={{fontSize:11}}>{s.fa} · <span className="mono muted" style={{fontSize:10}}>{s.line}</span></div>
                    <AllergenPills codes={s.allergen.split("+")}/>
                  </div>
                  <span className="seq-co">
                    {s.coBefore > 0 ? `+${s.coBefore}m` : "0"}
                    {s.savingMin && <div className="muted" style={{fontSize:9}}>saved {s.savingMin}m</div>}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div style={{display:"flex", gap:6, justifyContent:"flex-end", marginTop:10}}>
            <button className="btn btn-ghost btn-sm" onClick={()=>{ setPreviewMode(false); setPreviewRunState("idle"); }}>Discard</button>
            <button className="btn btn-primary btn-sm">✓ Commit preview (to draft assignments)</button>
          </div>
        </>
      )}

      {/* Sequence table (v2 enhancements) */}
      {!previewMode && (
        <>
          <h3 style={{marginTop:14, marginBottom:8, fontSize:13}}>Current sequence (v2 optimizer output)</h3>
          <div className="card" style={{padding:0}}>
            <table>
              <thead>
                <tr>
                  <th>#</th><th>WO</th><th>Product</th><th>Line</th><th>Allergen</th><th>Start</th><th>CO (min)</th><th>Clean</th><th>ATP</th><th>Risk</th><th>Cross-line</th>
                </tr>
              </thead>
              <tbody>
                {PEXT_SEQ_PROPOSED.map(s => {
                  const risk = s.coBefore > 60 ? "high" : s.coBefore > 15 ? "medium" : s.coBefore > 0 ? "low" : "none";
                  return (
                    <tr key={s.rank}>
                      <td className="mono muted">#{s.rank}</td>
                      <td className="mono" style={{color:"var(--blue)", fontWeight:600}}>{s.wo}</td>
                      <td style={{fontSize:11}}>{s.fa}</td>
                      <td className="mono">{s.line}</td>
                      <td><AllergenPills codes={s.allergen.split("+")}/></td>
                      <td className="mono">06:00</td>
                      <td className={"mono " + (s.coBefore > 45 ? "exp-red" : s.coBefore > 15 ? "exp-amber" : "")}>{s.coBefore} min</td>
                      <td>{s.coBefore > 0 ? "Yes" : "—"}</td>
                      <td>{s.allergen.includes("PEANUT") ? "Yes" : "—"}</td>
                      <td><CORisk r={risk}/></td>
                      <td>{s.moved ? <span className="badge badge-blue" style={{fontSize:9}}>Moved (saved {s.savingMin || 30}m)</span> : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
};

Object.assign(window, { PextSequencing });
