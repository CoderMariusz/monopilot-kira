// ============ SCREEN-10 — Reservation Panel (Global) ============

const PlanReservations = ({ onNav, onOpenWo }) => {
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("active");
  const [selectedProduct, setSelectedProduct] = React.useState(RES_AVAILABILITY.product);

  const visible = PLAN_RESERVATIONS.filter(r =>
    (statusFilter === "all" || r.status === statusFilter) &&
    (!search || r.wo.toLowerCase().includes(search.toLowerCase()) || r.lp.toLowerCase().includes(search.toLowerCase()) || r.material.toLowerCase().includes(search.toLowerCase()))
  );

  const activeCount = PLAN_RESERVATIONS.filter(r => r.status === "active").length;
  const lpsLocked = new Set(PLAN_RESERVATIONS.filter(r => r.status === "active").map(r => r.lp)).size;
  const fullyCommitted = RES_AVAILABILITY.lps.filter(lp => lp.net <= 0).length;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Planning</a> · Reservations</div>
          <h1 className="page-title">Reservations — hard-lock browser</h1>
          <div className="muted" style={{fontSize:12}}>Global view of all active hard-lock reservations across all WOs</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm">⇪ Export</button>
        </div>
      </div>

      <div className="res-summary-strip">
        <div><div className="rs-label">Active hard locks</div><div className="rs-value">{activeCount}</div></div>
        <div><div className="rs-label">LPs locked</div><div className="rs-value">{lpsLocked}</div></div>
        <div><div className="rs-label">Fully committed LPs</div><div className="rs-value" style={{color: fullyCommitted > 0 ? "var(--red-700)" : "var(--text)"}}>{fullyCommitted}</div></div>
        <span className="spacer"></span>
        <span className="muted" style={{fontSize:11}}>Reservations created on WO RELEASED transition · RM root materials only</span>
      </div>

      <div className="filter-bar">
        <input type="text" placeholder="Search WO, LP, material…" value={search} onChange={e=>setSearch(e.target.value)} style={{width:280}}/>
        <select style={{width:140}} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="consumed">Released — consumed</option>
          <option value="cancelled">Released — cancelled</option>
          <option value="admin_override">Admin override</option>
        </select>
        <select style={{width:140}}><option>All warehouses</option><option>WH-Factory-A</option><option>WH-Factory-B</option></select>
        <select style={{width:140}}><option>All WO statuses</option><option>Released</option><option>In progress</option></select>
        <select style={{width:160}}><option>Reservation type</option><option>Hard lock (P1 only)</option></select>
        <span className="spacer"></span>
        <button className="clear-all">Clear all filters</button>
        <span className="muted" style={{fontSize:12}}>{visible.length} rows</span>
      </div>

      <div style={{display:"grid", gridTemplateColumns:"1fr 320px", gap:12, alignItems:"flex-start"}}>
        <div className="card" style={{padding:0}}>
          <table>
            <thead><tr>
              <th>WO</th><th>WO product</th><th>Material</th><th>LP</th>
              <th style={{textAlign:"right"}}>Reserved</th><th style={{textAlign:"right"}}>LP total</th>
              <th>Type</th><th>Reserved at</th><th>By</th><th>Status</th><th style={{width:90}}></th>
            </tr></thead>
            <tbody>
              {visible.map((r, i) => (
                <tr key={i} style={{cursor:"pointer"}} onClick={()=>onOpenWo(r.wo)}>
                  <td className="mono" style={{fontWeight:600}}>{r.wo}</td>
                  <td style={{fontSize:12}}>{r.woProduct}</td>
                  <td style={{fontSize:12}}>{r.material}</td>
                  <td className="mono" style={{color:"var(--blue)"}}>{r.lp}</td>
                  <td className="num mono">{r.reservedQty} kg</td>
                  <td className="num mono">{r.lpTotalQty} kg</td>
                  <td><span className="badge badge-blue" style={{fontSize:10}}>Hard lock</span></td>
                  <td className="mono" style={{fontSize:11}}>{r.reservedAt}</td>
                  <td>{r.reservedBy}</td>
                  <td>
                    {r.status === "active" && <span className="badge badge-green" style={{fontSize:10}}>Active</span>}
                    {r.status === "consumed" && <span className="badge badge-gray" style={{fontSize:10}}>Consumed</span>}
                    {r.status === "cancelled" && <span className="badge badge-gray" style={{fontSize:10}}>Cancelled</span>}
                    {r.status === "admin_override" && <span className="badge badge-amber" style={{fontSize:10}}>Admin override</span>}
                  </td>
                  <td onClick={e=>e.stopPropagation()}>
                    {r.status === "active"
                      ? <button className="btn btn-ghost btn-sm" title="Admin only">🔒 Release</button>
                      : <span className="muted" style={{fontSize:11}}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="avail-panel">
          <div className="avail-panel-head">Availability panel</div>
          <div className="avail-panel-title">{selectedProduct}</div>
          <div className="muted" style={{fontSize:11, marginBottom:8}}>FEFO-sorted by expiry date</div>
          {RES_AVAILABILITY.lps.map((lp, i) => (
            <div key={i} className="avail-lp-row">
              <div className="avail-lp-head">
                <span className={"avail-lp-dot " + lp.status}></span>
                <span style={{color: lp.net < 0 ? "var(--red-700)" : "var(--text)"}}>{lp.lp}</span>
                <span className="spacer"></span>
                <span className="mono" style={{fontSize:12, fontWeight: lp.net < 0 ? 700 : 500, color: lp.net < 0 ? "var(--red-700)" : "var(--text)"}}>{lp.net > 0 ? "+" : ""}{lp.net} kg net</span>
              </div>
              <div className="avail-lp-meta">
                <span>Total: <b className="mono">{lp.total}</b></span>
                <span>Reserved: <b className="mono">{lp.reserved}</b></span>
                <span>Exp: <span className="mono">{lp.expiry}</span></span>
              </div>
              {lp.net < 0 && (
                <div className="alert-red alert-box" style={{fontSize:11, marginTop:6, padding:"6px 10px"}}>
                  <b>Over-committed</b> · {Math.abs(lp.net)} kg over LP total — DB constraint violation
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

// ============ SCREEN-11 — Sequencing View ============

const PlanSequencing = ({ onNav, onOpenWo }) => {
  const [line, setLine] = React.useState("LINE-04");
  const [compareOpen, setCompareOpen] = React.useState(false);
  const [applyOpen, setApplyOpen] = React.useState(false);

  // Group queue by allergen family (with group changes creating changeovers)
  const groups = [];
  let currentGroup = null;
  SEQ_QUEUE.forEach(item => {
    if (!currentGroup || currentGroup.family !== item.group) {
      currentGroup = { family: item.group, rows: [item] };
      groups.push(currentGroup);
    } else {
      currentGroup.rows.push(item);
    }
  });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Planning</a> · Sequencing</div>
          <h1 className="page-title">Sequencing — allergen-aware queue</h1>
          <div className="muted" style={{fontSize:12}}>
            Line <b className="mono">{line}</b> · Rule: <span className="mono">allergen_sequencing_heuristic_v1</span>
          </div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm" onClick={()=>setCompareOpen(true)}>⇄ Before/after compare</button>
          <button className="btn btn-primary btn-sm" onClick={()=>setApplyOpen(true)}>↯ Run sequencing</button>
        </div>
      </div>

      <div className="filter-bar">
        <label style={{margin:0, textTransform:"none", fontWeight:500}}>Line:</label>
        <select style={{width:180}} value={line} onChange={e=>setLine(e.target.value)}>
          <option value="LINE-01">LINE-01 — Cured meats</option>
          <option value="LINE-02">LINE-02 — Ready meals</option>
          <option value="LINE-03">LINE-03 — Deli</option>
          <option value="LINE-04">LINE-04 — Pierogi</option>
          <option value="LINE-05">LINE-05 — Sous-vide</option>
        </select>
        <label style={{margin:0, textTransform:"none", fontWeight:500}}>Window:</label>
        <select style={{width:140}}><option>Next 3 days</option><option>This week</option><option>Next 14 days</option></select>
        <span className="spacer"></span>
        <span className="badge badge-gray" style={{fontSize:10}}>Rule version: v1</span>
      </div>

      <div className="seq-kpi-strip">
        <div className="seq-kpi-item"><div className="ski-label">Changeovers in window</div><div className="ski-value">{SEQ_KPIS.changeovers}</div></div>
        <div className="seq-kpi-item"><div className="ski-label">Baseline (unsequenced)</div><div className="ski-value" style={{color:"var(--muted)"}}>{SEQ_KPIS.baseline}</div></div>
        <div className={"seq-kpi-item " + (SEQ_KPIS.reductionPct > 30 ? "good" : SEQ_KPIS.reductionPct > 10 ? "" : "bad")}>
          <div className="ski-label">Reduction vs baseline</div>
          <div className="ski-value">{SEQ_KPIS.reductionPct}%</div>
        </div>
        <span className="spacer"></span>
        <span className="muted" style={{fontSize:11}}>Target: <b>&gt; 30%</b> (Apex baseline)</span>
      </div>

      <div className="seq-queue">
        {groups.map((g, gi) => (
          <React.Fragment key={gi}>
            {gi > 0 && (
              <div className="seq-changeover">
                Changeover · allergen transition from <b style={{margin:"0 3px"}}>{groups[gi-1].family}</b> → <b style={{margin:"0 3px"}}>{g.family}</b> · estimated cleaning: {g.family === "multi" || groups[gi-1].family === "multi" ? "45 min" : "20 min"}
              </div>
            )}
            <div className={"seq-group-head " + g.family}>
              <span>{g.family === "free" ? "Allergen-free" : g.family === "multi" ? "Multi-allergen" : g.family.charAt(0).toUpperCase() + g.family.slice(1)} group · {g.rows.length} WO{g.rows.length > 1 ? "s" : ""}</span>
              <span style={{fontSize:10, fontFamily:"var(--font-mono)", color:"var(--muted)"}}>{g.rows.reduce((a,r) => a + parseInt(r.dur), 0)}h+ total</span>
            </div>
            {g.rows.map(r => (
              <div key={r.wo} className={"seq-row " + (r.current ? "current" : "")}>
                <span className="seq-drag" title="Drag to reorder">⋮⋮</span>
                <span className="seq-pos">{r.pos}</span>
                <div>
                  <div className="seq-product">{r.product}</div>
                  <div className="seq-wo" style={{cursor:"pointer"}} onClick={()=>onOpenWo(r.wo)}>{r.wo}</div>
                </div>
                <AllergenCluster families={r.allergens}/>
                <Priority p={r.priority}/>
                <span className="seq-meta">{r.start.slice(11)}</span>
                <span className="seq-meta">{r.dur}</span>
                <button className="btn btn-ghost btn-sm" style={{marginLeft:"auto"}}>Override</button>
                {r.exempt && <span className="badge badge-red" style={{fontSize:9, marginLeft:6}}>Critical — exempt</span>}
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>

      {compareOpen && (
        <div className="modal-overlay" onClick={()=>setCompareOpen(false)}>
          <div className="modal-box wide" onClick={e=>e.stopPropagation()} style={{width:720}}>
            <div className="modal-head">
              <div className="modal-title">Sequencing preview — before / after</div>
              <button className="modal-close" onClick={()=>setCompareOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, fontSize:12}}>
                <div>
                  <div className="label">Before (as scheduled by planner)</div>
                  <div style={{padding:"8px 0", fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)"}}>
                    Mixed order · <b style={{color:"var(--red-700)"}}>{SEQ_KPIS.baseline} changeovers</b>
                  </div>
                </div>
                <div>
                  <div className="label">After (heuristic v1)</div>
                  <div style={{padding:"8px 0", fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)"}}>
                    Grouped by allergen family · <b style={{color:"var(--green-700)"}}>{SEQ_KPIS.changeovers} changeovers</b> (–{SEQ_KPIS.reductionPct}%)
                  </div>
                </div>
              </div>
              <div className="alert-green alert-box" style={{marginTop:12, fontSize:12}}>
                <b>Applying this sequence will reduce changeovers by {SEQ_KPIS.reductionPct}% vs baseline.</b> Critical WOs are exempt and keep their position.
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary btn-sm" onClick={()=>setCompareOpen(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={()=>{ setCompareOpen(false); setApplyOpen(true); }}>Apply sequencing</button>
            </div>
          </div>
        </div>
      )}

      <SequencingApplyConfirmModal open={applyOpen} onClose={()=>setApplyOpen(false)}/>
    </>
  );
};

// ============ SCREEN-12 — Planning Settings ============

const PlanSettings = ({ onNav }) => {
  const [tab, setTab] = React.useState("general");
  const [dirty, setDirty] = React.useState(false);
  const s = PLAN_SETTINGS;

  const tabs = [
    { k: "general",   l: "General" },
    { k: "po",        l: "Purchase orders" },
    { k: "to",        l: "Transfer orders" },
    { k: "wo",        l: "Work orders" },
    { k: "cascade",   l: "Intermediate cascade" },
    { k: "seq",       l: "Sequencing" },
    { k: "d365",      l: "D365 integration" },
    { k: "status",    l: "Status display" },
    { k: "visibility",l: "Field visibility" },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Planning</a> · Settings</div>
          <h1 className="page-title">Planning settings</h1>
          <div className="muted" style={{fontSize:12}}>Admin-only · controls PO/TO/WO defaults, D365 trigger, workflow display, field visibility</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm" onClick={()=>setDirty(false)}>Discard changes</button>
          <button className="btn btn-primary btn-sm" disabled={!dirty} onClick={()=>setDirty(false)}>Save changes</button>
        </div>
      </div>

      {dirty && (
        <div className="set-unsaved">
          <span>⚠</span>
          <span>You have unsaved changes</span>
          <span className="spacer"></span>
          <button className="btn btn-secondary btn-sm" onClick={()=>setDirty(false)}>Discard</button>
          <button className="btn btn-primary btn-sm" onClick={()=>setDirty(false)}>Save</button>
        </div>
      )}

      <div className="set-tabs">
        {tabs.map(t => (
          <button key={t.k} className={tab === t.k ? "on" : ""} onClick={()=>setTab(t.k)}>{t.l}</button>
        ))}
      </div>

      {tab === "general" && (
        <div className="card">
          <div className="card-head"><h3 className="card-title">General</h3></div>
          <div className="set-form-grid">
            <Field label="Default PO currency"><select defaultValue={s.general.defaultCurrency} onChange={()=>setDirty(true)}><option>GBP</option><option>EUR</option><option>PLN</option><option>USD</option></select></Field>
            <Field label="Cascade max depth" help="Safety cap — range 1–20 · V-PLAN-SET-002">
              <input type="number" defaultValue={s.general.cascadeMaxDepth} min={1} max={20} onChange={()=>setDirty(true)}/>
            </Field>
            <Field label="Default intermediate disposition" help="P1 always to_stock — direct-continue and planner-decides deferred to P2">
              <select defaultValue={s.general.defaultIntermediateDisposition} disabled><option>to_stock</option></select>
            </Field>
          </div>
        </div>
      )}

      {tab === "po" && (
        <div className="card">
          <div className="card-head"><h3 className="card-title">Purchase orders</h3></div>
          <div className="set-form-grid">
            <Field label="Auto number"><Toggle defaultChecked={s.po.autoNumber} onChange={()=>setDirty(true)}/></Field>
            <Field label="Number prefix"><input type="text" defaultValue={s.po.prefix} onChange={()=>setDirty(true)}/></Field>
            <Field label="Number format" help="ICU-style pattern"><input type="text" defaultValue={s.po.numberFormat} onChange={()=>setDirty(true)}/></Field>
            <Field label="Default lead time (days)"><input type="number" defaultValue={s.po.defaultLeadTime} min={0} onChange={()=>setDirty(true)}/></Field>
            <Field label="Require approval"><Toggle defaultChecked={s.po.requireApproval} onChange={()=>setDirty(true)}/></Field>
            <Field label="Approval threshold (£)" help="V-PLAN-SET-001 · shown only when approval ON"><input type="number" defaultValue={s.po.approvalThreshold} min={0} onChange={()=>setDirty(true)}/></Field>
            <Field label="Approval roles"><select defaultValue={s.po.approvalRoles[0]} onChange={()=>setDirty(true)}><option>Production Manager</option><option>Admin</option><option>Plant Director</option></select></Field>
            <Field label="Auto-close on full receipt"><Toggle defaultChecked={s.po.autoCloseOnFullReceipt} onChange={()=>setDirty(true)}/></Field>
          </div>
        </div>
      )}

      {tab === "to" && (
        <div className="card">
          <div className="card-head"><h3 className="card-title">Transfer orders</h3></div>
          <div className="set-form-grid">
            <Field label="Auto number"><Toggle defaultChecked={s.to.autoNumber} onChange={()=>setDirty(true)}/></Field>
            <Field label="Number prefix"><input type="text" defaultValue={s.to.prefix} onChange={()=>setDirty(true)}/></Field>
            <Field label="Allow partial shipments"><Toggle defaultChecked={s.to.allowPartialShipments} onChange={()=>setDirty(true)}/></Field>
            <Field label="Require LP selection" help="Force planner to pick LP at TO create time"><Toggle defaultChecked={s.to.requireLpSelection} onChange={()=>setDirty(true)}/></Field>
          </div>
        </div>
      )}

      {tab === "wo" && (
        <div className="card">
          <div className="card-head"><h3 className="card-title">Work orders</h3></div>
          <div className="set-form-grid">
            <Field label="Auto number"><Toggle defaultChecked={s.wo.autoNumber} onChange={()=>setDirty(true)}/></Field>
            <Field label="Number prefix"><input type="text" defaultValue={s.wo.prefix} onChange={()=>setDirty(true)}/></Field>
            <Field label="Number format"><input type="text" defaultValue={s.wo.numberFormat} onChange={()=>setDirty(true)}/></Field>
            <Field label="Auto-select active BOM"><Toggle defaultChecked={s.wo.autoSelectActiveBom} onChange={()=>setDirty(true)}/></Field>
            <Field label="Copy routing"><Toggle defaultChecked={s.wo.copyRouting} onChange={()=>setDirty(true)}/></Field>
            <Field label="Require BOM"><Toggle defaultChecked={s.wo.requireBom} onChange={()=>setDirty(true)}/></Field>
            <Field label="Material check"><Toggle defaultChecked={s.wo.materialCheck} onChange={()=>setDirty(true)}/></Field>
            <Field label="Material check blocks release" help="When ON, red availability hard-blocks release"><Toggle defaultChecked={s.wo.materialCheckBlocksRelease} onChange={()=>setDirty(true)}/></Field>
            <Field label="Allow overproduction"><Toggle defaultChecked={s.wo.allowOverproduction} onChange={()=>setDirty(true)}/></Field>
            <Field label="Overproduction limit %" help="Shown only when overproduction ON"><input type="number" defaultValue={s.wo.overproductionLimit} onChange={()=>setDirty(true)}/></Field>
            <Field label="Require rework approval"><Toggle defaultChecked={s.wo.requireReworkApproval} onChange={()=>setDirty(true)}/></Field>
            <Field label="Default priority"><select defaultValue={s.wo.defaultPriority} onChange={()=>setDirty(true)}><option>Low</option><option>Normal</option><option>High</option><option>Critical</option></select></Field>
            <Field label="Auto-archive closed WOs (days)"><input type="number" defaultValue={s.wo.autoArchiveClosedDays} onChange={()=>setDirty(true)}/></Field>
          </div>
        </div>
      )}

      {tab === "cascade" && (
        <div className="card">
          <div className="set-banner info">
            <span>ⓘ</span>
            <div>Intermediate cascade is always active (catalog-driven, not flag-gated). If a BOM contains intermediate items, N+1 Work Orders are generated automatically.</div>
          </div>
          <div className="set-form-grid">
            <Field label="Cascade max depth" help="Range 1–20 · safety cap"><input type="number" defaultValue={s.cascade.maxDepth} min={1} max={20} onChange={()=>setDirty(true)}/></Field>
            <Field label="Intermediate disposition" help="P1 always to_stock. See PRD §8.5.">
              <select defaultValue={s.cascade.intermediateDisposition} disabled><option>to_stock</option></select>
            </Field>
          </div>
          <div style={{marginTop:12, paddingTop:12, borderTop:"1px solid var(--border)"}}>
            <a style={{fontSize:12, color:"var(--blue)", cursor:"pointer"}}>View <span className="mono">cascade_generation_v1</span> rule in Rule Registry →</a>
          </div>
        </div>
      )}

      {tab === "seq" && (
        <div className="card">
          <div className="set-form-grid">
            <Field label="Sequencing enabled (default for new lines)"><Toggle defaultChecked={s.sequencing.enabled} onChange={()=>setDirty(true)}/></Field>
            <Field label="Sequencing rule version"><select defaultValue={s.sequencing.ruleVersion} disabled><option>v1</option></select></Field>
          </div>
          <div style={{marginTop:14, padding:"10px 12px", background:"var(--gray-100)", borderRadius:6, fontSize:12}}>
            <div className="label" style={{marginBottom:4}}>Rule summary</div>
            <div><b className="mono">allergen_sequencing_heuristic_v1</b> · version 1.0 · author: system · created 2026-02-14</div>
            <div className="muted" style={{fontSize:11, marginTop:4}}>Target changeover reduction: <b>{s.sequencing.target}</b></div>
            <a style={{fontSize:12, color:"var(--blue)", cursor:"pointer", marginTop:6, display:"inline-block"}}>View full rule in 02-SETTINGS §7 →</a>
          </div>
        </div>
      )}

      {tab === "d365" && (
        <div>
          <div className={"set-banner " + (s.d365.enabled ? "on" : "off")}>
            <span>{s.d365.enabled ? "●" : "○"}</span>
            <b>D365 SO Trigger is currently {s.d365.enabled ? "ENABLED" : "DISABLED"}</b>
          </div>
          <div className="card">
            <div className="set-form-grid">
              <Field label="D365 SO trigger enabled" help="Master toggle for this section"><Toggle defaultChecked={s.d365.enabled} onChange={()=>setDirty(true)}/></Field>
              <Field label="SO pull cron" help="Valid cron expression · V-PLAN-SET-004"><input type="text" defaultValue={s.d365.pullCron} onChange={()=>setDirty(true)}/></Field>
              <Field label="Pull window (days)"><input type="number" defaultValue={s.d365.pullWindowDays} min={1} onChange={()=>setDirty(true)}/></Field>
              <Field label="SO status filter"><select defaultValue="Open" onChange={()=>setDirty(true)}><option>Open, Confirmed</option><option>Open</option><option>Confirmed</option><option>All</option></select></Field>
            </div>
            <div style={{marginTop:14, display:"flex", gap:8}}>
              <button className="btn btn-secondary btn-sm">↻ Test D365 connection</button>
              <button className="btn btn-primary btn-sm" onClick={()=>onNav("d365_queue")}>⇅ Trigger manual pull now</button>
            </div>
            <div style={{marginTop:14, padding:"10px 12px", background:"var(--gray-100)", borderRadius:6, fontSize:12}}>
              <div className="row-flex"><span className="muted">Last pull:</span><span className="mono">{s.d365.lastPull}</span></div>
              <div className="row-flex" style={{marginTop:3}}><span className="muted">Pulled:</span><b className="mono">{s.d365.lastSoCount}</b> SOs</div>
              <div className="row-flex" style={{marginTop:3}}><span className="muted">Draft WOs:</span><b className="mono">{s.d365.lastDraftWoCount}</b></div>
              <div className="row-flex" style={{marginTop:3}}><span className="muted">Errors:</span><b className="mono" style={{color: s.d365.lastErrors ? "var(--red-700)" : "var(--green-700)"}}>{s.d365.lastErrors}</b></div>
              <a style={{fontSize:12, color:"var(--blue)", cursor:"pointer", marginTop:6, display:"inline-block"}}>View pull history →</a>
            </div>
          </div>
        </div>
      )}

      {tab === "status" && (
        <div>
          <div className="set-banner info">
            <span>ⓘ</span>
            <div>Customise the display name and colour of each status. Workflow transitions are fixed in v1.0 and require a developer PR to change.</div>
          </div>
          <div className="card">
            <div className="card-head"><h3 className="card-title">PO statuses</h3><button className="btn btn-ghost btn-sm">Reset to defaults</button></div>
            <table>
              <thead><tr><th>Key</th><th>Label EN</th><th>Label PL</th><th>Color</th><th>Icon</th><th>Preview</th></tr></thead>
              <tbody>
                {s.statusDisplay.po.map(r => (
                  <tr key={r.key}>
                    <td className="mono" style={{fontSize:11}}>{r.key}</td>
                    <td><input type="text" defaultValue={r.labelEn} onChange={()=>setDirty(true)} style={{width:140}}/></td>
                    <td><input type="text" defaultValue={r.labelPl} onChange={()=>setDirty(true)} style={{width:140}}/></td>
                    <td>
                      <span className="color-swatch" style={{background: r.color}}></span>
                      <input type="text" defaultValue={r.color} onChange={()=>setDirty(true)} style={{width:80, fontFamily:"var(--font-mono)"}}/>
                    </td>
                    <td className="mono">{r.icon}</td>
                    <td><span className="badge" style={{background: r.color + "20", color: r.color, border:"1px solid " + r.color + "60"}}>{r.icon} {r.labelEn}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="muted" style={{fontSize:12, padding:"12px 0"}}>TO and WO status tables follow the same pattern — omitted here for brevity.</div>
        </div>
      )}

      {tab === "visibility" && (
        <div>
          <div className="set-banner info">
            <span>ⓘ</span>
            <div>Control which fields are shown or hidden per role. Hidden fields are also masked server-side for security.</div>
          </div>
          <div className="card" style={{padding:0}}>
            <table>
              <thead><tr><th>Entity</th><th>Field</th><th style={{textAlign:"center"}}>Purchaser</th><th style={{textAlign:"center"}}>Planner</th><th style={{textAlign:"center"}}>Prod Mgr</th><th style={{textAlign:"center"}}>Warehouse op</th></tr></thead>
              <tbody>
                {s.fieldVisibility.map((f,i) => (
                  <tr key={i}>
                    <td className="mono" style={{fontSize:11}}>{f.entity}</td>
                    <td className="mono" style={{fontSize:11}}>{f.field} {f.required && <span className="muted" style={{fontSize:10}}>(required)</span>}</td>
                    {["Purchaser","Planner","ProdMgr","WhOp"].map(r => (
                      <td key={r} style={{textAlign:"center"}}>
                        <Toggle defaultChecked={f[r]} disabled={f.required && f[r]} onChange={()=>setDirty(true)}/>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{textAlign:"right", marginTop:10}}>
            <button className="btn btn-primary btn-sm" disabled={!dirty}>Save field visibility</button>
          </div>
        </div>
      )}
    </>
  );
};

// Small helpers for settings forms
const Field = ({ label, help, children }) => (
  <div>
    <label style={{fontSize:11, color:"var(--muted)", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.04em", marginBottom:5, display:"block"}}>{label}</label>
    {children}
    {help && <div className="muted" style={{fontSize:11, marginTop:3}}>{help}</div>}
  </div>
);

const Toggle = ({ defaultChecked, disabled, onChange }) => (
  <label className="toggle">
    <input type="checkbox" defaultChecked={defaultChecked} disabled={disabled} onChange={onChange}/>
    <span className="slider"></span>
  </label>
);

// ============ SCREEN-13 — D365 SO Queue ============

const PlanD365Queue = ({ onNav, onOpenWo }) => {
  const [expanded, setExpanded] = React.useState(new Set());
  const [errorsOpen, setErrorsOpen] = React.useState(true);
  const [reviewWo, setReviewWo] = React.useState(null);
  const enabled = PLAN_SETTINGS.d365.enabled;

  const toggle = (wo) => {
    const next = new Set(expanded);
    if (next.has(wo)) next.delete(wo); else next.add(wo);
    setExpanded(next);
  };

  if (!enabled) {
    return (
      <>
        <div className="page-head">
          <div>
            <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Planning</a> · D365 SO queue</div>
            <h1 className="page-title">D365 SO queue</h1>
          </div>
        </div>
        <div className="d365-gate">
          <div style={{fontSize:44, opacity:0.25}}>⇅</div>
          <h2>D365 SO Trigger is Disabled</h2>
          <div className="muted" style={{fontSize:13, marginBottom:18}}>Enable the D365 SO trigger in Planning Settings to use this feature.</div>
          <button className="btn btn-primary" onClick={()=>onNav("settings")}>Go to Settings →</button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Planning</a> · D365 SO queue</div>
          <h1 className="page-title">D365 SO queue <span className="badge badge-green" style={{fontSize:10, marginLeft:10, verticalAlign:"middle"}}>Trigger: ON</span></h1>
          <div className="muted" style={{fontSize:12}}>Review draft WOs auto-generated from D365 SO pull</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm" onClick={()=>onNav("settings")}>⚙ D365 settings</button>
          <button className="btn btn-primary btn-sm">⇅ Trigger manual pull</button>
        </div>
      </div>

      <div className="d365-pull-strip">
        <div><div className="dps-label">Last pull</div><div className="dps-value">{D365_PULL_HISTORY.lastRun.slice(11)}</div><div className="muted" style={{fontSize:10}}>{D365_PULL_HISTORY.lastRun.slice(0,10)}</div></div>
        <div><div className="dps-label">SOs pulled</div><div className="dps-value">{D365_PULL_HISTORY.soCount}</div></div>
        <div><div className="dps-label">Draft WOs created</div><div className="dps-value">{D365_PULL_HISTORY.draftWoCount}</div></div>
        <div><div className="dps-label">Errors</div><div className={"dps-value " + (D365_PULL_HISTORY.errors > 0 ? "err" : "")}>{D365_PULL_HISTORY.errors}</div></div>
        <button className="btn btn-secondary btn-sm">View pull history →</button>
      </div>

      <div className="filter-bar">
        <input type="text" placeholder="Search SO reference or WO number…" style={{width:280}}/>
        <select style={{width:160}}><option>All SO statuses</option><option>Open</option><option>Confirmed</option></select>
        <select style={{width:160}}><option>All WO statuses</option><option>Draft</option><option>Released</option></select>
        <select style={{width:140}}><option>Last 24 hours</option><option>Last 7 days</option></select>
        <span className="spacer"></span>
        <span className="muted" style={{fontSize:12}}>{D365_DRAFT_WOS.length} rows</span>
      </div>

      <div className="card" style={{padding:0}}>
        <table>
          <thead><tr>
            <th>D365 SO ref</th><th>Draft WO</th><th>Product</th>
            <th style={{textAlign:"right"}}>Qty</th><th>Scheduled start</th>
            <th>Cascade</th><th>BOM</th><th>Status</th><th>Pulled</th><th style={{width:160}}></th>
          </tr></thead>
          <tbody>
            {D365_DRAFT_WOS.map((w,i) => (
              <React.Fragment key={i}>
                <tr>
                  <td className="mono" style={{fontWeight:600}}>{w.soRef}</td>
                  <td className="mono" style={{color:"var(--blue)", cursor:"pointer", fontWeight:600}} onClick={()=>onOpenWo(w.wo)}>{w.wo}</td>
                  <td>
                    <div style={{fontWeight:500, fontSize:13}}>{w.product}</div>
                    <div className="mono" style={{fontSize:11, color:"var(--muted)"}}>{w.item}</div>
                  </td>
                  <td className="num mono">{w.qty} {w.uom}</td>
                  <td className="mono" style={{fontSize:11}}>{w.start}</td>
                  <td>
                    {w.depth > 1
                      ? <span onClick={()=>toggle(w.wo)} style={{cursor:"pointer", color:"var(--blue)", fontSize:12}} title={`${w.depth} WOs in chain`}>⊶ {w.depth} layers {expanded.has(w.wo) ? "▾" : "▸"}</span>
                      : <span className="muted">—</span>}
                  </td>
                  <td className="mono" style={{fontSize:11}}>{w.bom}</td>
                  <td><WOPlanStatus s={w.status}/></td>
                  <td className="mono" style={{fontSize:11}}>{w.pullDate.slice(11)}</td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={()=>setReviewWo(w)}>Review</button>
                    <button className="btn btn-ghost btn-sm">⋯</button>
                  </td>
                </tr>
                {expanded.has(w.wo) && w.childWos && (
                  <tr>
                    <td colSpan={10} className="sub-table">
                      <div className="label" style={{marginBottom:6}}>Cascade chain — {w.childWos.length} intermediate WOs</div>
                      <div style={{display:"flex", gap:6, flexWrap:"wrap"}}>
                        {w.childWos.map(c => <span key={c} className="mono badge badge-blue" style={{fontSize:10, cursor:"pointer"}} onClick={()=>onOpenWo(c)}>{c}</span>)}
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
        <div className="card-head" style={{cursor:"pointer"}} onClick={()=>setErrorsOpen(!errorsOpen)}>
          <h3 className="card-title">{errorsOpen ? "▾" : "▸"} Pull errors</h3>
          <span className={"badge " + (D365_PULL_ERRORS.length > 0 ? "badge-red" : "badge-green")} style={{fontSize:10}}>{D365_PULL_ERRORS.length} error{D365_PULL_ERRORS.length !== 1 ? "s" : ""}</span>
        </div>
        {errorsOpen && (
          D365_PULL_ERRORS.length === 0
            ? <div className="muted" style={{fontSize:12, padding:"12px 0"}}>✓ No errors in last pull</div>
            : <table>
                <thead><tr><th>D365 SO ref</th><th>Error type</th><th>Message</th><th>Timestamp</th><th>Action</th></tr></thead>
                <tbody>
                  {D365_PULL_ERRORS.map((e,i) => (
                    <tr key={i}>
                      <td className="mono" style={{fontWeight:600}}>{e.soRef}</td>
                      <td><span className="badge badge-red" style={{fontSize:10}}>{e.errorType}</span></td>
                      <td style={{fontSize:12}}>{e.message}</td>
                      <td className="mono" style={{fontSize:11}}>{e.t}</td>
                      <td><button className="btn btn-secondary btn-sm">↻ Retry</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
        )}
      </div>

      <DraftWOReviewModal open={!!reviewWo} onClose={()=>setReviewWo(null)} wo={reviewWo}/>
    </>
  );
};

Object.assign(window, { PlanReservations, PlanSequencing, PlanSettings, PlanD365Queue });
