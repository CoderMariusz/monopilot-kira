// ============ Production dashboard ============

// --------------------------------------------------------------
// buildProdActivityGroups(feed) — shape EVENTS_FEED for
// <CompactActivity/>. Correlation id = first WO-XXXX-XXXX token
// in desc; fall-back bucket "PLANT" for shift / DLQ / unscoped
// events. Groups with a red/amber event default-open so the
// operator sees them immediately.
// Pure derivation — data.jsx remains frozen (TUNING-PLAN §4.5).
// --------------------------------------------------------------
const buildProdActivityGroups = (feed) => {
  const WO_RX = /\bWO-\d{4}-\d{4}\b/;
  const byCorr = {};
  feed.forEach((e) => {
    const m = e.desc && e.desc.match(WO_RX);
    const corr = m ? m[0] : "PLANT";
    if (!byCorr[corr]) byCorr[corr] = { id: corr, label: corr, events: [], worstColor: "" };
    const internal = e.color === "blue"; // demote non-alert blue to "internal"
    byCorr[corr].events.push({
      ts: e.t,
      msg: e.desc + (e.sub ? " — " + e.sub : ""),
      internal,
    });
    if (e.color === "red" || e.color === "amber") {
      byCorr[corr].worstColor = byCorr[corr].worstColor === "red" ? "red" : e.color;
    }
  });
  return Object.values(byCorr).map((g) => ({
    id: g.id,
    label: g.label,
    events: g.events,
    count: g.events.length,
    defaultOpen: g.worstColor === "red" || g.worstColor === "amber",
  }));
};


