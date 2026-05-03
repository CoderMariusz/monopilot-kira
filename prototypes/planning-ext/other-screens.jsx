// ============ Other screens: Rule config, Settings ============

// -------- Rule config (links to 02-SETTINGS rule registry) --------
const PextRules = ({ role, onNav }) => {
  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Scheduler</a> · Rule config</div>
          <h1 className="page-title">Optimizer rule configuration</h1>
          <div className="muted" style={{fontSize:12}}>
            DSL rules from <span className="mono">02-SETTINGS rule_registry</span> that drive the scheduler. Dev-deployed, admin read-only.
          </div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm" disabled>Publish changes (admin)</button>
        </div>
      </div>

      <div className="alert-blue alert-box" style={{marginBottom:10}}>
        <span>ⓘ</span>
        <div>Active optimizer: <span className="mono">{PEXT_RULES[1].id}</span>. Planners cannot modify these rules — contact Dev to roll a new version.</div>
      </div>

      <h3 style={{marginTop:6, marginBottom:8, fontSize:13}}>Active rules</h3>
      {PEXT_RULES.filter(r => r.status === "active" || r.status === "standby").map(r => (
        <div key={r.id} className="rule-card">
          <div style={{display:"flex", gap:10, alignItems:"flex-start"}}>
            <span className={"badge " + (r.status === "active" ? "badge-green" : "badge-gray")} style={{fontSize:9}}>{r.status}</span>
            <div style={{flex:1}}>
              <div className="rc-dsl">{r.id}</div>
              <div style={{fontSize:12, fontWeight:600, marginTop:2}}>{r.title}</div>
              <div className="rc-desc">{r.desc}</div>
              <div className="rc-meta">Phase {r.phase} · last invoked {r.lastInvoked || "—"} · {r.invokes7d} runs last 7d</div>
            </div>
            <button className="btn btn-ghost btn-sm">View source →</button>
          </div>
        </div>
      ))}

      <h3 style={{marginTop:16, marginBottom:8, fontSize:13}}>P2 / disabled rules</h3>
      {PEXT_RULES.filter(r => r.status === "disabled").map(r => (
        <div key={r.id} className="rule-card" style={{opacity:0.65}}>
          <div style={{display:"flex", gap:10, alignItems:"flex-start"}}>
            <span className="badge badge-gray" style={{fontSize:9}}>disabled</span>
            <div style={{flex:1}}>
              <div className="rc-dsl">{r.id}</div>
              <div style={{fontSize:12, fontWeight:600, marginTop:2}}>{r.title}</div>
              <div className="rc-desc">{r.desc}</div>
              <div className="rc-meta">Phase {r.phase} · never invoked</div>
            </div>
          </div>
        </div>
      ))}

      <h3 style={{marginTop:16, marginBottom:8, fontSize:13}}>Feature flags</h3>
      <div className="card" style={{padding:0}}>
        <table>
          <thead>
            <tr><th>Flag</th><th>State</th><th>Phase</th><th>Description</th></tr>
          </thead>
          <tbody>
            {PEXT_FLAGS.map(f => (
              <tr key={f.key}>
                <td className="mono" style={{fontSize:11}}>{f.key}</td>
                <td><span className={"badge " + (f.on ? "badge-green" : "badge-gray")} style={{fontSize:10}}>{f.on ? "ON" : "OFF"}</span></td>
                <td><span className="badge badge-gray" style={{fontSize:9}}>{f.phase}</span></td>
                <td style={{fontSize:11}}>{f.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

// -------- Settings — minimal stub --------
const PextSettings = ({ role, onNav }) => {
  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Scheduler</a> · Planning+ settings</div>
          <h1 className="page-title">Planning+ settings</h1>
          <div className="muted" style={{fontSize:12}}>Scheduler-level defaults. Admin only.</div>
        </div>
      </div>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
        <div className="card" style={{padding:14}}>
          <h3 style={{fontSize:13, margin:"0 0 10px"}}>Default run parameters</h3>
          <div className="ff"><label>Default horizon</label><select><option>7 days</option><option disabled>14 days (P2)</option></select></div>
          <div className="ff"><label>Auto-refresh interval</label><select><option>60s</option><option>30s</option><option>Off</option></select></div>
          <div className="ff"><label>Include forecast by default</label><select><option>Yes</option><option>No</option></select></div>
          <div className="ff"><label>Solver timeout (seconds)</label><input type="number" defaultValue={120}/></div>
        </div>
        <div className="card" style={{padding:14}}>
          <h3 style={{fontSize:13, margin:"0 0 10px"}}>Alerts &amp; notifications</h3>
          <div className="ff"><label>Capacity violation alert threshold</label><input defaultValue="95%"/></div>
          <div className="ff"><label>Stale schedule warning</label><select><option>12h</option><option>24h</option></select></div>
          <div className="ff"><label>Override rate alert</label><input defaultValue="15%"/></div>
        </div>
        <div className="card" style={{padding:14}}>
          <h3 style={{fontSize:13, margin:"0 0 10px"}}>Integration</h3>
          <div className="ff"><label>Solver service URL</label><input className="mono" style={{fontSize:11}} defaultValue="http://planner-solver.internal:8001/api" disabled/></div>
          <div className="ff"><label>Circuit breaker — max retries</label><input type="number" defaultValue={3}/></div>
          <div className="ff"><label>Circuit breaker — reset minutes</label><input type="number" defaultValue={15}/></div>
        </div>
        <div className="card" style={{padding:14}}>
          <h3 style={{fontSize:13, margin:"0 0 10px"}}>Premium status</h3>
          <div className="prem-strip" style={{marginBottom:10}}>
            <b>PRO tier ACTIVE</b> · Full finite-capacity + v2 optimizer
          </div>
          <div style={{fontSize:11, color:"var(--muted)", lineHeight:1.6}}>
            Planning+ is a premium extension of the base Planning module. P1 features:<br/>
            • Finite-capacity solver<br/>
            • Allergen sequencing optimizer v2<br/>
            • Changeover matrix editor<br/>
            • Scheduler run history + audit<br/>
            • Manual forecast upload<br/>
            P2 features (flags above):<br/>
            • What-if simulation<br/>
            • Prophet ML forecasting<br/>
            • Disposition bridge<br/>
            • 14-day horizon
          </div>
        </div>
      </div>
    </>
  );
};

Object.assign(window, { PextRules, PextSettings });
