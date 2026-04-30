// ============================================================
// PLANNING+ MODALS — follows _shared/MODAL-SCHEMA.md
//
// Modal inventory (12 components, min 10 required):
//   M-01  RunSchedulerModal          — MODAL-07-01 wizard-style run launcher
//   M-02  OverrideAssignmentModal    — MODAL-07-03 override with reason
//   M-03  RescheduleWOModal          — MODAL-07-03 reschedule variant (FA-line eligibility)
//   M-04  ApproveAllModal            — bulk approve confirm (run-grouped)
//   M-05  MatrixCellEditModal        — MODAL-07-02-CELL edit changeover
//   M-06  MatrixPublishModal         — confirm-publish new version
//   M-07  MatrixImportModal          — CSV import w/ validation
//   M-08  MatrixDiffModal            — version diff (wide)
//   M-09  ForecastUploadModal        — MODAL-07-03-UPLOAD forecast CSV
//   M-10  DispositionDecisionModal   — MODAL-07-04 (P2) countdown + extend
//   M-11  RerunConfirmModal          — confirm re-run with same params
//   M-12  DisableV2Modal             — toggle v2 off (destructive confirm)
//   M-13  RequestReviewModal         — BLOCKED cell review request
// ============================================================

// -------- M-01: Run Scheduler Modal (MODAL-07-01) --------
const RunSchedulerModal = ({ open, onClose, data }) => {
  const [horizon, setHorizon] = React.useState("7d");
  const [linesChecked, setLinesChecked] = React.useState(new Set(PEXT_LINES.map(l => l.id)));
  const [includeForecast, setIncludeForecast] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const canSubmit = linesChecked.size > 0 && !submitting;

  const toggleLine = (id) => {
    const n = new Set(linesChecked);
    if (n.has(id)) n.delete(id); else n.add(id);
    setLinesChecked(n);
  };

  const submit = async () => {
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 450));
    setSubmitting(false);
    if (data?.onConfirm) data.onConfirm({ horizon, lines: [...linesChecked], includeForecast });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Run scheduler" subtitle="Submit a solver run to generate draft assignments" size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!canSubmit} onClick={submit}>
          {submitting ? "Submitting…" : "↯ Run optimizer"}
        </button>
      </>}>
      <Field label="Horizon" required>
        <div className="horizon-pills" style={{width:"100%"}}>
          <button className={horizon === "7d" ? "on" : ""} onClick={()=>setHorizon("7d")}>7 days (default)</button>
          <button className="disabled" title="Requires flag: scheduler.horizon_14d.enabled">14 days (P2)</button>
        </div>
      </Field>

      <Field label="Production lines" required help={linesChecked.size === 0 ? "" : linesChecked.size + " of 5 lines selected"}
             error={linesChecked.size === 0 ? "Select at least one production line." : null}>
        <div style={{display:"grid", gap:6}}>
          {PEXT_LINES.map(l => (
            <label key={l.id} style={{display:"flex", alignItems:"center", gap:8, padding:"6px 10px", background:"var(--gray-050)", border:"1px solid var(--border)", borderRadius:4, fontSize:12, cursor:"pointer"}}>
              <input type="checkbox" checked={linesChecked.has(l.id)} onChange={()=>toggleLine(l.id)}/>
              <span className="mono" style={{fontWeight:600}}>{l.id}</span>
              <span>· {l.name}</span>
              <span className="spacer" style={{flex:1}}></span>
              <span className="mono muted" style={{fontSize:10}}>cap {l.cap_kg_h} kg/h</span>
            </label>
          ))}
        </div>
      </Field>

      <Field label="Include forecast" help="When enabled, demand forecast signals feed the solver. Ensure forecasts uploaded.">
        <label style={{display:"flex", gap:8, alignItems:"center", fontSize:12}}>
          <input type="checkbox" checked={includeForecast} onChange={e=>setIncludeForecast(e.target.checked)}/>
          Use active forecast coverage (2026-W17 → 2026-W24, 42 products)
        </label>
      </Field>

      <Field label="Optimizer version" help="Dev-deployed rule. Cannot be changed by Planner.">
        <input value="allergen_sequencing_optimizer_v2" disabled className="mono" style={{fontSize:11}}/>
      </Field>

      <Field label="Run ID (auto-generated)">
        <input value={"OPT-" + String(43).padStart(4,"0") + " · UUID v7 → 018e5a43-…"} disabled className="mono" style={{fontSize:11}}/>
      </Field>

      {includeForecast && (
        <div className="alert-blue alert-box" style={{fontSize:11}}>
          <span>ⓘ</span>
          <div>Forecast will be joined from active coverage. 42 products × 8 weeks will be hydrated into the input snapshot.</div>
        </div>
      )}
    </Modal>
  );
};

