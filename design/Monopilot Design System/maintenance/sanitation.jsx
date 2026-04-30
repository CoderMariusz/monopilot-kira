// ============ MAINT-SAN Sanitation Checklists (D-MNT-14 + V-MNT-15/16/17) ============
// Fix-1 Maintenance (audit A2 / B3 / PRD §9.14 + §11.4):
// Bound to `sanitation_checklists` table. Captures CIP program measurements
// (temp/conc/duration/flow), allergen changeover context, ATP result, and
// BRCGS dual sign-off (technician + QA).
//
// Validations enforced client-side (also guarded server-side per PRD):
//   V-MNT-15 — `in_progress` + allergen_change_flag → first_signed_by AND
//              second_signed_by AND atp_test_result_rlu NOT NULL (critical, BRCGS).
//   V-MNT-16 — ATP RLU threshold < 30 RLU for food-contact surfaces
//              (Apex baseline, tenant L2 override; severity=critical if >30).
//   V-MNT-17 — first_signed_by != second_signed_by (dual sign-off integrity).
//
// Outbox: `sanitation.completed` / `sanitation.allergen_change.completed` events
// emitted on completion (consumer: 08-PROD allergen_changeover_gate_v1).
// Retention: BRCGS 7 years from completed_at (shown in footer).

// ATP threshold — in production comes from Settings §13.2 maintenance_alert_thresholds.
const MNT_ATP_RLU_THRESHOLD = 30;

// --- V-MNT-15/16/17 client-side guard — returns array of violation strings ---
const evaluateSanitationValidations = (c) => {
  const violations = [];
  // V-MNT-15: dual sign-off + ATP mandatory for allergen changeover in progress
  if (c.allergenChangeFlag && c.status === "in_progress") {
    if (!c.firstSignedBy)      violations.push({ code: "V-MNT-15", sev: "critical", text: "First sign-off (technician) required before in_progress." });
    if (!c.secondSignedBy)     violations.push({ code: "V-MNT-15", sev: "critical", text: "Second sign-off (QA) required for allergen changeover (BRCGS dual sign-off)." });
    if (c.atpRlu === null ||
        c.atpRlu === undefined) violations.push({ code: "V-MNT-15", sev: "critical", text: "ATP test result (RLU) required for allergen changeover (BRCGS)." });
  }
  // V-MNT-16: ATP threshold
  if (c.atpRlu !== null && c.atpRlu !== undefined && c.atpRlu >= MNT_ATP_RLU_THRESHOLD) {
    violations.push({ code: "V-MNT-16", sev: "critical", text: `ATP ${c.atpRlu} RLU exceeds ${MNT_ATP_RLU_THRESHOLD} RLU threshold — re-clean required (atp_fail).` });
  }
  // V-MNT-17: dual sign-off integrity — must be different users
  if (c.firstSignedBy && c.secondSignedBy && c.firstSignedBy === c.secondSignedBy) {
    violations.push({ code: "V-MNT-17", sev: "critical", text: "Dual sign-off integrity — first and second signer must be different users." });
  }
  return violations;
};

// --- ATP badge: green < threshold, red >= threshold, amber pending ---
const AtpBadge = ({ rlu }) => {
  if (rlu === null || rlu === undefined) {
    return <span className="badge badge-amber" style={{fontSize:10}}>ATP pending</span>;
  }
  if (rlu >= MNT_ATP_RLU_THRESHOLD) {
    return <span className="badge badge-red" style={{fontSize:10}} title="V-MNT-16 failure">ATP {rlu} RLU · FAIL</span>;
  }
  return <span className="badge badge-green" style={{fontSize:10}}>ATP {rlu} RLU · PASS</span>;
};

// --- Sign-off chip: shows who + ts, or pending ---
const SignoffChip = ({ by, at, label }) => {
  if (!by) return <span className="badge badge-amber" style={{fontSize:10}}>{label} — pending</span>;
  return (
    <span className="badge badge-green" style={{fontSize:10}} title={at || ""}>
      {label} · {by}
    </span>
  );
};

