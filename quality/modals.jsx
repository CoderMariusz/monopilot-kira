// ============================================================
// QUALITY MODALS — follows ../_shared/MODAL-SCHEMA.md
//
// Modal inventory (13 modals):
//   MODAL-HOLD-CREATE         — override with reason, segregation-of-duties warn
//   MODAL-HOLD-RELEASE        — destructive with e-sign
//   MODAL-SPEC-SIGN           — approve spec with e-sign + checklist
//   MODAL-TEMPLATE-CREATE     — simple form + parameter block
//   MODAL-SAMPLE-DRAW         — AQL picker + accept/reject auto-decision
//   MODAL-NCR-CREATE          — dual-path (simple / yield-issue / allergen)
//   MODAL-NCR-CLOSE           — destructive with dual-sign (critical)
//   MODAL-CCP-READING         — simple form + live limit check + e-sign
//   MODAL-CCP-DEVIATION-LOG   — simple form
//   MODAL-ESIGN               — generic e-signature
//   MODAL-ALLERGEN-DUAL-SIGN  — second-sign with ATP gate
//   MODAL-AUDIT-EXPORT        — simple form
//   MODAL-DELETE-WITH-REASON  — destructive with audit reason
//   MODAL-INSPECTION-ASSIGN   — picker
// ============================================================

// -------- M-01 · MODAL-HOLD-CREATE --------
const HoldCreateModal = ({ open, onClose }) => {
  const [targetType, setTargetType] = React.useState("LP");
  const [reference, setReference] = React.useState("");
  const [reasonCode, setReasonCode] = React.useState("");
  const [reasonNotes, setReasonNotes] = React.useState("");
  const [priority, setPriority] = React.useState("medium");
  const [disposition, setDisposition] = React.useState("Pending");
  const [estRelease, setEstRelease] = React.useState("2026-04-28");
  const reason = QA_HOLD_REASONS.find(r => r.code === reasonCode);
  const reasonNotesRequired = reason?.category === "Other";
  const valid = reference && reasonCode && (!reasonNotesRequired || reasonNotes.length >= 10);
  const isCritical = priority === "critical";

  return (
    <Modal open={open} onClose={onClose} title="Create Hold" subtitle="LP, Batch, WO, PO, or GRN — quality_holds" size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!valid} onClick={onClose}>Create Hold</button>
      </>}>

      <Field label="Hold target type" required>
        <div className="pills">
          {["LP", "Batch", "Work Order", "Purchase Order", "GRN"].map(t => (
            <button key={t} className={"pill " + (targetType === t ? "on" : "")} onClick={() => setTargetType(t)}>{t}</button>
          ))}
        </div>
      </Field>

      <Field label="Reference" required help="V-QA-HOLD-002 — reference must exist (FK check).">
        <input value={reference} onChange={e => setReference(e.target.value)} placeholder={`Search ${targetType} number… (e.g. LP-4820, WO-2026-0108)`}/>
      </Field>

      <Field label="Hold reason" required>
        <select value={reasonCode} onChange={e => setReasonCode(e.target.value)}>
          <option value="">— Select reason —</option>
          {QA_HOLD_REASONS.map(r => <option key={r.code} value={r.code}>{r.label} (default: {r.defaultDuration}d)</option>)}
        </select>
      </Field>

      {reasonNotesRequired && (
        <Field label="Reason notes" required help="Required for 'Other'. Min 10 chars.">
          <ReasonInput value={reasonNotes} onChange={setReasonNotes} minLength={10} placeholder="Describe the hold reason in detail…"/>
        </Field>
      )}

      <Field label="Priority" required>
        <div className="pills">
          {["low", "medium", "high", "critical"].map(p => (
            <button key={p} className={"pill " + (priority === p ? "on" : "")} onClick={() => setPriority(p)}>
              <span style={{display: "inline-block", width: 6, height: 6, borderRadius: "50%", marginRight: 4, background: p === "critical" ? "var(--red)" : p === "high" ? "var(--amber-700)" : p === "medium" ? "var(--amber)" : "var(--muted)"}}></span>
              {p}
            </button>
          ))}
        </div>
      </Field>

      {isCritical && (
        <div className="alert-box alert-amber" style={{fontSize: 12}}>
          <span>⚠</span>
          <div><b>Critical holds</b> require the creator and release approver to be different users — segregation of duties per <span className="mono">V-QA-HOLD-006</span>.</div>
        </div>
      )}

      <Field label="Disposition (optional)" help="You can set disposition now or when releasing. V-QA-HOLD-005 — must be set before release, cannot be Pending.">
        <select value={disposition} onChange={e => setDisposition(e.target.value)}>
          <option>Pending</option><option>Rework</option><option>Scrap</option><option>Release as-is</option><option>Return to supplier</option><option>Other</option>
        </select>
      </Field>

      <Field label="Estimated release date" help={reason ? `Auto-calculated as today + ${reason.defaultDuration}d` : "Min: today"}>
        <input type="date" value={estRelease} onChange={e => setEstRelease(e.target.value)} min="2026-04-21"/>
      </Field>
    </Modal>
  );
};