// -------- M-02: Override Assignment Modal (MODAL-07-03) --------
const OverrideAssignmentModal = ({ open, onClose, data }) => {
  const [newLine, setNewLine] = React.useState(data?.wo?.line || "LINE-02");
  const [newShift, setNewShift] = React.useState(data?.wo?.shift || "A");
  const [newStart, setNewStart] = React.useState("2026-04-22T08:00");
  const [reason, setReason] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const needsNotes = reason === "planner_judgement" || reason === "other";
  const canSubmit = !!reason && (!needsNotes || notes.length >= 10) && !submitting;

  // Determine allergen conflict
  const wo = data?.wo;
  const allergenIncompat = wo?.allergen?.includes("PEANUT") && newLine === "LINE-01";
  const blocked = wo?.allergen?.includes("TREE") && newLine !== "LINE-04";

  const submit = async () => {
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 500));
    setSubmitting(false);
    if (data?.onConfirm) data.onConfirm();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose}
      title={`Override Assignment — ${wo?.wo || "WO"} · ${wo?.prod || ""}`}
      subtitle="Manually override solver recommendation · audit-logged"
      size="wide"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!canSubmit || blocked} onClick={submit}>
          {submitting ? "Saving…" : "Confirm override"}
        </button>
      </>}>

      <div className="summary-block">
        <div style={{fontSize:11, textTransform:"uppercase", color:"var(--muted)", fontWeight:600, letterSpacing:"0.04em", marginBottom:6}}>Current optimizer recommendation</div>
        <div className="summary-row"><span className="muted">Line</span><span className="spacer"></span><span className="mono">{wo?.line || "—"} · {PEXT_LINES.find(l=>l.id===wo?.line)?.name || ""}</span></div>
        <div className="summary-row"><span className="muted">Shift</span><span className="spacer"></span><span className="mono">Shift {wo?.shift}</span></div>
        <div className="summary-row"><span className="muted">Planned start</span><span className="spacer"></span><span className="mono">{wo ? PEXT_DATES[wo.day].label + " " + wo.start + ":00" : "—"}</span></div>
        <div className="summary-row"><span className="muted">Score</span><span className="spacer"></span><span className="mono">{wo?.score} / 100</span></div>
        <div className="summary-row"><span className="muted">CO before</span><span className="spacer"></span><span className="mono">{wo?.coBefore} min</span></div>
      </div>

      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10}}>
        <Field label="New line" required>
          <select value={newLine} onChange={e=>setNewLine(e.target.value)}>
            {PEXT_LINES.map(l => <option key={l.id} value={l.id}>{l.id} · {l.name}</option>)}
          </select>
        </Field>
        <Field label="New shift" required>
          <select value={newShift} onChange={e=>setNewShift(e.target.value)}>
            <option value="A">Shift A (06-14)</option>
            <option value="B">Shift B (14-22)</option>
            <option value="C">Shift C (22-06, P2)</option>
          </select>
        </Field>
      </div>

      <Field label="New planned start" required help="Constrained to selected shift window · V-SCHED-03 cascade · V-SCHED-04 no overlap">
        <input type="datetime-local" value={newStart} onChange={e=>setNewStart(e.target.value)}/>
      </Field>

      {/* V-SCHED-01 — duration match routing */}
      <div className="alert-blue alert-box" style={{fontSize:11, marginBottom:10}}>
        <span>ⓘ</span>
        <div><b>V-SCHED-01</b> duration check: new slot = {wo ? (wo.end - wo.start).toFixed(1) : "5.5"}h vs routing expected {wo ? (wo.end - wo.start).toFixed(1) : "5.5"}h — within ±5%.</div>
      </div>

      {allergenIncompat && (
        <div className="alert-red alert-box" style={{fontSize:11, marginBottom:10}}>
          <span>⚠</span>
          <div>
            <b>V-SCHED-02 warning</b> — {newLine} is not compatible with this WO's allergen profile (PEANUT). Assignment will violate allergen sequencing rules.
            Confirm only if full cleaning + ATP test will be performed before start.
          </div>
        </div>
      )}
      {blocked && (
        <div className="alert-red alert-box" style={{fontSize:11, marginBottom:10}}>
          <span>⛔</span>
          <div><b>BLOCKED by allergen segregation policy</b> — This line cannot host TREE allergens. Contact admin to override changeover matrix.</div>
        </div>
      )}

      <Field label="Reason code" required>
        <select value={reason} onChange={e=>setReason(e.target.value)}>
          <option value="">— Select reason —</option>
          <option value="customer_priority">customer_priority — Customer delivery deadline</option>
          <option value="material_shortage">material_shortage — Material not available</option>
          <option value="line_maintenance">line_maintenance — Line maintenance conflict</option>
          <option value="capacity_constraint">capacity_constraint — Capacity re-allocation</option>
          <option value="planner_judgement">planner_judgement — Professional judgement (notes req.)</option>
          <option value="other">other — Other (notes required)</option>
        </select>
      </Field>

      <Field label={"Notes" + (needsNotes ? " *" : " (optional)")} help={needsNotes ? "Required for planner_judgement / other (min 10 chars)" : null}>
        <ReasonInput value={notes} onChange={setNotes} minLength={needsNotes ? 10 : 0} placeholder="Describe why this override is needed…"/>
      </Field>

      {/* Impact preview */}
      {reason && !blocked && (
        <div className="alert-amber alert-box" style={{fontSize:11}}>
          <span>∑</span>
          <div>
            <b>Impact preview:</b> New CO before: <b>45 min</b> (MILK → CEREAL). Previous: {wo?.coBefore} min. Additional <b>{45 - (wo?.coBefore || 0)} min</b> changeover.
            <br/>No cascade dependencies affected.
          </div>
        </div>
      )}
    </Modal>
  );
};

