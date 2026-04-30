// ============ SCR-07-05 — What-If Simulation [P2] ============

const PextScenarios = ({ role, onNav, openModal }) => {
  const [p2Enabled, setP2Enabled] = React.useState(true); // enable fully interactive preview
  const [activeScenario, setActiveScenario] = React.useState(PEXT_ACTIVE_SCENARIO);
  const [builderOpen, setBuilderOpen] = React.useState(false);
  const [mods, setMods] = React.useState(activeScenario.modifications);
  const [scenName, setScenName] = React.useState(activeScenario.name);
  const [runState, setRunState] = React.useState("idle"); // idle | running | done
  const [selectedPreset, setSelectedPreset] = React.useState(null);

  const addMod = (preset) => {
    setSelectedPreset(preset.key);
    const label = preset.label + " (auto-seeded)";
    setMods([...mods, { type: preset.key, label }]);
  };
  const removeMod = (i) => setMods(mods.filter((_,idx) => idx !== i));

  const runSim = () => {
    setRunState("running");
    setTimeout(() => setRunState("done"), 1600);
  };

  if (!p2Enabled) {
    return (
      <>
        <div className="page-head">
          <div>
            <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Scheduler</a> · What-if simulation</div>
            <h1 className="page-title">What-if simulation</h1>
          </div>
        </div>
        <div className="card" style={{padding:"40px 40px", textAlign:"center"}}>
          <div style={{fontSize:32, marginBottom:8}}>⊕</div>
          <h2 style={{fontSize:18, margin:"0 0 6px"}}>What-if simulation <span className="badge badge-gray" style={{fontSize:10}}>P2</span></h2>
          <p style={{color:"var(--muted)", margin:"0 0 16px"}}>Model capacity shocks and compare KPIs before committing any changes.</p>
          <ul style={{textAlign:"left", maxWidth:460, margin:"0 auto 20px", fontSize:12, color:"var(--muted)", lineHeight:1.8}}>
            <li>Line down for N hours</li>
            <li>Add / remove WO from schedule</li>
            <li>Shift capacity adjustment (±%)</li>
            <li>Side-by-side KPI comparison (baseline vs scenario)</li>
          </ul>
          <button className="btn btn-primary btn-sm" onClick={()=>setP2Enabled(true)}>Enable P2 preview</button>
          <div style={{marginTop:14}}><a style={{color:"var(--blue)", cursor:"pointer", fontSize:12}}>Notify me when Phase 2 is available</a></div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Scheduler</a> · What-if simulation</div>
          <h1 className="page-title">What-if simulation <span className="badge badge-amber" style={{fontSize:10, marginLeft:6}}>P2 preview</span></h1>
          <div className="muted" style={{fontSize:12}}>Model capacity shocks against a baseline scheduler run. Never committed to production <span className="mono">scheduler_assignments</span>.</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm" onClick={()=>setP2Enabled(false)}>⊘ Disable P2 preview</button>
          <button className="btn btn-secondary btn-sm">📁 Saved scenarios ({PEXT_SCENARIOS.length})</button>
          <button className="btn btn-primary btn-sm" onClick={()=>setBuilderOpen(true)}>＋ New scenario</button>
        </div>
      </div>

      <div style={{display:"grid", gridTemplateColumns:"340px 1fr", gap:12, alignItems:"flex-start"}}>
        {/* ======= Scenario builder (left) ======= */}
        <div className="scenario-builder">
          <div style={{fontSize:11, textTransform:"uppercase", letterSpacing:"0.05em", color:"var(--muted)", fontWeight:700, marginBottom:6}}>Baseline</div>
          <div className="summary-block" style={{marginBottom:10}}>
            <div className="summary-row"><span className="muted">Run</span><span className="spacer"></span><span className="mono">{activeScenario.baseline}</span></div>
            <div className="summary-row"><span className="muted">CO total</span><span className="spacer"></span><span className="mono">{activeScenario.baselineSnapshot.coTotal} min</span></div>
            <div className="summary-row"><span className="muted">Avg util</span><span className="spacer"></span><span className="mono">{activeScenario.baselineSnapshot.util}%</span></div>
          </div>

          <Field label="Scenario name" required>
            <input value={scenName} onChange={e=>setScenName(e.target.value)}/>
          </Field>

          <div className="ff">
            <label>Archetype</label>
            <div className="pills">
              <button className="pill">🛡 Conservative</button>
              <button className="pill on">⚖ Balanced</button>
              <button className="pill">⚡ Aggressive</button>
            </div>
          </div>

          <div className="ff">
            <label>Quick presets</label>
            <div className="preset-chips">
              {PEXT_SCENARIO_PRESETS.map(p => (
                <span key={p.key} className={"preset-chip " + (selectedPreset === p.key ? "on" : "")} onClick={()=>addMod(p)} title={p.desc}>
                  <span style={{marginRight:4}}>{p.ic}</span>{p.label}
                </span>
              ))}
            </div>
          </div>

          <div className="ff">
            <label>Modifications ({mods.length})</label>
            <div className="scenario-mod-list">
              {mods.map((m, i) => (
                <div key={i} className="scenario-mod">
                  <span className="sm-type">{m.type}</span>
                  <span>{m.label}</span>
                  <span className="sm-rm" onClick={()=>removeMod(i)}>✕</span>
                </div>
              ))}
              {mods.length === 0 && <div className="muted" style={{fontSize:11, padding:"8px 4px"}}>No modifications yet. Click a preset above.</div>}
            </div>
          </div>

          <div style={{display:"flex", gap:6, marginTop:10}}>
            <button className="btn btn-primary btn-sm" disabled={runState === "running" || mods.length === 0} onClick={runSim}>
              {runState === "running" ? "Simulating…" : "↯ Run simulation"}
            </button>
            <button className="btn btn-secondary btn-sm">Clear</button>
            <button className="btn btn-ghost btn-sm">Save</button>
          </div>
          {runState === "running" && (
            <div style={{marginTop:10}}>
              <div className="solver-progress indet"><span></span></div>
              <div style={{fontSize:11, color:"var(--muted)", marginTop:4}}>Running solver on snapshot... baseline preserved.</div>
            </div>
          )}
        </div>

        {/* ======= Simulation result (right) ======= */}
        <div>
          {/* KPI compare */}
          <div className="scenario-kpi-compare">
            <div className="hdr">KPI</div>
            <div className="hdr">Baseline</div>
            <div className="hdr">Simulation</div>
            <div className="hdr">Delta</div>

            <div>Total changeover (min)</div>
            <div className="mono">{activeScenario.baselineSnapshot.coTotal}</div>
            <div className="mono">{activeScenario.simulation.coTotal}</div>
            <div><span className={"badge " + activeScenario.deltaBadges.co.cls} style={{fontSize:10}}>{activeScenario.deltaBadges.co.text}</span></div>

            <div>Avg utilisation</div>
            <div className="mono">{activeScenario.baselineSnapshot.util}%</div>
            <div className="mono">{activeScenario.simulation.util}%</div>
            <div><span className={"badge " + activeScenario.deltaBadges.util.cls} style={{fontSize:10}}>{activeScenario.deltaBadges.util.text}</span></div>

            <div>Overdue WOs</div>
            <div className="mono">{activeScenario.baselineSnapshot.overdue}</div>
            <div className="mono">{activeScenario.simulation.overdue}</div>
            <div><span className={"badge " + activeScenario.deltaBadges.overdue.cls} style={{fontSize:10}}>{activeScenario.deltaBadges.overdue.text}</span></div>

            <div>Unscheduled WOs</div>
            <div className="mono">{activeScenario.baselineSnapshot.unscheduled}</div>
            <div className="mono">{activeScenario.simulation.unscheduled}</div>
            <div><span className={"badge " + activeScenario.deltaBadges.unscheduled.cls} style={{fontSize:10}}>{activeScenario.deltaBadges.unscheduled.text}</span></div>
          </div>

          {/* Dual gantt (simplified) */}
          <div className="dual-gantt">
            <div className="dg-panel">
              <div className="dg-head base">BASELINE · {activeScenario.baseline}</div>
              <div style={{padding:10}}>
                <MiniGantt type="baseline"/>
              </div>
            </div>
            <div className="dg-panel">
              <div className="dg-head sim">SCENARIO · {activeScenario.id}</div>
              <div style={{padding:10}}>
                <MiniGantt type="scenario"/>
              </div>
            </div>
          </div>

          <div style={{display:"flex", gap:6, justifyContent:"flex-end", marginTop:10}}>
            <button className="btn btn-ghost btn-sm">Discard</button>
            <button className="btn btn-secondary btn-sm">Save scenario</button>
            <button className="btn btn-primary btn-sm" disabled>Apply scenario (P2)</button>
          </div>
        </div>
      </div>

      {/* Saved scenarios list */}
      <h3 style={{marginTop:18, marginBottom:8, fontSize:13}}>Saved scenarios</h3>
      <div className="card" style={{padding:0}}>
        <table>
          <thead>
            <tr><th>Scenario ID</th><th>Name</th><th>Baseline run</th><th>Archetype</th><th>Key delta</th><th>Modifications</th><th>Created</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {PEXT_SCENARIOS.map(s => (
              <tr key={s.id}>
                <td className="mono" style={{color:"var(--blue)", fontWeight:600}}>{s.id}</td>
                <td>{s.name}</td>
                <td className="mono">{s.baseline}</td>
                <td><ScenarioType t={s.type}/></td>
                <td className="mono" style={{fontSize:11}}>{s.keyDelta}</td>
                <td className="mono num">{s.modCount}</td>
                <td style={{fontSize:11, color:"var(--muted)"}}>{s.createdAt}<br/>by {s.createdBy}</td>
                <td>
                  <button className="btn btn-sm btn-secondary">View</button>{" "}
                  <button className="btn btn-sm btn-ghost">Re-run</button>{" "}
                  <button className="btn btn-sm btn-ghost" style={{color:"var(--red)"}}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

// Mini Gantt for scenario compare — simplified 5 lines x 4 days
const MiniGantt = ({ type }) => {
  const lineCount = 5;
  const dayCount = 4;
  return (
    <svg viewBox="0 0 400 180" style={{width:"100%", height:180}}>
      {Array.from({length: lineCount}).map((_, i) => (
        <React.Fragment key={i}>
          <rect x="0" y={i*36} width="60" height="36" fill="#f8fafc" stroke="#e2e8f0"/>
          <text x="5" y={i*36+14} fontSize="10" fill="#64748b">LINE-0{i+1}</text>
          <text x="5" y={i*36+26} fontSize="8" fill="#94a3b8">{[800,600,500,450,1200][i]}kg/h</text>
          {Array.from({length: dayCount}).map((_, d) => (
            <line key={d} x1={60 + d*80} y1={i*36} x2={60 + d*80} y2={i*36+36} stroke="#f1f5f9"/>
          ))}
        </React.Fragment>
      ))}
      {type === "baseline" ? (
        <>
          <rect x="70" y="4" width="60" height="28" rx="3" fill="#f59e0b"/>
          <text x="74" y="22" fontSize="9" fill="#fff">WO-0108</text>
          <rect x="135" y="4" width="40" height="28" rx="3" fill="#94a3b8"/>
          <rect x="70" y="40" width="70" height="28" rx="3" fill="#94a3b8"/>
          <rect x="70" y="76" width="90" height="28" rx="3" fill="#a855f7"/>
          <text x="74" y="94" fontSize="9" fill="#fff">WO-0113</text>
          <rect x="70" y="112" width="100" height="28" rx="3" fill="#ca8a04"/>
          <rect x="70" y="148" width="110" height="28" rx="3" fill="#94a3b8"/>
        </>
      ) : (
        <>
          <rect x="70" y="4" width="60" height="28" rx="3" fill="#f59e0b"/>
          <text x="74" y="22" fontSize="9" fill="#fff">WO-0108</text>
          <rect x="135" y="4" width="40" height="28" rx="3" fill="#94a3b8"/>
          <rect x="70" y="40" width="70" height="28" rx="3" fill="#94a3b8"/>
          {/* Line-03 DOWN — shaded */}
          <rect x="70" y="76" width="240" height="28" rx="3" fill="url(#lineDown)" stroke="#ef4444" strokeDasharray="4,2"/>
          <text x="120" y="94" fontSize="9" fill="#991b1b" fontWeight="700">LINE-03 DOWN 8h</text>
          {/* Overflow onto LINE-01 */}
          <rect x="210" y="4" width="80" height="28" rx="3" fill="#a855f7" stroke="#f59e0b" strokeDasharray="3,2"/>
          <text x="214" y="22" fontSize="9" fill="#fff">WO-0113→L1</text>
          <rect x="70" y="112" width="100" height="28" rx="3" fill="#ca8a04"/>
          <rect x="70" y="148" width="110" height="28" rx="3" fill="#94a3b8"/>
          <defs>
            <pattern id="lineDown" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="4" height="8" fill="#fee2e2"/>
              <rect x="4" width="4" height="8" fill="#fecaca"/>
            </pattern>
          </defs>
        </>
      )}
      <line x1="60" y1="0" x2="60" y2="180" stroke="#cbd5e1"/>
    </svg>
  );
};

Object.assign(window, { PextScenarios, MiniGantt });