// -------- M-02 · MODAL-HOLD-RELEASE --------
const HoldReleaseModal = ({ open, onClose, data }) => {
  const h = data || QA_HOLDS[0];
  const [disposition, setDisposition] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [pin, setPin] = React.useState("");
  const creatorIsSameUser = h.createdBy === "QA.Lead (Ewa Kowalska)";
  const sodBlock = h.priority === "critical" && creatorIsSameUser;
  const valid = disposition && disposition !== "Pending" && notes.length >= 10 && pin.length === 6 && !sodBlock;

  return (
    <Modal open={open} onClose={onClose} title={"Release Hold — " + h.id} size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-sm" style={{background: "var(--green)", color: "#fff", border: 0}} disabled={!valid} onClick={onClose}>🔒 Release Hold</button>
      </>}>

      <Summary rows={[
        { label: "Hold", value: h.id, mono: true },
        { label: "Reference", value: h.refId, mono: true },
        { label: "Reason", value: h.reason, mono: false },
        { label: "Days held", value: h.daysHeld + " days" },
        { label: "Priority", value: h.priority, mono: false },
      ]}/>

      <Field label="Disposition" required help="V-QA-HOLD-005 — must not be Pending">
        <select value={disposition} onChange={e => setDisposition(e.target.value)}>
          <option value="">— Select —</option>
          <option>Rework</option><option>Scrap</option><option>Release as-is</option><option>Return to supplier</option><option>Other</option>
        </select>
      </Field>

      <Field label="Release notes" required help="Describe release rationale / conditions. Min 10 chars, max 1000.">
        <ReasonInput value={notes} onChange={setNotes} minLength={10} placeholder="Describe the reason for release and any conditions…"/>
      </Field>

      {sodBlock && (
        <div className="alert-box alert-red" style={{fontSize: 12}}>
          <span>⚠</span>
          <div>This hold was created by you. Critical holds must be released by a different user (V-QA-HOLD-006). Contact another Quality Lead.</div>
        </div>
      )}

      <div className="esign-block">
        <div className="esign-head">Electronic Signature (21 CFR Part 11)</div>
        <div className="esign-meta">
          Current user: <b>E. Kowalska (QA.Lead)</b> · Server time: <b className="mono">2026-04-21 14:32:18 UTC</b> · Meaning: <span className="mono">released</span>
        </div>
        <div className="esign-pin">
          <input type="password" maxLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ""))} placeholder="● ● ● ● ● ●"/>
          <span style={{fontSize: 11, color: pin.length === 6 ? "var(--green-700)" : "var(--muted)"}}>{pin.length === 6 ? "✓ Ready to sign" : `${pin.length}/6 digits`}</span>
        </div>
        <div style={{fontSize: 10, color: "var(--muted)", marginTop: 6, lineHeight: 1.4}}>
          Your PIN verifies your identity. A SHA-256 hash of user ID + timestamp + record content will be stored. This action is permanent.
        </div>
      </div>
    </Modal>
  );
};

// -------- M-03 · MODAL-SPEC-SIGN --------
const SpecSignModal = ({ open, onClose, data }) => {
  const [pin, setPin] = React.useState("");
  const checks = [
    { ok: true, text: "All parameters have test_method defined (V-QA-SPEC-002)" },
    { ok: true, text: "Min ≤ target ≤ max for all measurement parameters (V-QA-SPEC-003)" },
    { ok: true, text: "Approved_by role is quality_lead (V-QA-SPEC-005)" },
  ];
  const allOk = checks.every(c => c.ok);
  const valid = allOk && pin.length === 6;

  return (
    <Modal open={open} onClose={onClose} title="Approve Specification — SPEC-0142 v3" size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!valid} onClick={onClose}>🔒 Approve Specification</button>
      </>}>

      <Summary rows={[
        { label: "Product", value: "R-1001 Wieprzowina kl. II", mono: false },
        { label: "Spec code", value: "SPEC-0142", mono: true },
        { label: "Version", value: "v3", mono: true },
        { label: "Parameters", value: "8 total (2 critical)" },
        { label: "Effective", value: "2026-04-01 → 2027-04-01", mono: true },
      ]}/>

      <h4 style={{margin: "10px 0 8px", fontSize: 12, textTransform: "uppercase", color: "var(--muted)"}}>Pre-approval checklist</h4>
      <ul className="q-checklist">
        {checks.map((c, i) => (
          <li key={i}><span className={"q-tick " + (c.ok ? "ok" : "fail")}>{c.ok ? "✓" : "✕"}</span>{c.text}</li>
        ))}
      </ul>

      <div className="alert-box alert-blue" style={{fontSize: 12}}>
        <span>ⓘ</span>
        <div>Approving this specification will snapshot the current allergen profile from 03-Technical and create an immutable record. This action cannot be undone.</div>
      </div>

      <div className="esign-block">
        <div className="esign-head">Electronic Signature (21 CFR Part 11)</div>
        <div className="esign-meta">User: <b>E. Kowalska (QA.Lead)</b> · <b className="mono">2026-04-21 14:35:00 UTC</b> · Meaning: <span className="mono">approved</span></div>
        <div className="esign-pin">
          <input type="password" maxLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ""))} placeholder="● ● ● ● ● ●"/>
          <span style={{fontSize: 11, color: pin.length === 6 ? "var(--green-700)" : "var(--muted)"}}>{pin.length === 6 ? "✓ Ready" : `${pin.length}/6`}</span>
        </div>
      </div>
    </Modal>
  );
};

