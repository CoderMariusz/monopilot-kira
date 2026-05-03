// ============ FIN-011 Reports, FIN-016 D365, Finance Settings, P2 placeholders ============

// ---------- FIN-011 Cost Reporting Suite ----------
const FinReports = ({ onNav, openModal }) => {
  const [tab, setTab] = React.useState("saved");
  const [reportType, setReportType] = React.useState("Cost by Product");

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Finance</a> · Reports</div>
          <h1 className="page-title">Cost Reports</h1>
          <div className="muted" style={{fontSize:12}}>{FIN_REPORTS.length} reports · {FIN_REPORTS.filter(r=>r.system).length} system · {FIN_REPORTS.filter(r=>!r.system).length} custom</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-primary btn-sm" onClick={()=>setTab("custom")}>＋ Create Report</button>
        </div>
      </div>

      <div className="rep-tabs">
        <button className={tab === "saved" ? "on" : ""} onClick={()=>setTab("saved")}>Saved Reports <span className="count">{FIN_REPORTS.length}</span></button>
        <button className={tab === "custom" ? "on" : ""} onClick={()=>setTab("custom")}>Run Custom Report</button>
        <button className={tab === "queue" ? "on" : ""} onClick={()=>setTab("queue")}>Export Queue <span className="count">{FIN_EXPORT_QUEUE.length}</span></button>
      </div>

      {tab === "saved" && (
        <div className="rep-grid">
          {FIN_REPORTS.map(r => (
            <div key={r.id} className="rep-card">
              <div className="row-flex">
                <span className="rc-title">{r.name}</span>
                <span className="spacer"/>
                {r.system && <span className="badge badge-gray" style={{fontSize:9}}>System</span>}
              </div>
              <div className="rc-desc">{r.desc}</div>
              <div className="rc-meta">
                <span>Last run: {r.lastRun}</span>
                <span>{r.freq}</span>
              </div>
              <div className="row-flex" style={{marginTop:4}}>
                <button className="btn btn-primary btn-sm" onClick={()=>openModal("exportReport", r)}>Run Now</button>
                <span className="spacer"/>
                <button className="btn btn-ghost btn-sm">⋯</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "custom" && (
        <div style={{display:"grid", gridTemplateColumns:"360px 1fr", gap:14}}>
          <div className="card">
            <div className="card-head"><h3 className="card-title">Report Builder</h3></div>
            <Field label="Report Name" required><input placeholder="e.g. Q2 Variance Deep-Dive"/></Field>
            <Field label="Description"><textarea placeholder="For CFO monthly review..."/></Field>
            <Field label="Report Type" required>
              <select value={reportType} onChange={e=>setReportType(e.target.value)}>
                <option>Cost by Product</option>
                <option>Cost by Period</option>
                <option>Variance Summary</option>
                <option>Inventory Valuation</option>
                <option>D365 Export Audit</option>
                <option>Raw WO Costs</option>
              </select>
            </Field>
            <div className="ff-inline">
              <Field label="Date From" required><input type="date" defaultValue="2026-04-01"/></Field>
              <Field label="Date To" required><input type="date" defaultValue="2026-04-30"/></Field>
            </div>
            <Field label="Preset"><select><option>Custom</option><option>MTD</option><option>Last Month</option><option>QTD</option><option>YTD</option></select></Field>
            <Field label="Filters">
              <div style={{fontSize:12, padding:"6px 0"}}>
                <label><input type="checkbox" defaultChecked/> All cost centers</label><br/>
                <label><input type="checkbox" defaultChecked/> All production lines</label><br/>
                <label><input type="checkbox"/> Variance &gt; 5% only</label>
              </div>
            </Field>
            <Field label="Group By"><select><option>Product</option><option>Period</option><option>Cost Center</option><option>Line</option></select></Field>
            <div style={{display:"flex", gap:6, marginTop:14}}>
              <button className="btn btn-secondary btn-sm">Run Preview</button>
              <button className="btn btn-primary btn-sm" onClick={()=>openModal("exportReport", { name: "Custom Report" })}>Run &amp; Export CSV</button>
              <button className="btn btn-ghost btn-sm">Save as Report</button>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h3 className="card-title">Preview — {reportType}</h3>
              <span className="muted" style={{fontSize:11}}>Showing first 25 of 142 rows</span>
            </div>
            <table>
              <thead><tr><th>Product</th><th style={{textAlign:"right"}}>Std Cost</th><th style={{textAlign:"right"}}>Actual</th><th style={{textAlign:"right"}}>Variance</th><th>WO Count</th></tr></thead>
              <tbody>
                {FIN_WOS.slice(0, 10).map(r => (
                  <tr key={r.wo}>
                    <td style={{fontSize:12}}>{r.product}</td>
                    <td className="money">{fmtMoney(r.stdCost)}</td>
                    <td className="money">{fmtMoney(r.actual)}</td>
                    <td className="money"><span className={r.variance > 0 ? "neg" : "pos"}>{fmtMoneySigned(r.variance)}</span></td>
                    <td className="num mono">1</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{padding:"10px 14px", fontSize:11, color:"var(--muted)"}}>
              <a style={{color:"var(--blue)", cursor:"pointer"}}>View All (142 rows) →</a>
              <span style={{marginLeft:14}}>Total variance: <b className="money neg">{fmtMoney(12340.00)}</b></span>
            </div>
          </div>
        </div>
      )}

      {tab === "queue" && (
        <div className="card" style={{padding:0}}>
          <table>
            <thead><tr><th>Export ID</th><th>Report Name</th><th>Requested By</th><th>Format</th><th>Status</th><th>Created At</th><th style={{width:160}}></th></tr></thead>
            <tbody>
              {FIN_EXPORT_QUEUE.map(e => (
                <tr key={e.id}>
                  <td className="mono" style={{fontSize:11, fontWeight:600}}>{e.id}</td>
                  <td style={{fontSize:12}}>{e.name}</td>
                  <td style={{fontSize:12}}>{e.reqBy}</td>
                  <td><span className="badge badge-gray" style={{fontSize:9}}>{e.fmt}</span></td>
                  <td>
                    <span className={"badge " + (e.status === "complete" ? "badge-green" : e.status === "processing" ? "badge-blue" : e.status === "failed" ? "badge-red" : "badge-gray")} style={{fontSize:9}}>{e.status}</span>
                  </td>
                  <td className="mono" style={{fontSize:11}}>{e.createdAt}</td>
                  <td>
                    {e.status === "complete" && <button className="btn btn-secondary btn-sm">↓ Download</button>}
                    {e.status === "failed" && <button className="btn btn-secondary btn-sm">↻ Retry</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{padding:"10px 14px", fontSize:11, color:"var(--muted)", borderTop:"1px solid var(--border)"}}>Auto-refreshes every 30s.</div>
        </div>
      )}
    </>
  );
};

// ---------- FIN-016 D365 Integration ----------
const FinD365 = ({ role, onNav, openModal }) => {
  const [tab, setTab] = React.useState("batches");
  const d = FIN_D365;
  const isManager = role === "Finance Manager" || role === "Admin";

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Finance</a> · D365 F&amp;O Integration</div>
          <h1 className="page-title">D365 F&amp;O Integration</h1>
          <div className="muted" style={{fontSize:12}}>Last sync: 2 minutes ago · Instance {d.instance} · dataAreaId {d.dataAreaId}</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-primary btn-sm">↻ Sync Now</button>
        </div>
      </div>

      {/* DLQ alert */}
      {d.summary.dlqOpen > 0 && (
        <div className="alert-amber alert-box" style={{marginBottom:10, fontSize:12, padding:"8px 12px"}}>
          <span>⚠</span>
          <div>{d.summary.dlqOpen} items in the D365 Dead Letter Queue require manual resolution. Posting may be incomplete for the affected WOs.</div>
          <div className="alert-cta">
            <button className="btn btn-sm btn-primary" onClick={()=>setTab("dlq")}>View DLQ →</button>
          </div>
        </div>
      )}

      {/* Connection Status card */}
      <div className="card">
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, alignItems:"center"}}>
          <div>
            <div className="conn-status" style={{background: d.connected ? "var(--green-050a)" : "var(--red-050a)", color: d.connected ? "var(--green-700)" : "var(--red-700)"}}>
              <span className={"conn-dot " + (d.connected ? "on" : "off")}></span>
              {d.connected ? "Connected" : "Disconnected"}
            </div>
            <div style={{marginTop:10, fontSize:12}}>
              <div className="row-flex" style={{marginBottom:4}}><b style={{width:150}}>Environment:</b> <span className="badge badge-blue">{d.env}</span></div>
              <div className="row-flex" style={{marginBottom:4}}><b style={{width:150}}>D365 Instance:</b> <span className="mono">{d.instance}</span></div>
              <div className="row-flex" style={{marginBottom:4}}><b style={{width:150}}>dataAreaId:</b> <span className="mono">{d.dataAreaId}</span></div>
              <div className="row-flex" style={{marginBottom:4}}><b style={{width:150}}>Warehouse:</b> <span className="mono">{d.warehouse}</span></div>
              <div className="row-flex" style={{marginBottom:4}}><b style={{width:150}}>Consolidation Cutoff:</b> <span className="mono">{d.cutoff}</span></div>
            </div>
          </div>
          <div>
            <div style={{fontSize:12}}>
              <div className="row-flex" style={{marginBottom:4}}><b style={{width:160}}>Uptime (30d):</b> <span className="money" style={{color:"var(--green-700)"}}>{d.uptime}</span></div>
              <div className="row-flex" style={{marginBottom:4}}><b style={{width:160}}>Last successful post:</b> <span className="mono">{d.lastPost}</span></div>
            </div>
            <div className="row-flex" style={{marginTop:12}}>
              <button className="btn btn-secondary btn-sm">Test Connection</button>
              <button className="btn btn-secondary btn-sm">⚙ Configure</button>
            </div>
          </div>
        </div>
      </div>

      {/* Sync Summary KPIs */}
      <div style={{display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:10, marginBottom:12}}>
        <div className="kpi amber">
          <div className="kpi-label">WO Cost Events (pending)</div>
          <div className="kpi-value">{d.summary.pending}</div>
          <div className="kpi-sub">Next batch in 4h 12m</div>
        </div>
        <div className="kpi green">
          <div className="kpi-label">Daily Batches (30d)</div>
          <div className="kpi-value">{d.summary.batchesLast30d}</div>
          <div className="kpi-sub">Delivered</div>
        </div>
        <div className="kpi blue">
          <div className="kpi-label">D365 Journal Lines (last)</div>
          <div className="kpi-value">{d.summary.linesLast}</div>
          <div className="kpi-sub">{fmtMoney(48320.50, true)}</div>
        </div>
        <div className={"kpi " + (d.summary.dlqOpen > 0 ? "red" : "green")}>
          <div className="kpi-label">DLQ Open</div>
          <div className="kpi-value">{d.summary.dlqOpen}</div>
          <div className="kpi-sub">{d.summary.dlqOpen > 0 ? "Requires attention" : "All clear"}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs-bar">
        <button className={"tab-btn " + (tab === "batches" ? "on" : "")} onClick={()=>setTab("batches")}>Daily Batches <span className="count">{FIN_D365_BATCHES.length}</span></button>
        <button className={"tab-btn " + (tab === "outbox" ? "on" : "")} onClick={()=>setTab("outbox")}>Outbox Queue <span className="count">{FIN_D365_OUTBOX.length}</span></button>
        <button className={"tab-btn " + (tab === "dlq" ? "on" : "")} onClick={()=>setTab("dlq")}>DLQ <span className="count">{FIN_D365_DLQ.length}</span></button>
        <button className={"tab-btn " + (tab === "gl" ? "on" : "")} onClick={()=>setTab("gl")}>GL Mapping <span className="count">{FIN_D365_GL_MAPPING.length}</span></button>
        <button className={"tab-btn " + (tab === "settings" ? "on" : "")} onClick={()=>setTab("settings")}>Settings</button>
      </div>

      {/* Daily Batches */}
      {tab === "batches" && (
        <div className="card" style={{padding:0}}>
          <table>
            <thead><tr><th>Batch Date</th><th>Batch ID</th><th>Status</th><th style={{textAlign:"right"}}>Lines</th><th style={{textAlign:"right"}}>Total Debit GBP</th><th>D365 Journal ID</th><th>Posted At</th><th>Reconciled</th></tr></thead>
            <tbody>
              {FIN_D365_BATCHES.map(b => (
                <tr key={b.id}>
                  <td className="mono">{b.date}</td>
                  <td className="mono" style={{fontSize:11, fontWeight:600}}>{b.id}</td>
                  <td><D365BatchStatus s={b.status}/></td>
                  <td className="num mono">{b.lines}</td>
                  <td className="money">{fmtMoney(b.totalDr)}</td>
                  <td className="mono" style={{fontSize:11, color: b.journal ? "var(--blue)" : "var(--muted)"}}>{b.journal || "—"}</td>
                  <td className="mono" style={{fontSize:11}}>{b.postedAt || "—"}</td>
                  <td>{b.reconciled ? "✓" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Outbox */}
      {tab === "outbox" && (
        <div className="card" style={{padding:0}}>
          <table>
            <thead><tr><th>Event ID</th><th>Event Type</th><th>WO Ref</th><th>Status</th><th>Attempts</th><th>Next Retry</th><th>Last Error</th><th>Enqueued At</th></tr></thead>
            <tbody>
              {FIN_D365_OUTBOX.map(e => (
                <tr key={e.id}>
                  <td className="mono" style={{fontSize:11, fontWeight:600}}>{e.id}</td>
                  <td><span className={"badge " + (e.type.includes("closed") ? "badge-blue" : e.type.includes("ready") ? "badge-green" : "badge-amber")} style={{fontSize:9, fontFamily:"var(--font-mono)"}}>{e.type}</span></td>
                  <td className="mono" style={{color:"var(--blue)", fontSize:11}}>{e.wo}</td>
                  <td><D365OutboxStatus s={e.status}/></td>
                  <td className="mono" style={{fontSize:11}}>{e.attempts}</td>
                  <td className="mono" style={{fontSize:11}}>{e.nextRetry}</td>
                  <td style={{fontSize:11, color:"var(--red-700)", maxWidth:260, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{e.lastError || "—"}</td>
                  <td className="mono" style={{fontSize:11}}>{e.enqueuedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{padding:"10px 14px", fontSize:11, color:"var(--muted)", borderTop:"1px solid var(--border)"}}>
            6-attempt schedule: immediate → +5m → +30m → +2h → +12h → +24h → DLQ
          </div>
        </div>
      )}

      {/* DLQ */}
      {tab === "dlq" && (
        <>
          {FIN_D365_DLQ.length === 0 && (
            <div className="empty-panel">
              <div className="ep-ic" style={{color:"var(--green)"}}>✓</div>
              <div className="ep-head">DLQ is empty</div>
              <div className="ep-body">All events delivered successfully. The D365 integration is healthy.</div>
            </div>
          )}
          {FIN_D365_DLQ.length > 0 && (
            <div className="card" style={{padding:0}}>
              <table>
                <thead><tr><th>DLQ ID</th><th>Source Event</th><th>Type</th><th>Category</th><th>Error</th><th>Attempts</th><th>Moved At</th><th style={{width:170}}>Actions</th></tr></thead>
                <tbody>
                  {FIN_D365_DLQ.map(r => (
                    <tr key={r.id} className={r.category === "permanent" ? "dlq-row-permanent" : ""}>
                      <td className="mono" style={{fontSize:11, fontWeight:600}}>{r.id}</td>
                      <td className="mono" style={{fontSize:11, color:"var(--blue)"}}>{r.sourceEv}</td>
                      <td><span className="badge badge-gray" style={{fontSize:9, fontFamily:"var(--font-mono)"}}>{r.type}</span></td>
                      <td><DlqCategoryBadge c={r.category}/></td>
                      <td style={{fontSize:11, maxWidth:300}}>{r.error}</td>
                      <td className="mono" style={{fontSize:11}}>{r.attempts}</td>
                      <td className="mono" style={{fontSize:11}}>{r.movedAt}</td>
                      <td>
                        <div className="row-flex">
                          {isManager && <button className="btn btn-primary btn-sm" onClick={()=>openModal("dlqReplay", r)}>Replay</button>}
                          {isManager && <button className="btn btn-secondary btn-sm" onClick={()=>openModal("dlqResolve", r)}>Resolve</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* GL Mapping — preview + link to standalone FIN-007 page per PRD §8.1 */}
      {tab === "gl" && (
        <>
          <div className="alert-blue alert-box" style={{marginBottom:10, fontSize:12, padding:"8px 12px"}}>
            <span>ⓘ</span>
            <div style={{flex:1}}>
              GL Account Mappings have their own admin page per PRD FIN-007 (standalone route <span className="mono">/finance/gl-mappings</span>). This tab shows a read-only preview.
            </div>
            <div className="alert-cta">
              <button className="btn btn-sm btn-primary" onClick={()=>onNav("gl_mappings")}>Open GL Mappings →</button>
            </div>
          </div>
          <div className="card" style={{padding:0}}>
            <div className="card-head" style={{padding:"12px 14px", marginBottom:0, borderBottom:"1px solid var(--border)"}}>
              <h3 className="card-title">GL Account Mappings (read-only preview)</h3>
              <a style={{fontSize:12, color:"var(--blue)", cursor:"pointer"}} onClick={()=>onNav("gl_mappings")}>Manage mappings →</a>
            </div>
            <table>
              <thead><tr><th>Cost Category</th><th>D365 Account Code</th><th>Offset Account</th><th>Journal Name</th><th>Last Updated</th><th>Updated By</th></tr></thead>
              <tbody>
                {FIN_D365_GL_MAPPING.map(m => (
                  <tr key={m.cat}>
                    <td style={{fontSize:12, fontWeight:500}}>{m.cat}</td>
                    <td className="mono" style={{fontSize:11}}>{m.dAccount}</td>
                    <td className="mono" style={{fontSize:11}}>{m.offset}</td>
                    <td><span className="badge badge-gray" style={{fontSize:9}}>{m.journal}</span></td>
                    <td className="mono" style={{fontSize:11}}>{m.updatedAt}</td>
                    <td style={{fontSize:11}}>{m.updatedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "settings" && (
        <div className="card">
          <Field label="D365 Integration Enabled"><label><input type="checkbox" defaultChecked/> Integration is active</label></Field>
          <Field label="Consolidation Cutoff Time" help="All WO cost events accumulated by this time are included in the daily journal batch"><input type="time" defaultValue="23:00" style={{width:120}}/></Field>
          <Field label="Feature Flag (PostHog)"><div className="mono" style={{background:"var(--gray-050)", padding:"6px 10px", borderRadius:4, fontSize:11}}>integration.d365.finance_posting.enabled · enabled</div></Field>
          <div className="muted" style={{fontSize:11, marginTop:10}}>Reconciliation schedule: Daily at 03:00 UTC (cutoff + 4h) to verify D365 line counts against outbox.</div>
        </div>
      )}
    </>
  );
};

// ---------- FIN-007 GL Account Mappings (standalone) ----------
// Audit-4 finding A10 / B5 — PRD §8.1 + UX route map require FIN-007 to
// be a standalone admin page at `/finance/gl-mappings`. Prior prototype
// embedded this as a tab inside FinD365 (IA drift). This component is
// the standalone page; D365 tab now shows a read-only preview + link.
const FinGlMappings = ({ role, onNav, openModal }) => {
  const [search, setSearch] = React.useState("");
  const [journalFilter, setJournalFilter] = React.useState("all");
  const isManager = role === "Finance Manager" || role === "Admin";

  const journals = Array.from(new Set(FIN_D365_GL_MAPPING.map(m => m.journal))).sort();
  const visible = FIN_D365_GL_MAPPING.filter(m =>
    (journalFilter === "all" || m.journal === journalFilter) &&
    (!search ||
      m.cat.toLowerCase().includes(search.toLowerCase()) ||
      m.dAccount.toLowerCase().includes(search.toLowerCase()) ||
      m.offset.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb">
            <a onClick={()=>onNav("dashboard")}>Finance</a> · GL Account Mappings
          </div>
          <h1 className="page-title">GL Account Mappings</h1>
          <div className="muted" style={{fontSize:12}}>
            FIN-007 · Cost category → D365 F&amp;O GL account mapping · {FIN_D365_GL_MAPPING.length} mappings · {journals.length} journals
          </div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm" onClick={()=>onNav("d365")}>← Back to D365</button>
          {isManager && <button className="btn btn-primary btn-sm" onClick={()=>openModal("costCenter")}>＋ New Mapping</button>}
        </div>
      </div>

      <div className="alert-blue alert-box" style={{marginBottom:10, fontSize:12, padding:"8px 12px"}}>
        <span>ⓘ</span>
        <div style={{flex:1}}>
          Mappings control how WO cost categories (Material / Labor / Overhead / Waste) post to D365 General Ledger accounts. Changes take effect from the next daily consolidation batch (23:00 UTC cutoff).
        </div>
      </div>

      <div className="filter-bar">
        <input type="text" placeholder="Search category, account, offset…" value={search} onChange={e=>setSearch(e.target.value)} style={{width:280}}/>
        <select value={journalFilter} onChange={e=>setJournalFilter(e.target.value)} style={{width:200}}>
          <option value="all">All journals</option>
          {journals.map(j => <option key={j} value={j}>{j}</option>)}
        </select>
        <span className="spacer"></span>
        <button className="clear-all" onClick={()=>{ setSearch(""); setJournalFilter("all"); }}>Clear</button>
      </div>

      <div className="card" style={{padding:0}}>
        <div className="card-head" style={{padding:"12px 14px", marginBottom:0, borderBottom:"1px solid var(--border)"}}>
          <h3 className="card-title">Mappings ({visible.length})</h3>
          <div className="muted" style={{fontSize:11}}>dataAreaId: FNOR · warehouse: ApexDG</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Cost Category</th>
              <th>D365 Account Code</th>
              <th>Offset Account</th>
              <th>Journal Name</th>
              <th>Last Updated</th>
              <th>Updated By</th>
              <th style={{width:140}}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(m => (
              <tr key={m.cat}>
                <td style={{fontSize:12, fontWeight:500}}>{m.cat}</td>
                <td className="mono" style={{fontSize:11, color:"var(--blue)"}}>{m.dAccount}</td>
                <td className="mono" style={{fontSize:11}}>{m.offset}</td>
                <td><span className="badge badge-gray" style={{fontSize:9}}>{m.journal}</span></td>
                <td className="mono" style={{fontSize:11}}>{m.updatedAt}</td>
                <td style={{fontSize:11}}>{m.updatedBy}</td>
                <td>
                  {isManager && <button className="btn btn-ghost btn-sm" onClick={()=>openModal("costCenter", m)}>Edit</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <div className="empty-panel">
            <div className="ep-ic">▤</div>
            <div className="ep-head">No mappings match the current filters.</div>
            <div className="ep-body">Try widening the filters or clear them to see all mappings.</div>
            <div className="ep-ctas">
              <button className="btn btn-secondary btn-sm" onClick={()=>{ setSearch(""); setJournalFilter("all"); }}>Clear Filters</button>
            </div>
          </div>
        )}
      </div>

      <div className="muted" style={{fontSize:11, marginTop:10}}>
        Per 21 CFR Part 11, GL mapping changes are logged in the audit trail. Mapping edits do not retroactively re-post already-delivered D365 journals.
      </div>
    </>
  );
};

// ---------- Finance Settings ----------
const FinSettings = ({ onNav, openModal }) => {
  const [dirty, setDirty] = React.useState(false);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Finance</a> · Settings</div>
          <h1 className="page-title">Finance Settings</h1>
          <div className="muted" style={{fontSize:12}}>Configure cost policy, overhead allocation, fiscal calendar, D365 integration</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm">↻ Reset to Defaults</button>
          <button className="btn btn-primary btn-sm" disabled={!dirty}>Save Settings</button>
        </div>
      </div>

      {dirty && (
        <div className="sticky-save">
          <span>⚠</span> You have unsaved changes. Remember to save.
          <span className="spacer"/>
          <button className="btn btn-primary btn-sm" onClick={()=>setDirty(false)}>Save Now</button>
        </div>
      )}

      {/* Section 1 — General */}
      <div className="card">
        <div className="card-head"><h3 className="card-title">1. General</h3></div>
        <Field label="Default Valuation Method" help="Changing this does not revalue existing inventory. New transactions will use the selected method.">
          <div className="row-flex">
            <label><input type="radio" name="val" defaultChecked onChange={()=>setDirty(true)}/> FIFO</label>
            <label><input type="radio" name="val" onChange={()=>setDirty(true)}/> WAC</label>
          </div>
        </Field>
        <Field label="Default Currency">
          <div style={{padding:"7px 10px", background:"var(--gray-050)", borderRadius:4, fontSize:13}}>
            <b className="mono">GBP</b> — British Pound Sterling (base currency) · <a style={{color:"var(--blue)", cursor:"pointer"}} onClick={()=>onNav("fx")}>Manage Currencies →</a>
          </div>
        </Field>
        <Field label="Variance Calculation Enabled"><label><input type="checkbox" defaultChecked onChange={()=>setDirty(true)}/> Variance tracking active</label></Field>
      </div>

      {/* Section 2 — Standard Cost Policy */}
      <div className="card">
        <div className="card-head"><h3 className="card-title">2. Standard Cost Policy</h3></div>
        <Field label="Critical Approval PIN Required" help="Required for 21 CFR Part 11 compliance."><label><input type="checkbox" defaultChecked onChange={()=>setDirty(true)}/> PIN required for e-signature approvals</label></Field>
        <Field label="Standard Cost Effective Date Policy"><select onChange={()=>setDirty(true)}><option>Future date only (default)</option><option>Allow current date</option><option>Allow backdating (audit warning)</option></select></Field>
        <Field label="Cost Basis Default"><select onChange={()=>setDirty(true)}><option>Quoted</option><option>Historical</option><option>Calculated</option><option>Imported D365</option></select></Field>
        <Field label="Cost Change Warning Threshold %" help="Warning shown when new cost differs from previous approved by more than this %. Dual sign-off enforced in Phase 2."><input type="number" defaultValue="20" onChange={()=>setDirty(true)} style={{width:100}}/></Field>
      </div>

      {/* Section 3 — Variance Display Thresholds */}
      <div className="card">
        <div className="card-head"><h3 className="card-title">3. Variance Display Thresholds</h3></div>
        <div className="muted" style={{fontSize:11, marginBottom:10}}>Full configurable alert engine available in Phase 2 — EPIC 10-O. These thresholds control colour-coding.</div>
        <div className="ff-inline">
          <Field label="On Track threshold (≤ %)"><input type="number" defaultValue="5" onChange={()=>setDirty(true)}/></Field>
          <Field label="Warning threshold (%)"><input type="number" defaultValue="10" onChange={()=>setDirty(true)}/></Field>
        </div>
        <Field label="Critical threshold (≥ %)"><input type="number" defaultValue="10" readOnly style={{background:"var(--gray-100)", width:100}}/></Field>
      </div>

      {/* Section 4 — Overhead Allocation */}
      <div className="card">
        <div className="card-head"><h3 className="card-title">4. Overhead Allocation</h3></div>
        <Field label="Default Allocation Basis"><select onChange={()=>setDirty(true)}><option>Labor Hours</option><option>Machine Hours</option><option>Units Produced</option></select></Field>
        <Field label="Default Overhead Rate (%)" help="Override per cost center is available via GL Mapping configuration."><input type="number" defaultValue="50" onChange={()=>setDirty(true)} style={{width:100}}/></Field>
      </div>

      {/* Section 5 — Fiscal Calendar */}
      <div className="card">
        <div className="card-head"><h3 className="card-title">5. Fiscal Calendar</h3></div>
        <div className="ff-inline">
          <Field label="Calendar Type"><select onChange={()=>setDirty(true)}><option>Standard (Gregorian)</option><option>4-4-5</option><option>4-5-4</option></select></Field>
          <Field label="Fiscal Year Start Month"><select onChange={()=>setDirty(true)}>{["January","February","March","April","May","June","July","August","September","October","November","December"].map(m => <option key={m}>{m}</option>)}</select></Field>
        </div>
        <div className="muted" style={{fontSize:11}}>Fiscal calendar affects period-end variance calculations and budget allocation (Phase 2).</div>
      </div>

      {/* Section 6 — D365 Integration */}
      <div className="card">
        <div className="card-head"><h3 className="card-title">6. D365 Integration</h3></div>
        <Field label="D365 Integration Enabled" help="Enable only after go-live validation. Feature flag also required."><label><input type="checkbox" defaultChecked onChange={()=>setDirty(true)}/> D365 F&amp;O posting active</label></Field>
        <Field label="Consolidation Cutoff Time"><input type="time" defaultValue="23:00" onChange={()=>setDirty(true)} style={{width:120}}/></Field>
        <Field label="Reconciliation Schedule"><input value="Daily at 03:00 UTC (cutoff + 4h)" readOnly style={{background:"var(--gray-100)"}}/></Field>
      </div>

      {/* Section 7 — Period lock (P2 teaser) */}
      <div className="card">
        <div className="card-head"><h3 className="card-title">7. Fiscal Period Lock <span className="badge badge-gray" style={{fontSize:9, marginLeft:6}}>Phase 2</span></h3></div>
        <div className="muted" style={{fontSize:12}}>Locking a fiscal period prevents new cost records from being created or modified for that period.</div>
        {/* TUNING-PATTERN.md §3.6 — Close period fans out to multiple variances
            across lines (multi-object). DryRun button shows per-line impact
            preview before the destructive commit in PeriodLockModal. */}
        <div className="row-flex" style={{marginTop:10, gap:8}}>
          <DryRunButton onClick={()=>openModal("periodLock", { dryRun: true })}
            label="Preview variance impact"
            title="Show the list of open WOs, pending postings and variances affected by closing this period before committing."/>
          <button className="btn btn-danger btn-sm" onClick={()=>openModal("periodLock")}>Lock Period</button>
        </div>
      </div>
    </>
  );
};

// ---------- P2 Placeholders ----------
const FinBomCosting   = ({ onNav }) => <ScaffoldedScreen breadcrumb={<span><a onClick={()=>onNav("dashboard")}>Finance</a> · BOM Costing</span>} title="BOM Costing" spec="FIN-004" phase="Phase 2 — EPIC 10-G" notes="Roll-up BOM cost: item × BOM version × cost_per_kg → FA unit cost. Allocation across co-products. Version comparison."/>;

const FinSimulation   = ({ onNav }) => <ScaffoldedScreen breadcrumb={<span><a onClick={()=>onNav("dashboard")}>Finance</a> · Simulation</span>} title="BOM Cost Simulation" spec="FIN-012" phase="Phase 2 — EPIC 10-G" notes="What-if analysis: change input prices or production mix, recompute FA unit cost and margin preview, save scenario for comparison."/>;

const FinVarRealtime  = ({ onNav }) => <ScaffoldedScreen breadcrumb={<span><a onClick={()=>onNav("dashboard")}>Finance</a> · Variance · Real-time</span>} title="Real-time Variance Dashboard" spec="FIN-009" phase="Phase 2 — EPIC 10-O" notes="Live tiles updating as WOs post consumption and labor. Configurable alert thresholds."/>;

const FinMargin       = ({ onNav }) => <ScaffoldedScreen breadcrumb={<span><a onClick={()=>onNav("dashboard")}>Finance</a> · Margin Analysis</span>} title="Margin Analysis" spec="FIN-013" phase="Phase 2 — EPIC 10-G + Sales" notes="Product-level margin %, trend charts, ranking by customer and period. Available when sales price data is connected."/>;

const FinBudgets      = ({ onNav }) => <ScaffoldedScreen breadcrumb={<span><a onClick={()=>onNav("dashboard")}>Finance</a> · Budgets</span>} title="Budget Management" spec="FIN-015" phase="Phase 2 — EPIC 10-F" notes="Create annual budget, allocate to periods, approval workflow. Per-cost-center budget vs actual tracking."/>;

Object.assign(window, { FinReports, FinD365, FinGlMappings, FinSettings, FinBomCosting, FinSimulation, FinVarRealtime, FinMargin, FinBudgets });
