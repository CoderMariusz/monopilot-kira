// ============ MAINT-001 — Maintenance Dashboard ============

const MntDashboard = ({ role, onNav, openModal }) => {
  const [dismissed, setDismissed] = React.useState(new Set());
  const [onboardingDismissed, setOnboardingDismissed] = React.useState(false);

  const dismiss = (code) => {
    const next = new Set(dismissed); next.add(code); setDismissed(next);
  };
  const visibleAlerts = MNT_ALERTS.filter(a => !dismissed.has(a.code));

  const isManager = role === "Manager" || role === "Admin";

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a>Maintenance</a> · Dashboard</div>
          <h1 className="page-title">Maintenance — dashboard</h1>
          <div className="muted" style={{fontSize:12}}>
            WH-Factory-A · 15 assets · <b>Data refreshed 18s ago</b> · Auto-refresh 30s
          </div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm" onClick={()=>openModal("mwoCreate")}>＋ New mWO</button>
          <button className="btn btn-primary btn-sm" onClick={()=>openModal("wrCreate")}>＋ Submit Work Request</button>
        </div>
      </div>

      {/* Critical alerts strip (MAINT-001 §Alert strip) */}
      {visibleAlerts.filter(a=>a.severity==="red").length > 0 && (
        <div className="alerts-critical">
          <span className="ac-ic">⚠</span>
          <div className="ac-text">
            <strong>{visibleAlerts.filter(a=>a.severity==="red").length} critical alert(s)</strong> — review immediately. Overdue calibration on CCP-linked instrument · mWO SLA breach.
          </div>
          <button className="btn btn-sm btn-danger" onClick={()=>onNav("calibration")}>View →</button>
        </div>
      )}

      {/* Onboarding card (only shown if not dismissed) */}
      {!onboardingDismissed && isManager && (
        <div className="onboarding-card">
          <div className="row-flex" style={{marginBottom:4}}>
            <h3>Set up Maintenance in 5 steps</h3>
            <span className="spacer"></span>
            <a style={{fontSize:11, cursor:"pointer"}} onClick={()=>setOnboardingDismissed(true)}>Dismiss ✕</a>
          </div>
          <div className="muted" style={{fontSize:11}}>Shortcuts to configure your CMMS — 3 of 5 complete.</div>
          <div className="onboarding-steps">
            <div className="onb-step done"><span className="osn"></span><span className="onb-step-text">Import or create your first asset</span><button className="btn btn-ghost btn-sm" onClick={()=>onNav("assets")}>Go to Assets →</button></div>
            <div className="onb-step done"><span className="osn"></span><span className="onb-step-text">Add at least one technician</span><button className="btn btn-ghost btn-sm" onClick={()=>onNav("technicians")}>Go to Technicians →</button></div>
            <div className="onb-step done"><span className="osn"></span><span className="onb-step-text">Create a PM schedule for your critical asset</span><button className="btn btn-ghost btn-sm" onClick={()=>onNav("pm_schedules")}>Go to PM Schedules →</button></div>
            <div className="onb-step"><span className="osn">4</span><span className="onb-step-text">Register your calibration instruments</span><button className="btn btn-secondary btn-sm" onClick={()=>onNav("calibration")}>Go to Calibration →</button></div>
            <div className="onb-step"><span className="osn">5</span><span className="onb-step-text">Configure maintenance settings (LOTO, thresholds, notifications)</span><button className="btn btn-secondary btn-sm" onClick={()=>onNav("settings")}>Go to Settings →</button></div>
          </div>
          <div className="onb-progress"><span style={{width:"60%"}}></span></div>
        </div>
      )}

      {/* KPI row — 8 cards in 2×4 grid */}
      <div className="kpi-grid-8">
        {MNT_KPIS.map(k => (
          <div key={k.k} className={"kpi " + k.accent} onClick={()=>onNav(k.target)} style={{cursor:"pointer"}}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Main two-column: left=mWOs today, right=alerts+LOTO */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 360px", gap:12}}>
        {/* LEFT column — Today's mWO list */}
        <div>
          <div className="card">
            <div className="card-head">
              <h3 className="card-title">🔧 mWOs scheduled today</h3>
              <button className="btn btn-ghost btn-sm" onClick={()=>onNav("mwos")}>View all mWOs →</button>
            </div>
            <table>
              <thead>
                <tr>
                  <th>mWO #</th>
                  <th>Asset</th>
                  <th>Type</th>
                  <th>Priority</th>
                  <th>Technician</th>
                  <th>Status</th>
                  <th>Start</th>
                </tr>
              </thead>
              <tbody>
                {MNT_TODAY_MWOS.map(m => (
                  <tr key={m.mwo} style={{cursor:"pointer"}} onClick={()=>onNav("mwo_detail")}>
                    <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{m.mwo}</td>
                    <td style={{fontSize:11}}>{m.asset}</td>
                    <td><MwoType t={m.type}/></td>
                    <td><PriorityBadge p={m.pri}/></td>
                    <td style={{fontSize:11}}>
                      {m.tech ? m.tech : <span className="mono" style={{color:"var(--amber)", fontStyle:"italic"}}>Unassigned</span>}
                    </td>
                    <td><MwoStatus s={m.status}/></td>
                    <td className="mono" style={{fontSize:11}}>{m.start}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Overdue PMs widget */}
          <div className="card" style={{marginTop:12}}>
            <div className="card-head">
              <h3 className="card-title">📅 PM compliance — next 14 days</h3>
              <button className="btn btn-ghost btn-sm" onClick={()=>onNav("pm_schedules")}>Open PM schedules →</button>
            </div>
            <div className="exp-strip">
              <div className="exp-card red" onClick={()=>onNav("pm_schedules")} style={{cursor:"pointer"}}>
                <div className="ex-big">{MNT_PM_SCHEDULES.filter(p=>p.days<0).length}</div>
                <div className="ex-lab">PM(s) overdue</div>
                <div className="ex-sub">Red tier · Address immediately</div>
              </div>
              <div className="exp-card amber" onClick={()=>onNav("pm_schedules")} style={{cursor:"pointer"}}>
                <div className="ex-big">{MNT_PM_SCHEDULES.filter(p=>p.days>=0 && p.days<=7).length}</div>
                <div className="ex-lab">Due within 7 days</div>
                <div className="ex-sub">Amber tier · Schedule this week</div>
              </div>
            </div>

            <div className="label" style={{marginBottom:6}}>Nearest-due schedules</div>
            <table>
              <thead><tr><th>PM #</th><th>Asset</th><th>Type</th><th>Next due</th><th>Technician</th></tr></thead>
              <tbody>
                {MNT_PM_SCHEDULES.filter(p=>p.days<=7).slice(0,6).map(p=>(
                  <tr key={p.pm} style={{cursor:"pointer"}} onClick={()=>onNav("pm_schedules")}>
                    <td className="mono" style={{fontWeight:600}}>{p.pm}</td>
                    <td style={{fontSize:11}}>{p.asset}</td>
                    <td><MwoType t={p.type}/></td>
                    <td><DueCell date={p.nextDue} days={p.days}/></td>
                    <td style={{fontSize:11}}>{p.tech || <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Problem assets widget */}
          <div className="card" style={{marginTop:12}}>
            <div className="card-head">
              <h3 className="card-title">⚠ Top problem assets (30d)</h3>
              <button className="btn btn-ghost btn-sm" onClick={()=>onNav("analytics")}>Full analytics →</button>
            </div>
            {MNT_ANALYTICS.problemAssets.map(a => (
              <div key={a.asset} className="gauge-row">
                <span style={{width:170, fontSize:11, fontWeight:500}}>{a.asset}</span>
                <div className="gauge-bar"><span className="red" style={{width: (a.dtHours / 20 * 100) + "%"}}></span></div>
                <span className="mono" style={{fontSize:11, width:80}}>{a.dtHours}h · {a.mwos} mWOs</span>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT column — Alerts + Active LOTO */}
        <div>
          {/* Alerts */}
          <div className="card">
            <div className="card-head">
              <h3 className="card-title">⚠ Critical alerts</h3>
              <span className="badge badge-gray" style={{fontSize:10}}>{visibleAlerts.length} active</span>
            </div>
            <div>
              {visibleAlerts.length === 0 && (
                <div className="alert-green alert-box" style={{fontSize:12}}>✓ No critical alerts — all systems nominal.</div>
              )}
              {visibleAlerts.map(a => (
                <div key={a.code} className={"alert-box alert-" + a.severity} style={{marginBottom:6, fontSize:12, padding:"8px 12px"}}>
                  <span>⚠</span>
                  <div style={{flex:1}}>
                    <div>{a.text}</div>
                    <div style={{fontSize:10, color:"var(--muted)", marginTop:3, fontFamily:"var(--font-mono)"}}>{a.code}</div>
                  </div>
                  <div className="alert-cta">
                    {a.cta && <button className="btn btn-sm btn-primary" onClick={()=>openModal(a.cta === "Reorder" ? "sparReorder" : "dtLink")}>{a.cta}</button>}
                    <button className="btn btn-sm btn-secondary" onClick={()=>onNav(a.link)}>View →</button>
                    <button className="btn btn-sm btn-ghost" onClick={()=>dismiss(a.code)}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Active LOTO panel */}
          <div className="card" style={{marginTop:12}}>
            <div className="card-head">
              <h3 className="card-title">🔒 Active LOTO procedures</h3>
              <button className="btn btn-ghost btn-sm" onClick={()=>onNav("loto")}>Open LOTO →</button>
            </div>
            {MNT_ACTIVE_LOTO.length === 0 ? (
              <div className="alert-green alert-box" style={{fontSize:12}}>✓ Safe to proceed — no equipment is currently locked out.</div>
            ) : (
              MNT_ACTIVE_LOTO.map(l => (
                <div key={l.proc} className="res-lock-row" style={{marginBottom:6}}>
                  <span className="lock-ic">🔒</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12, fontWeight:600}}>{l.asset}</div>
                    <div className="muted mono" style={{fontSize:10}}>{l.proc} · Applied by {l.tech} · {l.age}</div>
                  </div>
                  <button className="btn btn-sm btn-secondary" onClick={()=>onNav("loto")}>View</button>
                </div>
              ))
            )}
          </div>

          {/* Cross-module bridge */}
          <div className="card" style={{marginTop:12}}>
            <div className="card-head">
              <h3 className="card-title">↔ Cross-module impact</h3>
            </div>
            <div style={{padding:"4px 0", fontSize:12}}>
              <div style={{marginBottom:8}}>
                <div className="muted" style={{fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:600, marginBottom:4}}>Production impact</div>
                <div>2 production WOs delayed by asset downtime: <CmChip module="prod" label="WO-2026-0108"/> <CmChip module="prod" label="WO-2026-0111"/></div>
              </div>
              <div style={{marginBottom:8}}>
                <div className="muted" style={{fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:600, marginBottom:4}}>Quality gate</div>
                <div><CmChip module="qa" label="CCP-003"/> blocked · <CmChip module="qa" label="CCP-007"/> blocked</div>
              </div>
              <div>
                <div className="muted" style={{fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:600, marginBottom:4}}>Warehouse spares</div>
                <div>Low stock: <CmChip module="wh" label="SP-LUB-0042 · LP00000340"/></div>
              </div>
            </div>
          </div>

          {/* Availability sparkline */}
          <div className="card" style={{marginTop:12}}>
            <div className="card-head">
              <h3 className="card-title">📈 MTBF trend (30d)</h3>
              <span className="badge badge-green" style={{fontSize:10}}>+8h vs prev</span>
            </div>
            <div style={{textAlign:"center", padding:"8px 0"}}>
              <div style={{fontSize:34, fontWeight:700, fontFamily:"var(--font-mono)", color:"var(--green-700)"}}>142h</div>
              <div className="muted" style={{fontSize:11}}>Target ≥ 120h · Sourced from 15-OEE</div>
            </div>
            <div style={{display:"flex", alignItems:"end", gap:2, height:40, padding:"0 6px"}}>
              {MNT_ANALYTICS.mtbfTrend.map((v,i) => (
                <div key={i} style={{flex:1, height:((v-120)/30*100)+"%", minHeight:3, background:"var(--green)", borderRadius:1}}></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

Object.assign(window, { MntDashboard });