// -------- M-04 · MODAL-TEMPLATE-CREATE --------
const TemplateCreateModal = ({ open, onClose, data }) => {
  const editing = !!data;
  const [name, setName] = React.useState(data?.name || "");
  const [category, setCategory] = React.useState(data?.category || "Microbiological");
  const [params, setParams] = React.useState(data ? data.preview.map((p, i) => ({ name: p, type: category })) : []);
  const valid = name && params.length > 0;

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit Test Template" : "New Test Template"} size="wide"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!valid} onClick={onClose}>Save Template</button>
      </>}>
      <Field label="Template name" required><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Standard microbiological panel"/></Field>
      <Field label="Category" required>
        <select value={category} onChange={e => setCategory(e.target.value)}>
          <option>Microbiological</option><option>Chemical</option><option>Physical</option><option>Sensory</option><option>Visual</option><option>Equipment</option>
        </select>
      </Field>
      <Field label={`Parameters (${params.length})`}>
        <table>
          <thead><tr><th>Name</th><th>Type</th><th></th></tr></thead>
          <tbody>
            {params.map((p, i) => (
              <tr key={i}>
                <td><input value={p.name} onChange={e => setParams(params.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}/></td>
                <td><span className="qa-badge badge-draft">{p.type}</span></td>
                <td><button className="btn btn-ghost btn-sm" onClick={() => setParams(params.filter((_, j) => j !== i))}>🗑</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn btn-secondary btn-sm" style={{marginTop: 6}} onClick={() => setParams([...params, { name: "", type: category }])}>＋ Add parameter</button>
      </Field>
    </Modal>
  );
};

// -------- M-05 · MODAL-SAMPLE-DRAW --------
const SampleDrawModal = ({ open, onClose, data }) => {
  const insp = data || QA_INSPECTION_DETAIL;
  const [drawn, setDrawn] = React.useState(8);
  const [locs, setLocs] = React.useState("Pallet 1 position 3, Pallet 4 position 7");
  const [defects, setDefects] = React.useState(0);
  const plan = insp.samplingPlan || { code: "ISO-AQL-2.5-GII", aql: 2.5, level: "GII", lotSize: 840, sampleSize: 32, accept: 2, reject: 3 };
  const remaining = plan.sampleSize - (insp.samplesTaken || 0);
  const decision = defects <= plan.accept ? "accept" : defects >= plan.reject ? "reject" : "inconclusive";

  return (
    <Modal open={open} onClose={onClose} title={"Draw Sample — " + insp.id} size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={onClose}>Record sample draw</button>
      </>}>
      <Summary rows={[
        { label: "Plan code", value: plan.code, mono: true },
        { label: "AQL / Level", value: plan.aql + " / " + plan.level, mono: true },
        { label: "Lot size", value: plan.lotSize, mono: true },
        { label: "Required samples (n)", value: plan.sampleSize + " units" },
        { label: "Accept / Reject", value: `Ac = ${plan.accept} · Re = ${plan.reject}` },
        { label: "Already drawn", value: (insp.samplesTaken || 0) + " / " + plan.sampleSize, emphasis: true },
      ]}/>

      <Field label="Number of samples to draw" required help={`Max remaining: ${remaining}`}>
        <input type="number" value={drawn} onChange={e => setDrawn(+e.target.value)} max={remaining} className="num mono"/>
      </Field>

      <Field label="Sample locations" required>
        <textarea value={locs} onChange={e => setLocs(e.target.value)} placeholder="Describe where samples were drawn from (pallet + position)"/>
      </Field>

      <Field label="Defects found during sampling" help="Auto-decision updates below">
        <input type="number" value={defects} onChange={e => setDefects(+e.target.value)} className="num mono"/>
      </Field>

      <div className={"alert-box " + (decision === "accept" ? "alert-green" : decision === "reject" ? "alert-red" : "alert-amber")} style={{fontSize: 12}}>
        <span>{decision === "accept" ? "✓" : decision === "reject" ? "⚠" : "⚠"}</span>
        <div>
          <b>AQL decision: {decision.toUpperCase()}</b><br/>
          {decision === "accept" && `${defects} defects ≤ Ac (${plan.accept}) — lot accepted.`}
          {decision === "reject" && `${defects} defects ≥ Re (${plan.reject}) — lot rejected. NCR will be auto-created.`}
          {decision === "inconclusive" && `${defects} defects between Ac and Re — inconclusive. Draw remaining samples.`}
        </div>
      </div>

      <Field label="Notes (optional)"><textarea placeholder="Additional context…" rows={2}/></Field>
    </Modal>
  );
};

// -------- M-06 · MODAL-NCR-CREATE --------
const NcrCreateModal = ({ open, onClose, data }) => {
  const [type, setType] = React.useState(data?.type || "quality");
  const [severity, setSeverity] = React.useState("major");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [targetYield, setTargetYield] = React.useState("92");
  const [actualYield, setActualYield] = React.useState("86");
  const [allergenLink, setAllergenLink] = React.useState("");
  const valid = title && description.length >= 20 && (type !== "yield_issue" || targetYield && actualYield) && (type !== "allergen_deviation" || allergenLink);
  const dueMap = { critical: "24h", major: "48h", minor: "7 days" };

  return (
    <Modal open={open} onClose={onClose} title="Create Non-Conformance Report" size="wide"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-secondary btn-sm">Save as draft</button>
        <button className="btn btn-primary btn-sm" disabled={!valid} onClick={onClose}>Submit NCR</button>
      </>}>

      <div className="ff-inline">
        <Field label="NCR type" required>
          <select value={type} onChange={e => setType(e.target.value)}>
            <option value="quality">Quality</option>
            <option value="yield_issue">Yield issue</option>
            <option value="allergen_deviation">Allergen deviation</option>
            <option value="supplier">Supplier</option>
            <option value="process">Process</option>
            <option value="complaint_related">Complaint-related</option>
          </select>
        </Field>
        <Field label="Severity" required help={<span>Due within: <b>{dueMap[severity]}</b> · <span className="reg-tag">BRCGS Issue 10 §3.8</span></span>}>
          <div className="pills">
            {["critical", "major", "minor"].map(s => (
              <button key={s} className={"pill " + (severity === s ? "on" : "")} onClick={() => setSeverity(s)}>{s}</button>
            ))}
          </div>
        </Field>
      </div>

      <Field label="Title" required><input value={title} onChange={e => setTitle(e.target.value)} maxLength={200} placeholder="Brief summary of the non-conformance"/></Field>

      <Field label="Description" required error={description.length > 0 && description.length < 20 ? "Min 20 characters" : null} help={`${description.length}/2000 chars (min 20)`}>
        <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={2000} rows={4} placeholder="Detailed description of the issue, context, observations…"/>
      </Field>

      {type === "yield_issue" && (
        <div style={{border: "1px dashed var(--border)", padding: 10, borderRadius: 4, marginBottom: 10}}>
          <div style={{fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", marginBottom: 6}}>Yield details (V-QA-NCR-003)</div>
          <div className="ff-inline">
            <Field label="Target yield %" required><input type="number" value={targetYield} onChange={e => setTargetYield(e.target.value)}/></Field>
            <Field label="Actual yield %" required><input type="number" value={actualYield} onChange={e => setActualYield(e.target.value)}/></Field>
          </div>
          <div className="ff-inline">
            <Field label="Claim %"><input type="number" defaultValue="-6"/></Field>
            <Field label="Est. claim value (EUR)"><input type="number" defaultValue="1440"/></Field>
          </div>
        </div>
      )}

      {type === "allergen_deviation" && (
        <Field label="Link to allergen gate or CCP deviation" required help="V-QA-NCR-004">
          <input value={allergenLink} onChange={e => setAllergenLink(e.target.value)} placeholder="e.g. ACG-2026-0038 or CCP-006 reading #4412"/>
        </Field>
      )}

      <div className="ff-inline">
        <Field label="Source reference (optional)">
          <select><option>— None —</option><option>Inspection</option><option>Hold</option><option>CCP deviation</option><option>Complaint</option><option>Supplier</option><option>Internal</option></select>
        </Field>
        <Field label="Product"><select><option>— Select —</option><option>R-1001 Wieprzowina kl. II</option><option>FA5100 Kiełbasa śląska pieczona 450g</option><option>FA5200 Pasztet drobiowy z żurawiną 180g</option></select></Field>
      </div>

      <div className="ff-inline">
        <Field label="Affected qty (kg)"><input type="number" className="num mono"/></Field>
        <Field label="Detected at" required><input type="datetime-local" defaultValue="2026-04-21T14:35"/></Field>
      </div>

      <Field label="Detected location"><input maxLength={100} placeholder="e.g. Line-1 post-pasteurisation"/></Field>
      <Field label="Immediate action"><textarea maxLength={500} rows={2} placeholder="What was done immediately to contain the issue…"/></Field>
      <Field label="Assign to"><select><option>— Unassigned —</option><option>QA.Lead</option><option>QA.Inspector1</option><option>QA.Inspector2</option></select></Field>
    </Modal>
  );
};

// -------- M-07 · MODAL-NCR-CLOSE --------
const NcrCloseModal = ({ open, onClose, data }) => {
  const ncr = data || QA_NCR_DETAIL;
  const [notes, setNotes] = React.useState("");
  const [rootCause, setRootCause] = React.useState(ncr.rootCause || "");
  const [rcCat, setRcCat] = React.useState("");
  const [qaPin, setQaPin] = React.useState("");
  const [pmPin, setPmPin] = React.useState("");
  const isCritical = ncr.severity === "critical";
  const checks = [
    { ok: !!rootCause, text: "Root cause filled (V-QA-NCR-005)" },
    { ok: ncr.immediateAction?.length > 0, text: "Immediate action recorded" },
    { ok: true, text: "All linked holds resolved" },
    { ok: false, text: "CAPA assigned (P2 — informational only)" },
  ];
  const valid = notes.length >= 10 && rootCause && rcCat && qaPin.length === 6 && (!isCritical || pmPin.length === 6);

  return (
    <Modal open={open} onClose={onClose} title={"Close NCR — " + ncr.id} size="wide"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-sm" style={{background: "var(--green)", color: "#fff", border: 0}} disabled={!valid} onClick={onClose}>🔒 Close NCR</button>
      </>}>

      <Summary rows={[
        { label: "NCR", value: ncr.id, mono: true },
        { label: "Title", value: ncr.title, mono: false },
        { label: "Severity", value: ncr.severity, mono: false, emphasis: isCritical },
        { label: "Status", value: ncr.status, mono: false },
      ]}/>

      <h4 style={{margin: "10px 0 6px", fontSize: 12, textTransform: "uppercase"}}>Pre-close checklist</h4>
      <ul className="q-checklist">
        {checks.map((c, i) => (
          <li key={i}><span className={"q-tick " + (c.ok ? "ok" : "fail")}>{c.ok ? "✓" : "✕"}</span>{c.text}</li>
        ))}
      </ul>

      <Field label="Closure notes" required help="Min 10 chars, max 1000.">
        <ReasonInput value={notes} onChange={setNotes} minLength={10} placeholder="Describe closure rationale and resolution actions…"/>
      </Field>

      <Field label="Root cause" required help="V-QA-NCR-005 — required before close">
        <textarea value={rootCause} onChange={e => setRootCause(e.target.value)} rows={3}/>
      </Field>

      <Field label="Root cause category" required>
        <select value={rcCat} onChange={e => setRcCat(e.target.value)}>
          <option value="">— Select —</option>
          <option>contamination</option><option>process_failure</option><option>equipment_failure</option><option>human_error</option><option>supplier</option><option>specification</option><option>other</option>
        </select>
      </Field>

      {isCritical ? (
        <div className="alert-box alert-amber" style={{fontSize: 12, marginBottom: 10}}>
          <span>⚠</span>
          <div>Critical NCR — <b>dual signature required</b> (V-QA-NCR-006). Both Quality Lead and Production Manager must sign.</div>
        </div>
      ) : null}

      <div style={{display: "grid", gridTemplateColumns: isCritical ? "1fr 1fr" : "1fr", gap: 10}}>
        <div className="esign-block">
          <div className="esign-head">{isCritical ? "First signer — Quality Lead" : "Signature — Quality Lead"}</div>
          <div className="esign-meta"><b>E. Kowalska (QA.Lead)</b> · <span className="mono">2026-04-21 14:40</span></div>
          <div className="esign-pin">
            <input type="password" maxLength={6} value={qaPin} onChange={e => setQaPin(e.target.value.replace(/\D/g, ""))} placeholder="● ● ● ● ● ●"/>
            <span style={{fontSize: 11, color: qaPin.length === 6 ? "var(--green-700)" : "var(--muted)"}}>{qaPin.length === 6 ? "✓" : `${qaPin.length}/6`}</span>
          </div>
        </div>
        {isCritical && (
          <div className="esign-block">
            <div className="esign-head">Second signer — Production Manager</div>
            <div className="esign-meta"><b>M. Krawczyk (Prod.Manager)</b> · <span className="mono">2026-04-21 14:40</span></div>
            <div className="esign-pin">
              <input type="password" maxLength={6} value={pmPin} onChange={e => setPmPin(e.target.value.replace(/\D/g, ""))} placeholder="● ● ● ● ● ●"/>
              <span style={{fontSize: 11, color: pmPin.length === 6 ? "var(--green-700)" : "var(--muted)"}}>{pmPin.length === 6 ? "✓" : `${pmPin.length}/6`}</span>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

// -------- M-08 · MODAL-CCP-READING --------
const CcpReadingModal = ({ open, onClose, data }) => {
  const [ccp, setCcp] = React.useState(data?.id || "CCP-001");
  const [value, setValue] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [wo, setWo] = React.useState("WO-2026-0108");
  const [pin, setPin] = React.useState("");
  const ccpDef = QA_CCPS.find(c => c.id === ccp);
  const valNum = +value;
  const withinLimits = value !== "" && ccpDef && (ccpDef.limitMin === null || valNum >= ccpDef.limitMin) && (ccpDef.limitMax === null || valNum <= ccpDef.limitMax);
  const outOfLimits = value !== "" && !withinLimits;
  const hazardSignRequired = ccpDef?.hazardType === "biological" || ccpDef?.hazardType === "allergen";
  const notesRequired = outOfLimits;
  const valid = value !== "" && (!notesRequired || notes.length > 0) && (!hazardSignRequired || pin.length === 6);

  return (
    <Modal open={open} onClose={onClose} title="Record CCP Reading" size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!valid} onClick={onClose}>{hazardSignRequired ? "🔒 " : ""}Record reading</button>
      </>}>

      <Field label="CCP" required>
        <select value={ccp} onChange={e => setCcp(e.target.value)}>
          {QA_HACCP_PLANS.map(p => (
            <optgroup key={p.id} label={p.code}>
              {QA_CCPS.filter(c => c.planId === p.id).map(c => <option key={c.id} value={c.id}>{c.code} — {c.step} · {c.hazardType}</option>)}
            </optgroup>
          ))}
        </select>
      </Field>

      {ccpDef && (
        <div style={{padding: "8px 10px", background: "var(--gray-050)", borderRadius: 4, fontSize: 11, marginBottom: 10}}>
          <div><b>{ccpDef.code}</b> · <HazardBadge h={ccpDef.hazardType}/> · {ccpDef.step}</div>
          <div style={{marginTop: 4}}>Critical limits: <b className="mono">{ccpDef.limitMin ?? "—"} – {ccpDef.limitMax ?? "—"} {ccpDef.unit}</b></div>
          <div style={{marginTop: 2}}>Frequency: {ccpDef.monFreq}</div>
        </div>
      )}

      <Field label="Measured value" required help={`Unit: ${ccpDef?.unit || "—"}`}>
        <div style={{display: "flex", gap: 6, alignItems: "center"}}>
          <input type="number" value={value} onChange={e => setValue(e.target.value)} className="num mono" step="0.01"/>
          <span className="mono" style={{fontSize: 11, color: "var(--muted)"}}>{ccpDef?.unit}</span>
        </div>
      </Field>

      {withinLimits && (
        <div className="alert-box alert-green" style={{fontSize: 12}}>
          <span>✓</span>
          <div><b>Within critical limits</b> — reading will be saved normally.</div>
        </div>
      )}
      {outOfLimits && (
        <div className="alert-box alert-red" style={{fontSize: 12}}>
          <span>⚠</span>
          <div>
            <b>OUTSIDE CRITICAL LIMITS</b> — deviation will be auto-recorded.<br/>
            <span style={{fontSize: 11}}>NCR draft will be auto-created. {ccpDef?.hazardType === "biological" && "Critical severity: WO will also be auto-placed on hold."}</span>
          </div>
        </div>
      )}

      <Field label="Work Order link (optional)">
        <input value={wo} onChange={e => setWo(e.target.value)} className="mono" placeholder="WO-2026-0108"/>
      </Field>

      <Field label={"Notes" + (notesRequired ? " (required for deviations)" : " (optional)")} error={notesRequired && !notes ? "Required — describe observation context" : null}>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Context, observations, actions taken…"/>
      </Field>

      {hazardSignRequired && (
        <div className="esign-block">
          <div className="esign-head">Signature required ({ccpDef?.hazardType} hazard — V-QA-CCP-005)</div>
          <div className="esign-meta">User: <b>Hygiene.Lead</b> · <span className="mono">2026-04-21 14:45</span></div>
          <div className="esign-pin">
            <input type="password" maxLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ""))} placeholder="● ● ● ● ● ●"/>
            <span style={{fontSize: 11, color: pin.length === 6 ? "var(--green-700)" : "var(--muted)"}}>{pin.length === 6 ? "✓" : `${pin.length}/6`}</span>
          </div>
        </div>
      )}
    </Modal>
  );
};

