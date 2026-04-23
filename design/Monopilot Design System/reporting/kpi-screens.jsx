// ============ Reporting — Operational dashboards (RPT-004 … RPT-008) ============

// ---------- RPT-004 QC Holds ----------
// Cross-module link: QH-20260420-003 → /quality/holds/:id
const RptQcHolds = ({ role, onNav, openModal }) => {
  const [date, setDate] = React.useState("2026-04-21");
  const [shift, setShift] = React.useState("All");
  const [line, setLine] = React.useState("All");

  const visible = RPT_QC_HOLDS.filter(h =>
    (shift === "All" || h.shift === shift) &&
    (line === "All" || h.line === line)
  );
  const critical = visible.filter(h => h.severity === "critical");
  const amRows = visible.filter(h => h.shift === "AM");
  const pmRows = visible.filter(h => h.shift === "PM");

  const totals = (rows) => rows.reduce((a, r) => ({
    held: a.held + r.boxesHeld,
    rej:  a.rej  + r.rejected,
    hr:   a.hr   + r.labourHr,
  }), { held: 0, rej: 0, hr: 0 });

  return (
    <>
      <div className="page-head">
        <div>
          <DrillCrumb trail={[{label:"Reporting", key:"home"}, {label:"QC Holds"}]} onNav={onNav}/>
          <div className="row-flex" style={{alignItems:"center", gap:10}}>
            <h1 className="page-title">QC Holds</h1>
            <ScopePill site="Main Site"/>
          </div>
        </div>
        <div className="row-flex">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{fontSize:12, padding:"4px 8px"}}/>
          <select value={shift} onChange={e => setShift(e.target.value)} style={{fontSize:12, padding:"4px 8px"}}>
            <option>All</option><option>AM</option><option>PM</option>
          </select>
          <select value={line} onChange={e => setLine(e.target.value)} style={{fontSize:12, padding:"4px 8px"}}>
            <option>All</option><option>Line 1</option><option>Line 2</option><option>Line 3</option><option>Line 4</option><option>Line 5</option>
          </select>
          <ExportDropdown openModal={openModal} dashboard="QC Holds"/>
        </div>
      </div>

      <FreshnessStrip at="14:30" cadence="5 min"/>

      <FilterChips
        chips={[
          shift !== "All" ? { k: "shift", label: "Shift", value: shift } : null,
          line !== "All" ? { k: "line", label: "Line", value: line } : null,
        ].filter(Boolean)}
        onRemove={(k) => { if (k==="shift") setShift("All"); if (k==="line") setLine("All"); }}
        onClearAll={() => { setShift("All"); setLine("All"); }}
        onSavePreset={() => openModal("savePreset", { dashboard: "QC Holds" })}
      />

      <div className="kpi-row-4">
        {RPT_QC_KPIS.map(k => (
          <div key={k.k} className={"kpi " + k.accent}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-sub">{k.sub || "\u00A0"}</div>
            <div className="kpi-run-foot"><RunStrip outcomes={buildKpiRunCells(k)} label="8w"/></div>
          </div>
        ))}
      </div>

      {critical.length > 0 && (
        <div className="alert-red alert-box" style={{marginBottom:12, fontSize:12}}>
          <span>⚠</span>
          <div style={{flex:1}}><b>{critical.length} critical hold(s)</b> require immediate action.</div>
          <button className="btn btn-sm btn-secondary">View critical →</button>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="✓"
            title="No quality holds today"
            body="Great work — the selected shift and line have zero active holds. Select another date or filter to review historical records."
          />
        </div>
      ) : (
        <>
          <div className="card">
            <div className="card-head">
              <h3 className="card-title">Holds for {date}</h3>
              <span className="muted" style={{fontSize:11}}>{visible.length} record(s)</span>
            </div>
            <table>
              <thead><tr>
                <th>Hold #</th><th>Line</th><th>Product</th><th>Reason</th><th>Severity</th>
                <th style={{textAlign:"right"}}>Boxes Held</th>
                <th style={{textAlign:"right"}}>Rejected</th>
                <th style={{textAlign:"right"}}>Staff</th>
                <th style={{textAlign:"right"}}>Time (min)</th>
                <th style={{textAlign:"right"}}>Labour hr</th>
                <th>Shift</th><th>Status</th><th></th>
              </tr></thead>
              <tbody>
                {visible.map(h => (
                  <tr key={h.holdId}>
                    <td className="mono" style={{fontSize:11, fontWeight:600}}>{h.holdId}</td>
                    <td>{h.line}</td>
                    <td style={{fontSize:11}}>{h.product}</td>
                    <td style={{fontSize:11}}>{h.reason}</td>
                    <td><HoldSeverity s={h.severity}/></td>
                    <td className="num mono" style={{fontWeight: h.boxesHeld > 10 ? 700 : 400}}>{h.boxesHeld}</td>
                    <td className="num mono">{h.rejected}</td>
                    <td className="num mono">{h.staff}</td>
                    <td className="num mono">{h.timeMin}</td>
                    <td className="num mono">{h.labourHr.toFixed(1)}</td>
                    <td><ShiftBadge s={h.shift}/></td>
                    <td><HoldStatus s={h.status}/></td>
                    <td><a className="drill-arrow" onClick={() => alert("Cross-module → /quality/holds/" + h.holdId)}>View in QA →</a></td>
                  </tr>
                ))}
                <tr style={{fontWeight:700, background:"var(--gray-050)", borderTop:"2px solid var(--border)"}}>
                  <td colSpan={5}>Total</td>
                  <td className="num mono">{totals(visible).held}</td>
                  <td className="num mono">{totals(visible).rej}</td>
                  <td colSpan={2}></td>
                  <td className="num mono">{totals(visible).hr.toFixed(1)}</td>
                  <td colSpan={3}></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginTop:12}}>
            <div className="card">
              <div className="card-head"><h3 className="card-title">AM Shift Summary</h3></div>
              <div style={{padding:"6px 14px", fontSize:12}}>
                <div style={{display:"flex", gap:16}}>
                  <span>Boxes Held: <b className="mono">{totals(amRows).held}</b></span>
                  <span>Labour hr: <b className="mono">{totals(amRows).hr.toFixed(1)}</b></span>
                </div>
                <div style={{marginTop:6, color:"var(--muted)"}}>Most common reason: <b>Weight Out of Spec</b></div>
              </div>
              <div style={{padding:"8px 14px 14px"}}>
                <ChartBarH
                  data={amRows.slice(0, 4).map(r => ({ name: r.reason, count: r.boxesHeld }))}
                  labelKey="name" valueKey="count" color="var(--blue)" h={120}
                />
              </div>
            </div>
            <div className="card">
              <div className="card-head"><h3 className="card-title">PM Shift Summary</h3></div>
              <div style={{padding:"6px 14px", fontSize:12}}>
                <div style={{display:"flex", gap:16}}>
                  <span>Boxes Held: <b className="mono">{totals(pmRows).held}</b></span>
                  <span>Labour hr: <b className="mono">{totals(pmRows).hr.toFixed(1)}</b></span>
                </div>
                <div style={{marginTop:6, color:"var(--muted)"}}>Most common reason: <b>Temperature Drift</b></div>
              </div>
              <div style={{padding:"8px 14px 14px"}}>
                <ChartBarH
                  data={pmRows.slice(0, 4).map(r => ({ name: r.reason, count: r.boxesHeld }))}
                  labelKey="name" valueKey="count" color="var(--amber)" h={120}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};

