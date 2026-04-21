// ============================================================
// MAINTENANCE MODALS — follows ../_shared/MODAL-SCHEMA.md
//
// Modal inventory:
//   M-01 Asset Create/Edit (simple form + dynamic L3 fields)
//   M-02 WR Create (shop-floor, large touch targets)
//   M-03 WR Triage (dual-path approve/reject/duplicate)
//   M-04 mWO Create (simple form with conditional fields)
//   M-05 mWO Task Check-off (complex w/ parts + photo + signoff)
//   M-06 mWO Complete Sign-off (multi-role pre-condition gates)
//   M-07 PM Schedule Edit (wizard 3 steps)
//   M-08 PM Occurrence Skip (override w/ reason)
//   M-09 Calibration Reading Entry (test points + cert upload)
//   M-10 Calibration Certificate Upload (file + hash)
//   M-11 Spare Part Reorder (simple form + supplier info)
//   M-12 Technician Skill Edit (repeating rows)
//   M-13 LOTO Apply (two-person wizard w/ energy source checklist)
//   M-14 LOTO Clear (two-person confirm + photo)
//   M-15 Delete Confirmation (type-to-confirm)
//   M-16 Criticality Override (override w/ reason)
//   M-17 Downtime Linkage (picker)
// + mWO Assign (quick picker)
// + State Transition confirm
// + Log Time (simple form)
// + Parts Consume (simple form)
// + Spare Adjust (override w/ reason)
// ============================================================

// -------- M-01 Asset Create / Edit --------
const AssetEditModal = ({ open, onClose, data }) => {
  const [loto, setLoto] = React.useState(false);
  const [cal, setCal] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const mode = (data && data.mode) || "create";
  const submit = async () => { setSubmitting(true); await new Promise(r=>setTimeout(r,800)); setSubmitting(false); onClose(); };
  return (
    <Modal open={open} onClose={onClose} size="default" title={mode === "create" ? "Add asset" : "Edit asset — AST-1001"} subtitle="Base fields from 02-SETTINGS machines"
      foot={<><button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary btn-sm" disabled={submitting} onClick={submit}>{submitting ? "Saving…" : "Save asset"}</button></>}>
      <div className="ff-inline">
        <Field label="Equipment code" required help="Auto-suggested from sequence"><input type="text" defaultValue="EQ-2026-0043"/></Field>
        <Field label="Name" required><input type="text" placeholder="Line 2 Conveyor"/></Field>
      </div>
      <div className="ff-inline">
        <Field label="Equipment type" required>
          <select><option>Mixer</option><option>Oven</option><option>Packer</option><option>Scale</option><option>Thermometer</option><option>pH Meter</option><option>CIP Unit</option><option>Conveyor</option><option>Compressor</option><option>Other</option></select>
        </Field>
        <Field label="Production line" help="From 02-SETTINGS production_lines">
          <select><option>—</option><option>LINE-01</option><option>LINE-02</option><option>LINE-03</option><option>LINE-04</option><option>LINE-05</option></select>
        </Field>
      </div>
      <Field label="Location path" help="ltree format — e.g. WH-Factory-A › LINE-01 › Station-1"><input type="text" placeholder="WH-Factory-A › LINE-01 › Station-1"/></Field>
      <div className="ff-inline">
        <Field label="Criticality" required>
          <select><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
        </Field>
        <Field label="Calibration interval (days)" help="Required if calibration is on">
          <input type="number" disabled={!cal}/>
        </Field>
      </div>
      <div className="ff-inline">
        <Field label="Requires LOTO">
          <label><input type="checkbox" checked={loto} onChange={e=>setLoto(e.target.checked)}/> Enable lockout/tagout procedure</label>
        </Field>
        <Field label="Requires calibration">
          <label><input type="checkbox" checked={cal} onChange={e=>setCal(e.target.checked)}/> Requires calibration records</label>
        </Field>
      </div>
      {/* L3 extension fields */}
      <div style={{marginTop:6, padding:10, background:"var(--gray-050)", borderRadius:4}}>
        <div className="muted" style={{fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:700, marginBottom:6}}>L3 extension fields (tenant-specific)</div>
        <div className="ff-inline">
          <Field label="Manufacturer serial"><input type="text"/></Field>
          <Field label="Warranty expiry"><input type="date"/></Field>
        </div>
      </div>
    </Modal>
  );
};

// -------- M-02 WR Create (shop-floor) --------
const WRCreateModal = ({ open, onClose, data }) => {
  const [severity, setSeverity] = React.useState("medium");
  const [desc, setDesc] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const autoFilled = data && data.downtimeEvent;
  const submit = async () => { setSubmitting(true); await new Promise(r=>setTimeout(r,600)); setSubmitting(false); onClose(); };
  return (
    <Modal open={open} onClose={onClose} size="default" title="Submit work request" subtitle="Shop-floor optimized — large touch targets"
      foot={<><button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary btn-sm" disabled={submitting || desc.length < 10} onClick={submit}>{submitting ? "Submitting…" : "Submit request"}</button></>}>
      {autoFilled && (
        <div className="alert-blue alert-box" style={{fontSize:11, marginBottom:10}}>
          <span>ⓘ</span>
          <div>Auto-filled from downtime event DT-2026-0891 on LINE-02. Verify details before submitting.</div>
        </div>
      )}
      <Field label="Asset" required help="Scan the asset QR code or pick from list">
        <div style={{display:"flex", gap:6}}>
          <input type="text" placeholder="Start typing asset name or ID..." style={{flex:1}}/>
          <button className="btn btn-secondary btn-sm">🔲 Scan QR</button>
        </div>
      </Field>
      <Field label="Problem description" required help="Min 10 characters · max 1000">
        <textarea rows="4" value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Describe the problem — what you saw, when it started, any unusual sounds or smells..."></textarea>
        <div className="muted" style={{fontSize:10, textAlign:"right", marginTop:3}}>{desc.length} / 1000</div>
      </Field>
      <Field label="Severity" required help="Maps to priority on created mWO">
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:6, marginTop:4}}>
          {["critical","high","medium","low"].map(s => (
            <div key={s} className={"wr-sev-btn " + s + " " + (severity === s ? "on" : "")} onClick={()=>setSeverity(s)}>{s.toUpperCase()}</div>
          ))}
        </div>
      </Field>
      <div className="ff-inline">
        <Field label="Photos (optional)" help="Up to 5 files, 10MB each"><input type="file" multiple accept="image/*"/></Field>
        <Field label="Additional notes" help="Max 500 chars"><textarea rows="2"></textarea></Field>
      </div>
    </Modal>
  );
};