// -------- M-03: Reschedule WO Modal (MODAL-07-03 reschedule variant §8.3) --------
const RescheduleWOModal = ({ open, onClose, data }) => {
  const wo = data?.wo;
  const [newLine, setNewLine] = React.useState(wo?.line || "LINE-01");
  const [ackIneligible, setAckIneligible] = React.useState(false);
  const [reason, setReason] = React.useState("customer_priority");
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  // FA-line eligibility mock — line must match first char of FA code
  const eligibleLines = ["LINE-01","LINE-02"];
  const isEligible = eligibleLines.includes(newLine);
  const canSubmit = (isEligible || ackIneligible) && reason && !submitting;

  const submit = async () => {
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 400));
    setSubmitting(false);
    if (data?.onConfirm) data.onConfirm();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose}
      title={`Reschedule WO — ${wo?.wo || ""} · ${wo?.prod || ""}`}
      subtitle="Manually reschedule one WO · audit-logged"
      size="wide"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!canSubmit} onClick={submit}>{submitting ? "Saving…" : "Confirm reschedule"}</button>
      </>}>

      <div className="alert-blue alert-box" style={{fontSize:11, marginBottom:10}}>
        <span>ⓘ</span>
        <div>You are rescheduling this WO manually. To re-optimise the full schedule, use <b>Run optimizer</b> instead.</div>
      </div>

      <Field label="New line" required help={isEligible ? "Line is eligible for this FA (fa_line_compatibility)." : null}
             error={!isEligible ? `Line ${newLine} is not compatible with FA ${wo?.fa}. Eligible lines: ${eligibleLines.join(", ")}.` : null}>
        <select value={newLine} onChange={e=>setNewLine(e.target.value)}>
          {PEXT_LINES.map(l => <option key={l.id} value={l.id}>{l.id} · {l.name} {eligibleLines.includes(l.id) ? "✓ eligible" : "✗ ineligible"}</option>)}
        </select>
      </Field>

      {!isEligible && (
        <label style={{display:"flex", gap:8, alignItems:"flex-start", padding:"8px 12px", background:"var(--amber-050a)", border:"1px solid var(--amber)", borderRadius:4, fontSize:11, marginBottom:10}}>
          <input type="checkbox" checked={ackIneligible} onChange={e=>setAckIneligible(e.target.checked)} style={{marginTop:2}}/>
          <div>I understand this assignment violates FA–line eligibility and accept responsibility.</div>
        </label>
      )}

      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10}}>
        <Field label="New shift" required>
          <select><option>Shift A (06-14)</option><option>Shift B (14-22)</option></select>
        </Field>
        <Field label="New start" required>
          <input type="datetime-local" defaultValue="2026-04-22T08:00"/>
        </Field>
      </div>

      <Field label="Reason code" required>
        <select value={reason} onChange={e=>setReason(e.target.value)}>
          <option value="customer_priority">customer_priority</option>
          <option value="material_shortage">material_shortage</option>
          <option value="capacity_constraint">capacity_constraint</option>
          <option value="planner_judgement">planner_judgement (notes req.)</option>
        </select>
      </Field>
      <Field label="Notes (optional)">
        <ReasonInput value={notes} onChange={setNotes} minLength={0}/>
      </Field>
    </Modal>
  );
};

// -------- M-04: Approve All Modal --------
const ApproveAllModal = ({ open, onClose, data }) => {
  const [submitting, setSubmitting] = React.useState(false);
  const count = data?.count || 7;
  const submit = async () => {
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 500));
    setSubmitting(false);
    if (data?.onConfirm) data.onConfirm();
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="Approve all pending assignments" size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={submitting} onClick={submit}>
          {submitting ? "Approving…" : `✓ Approve ${count} assignments`}
        </button>
      </>}>
      <div className="alert-amber alert-box" style={{fontSize:11, marginBottom:10}}>
        <span>⚠</span>
        <div>This bulk action approves assignments from <b>all completed runs</b>, not just the most recent.</div>
      </div>
      <Summary rows={[
        { label: "Run group", value: "OPT-0042 · 2026-04-21 06:12", mono: true },
        { label: "Assignments to approve", value: count + " draft" },
        { label: "Emitted events", value: count + " × scheduler.assignment.approved" },
        { label: "Target tables", value: "work_orders (planned_start_time, assigned_line_id, assigned_shift_id)" },
      ]}/>
    </Modal>
  );
};