// -------- M-09 · MODAL-CCP-DEVIATION-LOG --------
const CcpDeviationLogModal = ({ open, onClose }) => {
  const [ccp, setCcp] = React.useState("CCP-001");
  const [action, setAction] = React.useState("");
  const [pin, setPin] = React.useState("");
  const ccpDef = QA_CCPS.find(c => c.id === ccp);
  const signReq = ccpDef?.hazardType === "biological" || ccpDef?.hazardType === "allergen";
  const valid = action.length >= 10 && (!signReq || pin.length === 6);

  return (
    <Modal open={open} onClose={onClose} title="Log CCP Deviation" size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!valid} onClick={onClose}>Log deviation</button>
      </>}>
      <Field label="CCP" required>
        <select value={ccp} onChange={e => setCcp(e.target.value)}>
          {QA_CCPS.map(c => <option key={c.id} value={c.id}>{c.code} — {c.step}</option>)}
        </select>
      </Field>
      <Field label="Observed value" required><input type="number" className="num mono" placeholder={`${ccpDef?.limitMin ?? ""}–${ccpDef?.limitMax ?? ""} ${ccpDef?.unit}`}/></Field>
      <Field label="Deviation description" required><textarea rows={2} placeholder="Describe deviation context…"/></Field>
      <Field label="Severity override (auto-computed from hazard_type)">
        <select defaultValue={ccpDef?.hazardType === "biological" || ccpDef?.hazardType === "allergen" ? "critical" : ccpDef?.hazardType === "chemical" || ccpDef?.hazardType === "physical" ? "major" : "minor"}>
          <option value="critical">Critical (auto)</option><option value="major">Major (auto)</option><option value="minor">Minor (auto)</option>
        </select>
      </Field>
      <Field label="Corrective action taken" required>
        <ReasonInput value={action} onChange={setAction} minLength={10} placeholder="Describe the corrective action taken…"/>
      </Field>
      <Field label="Linked monitoring record (optional)"><input placeholder="Search CCP reading ID…" className="mono"/></Field>

      {signReq && (
        <div className="esign-block">
          <div className="esign-head">Signature required ({ccpDef?.hazardType})</div>
          <div className="esign-meta">User: <b>Hygiene.Lead</b></div>
          <div className="esign-pin"><input type="password" maxLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ""))} placeholder="● ● ● ● ● ●"/></div>
        </div>
      )}
    </Modal>
  );
};

