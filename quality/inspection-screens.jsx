// ============ QA-005 Incoming Inspections + QA-005a Detail + QA-006/007 P2 ============

const QaIncomingList = ({ onOpenInsp, onNav, openModal, role }) => {
  const [status, setStatus] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [assigned, setAssigned] = React.useState("all");

  const visible = QA_INSPECTIONS.filter(i =>
    (status === "all" || i.status === status) &&
    (assigned === "all" || (assigned === "mine" ? i.assignedTo === "QA.Inspector1" : i.assignedTo === assigned)) &&
    (!search || i.id.toLowerCase().includes(search.toLowerCase()) || i.grn.toLowerCase().includes(search.toLowerCase()))
  );

  const overdueCount = QA_INSPECTIONS.filter(i => i.urgency === "overdue" && i.status !== "completed" && i.status !== "cancelled").length;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={() => onNav("dashboard")}>Quality</a> · Inspections · Incoming</div>
          <h1 className="page-title">Incoming Inspections</h1>
          <div className="muted" style={{fontSize: 12}}>{QA_INSPECTIONS.length} inspections · {QA_INSPECTIONS.filter(i => i.status === "pending").length} pending · {QA_INSPECTIONS.filter(i => i.status === "in_progress").length} in progress · {overdueCount} overdue</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm">⇪ Export</button>
          <button className="btn btn-primary btn-sm" onClick={() => openModal("inspectionAssign")}>＋ Create manual inspection</button>
        </div>
      </div>

      {overdueCount > 0 && (
        <div className="alert-box alert-amber" style={{marginBottom: 10, fontSize: 12}}>
          <span>⚠</span>
          <div>{overdueCount} inspection{overdueCount > 1 ? "s are" : " is"} overdue — <a style={{color: "var(--blue)", cursor: "pointer"}} onClick={() => setStatus("pending")}>View overdue</a></div>
        </div>
      )}

      <div className="tabs-bar">
        {[
          { k: "all", l: "All", c: QA_INSPECTIONS.length },
          { k: "pending", l: "Pending", c: QA_INSPECTIONS.filter(i => i.status === "pending").length },
          { k: "assigned", l: "Assigned", c: QA_INSPECTIONS.filter(i => i.status === "assigned").length },
          { k: "in_progress", l: "In progress", c: QA_INSPECTIONS.filter(i => i.status === "in_progress").length },
          { k: "completed", l: "Completed", c: QA_INSPECTIONS.filter(i => i.status === "completed").length },
          { k: "cancelled", l: "Cancelled", c: QA_INSPECTIONS.filter(i => i.status === "cancelled").length },
        ].map(t => (
          <button key={t.k} className={"tab-btn " + (status === t.k ? "on" : "")} onClick={() => setStatus(t.k)}>{t.l} <span className="count">{t.c}</span></button>
        ))}
      </div>

      <div className="filter-bar">
        <input type="text" placeholder="Search inspection # or GRN…" value={search} onChange={e => setSearch(e.target.value)} style={{width: 240}}/>
        <select value={assigned} onChange={e => setAssigned(e.target.value)} style={{width: 180}}>
          <option value="all">All inspectors</option>
          <option value="mine">Assigned to me</option>
          <option value="QA.Inspector1">QA.Inspector1</option>
          <option value="QA.Inspector2">QA.Inspector2</option>
        </select>
        <select style={{width: 130}}><option>All priorities</option><option>Urgent</option><option>High</option><option>Normal</option></select>
        <input type="date" style={{width: 140}} placeholder="Date from"/>
        <span className="spacer"></span>
        <button className="clear-all" onClick={() => { setSearch(""); setStatus("all"); setAssigned("all"); }}>Clear</button>
        <span className="muted" style={{fontSize: 12}}>{visible.length} rows</span>
      </div>

      <div className="card" style={{padding: 0}}>
        <table>
          <thead>
            <tr>
              <th>Inspection #</th><th>GRN / PO</th><th>Product</th><th>Priority</th><th>Status</th>
              <th>Urgency</th><th>Assigned to</th><th>Scheduled</th><th>Sampling plan</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(i => (
              <tr key={i.id} style={{cursor: "pointer"}} onClick={() => onOpenInsp(i.id)} className={i.urgency === "overdue" && i.status !== "completed" ? "row-overdue" : ""}>
                <td><span className="dcode">{i.id}</span></td>
                <td><div className="mono" style={{fontSize: 11, color: "var(--blue)"}}>{i.grn}</div><div className="mono" style={{fontSize: 10, color: "var(--muted)"}}>{i.po}</div></td>
                <td style={{fontSize: 11}}>{i.product}</td>
                <td><PriorityBadge p={i.priority}/></td>
                <td><StatusBadge s={i.status}/></td>
                <td><UrgencyBadge u={i.urgency}/></td>
                <td style={{fontSize: 11}}>{i.assignedTo || <span className="muted">Unassigned</span>}</td>
                <td className="mono" style={{fontSize: 11}}>{i.scheduled}</td>
                <td className="mono" style={{fontSize: 11}}>{i.samplingPlan}</td>
                <td onClick={e => e.stopPropagation()}>
                  {i.status === "pending" && <button className="btn btn-ghost btn-sm" onClick={() => openModal("inspectionAssign", i)}>Assign</button>}
                  {(i.status === "assigned" || i.status === "in_progress") && <button className="btn btn-primary btn-sm" onClick={() => onOpenInsp(i.id)}>Start</button>}
                  {i.status === "completed" && (<><span style={{fontSize: 10}}><ResultBadge r={i.result}/></span><button className="btn btn-ghost btn-sm" style={{marginLeft: 4}} onClick={() => onOpenInsp(i.id)}>View</button></>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

// ============ QA-005a Inspection Detail & Results Form ============
const QaInspectionDetail = ({ inspId, onBack, onNav, openModal, role }) => {
  const insp = QA_INSPECTIONS.find(x => x.id === inspId) || QA_INSPECTIONS[4]; // default INS-2026-0474 (in_progress)
  const d = insp.id === QA_INSPECTION_DETAIL.id ? QA_INSPECTION_DETAIL : { ...QA_INSPECTION_DETAIL, id: insp.id, status: insp.status, assignedTo: insp.assignedTo || "QA.Inspector1", scheduled: insp.scheduled };
  const [measurements, setMeasurements] = React.useState(d.measurements);
  const [failReason, setFailReason] = React.useState("");
  const [failNotes, setFailNotes] = React.useState("");

  const isCompleted = insp.status === "completed";
  const isSigned = !!insp.signedAt;
  const editable = insp.status === "in_progress" || insp.status === "assigned";

  const updateMeasured = (idx, v) => {
    const next = [...measurements];
    const p = next[idx];
    const num = +v;
    let result = "pending";
    if (p.type === "Measurement" || p.type === "Chemical" || p.type === "Microbiological") {
      if (v === "" || v === null) result = "pending";
      else if (num >= p.min && num <= p.max) result = "pass";
      else result = "fail";
    } else {
      result = v ? "pass" : "pending";
    }
    next[idx] = { ...p, measured: v, result };
    setMeasurements(next);
  };

  const allCriticalDone = measurements.every(m => !m.critical || (m.result === "pass" || m.result === "fail"));
  const hasCriticalFail = measurements.some(m => m.critical && m.result === "fail");
  const hasAnyFail = measurements.some(m => m.result === "fail");
  const allPass = measurements.every(m => m.result === "pass");
  const overallResult = hasCriticalFail ? "fail" : hasAnyFail ? "cond" : allPass ? "pass" : "pending";

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={() => onNav("dashboard")}>Quality</a> · <a onClick={onBack}>Incoming</a> · {insp.id}</div>
          <h1 className="page-title" style={{display: "flex", alignItems: "center", gap: 10}}>
            <a onClick={onBack} style={{fontSize: 14, color: "var(--blue)", cursor: "pointer", fontWeight: 400}}>← Inspections</a>
            <span>{insp.id}</span>
            <StatusBadge s={insp.status}/>
            <PriorityBadge p={insp.priority}/>
            {isSigned && <span className="qa-badge badge-signed">🔒 Signed</span>}
          </h1>
        </div>
      </div>

      {insp.urgency === "overdue" && !isCompleted && (
        <div className="alert-box alert-amber" style={{marginBottom: 10, fontSize: 12}}>
          <span>⚠</span><div>This inspection is overdue by 4 hours. <a style={{color: "var(--blue)", cursor: "pointer"}}>Mark urgent</a></div>
        </div>
      )}

      {isSigned && (
        <div className="signed-banner">
          <span className="sb-ic">🔒</span>
          <div>This inspection was completed and signed on <b>{insp.signedAt}</b> by <b>{d.assignedTo}</b>. Record is immutable (21 CFR Part 11).</div>
        </div>
      )}

      <div style={{display: "grid", gridTemplateColumns: "1fr 380px", gap: 14}}>
        {/* LEFT — Test results */}
        <div>
          <div className="card" style={{padding: 14}}>
            <div className="row-flex" style={{marginBottom: 10}}>
              <h4 style={{margin: 0, fontSize: 14}}>Test Parameters</h4>
              <span className="spacer"></span>
              <button className="btn btn-secondary btn-sm" onClick={() => openModal("sampleDraw", d)} disabled={!editable}>＋ Draw Sample</button>
              <button className="btn btn-ghost btn-sm">＋ Add lab result</button>
            </div>
            <table>
              <thead><tr><th>Parameter</th><th>Type</th><th>Target (min–max)</th><th style={{width: 180}}>Measured value</th><th>Auto result</th><th>Notes</th></tr></thead>
              <tbody>
                {measurements.map((m, i) => (
                  <tr key={i} className={m.critical ? "insp-param-row critical" : "insp-param-row"}>
                    <td style={{fontSize: 11}}>{m.name} {m.critical && <span className="qa-badge badge-critical" style={{fontSize: 9}}>critical</span>}</td>
                    <td><span className="qa-badge badge-draft">{m.type}</span></td>
                    <td className="mono" style={{fontSize: 11}}>{m.target !== null && m.target !== undefined ? m.target : "—"} ({m.min ?? "—"}–{m.max ?? "—"}) <span className="unit">{m.unit}</span></td>
                    <td>
                      <div className="measured-cell">
                        {(m.type === "Measurement" || m.type === "Chemical" || m.type === "Microbiological")
                          ? <><input type="number" value={m.measured ?? ""} onChange={e => updateMeasured(i, e.target.value)} disabled={!editable} step="0.01"/><span className="unit">{m.unit}</span></>
                          : <input type="text" value={m.measured || ""} onChange={e => updateMeasured(i, e.target.value)} disabled={!editable} style={{width: 140, fontSize: 11}}/>}
                      </div>
                    </td>
                    <td>
                      <div className="result-cell">
                        <span className="auto-label">Auto</span>
                        <ResultBadge r={m.result}/>
                      </div>
                    </td>
                    <td><input type="text" placeholder="Note…" style={{width: 100, fontSize: 11}} disabled={!editable}/></td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Overall result banner */}
            <div className={"overall-result " + overallResult}>
              <div>
                <div style={{fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600}}>Overall result (auto-computed)</div>
                <div className="res-big">{overallResult.toUpperCase()}</div>
              </div>
              <div style={{fontSize: 11, flex: 1, marginLeft: 10}}>
                {overallResult === "pass" && <>All parameters pass. LP release authorised.</>}
                {overallResult === "fail" && <>Critical parameter fail — V-QA-INSP-003. Submit will auto-create NCR + hold.</>}
                {overallResult === "cond" && <>Non-critical fail — conditional accept. Quality lead review required.</>}
                {overallResult === "pending" && <>Waiting for results on {measurements.filter(m => m.result === "pending").length} parameter(s).</>}
              </div>
            </div>

            {(overallResult === "fail" || hasAnyFail) && editable && (
              <div style={{marginTop: 10}}>
                <div className="label" style={{fontSize: 11, fontWeight: 600, textTransform: "uppercase"}}>Fail reason</div>
                <div className="ff-inline">
                  <Field label="Fail reason code" required error={overallResult === "fail" && !failReason && !failNotes ? "V-QA-INSP-006 — reason code OR notes required" : null}>
                    <select value={failReason} onChange={e => setFailReason(e.target.value)}>
                      <option value="">— Select —</option>
                      {QA_FAILURE_REASONS.map(r => <option key={r.code} value={r.code}>{r.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Fail notes" help="Required if code = other">
                    <textarea value={failNotes} onChange={e => setFailNotes(e.target.value)} placeholder="Describe the non-conformance in detail…" rows={2}/>
                  </Field>
                </div>
                <div className="alert-box alert-amber" style={{fontSize: 12, marginTop: 8}}>
                  <span>⚠</span>
                  <div>An NCR draft will be automatically created when you submit this inspection. <a style={{color: "var(--blue)", cursor: "pointer"}}>Preview NCR</a></div>
                </div>
              </div>
            )}
          </div>

          {/* Action bar */}
          {editable && (
            <div className="qa-action-bar">
              <button className="btn btn-secondary btn-sm">Save draft</button>
              <button className="btn btn-ghost btn-sm" style={{color: "var(--red-700)"}}>Cancel inspection</button>
              <span className="spacer"></span>
              {overallResult === "pass" && <button className="btn btn-sm" style={{background: "var(--green)", color: "#fff", border: 0}} onClick={() => openModal("eSign", { meaning: "inspection pass" })}>🔒 Submit & release LP</button>}
              {overallResult === "fail" && <button className="btn btn-danger btn-sm" disabled={!allCriticalDone || (!failReason && !failNotes)} onClick={() => openModal("eSign", { meaning: "inspection fail" })}>🔒 Submit & create hold</button>}
              {overallResult === "cond" && <button className="btn btn-primary btn-sm" onClick={() => openModal("eSign", { meaning: "conditional" })}>🔒 Submit (conditional)</button>}
              {overallResult === "pending" && <button className="btn btn-primary btn-sm" disabled title="V-QA-INSP-003 — critical params must have results before submit">Submit inspection</button>}
            </div>
          )}
        </div>

        {/* RIGHT — Reference context */}
        <div>
          <div className="qa-detail-card">
            <h4>GRN / Source</h4>
            <div className="qa-detail-field"><span className="label">GRN</span><span className="value"><a className="dcode">{d.grn}</a></span></div>
            <div className="qa-detail-field"><span className="label">PO</span><span className="value mono">{d.po}</span></div>
            <div className="qa-detail-field"><span className="label">Supplier</span><span className="value">{d.supplier}</span></div>
            <div className="qa-detail-field"><span className="label">Receipt</span><span className="value mono">{d.receiptDate}</span></div>
          </div>

          <div className="qa-detail-card">
            <h4>Product</h4>
            <div className="qa-detail-field"><span className="label">Code</span><span className="value mono">{d.product.code}</span></div>
            <div className="qa-detail-field"><span className="label">Name</span><span className="value">{d.product.name}</span></div>
          </div>

          <div className="qa-detail-card">
            <h4>Specification</h4>
            <div className="qa-detail-field"><span className="label">Spec</span><span className="value"><a className="dcode">{d.spec.id}</a> v{d.spec.version} <StatusBadge s={d.spec.status}/></span></div>
            {d.spec.status !== "active" && <div className="alert-box alert-amber" style={{fontSize: 11, marginTop: 6}}><span>⚠</span><div>Spec is not active. Assign an active spec before submitting. <a style={{color: "var(--blue)", cursor: "pointer"}}>Change spec</a></div></div>}
          </div>

          <div className="qa-detail-card">
            <h4>Sampling plan</h4>
            <div className="qa-detail-field"><span className="label">Plan</span><span className="value mono">{d.samplingPlan.code}</span></div>
            <div className="qa-detail-field"><span className="label">AQL</span><span className="value mono">{d.samplingPlan.aql} — {d.samplingPlan.level}</span></div>
            <div className="qa-detail-field"><span className="label">Lot size</span><span className="value mono">{d.samplingPlan.lotSize}</span></div>
            <div className="qa-detail-field"><span className="label">Required</span><span className="value mono">n = {d.samplingPlan.sampleSize} · Ac={d.samplingPlan.accept} · Re={d.samplingPlan.reject}</span></div>
            <div style={{fontSize: 11, marginTop: 6}}>
              <div className="muted" style={{marginBottom: 3}}>Sample draw progress: {d.samplesTaken} / {d.samplesRequired}</div>
              <div className="grn-prog"><span style={{width: (d.samplesTaken / d.samplesRequired * 100) + "%"}}></span></div>
            </div>
          </div>

          <div className="qa-detail-card">
            <h4>LP(s) under inspection</h4>
            <table>
              <thead><tr><th>LP</th><th>Qty</th><th>Location</th></tr></thead>
              <tbody>
                {d.lps.map((l, i) => (
                  <tr key={i}><td className="mono" style={{color: "var(--blue)"}}>{l.lp}</td><td className="num mono">{l.qty} kg</td><td style={{fontSize: 11}}>{l.loc}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
};

// ============ QA-006 / QA-007 P2 Placeholders ============
const QaInProcessP2 = ({ onNav }) => (
  <>
    <div className="page-head">
      <div>
        <div className="breadcrumb"><a onClick={() => onNav("dashboard")}>Quality</a> · Inspections · In-Process</div>
        <h1 className="page-title">In-Process Inspections <span className="badge badge-blue" style={{fontSize: 10, marginLeft: 8}}>P2</span></h1>
      </div>
    </div>
    <div className="alert-box alert-blue" style={{fontSize: 12, marginBottom: 14}}>
      <span>ⓘ</span>
      <div>In-Process Inspections will be available in Phase 2 (Epic 8F). They are triggered automatically by Work Order operation milestones and allow inspectors to take samples mid-production without stopping the line.</div>
    </div>
    <div className="p2-overlay">
      <div className="p2-big">Coming in Phase 2</div>
      <div className="p2-sub">WO-attached mid-production inspections. Triggers from 08-PRODUCTION operation milestones. Timeline chart of in-line readings; deferred sample entry from scanner (SCN-070 flow).</div>
      <button className="btn btn-secondary btn-sm" style={{marginTop: 10}}>View roadmap</button>
    </div>
    <div className="card p2-mock" style={{padding: 14}}>
      <table><thead><tr><th>Inspection</th><th>WO</th><th>Operation</th><th>Result</th></tr></thead>
        <tbody><tr><td className="mono">INS-IP-...</td><td className="mono">WO-...</td><td>Mid-cook sample</td><td>PASS</td></tr>
        <tr><td className="mono">INS-IP-...</td><td className="mono">WO-...</td><td>Pre-pack weight</td><td>PASS</td></tr>
        <tr><td className="mono">INS-IP-...</td><td className="mono">WO-...</td><td>Metal detect verify</td><td>PASS</td></tr></tbody>
      </table>
    </div>
  </>
);

const QaFinalP2 = ({ onNav }) => (
  <>
    <div className="page-head">
      <div>
        <div className="breadcrumb"><a onClick={() => onNav("dashboard")}>Quality</a> · Inspections · Final</div>
        <h1 className="page-title">Final Inspections <span className="badge badge-blue" style={{fontSize: 10, marginLeft: 8}}>P2</span></h1>
      </div>
    </div>
    <div className="alert-box alert-blue" style={{fontSize: 12, marginBottom: 14}}>
      <span>ⓘ</span>
      <div>Final (pre-release) inspections will be available in Phase 2 (Epic 8F). They are the last gate before batch release and feed into the batch_release_gate_v1 rule.</div>
    </div>
    <div className="p2-overlay">
      <div className="p2-big">Coming in Phase 2</div>
      <div className="p2-sub">Pre-release inspection gate. Checks: final microbiological clearance, label compliance, package integrity, weight variance. Feeds Batch Release (QA-010).</div>
    </div>
  </>
);

Object.assign(window, { QaIncomingList, QaInspectionDetail, QaInProcessP2, QaFinalP2 });