// -------- M-05: Matrix Cell Edit Modal (MODAL-07-02-CELL) --------
const MatrixCellEditModal = ({ open, onClose, data }) => {
  const [minutes, setMinutes] = React.useState(data?.value === "BLKD" ? 0 : data?.value || 15);
  const [cleaning, setCleaning] = React.useState(true);
  const [atp, setAtp] = React.useState(false);
  const [segregation, setSegregation] = React.useState(data?.value === "BLKD");
  const [notes, setNotes] = React.useState("");
  const canSubmit = Number(minutes) >= 0;
  const save = () => { if (data?.onSave) data.onSave(Number(minutes)); onClose(); };

  const title = data ? `Edit changeover: ${data.from} → ${data.to}` + (data.lineId ? ` · ${data.lineId}` : "") : "Edit changeover";

  return (
    <Modal open={open} onClose={onClose} title={title} size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!canSubmit} onClick={save}>Save cell</button>
      </>}>
      <Field label="Changeover minutes" required help="V-CM-02: changeover_minutes must be integer ≥ 0. Values >120 should be validated with production team.">
        <input type="number" min={0} step={1} value={minutes} onChange={e=>setMinutes(e.target.value)}/>
      </Field>

      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10}}>
        <Field label="Cleaning required">
          <label style={{display:"flex", gap:8, alignItems:"center", fontSize:12}}>
            <input type="checkbox" checked={cleaning} onChange={e=>setCleaning(e.target.checked)}/>
            Line must be physically cleaned
          </label>
        </Field>
        <Field label="ATP required">
          <label style={{display:"flex", gap:8, alignItems:"center", fontSize:12}}>
            <input type="checkbox" checked={atp} onChange={e=>setAtp(e.target.checked)}/>
            ATP swab (&lt;10 RLU) before next WO
          </label>
        </Field>
      </div>

      <Field label="Segregation required" help="V-CM-04: segregation_required=true requires admin role. Setting true BLOCKS the pair in scheduler.">
        <label style={{display:"flex", gap:8, alignItems:"center", fontSize:12, opacity:0.6}}>
          <input type="checkbox" checked={segregation} disabled/>
          (Admin only — read-only for Planner)
        </label>
      </Field>

      {segregation && (
        <div className="alert-red alert-box" style={{fontSize:11}}>
          <span>⛔</span>
          <div>Setting <b>segregation_required = true</b> BLOCKS this allergen pair consecutively on any line. Irreversible without admin action.</div>
        </div>
      )}

      <Field label="Notes (optional)">
        <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="e.g. LINE-03 extended cleaning due to crumb residue"/>
      </Field>
    </Modal>
  );
};

// -------- M-06: Matrix Publish Modal --------
const MatrixPublishModal = ({ open, onClose, data }) => {
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const newVer = "v" + (parseInt(PEXT_MATRIX_VERSIONS[0].v.slice(1)) + 1);
  const submit = async () => {
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 600));
    setSubmitting(false);
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title={`Publish changeover matrix ${newVer}?`} size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={submitting} onClick={submit}>{submitting ? "Publishing…" : "Confirm publish"}</button>
      </>}>
      <Summary rows={[
        { label: "Cells modified", value: (data?.changed || 3) + " default cells" },
        { label: "Per-line overrides", value: "0 added, 0 modified" },
        { label: "Current active", value: PEXT_MATRIX_VERSIONS[0].v + " (published " + PEXT_MATRIX_VERSIONS[0].date + ")" },
        { label: "New version", value: newVer, emphasis: true },
      ]}/>
      <div className="alert-amber alert-box" style={{fontSize:11, marginBottom:10}}>
        <span>⚠</span>
        <div>Publishing affects the <b>next</b> scheduler run. Runs currently in progress continue using {PEXT_MATRIX_VERSIONS[0].v}.</div>
      </div>
      <Field label="Version notes (optional)" help="Appears in version history timeline">
        <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="e.g. Q2 2026 calibration after BRCGS audit"/>
      </Field>
    </Modal>
  );
};

