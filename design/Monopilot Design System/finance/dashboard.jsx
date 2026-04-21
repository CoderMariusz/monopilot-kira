// ============ FIN-001 — Finance Dashboard ============

const FinDashboard = ({ role, onNav, onOpenWo, openModal }) => {
  const [dismissed, setDismissed] = React.useState(new Set());
  const [onboardOpen, setOnboardOpen] = React.useState(true);

  const dismiss = (code) => {
    const next = new Set(dismissed); next.add(code); setDismissed(next);
  };
  const visibleAlerts = FIN_INLINE_ALERTS.filter(a => !dismissed.has(a.code));
  const doneCount = FIN_ONBOARD.filter(s => s.done).length;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Finance</a> · Dashboard</div>
          <h1 className="page-title">Finance Dashboard</h1>
          <div className="muted" style={{fontSize:12}}>Forza Foods UK · Base currency GBP · FY2026 · <b>Last updated: just now</b> · Cached 5min</div>
        </div>
        <div className="row-flex">
          <select style={{width:140}}><option>MTD</option><option>Last Month</option><option>QTD</option><option>YTD</option></select>
          <button className="btn btn-secondary btn-sm" onClick={()=>openModal("exportReport", { name: "Finance Dashboard" })}>⇪ Export Dashboard</button>
        </div>
      </div>

      {/* Onboarding checklist — only if not all done */}
      {doneCount < 5 && onboardOpen && (
        <div className="card" style={{marginBottom:12, borderLeft:"4px solid var(--blue)"}}>
          <div className="card-head">
            <h3 className="card-title">Get your Finance module up and running</h3>
            <div className="row-flex">
              <span className="muted" style={{fontSize:12}}>{doneCount} / {FIN_ONBOARD.length} complete</span>
              <button className="btn btn-ghost btn-sm" onClick={()=>setOnboardOpen(false)}>Hide</button>
            </div>
          </div>
          <div>
            {FIN_ONBOARD.map(s => (
              <div key={s.k} className={"onb-step " + (s.done ? "done" : "")}>
                <span className="onb-tick">{s.done ? "✓" : ""}</span>
                <span className="onb-label">{s.label}</span>
                {!s.done && <button className="btn btn-primary btn-sm" onClick={()=>onNav(s.link)}>Start →</button>}
                {s.done && <button className="btn btn-ghost btn-sm" onClick={()=>onNav(s.link)}>Open →</button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPI row — 6 cards in one row (spec FIN-001) */}
      <div style={{display:"grid", gridTemplateColumns:"repeat(6, 1fr)", gap:10, marginBottom:12}}>
        {FIN_KPIS.map(k => (
          <div key={k.k} className={"kpi " + k.accent} onClick={()=>onNav(k.target)} title={k.label}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{fontSize:19, fontFamily:"var(--font-mono)"}}>{k.value}</div>
            <div className={"kpi-sub " + (k.trendBad ? " " : "")} style={{color: k.trendBad ? "var(--red-700)" : k.trend === "up" ? "var(--green-700)" : "var(--muted)"}}>
              {k.sub}
            </div>
          </div>
        ))}
      </div>

      {/* Inline banner alerts */}
      {visibleAlerts.map(a => (
        <div key={a.code} className={"alert-" + a.sev + " alert-box"} style={{marginBottom:6, fontSize:12, padding:"8px 12px"}}>
          <span>{a.sev === "amber" ? "⚠" : a.sev === "red" ? "⚠" : "ⓘ"}</span>
          <div style={{flex:1}}>
            <div>{a.text}</div>
            <div style={{fontSize:10, color:"var(--muted)", marginTop:3, fontFamily:"var(--font-mono)"}}>{a.code}</div>
          </div>
          <div className="alert-cta">
            <button className="btn btn-sm btn-secondary" onClick={()=>onNav(a.link)}>View →</button>
            <button className="btn btn-sm btn-ghost" onClick={()=>dismiss(a.code)}>✕</button>
          </div>
        </div>
      ))}

      {/* Two-column — Variance Alerts | Cost Trend */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginTop:4}}>
        {/* LEFT — Variance alerts */}
        <div className="card" style={{padding:0}}>
          <div className="card-head" style={{padding:"12px 14px", marginBottom:0, borderBottom:"1px solid var(--border)"}}>
            <h3 className="card-title">Variance Alerts</h3>
            <span className="badge badge-red" style={{fontSize:10}}>{FIN_ALERTS.filter(a=>a.sev==="critical").length} critical</span>
          </div>
          <div style={{padding:"4px 0"}}>
            {FIN_ALERTS.map((a, i) => (
              <div key={i} className="var-alert-row" onClick={()=>onOpenWo(a.wo)}>
                <span className={"badge " + (a.sev === "critical" ? "badge-red" : "badge-amber")} style={{fontSize:9, fontFamily:"var(--font-mono)"}}>
                  {a.sev.toUpperCase()}
                </span>
                <span style={{fontSize:11}}>{a.type}</span>
                <span className="va-wo">{a.wo}</span>
                <span style={{fontSize:11, color:"var(--muted)"}}>{a.product}</span>
                <span className="money neg">{fmtMoneySigned(a.amt)}</span>
                <span className="money neg">{fmtPct(a.pct)}</span>
              </div>
            ))}
          </div>
          <div style={{padding:"10px 14px", borderTop:"1px solid var(--border)", background:"var(--gray-050)", fontSize:11}}>
            <span className="muted">Positive variance = unfavorable (actual &gt; standard). Negative = favorable.</span>
            <a style={{float:"right", color:"var(--blue)", cursor:"pointer"}} onClick={()=>onNav("var_drilldown")}>View All Alerts →</a>
          </div>
        </div>

        {/* RIGHT — Cost Trend chart */}
        <div className="card">
          <div className="card-head">
            <h3 className="card-title">Cost Trend — 6 Months</h3>
            <span className="muted" style={{fontSize:11}}>Nov 2025 – Apr 2026</span>
          </div>
          <TrendChart
            series={[
              FIN_COST_TREND.map(m => m.mat),
              FIN_COST_TREND.map(m => m.lab),
              FIN_COST_TREND.map(m => m.oh),
            ]}
            colors={["#1976D2", "#f59e0b", "#64748b"]}
            labels={FIN_COST_TREND.map(m => m.m)}
          />
          <div className="chart-legend">
            <span className="cl-item"><span className="cl-dot" style={{background:"#1976D2"}}></span>Material</span>
            <span className="cl-item"><span className="cl-dot" style={{background:"#f59e0b"}}></span>Labor</span>
            <span className="cl-item"><span className="cl-dot" style={{background:"#64748b"}}></span>Overhead</span>
          </div>
        </div>
      </div>

      {/* Next row — Top Variance Contributors | Cost Breakdown */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginTop:12}}>
        <div className="card" style={{padding:0}}>
          <div className="card-head" style={{padding:"12px 14px", marginBottom:0, borderBottom:"1px solid var(--border)"}}>
            <h3 className="card-title">Top Variance Contributors (MTD)</h3>
            <a style={{color:"var(--blue)", fontSize:12, cursor:"pointer"}} onClick={()=>onNav("var_drilldown")}>View Full Report →</a>
          </div>
          <table>
            <thead><tr><th style={{width:40}}>#</th><th>Product</th><th></th><th style={{textAlign:"right"}}>Variance</th><th style={{textAlign:"right", width:60}}>% Total</th></tr></thead>
            <tbody>
              {FIN_TOP_CONTRIB.map(r => {
                const width = Math.min(100, Math.abs(r.pctOfTotal) * 2.5);
                return (
                  <tr key={r.rank}>
                    <td className="mono" style={{fontWeight:600, color:"var(--muted)"}}>{r.rank}</td>
                    <td><div style={{fontSize:12}}>{r.product}</div><div className="mono muted" style={{fontSize:10}}>{r.code}</div></td>
                    <td><div className="rank-bar"><span className={"rb-fill " + (r.dir === "fav" ? "fav" : "")} style={{width: width + "%"}}/></div></td>
                    <td className={"money " + (r.dir === "fav" ? "pos" : "neg")}>{fmtMoneySigned(r.variance)}</td>
                    <td className={"money " + (r.dir === "fav" ? "pos" : "neg")}>{fmtPct(r.pctOfTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-head">
            <h3 className="card-title">Cost Breakdown MTD</h3>
            <span className="muted" style={{fontSize:11}}>{fmtMoney(FIN_COST_BREAKDOWN.total, true)}</span>
          </div>
          <div className="cost-breakdown">
            {[
              { cat: "Material", pct: FIN_COST_BREAKDOWN.mat, val: FIN_COST_BREAKDOWN.total * FIN_COST_BREAKDOWN.mat/100, color: "mat" },
              { cat: "Labor",    pct: FIN_COST_BREAKDOWN.lab, val: FIN_COST_BREAKDOWN.total * FIN_COST_BREAKDOWN.lab/100, color: "lab" },
              { cat: "Overhead", pct: FIN_COST_BREAKDOWN.oh,  val: FIN_COST_BREAKDOWN.total * FIN_COST_BREAKDOWN.oh/100,  color: "oh" },
              { cat: "Waste",    pct: FIN_COST_BREAKDOWN.waste, val: FIN_COST_BREAKDOWN.total * FIN_COST_BREAKDOWN.waste/100, color: "waste" },
            ].map(r => (
              <div key={r.cat} className="cost-row">
                <span className="cr-label">{r.cat}</span>
                <div className="cr-track"><span className={"cr-fill " + r.color} style={{width: r.pct + "%"}}/></div>
                <span className="cr-val">{fmtMoney(r.val)}</span>
                <span className="cr-pct">{r.pct.toFixed(1)}%</span>
              </div>
            ))}
          </div>
          <div className="fin-section" style={{marginTop:12}}>
            <div className="fin-section-title">Cost Waterfall — Std vs Actual MTD</div>
            <div className="waterfall">
              <div className="waterfall-bar"><span className="wf-label">Standard (baseline)</span><div className="wf-track"><span className="wf-fill" style={{width:"85%"}}></span></div><span className="wf-val">{fmtMoney(233340)}</span></div>
              <div className="waterfall-bar add"><span className="wf-label">Material variance</span><div className="wf-track"><span className="wf-fill" style={{width:"30%"}}></span></div><span className="wf-val pos">+{fmtMoney(8240)}</span></div>
              <div className="waterfall-bar add"><span className="wf-label">Labor variance</span><div className="wf-track"><span className="wf-fill" style={{width:"12%"}}></span></div><span className="wf-val pos">+{fmtMoney(2850)}</span></div>
              <div className="waterfall-bar add"><span className="wf-label">Overhead variance</span><div className="wf-track"><span className="wf-fill" style={{width:"8%"}}></span></div><span className="wf-val pos">+{fmtMoney(1200)}</span></div>
              <div className="waterfall-bar sub"><span className="wf-label">Waste allocation</span><div className="wf-track"><span className="wf-fill" style={{width:"4%"}}></span></div><span className="wf-val pos">+{fmtMoney(780)}</span></div>
              <div className="waterfall-bar total"><span className="wf-label">Actual (MTD)</span><div className="wf-track"><span className="wf-fill" style={{width:"90%"}}></span></div><span className="wf-val">{fmtMoney(245680.50)}</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* Monthly yield loss */}
      <div className="card" style={{marginTop:12}}>
        <div className="card-head">
          <h3 className="card-title">Monthly Yield Loss (09-QA NCR yield issues)</h3>
          <a style={{color:"var(--blue)", fontSize:12, cursor:"pointer"}}>View QA Module →</a>
        </div>
        <table>
          <thead><tr><th>Month</th><th>Product</th><th style={{textAlign:"right"}}>Incidents</th><th style={{textAlign:"right"}}>Loss Qty (kg)</th><th style={{textAlign:"right"}}>Loss Value GBP</th></tr></thead>
          <tbody>
            {FIN_YIELD_LOSS.map((r, i) => (
              <tr key={i}>
                <td className="mono" style={{fontSize:11}}>{r.month}</td>
                <td style={{fontSize:12}}>{r.product}</td>
                <td className="num mono">{r.incidents}</td>
                <td className="num mono">{fmtQty(r.lossKg)}</td>
                <td className="money neg">{fmtMoney(r.lossGbp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="muted" style={{fontSize:11, marginTop:6}}>EUR claim values converted at daily GBP/EUR rate effective on incident date.</div>
      </div>
    </>
  );
};

Object.assign(window, { FinDashboard });