// -------- M-03 WR Triage --------
const WRTriageModal = ({ open, onClose, data }) => {
  const [decision, setDecision] = React.useState("approve");
  const [reason, setReason] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const submit = async () => { setSubmitting(true); await new Promise(r=>setTimeout(r,600)); setSubmitting(false); onClose(); };
  return (
    <Modal open={open} onClose={onClose} size="wide" title={`Triage work request — ${(data && data.wr) || "WR-2026-0891"}`}
      foot={<><button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary btn-sm" disabled={submitting} onClick={submit}>Confirm decision</button></>}>
      {/* Read-only summary */}
      <div className="summary-block">
        <div className="summary-row"><span className="muted">Asset</span><span className="spacer"></span><span>Mixer M-002 (AST-1001)</span></div>
        <div className="summary-row"><span className="muted">Reporter</span><span className="spacer"></span><span>K. Nowacki — LINE-02 supervisor</span></div>
        <div className="summary-row"><span className="muted">Reported at</span><span className="spacer"></span><span className="mono">2026-04-21 06:58</span></div>
        <div className="summary-row"><span className="muted">Priority suggestion</span><span className="spacer"></span><PriorityBadge p="critical"/></div>
        <div className="summary-row"><span className="muted">Problem</span><span className="spacer"></span><span style={{maxWidth:420, textAlign:"right"}}>Loud grinding noise from rear bearing, auger jammed during batch.</span></div>
      </div>

      <Field label="Decision" required>
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6}}>
          <div className={"wr-sev-btn medium " + (decision === "approve" ? "on" : "")} onClick={()=>setDecision("approve")}>APPROVE & CREATE mWO</div>
          <div className={"wr-sev-btn low " + (decision === "reject" ? "on" : "")} onClick={()=>setDecision("reject")}>REJECT</div>
          <div className={"wr-sev-btn low " + (decision === "duplicate" ? "on" : "")} onClick={()=>setDecision("duplicate")}>MARK AS DUPLICATE</div>
        </div>
      </Field>

      {decision === "approve" && (
        <>
          <div className="ff-inline">
            <Field label="Priority" required><select defaultValue="critical"><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></Field>
            <Field label="mWO type" required><select><option>Reactive</option><option>Preventive</option><option>Inspection</option></select></Field>
          </div>
          <div className="ff-inline">
            <Field label="Estimated start"><input type="datetime-local"/></Field>
            <Field label="Assigned technician" help="Optional — can be assigned later">
              <select><option>— Unassigned —</option>{MNT_TECHNICIANS.map(t => <option key={t.id}>{t.name}</option>)}</select>
            </Field>
          </div>
        </>
      )}

      {decision === "reject" && (
        <Field label="Rejection reason" required help="Min 10 chars — visible to reporter">
          <ReasonInput value={reason} onChange={setReason} minLength={10} placeholder="Explain why this request is being rejected..."/>
        </Field>
      )}

      {decision === "duplicate" && (
        <Field label="Duplicate of mWO" required>
          <select><option>— Search mWOs —</option>{MNT_MWOS.slice(0,5).map(m => <option key={m.mwo}>{m.mwo} · {m.asset}</option>)}</select>
        </Field>
      )}

      <div className="alert-amber alert-box" style={{fontSize:11, marginTop:10}}>
        <span>⚠</span>
        <div>V-MNT-02 · Approver cannot be the same user as the requester. Triage will validate this constraint.</div>
      </div>
    </Modal>
  );
};