// ---------- RPT-005 OEE Summary ----------
const RptOeeSummary = ({ role, onNav, openModal }) => {
  const [date, setDate] = React.useState("2026-04-21");
  const [line, setLine] = React.useState("All");

  return (
    <>
      <div className="page-head">
        <div>
          <DrillCrumb trail={[{label:"Reporting", key:"home"}, {label:"OEE Summary"}]} onNav={onNav}/>
          <div className="row-flex" style={{alignItems:"center", gap:10}}>
            <h1 className="page-title">OEE Summary</h1>
            <ScopePill site="Main Site"/>
          </div>
        </div>
        <div className="row-flex">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{fontSize:12, padding:"4px 8px"}}/>
          <select value={line} onChange={e => setLine(e.target.value)} style={{fontSize:12, padding:"4px 8px"}}>
            <option>All</option><option>Line 1</option><option>Line 2</option><option>Line 3</option><option>Line 4</option><option>Line 5</option>
          </select>
          <ExportDropdown openModal={openModal} dashboard="OEE Summary"/>
        </div>
      </div>

      <FreshnessStrip at="14:31" cadence="2 min"/>

      <div className="alert-blue alert-box" style={{marginBottom:10, fontSize:12}}>
        <span>ⓘ</span>
        <div style={{flex:1}}>
          <b>Read-only consumer view.</b> OEE data is owned by <b>15-OEE</b>. For full drill-down (anomaly detection, per-machine breakdown), go to 15-OEE.
        </div>
        <button className="btn btn-sm btn-secondary">Open 15-OEE →</button>
      </div>

      <div className="kpi-row-5">
        {RPT_OEE_KPIS.map(k => (
          <div key={k.k} className={"kpi " + k.accent}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-sub">{k.sub || "\u00A0"}</div>
            <div className="kpi-run-foot"><RunStrip outcomes={buildKpiRunCells(k)} label="8w"/></div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <h3 className="card-title">OEE % by Line — Last 24h</h3>
          <span className="muted" style={{fontSize:10}}>Reference: World-class <b className="mono">≥ 85%</b></span>
        </div>
        <ChartGroupedBar
          data={RPT_OEE_BY_LINE}
          groups={[
            { key: "a", label: "Availability %", color: "#3b82f6" },
            { key: "p", label: "Performance %",  color: "#f59e0b" },
            { key: "q", label: "Quality %",       color: "#22c55e" },
          ]}
          h={280}
        />
      </div>

      <div style={{display:"grid", gridTemplateColumns:"2fr 1fr", gap:12, marginTop:12}}>
        <div className="card">
          <div className="card-head"><h3 className="card-title">OEE Trend — Last 7 Days</h3></div>
          <table>
            <thead><tr>
              <th>Date</th>
              <th style={{textAlign:"right"}}>OEE %</th>
              <th style={{textAlign:"right"}}>Availability</th>
              <th style={{textAlign:"right"}}>Performance</th>
              <th style={{textAlign:"right"}}>Quality</th>
              <th>Best Line</th><th>Worst Line</th>
              <th style={{width:90}}>Trend</th>
            </tr></thead>
            <tbody>
              {RPT_OEE_TREND.map((r, i) => {
                const cls = r.oee >= 85 ? "yld-ok" : r.oee >= 65 ? "yld-warn" : "yld-bad";
                return (
                  <tr key={i}>
                    <td className="mono" style={{fontSize:11}}>{r.d}</td>
                    <td className="col-yld"><span className={cls}>{r.oee.toFixed(1)}%</span></td>
                    <td className="col-yld"><span className="num-muted">{r.a.toFixed(1)}%</span></td>
                    <td className="col-yld"><span className="num-muted">{r.p.toFixed(1)}%</span></td>
                    <td className="col-yld"><span className="num-muted">{r.q.toFixed(1)}%</span></td>
                    <td style={{fontSize:11, color:"var(--green)"}}>{r.best}</td>
                    <td style={{fontSize:11, color:"var(--red)"}}>{r.worst}</td>
                    <td>{i === RPT_OEE_TREND.length - 1 && <Spark data={RPT_OEE_TREND.map(t => t.oee)} color="var(--amber)"/>}</td>
                  </tr>
                );
              })}
              <tr style={{fontWeight:700, background:"var(--gray-050)", borderTop:"2px solid var(--border)"}}>
                <td>7-day avg</td>
                <td className="col-yld"><span className="yld-warn">82.4%</span></td>
                <td className="col-yld"><span className="num-muted">90.9%</span></td>
                <td className="col-yld"><span className="num-muted">88.1%</span></td>
                <td className="col-yld"><span className="num-muted">99.2%</span></td>
                <td colSpan={3}></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div>
          <div className="card">
            <div className="card-head"><h3 className="card-title">Today — Gauge</h3></div>
            <div style={{display:"flex", justifyContent:"center", padding:12}}>
              <GaugeRing pct={83.2} color="var(--amber)" size={140}/>
            </div>
            <div style={{padding:"6px 14px 14px", fontSize:11, color:"var(--muted)", textAlign:"center"}}>
              Factory OEE today<br/>World-class target 85%
            </div>
          </div>
          <div className="card" style={{marginTop:12}}>
            <div className="card-head"><h3 className="card-title">Shift Comparison</h3></div>
            <table>
              <thead><tr><th>Line</th><th>OEE</th><th>A</th><th>P</th><th>Q</th></tr></thead>
              <tbody>
                {["AM", "PM"].map(shift => (
                  <React.Fragment key={shift}>
                    <tr style={{background:"var(--gray-050)"}}>
                      <td colSpan={5} style={{fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em", color:"var(--muted)", fontWeight:600}}>{shift} Shift</td>
                    </tr>
                    {RPT_OEE_BY_LINE.slice(0, 3).map((l, i) => {
                      const adj = shift === "PM" ? -2.4 : 0;
                      return (
                        <tr key={l.line + shift}>
                          <td>{l.line}</td>
                          <td className="col-yld"><span className={l.oee + adj >= 85 ? "yld-ok" : l.oee + adj >= 65 ? "yld-warn" : "yld-bad"}>{(l.oee + adj).toFixed(1)}%</span></td>
                          <td className="num-muted">{l.a.toFixed(0)}</td>
                          <td className="num-muted">{l.p.toFixed(0)}</td>
                          <td className="num-muted">{l.q.toFixed(0)}</td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
};

// ---------- RPT-006 Inventory Aging ----------
// Cross-module: LP codes (LP-4431, LP00000007) from Warehouse
const RptInventoryAging = ({ role, onNav, openModal }) => {
  const [wh, setWh] = React.useState("All");
  const [cat, setCat] = React.useState("All");

  return (
    <>
      <div className="page-head">
        <div>
          <DrillCrumb trail={[{label:"Reporting", key:"home"}, {label:"Inventory Aging"}]} onNav={onNav}/>
          <div className="row-flex" style={{alignItems:"center", gap:10}}>
            <h1 className="page-title">Inventory Aging</h1>
            <ScopePill site="Main Site"/>
          </div>
        </div>
        <div className="row-flex">
          <select value={wh} onChange={e => setWh(e.target.value)} style={{fontSize:12, padding:"4px 8px"}}>
            <option>All</option><option>WH-Factory-A</option><option>WH-Factory-B</option>
          </select>
          <select value={cat} onChange={e => setCat(e.target.value)} style={{fontSize:12, padding:"4px 8px"}}>
            <option>All</option><option>Raw meat</option><option>Packaging</option><option>Spice & additive</option><option>Dairy</option><option>Intermediate</option>
          </select>
          <ExportDropdown openModal={openModal} dashboard="Inventory Aging"/>
        </div>
      </div>

      <FreshnessStrip at="14:28" cadence="5 min"/>

      <div className="kpi-row-5">
        {RPT_INV_KPIS.map(k => (
          <div key={k.k} className={"kpi " + k.accent}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-sub">{k.sub || "\u00A0"}</div>
            <div className="kpi-run-foot"><RunStrip outcomes={buildKpiRunCells(k)} label="8w"/></div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head"><h3 className="card-title">Inventory Age Distribution — by Category</h3></div>
        <ChartStackedBarH
          data={RPT_INV_BY_CAT}
          segments={[
            { key: "fresh", label: "0–7 days",   color: "#22c55e" },
            { key: "att",   label: "7–14 days",  color: "#3b82f6" },
            { key: "warn",  label: "14–30 days", color: "#f59e0b" },
            { key: "crit",  label: ">30 days",   color: "#ef4444" },
          ]}
          h={200}
        />
      </div>

      <div className="card" style={{marginTop:12}}>
        <div className="card-head">
          <h3 className="card-title">⏰ Expiry Alerts</h3>
          <span className="muted" style={{fontSize:11}}>Items expiring in ≤7 days or already expired</span>
        </div>
        {RPT_INV_EXPIRING.some(e => e.daysRem < 0) && (
          <div className="alert-red alert-box" style={{fontSize:12, margin:"6px 14px"}}>
            <span>⚠</span>
            <div><b>{RPT_INV_EXPIRING.filter(e => e.daysRem < 0).length} expired LP(s)</b> still visible in Available status. Review in Warehouse immediately.</div>
          </div>
        )}
        <table>
          <thead><tr>
            <th>LP #</th><th>Product</th><th style={{textAlign:"right"}}>Qty</th><th>Expiry</th>
            <th style={{textAlign:"right"}}>Days Rem.</th><th>Location</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>
            {RPT_INV_EXPIRING.map(e => (
              <tr key={e.lp}>
                <td className="mono" style={{fontWeight:600}}>{e.lp}</td>
                <td style={{fontSize:11}}>{e.product}</td>
                <td className="num mono">{e.qty}</td>
                <td className="mono" style={{fontSize:11}}>{e.expiry}</td>
                <td className="col-yld">
                  {e.daysRem < 0
                    ? <span style={{color:"var(--red)", fontWeight:700}}>{e.daysRem}d</span>
                    : e.daysRem <= 3
                      ? <span style={{color:"var(--red)", fontWeight:600}}>in {e.daysRem}d</span>
                      : <span style={{color:"var(--amber)"}}>in {e.daysRem}d</span>}
                </td>
                <td style={{fontSize:11, color:"var(--muted)"}}>{e.loc}</td>
                <td><span className={"badge " + (e.status === "blocked" ? "badge-red" : e.status === "reserved" ? "badge-blue" : "badge-green")} style={{fontSize:10}}>{e.status}</span></td>
                <td><a className="drill-arrow" onClick={() => alert("Cross-module → /warehouse/license-plates/" + e.lp)}>View LP →</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{marginTop:12}}>
        <div className="card-head">
          <h3 className="card-title">All Inventory — by Age Bucket</h3>
        </div>
        <table>
          <thead><tr>
            <th>Code</th><th>Name</th><th>Category</th>
            <th style={{textAlign:"right"}}>LPs</th>
            <th style={{textAlign:"right"}}>Total KG</th>
            <th style={{textAlign:"right"}}>Avg Age</th>
            <th style={{textAlign:"right"}}>Oldest</th>
            <th style={{textAlign:"right"}}>0–7d</th>
            <th style={{textAlign:"right"}}>7–14d</th>
            <th style={{textAlign:"right"}}>14–30d</th>
            <th style={{textAlign:"right"}}>&gt;30d</th>
            <th></th>
          </tr></thead>
          <tbody>
            {RPT_INV_BY_PROD.map(p => (
              <tr key={p.code}>
                <td className="mono" style={{fontWeight:600}}>{p.code}</td>
                <td style={{fontSize:11}}>{p.name}</td>
                <td style={{fontSize:11, color:"var(--muted)"}}>{p.cat}</td>
                <td className="num mono">{p.lps}</td>
                <td className="num mono">{p.kg.toLocaleString()}{p.uom ? " " + p.uom : ""}</td>
                <td className="num mono">{p.avgAge}d</td>
                <td className="num mono"><span style={{color: p.oldest > 30 ? "var(--red)" : "var(--text)", fontWeight: p.oldest > 30 ? 600 : 400}}>{p.oldest}d</span></td>
                <td className="num mono">{p.kg7}</td>
                <td className="num mono">{p.kg14}</td>
                <td className="num mono">{p.kg30}</td>
                <td className="num mono"><span style={{color: p.kg30p > 0 ? "var(--red)" : "var(--muted)", fontWeight: p.kg30p > 0 ? 700 : 400}}>{p.kg30p}</span></td>
                <td><a className="drill-arrow" onClick={() => alert("Cross-module → /warehouse/license-plates?product=" + p.code)}>View LPs →</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{marginTop:12}}>
        <div className="card-head"><h3 className="card-title">Slow-Moving SKUs (&gt;14 days, &gt;100 kg)</h3></div>
        <table>
          <thead><tr>
            <th>Code</th><th>Product</th>
            <th style={{textAlign:"right"}}>KG &gt;14d</th>
            <th style={{textAlign:"right"}}>Oldest</th>
            <th>Suggested Action</th><th></th>
          </tr></thead>
          <tbody>
            {RPT_INV_SLOW.map(s => (
              <tr key={s.code}>
                <td className="mono" style={{fontWeight:600}}>{s.code}</td>
                <td style={{fontSize:11}}>{s.name}</td>
                <td className="num mono">{s.kgOver14}</td>
                <td className="num mono">{s.oldest}d</td>
                <td style={{fontSize:11}}>{s.action}</td>
                <td><span className="badge badge-amber" style={{fontSize:10}}>Review stock</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

// ---------- RPT-007 WO Status ----------
// Cross-module: WO-2026-0108 → /production/work-orders/:id
const RptWoStatus = ({ role, onNav, openModal }) => {
  const [filter, setFilter] = React.useState(null);
  const visible = filter ? RPT_WO_ROWS.filter(r => r.status === filter) : RPT_WO_ROWS;
  const totalFunnel = RPT_WO_FUNNEL.reduce((a, r) => a + r.count, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <DrillCrumb trail={[{label:"Reporting", key:"home"}, {label:"WO Status"}]} onNav={onNav}/>
          <div className="row-flex" style={{alignItems:"center", gap:10}}>
            <h1 className="page-title">WO Status</h1>
            <ScopePill site="Main Site"/>
          </div>
        </div>
        <div className="row-flex">
          <input type="date" defaultValue="2026-04-21" style={{fontSize:12, padding:"4px 8px"}}/>
          <select style={{fontSize:12, padding:"4px 8px"}}><option>All Lines</option><option>Line 1</option><option>Line 2</option></select>
          <ExportDropdown openModal={openModal} dashboard="WO Status"/>
        </div>
      </div>

      <FreshnessStrip at="14:32" cadence="2 min"/>

      <div className="card">
        <div className="card-head">
          <h3 className="card-title">Work Orders by Status — Today</h3>
          {filter && <a className="rpt-chip-clear" onClick={() => setFilter(null)}>Clear filter</a>}
        </div>
        <div style={{padding:"10px 14px 14px"}}>
          <div className="wo-funnel">
            {RPT_WO_FUNNEL.map(f => (
              <div key={f.state} className={"seg " + f.state}
                   style={{flex: f.count / totalFunnel, opacity: filter && filter !== f.state ? 0.55 : 1}}
                   onClick={() => setFilter(filter === f.state ? null : f.state)}>
                <span className="seg-n">{f.count}</span>
                <span className="seg-lbl">{f.state}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="kpi-row-4" style={{marginTop:12}}>
        {RPT_WO_KPIS.map(k => (
          <div key={k.k} className={"kpi " + k.accent}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-sub">{k.sub || "\u00A0"}</div>
            <div className="kpi-run-foot"><RunStrip outcomes={buildKpiRunCells(k)} label="8w"/></div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <h3 className="card-title">Work Orders {filter ? `· filtered: ${filter}` : ""}</h3>
          <span className="muted" style={{fontSize:11}}>{visible.length} WO(s)</span>
        </div>
        <table>
          <thead><tr>
            <th>WO #</th><th>Product</th><th>Line</th>
            <th style={{textAlign:"right"}}>Planned Qty</th>
            <th>Status</th><th>Planned Start</th><th>Actual Start</th>
            <th>Planned Dur.</th><th>Elapsed</th>
            <th style={{textAlign:"right"}}>Yield %</th><th></th>
          </tr></thead>
          <tbody>
            {visible.map(w => (
              <tr key={w.wo}>
                <td className="mono" style={{fontWeight:600, color:"var(--blue)", cursor:"pointer"}} onClick={() => alert("Cross-module → /production/work-orders/" + w.wo)}>{w.wo}</td>
                <td style={{fontSize:11}}>{w.product}</td>
                <td>{w.line}</td>
                <td className="num mono">{w.plannedKg.toLocaleString()} kg</td>
                <td><WOStatusBadge s={w.status}/></td>
                <td className="mono" style={{fontSize:11}}>{w.pStart}</td>
                <td className="mono" style={{fontSize:11}}>{w.aStart}</td>
                <td className="mono" style={{fontSize:11}}>{w.pDur}</td>
                <td className="mono" style={{fontSize:11, color: w.status === "running" ? "var(--green)" : "var(--text)"}}>{w.elapsed}</td>
                <td className="col-yld">{w.yield != null ? <YieldCell val={w.yield} target={91}/> : <span className="muted">—</span>}</td>
                <td><a className="drill-arrow">View →</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{marginTop:12}}>
        <div className="card-head"><h3 className="card-title">WIP by Line</h3></div>
        <table>
          <thead><tr>
            <th>Line</th>
            <th style={{textAlign:"right"}}>Running WOs</th>
            <th style={{textAlign:"right"}}>Planned Output (kg)</th>
            <th style={{textAlign:"right"}}>Material Reserved (kg)</th>
            <th style={{textAlign:"right", width:180}}>Completion</th>
          </tr></thead>
          <tbody>
            {RPT_WIP_BY_LINE.map(l => (
              <tr key={l.line}>
                <td>{l.line}</td>
                <td className="num mono">{l.runningWos}</td>
                <td className="num mono">{l.plannedKg.toLocaleString()}</td>
                <td className="num mono">{l.reservedKg.toLocaleString()}</td>
                <td>
                  <div className="prog-thin"><span className={l.completion > 50 ? "g" : l.completion > 0 ? "a" : ""} style={{width: l.completion + "%"}}></span></div>
                  <span className="mono" style={{fontSize:10, color:"var(--muted)", marginLeft:6}}>{l.completion}%</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

// ---------- RPT-008 Shipment OTD ----------
const RptShipmentOtd = ({ role, onNav, openModal }) => {
  const [week, setWeek] = React.useState("W/E 19/04/2026");
  const lateCount = RPT_OTD_LATE.length;

  return (
    <>
      <div className="page-head">
        <div>
          <DrillCrumb trail={[{label:"Reporting", key:"home"}, {label:"Shipment OTD"}]} onNav={onNav}/>
          <div className="row-flex" style={{alignItems:"center", gap:10}}>
            <h1 className="page-title">Shipment OTD</h1>
            <ScopePill site="Main Site"/>
          </div>
        </div>
        <div className="row-flex">
          <select style={{fontSize:12, padding:"4px 8px"}}><option>All Customers</option><option>Tesco Stores Ltd.</option><option>Morrisons Distribution</option></select>
          <WeekSelector value={week} onChange={setWeek}/>
          <ExportDropdown openModal={openModal} dashboard="Shipment OTD"/>
        </div>
      </div>

      <FreshnessStrip at="14:27" cadence="5 min"/>

      <div className="kpi-row-5">
        {RPT_OTD_KPIS.map(k => (
          <div key={k.k} className={"kpi " + k.accent}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
            <div className={"kpi-change " + (k.changeCls || "")}>{k.change || ""}</div>
            <div className="kpi-sub">{k.sub || "\u00A0"}</div>
            <div className="kpi-run-foot"><RunStrip outcomes={buildKpiRunCells(k)} label="8w"/></div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <h3 className="card-title">OTD % Trend — Last 8 Weeks</h3>
          <span className="muted" style={{fontSize:10}}>Target: <b className="mono">95%</b></span>
        </div>
        <ChartLine data={RPT_OTD_TREND} xKey="we" yKey="otd" color="var(--green)" target={95} h={220} yLabel="%"/>
      </div>

      <div className="card" style={{marginTop:12}}>
        <div className="card-head"><h3 className="card-title">OTD by Customer — {week}</h3></div>
        <table>
          <thead><tr>
            <th>Customer</th>
            <th style={{textAlign:"right"}}>Total Orders</th>
            <th style={{textAlign:"right"}}>On-Time</th>
            <th style={{textAlign:"right"}}>Late</th>
            <th>OTD %</th>
            <th style={{textAlign:"right"}}>Fulfill %</th>
            <th style={{textAlign:"right"}}>Pack (min)</th>
            <th style={{width:90}}>Trend</th>
          </tr></thead>
          <tbody>
            {RPT_OTD_CUSTOMERS.map(c => {
              const otdCls = c.otd >= 95 ? "badge-green" : c.otd >= 90 ? "badge-amber" : "badge-red";
              return (
                <tr key={c.name}>
                  <td>{c.name}</td>
                  <td className="num mono">{c.total}</td>
                  <td className="num mono">{c.onTime}</td>
                  <td className="num mono" style={{color: c.late > 0 ? "var(--red)" : "var(--muted)", fontWeight: c.late > 0 ? 700 : 400}}>{c.late}</td>
                  <td><span className={"badge " + otdCls} style={{fontSize:10}}>{c.otd.toFixed(1)}%</span></td>
                  <td className="num-muted">{c.fulfill.toFixed(1)}%</td>
                  <td className="num-muted">{c.packMin}</td>
                  <td><Spark data={c.spark} color="var(--green)"/></td>
                </tr>
              );
            })}
            <tr style={{fontWeight:700, background:"var(--gray-050)", borderTop:"2px solid var(--border)"}}>
              <td>Factory Total</td>
              <td className="num mono">148</td>
              <td className="num mono">142</td>
              <td className="num mono" style={{color: lateCount > 0 ? "var(--red)" : "var(--muted)"}}>{lateCount}</td>
              <td><span className="badge badge-green" style={{fontSize:10}}>96.2%</span></td>
              <td className="num-muted">98.5%</td>
              <td className="num-muted">42</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>

      {lateCount === 0 ? (
        <div className="alert-green alert-box" style={{marginTop:12, fontSize:12}}>
          <span>✓</span>
          <div>All shipments this week were on time!</div>
        </div>
      ) : (
        <div className="card" style={{marginTop:12}}>
          <div className="card-head"><h3 className="card-title">Late Shipments This Week</h3></div>
          <table>
            <thead><tr>
              <th>Shipment #</th><th>Customer</th><th>Product</th><th>Qty</th>
              <th>Required</th><th>Actual</th><th>Days Late</th><th>Reason</th><th></th>
            </tr></thead>
            <tbody>
              {RPT_OTD_LATE.map(l => (
                <tr key={l.ship}>
                  <td className="mono" style={{fontWeight:600, color:"var(--blue)", cursor:"pointer"}} onClick={() => alert("Cross-module → /shipping/shipments/" + l.ship)}>{l.ship}</td>
                  <td>{l.customer}</td>
                  <td style={{fontSize:11}}>{l.product}</td>
                  <td className="mono" style={{fontSize:11}}>{l.qty}</td>
                  <td className="mono" style={{fontSize:11}}>{l.reqDate}</td>
                  <td className="mono" style={{fontSize:11}}>{l.actDate}</td>
                  <td className="num mono" style={{color:"var(--red)", fontWeight:700}}>+{l.daysLate}d</td>
                  <td style={{fontSize:11, color:"var(--muted)"}}>{l.reason}</td>
                  <td><a className="drill-arrow">View →</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

Object.assign(window, { RptQcHolds, RptOeeSummary, RptInventoryAging, RptWoStatus, RptShipmentOtd });
