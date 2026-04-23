// ============ Reporting — Workflow screens (Exports, Saved Filters, Scheduled) ============

// ---------- RPT-EXPORTS Export History ----------
const RptExports = ({ role, onNav, openModal }) => {
  const [fmt, setFmt] = React.useState("All");
  const [status, setStatus] = React.useState("All");

  const visible = RPT_EXPORTS.filter(e =>
    (fmt === "All" || e.fmt.toUpperCase() === fmt) &&
    (status === "All" || (status === "Completed" ? e.status === "completed" : e.status === "failed"))
  );

  return (
    <>
      <div className="page-head">
        <div>
          <DrillCrumb trail={[{label:"Reporting", key:"home"}, {label:"Export History"}]} onNav={onNav}/>
          <h1 className="page-title">Export History</h1>
          <div className="muted" style={{fontSize:12, marginTop:4}}>Personal export history · 7-year retention per BRCGS Issue 10</div>
        </div>
        <div className="row-flex">
          <select value={fmt} onChange={e => setFmt(e.target.value)} style={{fontSize:12, padding:"4px 8px"}}>
            <option>All</option><option>PDF</option><option>CSV</option><option>XLSX</option>
          </select>
          <select value={status} onChange={e => setStatus(e.target.value)} style={{fontSize:12, padding:"4px 8px"}}>
            <option>All</option><option>Completed</option><option>Failed</option>
          </select>
          <input type="date" defaultValue="2026-03-21" style={{fontSize:12, padding:"4px 8px"}}/>
          <button className="btn btn-secondary btn-sm">⇪ Export (CSV)</button>
        </div>
      </div>

      <div className="kpi-row-3">
        {RPT_EXPORTS_KPIS.map(k => (
          <div key={k.k} className={"kpi " + k.accent}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-run-foot"><RunStrip outcomes={buildKpiRunCells(k)} label="8w"/></div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <h3 className="card-title">Exports</h3>
          <span className="muted" style={{fontSize:11}}>{visible.length} of {RPT_EXPORTS.length} · Domain code ref: <span className="mono">RPT-0042</span></span>
        </div>
        <table>
          <thead><tr>
            <th>Export #</th><th>Dashboard</th><th>Format</th>
            <th>Date Range</th><th>Exported At</th>
            <th style={{textAlign:"right"}}>File Size</th>
            <th>Status</th><th>SHA-256</th>
            <th>Retention Until</th><th></th>
          </tr></thead>
          <tbody>
            {visible.map(e => (
              <tr key={e.id} style={e.failed ? {background:"#fef2f2"} : undefined}>
                <td className="mono" style={{fontSize:11, fontWeight:600}}>{e.id.substring(0, 8)}…</td>
                <td style={{fontSize:11}}>{e.dashboard}</td>
                <td><FmtBadge fmt={e.fmt}/></td>
                <td className="mono" style={{fontSize:11}}>{e.range}</td>
                <td className="mono" style={{fontSize:11}}>{e.at}</td>
                <td className="num mono">{e.size}</td>
                <td><span className={"badge " + (e.status === "completed" ? "badge-green" : "badge-red")} style={{fontSize:10}}>{e.status}</span></td>
                <td className="mono" style={{fontSize:10, color:"var(--muted)"}} title={e.sha}>{e.sha.substring(0,16)}…</td>
                <td className="mono" style={{fontSize:11}}>{e.retain}</td>
                <td>
                  {e.failed
                    ? <button className="btn btn-sm btn-secondary" onClick={() => openModal("errorLog", e)}>Error details</button>
                    : e.archived
                      ? <span className="badge badge-gray" style={{fontSize:10}} title="Contact system admin to retrieve from cold storage">Archived</span>
                      : <button className="btn btn-sm btn-primary">Download</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="alert-blue alert-box" style={{marginTop:12, fontSize:11}}>
        <span>ⓘ</span>
        <div>Exports are retained for 7 years per BRCGS Issue 10 requirements. Files archive to cold storage after 90 days but remain on record indefinitely.</div>
      </div>
    </>
  );
};

// ---------- RPT-SAVED Saved Filter Presets ----------
const RptSavedFilters = ({ role, onNav, openModal }) => {
  const canManage = role === "Manager" || role === "Admin";
  if (!canManage) {
    return (
      <>
        <div className="page-head">
          <div><h1 className="page-title">Saved Filter Presets</h1></div>
        </div>
        <div className="alert-red alert-box" style={{fontSize:13}}>
          <span>⚠</span>
          <div><b>Access denied.</b> Saved filter presets require Reporting Manager or Admin role.</div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <DrillCrumb trail={[{label:"Reporting", key:"home"}, {label:"Saved Filters"}]} onNav={onNav}/>
          <h1 className="page-title">Saved Filter Presets</h1>
          <div className="muted" style={{fontSize:12, marginTop:4}}>Reusable filter snapshots. Create from any dashboard filter bar.</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-primary btn-sm" onClick={() => openModal("savePreset", { dashboard: "New Preset" })}>＋ New Preset</button>
        </div>
      </div>

      {RPT_SAVED.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="★"
            title="No saved filter presets yet"
            body='Create a preset from any dashboard filter bar — look for the "Save as preset" option.'
            action={{ label: "Go to Factory Overview →", onClick: () => onNav("factory_overview") }}
          />
        </div>
      ) : (
        <div className="card">
          <table>
            <thead><tr>
              <th>Name</th><th>Dashboard</th><th>Filters</th>
              <th>Visibility</th><th>Created By</th>
              <th>Created</th><th>Last Used</th><th></th>
            </tr></thead>
            <tbody>
              {RPT_SAVED.map(p => (
                <tr key={p.name}>
                  <td style={{fontWeight:500}}>{p.name}</td>
                  <td style={{fontSize:11}}>{p.dashboard}</td>
                  <td style={{fontSize:11, color:"var(--muted)"}}>{p.filters}</td>
                  <td><span className={"badge " + (p.visibility === "team" ? "badge-blue" : "badge-gray")} style={{fontSize:10}}>{p.visibility === "team" ? "My team" : "Just me"}</span></td>
                  <td style={{fontSize:11}}>{p.createdBy}</td>
                  <td style={{fontSize:11, color:"var(--muted)"}}>{p.createdAt}</td>
                  <td style={{fontSize:11}}>{p.lastUsed}</td>
                  <td>
                    <button className="btn btn-sm btn-secondary">Apply</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => openModal("savePreset", { edit: true, name: p.name })}>Edit</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => openModal("deleteConfirm", { kind: "preset", name: p.name })}>Delete</button>
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

// ---------- RPT-SCHED Scheduled Reports List (P2) ----------
const RptScheduled = ({ role, onNav, openModal }) => {
  const canManage = role === "Manager" || role === "Admin";
  if (!canManage) {
    return (
      <>
        <div className="page-head"><div><h1 className="page-title">Scheduled Reports</h1></div></div>
        <div className="alert-red alert-box" style={{fontSize:13}}>
          <span>⚠</span>
          <div><b>Access denied.</b> Scheduled reports require Reporting Manager or Admin role. (Requires <span className="mono">reporting.scheduled_delivery</span> flag ON — currently <b>ON</b>.)</div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <DrillCrumb trail={[{label:"Reporting", key:"home"}, {label:"Scheduled Reports"}]} onNav={onNav}/>
          <div className="row-flex" style={{alignItems:"center", gap:10}}>
            <h1 className="page-title">Scheduled Reports</h1>
            <span className="badge badge-gray" style={{fontSize:10}}>Phase 2</span>
          </div>
          <div className="muted" style={{fontSize:12, marginTop:4}}>Flag <span className="mono">reporting.scheduled_delivery</span> is <b className="fresh-ok">ON</b> · Domain code ref: <span className="mono">SCH-0089</span></div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm">⇪ Export (CSV)</button>
          <button className="btn btn-primary btn-sm" onClick={() => onNav("scheduled_edit")}>＋ New Schedule</button>
        </div>
      </div>

      <div className="kpi-row-3">
        {RPT_SCHED_KPIS.map(k => (
          <div key={k.k} className={"kpi " + k.accent}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-run-foot"><RunStrip outcomes={buildKpiRunCells(k)} label="8w"/></div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head"><h3 className="card-title">Schedules</h3></div>
        <table>
          <thead><tr>
            <th>Name</th><th>Dashboard</th><th>Cadence</th>
            <th>Next Run</th><th>Last Run / Outcome</th>
            <th style={{textAlign:"right"}}>Recipients</th>
            <th>Format</th><th>Status</th>
            <th style={{textAlign:"right"}}>Fail #</th><th></th>
          </tr></thead>
          <tbody>
            {RPT_SCHED_ROWS.map(r => (
              <tr key={r.id} className={r.status === "dlq" ? "sched-row-failed" : ""}>
                <td style={{fontSize:12}}>
                  <a style={{color:"var(--blue)", cursor:"pointer", fontWeight:500}} onClick={() => onNav("scheduled_edit")}>{r.name}</a>
                  <div className="mono" style={{fontSize:10, color:"var(--muted)"}}>{r.id}</div>
                </td>
                <td style={{fontSize:11}}>{r.dashboard}</td>
                <td style={{fontSize:11}}>{r.cadence}</td>
                <td className="mono" style={{fontSize:11, color: r.nextRun === "Past due" ? "var(--red)" : "var(--text)", fontWeight: r.nextRun === "Past due" ? 700 : 400}}>{r.nextRun}</td>
                <td style={{fontSize:11}}>
                  <div>{r.lastRun}</div>
                  <span className={"badge " + (r.outcome === "delivered" ? "badge-green" : r.outcome === "partial" ? "badge-amber" : "badge-red")} style={{fontSize:9}}>{r.outcome}</span>
                </td>
                <td className="num mono" title={`3 recipients (hover for emails)`}>{r.recipients}</td>
                <td><FmtBadge fmt={r.format}/></td>
                <td><span className={"badge " + (r.status === "active" ? "badge-green" : r.status === "paused" ? "badge-amber" : "badge-red")} style={{fontSize:10}}>
                  {r.status === "active" ? "Active" : r.status === "paused" ? "Paused" : "Failed (DLQ)"}
                </span></td>
                <td className="num mono" style={{color: r.failures >= 3 ? "var(--red)" : "var(--muted)", fontWeight: r.failures >= 3 ? 700 : 400}}>{r.failures}</td>
                <td>
                  <button className="btn btn-sm btn-ghost" title="Run now" onClick={() => openModal("runNow", { name: r.name, recipients: r.recipients })}>▶</button>
                  <button className="btn btn-sm btn-ghost" title="Edit" onClick={() => onNav("scheduled_edit")}>✎</button>
                  {r.status === "dlq" && <button className="btn btn-sm btn-ghost" title="View error" onClick={() => openModal("errorLog", { errorCode: "DLQ_MAX_ATTEMPTS", errorMsg: "5 delivery attempts failed — moved to DLQ per V-RPT-SCHEDULE-4" })}>⚠</button>}
                  <button className="btn btn-sm btn-ghost" title="Delete" onClick={() => openModal("deleteConfirm", { kind: "schedule", name: r.name })}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

// ---------- RPT-SCHED-EDIT Scheduled Report Create / Edit ----------
const RptScheduledEdit = ({ role, onNav, openModal }) => {
  const [scheduleType, setScheduleType] = React.useState("preset");
  const [preset, setPreset] = React.useState("weekly");
  const [days, setDays] = React.useState(new Set(["mon"]));
  const [recipients, setRecipients] = React.useState([
    { name: "M. Krawczyk", email: "m.krawczyk@forzafoods.com" },
    { name: "P. Director",  email: "p.director@forzafoods.com" },
  ]);
  const [dashboard, setDashboard] = React.useState("Factory Overview");
  const [cronStr, setCronStr] = React.useState("0 7 * * 1");

  const toggleDay = (d) => {
    const next = new Set(days);
    next.has(d) ? next.delete(d) : next.add(d);
    setDays(next);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <DrillCrumb trail={[{label:"Reporting", key:"home"}, {label:"Scheduled Reports", key:"scheduled"}, {label:"New Schedule"}]} onNav={onNav}/>
          <h1 className="page-title">New Scheduled Report</h1>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm" onClick={() => onNav("scheduled")}>Cancel</button>
          <button className="btn btn-primary btn-sm">Save Schedule</button>
        </div>
      </div>

      <div style={{display:"grid", gridTemplateColumns:"2fr 1fr", gap:14}}>
        <div>
          <div className="card">
            <div className="card-head"><h3 className="card-title">Section 1 — Report</h3></div>
            <div style={{padding:14}}>
              <Field label="Report Name" required><input defaultValue="Weekly Factory Overview" maxLength={80}/></Field>
              <Field label="Dashboard" required>
                <select value={dashboard} onChange={e => setDashboard(e.target.value)}>
                  <option>Factory Overview</option>
                  <option>Yield by Line</option>
                  <option>Yield by SKU</option>
                  <option>QC Holds</option>
                  <option>OEE Summary</option>
                  <option>Inventory Aging</option>
                  <option>WO Status</option>
                  <option>Shipment OTD</option>
                </select>
              </Field>
              <div className="ff-inline">
                <Field label="Line filter"><select><option>All Lines</option><option>Line 1</option></select></Field>
                <Field label="Shift filter"><select><option>All</option><option>AM</option><option>PM</option></select></Field>
              </div>
            </div>
          </div>

          <div className="card" style={{marginTop:12}}>
            <div className="card-head"><h3 className="card-title">Section 2 — Cadence</h3></div>
            <div style={{padding:14}}>
              <div style={{display:"flex", gap:12, marginBottom:10}}>
                <label style={{fontSize:12, display:"flex", gap:4, alignItems:"center"}}><input type="radio" checked={scheduleType === "preset"} onChange={() => setScheduleType("preset")}/> Preset</label>
                <label style={{fontSize:12, display:"flex", gap:4, alignItems:"center"}}><input type="radio" checked={scheduleType === "custom"} onChange={() => setScheduleType("custom")}/> Custom cron</label>
              </div>
              {scheduleType === "preset" ? (
                <>
                  <div style={{display:"flex", gap:14, marginBottom:10, fontSize:12}}>
                    {["daily","weekly","biweekly","monthly","period"].map(p => (
                      <label key={p} style={{display:"flex", gap:4, alignItems:"center"}}><input type="radio" checked={preset === p} onChange={() => setPreset(p)}/>
                        {p === "daily" ? "Daily" : p === "weekly" ? "Weekly" : p === "biweekly" ? "Every 2 weeks" : p === "monthly" ? "Monthly" : "Period-End (4-4-5)"}
                      </label>
                    ))}
                  </div>
                  {(preset === "weekly" || preset === "biweekly") && (
                    <>
                      <div className="label">Days of week</div>
                      <div style={{display:"flex", gap:6, marginBottom:10}}>
                        {["mon","tue","wed","thu","fri","sat","sun"].map(d => (
                          <button key={d} type="button" className={"btn btn-sm " + (days.has(d) ? "btn-primary" : "btn-secondary")} onClick={() => toggleDay(d)}>{d.toUpperCase()}</button>
                        ))}
                      </div>
                    </>
                  )}
                  <div className="ff-inline">
                    <Field label="Time"><select defaultValue="07:00">{Array.from({length: 48}, (_, i) => {
                      const h = Math.floor(i/2);
                      const m = (i % 2) * 30;
                      const t = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
                      return <option key={t}>{t}</option>;
                    })}</select></Field>
                    <Field label="Timezone"><select defaultValue="Europe/London"><option>Europe/London</option><option>UTC</option></select></Field>
                  </div>
                </>
              ) : (
                <>
                  <Field label="Cron expression" help="Example: 0 7 * * 1 (every Monday at 07:00)">
                    <input className="mono" value={cronStr} onChange={e => setCronStr(e.target.value)}/>
                  </Field>
                  <button className="btn btn-sm btn-secondary">Validate</button>
                  <div style={{marginTop:10, padding:10, background:"var(--gray-050)", fontSize:11, borderRadius:4}}>
                    <b>Next 3 runs:</b>
                    <div className="mono" style={{marginTop:4}}>2026-04-27 07:00 BST</div>
                    <div className="mono">2026-05-04 07:00 BST</div>
                    <div className="mono">2026-05-11 07:00 BST</div>
                  </div>
                </>
              )}
              <Field label="Skip if No Data" help="Do not send email if report returns zero rows">
                <label style={{display:"flex", gap:6, alignItems:"center", fontSize:12}}><input type="checkbox" defaultChecked/> Enabled</label>
              </Field>
            </div>
          </div>

          <div className="card" style={{marginTop:12}}>
            <div className="card-head"><h3 className="card-title">Section 3 — Recipients</h3></div>
            <div style={{padding:14}}>
              <Field label="Recipients" required>
                <div style={{display:"flex", flexWrap:"wrap", gap:6, padding:6, border:"1px solid var(--border)", borderRadius:4}}>
                  {recipients.map((r, i) => (
                    <span key={i} className="rpt-chip">
                      <span>{r.name}</span>
                      <span className="x" onClick={() => setRecipients(recipients.filter((_, ii) => ii !== i))}>×</span>
                    </span>
                  ))}
                  <input placeholder="Type email or select team member…" style={{flex:1, border:0, outline:"none", minWidth:200, fontSize:12}}/>
                </div>
              </Field>
              <a style={{fontSize:11, color:"var(--blue)", cursor:"pointer"}} onClick={() => openModal("recipientGroup")}>＋ Add recipient group</a>

              <div style={{marginTop:10}}>
                <div className="label">Format</div>
                <div style={{display:"flex", gap:12, fontSize:12}}>
                  <label style={{display:"flex", gap:4, alignItems:"center"}}><input type="radio" name="fmt" defaultChecked/> PDF</label>
                  <label style={{display:"flex", gap:4, alignItems:"center"}}><input type="radio" name="fmt"/> CSV</label>
                </div>
              </div>
              <Field label="Subject Template" required help="Variables: {{report_name}}, {{period}}, {{week}}, {{generated_at}}">
                <input defaultValue="{{report_name}} — {{period}}"/>
              </Field>
              <div style={{fontSize:11, color:"var(--muted)", padding:"4px 0"}}>Preview: <b className="mono">Weekly Factory Overview — W/E 19/04/2026</b></div>
              <Field label="Reply-To (optional)"><input type="email" placeholder="ops@forzafoods.com"/></Field>
              <Field label="Conditional Send (Phase 2)">
                <label style={{display:"flex", gap:6, alignItems:"center", fontSize:12, color:"var(--muted)"}}><input type="checkbox" disabled/> Send only if data changed since last run</label>
              </Field>
            </div>
          </div>

          <div className="card" style={{marginTop:12}}>
            <div className="card-head"><h3 className="card-title">Section 4 — Retry Policy</h3></div>
            <div style={{padding:14}}>
              <Field label="Max Retries" help="After N failures → DLQ and schedule disabled (V-RPT-SCHEDULE-4)">
                <select defaultValue="5"><option>1</option><option>2</option><option>3</option><option>5</option></select>
              </Field>
              <div style={{fontSize:11, color:"var(--muted)", padding:"6px 0"}}>
                Retry intervals: <b className="mono">5 min → 30 min → 2h → 12h → 24h</b> (then DLQ)
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="card" style={{position:"sticky", top:100}}>
            <div className="card-head"><h3 className="card-title">Schedule Summary</h3></div>
            <div style={{padding:14}}>
              <Summary rows={[
                { label: "Name",       value: "Weekly Factory Overview" },
                { label: "Dashboard",   value: dashboard },
                { label: "Cadence",     value: preset === "weekly" ? "Weekly (Mon) 07:00 BST" : preset },
                { label: "Recipients",  value: `${recipients.length} recipient(s)` },
                { label: "Format",      value: "PDF" },
                { label: "Timezone",    value: "Europe/London" },
              ]}/>
              <div className="label" style={{marginTop:12}}>Next 3 runs</div>
              <div style={{fontSize:11, padding:"6px 0"}}>
                <div className="mono">Mon 27/04/2026 07:00 BST</div>
                <div className="mono">Mon 04/05/2026 07:00 BST</div>
                <div className="mono">Mon 11/05/2026 07:00 BST</div>
              </div>
              <div className="label" style={{marginTop:10}}>Estimated</div>
              <div style={{fontSize:11, color:"var(--muted)"}}>
                <div>Recipients: <b>{recipients.length}</b></div>
                <div>Report size: PDF ~<b>240 KB</b> / CSV ~<b>32 KB</b></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

Object.assign(window, { RptExports, RptSavedFilters, RptScheduled, RptScheduledEdit });