// -------- M-07: Matrix Import Modal --------
const MatrixImportModal = ({ open, onClose }) => {
  const [stage, setStage] = React.useState("upload"); // upload | validate | preview
  const [fileName, setFileName] = React.useState(null);
  const pick = () => { setFileName("changeover-matrix-v5-apex-2026-04-21.csv"); setStage("validate"); setTimeout(()=>setStage("preview"), 400); };
  return (
    <Modal open={open} onClose={onClose} title="Import changeover matrix CSV" size="wide"
      foot={stage === "preview" ? <>
        <button className="btn btn-secondary btn-sm" onClick={()=>setStage("upload")}>← Re-upload</button>
        <span className="spacer"></span>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm">Apply import</button>
      </> : <>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
      </>}>
      <div className="alert-blue alert-box" style={{fontSize:11, marginBottom:10}}>
        <span>ⓘ</span>
        <div>
          Expected columns: <span className="mono">allergen_from, allergen_to, line_id (blank=default), changeover_minutes, cleaning_required, atp_required, segregation_required, notes</span>
          <br/>Validated: <b>V-CM-01</b> (allergen codes recognized), <b>V-CM-02</b> (minutes int ≥0), <b>V-CM-03</b> (line_id active), <b>V-CM-04</b> (segregation requires admin).
        </div>
      </div>

      {stage === "upload" && (
        <div className="csv-dropzone" onClick={pick}>
          <span className="cd-big">⇪</span>
          <div><b>Drag CSV here</b> or click to browse</div>
          <div className="muted" style={{fontSize:11, marginTop:4}}>Max 5 MB · Max 10,000 rows</div>
        </div>
      )}
      {stage === "validate" && (
        <div style={{padding:20, textAlign:"center"}}>
          <div className="solver-progress indet" style={{margin:"0 auto", maxWidth:300}}><span></span></div>
          <div style={{fontSize:11, color:"var(--muted)", marginTop:8}}>Parsing {fileName}…</div>
        </div>
      )}
      {stage === "preview" && (
        <>
          <div className="alert-green alert-box" style={{fontSize:11, marginBottom:10}}>
            <span>✓</span>
            <div><b>{fileName}</b> parsed — 64 rows · 3 changes detected.</div>
          </div>
          <div className="card" style={{padding:0}}>
            <table>
              <thead><tr><th>From</th><th>To</th><th>Line</th><th>Current</th><th>New</th><th>Change</th></tr></thead>
              <tbody>
                <tr><td className="mono">CEREAL</td><td className="mono">MILK</td><td className="mono">default</td><td className="mono">15m</td><td className="mono" style={{color:"var(--green)"}}>20m</td><td><span className="badge badge-amber" style={{fontSize:10}}>modified</span></td></tr>
                <tr><td className="mono">MUSTARD</td><td className="mono">NONE</td><td className="mono">default</td><td className="mono">45m</td><td className="mono">50m</td><td><span className="badge badge-amber" style={{fontSize:10}}>modified</span></td></tr>
                <tr><td className="mono">PEANUT</td><td className="mono">TREE</td><td className="mono">default</td><td className="mono">90m</td><td className="mono">80m</td><td><span className="badge badge-green" style={{fontSize:10}}>modified</span></td></tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
};

// -------- M-08: Matrix Diff Modal (wide) --------
const MatrixDiffModal = ({ open, onClose, data }) => {
  return (
    <Modal open={open} onClose={onClose} title={`Diff: ${data?.version?.v || "v?"} vs current active`} size="fullpage"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
      </>}>
      <div className="alert-blue alert-box" style={{fontSize:11, marginBottom:10}}>
        <span>ⓘ</span>
        <div>Comparing <b>{data?.version?.v}</b> ({data?.version?.date}) with active <b>{PEXT_MATRIX_VERSIONS[0].v}</b>. 8 cells differ.</div>
      </div>
      <div className="card" style={{padding:0}}>
        <table>
          <thead><tr><th>From → To</th><th>Line</th><th>{data?.version?.v}</th><th>Active ({PEXT_MATRIX_VERSIONS[0].v})</th><th>Delta</th></tr></thead>
          <tbody>
            <tr><td className="mono">CEREAL → MILK</td><td>default</td><td className="mono">20m</td><td className="mono" style={{background:"#fef3c7"}}>15m</td><td className="mono exp-amber">−5m</td></tr>
            <tr><td className="mono">MILK → CEREAL</td><td>default</td><td className="mono">25m</td><td className="mono" style={{background:"#fef3c7"}}>20m</td><td className="mono exp-amber">−5m</td></tr>
            <tr><td className="mono">MUSTARD → NONE</td><td>default</td><td className="mono">30m</td><td className="mono" style={{background:"#fef3c7"}}>45m</td><td className="mono exp-red">+15m</td></tr>
            <tr><td className="mono">CEREAL → MILK</td><td>LINE-03</td><td className="mono" style={{color:"var(--muted)"}}>—</td><td className="mono" style={{background:"#dcfce7"}}>45m (override)</td><td><span className="badge badge-green" style={{fontSize:9}}>ADDED</span></td></tr>
          </tbody>
        </table>
      </div>
    </Modal>
  );
};

// -------- M-09: Forecast Upload Modal (MODAL-07-03-UPLOAD) --------
const ForecastUploadModal = ({ open, onClose }) => {
  const [stage, setStage] = React.useState("upload");
  const [policy, setPolicy] = React.useState("replace");
  const [fileName, setFileName] = React.useState(null);
  const pick = () => { setFileName("forecast_2026_w17_w24_v3.csv"); setStage("preview"); };
  return (
    <Modal open={open} onClose={onClose} title="Upload demand forecast CSV" size="wide"
      foot={stage === "preview" ? <>
        <button className="btn btn-secondary btn-sm" onClick={()=>setStage("upload")}>← Re-upload</button>
        <span className="spacer"></span>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={onClose}>Upload</button>
      </> : <>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
      </>}>

      <div className="alert-blue alert-box" style={{fontSize:11, marginBottom:10}}>
        <span>ⓘ</span>
        <div>
          Expected format: <span className="mono">product_code, week_iso (YYYY-Www), qty_kg</span>
          <br/>Max file size: <b>5 MB</b> · Max rows: <b>10,000</b>
          <br/>Validated: V-SCHED-09 (3-year retention window), format compliance, numeric ≥0.
          <br/><a style={{color:"var(--blue)", cursor:"pointer"}}>[Download CSV template]</a>
        </div>
      </div>

      {stage === "upload" ? (
        <div className="csv-dropzone" onClick={pick}>
          <span className="cd-big">⇪</span>
          <div><b>Drag CSV here</b> or click to browse</div>
          <div className="muted" style={{fontSize:11, marginTop:4}}>.csv / .txt</div>
        </div>
      ) : (
        <>
          <div className="alert-green alert-box" style={{fontSize:11, marginBottom:10}}>
            <span>✓</span>
            <div><b>{fileName}</b> validated — 336 rows (42 products × 8 weeks) · no errors.</div>
          </div>

          <Field label="Overwrite policy">
            <div style={{display:"flex", gap:10, fontSize:12}}>
              <label><input type="radio" name="policy" checked={policy === "replace"} onChange={()=>setPolicy("replace")}/> Replace existing values (default)</label>
              <label><input type="radio" name="policy" checked={policy === "keep"} onChange={()=>setPolicy("keep")}/> Keep existing, add new only</label>
            </div>
          </Field>

          <div className="card" style={{padding:0}}>
            <table className="fcst-table">
              <thead><tr><th className="prod">Product</th><th>W17</th><th>W18</th><th>W19</th><th>W20</th><th>Status</th></tr></thead>
              <tbody>
                <tr><td className="prod"><span className="mono" style={{fontSize:11, fontWeight:600}}>FA5100</span></td><td>1200</td><td>1250</td><td>1200</td><td>1100</td><td>New</td></tr>
                <tr><td className="prod"><span className="mono" style={{fontSize:11, fontWeight:600}}>FA5021</span></td><td>520</td><td>540</td><td>500</td><td>480</td><td>Update</td></tr>
                <tr><td className="prod"><span className="mono" style={{fontSize:11, fontWeight:600}}>FA5102</span></td><td>820</td><td>800</td><td>820</td><td>790</td><td>Update</td></tr>
                <tr><td className="prod" style={{fontSize:11, color:"var(--muted)"}} colSpan="6">… 39 more rows</td></tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
};

// -------- M-10: Disposition Decision Modal (MODAL-07-04, P2) --------
const DispositionDecisionModal = ({ open, onClose }) => {
  const [choice, setChoice] = React.useState("to_stock");
  const [remaining, setRemaining] = React.useState(6420); // seconds
  React.useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setRemaining(r => Math.max(r-1, 0)), 1000);
    return () => clearInterval(t);
  }, [open]);
  const mins = Math.floor(remaining / 60);
  const hrs = Math.floor(mins / 60);
  const timerCls = remaining < 1800 ? "" : remaining < 7200 ? "soon" : "ok";
  const label = hrs > 0 ? `${hrs}h ${mins - hrs*60}m` : `${mins}m`;

  return (
    <Modal open={open} onClose={onClose}
      title="Disposition Decision Required — IN1301 Farsz pierogowy"
      size="wide"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel — decide later</button>
        <span className="spacer"></span>
        <button className="btn btn-primary btn-sm" onClick={onClose}>
          Confirm: {choice === "to_stock" ? "To Stock" : "Direct Continue"}
        </button>
      </>}>
      <div style={{display:"flex", gap:10, alignItems:"flex-start", marginBottom:12}}>
        <div className={"countdown-timer " + timerCls} style={{flex:1}}>
          ⏰ Time remaining: {label} — Default: To Stock at 2026-04-21 17:12
        </div>
        <button className="btn btn-sm btn-secondary">+1h</button>
        <button className="btn btn-sm btn-secondary">+4h</button>
      </div>

      <Summary rows={[
        { label: "Parent WO", value: "WO-2026-0114 · Farsz pierogowy mieszany — COMPLETED 14:45" },
        { label: "Output LP", value: "LP-2026-04-0114-001 · 420 kg · Available (awaiting disposition)" },
        { label: "Shelf life", value: "6h remaining (use_by · V-SCHED-10 eligibility: shelf_life_hours ≤ 24 ✓)" },
        { label: "Child WO waiting", value: "WO-2026-0113 · Pierogi z mięsem · READY · planned 15:30" },
      ]}/>

      <Field label="Decision" required>
        <div style={{display:"grid", gap:6}}>
          <label style={{display:"flex", gap:10, padding:"10px 14px", border:"1px solid " + (choice === "to_stock" ? "var(--blue)" : "var(--border)"), borderRadius:6, background: choice === "to_stock" ? "var(--blue-050)" : "#fff", cursor:"pointer"}}>
            <input type="radio" checked={choice === "to_stock"} onChange={()=>setChoice("to_stock")} style={{marginTop:3}}/>
            <div>
              <b style={{fontSize:12}}>To Stock (default)</b>
              <div style={{fontSize:11, color:"var(--muted)", marginTop:2}}>Send LP to warehouse as standard stock. Child WO operator will scan at production time.</div>
            </div>
          </label>
          <label style={{display:"flex", gap:10, padding:"10px 14px", border:"1px solid " + (choice === "direct" ? "var(--blue)" : "var(--border)"), borderRadius:6, background: choice === "direct" ? "var(--blue-050)" : "#fff", cursor:"pointer"}}>
            <input type="radio" checked={choice === "direct"} onChange={()=>setChoice("direct")} style={{marginTop:3}}/>
            <div>
              <b style={{fontSize:12}}>Direct Continue <span className="badge badge-blue" style={{fontSize:9, marginLeft:4}}>fast-track</span></b>
              <div style={{fontSize:11, color:"var(--muted)", marginTop:2}}>Reserve LP directly for child WO. No put-away. Child WO can start in ~15 min.</div>
            </div>
          </label>
        </div>
      </Field>

      {choice === "direct" && (
        <div className="alert-amber alert-box" style={{fontSize:11}}>
          <span>⚠</span>
          <div>Direct Continue bypasses standard put-away. Ensure child WO line is ready. If child cancelled, LP reverts to stock automatically.</div>
        </div>
      )}
    </Modal>
  );
};

// -------- M-11: Re-run Confirm Modal --------
const RerunConfirmModal = ({ open, onClose, data }) => {
  return (
    <Modal open={open} onClose={onClose} title="Re-run with same parameters?" size="sm"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={onClose}>Confirm re-run</button>
      </>}>
      <Summary rows={[
        { label: "Source run", value: data?.run?.id || "OPT-XXXX", mono: true },
        { label: "Horizon", value: data?.run?.horizon || "7d" },
        { label: "Lines", value: data?.run?.lines || "5/5" },
        { label: "New run ID", value: "OPT-" + String(parseInt((data?.run?.id || "OPT-0042").slice(4)) + 1).padStart(4,"0") + " (new UUID v7)", mono: true },
      ]}/>
      <div style={{fontSize:11, color:"var(--muted)"}}>Existing run is unchanged. The current schedule remains active until new run approved.</div>
    </Modal>
  );
};