// -------- M-10 · MODAL-ESIGN (generic) --------
const ESignModal = ({ open, onClose, data }) => {
  const [pin, setPin] = React.useState("");
  const [verifying, setVerifying] = React.useState(false);
  const [verified, setVerified] = React.useState(false);
  const valid = verified;

  const verify = () => {
    setVerifying(true);
    setTimeout(() => { setVerifying(false); setVerified(pin.length === 6); }, 700);
  };

  return (
    <Modal open={open} onClose={onClose} title="Electronic Signature" size="sm"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!valid} onClick={onClose}>🔒 Sign</button>
      </>}>
      <div className="esign-block">
        <div className="esign-head">21 CFR Part 11 — electronic signature</div>
        <div className="esign-meta">User: <b>E. Kowalska (Quality Lead)</b></div>
        <div className="esign-meta">Timestamp (server): <b className="mono">2026-04-21 14:50:12 UTC</b></div>
        <div className="esign-meta">Action: <b>{data?.meaning === "inspection pass" ? "Submitting inspection (PASS)" : data?.meaning === "inspection fail" ? "Submitting inspection (FAIL)" : data?.meaning === "approved" ? "Approving record" : "Signing record"}</b></div>
        <div className="esign-meta">Signature meaning: <span className="mono">{data?.meaning === "inspection pass" ? "approved" : data?.meaning === "inspection fail" ? "witnessed" : data?.meaning || "approved"}</span></div>
      </div>

      <Field label="PIN" required help="6-digit PIN, masked for security">
        <div className="esign-pin">
          <input type="password" maxLength={6} value={pin} onChange={e => { setPin(e.target.value.replace(/\D/g, "")); setVerified(false); }} placeholder="● ● ● ● ● ●" autoFocus/>
          <button className="btn btn-secondary btn-sm" disabled={pin.length !== 6 || verifying} onClick={verify}>{verifying ? "Verifying…" : verified ? "✓ Verified" : "Verify PIN"}</button>
        </div>
      </Field>

      <div style={{fontSize: 10, color: "var(--muted)", marginTop: 6, lineHeight: 1.4}}>
        This signature is an electronic record per 21 CFR Part 11. A SHA-256 hash of your user ID, timestamp, and record content will be permanently stored.
      </div>
    </Modal>
  );
};