// --- Status badge for sanitation record ---
const SanStatus = ({ s }) => {
  const map = {
    in_progress: { c: "badge-amber", l: "In Progress" },
    completed:   { c: "badge-green", l: "Completed" },
    failed:      { c: "badge-red",   l: "Failed (re-clean)" },
    cancelled:   { c: "badge-gray",  l: "Cancelled" },
  };
  const x = map[s] || { c: "badge-gray", l: s };
  return <span className={"badge " + x.c} style={{fontSize:10}}>{x.l}</span>;
};

// ============ List screen ============

const MntSanitationList = ({ onNav, openModal, role }) => {
  const [tab, setTab] = React.useState("all");
  const [productTypeFilter, setProductTypeFilter] = React.useState("all");
  const [search, setSearch] = React.useState("");

  const isManager = role === "Manager" || role === "Admin";
  const rows = MNT_SANITATION_CHECKLISTS;

  // §3.2 TabsCounted — All / In progress / Allergen / Completed / Failed
  const allergenFlagged = rows.filter(r => r.allergenChangeFlag);
  const inProgress      = rows.filter(r => r.status === "in_progress");
  const completed       = rows.filter(r => r.status === "completed");
  const failed          = rows.filter(r => r.status === "failed");

  const tabs = [
    { key: "all",         label: "All",            count: rows.length,            tone: "neutral" },
    { key: "in_progress", label: "In Progress",    count: inProgress.length,      tone: "info" },
    { key: "allergen",    label: "Allergen",       count: allergenFlagged.length, tone: "warn" },
    { key: "completed",   label: "Completed",      count: completed.length,       tone: "ok" },
    { key: "failed",      label: "Failed",         count: failed.length,          tone: "bad" },
  ];

  const visible = rows.filter(r => {
    if (tab === "in_progress" && r.status !== "in_progress") return false;
    if (tab === "allergen" && !r.allergenChangeFlag) return false;
    if (tab === "completed" && r.status !== "completed") return false;
    if (tab === "failed" && r.status !== "failed") return false;
    if (productTypeFilter !== "all" && r.productType !== productTypeFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!(r.id.toLowerCase().includes(s) ||
            r.mwo.toLowerCase().includes(s) ||
            r.asset.toLowerCase().includes(s) ||
            (r.priorProduct || "").toLowerCase().includes(s) ||
            (r.nextProduct || "").toLowerCase().includes(s))) return false;
    }
    return true;
  });

  const pendingQaSignoff = allergenFlagged.filter(r => r.status === "in_progress" && !r.secondSignedBy).length;
  const atpFailCount     = rows.filter(r => r.atpRlu !== null && r.atpRlu >= MNT_ATP_RLU_THRESHOLD).length;

  return (
    <>
      {/* §3.4 sticky-form-header — list may scroll long with filter bar */}
      <div className="page-head sticky-form-header" style={{padding:"10px 0"}}>
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Maintenance</a> · Sanitation</div>
          <h1 className="page-title">Sanitation checklists <span className="muted" style={{fontSize:12, fontWeight:400}}>(D-MNT-14 · BRCGS allergen dual sign-off)</span></h1>
          <div className="muted" style={{fontSize:12}}>
            {rows.length} records · {inProgress.length} in progress · {allergenFlagged.length} allergen · {pendingQaSignoff} awaiting QA sign-off · {atpFailCount} ATP fails
          </div>
        </div>
        <div className="row-flex">
          <input type="text" placeholder="Search SAN#, mWO, asset, product…" value={search} onChange={e=>setSearch(e.target.value)} style={{width:260}}/>
          <button className="btn btn-secondary btn-sm">⇪ Export (BRCGS audit)</button>
          {isManager && <button className="btn btn-primary btn-sm" onClick={()=>openModal("mwoCreate", { prefillType: "sanitation" })}>＋ New sanitation mWO</button>}
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="kpi-grid-6">
        <div className="kpi"><div className="kpi-label">Records (30d)</div><div className="kpi-value">{rows.length}</div><div className="kpi-sub">All CIP programs</div></div>
        <div className="kpi amber"><div className="kpi-label">Awaiting QA sign-off</div><div className="kpi-value">{pendingQaSignoff}</div><div className="kpi-sub">Allergen changeovers</div></div>
        <div className="kpi red"><div className="kpi-label">ATP fails</div><div className="kpi-value">{atpFailCount}</div><div className="kpi-sub">RLU ≥ {MNT_ATP_RLU_THRESHOLD} · V-MNT-16</div></div>
        <div className="kpi green"><div className="kpi-label">Completed (30d)</div><div className="kpi-value">{completed.length}</div><div className="kpi-sub">BRCGS compliant</div></div>
        <div className="kpi blue"><div className="kpi-label">ATP threshold</div><div className="kpi-value mono">&lt; {MNT_ATP_RLU_THRESHOLD}</div><div className="kpi-sub">RLU (Apex L1 baseline)</div></div>
        <div className="kpi"><div className="kpi-label">Allergen changeovers</div><div className="kpi-value">{allergenFlagged.length}</div><div className="kpi-sub">Dual sign-off required</div></div>
      </div>

      {/* Tabs — §3.2 TabsCounted */}
      <div style={{marginBottom:10}}>
        <TabsCounted current={tab} tabs={tabs} onChange={setTab} ariaLabel="Sanitation filter tabs"/>
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        <label>Product type</label>
        <select value={productTypeFilter} onChange={e=>setProductTypeFilter(e.target.value)}>
          <option value="all">All</option>
          {MNT_SANITATION_PRODUCT_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
      </div>

      {/* List */}
      {visible.length === 0 && (
        <div className="card">
          <EmptyState icon="🧼" title="No sanitation records match your filters"
            body="Try clearing filters or widening the tab selection. New records are created when a sanitation-type mWO is started."
            action={{ label: "Clear filters", onClick: ()=>{ setTab("all"); setProductTypeFilter("all"); setSearch(""); } }}/>
        </div>
      )}

      {visible.length > 0 && (
        <div className="card" style={{padding:0}}>
          <table>
            <thead>
              <tr>
                <th>SAN #</th>
                <th>mWO</th>
                <th>Asset / Line</th>
                <th>Product type</th>
                <th>Start time</th>
                <th>Performed by</th>
                <th>Allergen</th>
                <th>ATP (RLU)</th>
                <th>Sign-off (1st / 2nd)</th>
                <th>Status</th>
                <th style={{width:120}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(r => {
                const violations = evaluateSanitationValidations(r);
                const hasCritical = violations.some(v => v.sev === "critical");
                return (
                  <tr key={r.id} className={hasCritical ? "row-overdue" : ""} style={{cursor:"pointer"}} onClick={()=>onNav("sanitation")}>
                    <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{r.id}</td>
                    <td className="mono" style={{fontSize:11}}>
                      <a onClick={e=>{ e.stopPropagation(); onNav("mwo_detail"); }} style={{color:"var(--blue)", cursor:"pointer"}}>{r.mwo}</a>
                    </td>
                    <td style={{fontSize:11}}>
                      <div style={{fontWeight:600}}>{r.asset}</div>
                      <div className="muted mono" style={{fontSize:10}}>{r.line}</div>
                    </td>
                    <td style={{fontSize:11}}>
                      {(MNT_SANITATION_PRODUCT_TYPES.find(t=>t.key===r.productType) || {}).label || r.productType}
                      {r.priorProduct && r.nextProduct && (
                        <div className="muted" style={{fontSize:10}}>
                          {r.priorProduct.split(" · ")[0]} → {r.nextProduct.split(" · ")[0]}
                        </div>
                      )}
                    </td>
                    <td className="mono" style={{fontSize:11}}>{r.startedAt}</td>
                    <td style={{fontSize:11}}>{r.firstSignedBy || <span className="muted">—</span>}</td>
                    <td>
                      {r.allergenChangeFlag
                        ? <span className="badge badge-amber" style={{fontSize:10}} title={`Removed: ${(r.allergensRemoved||[]).join(", ") || "—"}`}>
                            Allergen · {(r.allergensRemoved||[]).join(", ") || "—"}
                          </span>
                        : <span className="muted">—</span>}
                    </td>
                    <td><AtpBadge rlu={r.atpRlu}/></td>
                    <td style={{fontSize:10}}>
                      <div style={{display:"flex", flexDirection:"column", gap:2}}>
                        <SignoffChip by={r.firstSignedBy} at={r.firstSignedAt} label="Tech"/>
                        {r.allergenChangeFlag && <SignoffChip by={r.secondSignedBy} at={r.secondSignedAt} label="QA"/>}
                      </div>
                    </td>
                    <td><SanStatus s={r.status}/></td>
                    <td onClick={e=>e.stopPropagation()}>
                      {r.status === "in_progress" && r.allergenChangeFlag && !r.secondSignedBy && (
                        <button className="btn btn-primary btn-sm" onClick={()=>openModal("stateTransition", { entity: r.id, to: "qa_signoff" })}>QA sign-off</button>
                      )}
                      {r.status === "in_progress" && !r.allergenChangeFlag && (
                        <button className="btn btn-primary btn-sm" onClick={()=>openModal("stateTransition", { entity: r.id, to: "completed" })}>Complete</button>
                      )}
                      {r.status === "failed" && isManager && (
                        <button className="btn btn-secondary btn-sm" onClick={()=>openModal("mwoCreate", { prefillType: "sanitation", reclean: r.id })}>Re-clean</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Validation banner for in-progress records with open critical violations */}
      {visible.some(r => evaluateSanitationValidations(r).some(v => v.sev === "critical")) && (
        <div className="alert-box alert-red" style={{marginTop:10, fontSize:12}}>
          <span>🚨</span>
          <div>
            <strong>Critical validations pending</strong> — one or more records have V-MNT-15/16/17 violations.
            Records flagged red must be resolved (QA sign-off, ATP re-test, or re-clean) before the line can be released.
          </div>
        </div>
      )}

      {/* Rules legend */}
      <div className="card" style={{marginTop:10, padding:"10px 14px", fontSize:11}}>
        <strong style={{fontSize:11}}>Validation rules (PRD §11.4)</strong>
        <ul style={{margin:"6px 0 0 18px", padding:0, color:"var(--muted)"}}>
          <li><span className="mono">V-MNT-15</span> — Allergen changeover requires technician sign-off + QA dual sign-off + ATP result before <em>in_progress</em> (BRCGS).</li>
          <li><span className="mono">V-MNT-16</span> — ATP result must be &lt; {MNT_ATP_RLU_THRESHOLD} RLU on food-contact surfaces; otherwise <em>atp_fail</em> and re-clean required.</li>
          <li><span className="mono">V-MNT-17</span> — Dual sign-off integrity: first and second signer must be different users.</li>
        </ul>
      </div>

      {/* BRCGS retention footer */}
      <div className="muted" style={{marginTop:10, fontSize:11, padding:"8px 14px", borderTop:"1px dashed var(--border)"}}>
        📄 <strong>BRCGS retention</strong> — sanitation_checklists records are retained for <strong>7 years</strong> from <span className="mono">completed_at</span> per BRCGS Global Standard for Food Safety (Issue 9, §4.11) and FSMA 204 traceability.
        Outbox events <span className="mono">sanitation.completed</span> and <span className="mono">sanitation.allergen_change.completed</span> are emitted to 08-PROD <span className="mono">allergen_changeover_gate_v1</span>.
      </div>
    </>
  );
};

Object.assign(window, { MntSanitationList, evaluateSanitationValidations, MNT_ATP_RLU_THRESHOLD });
