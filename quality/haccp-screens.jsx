// ============ QA-013 HACCP Plans + QA-014 CCP Monitoring + QA-015 CCP Deviations + QA-016 Allergen Gates ============

const QaHaccpPlans = ({ onNav, openModal }) => {
  const [selectedPlan, setSelectedPlan] = React.useState(QA_HACCP_PLANS[0].id);
  const plan = QA_HACCP_PLANS.find(p => p.id === selectedPlan) || QA_HACCP_PLANS[0];
  const ccps = QA_CCPS.filter(c => c.planId === plan.id);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={() => onNav("dashboard")}>Quality</a> · HACCP Plans</div>
          <h1 className="page-title">HACCP Plans</h1>
          <div className="muted" style={{fontSize: 12}}>{QA_HACCP_PLANS.length} plans · {QA_CCPS.length} CCPs across all plans · ISO 22000 / Codex HACCP</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm">⎙ Export all plans PDF</button>
          <button className="btn btn-primary btn-sm">＋ New HACCP Plan</button>
        </div>
      </div>

      <div className="haccp-layout">
        {/* Tree */}
        <div className="haccp-tree">
          <div style={{fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: 8}}>HACCP plans</div>
          {QA_HACCP_PLANS.map(p => (
            <React.Fragment key={p.id}>
              <div className={"haccp-node l0 " + (p.id === selectedPlan ? "on" : "")} onClick={() => setSelectedPlan(p.id)}>
                <span className={"dot " + (p.status === "active" ? "active" : "draft")}></span>
                <span>{p.code}</span>
                <span className="nav-count" style={{marginLeft: "auto"}}>v{p.version}</span>
              </div>
              {p.id === selectedPlan && QA_CCPS.filter(c => c.planId === p.id).map(c => (
                <div key={c.id} className={"haccp-node l1 " + (p.id === selectedPlan ? "on" : "")}>
                  <span className="mono" style={{fontSize: 10, color: "var(--muted)"}}>{c.code}</span>
                  <span>{c.step}</span>
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>

        {/* Plan detail */}
        <div>
          <div className="qa-detail-card">
            <h4>Plan header</h4>
            <div className="qa-detail-field"><span className="label">Plan code</span><span className="value mono">{plan.code}</span></div>
            <div className="qa-detail-field"><span className="label">Product family</span><span className="value">{plan.productFamily}</span></div>
            <div className="qa-detail-field"><span className="label">Version</span><span className="value mono">v{plan.version}</span></div>
            <div className="qa-detail-field"><span className="label">Status</span><span className="value"><StatusBadge s={plan.status}/></span></div>
            <div className="qa-detail-field"><span className="label">Effective from</span><span className="value mono">{plan.effFrom}</span></div>
            <div className="qa-detail-field"><span className="label">Last reviewed</span><span className="value mono">{plan.reviewedAt || "—"}</span></div>
            <div className="qa-detail-field"><span className="label">Approved by</span><span className="value">{plan.approvedBy ? <><span className="qa-badge badge-signed">🔒</span> {plan.approvedBy}</> : <span className="muted">Not yet approved</span>}</span></div>
            {plan.status === "active" && <div className="row-flex" style={{marginTop: 8}}>
              <button className="btn btn-secondary btn-sm">Edit Plan</button>
            </div>}
            {plan.status === "draft" && <div className="row-flex" style={{marginTop: 8}}>
              <button className="btn btn-primary btn-sm" onClick={() => openModal("eSign", { meaning: "approved" })}>🔒 Approve Plan</button>
              <button className="btn btn-secondary btn-sm">Edit Plan</button>
            </div>}
          </div>

          <h3 style={{fontSize: 14, margin: "14px 0 8px"}}>Critical Control Points <span style={{fontSize: 11, color: "var(--muted)", fontWeight: 400}}>({ccps.length} CCPs)</span></h3>

          {ccps.map(c => {
            const recent = c.readings.slice(0, 10);
            const deviations = c.readings.filter(r => !r.within).length;
            return (
              <div key={c.id} className="ccp-card">
                <div className="ccp-card-head">
                  <span className="dcode">{c.code}</span>
                  <span style={{fontWeight: 600, fontSize: 13}}>{c.step}</span>
                  <HazardBadge h={c.hazardType}/>
                  <span className="reg-tag">ISO 22000 / Codex HACCP</span>
                  <span className="spacer"></span>
                  <button className="btn btn-primary btn-sm" onClick={() => openModal("ccpReading", c)}>＋ Add reading</button>
                  <button className="btn btn-ghost btn-sm">Edit CCP</button>
                </div>
                <div className="ccp-card-body">
                  <div className="ccp-grid">
                    <div><div className="label">Hazard</div><div>{c.hazardDesc}</div></div>
                    <div><div className="label">Critical limits</div><div className="mono">{c.limitMin === null ? "—" : c.limitMin} – {c.limitMax === null ? "—" : c.limitMax} {c.unit}</div></div>
                    <div><div className="label">Monitoring frequency</div><div>{c.monFreq}</div></div>
                    <div><div className="label">Monitoring method</div><div>{c.monMethod}</div></div>
                    <div><div className="label">Corrective action</div><div>{c.corrective}</div></div>
                    <div><div className="label">Verification / Record</div><div>{c.verification} · <span className="mono">{c.recordMethod}</span></div></div>
                  </div>
                  <div className="spark-card">
                    <div style={{fontSize: 10, color: "var(--muted)", marginBottom: 4}}>Recent readings (last 10)</div>
                    <div className="ccp-spark">
                      {recent.map((r, i) => <span key={i} className={"dot " + (r.within ? "pass" : "fail")} title={`${r.t} — ${r.v} ${c.unit}`}></span>)}
                      {Array(10 - recent.length).fill(0).map((_, i) => <span key={"e" + i} className="dot empty"></span>)}
                      <span className="label">{recent.length} readings — {deviations} deviation{deviations !== 1 ? "s" : ""}</span>
                      <span className="spacer"></span>
                      <a style={{fontSize: 11, color: "var(--blue)", cursor: "pointer"}} onClick={() => onNav("ccp")}>View all readings →</a>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
};

// ============ QA-014 CCP Monitoring ============
const QaCcpMonitoring = ({ onNav, openModal }) => {
  const [plan, setPlan] = React.useState("all");
  const [ccpSel, setCcpSel] = React.useState("all");
  const [dateRange, setDateRange] = React.useState("today");

  const allReadings = QA_CCPS.flatMap(c => c.readings.map(r => ({ ...r, ccpCode: c.code, step: c.step, unit: c.unit, hazardType: c.hazardType, limit: `${c.limitMin ?? "—"}–${c.limitMax ?? "—"} ${c.unit}`, method: c.recordMethod, planId: c.planId, ccpId: c.id })));
  const visible = allReadings.filter(r =>
    (plan === "all" || r.planId === plan) &&
    (ccpSel === "all" || r.ccpId === ccpSel)
  ).sort((a, b) => b.t.localeCompare(a.t));

  const todayCount = allReadings.filter(r => r.t.startsWith("2026-04-21")).length;
  const todayPass = allReadings.filter(r => r.t.startsWith("2026-04-21") && r.within).length;
  const compliance = todayCount > 0 ? Math.round(todayPass / todayCount * 1000) / 10 : 100;
  const deviations24h = allReadings.filter(r => r.t >= "2026-04-20" && !r.within).length;

  const activeCcps = QA_CCPS.filter(c => c.readings.length > 0).length;

  // chart: last 24 readings of selected ccp
  const chartCcp = ccpSel !== "all" ? QA_CCPS.find(c => c.id === ccpSel) : QA_CCPS[0];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={() => onNav("dashboard")}>Quality</a> · CCP Monitoring</div>
          <h1 className="page-title">CCP Monitoring</h1>
          <div className="muted" style={{fontSize: 12}}>{allReadings.length} records total · {activeCcps} active CCPs · Timeline view below</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm">⇪ Export CSV</button>
          <button className="btn btn-primary btn-sm" onClick={() => openModal("ccpReading")}>＋ Record reading</button>
        </div>
      </div>

      <div className="kpi-row" style={{gridTemplateColumns: "repeat(3, 1fr)"}}>
        <div className="kpi"><div className="kpi-label">Active CCPs</div><div className="kpi-value">{activeCcps}</div><div className="kpi-sub">With monitoring data</div></div>
        <div className={"kpi " + (compliance >= 99 ? "green" : compliance >= 95 ? "amber" : "red")}><div className="kpi-label">Compliance today</div><div className="kpi-value">{compliance}%</div><div className="kpi-sub">{todayPass}/{todayCount} readings within limits</div></div>
        <div className={"kpi " + (deviations24h > 0 ? "red" : "green")}><div className="kpi-label">Deviations (last 24h)</div><div className="kpi-value">{deviations24h}</div><div className="kpi-sub">NCR auto-created for critical</div></div>
      </div>

      <div className="filter-bar">
        <select value={plan} onChange={e => { setPlan(e.target.value); setCcpSel("all"); }} style={{width: 240}}>
          <option value="all">All HACCP plans</option>
          {QA_HACCP_PLANS.map(p => <option key={p.id} value={p.id}>{p.code} — {p.productFamily.substring(0, 30)}</option>)}
        </select>
        <select value={ccpSel} onChange={e => setCcpSel(e.target.value)} style={{width: 240}}>
          <option value="all">All CCPs</option>
          {QA_CCPS.filter(c => plan === "all" || c.planId === plan).map(c => <option key={c.id} value={c.id}>{c.code} — {c.step}</option>)}
        </select>
        <input type="date" defaultValue="2026-04-21" style={{width: 140}}/>
        <input type="date" defaultValue="2026-04-21" style={{width: 140}}/>
        <select style={{width: 140}}>
          <option>All statuses</option>
          <option>Pass only</option>
          <option>Fail (deviations)</option>
        </select>
        <span className="spacer"></span>
        <button className="btn btn-secondary btn-sm">Apply</button>
        <button className="clear-all" onClick={() => { setPlan("all"); setCcpSel("all"); }}>Reset</button>
      </div>

      {/* Timeline chart */}
      <div className="ccp-chart">
        <div className="ccp-chart-label">
          <span>Reading timeline — {chartCcp?.code || "all CCPs"}</span>
          <span style={{marginLeft: "auto"}}><span className="dot" style={{display: "inline-block", width: 8, height: 8, background: "var(--green)", borderRadius: "50%", marginRight: 4}}></span> Within limits</span>
          <span><span className="dot" style={{display: "inline-block", width: 8, height: 8, background: "var(--red)", borderRadius: "50%", marginRight: 4}}></span> Deviation</span>
          <span><span className="dot" style={{display: "inline-block", width: 10, height: 4, background: "rgba(59,130,246,0.2)", marginRight: 4}}></span> Critical limit band</span>
        </div>
        <div className="ccp-chart-area">
          {chartCcp?.limitMin !== null && chartCcp?.limitMax !== null && (
            <div className="ccp-chart-band" style={{top: "30%", bottom: "25%"}}></div>
          )}
          {(chartCcp?.readings || []).slice(0, 20).map((r, i) => {
            const left = (i / Math.max(20, 1) * 95) + "%";
            const range = (chartCcp.limitMax ?? 75) - (chartCcp.limitMin ?? 70);
            const rel = typeof r.v === "number" ? (((chartCcp.limitMax ?? 75) - r.v) / range * 100) : 50;
            const top = Math.min(95, Math.max(5, rel)) + "%";
            return <div key={i} className={"ccp-chart-dot " + (r.within ? "pass" : "fail")} style={{left, top}} title={`${r.t} — ${r.v} ${chartCcp.unit}`}></div>;
          })}
        </div>
        <div style={{fontSize: 10, color: "var(--muted)", marginTop: 4, display: "flex", justifyContent: "space-between"}}>
          <span>← Earlier</span>
          <span>Now →</span>
        </div>
      </div>

      <div className="card" style={{padding: 0}}>
        <table>
          <thead>
            <tr>
              <th>WO</th><th>CCP</th><th>Hazard</th><th>Measurement</th><th>Limit</th>
              <th>Status</th><th>Recorded by</th><th>Recorded at</th><th>Method</th><th>Signed</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={i} className={!r.within ? "row-critical" : ""}>
                <td className="mono" style={{fontSize: 11, color: "var(--blue)"}}>{r.t.startsWith("2026-04-21") ? "WO-2026-0108" : "—"}</td>
                <td><span className="dcode">{r.ccpCode}</span><div style={{fontSize: 10, color: "var(--muted)"}}>{r.step}</div></td>
                <td><HazardBadge h={r.hazardType}/></td>
                <td className="mono" style={{fontSize: 11, fontWeight: 600, color: r.within ? "var(--text)" : "var(--red-700)"}}>{r.v} {r.unit}</td>
                <td className="mono" style={{fontSize: 11}}>{r.limit}</td>
                <td><ResultBadge r={r.within ? "pass" : "fail"}/></td>
                <td style={{fontSize: 11}}>{r.user}</td>
                <td className="mono" style={{fontSize: 11}}>{r.t}</td>
                <td><span className="qa-badge badge-draft">{r.method}</span></td>
                <td>{r.within ? <span className="qa-badge badge-signed">🔒</span> : <span className="muted" style={{fontSize: 10}}>Pending</span>}</td>
                <td>{!r.within && r.ncrRef ? <a className="dcode">{r.ncrRef}</a> : <button className="btn btn-ghost btn-sm">View</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

// ============ QA-015 CCP Deviations ============
const QaCcpDeviations = ({ onNav, openModal }) => {
  const [status, setStatus] = React.useState("all");
  const [severity, setSeverity] = React.useState("all");
  const visible = QA_DEVIATIONS;
  const openCount = visible.filter(d => !d.signed).length;
  const actionPending = visible.filter(d => !d.correctiveAction).length;
  const resolvedToday = visible.filter(d => d.signed && d.t.startsWith("2026-04-21")).length;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={() => onNav("dashboard")}>Quality</a> · <a onClick={() => onNav("ccp")}>CCP Monitoring</a> · Deviations</div>
          <h1 className="page-title">CCP Deviations</h1>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm" onClick={() => openModal("ccpDeviationLog")}>＋ Log deviation manually</button>
          <button className="btn btn-secondary btn-sm">⇪ Export</button>
        </div>
      </div>

      <div className="kpi-row" style={{gridTemplateColumns: "repeat(3, 1fr)"}}>
        <div className="kpi red"><div className="kpi-label">Open deviations</div><div className="kpi-value">{openCount}</div><div className="kpi-sub">Pending sign-off</div></div>
        <div className="kpi amber"><div className="kpi-label">Corrective action pending</div><div className="kpi-value">{actionPending}</div><div className="kpi-sub">V-QA-CCP-004 block</div></div>
        <div className="kpi green"><div className="kpi-label">Resolved today</div><div className="kpi-value">{resolvedToday}</div><div className="kpi-sub">Signed-off</div></div>
      </div>

      <div className="filter-bar">
        <select style={{width: 160}}><option>All hazard types</option><option>biological</option><option>chemical</option><option>physical</option><option>allergen</option></select>
        <select style={{width: 180}}><option>All CCPs</option>{QA_CCPS.map(c => <option key={c.id}>{c.code} — {c.step}</option>)}</select>
        <select value={severity} onChange={e => setSeverity(e.target.value)} style={{width: 140}}>
          <option value="all">All severity</option>
          <option value="critical">Critical</option><option value="major">Major</option><option value="minor">Minor</option>
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)} style={{width: 160}}>
          <option value="all">All statuses</option>
          <option>Open</option><option>Corrective action taken</option><option>Resolved</option><option>Signed off</option>
        </select>
        <input type="date" style={{width: 140}}/>
      </div>

      <div className="card" style={{padding: 0}}>
        <table>
          <thead><tr><th>Deviation ref</th><th>CCP</th><th>Hazard</th><th>Reading</th><th>Severity</th><th>Linked NCR</th><th>Corrective action</th><th>Recorded by</th><th>Recorded at</th><th>Signed</th><th>Actions</th></tr></thead>
          <tbody>
            {visible.map((d, i) => (
              <tr key={i} className={!d.correctiveAction ? "row-major" : ""}>
                <td className="mono" style={{fontSize: 11, color: "var(--blue)"}}>DEV-2026-{150 - i}</td>
                <td><span className="dcode">{d.ccp}</span><div style={{fontSize: 10, color: "var(--muted)"}}>{d.step}</div></td>
                <td><HazardBadge h={d.hazardType}/></td>
                <td className="mono" style={{fontSize: 11}}>{d.v} <span style={{color: "var(--muted)"}}>(limit: {d.limit})</span></td>
                <td><SeverityBadge s={d.severity}/></td>
                <td>{d.ncr ? <a className="dcode">{d.ncr}</a> : <span className="qa-badge badge-draft">Auto-created</span>}</td>
                <td style={{fontSize: 11, maxWidth: 260}}>
                  {d.correctiveAction ? d.correctiveAction.substring(0, 80) : <span className="qa-badge badge-hold">Action required</span>}
                </td>
                <td style={{fontSize: 11}}>{d.recordedBy}</td>
                <td className="mono" style={{fontSize: 11}}>{d.t}</td>
                <td><SignedIcon signed={d.signed}/></td>
                <td>
                  {!d.signed && <button className="btn btn-primary btn-sm" onClick={() => openModal("eSign", { meaning: "witnessed" })}>Sign off</button>}
                  {!d.correctiveAction && <button className="btn btn-secondary btn-sm" style={{marginLeft: 4}}>Add action</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

// ============ QA-016 Allergen Gates ============
const QaAllergenGates = ({ role, onNav, openModal }) => {
  const [drawer, setDrawer] = React.useState(null);
  const gates = QA_ALLERGEN_GATES;
  const pending2nd = gates.filter(g => g.status === "pending_second_sign").length;
  const approvedToday = gates.filter(g => g.status === "approved" && g.secondSigner?.at.startsWith("2026-04-20")).length;
  const rejected = gates.filter(g => g.status === "rejected").length;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={() => onNav("dashboard")}>Quality</a> · Allergen Gates</div>
          <h1 className="page-title">Allergen Changeover Gates</h1>
        </div>
      </div>

      <div className="alert-box alert-blue" style={{fontSize: 12, marginBottom: 12}}>
        <span>ⓘ</span>
        <div>This screen displays allergen changeover validation records created by 08-Production. Quality is the second signer. Source table: <span className="mono">allergen_changeover_validations</span> (owned by 08-PROD).</div>
      </div>

      <div className="kpi-row" style={{gridTemplateColumns: "repeat(3, 1fr)"}}>
        <div className="kpi amber"><div className="kpi-label">Pending 2nd sign</div><div className="kpi-value">{pending2nd}</div><div className="kpi-sub">Awaiting Quality Lead</div></div>
        <div className="kpi green"><div className="kpi-label">Approved today</div><div className="kpi-value">{approvedToday}</div><div className="kpi-sub">Dual-signed</div></div>
        <div className="kpi red"><div className="kpi-label">Rejected / overridden</div><div className="kpi-value">{rejected}</div><div className="kpi-sub">ATP fail or override</div></div>
      </div>

      <div className="filter-bar">
        <input type="date" style={{width: 140}} defaultValue="2026-04-20"/>
        <input type="date" style={{width: 140}} defaultValue="2026-04-21"/>
        <select style={{width: 140}}><option>All lines</option><option>Line-1</option><option>Line-3</option><option>Line-4</option></select>
        <select style={{width: 140}}><option>All allergens</option><option>Nuts</option><option>Milk</option><option>Gluten</option></select>
        <select style={{width: 180}}><option>All statuses</option><option>Pending first sign</option><option>Awaiting 2nd sign</option><option>Approved</option><option>Rejected</option></select>
      </div>

      <div className="card" style={{padding: 0}}>
        <table>
          <thead><tr><th>Gate ID</th><th>WO from → to</th><th>Allergen delta</th><th>Risk level</th><th>Cleaning</th><th>ATP (RLU)</th><th>First signer</th><th>Second signer</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {gates.map(g => (
              <tr key={g.id} style={{cursor: "pointer"}} onClick={() => setDrawer(g)}>
                <td className="mono" style={{fontSize: 11, color: "var(--blue)"}}>{g.id}</td>
                <td className="mono" style={{fontSize: 11}}>{g.woFrom} → {g.woTo}</td>
                <td style={{fontSize: 11}}>
                  {g.allergensRemoved.map((a, i) => <span key={"r" + i} className="qa-badge" style={{background: "#dcfce7", color: "#166534", marginRight: 2}}>-{a}</span>)}
                  {g.allergensAdded.map((a, i) => <span key={"a" + i} className="qa-badge" style={{background: "#fee2e2", color: "#991b1b", marginRight: 2}}>+{a}</span>)}
                </td>
                <td><span className={"qa-badge badge-" + (g.riskLevel === "high" ? "critical" : g.riskLevel === "medium" ? "major" : "minor")}>{g.riskLevel}</span></td>
                <td>{g.cleaningComplete ? <span style={{color: "var(--green-700)"}}>✓</span> : <span style={{color: "var(--red-700)"}}>✕</span>}</td>
                <td className="mono" style={{fontSize: 11, color: g.atpRlu > g.atpThreshold ? "var(--red-700)" : "var(--green-700)", fontWeight: 600}}>{g.atpRlu} RLU <span style={{fontSize: 9, color: "var(--muted)", fontWeight: 400}}>≤ {g.atpThreshold}</span></td>
                <td style={{fontSize: 11}}>{g.firstSigner ? <><div>{g.firstSigner.user}</div><div className="mono" style={{fontSize: 10, color: "var(--muted)"}}>{g.firstSigner.at}</div></> : <span className="muted">Awaiting</span>}</td>
                <td style={{fontSize: 11}}>{g.secondSigner ? <><div>{g.secondSigner.user} <span className="qa-badge badge-signed" style={{fontSize: 9}}>🔒</span></div><div className="mono" style={{fontSize: 10, color: "var(--muted)"}}>{g.secondSigner.at}</div></> : <span style={{color: "var(--amber-700)"}}>Awaiting</span>}</td>
                <td><StatusBadge s={g.status}/></td>
                <td onClick={e => e.stopPropagation()}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setDrawer(g)}>View</button>
                  {g.status === "pending_second_sign" && role === "Quality Lead" && (
                    <button className="btn btn-primary btn-sm" style={{marginLeft: 4}} onClick={() => openModal("allergenDualSign", g)}>Sign (2nd)</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Drawer */}
      {drawer && (
        <div className="drawer-side">
          <div className="drawer-head">
            <div>
              <div style={{fontSize: 13, fontWeight: 600}}>{drawer.id}</div>
              <div style={{fontSize: 11, color: "var(--muted)"}}>Allergen changeover evidence</div>
            </div>
            <button className="modal-close" onClick={() => setDrawer(null)}>✕</button>
          </div>
          <div className="drawer-body">
            <div className="qa-detail-field"><span className="label">WO pair</span><span className="value mono">{drawer.woFrom} → {drawer.woTo}</span></div>
            <div className="qa-detail-field"><span className="label">Risk</span><span className="value"><span className={"qa-badge badge-" + (drawer.riskLevel === "high" ? "critical" : drawer.riskLevel === "medium" ? "major" : "minor")}>{drawer.riskLevel}</span></span></div>
            <div className="qa-detail-field"><span className="label">ATP result</span><span className="value mono" style={{color: drawer.atpRlu > drawer.atpThreshold ? "var(--red-700)" : "var(--green-700)", fontWeight: 600}}>{drawer.atpRlu} RLU (threshold ≤ {drawer.atpThreshold})</span></div>
            <div className="reg-tag" style={{margin: "8px 0"}}>Regulation: EU FIC 1169/2011 + Reg 2021/382</div>

            <h4 style={{margin: "14px 0 8px"}}>Cleaning checklist</h4>
            <ul className="q-checklist">
              <li><span className="q-tick ok">✓</span> Equipment wash-down (CIP cycle)</li>
              <li><span className="q-tick ok">✓</span> Air blow-off</li>
              <li><span className="q-tick ok">✓</span> Allergen-contact surface swab</li>
              <li><span className={"q-tick " + (drawer.atpRlu <= drawer.atpThreshold ? "ok" : "fail")}>{drawer.atpRlu <= drawer.atpThreshold ? "✓" : "✕"}</span> ATP verification post-clean ({drawer.atpRlu} RLU)</li>
              <li><span className="q-tick ok">✓</span> Visual inspection by Shift Lead</li>
            </ul>

            <h4 style={{margin: "14px 0 8px"}}>Signatures</h4>
            {drawer.firstSigner && (
              <div className="esign-block">
                <div className="esign-head">First signer (Shift Lead)</div>
                <div className="esign-meta"><b>{drawer.firstSigner.user}</b> · <span className="mono">{drawer.firstSigner.at}</span> · Meaning: approved · <span className="qa-badge badge-signed">🔒</span></div>
              </div>
            )}
            {drawer.secondSigner ? (
              <div className="esign-block" style={{marginTop: 8}}>
                <div className="esign-head">Second signer (Quality Lead)</div>
                <div className="esign-meta"><b>{drawer.secondSigner.user}</b> · <span className="mono">{drawer.secondSigner.at}</span> · Meaning: approved · <span className="qa-badge badge-signed">🔒</span></div>
              </div>
            ) : (
              <div className="alert-box alert-amber" style={{fontSize: 12, marginTop: 8}}>
                <span>⚠</span>
                <div>Awaiting Quality Lead second signature. {drawer.status === "rejected" && "Gate rejected: " + drawer.rejectReason}</div>
              </div>
            )}

            {drawer.status === "pending_second_sign" && role === "Quality Lead" && (
              <button className="btn btn-primary btn-sm" style={{width: "100%", marginTop: 10}} onClick={() => openModal("allergenDualSign", drawer)}>🔒 Sign as Quality Lead (2nd sign)</button>
            )}
            {drawer.status === "approved" && (
              <button className="btn btn-secondary btn-sm" style={{width: "100%", marginTop: 10}}>⎙ Download evidence PDF</button>
            )}
          </div>
        </div>
      )}
    </>
  );
};

Object.assign(window, { QaHaccpPlans, QaCcpMonitoring, QaCcpDeviations, QaAllergenGates });