// -------- M-11 · MODAL-ALLERGEN-DUAL-SIGN --------
const AllergenDualSignModal = ({ open, onClose, data }) => {
  const g = data || QA_ALLERGEN_GATES[0];
  const [pin, setPin] = React.useState("");
  const [override, setOverride] = React.useState(false);
  const [overrideJust, setOverrideJust] = React.useState("");
  const atpOver = g.atpRlu > g.atpThreshold;
  const approveBlocked = atpOver && g.riskLevel !== "low" && !override;
  const valid = pin.length === 6 && (!approveBlocked) && (!override || overrideJust.length >= 10);

  return (
    <Modal open={open} onClose={onClose} title="Sign Allergen Changeover Gate — Second Signature" size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-danger btn-sm" onClick={onClose}>Reject gate</button>
        <button className="btn btn-sm" style={{background: "var(--green)", color: "#fff", border: 0}} disabled={!valid} onClick={onClose}>🔒 Sign (approve)</button>
      </>}>

      <Summary rows={[
        { label: "Gate ID", value: g.id, mono: true },
        { label: "WO pair", value: g.woFrom + " → " + g.woTo, mono: true },
        { label: "Allergen delta", value: g.allergensRemoved.map(a => "-" + a).concat(g.allergensAdded.map(a => "+" + a)).join(", "), mono: false },
        { label: "Risk level", value: g.riskLevel, mono: false },
        { label: "ATP result (RLU)", value: g.atpRlu + " / threshold " + g.atpThreshold, emphasis: true, mono: true },
      ]}/>

      <div className="reg-tag" style={{margin: "8px 0"}}>Regulation: EU FIC 1169/2011 + Reg 2021/382 · V-QA-ALLERGEN-001</div>

      <div className="esign-block" style={{marginBottom: 10}}>
        <div className="esign-head">First signature (recorded)</div>
        <div className="esign-meta">User: <b>{g.firstSigner?.user}</b> · <span className="mono">{g.firstSigner?.at}</span> · <span className="qa-badge badge-signed">🔒</span></div>
      </div>

      {approveBlocked && (
        <div className="alert-box alert-red" style={{fontSize: 12, marginBottom: 10}}>
          <span>⚠</span>
          <div>
            <b>ATP result exceeds threshold ({g.atpRlu} RLU &gt; {g.atpThreshold} RLU).</b> Approval blocked per V-QA-ALLERGEN-002.
            <div style={{marginTop: 6}}>
              <label><input type="checkbox" checked={override} onChange={e => setOverride(e.target.checked)}/> Override (requires justification)</label>
            </div>
          </div>
        </div>
      )}

      {override && (
        <Field label="Override justification" required>
          <ReasonInput value={overrideJust} onChange={setOverrideJust} minLength={10} placeholder="Document the override rationale…"/>
        </Field>
      )}

      <div className="esign-block">
        <div className="esign-head">Second signer — Quality Lead</div>
        <div className="esign-meta">User: <b>E. Kowalska</b> · <span className="mono">2026-04-21 14:55</span> · Meaning: <span className="mono">approved</span></div>
        <div className="esign-pin">
          <input type="password" maxLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ""))} placeholder="● ● ● ● ● ●" autoFocus/>
          <span style={{fontSize: 11, color: pin.length === 6 ? "var(--green-700)" : "var(--muted)"}}>{pin.length === 6 ? "✓" : `${pin.length}/6`}</span>
        </div>
      </div>
    </Modal>
  );
};

