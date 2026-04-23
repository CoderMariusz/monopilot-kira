// ============ Remaining screens: Calibration, Technicians, LOTO, Analytics, Settings ============

// -------- MAINT-011 Calibration List --------
const MntCalList = ({ onNav, openModal, role }) => {
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [stdFilter, setStdFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [ccpOnly, setCcpOnly] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const isManager = role === "Manager" || role === "Admin";

  const visible = MNT_INSTRUMENTS.filter(i => {
    if (typeFilter !== "all" && i.type !== typeFilter) return false;
    if (stdFilter !== "all" && i.std !== stdFilter) return false;
    if (statusFilter === "current" && i.days < 0) return false;
    if (statusFilter === "due" && (i.days > 30 || i.days < 0)) return false;
    if (statusFilter === "overdue" && i.days >= 0) return false;
    if (ccpOnly && !i.ccp) return false;
    if (search && !(i.code.toLowerCase().includes(search.toLowerCase()) ||
                    i.name.toLowerCase().includes(search.toLowerCase()))) return false;
    return true;
  });

  const currentCount = MNT_INSTRUMENTS.filter(i => i.days >= 30).length;
  const dueCount = MNT_INSTRUMENTS.filter(i => i.days < 30 && i.days >= 0).length;
  const overdueCount = MNT_INSTRUMENTS.filter(i => i.days < 0).length;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Maintenance</a> · Calibration</div>
          <h1 className="page-title">Calibration</h1>
          <div className="muted" style={{fontSize:12}}>
            {MNT_INSTRUMENTS.length} instruments · {MNT_INSTRUMENTS.filter(i=>i.ccpBlock).length} CCP blocks active · BRCGS audit-ready
          </div>
        </div>
        <div className="row-flex">
          <input type="text" placeholder="Search instrument…" value={search} onChange={e=>setSearch(e.target.value)} style={{width:240}}/>
          <button className="btn btn-secondary btn-sm">⇪ Export for audit</button>
          {isManager && <button className="btn btn-primary btn-sm" onClick={()=>openModal("assetEdit", { mode: "create-instrument" })}>＋ Add Instrument</button>}
        </div>
      </div>

      {/* Summary strip */}
      <div className="kpi-grid-6">
        <div className="kpi green"><div className="kpi-label">Instruments current</div><div className="kpi-value">{currentCount}</div><div className="kpi-sub">In compliance</div></div>
        <div className="kpi amber"><div className="kpi-label">Due within 30 days</div><div className="kpi-value">{dueCount}</div><div className="kpi-sub">Schedule soon</div></div>
        <div className="kpi red"><div className="kpi-label">Overdue</div><div className="kpi-value">{overdueCount}</div><div className="kpi-sub">Immediate action</div></div>
        <div className="kpi red"><div className="kpi-label">CCP blocks</div><div className="kpi-value">{MNT_INSTRUMENTS.filter(i=>i.ccpBlock).length}</div><div className="kpi-sub">Quality impact</div></div>
        <div className="kpi"><div className="kpi-label">Last FAIL</div><div className="kpi-value mono" style={{fontSize:14}}>SC-0006</div><div className="kpi-sub">2026-04-05</div></div>
        <div className="kpi"><div className="kpi-label">Next scheduled</div><div className="kpi-value mono" style={{fontSize:14}}>SC-0004</div><div className="kpi-sub">Tomorrow 08:00</div></div>
      </div>

      {/* CCP block cross-module banner */}
      {MNT_INSTRUMENTS.filter(i=>i.ccpBlock).length > 0 && (
        <div className="alert-red alert-box" style={{fontSize:12, marginBottom:10}}>
          <span>🚫</span>
          <div style={{flex:1}}>
            <b>CCP blocks active in 09-QUALITY:</b> Re-calibrate to unblock production use.
            {MNT_INSTRUMENTS.filter(i=>i.ccpBlock).map(i => (
              <span key={i.code} style={{marginLeft:8}}><CmChip module="qa" label={i.ccp}/></span>
            ))}
          </div>
        </div>
      )}

      <div className="filter-bar">
        <label>Type</label>
        <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}>
          <option value="all">All</option>
          <option value="Scale">Scale</option>
          <option value="Thermometer">Thermometer</option>
          <option value="pH Meter">pH Meter</option>
          <option value="Other">Other</option>
        </select>
        <label>Standard</label>
        <select value={stdFilter} onChange={e=>setStdFilter(e.target.value)}>
          <option value="all">All</option>
          <option value="ISO 9001">ISO 9001</option>
          <option value="NIST">NIST</option>
          <option value="Internal">Internal</option>
        </select>
        <label>Status</label>
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="all">All</option>
          <option value="current">Current</option>
          <option value="due">Due</option>
          <option value="overdue">Overdue</option>
        </select>
        <label style={{display:"flex", alignItems:"center", gap:4}}>
          <input type="checkbox" checked={ccpOnly} onChange={e=>setCcpOnly(e.target.checked)}/> CCP-linked only
        </label>
      </div>

      <div className="card" style={{padding:0}}>
        <table>
          <thead>
            <tr>
              <th>Instrument</th><th>Name</th><th>Type</th><th>Standard</th><th>Accuracy spec</th>
              <th>Last cal.</th><th>Next due</th><th>Last result</th><th>Linked CCP</th><th>CCP block</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(i => (
              <tr key={i.code} className={(i.days < 0 ? "row-overdue " : i.days < 30 ? "row-due " : "") + (i.ccpBlock ? "ccp-block-row" : "")} style={{cursor:"pointer"}} onClick={()=>onNav("calibration")}>
                <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{i.code}</td>
                <td style={{fontSize:11}}>{i.name}</td>
                <td style={{fontSize:11}}>{i.type}</td>
                <td className="mono" style={{fontSize:11}}>{i.std}</td>
                <td className="mono" style={{fontSize:11}}>{i.acc}</td>
                <td className="mono" style={{fontSize:11}}>{i.lastCal}</td>
                <td><DueCell date={i.nextDue} days={i.days}/></td>
                <td><CalResult r={i.result}/></td>
                <td>{i.ccp ? <CmChip module="qa" label={i.ccp}/> : <span className="muted">—</span>}</td>
                <td>{i.ccpBlock ? <span className="ccp-block-ic">🚫</span> : <span className="muted">—</span>}</td>
                <td onClick={e=>e.stopPropagation()}><button className="btn btn-primary btn-sm" onClick={()=>openModal("calReading", { code: i.code })}>Record</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

// -------- MAINT-012 Calibration Record Detail --------
const MntCalDetail = ({ onBack, onNav, openModal, role }) => {
  const c = MNT_CAL_DETAIL;
  const [tab, setTab] = React.useState("history");
  const isManager = role === "Manager" || role === "Admin";

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={onBack}>Calibration</a> · <span className="mono">{c.code}</span></div>
          <h1 className="page-title">{c.name}</h1>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm" onClick={onBack}>← Back</button>
          <button className="btn btn-primary btn-sm" onClick={()=>openModal("calReading", { code: c.code })}>Record Calibration</button>
          {isManager && <button className="btn btn-secondary btn-sm">Edit instrument</button>}
        </div>
      </div>

      {/* Header card */}
      <div className="card" style={{marginBottom:10}}>
        <div style={{display:"grid", gridTemplateColumns:"repeat(6, 1fr)", gap:10, fontSize:11}}>
          <div><div className="muted" style={{fontSize:10, textTransform:"uppercase", fontWeight:600}}>Instrument</div><div className="mono" style={{fontWeight:700}}>{c.code}</div></div>
          <div><div className="muted" style={{fontSize:10, textTransform:"uppercase", fontWeight:600}}>Type</div><div>{c.type}</div></div>
          <div><div className="muted" style={{fontSize:10, textTransform:"uppercase", fontWeight:600}}>Standard</div><div>{c.std}</div></div>
          <div><div className="muted" style={{fontSize:10, textTransform:"uppercase", fontWeight:600}}>Accuracy</div><div className="mono">{c.acc}</div></div>
          <div><div className="muted" style={{fontSize:10, textTransform:"uppercase", fontWeight:600}}>Linked asset</div><div><a style={{color:"var(--blue)"}} onClick={()=>onNav("asset_detail")}>{c.asset.name}</a></div></div>
          <div><div className="muted" style={{fontSize:10, textTransform:"uppercase", fontWeight:600}}>CCP</div><div>{c.ccp ? <CmChip module="qa" label={c.ccp}/> : <span className="muted">—</span>}</div></div>
        </div>
      </div>

      {/* CCP block banner */}
      {c.ccpBlock && (
        <div className="alert-red alert-box" style={{fontSize:12, marginBottom:10}}>
          <span>🚫</span>
          <div style={{flex:1}}>
            <b>CCP BLOCKED</b> — Calibration is 6 days overdue. <CmChip module="qa" label={c.ccp}/> is blocked in 09-QUALITY. Production use is halted until re-calibrated.
          </div>
          <button className="btn btn-sm btn-danger" onClick={()=>openModal("calReading", { code: c.code })}>Record now →</button>
        </div>
      )}

      {/* Latest result banner */}
      <div className={"card"} style={{marginBottom:10, background: c.latestResult === "PASS" ? "var(--green-050a)" : c.latestResult === "FAIL" ? "var(--red-050a)" : "var(--amber-050a)"}}>
        <div style={{display:"grid", gridTemplateColumns:"auto 1fr auto auto", gap:14, alignItems:"center", padding:"4px 0"}}>
          <CalResult r={c.latestResult}/>
          <div>
            <div className="muted" style={{fontSize:10, textTransform:"uppercase", fontWeight:600}}>Latest calibration result</div>
            <div style={{fontSize:13, fontWeight:600}}>Calibrated 2026-01-15 14:22 by A. Majewska</div>
          </div>
          <div>
            <div className="muted" style={{fontSize:10, textTransform:"uppercase", fontWeight:600}}>Next due</div>
            <DueCell date={c.nextDue} days={c.days}/>
          </div>
          <div>
            <div className="muted" style={{fontSize:10, textTransform:"uppercase", fontWeight:600}}>Days overdue</div>
            <div className="mono" style={{fontSize:16, fontWeight:700, color:"var(--red)"}}>{Math.abs(c.days)}d</div>
          </div>
        </div>
      </div>

      {/* Test Points table */}
      <div className="card" style={{marginBottom:10}}>
        <div className="card-head"><h3 className="card-title">Test points — latest calibration</h3></div>
        <table>
          <thead><tr><th>Reference value</th><th>Measured value</th><th>Tolerance</th><th>In spec</th></tr></thead>
          <tbody>
            {c.latestPoints.map((p,i)=>(
              <tr key={i} className={p.inSpec ? "" : "stock-low-row"}>
                <td className="mono">{p.ref}</td>
                <td className="mono">{p.meas}</td>
                <td className="mono">±{p.tol}%</td>
                <td><span className={"tp-check " + (p.inSpec ? "ok" : "fail")}>{p.inSpec ? "✓" : "✗"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tabs */}
      <div className="lp-tabs">
        <button className={tab==="history"?"on":""} onClick={()=>setTab("history")}>History <span className="tab-count">{c.records.length}</span></button>
        <button className={tab==="cert"?"on":""} onClick={()=>setTab("cert")}>Certificate</button>
      </div>

      {tab === "history" && (
        <div className="card">
          <div className="card-head"><h3 className="card-title">Calibration history</h3></div>
          <table>
            <thead><tr><th>Record #</th><th>Date</th><th>By</th><th>Standard</th><th>Result</th><th>Points (pass/total)</th><th>Next due</th><th>Retention until</th><th>mWO</th></tr></thead>
            <tbody>
              {c.records.map(r => (
                <tr key={r.id}>
                  <td className="mono" style={{fontWeight:600}}>{r.id}</td>
                  <td className="mono" style={{fontSize:11}}>{r.date}</td>
                  <td style={{fontSize:11}}>{r.by}</td>
                  <td className="mono" style={{fontSize:11}}>{r.std}</td>
                  <td><CalResult r={r.result}/></td>
                  <td className="mono" style={{fontSize:11}}>{r.passCount}/{r.points}</td>
                  <td className="mono" style={{fontSize:11}}>{r.nextDue}</td>
                  <td className="mono" style={{fontSize:10, color:"var(--muted)"}}>{r.retentionUntil} <span style={{color:"var(--muted)"}}>(BRCGS 7y)</span></td>
                  <td className="mono" style={{color:"var(--blue)", cursor:"pointer"}} onClick={()=>onNav("mwo_detail")}>{r.mwo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "cert" && (
        <div className="card">
          <div className="card-head"><h3 className="card-title">Certificate</h3>
            <button className="btn btn-primary btn-sm" onClick={()=>openModal("certUpload", { code: c.code })}>Upload new certificate</button>
          </div>
          {c.records.filter(r=>r.cert).map(r => (
            <div key={r.id} className="cert-card" style={{marginBottom:6}}>
              <div className="cert-ic">📄</div>
              <div className="cert-meta">
                <div className="cm-name">{r.cert}</div>
                <div className="muted" style={{fontSize:10, marginTop:2}}>Calibrated: {r.date} · by {r.by}</div>
                <div className="cm-hash">SHA-256: {r.sha256}</div>
                <div className="muted" style={{fontSize:10, marginTop:2}}>Retained until: {r.retentionUntil} (BRCGS 7-year requirement)</div>
              </div>
              <button className="btn btn-secondary btn-sm">Open PDF</button>
            </div>
          ))}
          <div className="alert-blue alert-box" style={{fontSize:11, marginTop:10}}>
            <span>ⓘ</span>
            <div>Certificates are stored with SHA-256 hash for 21 CFR Part 11 compliance. Retention: 7 years from calibration date (BRCGS Issue 10).</div>
          </div>
        </div>
      )}
    </>
  );
};

// -------- MAINT-015 Technicians List --------
const MntTechList = ({ onOpenTech, onNav, openModal, role }) => {
  const [view, setView] = React.useState("list");
  const [skillFilter, setSkillFilter] = React.useState("all");
  const [shiftOnly, setShiftOnly] = React.useState(false);

  const isManager = role === "Manager" || role === "Admin";

  const visible = MNT_TECHNICIANS.filter(t => {
    if (skillFilter !== "all" && t.skill !== skillFilter) return false;
    if (shiftOnly && !t.onShift) return false;
    return true;
  });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Maintenance</a> · Technicians</div>
          <h1 className="page-title">Technicians</h1>
          <div className="muted" style={{fontSize:12}}>
            {MNT_TECHNICIANS.length} team members · {MNT_TECHNICIANS.filter(t=>t.onShift).length} on shift · {MNT_TECHNICIANS.filter(t=>t.skill==="specialist").length} specialists
          </div>
        </div>
        <div className="row-flex">
          <div className="pm-cal-toggle">
            <button className={view==="list"?"on":""} onClick={()=>setView("list")}>List</button>
            <button className={view==="matrix"?"on":""} onClick={()=>setView("matrix")}>Skills matrix</button>
          </div>
          {isManager && <button className="btn btn-primary btn-sm" onClick={()=>openModal("assetEdit", { mode: "create-tech" })}>＋ Add Technician</button>}
        </div>
      </div>

      <div className="filter-bar">
        <label>Skill level</label>
        <select value={skillFilter} onChange={e=>setSkillFilter(e.target.value)}>
          <option value="all">All</option>
          <option value="basic">Basic</option>
          <option value="advanced">Advanced</option>
          <option value="specialist">Specialist</option>
        </select>
        <label style={{display:"flex", alignItems:"center", gap:4}}>
          <input type="checkbox" checked={shiftOnly} onChange={e=>setShiftOnly(e.target.checked)}/> On shift only
        </label>
      </div>

      {view === "list" && (
        <div className="card" style={{padding:0}}>
          <table>
            <thead>
              <tr>
                <th>Technician</th><th>Skill level</th><th>Certifications</th><th>Cert expiry</th>
                <th>On shift</th><th>Assigned mWOs</th><th>Hourly rate</th><th style={{width:120}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(t => (
                <tr key={t.id} style={{cursor:"pointer"}} onClick={()=>onOpenTech(t.id)}>
                  <td style={{fontSize:12}}>
                    <span style={{display:"inline-block", width:28, height:28, borderRadius:"50%", background:"var(--blue)", color:"#fff", textAlign:"center", lineHeight:"28px", fontWeight:700, fontSize:11, marginRight:8}}>{t.initials}</span>
                    {t.name}
                  </td>
                  <td><span className={"pri " + (t.skill === "specialist" ? "high" : t.skill === "advanced" ? "medium" : "low")}>{t.skill}</span></td>
                  <td style={{fontSize:11}}>{t.certs.slice(0,2).join(", ")}{t.certs.length>2 && <span className="muted"> (+{t.certs.length-2} more)</span>}</td>
                  <td className="mono" style={{fontSize:11}}><DueCell date={t.certExp}/></td>
                  <td>{t.onShift ? <span className="badge badge-green" style={{fontSize:9}}>On shift</span> : <span className="badge badge-gray" style={{fontSize:9}}>Off shift</span>}</td>
                  <td className="num mono"><a style={{color:"var(--blue)", cursor:"pointer"}} onClick={e=>{e.stopPropagation(); onNav("mwos");}}>{t.assignedMwos}</a></td>
                  <td className="mono" style={{fontSize:11}}>{isManager ? "€" + t.rate.toFixed(2) + "/h" : <span className="muted">—</span>}</td>
                  <td onClick={e=>e.stopPropagation()}>
                    {isManager && <button className="btn btn-ghost btn-sm" onClick={()=>openModal("techSkill", { id: t.id })}>Edit skills</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === "matrix" && (
        <div className="skills-matrix">
          <table>
            <thead>
              <tr>
                <th style={{textAlign:"left", minHeight:0, writingMode:"horizontal-tb", transform:"none"}}>Technician</th>
                {MNT_SKILLS.map(s => <th key={s}>{s}</th>)}
              </tr>
            </thead>
            <tbody>
              {MNT_TECHNICIANS.map(t => (
                <tr key={t.id}>
                  <td style={{fontSize:11, padding:"6px 8px"}}><b>{t.initials}</b> {t.name}</td>
                  {MNT_SKILLS.map(s => {
                    const v = MNT_SKILL_MATRIX[t.id][s];
                    return <td key={s} className={"sk-cell " + v}>
                      {v === "specialist" ? "⚡" : v === "has" ? "✓" : "—"}
                    </td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{padding:10, fontSize:11}} className="muted">
            Legend: ✓ has skill · ⚡ specialist · — not applicable. {/* BL-MAINT-05 — PDF export is P2, stub now shows a scoped notice instead of a dead link. */}
            <a style={{color:"var(--blue)", cursor:"pointer"}}
               onClick={() => alert("Skills matrix PDF export ships in Phase 2 (BL-MAINT-05). For current audits export via the top-right Export CSV on the Technicians list.")}
               title="PDF export — Phase 2 (BL-MAINT-05)">
              Download PDF for audit →
            </a>
          </div>
        </div>
      )}
    </>
  );
};

// -------- MAINT-016 Technician Detail --------
const MntTechDetail = ({ onBack, onNav, openModal, role }) => {
  const [tab, setTab] = React.useState("profile");
  const t = MNT_TECHNICIANS[0]; // M. Nowak
  const isManager = role === "Manager" || role === "Admin";

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={onBack}>Technicians</a> · {t.name}</div>
          <h1 className="page-title">{t.name}</h1>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm" onClick={onBack}>← Back</button>
          {isManager && <button className="btn btn-secondary btn-sm" onClick={()=>openModal("techSkill", { id: t.id })}>Edit skills</button>}
        </div>
      </div>

      {/* Header */}
      <div className="card" style={{marginBottom:10}}>
        <div style={{display:"flex", gap:14, alignItems:"center"}}>
          <div style={{width:64, height:64, borderRadius:"50%", background:"var(--blue)", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:22}}>{t.initials}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:18, fontWeight:700}}>{t.name}</div>
            <div className="muted mono" style={{fontSize:11}}>{t.email} · {t.id}</div>
            <div style={{marginTop:6, display:"flex", gap:6}}>
              <span className={"pri " + (t.skill === "specialist" ? "high" : t.skill === "advanced" ? "medium" : "low")}>{t.skill}</span>
              {t.onShift ? <span className="badge badge-green" style={{fontSize:9}}>On shift</span> : <span className="badge badge-gray" style={{fontSize:9}}>Off shift</span>}
              <span className="badge badge-blue" style={{fontSize:9}}>{t.assignedMwos} assigned mWOs</span>
            </div>
          </div>
        </div>
      </div>

      <div className="lp-tabs">
        <button className={tab==="profile"?"on":""} onClick={()=>setTab("profile")}>Profile</button>
        <button className={tab==="history"?"on":""} onClick={()=>setTab("history")}>Assignment history</button>
      </div>

      {tab === "profile" && (
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
          <div className="card">
            <div className="card-head"><h3 className="card-title">Certifications</h3>
              {isManager && <button className="btn btn-ghost btn-sm">Edit</button>}
            </div>
            <table>
              <thead><tr><th>Name</th><th>Issuer</th><th>Issue</th><th>Expiry</th></tr></thead>
              <tbody>
                {t.certs.map((c,i)=>(
                  <tr key={i}>
                    <td style={{fontSize:11}}>{c}</td>
                    <td className="muted" style={{fontSize:11}}>Internal</td>
                    <td className="mono" style={{fontSize:11}}>2024-01-15</td>
                    <td><DueCell date={t.certExp}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="muted" style={{fontSize:10, marginTop:10, padding:"6px 8px", background:"var(--gray-050)", borderRadius:4}}>
              GDPR: This profile contains personal data retained per GDPR and 7-year regulatory requirements.
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3 className="card-title">Skills (from Settings ref table)</h3></div>
            <table>
              <tbody>
                {MNT_SKILLS.map(s => {
                  const v = MNT_SKILL_MATRIX[t.id][s];
                  return (
                    <tr key={s}>
                      <td style={{fontSize:11}}>{s}</td>
                      <td style={{textAlign:"right", fontSize:14}}>{v === "specialist" ? "⚡" : v === "has" ? "✓" : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {isManager && (
              <div style={{marginTop:10, fontSize:11}}>
                <div className="muted">Hourly rate: <span className="mono" style={{fontWeight:600, color:"var(--text)"}}>€{t.rate.toFixed(2)}/h</span></div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "history" && (
        <div className="card">
          <div className="card-head"><h3 className="card-title">Assignment history</h3></div>
          <table>
            <thead><tr><th>mWO</th><th>Asset</th><th>Type</th><th>Start</th><th>Duration</th><th>Status</th></tr></thead>
            <tbody>
              {MNT_MWOS.filter(m => m.tech === t.name).map(m => (
                <tr key={m.mwo} style={{cursor:"pointer"}} onClick={()=>onNav("mwo_detail")}>
                  <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{m.mwo}</td>
                  <td style={{fontSize:11}}>{m.asset}</td>
                  <td><MwoType t={m.type}/></td>
                  <td className="mono" style={{fontSize:11}}>{m.start}</td>
                  <td className="mono" style={{fontSize:11}}>1h 24m</td>
                  <td><MwoStatus s={m.status}/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

// -------- MAINT-017 LOTO List --------
const MntLotoList = ({ onNav, openModal, role }) => {
  const [activeOnly, setActiveOnly] = React.useState(true);

  const visible = MNT_LOTO_PROCS.filter(l => !activeOnly || l.status === "active");

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Maintenance</a> · LOTO</div>
          <h1 className="page-title">Lockout / Tagout (LOTO)</h1>
          <div className="muted" style={{fontSize:12}}>
            {MNT_LOTO_PROCS.filter(l=>l.status==="active").length} active · {MNT_LOTO_PROCS.length} total procedures · Two-person policy active
          </div>
        </div>
        <div className="row-flex">
          <label style={{fontSize:11, display:"flex", alignItems:"center", gap:6}}>
            <input type="checkbox" checked={activeOnly} onChange={e=>setActiveOnly(e.target.checked)}/>
            Active LOTO only
          </label>
          <button className="btn btn-primary btn-sm" onClick={()=>openModal("lotoApply")}>＋ Apply LOTO</button>
        </div>
      </div>

      {MNT_LOTO_PROCS.filter(l=>l.status==="active").length > 0 && (
        <div className="alert-amber alert-box" style={{fontSize:12, marginBottom:10}}>
          <span>⚠</span>
          <div>
            <b>{MNT_LOTO_PROCS.filter(l=>l.status==="active").length} LOTO procedure(s) currently active.</b> Ensure work is complete before clearing. Two-person verification required for critical assets.
          </div>
        </div>
      )}

      <div className="card" style={{padding:0}}>
        <table>
          <thead>
            <tr>
              <th>Procedure #</th><th>Asset</th><th>Linked mWO</th><th>Energy sources</th><th>Locks</th>
              <th>Status</th><th>Applied by</th><th>Applied at</th><th>Expected clear</th><th>Verified by</th><th>Cleared by</th>
              <th style={{width:140}}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(l => (
              <tr key={l.proc} className={l.status === "active" ? "loto-row" : ""}>
                <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{l.proc}</td>
                <td style={{fontSize:12}}><span className="loto-icon">🔒</span> {l.asset}</td>
                <td className="mono" style={{fontSize:11, color:"var(--blue)", cursor:"pointer"}} onClick={()=>onNav("mwo_detail")}>{l.mwo}</td>
                <td className="num mono">{l.nrg} sources</td>
                <td className="num mono">{l.tags}</td>
                <td>{l.status === "active" ? <LotoBadge active={true}/> : <span className="badge badge-gray" style={{fontSize:9}}>Cleared</span>}</td>
                <td style={{fontSize:11}}>{l.appliedBy}</td>
                <td className="mono" style={{fontSize:11}}>{l.appliedAt}</td>
                <td className="mono" style={{fontSize:11}}><DueCell date={l.expectedClear}/></td>
                <td style={{fontSize:11}}>{l.verifiedBy}</td>
                <td style={{fontSize:11}}>{l.clearedBy || <span className="muted">—</span>}</td>
                <td>
                  {l.status === "active" ? <button className="btn btn-danger btn-sm" onClick={()=>openModal("lotoClear", { proc: l.proc })}>Clear LOTO</button> : <button className="btn btn-ghost btn-sm">View</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Active LOTO procedure detail expansion */}
      {MNT_LOTO_PROCS.filter(l=>l.status==="active").length > 0 && (
        <div className="card" style={{marginTop:12}}>
          <div className="card-head"><h3 className="card-title">Active procedure — {MNT_LOTO_DETAIL.proc}</h3></div>
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:14}}>
            <div>
              <div className="muted" style={{fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:700, marginBottom:6}}>Energy sources isolated ({MNT_LOTO_DETAIL.energy.length})</div>
              {MNT_LOTO_DETAIL.energy.map(e => (
                <div key={e.n} className={"nrg-step " + (e.done ? "done" : "")}>
                  <span className="ns-num">{e.n}</span>
                  <div className="ns-desc">
                    {e.desc}
                    <div className="ns-iso">{e.iso}</div>
                  </div>
                  <div className="ns-verif">
                    <div>✓ {e.verifiedBy}</div>
                    <div>✓ {e.secondBy}</div>
                  </div>
                </div>
              ))}
            </div>
            <div>
              <div className="muted" style={{fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:700, marginBottom:6}}>Tags & locks applied ({MNT_LOTO_DETAIL.tags.length})</div>
              <table>
                <thead><tr><th>Tag ID</th><th>Location</th><th>Applied by</th></tr></thead>
                <tbody>
                  {MNT_LOTO_DETAIL.tags.map(t => (
                    <tr key={t.id}>
                      <td className="mono">{t.id}</td>
                      <td style={{fontSize:11}}>{t.loc}</td>
                      <td style={{fontSize:11}}>{t.applied}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="alert-amber alert-box" style={{fontSize:11, marginTop:10}}>
                <span>⚠</span>
                <div>Critical asset — two-person verification enforced. Zero energy confirmed by {MNT_LOTO_DETAIL.zeroEnergyVerifiedBy} + {MNT_LOTO_DETAIL.secondVerifier}.</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// -------- MAINT-020 Maintenance Analytics --------
const MntAnalytics = ({ onNav, role }) => {
  const [tab, setTab] = React.useState("overview");
  const [dateRange, setDateRange] = React.useState("30d");

  const a = MNT_ANALYTICS;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Maintenance</a> · Analytics</div>
          <h1 className="page-title">Maintenance analytics</h1>
          <div className="muted" style={{fontSize:12}}>
            KPI data refreshed daily at 02:30 · Last update: 2026-04-21 02:30 · Sourced from <span className="mono">maintenance_kpis</span> + <span className="mono">15-OEE oee_shift_metrics</span>
          </div>
        </div>
        <div className="row-flex">
          <select value={dateRange} onChange={e=>setDateRange(e.target.value)} style={{width:110, fontSize:11}}>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="12m">Last 12 months</option>
          </select>
          <select style={{width:140, fontSize:11}}><option>All assets</option></select>
          <button className="btn btn-secondary btn-sm">⇪ Export</button>
          <button className="btn btn-secondary btn-sm">🖨 Print report</button>
        </div>
      </div>

      <div className="tabs-bar">
        {["overview","mtbf","pm","availability","cost","pareto"].map(k => (
          <button key={k} className={"tab-btn " + (tab === k ? "on" : "")} onClick={()=>setTab(k)}>
            {{ overview: "Overview", mtbf: "MTBF/MTTR", pm: "PM Compliance", availability: "Availability", cost: "Cost", pareto: "Pareto" }[k]}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div>
          {/* 6-KPI grid */}
          <div className="kpi-grid-6">
            <div className="kpi green"><div className="kpi-label">MTBF (30d avg)</div><div className="kpi-value">{a.overview.mtbf}</div><div className="kpi-sub">↑ {a.overview.mtbfTrend} vs prev</div></div>
            <div className="kpi green"><div className="kpi-label">MTTR (30d avg)</div><div className="kpi-value">{a.overview.mttr}</div><div className="kpi-sub">↓ {a.overview.mttrTrend} vs prev</div></div>
            <div className="kpi green"><div className="kpi-label">PM compliance</div><div className="kpi-value">{a.overview.pmCompliance}%</div><div className="kpi-sub">↑ {a.overview.pmTrend}</div></div>
            <div className="kpi green"><div className="kpi-label">Planned ratio</div><div className="kpi-value">{a.overview.plannedRatio}%</div><div className="kpi-sub">Target ≥ 70%</div></div>
            <div className="kpi"><div className="kpi-label">Total mWO cost (YTD)</div><div className="kpi-value">{a.overview.totalCost}</div><div className="kpi-sub">+{a.overview.costTrend}</div></div>
            <div className="kpi"><div className="kpi-label">Parts cost (YTD)</div><div className="kpi-value">{a.overview.partsCost}</div><div className="kpi-sub">+{a.overview.partsTrend}</div></div>
          </div>

          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
            <div className="card">
              <div className="card-head"><h3 className="card-title">Top 5 problem assets (30d)</h3></div>
              {a.problemAssets.map(p => (
                <div key={p.asset} className="gauge-row">
                  <span style={{width:150, fontSize:11, fontWeight:500}}>{p.asset}</span>
                  <div className="gauge-bar"><span className="red" style={{width: (p.dtHours/20*100) + "%"}}></span></div>
                  <span className="mono" style={{fontSize:11, width:90, textAlign:"right"}}>{p.dtHours}h · {p.mwos} mWOs</span>
                </div>
              ))}
            </div>

            <div className="card">
              <div className="card-head"><h3 className="card-title">Recent completed mWOs</h3></div>
              <table>
                <thead><tr><th>mWO</th><th>Asset</th><th>Type</th><th>Dur.</th></tr></thead>
                <tbody>
                  {MNT_MWOS.filter(m=>m.status==="completed").slice(0,5).map(m => (
                    <tr key={m.mwo} style={{cursor:"pointer"}} onClick={()=>onNav("mwo_detail")}>
                      <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{m.mwo}</td>
                      <td style={{fontSize:11}}>{m.asset}</td>
                      <td><MwoType t={m.type}/></td>
                      <td className="mono" style={{fontSize:11}}>~90 min</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === "mtbf" && (
        <div>
          <div className="card" style={{marginBottom:10}}>
            <div className="card-head"><h3 className="card-title">MTBF / MTTR trend (13-week)</h3></div>
            <div className="muted" style={{fontSize:11, marginBottom:10}}>Sourced from 15-OEE <span className="mono">oee_shift_metrics</span>. Maintenance does not compute these independently.</div>
            <div style={{display:"flex", alignItems:"end", gap:4, height:120, padding:"0 12px", borderBottom:"1px solid var(--border)"}}>
              {a.mtbfTrend.map((v,i) => (
                <div key={i} style={{flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:2}}>
                  <div style={{width:"100%", height: (v/200*100)+"%", minHeight:3, background:"var(--green)", borderRadius:1}}></div>
                  <div className="mono" style={{fontSize:9, color:"var(--muted)"}}>{v}</div>
                </div>
              ))}
            </div>
            <div className="muted" style={{fontSize:10, marginTop:6, textAlign:"center"}}>Weekly MTBF (hours) — last 13 weeks</div>
          </div>

          <div className="card">
            <div className="card-head"><h3 className="card-title">Per-asset breakdown</h3></div>
            <table>
              <thead><tr><th>Asset</th><th>Type</th><th>MTBF (h)</th><th>MTTR (min)</th><th>Failures</th><th>Improvement vs target</th></tr></thead>
              <tbody>
                {MNT_ASSETS.filter(a=>a.mtbf !== "—").map(a => (
                  <tr key={a.id}>
                    <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{a.id} · {a.name}</td>
                    <td style={{fontSize:11}}>{a.type}</td>
                    <td className="num mono">{a.mtbf}</td>
                    <td className="num mono">{a.mttr}</td>
                    <td className="num mono">{Math.floor(Math.random()*5)+1}</td>
                    <td><AvailCell pct={a.avail}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "pm" && (
        <div className="card">
          <div className="card-head"><h3 className="card-title">PM compliance trend</h3></div>
          <div style={{display:"flex", alignItems:"end", gap:16, height:120, padding:"0 12px", borderBottom:"1px solid var(--border)"}}>
            {a.pmCompliance.map((p,i) => (
              <div key={i} style={{flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4}}>
                <div className="mono" style={{fontSize:11, fontWeight:600, color: p.compliance >= 85 ? "var(--green-700)" : "var(--amber-700)"}}>{p.compliance}%</div>
                <div style={{width:"100%", height: (p.compliance/100*100)+"%", minHeight:3, background: p.compliance >= 85 ? "var(--green)" : "var(--amber)", borderRadius:1}}></div>
                <div className="muted" style={{fontSize:10}}>{p.month}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "pareto" && (
        <div className="card">
          <div className="card-head"><h3 className="card-title">Downtime cause Pareto (30d)</h3></div>
          <div className="muted" style={{fontSize:11, marginBottom:10}}>Causes from 08-PRODUCTION <span className="mono">downtime_events</span> linked to mWOs in Maintenance.</div>
          {a.pareto.map((p,i) => {
            const cum = a.pareto.slice(0, i+1).reduce((s,x)=>s+x.pct, 0);
            return (
              <div key={p.cause} className="pareto">
                <span>{p.cause}</span>
                <div className="pareto-bar">
                  <span style={{width: (p.pct*2) + "%"}}></span>
                </div>
                <span className="mono">{p.hours}h</span>
                <span className="mono" style={{textAlign:"right"}}>{p.events} ev · {cum}%</span>
              </div>
            );
          })}
        </div>
      )}

      {tab === "cost" && (
        <div>
          <div className="card" style={{marginBottom:10}}>
            <div className="card-head"><h3 className="card-title">Technician utilisation</h3></div>
            <table>
              <thead><tr><th>Technician</th><th>Hours worked</th><th>Avg per mWO</th><th>Cost YTD</th></tr></thead>
              <tbody>
                {a.techUtil.map(t => (
                  <tr key={t.name}>
                    <td style={{fontSize:12}}>{t.name}</td>
                    <td className="num mono">{t.hours}h</td>
                    <td className="mono" style={{fontSize:11}}>{t.avgPerMwo}</td>
                    <td className="mono" style={{fontWeight:600}}>{t.costYtd}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "availability" && (
        <div className="card">
          <div className="card-head"><h3 className="card-title">Per-asset availability (30d)</h3></div>
          <div className="muted" style={{fontSize:11, marginBottom:10}}>Availability data is read-only from the 15-OEE module.</div>
          <table>
            <thead><tr><th>Asset</th><th>Line</th><th style={{textAlign:"right"}}>Availability</th><th>Trend</th></tr></thead>
            <tbody>
              {MNT_ASSETS.map(a => (
                <tr key={a.id}>
                  <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{a.id} · {a.name}</td>
                  <td className="mono" style={{fontSize:11}}>{a.line}</td>
                  <td style={{textAlign:"right"}}><AvailCell pct={a.avail}/></td>
                  <td>
                    <div style={{display:"flex", gap:1, alignItems:"end", height:20}}>
                      {Array.from({length:14}).map((_,i) => (
                        <div key={i} style={{width:3, height:Math.max(4, (a.avail - 85 + Math.random()*3)*2)+"%", background: a.avail >= 95 ? "var(--green)" : a.avail >= 90 ? "var(--amber)" : "var(--red)", borderRadius:1}}></div>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

// -------- MAINT-021 Maintenance Settings --------
const MntSettings = ({ onNav, role }) => {
  const [section, setSection] = React.useState("general");
  const s = MNT_SETTINGS;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Maintenance</a> · Settings</div>
          <h1 className="page-title">Maintenance settings</h1>
          <div className="muted" style={{fontSize:12}}>Restricted to Maintenance Manager + Admin roles</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm">Reset to defaults</button>
          <button className="btn btn-primary btn-sm">Save changes</button>
        </div>
      </div>

      <div style={{display:"grid", gridTemplateColumns:"240px 1fr", gap:14, alignItems:"flex-start"}}>
        {/* Left nav */}
        <div className="asset-hier">
          {[
            { k: "general",        l: "General defaults" },
            { k: "criticality",    l: "Criticality taxonomy" },
            { k: "autoWr",         l: "Auto-WR from downtime" },
            { k: "sanitation",     l: "Sanitation / allergen" },
            { k: "loto",           l: "LOTO policy" },
            { k: "oee",            l: "OEE trigger (P2)" },
            { k: "skills",         l: "Technician skill catalog" },
            { k: "notifications",  l: "Notifications" },
          ].map(item => (
            <div key={item.k} className={"hier-node " + (section === item.k ? "on" : "")} onClick={()=>setSection(item.k)}>
              <span style={{flex:1}}>{item.l}</span>
            </div>
          ))}
        </div>

        {/* Right pane */}
        <div className="card">
          {section === "general" && (
            <div>
              <h3 className="card-title" style={{marginBottom:10}}>General defaults</h3>
              <div className="ff-inline">
                <Field label="PM lead time (days)" help="Days before due to auto-create mWO (default 7)"><input type="number" defaultValue={s.general.pmLeadTimeDays}/></Field>
                <Field label="Calibration warning window (days)" help="Shows amber badge before due date"><input type="number" defaultValue={s.general.calWarnDays}/></Field>
                <Field label="Calibration urgent window (days)" help="Default 7"><input type="number" defaultValue={s.general.calUrgentDays}/></Field>
                <Field label="MTBF target (hours)" help="Optional threshold for KPI"><input type="number" defaultValue={s.general.mtbfTarget}/></Field>
                <Field label="Availability breach threshold (%)"><input type="number" defaultValue={s.general.availabilityBreach}/></Field>
                <Field label="Requires LOTO default for new assets"><select defaultValue={s.general.lotoDefaultOn ? "on" : "off"}><option value="off">Off</option><option value="on">On</option></select></Field>
              </div>
            </div>
          )}

          {section === "criticality" && (
            <div>
              <h3 className="card-title" style={{marginBottom:10}}>Criticality taxonomy</h3>
              <div className="muted" style={{fontSize:11, marginBottom:10}}>Taxonomy is fixed at 4 levels for consistency. Edit descriptions below. Reorder by drag-and-drop.</div>
              <table>
                <thead><tr><th>Level</th><th>Description</th><th>Order</th></tr></thead>
                <tbody>
                  {s.criticality.map((c,i)=>(
                    <tr key={c.level}>
                      <td><CritBadge c={c.level.toLowerCase()}/></td>
                      <td><textarea defaultValue={c.desc} style={{width:"100%", fontSize:11, minHeight:40}}/></td>
                      <td style={{textAlign:"center", cursor:"move"}}>☰</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {section === "autoWr" && (
            <div>
              <h3 className="card-title" style={{marginBottom:10}}>Auto-WR from downtime</h3>
              <div className="muted" style={{fontSize:11, marginBottom:10}}>When enabled, 08-PRODUCTION downtime events auto-create mWOs.</div>
              <div className="ff-inline">
                <Field label="Enable auto-WR creation"><select defaultValue={s.autoWr.enabled ? "on" : "off"}><option value="on">On</option><option value="off">Off</option></select></Field>
                <Field label="Downtime duration threshold (minutes)" help="Only events exceeding this auto-create mWO"><input type="number" defaultValue={s.autoWr.dtThreshold}/></Field>
                <Field label="Anti-duplicate window (hours)" help="Prevents duplicate mWOs for same asset in window"><input type="number" defaultValue={s.autoWr.antiDupWindow}/></Field>
              </div>
            </div>
          )}

          {section === "sanitation" && (
            <div>
              <h3 className="card-title" style={{marginBottom:10}}>Sanitation / allergen</h3>
              <div className="ff-inline">
                <Field label="ATP RLU threshold" help="BRCGS / Forza baseline. Override per food product type via Ref table in Settings."><input type="number" defaultValue={s.sanitation.atpRlu}/></Field>
                <Field label="Allergen dual sign-off required"><select defaultValue="on" disabled><option value="on">On (BRCGS mandated — non-editable)</option></select></Field>
              </div>
            </div>
          )}

          {section === "loto" && (
            <div>
              <h3 className="card-title" style={{marginBottom:10}}>LOTO policy</h3>
              <div className="ff-inline">
                <Field label="Two-person LOTO required for critical assets"><select defaultValue={s.loto.twoPersonCritical ? "on" : "off"}><option value="on">On</option><option value="off">Off</option></select></Field>
                <Field label="LOTO timeout warning (hours)"><input type="number" defaultValue={s.loto.timeoutHours}/></Field>
                <Field label="Photo evidence for LOTO clear"><select defaultValue={s.loto.photoEvidence}><option>Required</option><option>Recommended</option><option>Optional</option></select></Field>
              </div>
            </div>
          )}

          {section === "oee" && (
            <div>
              <h3 className="card-title" style={{marginBottom:10}}>OEE trigger (P2)</h3>
              <div className="alert-blue alert-box" style={{fontSize:12, marginBottom:10}}>
                <span>ⓘ</span>
                <div>This feature is Phase 2. Requires 15-OEE module to be active and <span className="mono">oee_shift_metrics</span> to be populated.</div>
              </div>
              <Field label="Enable OEE auto-PM trigger"><select defaultValue={s.oeeTrigger.enabled ? "on" : "off"} disabled><option value="off">Off (P2)</option></select></Field>
            </div>
          )}

          {section === "skills" && (
            <div>
              <h3 className="card-title" style={{marginBottom:10}}>Technician skill catalog</h3>
              <div className="alert-blue alert-box" style={{fontSize:12, marginBottom:10}}>
                <span>ⓘ</span>
                <div>Skill catalog is sourced from 02-SETTINGS › Reference Tables › <span className="mono">technician_skills</span>. Read-only view in Maintenance.</div>
              </div>
              <table>
                <thead><tr><th>Skill</th><th>Technicians with skill</th></tr></thead>
                <tbody>
                  {MNT_SKILLS.map(sk => {
                    const count = MNT_TECHNICIANS.filter(t => MNT_SKILL_MATRIX[t.id][sk] !== "none").length;
                    return <tr key={sk}><td>{sk}</td><td className="num mono">{count}</td></tr>;
                  })}
                </tbody>
              </table>
              <div style={{marginTop:10}}><a style={{color:"var(--blue)", fontSize:11}}>Edit in Settings →</a></div>
            </div>
          )}

          {section === "notifications" && (
            <div>
              <h3 className="card-title" style={{marginBottom:10}}>Notification preferences</h3>
              <div className="muted" style={{fontSize:11, marginBottom:10}}>Per-event notification toggles (email via Resend).</div>
              <table>
                <thead><tr><th>Event</th><th>Frequency</th><th style={{textAlign:"center"}}>Enabled</th></tr></thead>
                <tbody>
                  {s.notifications.map((n,i)=>(
                    <tr key={i}>
                      <td style={{fontSize:12}}>{n.event}</td>
                      <td className="muted" style={{fontSize:11}}>{n.freq}</td>
                      <td style={{textAlign:"center"}}><input type="checkbox" defaultChecked={n.on}/></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

Object.assign(window, {
  MntCalList, MntCalDetail,
  MntTechList, MntTechDetail,
  MntLotoList,
  MntAnalytics,
  MntSettings,
});
