// ============ Reporting — Admin dashboards + Settings ============

// ---------- RPT-009 Integration Health ----------
const RptIntegrationHealth = ({ role, onNav, openModal }) => {
  if (role !== "Admin") {
    return (
      <>
        <div className="page-head">
          <div>
            <DrillCrumb trail={[{label:"Reporting", key:"home"}, {label:"Integration Health"}]} onNav={onNav}/>
            <h1 className="page-title">Integration Health</h1>
          </div>
        </div>
        <div className="alert-red alert-box" style={{fontSize:13}}>
          <span>⚠</span>
          <div><b>Access denied.</b> This screen is restricted to Reporting Administrators. Contact your system administrator.</div>
        </div>
      </>
    );
  }

  const hasDlq = RPT_IH_STAGES.some(s => (s.dlq || 0) > 0);

  return (
    <>
      <div className="page-head">
        <div>
          <DrillCrumb trail={[{label:"Reporting", key:"home"}, {label:"Integration Health"}]} onNav={onNav}/>
          <div className="row-flex" style={{alignItems:"center", gap:10}}>
            <h1 className="page-title">Integration Health</h1>
            <ScopePill site="Main Site"/>
            <span className="badge badge-gray" style={{fontSize:10}}>Admin only</span>
          </div>
        </div>
        <div className="row-flex">
          <span className="muted" style={{fontSize:11, alignSelf:"center"}}>Last 24 hours (rolling)</span>
          <ExportDropdown openModal={openModal} dashboard="Integration Health"/>
        </div>
      </div>

      <FreshnessStrip at="14:33" cadence="2 min"/>

      {hasDlq ? (
        <div className="alert-red alert-box" style={{fontSize:13, marginBottom:12}}>
          <span>⚠</span>
          <div style={{flex:1}}>
            <b>DLQ messages detected:</b> Stage 2 (D365 WO Confirm) has 3 items in dead-letter queue. Investigate immediately.
          </div>
          <button className="btn btn-sm btn-secondary">View DLQ ↓</button>
        </div>
      ) : (
        <div className="alert-green alert-box" style={{fontSize:13, marginBottom:12}}>
          <span>✓</span>
          <div>All integration stages healthy — no DLQ items, no failures in the last 24 hours.</div>
        </div>
      )}

      <div className="kpi-row-4">
        {RPT_IH_KPIS.map(k => (
          <div key={k.k} className={"kpi " + k.accent}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-sub">{k.sub || "\u00A0"}</div>
            <div className="kpi-run-foot"><RunStrip outcomes={buildKpiRunCells(k)} label="8w"/></div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head"><h3 className="card-title">Outbox Stages</h3></div>
        <table>
          <thead><tr>
            <th>Stage</th><th>Target System</th>
            <th style={{textAlign:"right"}}>Pending</th>
            <th style={{textAlign:"right"}}>Dispatching</th>
            <th style={{textAlign:"right"}}>Failed (24h)</th>
            <th style={{textAlign:"right"}}>DLQ</th>
            <th style={{textAlign:"right"}}>Avg Latency</th>
            <th>Status</th><th>Phase</th>
          </tr></thead>
          <tbody>
            {RPT_IH_STAGES.map(s => (
              <tr key={s.stage} className={s.status === "critical" ? "" : ""}>
                <td style={{fontSize:12, fontWeight:500}}>{s.stage}</td>
                <td style={{fontSize:11, color:"var(--muted)"}}>{s.target}</td>
                <td className="num mono">{s.status === "p2" ? <span className="muted">—</span> : s.pending}</td>
                <td className="num mono">{s.status === "p2" ? <span className="muted">—</span> : s.dispatching}</td>
                <td className="num mono">{s.status === "p2" ? <span className="muted">—</span> : (s.failed > 0 ? <span className="badge badge-red" style={{fontSize:10}}>{s.failed}</span> : s.failed)}</td>
                <td className="num mono">{s.status === "p2" ? <span className="muted">—</span> : (s.dlq > 0 ? <span className="badge badge-red" style={{fontSize:10}}>{s.dlq}</span> : s.dlq)}</td>
                <td className="num mono">
                  {s.status === "p2" ? <span className="muted">—</span>
                    : <span style={{color: s.latency > 300 ? "var(--red)" : s.latency > 100 ? "var(--amber)" : "var(--green)", fontWeight:600}}>{s.latency}ms</span>}
                </td>
                <td><StageStatus s={s.status}/></td>
                <td><span className={"badge " + (s.phase === "P1" ? "badge-blue" : "badge-gray")} style={{fontSize:10}}>{s.phase}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{marginTop:12}}>
        <div className="card-head">
          <h3 className="card-title">Avg Dispatch Latency — Last 24h</h3>
          <span className="muted" style={{fontSize:10}}>Target: <span className="mono" style={{color:"var(--green)"}}>&lt;100ms</span> · Alert: <span className="mono" style={{color:"var(--red)"}}>&gt;300ms</span></span>
        </div>
        <ChartMultiLine
          data={RPT_IH_LATENCY} xKey="h"
          series={[
            { key: "s1", label: "Stage 1", color: "#22c55e" },
            { key: "s2", label: "Stage 2", color: "#ef4444" },
            { key: "s3", label: "Stage 3", color: "#3b82f6" },
            { key: "s5", label: "Stage 5", color: "#f59e0b" },
          ]}
          target={300} h={220} yLabel="ms"
        />
      </div>

      {hasDlq && (
        <div className="card" style={{marginTop:12}}>
          <div className="card-head"><h3 className="card-title">⚠ DLQ Detail</h3></div>
          <table>
            <thead><tr>
              <th>Stage</th><th>DLQ Table</th>
              <th style={{textAlign:"right"}}>Depth</th>
              <th>Oldest Item</th><th>Sample Error</th><th></th>
            </tr></thead>
            <tbody>
              {RPT_IH_DLQ.map((d, i) => (
                <tr key={i}>
                  <td style={{fontWeight:500}}>{d.stage}</td>
                  <td className="mono" style={{fontSize:11}}>{d.table}</td>
                  <td className="num mono" style={{fontWeight:700, color:"var(--red)"}}>{d.depth}</td>
                  <td className="mono" style={{fontSize:11}}>{d.oldest}</td>
                  <td style={{fontSize:11, color:"var(--muted)"}}>{d.sample}</td>
                  <td><button className="btn btn-sm btn-danger" onClick={() => alert("Cross-module → /admin/integrations/d365/dlq")}>Go to DLQ Admin →</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

// ---------- RPT-010 Rules Usage ----------
const RptRulesUsage = ({ role, onNav, openModal }) => {
  const [expanded, setExpanded] = React.useState(null);
  if (role !== "Admin") {
    return (
      <>
        <div className="page-head">
          <div>
            <h1 className="page-title">Rules Usage Analytics</h1>
          </div>
        </div>
        <div className="alert-red alert-box" style={{fontSize:13}}>
          <span>⚠</span>
          <div><b>Access denied.</b> Reporting Administrators only.</div>
        </div>
      </>
    );
  }

  const orphans = RPT_RU_RULES.filter(r => r.status === "orphan");

  return (
    <>
      <div className="page-head">
        <div>
          <DrillCrumb trail={[{label:"Reporting", key:"home"}, {label:"Rules Usage"}]} onNav={onNav}/>
          <div className="row-flex" style={{alignItems:"center", gap:10}}>
            <h1 className="page-title">Rules Usage Analytics</h1>
            <ScopePill site="Main Site"/>
            <span className="badge badge-gray" style={{fontSize:10}}>Admin only</span>
          </div>
        </div>
        <div className="row-flex">
          <select style={{fontSize:12, padding:"4px 8px"}}><option>Last 7 days</option><option>Last 14 days</option><option>Last 30 days</option></select>
          <ExportDropdown openModal={openModal} dashboard="Rules Usage"/>
        </div>
      </div>

      <FreshnessStrip at="14:29" cadence="5 min"/>

      {orphans.length > 0 && (
        <div className="alert-amber alert-box" style={{fontSize:12, marginBottom:12}}>
          <span>⚠</span>
          <div><b>{orphans.length} orphan rule(s)</b> registered as P1 with no evaluations in the selected period. Verify the rule is being called correctly.</div>
        </div>
      )}

      <div className="kpi-row-4">
        {RPT_RU_KPIS.map(k => (
          <div key={k.k} className={"kpi " + k.accent}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-sub">{k.sub || "\u00A0"}</div>
            <div className="kpi-run-foot"><RunStrip outcomes={buildKpiRunCells(k)} label="8w"/></div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head"><h3 className="card-title">Registered DSL Rules</h3></div>
        <table>
          <thead><tr>
            <th>Rule ID</th><th>Owner</th><th>Description</th><th>Phase</th>
            <th style={{textAlign:"right"}}>Eval Count (24h)</th>
            <th style={{textAlign:"right"}}>Trigger Rate</th>
            <th style={{textAlign:"right"}}>Avg Latency</th>
            <th>Last Fired</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>
            {RPT_RU_RULES.map(r => (
              <React.Fragment key={r.rule}>
                <tr style={{cursor:"pointer"}} onClick={() => setExpanded(expanded === r.rule ? null : r.rule)}>
                  <td className="mono" style={{fontSize:11, fontWeight:600, color:"var(--blue)"}}>{r.rule}</td>
                  <td style={{fontSize:11}}>{r.owner}</td>
                  <td style={{fontSize:11, color:"var(--muted)"}}>{r.desc}</td>
                  <td><span className={"badge " + (r.phase === "P1" ? "badge-blue" : "badge-gray")} style={{fontSize:10}}>{r.phase}</span></td>
                  <td className="num mono">{r.evalCount === 0 ? <span className="badge badge-amber" style={{fontSize:10}}>Inactive</span> : r.evalCount.toLocaleString()}</td>
                  <td className="num mono">{r.triggerRate.toFixed(1)}%</td>
                  <td className="num mono">
                    <span style={{color: r.latency > 50 ? "var(--red)" : r.latency > 10 ? "var(--amber)" : "var(--green)", fontWeight:600}}>
                      {r.latency.toFixed(1)}ms
                    </span>
                  </td>
                  <td style={{fontSize:11}}>{r.lastFired === "Never" ? <span className="badge badge-amber" style={{fontSize:10}}>Never</span> : r.lastFired}</td>
                  <td><RuleStatus s={r.status}/></td>
                  <td><span style={{color:"var(--muted)"}}>{expanded === r.rule ? "▴" : "▾"}</span></td>
                </tr>
                {expanded === r.rule && (
                  <tr>
                    <td colSpan={10} style={{background:"var(--gray-050)", padding:14, fontSize:11}}>
                      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
                        <div>
                          <div className="label">Input schema</div>
                          <div className="mono" style={{background:"#fff", padding:8, borderRadius:4, border:"1px solid var(--border)"}}>
                            {"{ user_id: uuid, dashboard_id: text, site_id: uuid, action: text }"}
                          </div>
                          <div className="label" style={{marginTop:8}}>Output schema</div>
                          <div className="mono" style={{background:"#fff", padding:8, borderRadius:4, border:"1px solid var(--border)"}}>
                            {"{ result: 'allow' | 'deny', reason: text }"}
                          </div>
                        </div>
                        <div>
                          <div className="label">Last evaluation (sample, PII redacted)</div>
                          <pre className="mono" style={{background:"#fff", padding:8, borderRadius:4, border:"1px solid var(--border)", fontSize:10, whiteSpace:"pre-wrap"}}>
{JSON.stringify({ user_id: "***hash***", dashboard_id: r.rule.replace("_v1",""), site_id: "***scoped***", action: "view" }, null, 2)}
                          </pre>
                          <div className="label" style={{marginTop:8}}>Recent audit (last 5)</div>
                          <table style={{fontSize:10, width:"100%"}}>
                            <thead><tr><th>Timestamp</th><th>User</th><th>Result</th></tr></thead>
                            <tbody>
                              {[1,2,3,4,5].map(i => (
                                <tr key={i}>
                                  <td className="mono">2026-04-21 14:{String(30-i).padStart(2,"0")}</td>
                                  <td className="mono">user_***{i}</td>
                                  <td><span className={"badge " + (i % 4 === 0 ? "badge-red" : "badge-green")} style={{fontSize:9}}>{i % 4 === 0 ? "deny" : "allow"}</span></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{marginTop:12}}>
        <div className="card-head">
          <h3 className="card-title">Eval Latency Trend — Last 7 Days</h3>
          <span className="muted" style={{fontSize:10}}>Alert: <span className="mono" style={{color:"var(--amber)"}}>&gt;50ms</span></span>
        </div>
        <ChartLine data={RPT_RU_LATENCY_TREND} xKey="d" yKey="avg" color="var(--blue)" target={50} h={200} yLabel="ms"/>
      </div>
    </>
  );
};

// ---------- RPT-SETTINGS ----------
const RptSettings = ({ role, onNav, openModal }) => {
  const [tab, setTab] = React.useState("general");
  if (role !== "Admin") {
    return (
      <>
        <div className="page-head"><div><h1 className="page-title">Reporting Settings</h1></div></div>
        <div className="alert-red alert-box" style={{fontSize:13}}><span>⚠</span><div>Reporting Settings is restricted to Reporting Administrators.</div></div>
      </>
    );
  }
  const tabs = [
    { k: "general",  label: "General" },
    { k: "export",   label: "Export Limits" },
    { k: "branding", label: "PDF Branding" },
    { k: "email",    label: "Email Delivery", p2: true },
    { k: "flags",    label: "Feature Flags" },
    { k: "sources",  label: "Data Sources" },
  ];
  const s = RPT_SETTINGS;

  return (
    <>
      <div className="page-head">
        <div>
          <DrillCrumb trail={[{label:"Reporting", key:"home"}, {label:"Settings"}]} onNav={onNav}/>
          <h1 className="page-title">Reporting Settings</h1>
        </div>
      </div>

      <div className="rpt-settings-layout">
        <div className="rpt-settings-tabs">
          {tabs.map(t => (
            <div key={t.k} className={"tab " + (tab === t.k ? "on" : "") + (t.p2 ? " p2" : "")} onClick={() => setTab(t.k)}>
              {t.label} {t.p2 && <span className="badge badge-gray" style={{fontSize:9, marginLeft:6}}>P2</span>}
            </div>
          ))}
        </div>

        <div>
          {tab === "general" && (
            <div className="card">
              <div className="card-head"><h3 className="card-title">General</h3></div>
              <div style={{padding:14}}>
                <div className="ff-inline">
                  <Field label="Default Timezone" required><select defaultValue={s.general.timezone}><option>Europe/London</option><option>UTC</option><option>America/New_York</option></select></Field>
                  <Field label="Default Week Selector"><select defaultValue={s.general.defaultWeek}><option value="current">Current Week</option><option value="previous">Previous Week</option></select></Field>
                </div>
                <div className="ff-inline">
                  <Field label="Row Limit Default" help="Range 100–10,000"><input type="number" defaultValue={s.general.rowLimitDefault}/></Field>
                  <Field label="Data Freshness Alert Threshold (min)" help="Show 'Data stale' badge when MV refresh is this many minutes overdue"><input type="number" defaultValue={s.general.freshnessAlertMin}/></Field>
                </div>
                <Field label="Chart Data Point Limit" help="Server-side aggregation kicks in above this"><input type="number" defaultValue={s.general.chartDataPointLimit}/></Field>
                <div className="row-flex" style={{marginTop:12}}>
                  <button className="btn btn-secondary btn-sm">Reset to defaults</button>
                  <span className="spacer"></span>
                  <button className="btn btn-primary btn-sm">Save changes</button>
                </div>
              </div>
            </div>
          )}

          {tab === "export" && (
            <div className="card">
              <div className="card-head"><h3 className="card-title">Export Limits</h3></div>
              <div style={{padding:14}}>
                <div className="ff-inline">
                  <Field label="Max CSV Rows"><input type="number" defaultValue={s.exportLimits.maxCsvRows}/></Field>
                  <Field label="Max PDF Rows" help="PDF generation times out above this; increase cautiously"><input type="number" defaultValue={s.exportLimits.maxPdfRows}/></Field>
                </div>
                <div className="ff-inline">
                  <Field label="Max File Size (MB)"><input type="number" defaultValue={s.exportLimits.maxFileSizeMb}/></Field>
                  <Field label="Rate Limit (per user / 10 sec)" help="V-RPT-EXPORT-6"><input type="number" defaultValue={s.exportLimits.exportRateLimit}/></Field>
                </div>
                <div className="row-flex" style={{marginTop:12}}>
                  <span className="spacer"></span>
                  <button className="btn btn-primary btn-sm">Save</button>
                </div>
              </div>
            </div>
          )}

          {tab === "branding" && (
            <div className="card">
              <div className="card-head"><h3 className="card-title">PDF Branding</h3></div>
              <div style={{padding:14}}>
                <Field label="Company Logo" help="PNG/JPG max 2MB"><input type="file" accept="image/png,image/jpeg"/></Field>
                <Field label="Report Header Text"><input defaultValue={s.pdfBranding.headerText}/></Field>
                <Field label="Report Footer Text" help="Variables: {n}, {N}"><input defaultValue={s.pdfBranding.footerText}/></Field>
                <div className="ff-inline">
                  <Field label="Color Scheme"><select defaultValue={s.pdfBranding.colorScheme}><option>Default Blue</option><option>Custom</option></select></Field>
                  <Field label="Primary Color"><input type="color" defaultValue={s.pdfBranding.primaryColor}/></Field>
                </div>
                <Field label="Include SHA-256 Fingerprint in Footer" help="Required for BRCGS regulatory audits">
                  <label style={{display:"flex", gap:6, alignItems:"center", fontSize:12}}><input type="checkbox" defaultChecked={s.pdfBranding.includeSha}/> Enabled</label>
                </Field>
                <div className="row-flex" style={{marginTop:12}}>
                  <button className="btn btn-secondary btn-sm">Preview PDF</button>
                  <span className="spacer"></span>
                  <button className="btn btn-primary btn-sm">Save</button>
                </div>
              </div>
            </div>
          )}

          {tab === "email" && (
            <div className="card">
              <div className="card-head"><h3 className="card-title">Email Delivery</h3></div>
              <div style={{padding:14}}>
                <div className="alert-blue alert-box" style={{fontSize:12, marginBottom:12}}>
                  <span>ⓘ</span>
                  <div>Email delivery requires the <span className="mono">reporting.scheduled_delivery</span> feature flag. Flag is currently <b className="fresh-ok">ON</b>.</div>
                </div>
                <Field label="Email Sender Identity" help="Managed in 02-SETTINGS §13 Resend"><input readOnly value="Apex MES &lt;mes@apexfoods.com&gt;" style={{background:"var(--gray-100)"}}/></Field>
                <Field label="Default Subject Template"><input defaultValue="{{report_name}} — {{period}}"/></Field>
                <Field label="Reply-To Address"><input type="email" defaultValue="ops@apexfoods.com"/></Field>
                <Field label="Include Unsubscribe Link"><label style={{fontSize:12}}><input type="checkbox" defaultChecked/> Enabled</label></Field>
                <div className="row-flex" style={{marginTop:12}}>
                  <span className="spacer"></span>
                  <button className="btn btn-primary btn-sm">Save</button>
                </div>
              </div>
            </div>
          )}

          {tab === "flags" && (
            <div className="card">
              <div className="card-head">
                <h3 className="card-title">Feature Flags</h3>
                <span className="muted" style={{fontSize:11}}>Managed in PostHog (02-SETTINGS §10)</span>
              </div>
              <table>
                <thead><tr><th>Flag Name</th><th>Current State</th><th>Description</th><th>Set in</th><th></th></tr></thead>
                <tbody>
                  {RPT_FLAGS.map(f => (
                    <tr key={f.flag}>
                      <td className="mono" style={{fontSize:11, fontWeight:600}}>{f.flag}</td>
                      <td><span className={"badge " + (f.state === "on" ? "badge-green" : "badge-gray")} style={{fontSize:10}}>{f.state.toUpperCase()}</span></td>
                      <td style={{fontSize:11, color:"var(--muted)"}}>{f.desc}</td>
                      <td style={{fontSize:11}}>{f.setAt}</td>
                      <td><a className="drill-arrow">Manage in PostHog →</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{padding:"6px 14px", fontSize:11, color:"var(--muted)"}}>Changes take effect within 60 seconds.</div>
            </div>
          )}

          {tab === "sources" && (
            <div className="card">
              <div className="card-head"><h3 className="card-title">Data Sources (Materialized Views)</h3></div>
              <table>
                <thead><tr>
                  <th>View</th><th>Source Tables</th><th>Cadence</th><th>Last Refresh</th>
                  <th style={{textAlign:"right"}}>Duration</th>
                  <th style={{textAlign:"right"}}>Rows</th>
                  <th>Status</th><th></th>
                </tr></thead>
                <tbody>
                  {RPT_DATA_SOURCES.map(v => (
                    <tr key={v.view}>
                      <td className="mono" style={{fontSize:11, fontWeight:600}}>{v.view}</td>
                      <td style={{fontSize:11, color:"var(--muted)"}}>{v.tables}</td>
                      <td style={{fontSize:11}}>{v.cadence}</td>
                      <td className="mono" style={{fontSize:11, color: v.status === "stale" ? "var(--amber)" : "var(--text)"}}>{v.lastRefresh}</td>
                      <td className="num mono" style={{color: v.duration > 30000 ? "var(--red)" : v.duration > 10000 ? "var(--amber)" : "var(--text)"}}>{(v.duration / 1000).toFixed(1)}s</td>
                      <td className="num mono">{v.rows.toLocaleString()}</td>
                      <td><span className={"badge " + (v.status === "healthy" ? "badge-green" : v.status === "stale" ? "badge-amber" : "badge-red")} style={{fontSize:10}}>{v.status}</span></td>
                      <td><button className="btn btn-sm btn-secondary" onClick={() => openModal("refreshConfirm", { view: v.view })}>Force Refresh</button></td>
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

Object.assign(window, { RptIntegrationHealth, RptRulesUsage, RptSettings });