// -------- M-12: Disable v2 Modal --------
const DisableV2Modal = ({ open, onClose }) => {
  const [confirm, setConfirm] = React.useState("");
  const canConfirm = confirm === "DISABLE";
  return (
    <Modal open={open} onClose={onClose} title="Disable allergen optimizer v2?" size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-danger btn-sm" disabled={!canConfirm} onClick={onClose}>Disable v2</button>
      </>}>
      <div className="alert-red alert-box" style={{fontSize:12, marginBottom:10}}>
        <span>⚠</span>
        <div>
          <b>Destructive:</b> disabling v2 reverts to heuristic v1. CO reductions (~30%) will be lost until re-enabled.
          <br/>Fallback rule: <span className="mono">allergen_sequencing_heuristic_v1</span>
        </div>
      </div>
      <Field label='Type "DISABLE" to confirm' required>
        <input value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="DISABLE" className="mono"/>
      </Field>
      <Field label="Reason (audit-logged)">
        <ReasonInput value="" onChange={()=>{}} minLength={10} placeholder="e.g. v2 rule throws on dataset — rollback while Dev investigates"/>
      </Field>
    </Modal>
  );
};

// -------- M-13: Request Review Modal (BLOCKED cell) --------
const RequestReviewModal = ({ open, onClose, data }) => {
  const [reason, setReason] = React.useState("");
  const canSubmit = reason.length >= 10;
  return (
    <Modal open={open} onClose={onClose} title={`Request admin review — ${data?.from || "PEANUT"} → ${data?.to || "TREE"}`} size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!canSubmit} onClick={onClose}>Submit review request</button>
      </>}>
      <div className="alert-blue alert-box" style={{fontSize:11, marginBottom:10}}>
        <span>ⓘ</span>
        <div>This cell is BLOCKED (<span className="mono">segregation_required=true</span>). Only admins can unblock. Submit a justification and an admin will be notified.</div>
      </div>
      <Field label="Justification" required help="Min 10 chars · appended to audit log">
        <ReasonInput value={reason} onChange={setReason} minLength={10} placeholder="e.g. Dedicated sanitisation SOP now validated; request review to unblock this pair on LINE-04…"/>
      </Field>
    </Modal>
  );
};