const Dashboard = ({ onOpenWo, onOpenLine, onNav, openModal }) => {
  // Audit Fix-5b: KPI set now matches UX PROD-001 spec (6 KPIs):
  //   WOs In Progress · Output vs Target today · OEE current shift ·
  //   Downtime last 24h · QA Holds active · Next changeover.
  // Prior KPIs derived from LINES counts were replaced (drift-C item #1).
  const KPIS = DASHBOARD_KPIS;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a>Factory-A</a> · Shift A · Live view</div>
          <h1 className="page-title">Production — Shift A</h1>
          <div className="muted" style={{fontSize:12}}>06:00 → 14:00 · <b>2h 26m</b> elapsed · Operator crew complete (4 of 5 lines)</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm" onClick={()=>onNav("shifts")}>Shift crew</button>
          <button className="btn btn-secondary btn-sm" onClick={()=>onNav("wos")}>All work orders</button>
          {/* "+ Release WO" button removed — belongs in 04-PLANNING (DRAFT → READY). Execution starts at READY. */}
        </div>
      </div>

      {/* Attention ribbon */}
      <div className="alert-red alert-box" style={{marginBottom:10}}>
        <strong>2 line events need attention</strong>
        <span className="muted">· LINE-02 down since 10:22 (23m) · LINE-04 changeover awaiting dual sign-off</span>
        <div className="alert-cta">
          <button className="btn btn-sm btn-secondary" onClick={()=>onOpenLine("LINE-02")}>Open LINE-02</button>
          <button className="btn btn-sm btn-secondary" onClick={()=>onNav("changeover")}>Open changeover</button>
        </div>
      </div>

      {/* KPIs — 6 cards per UX PROD-001 spec */}
      <div className="kpi-row">
        <div className="kpi" onClick={()=>onNav("wos")}>
          <div className="kpi-label">WOs in progress</div>
          <div className="kpi-value">{KPIS.woInProgress.value}<span style={{fontSize:14, color:"var(--muted)", fontWeight:400}}> / {KPIS.woInProgress.of}</span></div>
          <div className="kpi-sub">{KPIS.woInProgress.sub}</div>
        </div>
        <div className={"kpi " + (KPIS.outputVsTarget.tone || "")}>
          <div className="kpi-label">Output vs target · today</div>
          <div className="kpi-value">{KPIS.outputVsTarget.value}<span style={{fontSize:14, color:"var(--muted)"}}>%</span></div>
          <div className="kpi-sub mono">{KPIS.outputVsTarget.sub}</div>
        </div>
        <div className="kpi" onClick={()=>onNav("oee")}>
          <div className="kpi-label">OEE · current shift</div>
          <div className="kpi-value">{KPIS.oeeShift.value}<span style={{fontSize:14, color:"var(--muted)"}}>%</span></div>
          <div className="kpi-micro">
            <span>A <b>{KPIS.oeeShift.a}%</b></span>
            <span>P <b>{KPIS.oeeShift.p}%</b></span>
            <span>Q <b>{KPIS.oeeShift.q}%</b></span>
          </div>
        </div>
        <div className={"kpi " + (KPIS.downtime24h.tone || "")}>
          <div className="kpi-label">Downtime · last 24h</div>
          <div className="kpi-value">{KPIS.downtime24h.value}</div>
          <div className="kpi-sub">{KPIS.downtime24h.sub}</div>
        </div>
        <div className={"kpi " + (KPIS.qaHolds.tone || "")} onClick={()=>onNav("analytics")}>
          <div className="kpi-label">QA holds · active</div>
          <div className="kpi-value">{KPIS.qaHolds.value}</div>
          <div className="kpi-sub">{KPIS.qaHolds.sub}</div>
        </div>
        <div className="kpi" onClick={()=>onNav("changeover")}>
          <div className="kpi-label">Next changeover</div>
          <div className="kpi-value" style={{fontSize:22}}>{KPIS.nextChangeover.value}</div>
          <div className="kpi-sub">{KPIS.nextChangeover.sub}</div>
        </div>
      </div>

      {/* Lines grid */}
      <div className="card-head" style={{marginTop:6}}>
        <h2 className="card-title">Lines — live</h2>
        <div className="row-flex">
          <div className="pills">
            <button className="pill on">All</button>
            <button className="pill">Factory-A</button>
            <button className="pill">Factory-B</button>
          </div>
          <button className="btn btn-ghost btn-sm">⛶ Full-screen TV mode</button>
        </div>
      </div>

      <div className="line-grid">
        {LINES.map(l => <LineCard key={l.id} line={l} onOpen={()=>onOpenLine(l.id)} onWo={()=>onOpenWo(l.wo)} openModal={openModal} />)}
      </div>

      {/* Events + quick actions */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 360px", gap:12, marginTop:12}}>
        <div className="card">
          <div className="card-head">
            <h3 className="card-title">Recent events</h3>
            <div className="row-flex">
              <span className="badge badge-gray">Last 30 min</span>
              <button className="btn btn-ghost btn-sm">Filter</button>
            </div>
          </div>
          <div className="card-body-flush">
            {/* Tuning §3.5 — <CompactActivity/> groups events by WO
                correlation id. Events without a WO reference fall under
                a "Plant / shift" bucket. Critical WO groups default-open
                (GHA-style §3.3) so red/amber never hide behind a caret. */}
            <CompactActivity groups={buildProdActivityGroups(EVENTS_FEED)} />
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-head"><h3 className="card-title">Quick actions</h3></div>
            <div style={{display:"grid", gap:6}}>
              {/* Release-WO action removed — lives in 04-PLANNING. "Start WO" acts on WOs already in READY. */}
              <button className="btn btn-secondary" onClick={()=>openModal("startWo")}>▶ Start next READY WO</button>
              <button className="btn btn-secondary" onClick={()=>openModal("pauseLine")}>❚❚ Pause a line (report downtime)</button>
              <button className="btn btn-secondary" onClick={()=>openModal("catchweight")}>⚖ Catch-weight capture</button>
              <button className="btn btn-secondary" onClick={()=>openModal("waste")}>⌫ Log waste event</button>
              <button className="btn btn-secondary" onClick={()=>onNav("changeover")}>⇄ Changeover wizard</button>
              <button className="btn btn-secondary" onClick={()=>openModal("scanner")}>🔲 Open scanner (operator UI)</button>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3 className="card-title">Shift targets</h3></div>
            <div style={{fontSize:12}}>
              {[
                {l:"Output target", v:"4 211 kg", sub:"3 842 kg so far · 91%", pct:91, c:"green"},
                {l:"Yield target", v:"≥ 94%", sub:"93.2% · –0.8 pp", pct:98, c:"amber"},
                {l:"Downtime budget", v:"≤ 150 min", sub:"112 min used · 38 min left", pct:75, c:"amber"},
                {l:"Waste target", v:"≤ 1.5%", sub:"1.1% · ok", pct:73, c:"green"},
              ].map((t,i)=>(
                <div key={i} style={{padding:"8px 0", borderBottom:"1px solid var(--border)"}}>
                  <div className="row-flex"><span>{t.l}</span><span className="spacer"></span><span className="mono">{t.v}</span></div>
                  <div className={"progress "+t.c}><span style={{width:t.pct+"%"}}></span></div>
                  <div className="muted" style={{fontSize:11, marginTop:2}}>{t.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

// Per-line card
const LineCard = ({ line, onOpen, onWo, openModal }) => {
  const l = line;
  const progPct = l.planned ? (l.consumed / l.planned * 100) : 0;
  const progColor = l.status === "down" ? "red" : l.status === "changeover" ? "amber" : "green";

  return (
    <div className={"line-card " + l.status}>
      <div className="line-card-head">
        <div>
          <div className="line-card-name">{l.name}</div>
          <div className="line-card-sub">{l.id} · Factory-A</div>
        </div>
        <LineStatus s={l.status} />
      </div>

      <div className="line-card-body">
        {l.wo ? (
          <div className="line-wo" onClick={onWo} style={{cursor:"pointer"}}>
            <div className="line-wo-code">{l.wo} · {l.woItem}</div>
            <div className="line-wo-prod">{l.woName}</div>
            <div className={"progress "+progColor}><span style={{width:progPct+"%"}}></span></div>
            <div className="row-flex" style={{fontSize:11, color:"var(--muted)", marginTop:2}}>
              <span className="mono">{l.consumed} / {l.planned} kg ({progPct.toFixed(0)}%)</span>
              <span className="spacer"></span>
              <span className="mono">{l.elapsed} / {l.plannedTotal}</span>
            </div>
          </div>
        ) : (
          <div className="line-wo" style={{textAlign:"center", color:"var(--muted)", padding:"14px 0"}}>
            — No active work order —
          </div>
        )}

        {l.status !== "idle" && (
          <div className="line-stats">
            <div><div className="stat-label">Yield</div><div className="stat-val">{l.yield.toFixed(1)}%</div></div>
            <div><div className="stat-label">Waste</div><div className="stat-val">{l.waste.toFixed(1)}%</div></div>
            <div><div className="stat-label">Downtime</div><div className="stat-val">{l.downtime}m</div></div>
          </div>
        )}

        <div className="line-operator">
          <span className="operator-av">{l.opInit}</span>
          <span>{l.operator}</span>
          <span className="spacer"></span>
          {l.nextWo !== "—" ? <span>Next: <span className="mono">{l.nextWo}</span> · in {l.nextIn}</span> : <span>—</span>}
        </div>

        {/* Tuning §3.1 — 8-shift OEE outcome strip per line. Derived
            from existing line entity fields (status, waste, yield)
            via deriveRunHistory; data.jsx stays frozen. */}
        <div className="line-run-strip">
          <span className="line-run-strip-label">Last 8 shifts</span>
          <RunStrip outcomes={deriveRunHistory(l)} title={l.id + " — 8-shift OEE outcomes"} />
        </div>
      </div>

      {l.status === "down" && (
        <div className="line-alert">
          <span className="alert-dot"></span>
          <div style={{flex:1}}>
            <div><b>DOWN since {l.downSince}</b> · {l.downReason}</div>
          </div>
        </div>
      )}
      {l.status === "changeover" && (
        <div className="line-alert violet">
          <span className="alert-dot"></span>
          <div style={{flex:1}}><b>Changeover in progress</b> · {l.changeoverInfo}</div>
        </div>
      )}
      {l.nextAllergen && l.status === "running" && (
        <div className="line-alert amber">
          <span className="alert-dot"></span>
          <div style={{flex:1}}>Next WO has <b>allergen change</b> — dual sign-off required at handover</div>
        </div>
      )}

      <div className="line-card-foot">
        <button className="btn btn-secondary btn-sm" onClick={onOpen}>Open line</button>
        {l.status === "running" && <button className="btn btn-secondary btn-sm" onClick={()=>openModal("pauseLine", l)}>❚❚ Pause</button>}
        {l.status === "running" && <button className="btn btn-secondary btn-sm" onClick={()=>openModal("completeWo", l)}>✓ Complete</button>}
        {l.status === "down" && <button className="btn btn-primary btn-sm" onClick={()=>openModal("resumeLine", l)}>▶ Resume</button>}
        {l.status === "changeover" && <button className="btn btn-primary btn-sm" onClick={()=>openModal("changeoverGate", l)}>Open wizard</button>}
        {l.status === "idle" && <button className="btn btn-primary btn-sm" onClick={()=>openModal("startWo", l)} title="Starts the next WO already in READY; release happens in 04-PLANNING">▶ Start READY WO</button>}
      </div>
    </div>
  );
};

Object.assign(window, { Dashboard, LineCard });