// -------- M-04 mWO Create --------
const MwoCreateModal = ({ open, onClose, data }) => {
  const [type, setType] = React.useState("reactive");
  const [submitting, setSubmitting] = React.useState(false);
  const submit = async () => { setSubmitting(true); await new Promise(r=>setTimeout(r,700)); setSubmitting(false); onClose(); };
  return (
    <Modal open={open} onClose={onClose} size="default" title="Create maintenance work order"
      foot={<><button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary btn-sm" disabled={submitting} onClick={submit}>{submitting ? "Creating…" : "Create mWO"}</button></>}>
      <Field label="Asset" required>
        <select defaultValue={(data && data.assetId) || ""}>
          {MNT_ASSETS.map(a => <option key={a.id} value={a.id}>{a.id} · {a.name}</option>)}
        </select>
      </Field>
      <Field label="mWO type" required>
        <div style={{display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:6}}>
          {["reactive","preventive","calibration","sanitation","inspection"].map(t => (
            <label key={t} style={{cursor:"pointer"}}>
              <input type="radio" name="mwoType" checked={type===t} onChange={()=>setType(t)}/> <MwoType t={t}/>
            </label>
          ))}
        </div>
      </Field>
      <Field label="Priority" required>
        <div style={{display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:6}}>
          {["critical","high","medium","low"].map(p => (
            <label key={p} style={{cursor:"pointer"}}><input type="radio" name="pri" defaultChecked={p==="medium"}/> <PriorityBadge p={p}/></label>
          ))}
        </div>
      </Field>
      <Field label="Problem description" required help="Min 10 chars"><textarea rows="3" placeholder="Describe the maintenance task..."></textarea></Field>
      <div className="ff-inline">
        <Field label="Assigned technician"><select><option>— Unassigned —</option>{MNT_TECHNICIANS.map(t => <option key={t.id}>{t.name}</option>)}</select></Field>
        <Field label="Scheduled start"><input type="datetime-local"/></Field>
      </div>
      <div className="ff-inline">
        <Field label="Estimated duration (min)"><input type="number" defaultValue={90}/></Field>
        <Field label="Link PM schedule"><select><option>—</option>{MNT_PM_SCHEDULES.slice(0,6).map(p => <option key={p.pm}>{p.pm} · {p.asset}</option>)}</select></Field>
      </div>
      <Field label="Link downtime event" help="Required if source = auto_downtime">
        <select><option>—</option><option>DT-2026-0891 — LINE-02 · 23 min · Plant Breakdown</option></select>
      </Field>
      {type === "sanitation" && (
        <div style={{marginTop:6}}>
          <Field label="Allergen changeover"><label><input type="checkbox"/> This is an allergen changeover — dual sign-off required (Technician + QA).</label></Field>
        </div>
      )}
    </Modal>
  );
};

// -------- M-05 mWO Task Check-off --------
const TaskCheckoffModal = ({ open, onClose, data }) => {
  const [note, setNote] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const step = (data && data.step) || { n: 5, desc: "Inspect rear bearing — measure runout", type: "measure", measure: { expected: "< 0.15 mm" } };
  const submit = async () => { setSubmitting(true); await new Promise(r=>setTimeout(r,600)); setSubmitting(false); onClose(); };
  return (
    <Modal open={open} onClose={onClose} size="default" title={`Complete task — Step ${step.n}: ${step.desc}`}
      foot={<><button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary btn-sm" disabled={submitting} onClick={submit}>Mark step complete</button></>}>
      <div className="summary-block">
        <div className="summary-row"><span className="muted">Step</span><span className="spacer"></span><span className="mono" style={{fontWeight:700}}>{step.n}</span></div>
        <div className="summary-row"><span className="muted">Type</span><span className="spacer"></span><span className="ci-type">{step.type}</span></div>
        {step.measure && <div className="summary-row"><span className="muted">Expected value</span><span className="spacer"></span><span className="mono">{step.measure.expected}</span></div>}
      </div>

      {step.type === "measure" && (
        <Field label="Actual value" required help="Pass/Fail auto-computed vs expected">
          <div className="ff-inline">
            <input type="text" placeholder="0.22 mm"/>
            <select><option>mm</option><option>°C</option><option>bar</option><option>dB</option></select>
          </div>
        </Field>
      )}

      {step.type === "photo" && (
        <Field label="Photo capture" required><input type="file" accept="image/*" capture="environment"/></Field>
      )}

      <Field label="Parts used in this step (optional)">
        <div style={{padding:10, background:"var(--gray-050)", borderRadius:4}}>
          <div className="row-flex" style={{fontSize:11, marginBottom:6}}>
            <span className="mono">SP-BRG-0022 · Bearing SKF 6205-2RS</span>
            <span className="spacer"></span>
            <input type="number" defaultValue={1} style={{width:60}}/>
            <span className="mono" style={{fontSize:10, color:"var(--muted)"}}>ea (8 on hand)</span>
          </div>
          <button className="btn btn-ghost btn-sm">＋ Add part used</button>
        </div>
      </Field>

      <Field label="Time logged for this step">
        <div className="ff-inline">
          <input type="number" placeholder="Duration (min)"/>
          <input type="text" placeholder="Note..." value={note} onChange={e=>setNote(e.target.value)}/>
        </div>
      </Field>

      {step.type === "signoff" && (
        <Field label="Sign-off" required>
          <label><input type="checkbox"/> I confirm this step is complete and correct.</label>
          <div style={{marginTop:6}}>
            <input type="password" placeholder="Enter PIN for critical step confirmation" style={{width:200}}/>
          </div>
        </Field>
      )}
    </Modal>
  );
};

// -------- M-06 mWO Complete Sign-off --------
const MwoCompleteModal = ({ open, onClose, data }) => {
  const [submitting, setSubmitting] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const submit = async () => { setSubmitting(true); await new Promise(r=>setTimeout(r,900)); setSubmitting(false); onClose(); };

  const preconditions = [
    { k: "tasks", l: "All checklist steps complete", ok: false, count: "5/10" },
    { k: "loto",  l: "LOTO cleared", ok: false },
    { k: "allergen", l: "Allergen sign-off complete", ok: true, na: true },
  ];
  const allOk = preconditions.filter(p => !p.na).every(p => p.ok);

  return (
    <Modal open={open} onClose={onClose} size="wide" title={`Complete mWO — ${(data && data.mwo) || "MWO-2026-0042"}`}
      foot={<><button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-secondary btn-sm">Save draft</button>
            <button className="btn btn-primary btn-sm" disabled={!allOk || submitting} onClick={submit}>Confirm complete</button></>}>
      <div className="summary-block">
        <div style={{fontSize:11, fontWeight:700, color:"var(--muted)", textTransform:"uppercase", letterSpacing:"0.05em", padding:"4px 0"}}>Pre-conditions check</div>
        {preconditions.map(p => (
          <div key={p.k} className="summary-row">
            <span>{p.ok ? "✓" : p.na ? "—" : "✗"} {p.l}</span>
            <span className="spacer"></span>
            <span className="mono" style={{color: p.ok ? "var(--green-700)" : p.na ? "var(--muted)" : "var(--red)"}}>{p.count || (p.na ? "N/A" : p.ok ? "Complete" : "Incomplete")}</span>
          </div>
        ))}
      </div>

      {!allOk && (
        <div className="alert-amber alert-box" style={{fontSize:12, marginBottom:10}}>
          <span>⚠</span>
          <div style={{flex:1}}>2 pre-conditions are incomplete. Complete these before closing the mWO.</div>
          <button className="btn btn-sm btn-secondary">Complete checklist</button>
          <button className="btn btn-sm btn-secondary">Clear LOTO</button>
        </div>
      )}

      <div className="ff-inline">
        <Field label="Actual duration (min)" required><input type="number" placeholder="95"/></Field>
        <Field label="Asset status after work" required>
          <select><option>Operational</option><option>Requires follow-up</option><option>Out of service</option></select>
        </Field>
      </div>
      <Field label="Completion notes" required help="Cannot be blank — V-MNT-04">
        <textarea rows="3" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Describe what was done, parts replaced, and any follow-up recommendations..."></textarea>
      </Field>
      <Field label="Follow-up mWO needed?">
        <label><input type="checkbox"/> Create a follow-up mWO for further work</label>
      </Field>

      <div className="summary-block" style={{marginTop:12}}>
        <div style={{fontSize:11, fontWeight:700, color:"var(--muted)", textTransform:"uppercase", letterSpacing:"0.05em", padding:"4px 0"}}>Sign-off strip</div>
        <div className="summary-row"><span>✓ Technician — M. Nowak</span><span className="spacer"></span><span className="mono" style={{color:"var(--green-700)"}}>Auto-applied</span></div>
        <div className="summary-row"><span>✗ Supervisor counter-sign</span><span className="spacer"></span><button className="btn btn-secondary btn-sm">Request counter-sign</button></div>
        <div className="summary-row"><span>✗ Safety Officer (LOTO was active)</span><span className="spacer"></span><button className="btn btn-secondary btn-sm">Request safety sign-off</button></div>
      </div>
    </Modal>
  );
};

// -------- M-07 PM Schedule Edit (wizard) --------
const PMEditModal = ({ open, onClose, data }) => {
  const [step, setStep] = React.useState("asset");
  const [completed, setCompleted] = React.useState(new Set());
  const [allergen, setAllergen] = React.useState(false);
  const steps = [
    { key: "asset",  label: "Asset & type" },
    { key: "freq",   label: "Frequency" },
    { key: "assign", label: "Assignment" },
    { key: "review", label: "Review + next occurrences" },
  ];
  const next = () => {
    setCompleted(new Set([...completed, step]));
    const idx = steps.findIndex(s=>s.key===step);
    if (idx < steps.length - 1) setStep(steps[idx+1].key);
  };
  const back = () => {
    const idx = steps.findIndex(s=>s.key===step);
    if (idx > 0) setStep(steps[idx-1].key);
  };

  return (
    <Modal open={open} onClose={onClose} size="wide" title={(data && data.mode === "edit") ? `Edit PM schedule — ${data.pm}` : "Create PM schedule"} subtitle="Define recurring maintenance with frequency, template and auto-generation"
      foot={<>
        {step !== "asset" && <button className="btn btn-ghost btn-sm" onClick={back}>← Back</button>}
        <span className="spacer"></span>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        {step === "review" ? <>
          <button className="btn btn-primary btn-sm">Save schedule</button>
          <button className="btn btn-primary btn-sm">Save & activate</button>
        </> : <button className="btn btn-primary btn-sm" onClick={next}>Next →</button>}
      </>}>
      <Stepper steps={steps} current={step} completed={completed}/>

      {step === "asset" && (
        <div style={{marginTop:12}}>
          <Field label="Asset" required><select>{MNT_ASSETS.map(a => <option key={a.id}>{a.id} · {a.name}</option>)}</select></Field>
          <Field label="Schedule type" required>
            <div style={{display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:6}}>
              {["preventive","calibration","sanitation","inspection"].map(t => (
                <label key={t}><input type="radio" name="sched-type" defaultChecked={t==="preventive"} onChange={()=>setAllergen(false)}/> <MwoType t={t}/></label>
              ))}
            </div>
          </Field>
          <Field label="Schedule name" required help="Max 100 chars"><input type="text" placeholder="Monthly Lubrication"/></Field>
          <div style={{marginTop:6}}>
            <label><input type="checkbox" onChange={e=>setAllergen(e.target.checked)}/> Allergen changeover flag (sanitation only)</label>
          </div>
          {allergen && (
            <div className="alert-amber alert-box" style={{fontSize:11, marginTop:8}}>
              <span>⚠</span>
              <div>Allergen changeover sanitation requires dual sign-off when executed. Ensure a QA manager is available.</div>
            </div>
          )}
        </div>
      )}

      {step === "freq" && (
        <div style={{marginTop:12}}>
          <Field label="Interval basis" required>
            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6}}>
              <label><input type="radio" name="basis" defaultChecked/> Calendar days</label>
              <label><input type="radio" name="basis"/> Usage hours</label>
              <label><input type="radio" name="basis"/> Usage cycles</label>
            </div>
          </Field>
          <div className="ff-inline">
            <Field label="Interval value" required><input type="number" defaultValue={30}/></Field>
            <Field label="Warning days" help="Amber badge before due — default 7"><input type="number" defaultValue={7}/></Field>
            <Field label="Lead time days" help="Auto-create mWO before due"><input type="number" defaultValue={3}/></Field>
          </div>
        </div>
      )}

      {step === "assign" && (
        <div style={{marginTop:12}}>
          <Field label="Assigned technician" help="Optional — can be left unassigned">
            <select><option>— Unassigned —</option>{MNT_TECHNICIANS.map(t => <option key={t.id}>{t.name}</option>)}</select>
          </Field>
          <Field label="Task template" help="From checklist template library">
            <select><option>—</option>{MNT_TEMPLATES.map(t => <option key={t.name}>{t.name} · {t.steps} steps</option>)}</select>
          </Field>
          <Field label="Auto-generate mWO">
            <label><input type="checkbox" defaultChecked/> pm_schedule_due_engine_v1 will create mWO at lead-time</label>
          </Field>
        </div>
      )}

      {step === "review" && (
        <div style={{marginTop:12}}>
          <Summary rows={[
            { label: "Asset",     value: "AST-1001 · Mixer M-002" },
            { label: "Type",      value: "Preventive" },
            { label: "Frequency", value: "Every 30 calendar days" },
            { label: "Warning / Lead time", value: "7 days / 3 days" },
            { label: "Technician", value: "M. Nowak" },
            { label: "Template",  value: "Monthly Lubrication Checklist (8 steps)" },
            { label: "Auto-generate", value: "Yes — at lead-time", emphasis: true },
          ]}/>

          <div className="card" style={{marginTop:12, padding:10}}>
            <div className="muted" style={{fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:700, marginBottom:6}}>Next 12 scheduled occurrences (estimated)</div>
            <table>
              <tbody>
                {["2026-05-01 Fri","2026-05-31 Sun","2026-06-30 Tue","2026-07-30 Thu","2026-08-29 Sat","2026-09-28 Mon","2026-10-28 Wed","2026-11-27 Fri","2026-12-27 Sun","2027-01-26 Tue","2027-02-25 Thu","2027-03-27 Sat"].map((d,i)=>(
                  <tr key={i}><td className="mono" style={{fontSize:11, color:"var(--muted)"}}>{i+1}.</td><td className="mono" style={{fontSize:11}}>{d}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="muted" style={{fontSize:10, marginTop:6}}>Occurrence dates are estimates. Actual dates adjust based on completion of each PM.</div>
          </div>
        </div>
      )}
    </Modal>
  );
};

// -------- M-08 PM Occurrence Skip --------
const PMSkipModal = ({ open, onClose, data }) => {
  const [reason, setReason] = React.useState("");
  return (
    <Modal open={open} onClose={onClose} size="default" title={`Skip PM occurrence — ${(data && data.pm) || "PM-0001"}`}
      foot={<><button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-danger btn-sm" disabled={reason.length < 10}>Confirm skip</button></>}>
      <div className="summary-block">
        <div className="summary-row"><span className="muted">Occurrence due date</span><span className="spacer"></span><span className="mono">2026-05-01 (Fri)</span></div>
        <div className="summary-row"><span className="muted">PM</span><span className="spacer"></span><span>Monthly Lubrication — Mixer M-002</span></div>
      </div>
      <Field label="Skip reason" required>
        <select><option>Planned downtime</option><option>Asset offline</option><option>Resource unavailable</option><option>Other</option></select>
      </Field>
      <Field label="Additional notes">
        <ReasonInput value={reason} onChange={setReason} minLength={10} placeholder="Explain why this PM is being skipped..."/>
      </Field>
      <Field label="Next due date override" help="If blank, auto-computed from interval"><input type="date"/></Field>
      <div className="alert-amber alert-box" style={{fontSize:11, marginTop:10}}>
        <span>⚠</span>
        <div>PM compliance metric will be affected. Manager is notified if skip count exceeds threshold.</div>
      </div>
    </Modal>
  );
};

// -------- M-09 Calibration Reading Entry --------
const CalReadingModal = ({ open, onClose, data }) => {
  const [points, setPoints] = React.useState([
    { ref: "0.0 °C",   meas: "", tol: 0.5, inSpec: null },
    { ref: "100.0 °C", meas: "", tol: 0.5, inSpec: null },
    { ref: "180.0 °C", meas: "", tol: 0.5, inSpec: null },
  ]);
  const [result, setResult] = React.useState("PASS");
  const addPoint = () => setPoints([...points, { ref:"", meas:"", tol:0.5, inSpec: null }]);
  const removePoint = (i) => setPoints(points.filter((_,x)=>x!==i));
  const updatePoint = (i, k, v) => {
    const next = points.map((p,x)=>x===i?{...p,[k]:v}:p);
    setPoints(next);
  };

  return (
    <Modal open={open} onClose={onClose} size="wide" title={`Record calibration — ${(data && data.code) || "CAL-TH-0012"}`}
      foot={<><button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary btn-sm">Save calibration record</button></>}>
      <div className="ff-inline">
        <Field label="Calibrated at" required><input type="datetime-local" defaultValue="2026-04-21T10:00"/></Field>
        <Field label="Calibrated by" required>
          <select>{MNT_TECHNICIANS.filter(t => MNT_SKILL_MATRIX[t.id].Calibration !== "none").map(t => <option key={t.id}>{t.name}</option>)}</select>
        </Field>
      </div>
      <Field label="Standard applied" required>
        <select defaultValue="ISO 9001"><option>ISO 9001</option><option>NIST</option><option>Internal</option><option>Other</option></select>
      </Field>

      <div style={{marginTop:6, padding:10, background:"var(--gray-050)", borderRadius:4}}>
        <div className="row-flex" style={{marginBottom:8}}>
          <div className="muted" style={{fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:700}}>Test points (min 1 required)</div>
          <span className="spacer"></span>
          <button className="btn btn-ghost btn-sm" onClick={addPoint}>＋ Add test point</button>
        </div>
        {points.map((p, i) => (
          <div key={i} className="tp-row">
            <input type="text" placeholder="Reference value (e.g. 100.0 g)" value={p.ref} onChange={e=>updatePoint(i,"ref",e.target.value)}/>
            <input type="text" placeholder="Measured value" value={p.meas} onChange={e=>updatePoint(i,"meas",e.target.value)}/>
            <div><input type="number" step="0.01" placeholder="0.5" value={p.tol} onChange={e=>updatePoint(i,"tol",e.target.value)}/> %</div>
            <div className={"tp-check " + (p.inSpec === true ? "ok" : p.inSpec === false ? "fail" : "")}>{p.inSpec === true ? "✓" : p.inSpec === false ? "✗" : "—"}</div>
            <button className="btn btn-ghost btn-sm" onClick={()=>removePoint(i)}>✕</button>
          </div>
        ))}
      </div>

      <div className="card" style={{marginTop:10, padding:10, textAlign:"center"}}>
        <div className="muted" style={{fontSize:10, textTransform:"uppercase", fontWeight:700, marginBottom:4}}>Result (auto-computed)</div>
        <CalResult r={result}/>
        <div style={{marginTop:8}}>
          <label><input type="checkbox" onChange={e=>setResult(e.target.checked ? "FAIL" : "PASS")}/> Mark as FAIL due to equipment condition (override)</label>
        </div>
      </div>

      <Field label="Notes" help=""><textarea rows="2" placeholder="Adjusted reference to 0.1g offset..."></textarea></Field>

      <Field label="Next due date (auto)" help="calibrated_at + interval_days"><input type="date" defaultValue="2026-07-20" readOnly/></Field>

      <Field label="Certificate upload" help="Optional in P1; 21 CFR Part 11 recommended"><input type="file" accept="application/pdf"/></Field>

      {result === "FAIL" && (
        <div className="alert-red alert-box" style={{fontSize:12, marginTop:10}}>
          <span>🚫</span>
          <div>FAIL result will trigger a Quality hold candidate in 09-QUALITY. Linked CCP will be flagged as blocked.</div>
        </div>
      )}
    </Modal>
  );
};

// -------- M-10 Calibration Certificate Upload --------
const CertUploadModal = ({ open, onClose }) => (
  <Modal open={open} onClose={onClose} size="default" title="Upload calibration certificate"
    foot={<><button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm">Upload certificate</button></>}>
    <Field label="Certificate file" required help="PDF only, max 10 MB">
      <input type="file" accept="application/pdf"/>
    </Field>
    <div className="ff-inline">
      <Field label="Certificate date" required><input type="date"/></Field>
      <Field label="Issuing authority" help="Optional"><input type="text" placeholder="e.g. TÜV SÜD Polska"/></Field>
    </div>
    <div className="cert-card" style={{marginTop:10}}>
      <div className="cert-ic">🔐</div>
      <div className="cert-meta">
        <div className="cm-name">SHA-256 hash will be computed after upload</div>
        <div className="cm-hash">— pending —</div>
      </div>
    </div>
    <Field label="Authenticity confirmation" required>
      <label><input type="checkbox"/> I confirm this certificate is authentic and corresponds to the recorded calibration.</label>
    </Field>
  </Modal>
);

// -------- M-11 Spare Part Reorder --------
const SpareReorderModal = ({ open, onClose, data }) => (
  <Modal open={open} onClose={onClose} size="default" title={`Reorder spare part — ${(data && data.code) || "SP-LUB-0042"}`}
    foot={<><button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm">Create purchase request</button></>}>
    <div className="summary-block">
      <div className="summary-row"><span className="muted">Part code</span><span className="spacer"></span><span className="mono" style={{fontWeight:700}}>SP-LUB-0042</span></div>
      <div className="summary-row"><span className="muted">Description</span><span className="spacer"></span><span>Gearbox Lubricant 5L (Castrol EP2)</span></div>
      <div className="summary-row"><span className="muted">Current qty on hand</span><span className="spacer"></span><span className="mono" style={{color:"var(--red)", fontWeight:700}}>2 L (below reorder)</span></div>
    </div>
    <div className="ff-inline">
      <Field label="Reorder qty" required><input type="number" defaultValue={20}/></Field>
      <Field label="Unit of measure"><input type="text" defaultValue="L" readOnly/></Field>
    </div>
    <div className="ff-inline">
      <Field label="Supplier" help="Pre-filled from part master"><input type="text" defaultValue="Castrol PL"/></Field>
      <Field label="Estimated lead time"><input type="text" defaultValue="3 days" readOnly/></Field>
    </div>
    <Field label="Notes"><textarea rows="2" placeholder="Any specifics for this order..."></textarea></Field>
    <div className="alert-blue alert-box" style={{fontSize:11, marginTop:10}}>
      <span>ⓘ</span>
      <div><b>P2 note:</b> In Phase 2, approved purchase requests will automatically push to your ERP purchasing module. In P1, creates internal pending notification.</div>
    </div>
  </Modal>
);

// -------- M-12 Technician Skill Edit --------
const TechSkillModal = ({ open, onClose, data }) => (
  <Modal open={open} onClose={onClose} size="wide" title={`Edit skills — ${(data && data.id) || "TEC-01"} (M. Nowak)`}
    foot={<><button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm">Save</button></>}>
    <Field label="Skill level" required>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6}}>
        <label><input type="radio" name="skl"/> Basic</label>
        <label><input type="radio" name="skl"/> Advanced</label>
        <label><input type="radio" name="skl" defaultChecked/> Specialist</label>
      </div>
    </Field>
    <div style={{marginTop:6, padding:10, background:"var(--gray-050)", borderRadius:4}}>
      <div className="row-flex" style={{marginBottom:8}}>
        <div className="muted" style={{fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:700}}>Certifications</div>
        <span className="spacer"></span>
        <button className="btn btn-ghost btn-sm">＋ Add certification</button>
      </div>
      <table>
        <thead><tr><th>Name</th><th>Issuer</th><th>Issue</th><th>Expiry</th><th>Scan</th><th></th></tr></thead>
        <tbody>
          {["IEC 60079","LOTO Cert.","Refrigeration L2","Food Safety L3"].map((c,i)=>(
            <tr key={i}>
              <td><input type="text" defaultValue={c} style={{fontSize:11}}/></td>
              <td><input type="text" defaultValue="TÜV SÜD" style={{fontSize:11}}/></td>
              <td><input type="date" defaultValue="2024-01-15" style={{fontSize:11}}/></td>
              <td><input type="date" defaultValue="2027-02-20" style={{fontSize:11}}/></td>
              <td><button className="btn btn-ghost btn-sm">⇪</button></td>
              <td><button className="btn btn-ghost btn-sm">✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <div className="muted" style={{fontSize:11, marginTop:8}}>Certification expiry dates are tracked; alerts are sent 30 days before expiry.</div>
  </Modal>
);

// -------- M-13 LOTO Apply --------
const LotoApplyModal = ({ open, onClose, data }) => {
  const [completed, setCompleted] = React.useState(new Set());
  const [zeroEnergy, setZeroEnergy] = React.useState(false);
  const steps = [
    { n: 1, desc: "Main electrical supply breaker",   iso: "Circuit breaker OFF + padlock" },
    { n: 2, desc: "Pneumatic air supply (6 bar)",     iso: "Ball valve CLOSED + lockout tag" },
    { n: 3, desc: "Residual mechanical (flywheel)",   iso: "Flywheel brake APPLIED + pin" },
  ];
  const toggle = (n) => {
    const next = new Set(completed);
    if (next.has(n)) next.delete(n); else next.add(n);
    setCompleted(next);
  };
  const allVerified = steps.every(s => completed.has(s.n));

  return (
    <Modal open={open} onClose={onClose} size="wide" title="Apply lockout / tagout — Mixer M-002" subtitle="Critical asset · Two-person verification required" dismissible={false}
      foot={<><button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary btn-sm" disabled={!allVerified || !zeroEnergy}>Complete LOTO — Apply</button></>}>
      <div className="summary-block">
        <div className="summary-row"><span className="muted">Asset</span><span className="spacer"></span><span>Mixer M-002 (AST-1001) · <CritBadge c="critical"/></span></div>
        <div className="summary-row"><span className="muted">Linked mWO</span><span className="spacer"></span><span className="mono">MWO-2026-0042</span></div>
        <div className="summary-row"><span className="muted">Technician</span><span className="spacer"></span><span>M. Nowak</span></div>
      </div>

      <div style={{marginTop:10}}>
        <div className="muted" style={{fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:700, marginBottom:6}}>
          Energy source isolation ({completed.size}/{steps.length})
        </div>
        {steps.map(s => (
          <div key={s.n} className={"nrg-step " + (completed.has(s.n) ? "done" : "")} onClick={()=>toggle(s.n)} style={{cursor:"pointer"}}>
            <span className="ns-num">{s.n}</span>
            <div className="ns-desc">
              <div>{s.desc}</div>
              <div className="ns-iso">{s.iso}</div>
            </div>
            <div>
              <label><input type="checkbox" checked={completed.has(s.n)} onChange={()=>toggle(s.n)}/> Isolated & verified</label>
              {completed.has(s.n) && (
                <div style={{fontSize:10, color:"var(--amber-700)", marginTop:3}}>⏳ Awaiting confirmation from second verifier (A. Kowalski)</div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div style={{marginTop:10, padding:10, background:"var(--gray-050)", borderRadius:4}}>
        <div className="row-flex" style={{marginBottom:8}}>
          <div className="muted" style={{fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:700}}>Tags / locks applied</div>
          <span className="spacer"></span>
          <button className="btn btn-ghost btn-sm">＋ Add tag/lock</button>
        </div>
        <div className="row-flex" style={{fontSize:11, marginBottom:4}}>
          <input type="text" placeholder="Location description" defaultValue="Main panel MCC-1"/>
          <input type="text" placeholder="Tag ID" defaultValue="TAG-R-001" style={{width:120}}/>
          <input type="text" placeholder="Applied by" defaultValue="M. Nowak" style={{width:120}}/>
          <button className="btn btn-ghost btn-sm">✕</button>
        </div>
      </div>

      <div style={{marginTop:10}}>
        <Field label="Zero-energy verified by" required><select><option>M. Nowak (self-verify)</option><option>A. Kowalski (Safety Officer)</option></select></Field>
        <label><input type="checkbox" checked={zeroEnergy} onChange={e=>setZeroEnergy(e.target.checked)}/> I confirm all energy sources are isolated, zero-energy state is verified, and the equipment is safe to work on.</label>
      </div>

      <div className="alert-amber alert-box" style={{fontSize:11, marginTop:10}}>
        <span>⚠</span>
        <div>Critical assets require two-person LOTO verification per safety protocol. Second verifier must confirm from their own session.</div>
      </div>
    </Modal>
  );
};

// -------- M-14 LOTO Clear --------
const LotoClearModal = ({ open, onClose, data }) => {
  const [checks, setChecks] = React.useState(new Set());
  const [signed, setSigned] = React.useState({ t1: false, t2: false });
  const items = [
    { k: "mwo", l: "Confirm mWO is completed or paused" },
    { k: "workers", l: "All workers are clear of the equipment" },
    { k: "tools", l: "All tools and materials removed from work area" },
    { k: "tags", l: "Tags and locks removed (3/3 removed)" },
    { k: "safe", l: "Equipment is safe to re-energise" },
  ];
  const toggle = (k) => {
    const next = new Set(checks);
    if (next.has(k)) next.delete(k); else next.add(k);
    setChecks(next);
  };
  const allChecked = items.every(i => checks.has(i.k));
  const canConfirm = allChecked && signed.t1 && signed.t2;

  return (
    <Modal open={open} onClose={onClose} size="wide" title={`Clear lockout / tagout — ${(data && data.proc) || "LOTO-2026-0089"}`} dismissible={false}
      foot={<><button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-danger btn-sm" disabled={!canConfirm}>Confirm LOTO clear</button></>}>
      <div className="summary-block">
        <div className="summary-row"><span className="muted">Applied at</span><span className="spacer"></span><span className="mono">2026-04-21 07:02 · by M. Nowak</span></div>
        <div className="summary-row"><span className="muted">Energy sources</span><span className="spacer"></span><span className="mono">3 sources isolated</span></div>
        <div className="summary-row"><span className="muted">Linked mWO</span><span className="spacer"></span><span className="mono" style={{color:"var(--blue)"}}>MWO-2026-0042 · in_progress</span></div>
      </div>

      <div className="alert-amber alert-box" style={{fontSize:12, marginBottom:10}}>
        <span>⚠</span>
        <div>mWO-2026-0042 is still <b>in_progress</b> — verify work is complete or paused before clearing LOTO.</div>
      </div>

      <div>
        <div className="muted" style={{fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:700, marginBottom:6}}>Pre-clear checklist</div>
        {items.map(i => (
          <div key={i.k} className="two-person-step" style={{cursor:"pointer"}} onClick={()=>toggle(i.k)}>
            <span className="tp-num">{checks.has(i.k) ? "✓" : items.findIndex(x=>x.k===i.k)+1}</span>
            <div className="tp-desc">{i.l}</div>
            <input type="checkbox" checked={checks.has(i.k)} readOnly/>
          </div>
        ))}
      </div>

      <div style={{marginTop:10, padding:10, background:"var(--gray-050)", borderRadius:4}}>
        <div className="muted" style={{fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:700, marginBottom:6}}>Release — two-person sign-off (V-MNT-09)</div>
        <div className={"signoff-row " + (signed.t1 ? "done" : "")}>
          <div className="so-avatar">MN</div>
          <div>
            <div className="so-name">M. Nowak</div>
            <div className="so-role">Technician · {signed.t1 ? "Signed 08:14" : "Pending"}</div>
          </div>
          {signed.t1 ? <span className="so-time">✓</span> : <button className="btn btn-primary btn-sm" onClick={()=>setSigned({...signed, t1: true})}>Sign as technician</button>}
        </div>
        <div className={"signoff-row " + (signed.t2 ? "done" : "")}>
          <div className="so-avatar">AK</div>
          <div>
            <div className="so-name">A. Kowalski</div>
            <div className="so-role">Safety Officer · {signed.t2 ? "Signed 08:16" : "Pending"}</div>
          </div>
          {signed.t2 ? <span className="so-time">✓</span> : <button className="btn btn-secondary btn-sm" onClick={()=>setSigned({...signed, t2: true})}>Request second signature</button>}
        </div>
        <Field label="Photo evidence (recommended for critical assets)" help="Configurable in settings">
          <input type="file" accept="image/*"/>
        </Field>
      </div>
    </Modal>
  );
};

// -------- M-15 Delete Confirmation --------
const DeleteConfirmModal = ({ open, onClose, data }) => {
  const [typed, setTyped] = React.useState("");
  const entity = (data && data.entity) || "Asset";
  const code = (data && data.code) || "AST-1001";
  const matches = typed.trim().toUpperCase() === code.toUpperCase();
  return (
    <Modal open={open} onClose={onClose} size="sm" title={`Delete ${entity} — ${code}?`} dismissible={false}
      foot={<><button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-danger btn-sm" disabled={!matches}>Delete</button></>}>
      <div style={{fontSize:12, marginBottom:10}}>
        This action cannot be undone. All records linked to this {entity.toLowerCase()} will be preserved for audit purposes, but the {entity.toLowerCase()} will be deactivated and removed from active lists.
      </div>
      <Field label={`Type ${code} to confirm`} required>
        <input type="text" value={typed} onChange={e=>setTyped(e.target.value)} placeholder={code}/>
      </Field>
    </Modal>
  );
};

// -------- M-16 Criticality Override --------
const CritOverrideModal = ({ open, onClose, data }) => {
  const [reason, setReason] = React.useState("");
  return (
    <Modal open={open} onClose={onClose} size="default" title={`Override criticality — ${(data && data.assetId) || "AST-1001"}`}
      foot={<><button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary btn-sm" disabled={reason.length < 10}>Apply override</button></>}>
      <div className="ff-inline">
        <Field label="Current criticality"><CritBadge c="critical"/></Field>
        <Field label="New criticality" required>
          <select><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
        </Field>
      </div>
      <Field label="Effective date" required><input type="date" defaultValue="2026-04-21"/></Field>
      <Field label="Reason" required>
        <ReasonInput value={reason} onChange={setReason} minLength={10} placeholder="Explain why criticality is being overridden..."/>
      </Field>
      <div className="muted" style={{fontSize:11, marginTop:8}}>All criticality overrides are logged in <span className="mono">maintenance_history</span>.</div>
    </Modal>
  );
};

// -------- M-17 Downtime Linkage --------
const DtLinkModal = ({ open, onClose, data }) => {
  const [selected, setSelected] = React.useState(null);
  return (
    <Modal open={open} onClose={onClose} size="wide" title="Link downtime event to mWO"
      foot={<><button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary btn-sm" disabled={!selected}>Link selected event</button></>}>
      <div className="muted" style={{fontSize:11, marginBottom:10}}>Open downtime events from 08-PRODUCTION for the same asset. Select one row and click Link.</div>
      <table>
        <thead><tr><th></th><th>Event ID</th><th>Line</th><th>Start time</th><th>Duration</th><th>Cause</th></tr></thead>
        <tbody>
          {[
            { id: "DT-2026-0891", line: "LINE-02", start: "2026-04-20 10:22", dur: "23 min", cause: "Plant — Breakdown" },
            { id: "DT-2026-0887", line: "LINE-01", start: "2026-04-20 06:44", dur: "6 min",  cause: "Process — Material wait" },
            { id: "DT-2026-0886", line: "LINE-04", start: "2026-04-20 09:14", dur: "32 min", cause: "Process — Changeover" },
          ].map(e => (
            <tr key={e.id} style={{cursor:"pointer", background: selected === e.id ? "var(--blue-050)" : ""}} onClick={()=>setSelected(e.id)}>
              <td><input type="radio" checked={selected === e.id} onChange={()=>setSelected(e.id)}/></td>
              <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{e.id}</td>
              <td className="mono" style={{fontSize:11}}>{e.line}</td>
              <td className="mono" style={{fontSize:11}}>{e.start}</td>
              <td className="mono" style={{fontSize:11}}>{e.dur}</td>
              <td style={{fontSize:11}}>{e.cause}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="alert-amber alert-box" style={{fontSize:11, marginTop:10}}>
        <span>⚠</span>
        <div>V-MNT-22 · If source=manual_request and you link an event, source is updated to auto_downtime with a note.</div>
      </div>
    </Modal>
  );
};

// -------- Extra: State Transition confirm --------
const StateTransitionModal = ({ open, onClose, data }) => {
  const [reason, setReason] = React.useState("");
  const to = (data && data.to) || "in_progress";
  return (
    <Modal open={open} onClose={onClose} size="default" title={`Transition mWO to ${to}`}
      foot={<><button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
            <button className={"btn btn-sm " + (to === "cancelled" ? "btn-danger" : "btn-primary")}>Confirm</button></>}>
      <div className="summary-block">
        <div className="summary-row"><span className="muted">mWO</span><span className="spacer"></span><span className="mono" style={{fontWeight:700}}>{(data && data.entity) || "MWO-2026-0042"}</span></div>
        <div className="summary-row"><span className="muted">Transition</span><span className="spacer"></span><span>open → <MwoStatus s={to}/></span></div>
      </div>
      {to === "cancelled" && (
        <Field label="Cancellation reason" required>
          <ReasonInput value={reason} onChange={setReason} minLength={10} placeholder="Explain why this mWO is being cancelled..."/>
        </Field>
      )}
    </Modal>
  );
};

// -------- Extra: Spare Adjust (override w/ reason) --------
const SpareAdjustModal = ({ open, onClose, data }) => {
  const [reason, setReason] = React.useState("");
  return (
    <Modal open={open} onClose={onClose} size="default" title={`Adjust stock — ${(data && data.code) || "SP-LUB-0042"}`}
      foot={<><button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary btn-sm" disabled={reason.length < 10}>Apply adjustment</button></>}>
      <div className="ff-inline">
        <Field label="Current qty" help="Last counted 2026-04-14"><input type="number" defaultValue={2} readOnly/></Field>
        <Field label="New qty" required><input type="number"/></Field>
      </div>
      <Field label="Reason" required>
        <select><option>Damage</option><option>Cycle count</option><option>Spillage</option><option>Expired</option><option>Other</option></select>
      </Field>
      <Field label="Detailed reason" required>
        <ReasonInput value={reason} onChange={setReason} minLength={10} placeholder="Describe the adjustment reason..."/>
      </Field>
      <div className="alert-amber alert-box" style={{fontSize:11, marginTop:10}}>
        <span>⚠</span>
        <div>Adjustment with delta &gt; 10% requires manager approval. This change is audit-logged.</div>
      </div>
    </Modal>
  );
};

// ============ MODAL GALLERY ============

const MODAL_CATALOG = [
  { key: "assetEdit",       name: "M-01 · Asset Create / Edit",            pattern: "Simple form + dynamic L3 fields",       comp: AssetEditModal },
  { key: "wrCreate",        name: "M-02 · WR Create (shop-floor)",         pattern: "Simple form + large touch targets",     comp: WRCreateModal },
  { key: "wrTriage",        name: "M-03 · WR Triage",                       pattern: "Dual-path (approve/reject/duplicate)",  comp: WRTriageModal },
  { key: "mwoCreate",       name: "M-04 · mWO Create",                      pattern: "Simple form + conditional fields",       comp: MwoCreateModal },
  { key: "taskCheckoff",    name: "M-05 · mWO Task Check-off",              pattern: "Complex (parts + photo + signoff)",     comp: TaskCheckoffModal },
  { key: "mwoComplete",     name: "M-06 · mWO Complete Sign-off",           pattern: "Multi-role + pre-condition gate",       comp: MwoCompleteModal },
  { key: "pmEdit",          name: "M-07 · PM Schedule Create / Edit",       pattern: "Wizard (4 steps) + occurrence preview",  comp: PMEditModal },
  { key: "pmSkip",          name: "M-08 · PM Occurrence Skip",              pattern: "Override with reason",                   comp: PMSkipModal },
  { key: "calReading",      name: "M-09 · Calibration Reading Entry",       pattern: "Test points + auto-result + cert",      comp: CalReadingModal },
  { key: "certUpload",      name: "M-10 · Calibration Certificate Upload",  pattern: "File upload + SHA-256 + confirmation",  comp: CertUploadModal },
  { key: "sparReorder",     name: "M-11 · Spare Part Reorder",              pattern: "Simple form + supplier info",            comp: SpareReorderModal },
  { key: "techSkill",       name: "M-12 · Technician Skill Edit",           pattern: "Repeating rows",                         comp: TechSkillModal },
  { key: "lotoApply",       name: "M-13 · LOTO Apply",                      pattern: "Two-person wizard + energy checklist",  comp: LotoApplyModal },
  { key: "lotoClear",       name: "M-14 · LOTO Clear (Two-person)",         pattern: "Two-person confirm + photo",             comp: LotoClearModal },
  { key: "deleteConfirm",   name: "M-15 · Delete Confirmation",             pattern: "Type-to-confirm destructive",           comp: DeleteConfirmModal },
  { key: "critOverride",    name: "M-16 · Criticality Override",            pattern: "Override with reason",                   comp: CritOverrideModal },
  { key: "dtLink",          name: "M-17 · Downtime Linkage",                pattern: "Picker from production events",         comp: DtLinkModal },
  { key: "stateTransition", name: "State transition confirm",               pattern: "Confirm + optional reason",              comp: StateTransitionModal },
  { key: "sparAdjust",      name: "Spare adjust stock",                     pattern: "Override with reason + approval gate",   comp: SpareAdjustModal },
];

const ModalGallery = ({ onNav }) => {
  const [open, setOpen] = React.useState(null);
  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Maintenance</a> · Modal gallery</div>
          <h1 className="page-title">Modal gallery</h1>
          <div className="muted" style={{fontSize:12}}>{MODAL_CATALOG.length} components covering M-01 through M-17 plus extras · follows <span className="mono">MODAL-SCHEMA.md</span></div>
        </div>
      </div>

      <div className="alert-blue alert-box" style={{marginBottom:14, fontSize:12}}>
        <span>ⓘ</span>
        <div>
          <b>Click any card to open the modal.</b> Each modal uses the shared primitives (<span className="mono">Modal</span>, <span className="mono">Stepper</span>, <span className="mono">Field</span>, <span className="mono">ReasonInput</span>, <span className="mono">Summary</span>).
          <br/>Schema doc: <span className="mono">_shared/MODAL-SCHEMA.md</span> — read before adding new modals.
        </div>
      </div>

      <div className="gallery-grid">
        {MODAL_CATALOG.map(m => (
          <div key={m.key} className="gallery-card" onClick={()=>setOpen(m.key)}>
            <div className="gallery-pattern">{m.pattern}</div>
            <div className="gallery-name">{m.name}</div>
            <button className="btn btn-secondary btn-sm" style={{marginTop:10}}>Open modal →</button>
          </div>
        ))}
      </div>

      {MODAL_CATALOG.map(m => (
        <m.comp key={m.key} open={open === m.key} onClose={()=>setOpen(null)} data={{}}/>
      ))}
    </>
  );
};

Object.assign(window, {
  AssetEditModal, WRCreateModal, WRTriageModal, MwoCreateModal, TaskCheckoffModal, MwoCompleteModal,
  PMEditModal, PMSkipModal, CalReadingModal, CertUploadModal, SpareReorderModal, TechSkillModal,
  LotoApplyModal, LotoClearModal, DeleteConfirmModal, CritOverrideModal, DtLinkModal,
  StateTransitionModal, SpareAdjustModal,
  ModalGallery, MODAL_CATALOG,
});