// ============ MODAL GALLERY ============
const MODAL_CATALOG = [
  { key: "runScheduler",      name: "M-01 · Run Scheduler (MODAL-07-01)",    pattern: "Wizard-style launcher + validation",  comp: RunSchedulerModal },
  { key: "override",          name: "M-02 · Override Assignment (MODAL-07-03)",pattern: "Override w/ reason + impact preview", comp: OverrideAssignmentModal },
  { key: "reschedule",        name: "M-03 · Reschedule WO (§8.3 variant)",   pattern: "Override w/ FA-line eligibility",     comp: RescheduleWOModal },
  { key: "approveAll",        name: "M-04 · Approve all pending",             pattern: "Bulk confirm (run-grouped)",          comp: ApproveAllModal },
  { key: "matrixCell",        name: "M-05 · Edit matrix cell (MODAL-07-02-CELL)", pattern: "Simple form + admin field",        comp: MatrixCellEditModal },
  { key: "matrixPublish",     name: "M-06 · Publish new matrix version",     pattern: "Confirm non-destructive + notes",     comp: MatrixPublishModal },
  { key: "matrixImport",      name: "M-07 · Import matrix CSV",              pattern: "Upload + validate + diff preview",    comp: MatrixImportModal },
  { key: "matrixDiff",        name: "M-08 · Matrix version diff",            pattern: "Preview/compare (fullpage)",          comp: MatrixDiffModal },
  { key: "forecastUpload",    name: "M-09 · Upload forecast CSV (MODAL-07-03-UPLOAD)", pattern: "Upload + validate + policy", comp: ForecastUploadModal },
  { key: "disposition",       name: "M-10 · Disposition decision (MODAL-07-04, P2)", pattern: "Countdown + decision + extend", comp: DispositionDecisionModal },
  { key: "rerunConfirm",      name: "M-11 · Re-run confirm",                  pattern: "Confirm non-destructive",              comp: RerunConfirmModal },
  { key: "disableV2",         name: "M-12 · Disable optimizer v2",            pattern: "Destructive (type-to-confirm)",        comp: DisableV2Modal },
  { key: "requestReview",     name: "M-13 · Matrix review request",           pattern: "Override with reason",                 comp: RequestReviewModal },
];