// -------- M-12 · MODAL-AUDIT-EXPORT --------
const AuditExportModal = ({ open, onClose }) => {
  const [format, setFormat] = React.useState("CSV");
  const [preparing, setPreparing] = React.useState(false);
  const [ready, setReady] = React.useState(false);

  const gen = () => {
    setPreparing(true);
    setTimeout(() => { setPreparing(false); setReady(true); }, 1200);
  };

  return (
    <Modal open={open} onClose={onClose} title="Export Audit Trail" size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={preparing} onClick={gen}>{preparing ? "Preparing…" : ready ? "Export ready ✓" : "Generate export"}</button>
      </>}>

      <div className="ff-inline">
        <Field label="Date from" required><input type="date" defaultValue="2026-03-21"/></Field>
        <Field label="Date to" required><input type="date" defaultValue="2026-04-21"/></Field>
      </div>

      <Field label="Scope — tables">
        <select defaultValue="all">
          <option value="all">All tables</option>
          <option>quality_holds</option><option>quality_inspections</option><option>quality_specifications</option>
          <option>ncr_reports</option><option>haccp_monitoring_records</option><option>ccp_monitoring_records</option>
          <option>allergen_changeover_validations</option>
        </select>
      </Field>

      <Field label="Scope — user">
        <select><option>All users</option><option>QA.Lead</option><option>QA.Inspector1</option><option>Hygiene.Lead</option></select>
      </Field>

      <Field label="Format" required>
        <div className="pills">
          {["CSV", "JSON"].map(f => (
            <button key={f} className={"pill " + (format === f ? "on" : "")} onClick={() => setFormat(f)}>{f}</button>
          ))}
        </div>
      </Field>

      <div className="alert-box alert-blue" style={{fontSize: 12}}>
        <span>ⓘ</span>
        <div>Exports are timestamped and logged. Exporting audit records is itself an audit event. <span className="reg-tag">Regulation: BRCGS Issue 10 §3.11.1</span></div>
      </div>

      {ready && (
        <div className="alert-box alert-green" style={{fontSize: 12, marginTop: 8}}>
          <span>✓</span>
          <div>Export ready. <a style={{color: "var(--blue)", cursor: "pointer"}}>⬇ Download: quality_audit_all_2026-03-21_2026-04-21_{Date.now()}.{format.toLowerCase()}</a></div>
        </div>
      )}
    </Modal>
  );
};

// -------- M-13 · MODAL-DELETE-WITH-REASON --------
const DeleteWithReasonModal = ({ open, onClose, data }) => {
  const entity = data?.entity || "draft NCR";
  const id = data?.id || "NCR-2026-XXXX";
  const [reason, setReason] = React.useState("");
  const valid = reason.length >= 10;

  return (
    <Modal open={open} onClose={onClose} title={"Delete " + entity} size="sm"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-danger btn-sm" disabled={!valid} onClick={onClose}>Delete</button>
      </>}>
      <div className="alert-box alert-red" style={{fontSize: 12, marginBottom: 10}}>
        <span>⚠</span>
        <div>Are you sure you want to delete <b className="mono">{id}</b>? This action is recorded in the audit trail and cannot be undone for active or signed records.</div>
      </div>
      <Field label="Reason for deletion" required help="Min 10 chars — audit-logged">
        <ReasonInput value={reason} onChange={setReason} minLength={10} placeholder="Document the deletion rationale…"/>
      </Field>
    </Modal>
  );
};