const ModalGallery = ({ onNav }) => {
  const [openKey, setOpenKey] = React.useState(null);
  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Scheduler</a> · Modal gallery</div>
          <h1 className="page-title">Modal gallery — Planning+</h1>
          <div className="muted" style={{fontSize:12}}>{MODAL_CATALOG.length} components · follows <span className="mono">_shared/MODAL-SCHEMA.md</span></div>
        </div>
      </div>
      <div className="alert-blue alert-box" style={{marginBottom:14, fontSize:12}}>
        <span>ⓘ</span>
        <div>
          <b>Click any card to open the modal.</b> Primitives used: <span className="mono">Modal, Stepper, Field, ReasonInput, Summary</span> from <span className="mono">_shared/modals.jsx</span>.
        </div>
      </div>
      <div className="gallery-grid">
        {MODAL_CATALOG.map(m => (
          <div key={m.key} className="gallery-card" onClick={()=>setOpenKey(m.key)}>
            <div className="gallery-pattern">{m.pattern}</div>
            <div className="gallery-name">{m.name}</div>
            <button className="btn btn-secondary btn-sm" style={{marginTop:10}}>Open modal →</button>
          </div>
        ))}
      </div>
      {MODAL_CATALOG.map(m => (
        <m.comp key={m.key} open={openKey === m.key} onClose={()=>setOpenKey(null)} data={{}}/>
      ))}
    </>
  );
};

Object.assign(window, {
  RunSchedulerModal, OverrideAssignmentModal, RescheduleWOModal, ApproveAllModal,
  MatrixCellEditModal, MatrixPublishModal, MatrixImportModal, MatrixDiffModal,
  ForecastUploadModal, DispositionDecisionModal, RerunConfirmModal, DisableV2Modal, RequestReviewModal,
  ModalGallery, MODAL_CATALOG,
});