// -------- M-14 · MODAL-INSPECTION-ASSIGN --------
const InspectionAssignModal = ({ open, onClose, data }) => {
  const insp = data || QA_INSPECTIONS[0];
  const [inspector, setInspector] = React.useState("");
  const valid = inspector;

  return (
    <Modal open={open} onClose={onClose} title={"Assign Inspection — " + insp.id} size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!valid} onClick={onClose}>Assign</button>
      </>}>
      <Summary rows={[
        { label: "Inspection", value: insp.id, mono: true },
        { label: "GRN", value: insp.grn, mono: true },
        { label: "Product", value: insp.product, mono: false },
        { label: "Priority", value: insp.priority, mono: false },
      ]}/>
      <Field label="Assign to inspector" required>
        <select value={inspector} onChange={e => setInspector(e.target.value)}>
          <option value="">— Select inspector —</option>
          <option>QA.Inspector1 — E. Nowak</option>
          <option>QA.Inspector2 — K. Zawadzka</option>
          <option>QA.Lead — E. Kowalska (also inspector)</option>
        </select>
      </Field>
      <Field label="Priority override (optional)">
        <select defaultValue={insp.priority}>
          <option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
        </select>
      </Field>
      <Field label="Notes"><textarea rows={2} placeholder="Assignment notes…"/></Field>
    </Modal>
  );
};

// ============ MODAL GALLERY ============
const QA_MODAL_CATALOG = [
  { key: "holdCreate",         name: "MODAL-HOLD-CREATE · Create Hold",                         pattern: "Override with reason + SoD warn",          comp: HoldCreateModal },
  { key: "holdRelease",        name: "MODAL-HOLD-RELEASE · Release Hold",                       pattern: "Destructive + e-sign (21 CFR)",            comp: HoldReleaseModal },
  { key: "specSign",           name: "MODAL-SPEC-SIGN · Approve Specification",                  pattern: "Checklist + e-sign",                        comp: SpecSignModal },
  { key: "templateCreate",     name: "MODAL-TEMPLATE-CREATE · New Test Template",                pattern: "Simple form + parameter block",            comp: TemplateCreateModal },
  { key: "sampleDraw",         name: "MODAL-SAMPLE-DRAW · Draw Sample",                          pattern: "AQL picker + auto-decision",                comp: SampleDrawModal },
  { key: "ncrCreate",          name: "MODAL-NCR-CREATE · Create NCR",                            pattern: "Dual-path (yield/allergen/quality)",       comp: NcrCreateModal },
  { key: "ncrClose",           name: "MODAL-NCR-CLOSE · Close NCR",                              pattern: "Checklist + dual-sign (critical)",         comp: NcrCloseModal },
  { key: "ccpReading",         name: "MODAL-CCP-READING · CCP Reading Entry",                    pattern: "Simple form + live limit check",           comp: CcpReadingModal },
  { key: "ccpDeviationLog",    name: "MODAL-CCP-DEVIATION-LOG · Log Deviation Manually",         pattern: "Simple form + corrective action",          comp: CcpDeviationLogModal },
  { key: "eSign",              name: "MODAL-ESIGN · Generic E-Signature",                        pattern: "E-sign primitive (shared)",                 comp: ESignModal },
  { key: "allergenDualSign",   name: "MODAL-ALLERGEN-DUAL-SIGN · Allergen Gate Second Sign",     pattern: "Dual-sign + ATP gate + override",          comp: AllergenDualSignModal },
  { key: "auditExport",        name: "MODAL-AUDIT-EXPORT · Export Audit Trail",                  pattern: "Simple form + async prep",                  comp: AuditExportModal },
  { key: "deleteReason",       name: "MODAL-DELETE-WITH-REASON · Delete with Audit Reason",      pattern: "Destructive + reason",                      comp: DeleteWithReasonModal },
  { key: "inspectionAssign",   name: "MODAL-INSPECTION-ASSIGN · Assign Inspector",               pattern: "Picker (user dropdown)",                    comp: InspectionAssignModal },
];

const QaModalGallery = ({ onNav }) => {
  const [openKey, setOpenKey] = React.useState(null);
  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={() => onNav("dashboard")}>Quality</a> · Modal Gallery</div>
          <h1 className="page-title">Modal Gallery</h1>
          <div className="muted" style={{fontSize: 12}}>{QA_MODAL_CATALOG.length} modals · follows <span className="mono">_shared/MODAL-SCHEMA.md</span> conventions</div>
        </div>
      </div>

      <div className="alert-box alert-blue" style={{fontSize: 12, marginBottom: 14}}>
        <span>ⓘ</span>
        <div>
          <b>Click any card to open the modal.</b> Each modal uses shared primitives (<span className="mono">Modal</span>, <span className="mono">Stepper</span>, <span className="mono">Field</span>, <span className="mono">ReasonInput</span>, <span className="mono">Summary</span>) and follows the destructive-w-reason / e-sign patterns per MODAL-SCHEMA §4.
        </div>
      </div>

      <div className="gallery-grid">
        {QA_MODAL_CATALOG.map(m => (
          <div key={m.key} className="gallery-card" onClick={() => setOpenKey(m.key)}>
            <div className="gallery-pattern">{m.pattern}</div>
            <div className="gallery-name">{m.name}</div>
            <button className="btn btn-secondary btn-sm" style={{marginTop: 10}}>Open modal →</button>
          </div>
        ))}
      </div>

      {QA_MODAL_CATALOG.map(m => (
        <m.comp key={m.key} open={openKey === m.key} onClose={() => setOpenKey(null)}/>
      ))}
    </>
  );
};

Object.assign(window, {
  HoldCreateModal, HoldReleaseModal, SpecSignModal, TemplateCreateModal,
  SampleDrawModal, NcrCreateModal, NcrCloseModal, CcpReadingModal, CcpDeviationLogModal,
  ESignModal, AllergenDualSignModal, AuditExportModal, DeleteWithReasonModal, InspectionAssignModal,
  QA_MODAL_CATALOG, QaModalGallery,
});
