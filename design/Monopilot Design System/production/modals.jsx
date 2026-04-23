// ============ Production modals ============

// Audit Fix-5b (B)-class hallucination removed:
// ReleaseWoModal belonged to 04-PLANNING-BASIC scope. Per PRD 08 §4.1 point 1,
// Production owns execution from READY state onward — it does not release WOs
// from DRAFT. Releasing (DRAFT → READY + line assignment) is a planning action
// and lives in 04-PLANNING. Operator UX: "Release next WO" buttons now open
// the Planning queue (cross-module deep-link) rather than a modal in Production.

const StartWoModal = ({ onClose, data }) => (
  <Modal open onClose={onClose} title={"Start " + (data?.id || "WO-2026-0043")}
    foot={<>
      <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary btn-sm">Start WO</button>
    </>}>
    <p className="muted" style={{fontSize:13}}>Confirm to start this WO on its assigned line. BOM will be frozen as immutable snapshot. Event log will begin.</p>
    <div style={{padding:12, background:"var(--gray-050)", borderRadius:6, fontSize:13, lineHeight:1.6}}>
      <div><b>WO:</b> <span className="mono">WO-2026-0043</span> · Szynka wędzona plastry 150g</div>
      <div><b>Line:</b> <span className="mono">LINE-01</span></div>
      <div><b>Operator:</b> M. Szymczak (MS)</div>
      <div><b>Planned:</b> 800 kg · 11:00 → 13:00</div>
    </div>
    <div className="ff" style={{marginTop:12}}>
      <label>Operator PIN <span className="req">*</span></label>
      <input type="password" placeholder="• • • •" maxLength={4} />
      <div className="ff-help">Digital sign-off — logged as start event</div>
    </div>
  </Modal>
);

const PauseLineModal = ({ onClose, data }) => {
  const [cat, setCat] = React.useState("plant");
  const subs = {
    plant: ["Breakdown", "Cleaning", "Planned maintenance", "Utility failure"],
    process: ["Changeover", "Material wait", "Setup", "Minor stop"],
    people: ["Break", "Training", "Short-staff", "Absence"],
  };
  return (
    <Modal open onClose={onClose} title={"Pause line " + (data?.id || "LINE-01")}
      foot={<>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm">Pause &amp; log downtime</button>
      </>}>
      <div className="alert-amber alert-box" style={{marginBottom:12}}>
        <span>⏱</span>
        <div>Pausing the line auto-pauses the active WO. A downtime event will be created and run until you resume.</div>
      </div>

      <div className="ff">
        <label>Category — 4P <span className="req">*</span></label>
        <div className="pills" style={{background:"var(--gray-100)"}}>
          {[["plant","Plant"],["process","Process"],["people","People"],["product","Product (→ QA hold)"]].map(([k,l]) => (
            <button key={k} className={"pill " + (cat===k?"on":"")} onClick={()=>setCat(k)} disabled={k==="product"}>{l}</button>
          ))}
        </div>
        <div className="ff-help">Product issues route to Quality as a QA hold, not a downtime event.</div>
      </div>

      <div className="ff-inline">
        <div className="ff">
          <label>Sub-category <span className="req">*</span></label>
          <select>{(subs[cat]||[]).map(s => <option key={s}>{s}</option>)}</select>
        </div>
        <div className="ff">
          <label>Linked WO</label>
          <select><option>WO-2026-0042 (active)</option><option>— None (line-level)</option></select>
        </div>
      </div>
      <div className="ff">
        <label>Reason / description <span className="req">*</span></label>
        <textarea placeholder="Be specific — this text feeds the downtime Pareto report"/>
      </div>
      <div className="ff-inline">
        <div className="ff"><label>Est. duration (optional)</label><input placeholder="e.g. 15 min"/></div>
        <div className="ff"><label>Notify maintenance</label><label className="toggle" style={{marginTop:6}}><input type="checkbox"/><span className="slider"></span></label></div>
      </div>
    </Modal>
  );
};

const CompleteWoModal = ({ onClose, data }) => (
  <Modal open onClose={onClose} title="Complete Work Order — gate checks" wide
    foot={<>
      <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
      <button className="btn btn-secondary btn-sm">Complete with exceptions</button>
      <button className="btn btn-primary btn-sm">Complete &amp; enqueue D365 push</button>
    </>}>
    <p className="muted" style={{fontSize:13}}>Before completion, all gates must pass. Failures require a written reason and lift the WO to exception state.</p>

    <div style={{padding:10, background:"var(--gray-050)", borderRadius:6, fontSize:13, marginBottom:12}}>
      <div><b>WO:</b> <span className="mono">WO-2026-0042</span> · Kiełbasa śląska pieczona 450g</div>
      <div><b>Planned:</b> 1 011 kg · <b>Output registered:</b> 992 kg (98.1%)</div>
    </div>

    <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:6}}>
      {[
        {p:true, t:"All planned components consumed (within tolerance)", s:"Variance: −0.2% vs BOM"},
        {p:true, t:"All output LPs registered with weights", s:"6 LPs · 992 kg total"},
        {p:false, t:"QA sampling plan completed", s:"1 of 12 samples pending — block or override?"},
        {p:true, t:"Waste logged or explicitly zero", s:"3.6 kg · 0.55% of consumed"},
        {p:true, t:"No open over-consumption approvals", s:"1 approved · 0 pending"},
        {p:true, t:"No active pause/downtime", s:"Line is running"},
      ].map((g,i) => (
        <div key={i} className={"gate-check " + (g.p?"pass":"fail")}>
          <span className="gc-icon">{g.p?"✓":"✕"}</span>
          <div><div>{g.t}</div><div className="gc-sub">{g.s}</div></div>
        </div>
      ))}
    </div>

    <div className="ff" style={{marginTop:14}}>
      <label>Shift Lead PIN <span className="req">*</span></label>
      <input type="password" placeholder="• • • •" maxLength={4}/>
    </div>
    <div className="ff-help" style={{fontSize:11}}>On submit: event log appended · D365 push enqueued · LPs available to Warehouse/Shipping pending QA release.</div>
  </Modal>
);

const OverConsumeModal = ({ onClose }) => (
  <Modal open onClose={onClose} title="Approve over-consumption"
    foot={<>
      <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
      <button className="btn btn-secondary btn-sm">Reject</button>
      <button className="btn btn-primary btn-sm">Approve (PIN)</button>
    </>}>
    <div style={{padding:12, background:"var(--amber-050a)", borderRadius:6, fontSize:13, marginBottom:12, border:"1px solid var(--amber-050)"}}>
      <div><b>Component:</b> <span className="mono">R-3001</span> Osłonka Ø26 (Viscofan)</div>
      <div><b>Planned:</b> 184 m · <b>Over-consumed:</b> +52 m (+28.3%)</div>
      <div><b>Tolerance:</b> 2% · <b>Requested by:</b> M. Szymczak (MS) at 07:44</div>
    </div>

    <div className="ff">
      <label>Reason (from operator)</label>
      <div style={{padding:10, background:"var(--gray-050)", borderRadius:4, fontSize:13, lineHeight:1.5}}>Rework — 2 batches re-extruded due to casing tear on mixer handoff. No additional product loss.</div>
    </div>

    <div className="ff"><label>Reviewer note</label><textarea placeholder="Optional note that will be stored with the approval…"/></div>

    <div className="ff-inline">
      <div className="ff"><label>Approver</label><input defaultValue="M. Szymczak (Shift Lead)" readOnly/></div>
      <div className="ff"><label>PIN <span className="req">*</span></label><input type="password" placeholder="• • • •" maxLength={4}/></div>
    </div>
    <div className="ff-help">Approving releases the over-consumption for posting. This is an auditable sign-off linked to the WO event log.</div>
  </Modal>
);

const WasteModal = ({ onClose }) => (
  <Modal open onClose={onClose} title="Log waste event"
    foot={<>
      <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary btn-sm">Log waste</button>
    </>}>
    <div className="ff-inline">
      <div className="ff"><label>Linked WO</label><select><option>WO-2026-0042 (active)</option></select></div>
      <div className="ff"><label>Category <span className="req">*</span></label><select><option>Trim</option><option>Spillage</option><option>Out-of-spec</option><option>Expired</option><option>Packaging</option></select></div>
    </div>
    <div className="ff-inline">
      <div className="ff"><label>Qty (kg) <span className="req">*</span></label><input placeholder="0.0"/></div>
      <div className="ff"><label>Component (optional)</label><select><option>—</option><option>R-1001 Wieprzowina</option><option>R-3001 Osłonka</option></select></div>
    </div>
    <div className="ff"><label>Reason / description</label><textarea/></div>
    <div className="ff"><label>Photo (optional)</label>
      <div className="check-photo" style={{textAlign:"center", padding:14}}>📷 Tap to upload or drag image</div>
    </div>
  </Modal>
);

const CatchWeightModal = ({ onClose }) => (
  <Modal open onClose={onClose} title="Catch-weight output capture" wide
    foot={<>
      <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
      <button className="btn btn-secondary btn-sm">Save draft</button>
      <button className="btn btn-primary btn-sm">Register LP &amp; continue</button>
    </>}>
    <div className="alert-blue alert-box" style={{marginBottom:12}}>
      <span>⚖</span>
      <div>Each unit scanned captures its actual weight from the scale. LP is finalized when the lot hits the configured unit count (24). Missing a reading blocks registration.</div>
    </div>

    <div className="ff-inline">
      <div className="ff"><label>Output LP</label><input defaultValue="LP-8822" className="mono" readOnly/></div>
      <div className="ff"><label>Nominal</label><input defaultValue="2.50 kg / unit" readOnly/></div>
    </div>

    <div className="cw-inline">
      <b>Captured units: 14 / 24</b> · Running total <span className="mono">34.82 kg</span> · Avg <span className="mono">2.487 kg</span> · Variance <span className="mono" style={{color:"var(--green)"}}>−0.5%</span>
      <div className="cw-units">
        {Array.from({length:14}).map((_,i) => (
          <div key={i} className="cw-unit"><span>#{i+1}</span><span>{(2.4 + Math.random()*0.2).toFixed(2)}</span></div>
        ))}
        {Array.from({length:10}).map((_,i) => (
          <div key={i+14} className="cw-unit" style={{opacity:0.4}}><span>#{i+15}</span><span>—</span></div>
        ))}
      </div>
    </div>

    <div className="scanner-link" style={{marginTop:12}}>
      <div className="sl-icon">🔲</div>
      <div>
        <div className="sl-title">Send remaining captures to scanner device</div>
        <div className="sl-desc">Operator completes the lot from the handheld · weights stream back over MQTT</div>
      </div>
      <button className="btn btn-sm">Open scanner flow</button>
    </div>
  </Modal>
);

const ScannerModal = ({ onClose }) => (
  <Modal open onClose={onClose} title="Deep-link into Scanner UI (operator)"
    foot={<>
      <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
      <button className="btn btn-primary btn-sm">Open scanner</button>
    </>}>
    <p className="muted" style={{fontSize:13}}>Production web app is for shift lead / plant ops views. For per-LP operator actions, deep-link into the Scanner UI on a handheld.</p>
    <div className="scanner-link">
      <div className="sl-icon">🔲</div>
      <div>
        <div className="sl-title">Scanner — Consume LP</div>
        <div className="sl-desc">Scan an LP barcode → consume against active WO on LINE-01</div>
      </div>
      <button className="btn btn-sm">Launch</button>
    </div>
    <div className="scanner-link" style={{marginTop:8}}>
      <div className="sl-icon">🔲</div>
      <div>
        <div className="sl-title">Scanner — Register output</div>
        <div className="sl-desc">Print + attach label to finished LP</div>
      </div>
      <button className="btn btn-sm">Launch</button>
    </div>
    <div className="scanner-link" style={{marginTop:8}}>
      <div className="sl-icon">⚖</div>
      <div>
        <div className="sl-title">Scanner — Catch-weight capture</div>
        <div className="sl-desc">Per-unit weight capture, streamed to active lot</div>
      </div>
      <button className="btn btn-sm">Launch</button>
    </div>
  </Modal>
);

const DlqInspectModal = ({ onClose, data }) => {
  const d = data || DLQ[0];
  return (
    <Modal open onClose={onClose} title={"DLQ inspect · " + d.wo} wide
      foot={<>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        <button className="btn btn-secondary btn-sm">Mark resolved (no push)</button>
        <button className="btn btn-primary btn-sm">Retry push now</button>
      </>}>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, fontSize:13}}>
        <div>
          <label style={{fontSize:10, color:"var(--muted)", fontWeight:600, textTransform:"uppercase"}}>Event</label>
          <div>{d.event}</div>
        </div>
        <div>
          <label style={{fontSize:10, color:"var(--muted)", fontWeight:600, textTransform:"uppercase"}}>Attempts</label>
          <div className="mono">{d.attempts}</div>
        </div>
        <div>
          <label style={{fontSize:10, color:"var(--muted)", fontWeight:600, textTransform:"uppercase"}}>Moved to DLQ</label>
          <div className="mono">{d.movedAt}</div>
        </div>
        <div>
          <label style={{fontSize:10, color:"var(--muted)", fontWeight:600, textTransform:"uppercase"}}>Last error at</label>
          <div className="mono">{d.lastErr}</div>
        </div>
      </div>
      <div className="ff" style={{marginTop:12}}>
        <label>Last error payload</label>
        <pre style={{background:"#0f172a", color:"#cbd5e1", padding:12, borderRadius:6, fontSize:11, overflow:"auto", fontFamily:"var(--font-mono)", margin:0}}>
{`HTTP 409 Conflict
{
  "error": "JournalLines",
  "message": "${d.err}",
  "wo": "${d.wo}",
  "attempt": ${d.attempts.split("/")[0]},
  "correlationId": "corr_4a2bb7…"
}`}
        </pre>
      </div>
      <div className="alert-blue alert-box">
        <span>ℹ</span>
        <div>MES is the source of truth — this event is already committed locally. Retry re-sends the same payload; if the D365 side has been fixed (e.g. period reopened), it will succeed.</div>
      </div>
    </Modal>
  );
};

const ResumeLineModal = ({ onClose, data }) => (
  <Modal open onClose={onClose} title={"Resume " + (data?.id || "LINE-02")}
    foot={<>
      <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary btn-sm">Resume line</button>
    </>}>
    <p style={{fontSize:13}}>This will stop the active downtime event and resume WO <b className="mono">WO-2026-0038</b>.</p>
    <div style={{padding:12, background:"var(--gray-050)", borderRadius:6, fontSize:13, marginBottom:12}}>
      <div><b>Downtime duration:</b> 23 min</div>
      <div><b>Category:</b> Plant — Breakdown · Mixer M-002 auger jam</div>
    </div>
    <div className="ff"><label>Resolution note <span className="req">*</span></label><textarea placeholder="e.g. Maintenance cleared auger, sensor calibrated"/></div>
    <div className="ff"><label>Operator PIN <span className="req">*</span></label><input type="password" placeholder="• • • •" maxLength={4}/></div>
  </Modal>
);

const ChangeoverGateModal = ({ onClose }) => (
  <Modal open onClose={onClose} title="Allergen changeover — sign gate 4"
    foot={<>
      <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary btn-sm" disabled>Sign &amp; advance</button>
    </>}>
    <p className="muted" style={{fontSize:13}}>Both signatures required to advance. Quality has not been assigned yet — please assign a quality signer first.</p>
    <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10}}>
      <div className="sig-box signed">
        <h4>Shift Lead ✓</h4>
        <div className="sig-name">M. Szymczak</div>
        <div className="sig-meta">Signed 08:24</div>
      </div>
      <div className="sig-box">
        <h4>Quality (required)</h4>
        <select style={{marginBottom:8}}><option>Select QA signer…</option><option>J. Adamczyk</option><option>E. Mróz</option></select>
        <div className="sig-pin"><input placeholder="• • • •" maxLength={4}/></div>
      </div>
    </div>
  </Modal>
);

const AssignCrewModal = ({ onClose }) => (
  <Modal open onClose={onClose} title="Assign crew — Shift A"
    foot={<>
      <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary btn-sm">Save assignments</button>
    </>}>
    <p className="muted" style={{fontSize:13}}>Drag or pick an operator per line. Only certified operators for each line are listed.</p>
    <table>
      <thead><tr><th>Line</th><th>Operator</th><th>Certified?</th></tr></thead>
      <tbody>
        {SHIFT_CREW.map(s => (
          <tr key={s.line}>
            <td className="mono">{s.line}</td>
            <td><select defaultValue={s.operator}><option>{s.operator}</option><option>T. Ziółkowski</option><option>E. Mróz</option><option>—</option></select></td>
            <td>{s.operator === "—" ? <span className="badge badge-red" style={{fontSize:10}}>unassigned</span> : <span className="badge badge-green" style={{fontSize:10}}>✓ cert</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </Modal>
);

// ---- Tweaks panel ----
const TweaksPanel = ({ tweaks, setTweaks, onClose }) => (
  <div style={{position:"fixed", right:16, bottom:16, width:300, background:"#fff", border:"1px solid var(--border)", borderRadius:8, boxShadow:"0 10px 30px rgba(0,0,0,0.15)", zIndex:200}}>
    <div style={{padding:"10px 14px", borderBottom:"1px solid var(--border)", display:"flex", justifyContent:"space-between", alignItems:"center"}}>
      <b style={{fontSize:13}}>Tweaks</b>
      <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
    </div>
    <div style={{padding:"10px 14px", fontSize:12}}>
      <div className="ff">
        <label>Density</label>
        <select value={tweaks.density} onChange={e=>setTweaks({density:e.target.value})}>
          <option value="comfortable">Comfortable</option>
          <option value="compact">Compact (TV-wall)</option>
        </select>
      </div>
      <div className="ff">
        <label>Line card layout</label>
        <select value={tweaks.cardLayout} onChange={e=>setTweaks({cardLayout:e.target.value})}>
          <option value="default">3-column grid</option>
          <option value="wide">Wide rows (more detail)</option>
        </select>
      </div>
      <div className="ff">
        <label>KPI accent</label>
        <select value={tweaks.kpiAccent} onChange={e=>setTweaks({kpiAccent:e.target.value})}>
          <option value="bottom">Bottom border bar</option>
          <option value="left">Left border stripe</option>
          <option value="flat">Flat (no accent)</option>
        </select>
      </div>
      <div className="ff" style={{display:"flex", alignItems:"center", justifyContent:"space-between"}}>
        <label style={{margin:0}}>Show over-consumption banner</label>
        <label className="toggle"><input type="checkbox" checked={tweaks.showOverBanner} onChange={e=>setTweaks({showOverBanner:e.target.checked})}/><span className="slider"></span></label>
      </div>
      <div className="ff" style={{display:"flex", alignItems:"center", justifyContent:"space-between"}}>
        <label style={{margin:0}}>Live 'pulse' dot</label>
        <label className="toggle"><input type="checkbox" checked={tweaks.pulseDot} onChange={e=>setTweaks({pulseDot:e.target.checked})}/><span className="slider"></span></label>
      </div>
    </div>
  </div>
);

// ================================================================
// NEW modals — use shared Field / ReasonInput / Summary primitives
// (loaded from ../_shared/modals.jsx). They still use the production
// local <Modal/> primitive defined in shell.jsx for layout consistency
// with existing modals. See ../_shared/MODAL-SCHEMA.md for patterns.
// ================================================================

// ---- ShiftStartModal — operator PIN + crew + handover notes ----
const ShiftStartModal = ({ onClose }) => {
  const [pin, setPin] = React.useState("");
  const [handover, setHandover] = React.useState("");
  const [crewOverride, setCrewOverride] = React.useState({});
  const pinValid = pin.length === 4;
  const handoverValid = handover.length >= 10;
  const valid = pinValid && handoverValid;

  return (
    <Modal open onClose={onClose} title="Start shift — sign in & accept handover" wide
      foot={<>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!valid}>Start shift (PIN)</button>
      </>}>
      <div className="alert-blue alert-box" style={{marginBottom:12}}>
        <span>⎔</span>
        <div>This sign-in starts Shift A at <b>06:00</b> on <b>Factory-A</b>. Previous shift handover notes must be reviewed and acknowledged before lines accept new WOs.</div>
      </div>

      <Field label="Shift lead PIN" required help="Digital sign-off — logged as shift-start event">
        <input type="password" placeholder="• • • •" maxLength={4} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g,""))} />
      </Field>

      <div className="ff">
        <label>Crew assignment — per line</label>
        <table>
          <thead><tr><th>Line</th><th>Operator</th><th>Status</th></tr></thead>
          <tbody>
            {SHIFT_CREW.map(s => (
              <tr key={s.line}>
                <td className="mono" style={{fontWeight:600}}>{s.line}</td>
                <td>
                  <select value={crewOverride[s.line] || s.operator} onChange={e => setCrewOverride({...crewOverride, [s.line]: e.target.value})}>
                    <option>{s.operator}</option>
                    <option>T. Ziółkowski</option>
                    <option>E. Mróz</option>
                    <option>J. Dudek</option>
                    <option>—</option>
                  </select>
                </td>
                <td>{s.operator === "—"
                  ? <span className="badge badge-red" style={{fontSize:10}}>unassigned</span>
                  : <span className="badge badge-green" style={{fontSize:10}}>✓ cert</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="ff-help">Only certified operators listed per line · dash = unassigned (V-PROD-SHIFT-001: cannot start shift with unassigned critical line).</div>
      </div>

      <div className="ff">
        <label>Previous shift handover notes <span className="req">*</span></label>
        <div style={{padding:10, background:"var(--gray-050)", borderRadius:6, fontSize:12, marginBottom:6}}>
          <b>From J. Dudek (Shift C) · 05:54:</b> Line 2 mixer showing elevated temperature last hour — flagged for maintenance. Line 3 casings low, restocked at 05:30.
        </div>
        <ReasonInput value={handover} onChange={setHandover} minLength={10} placeholder="Acknowledge prior handover and add any incoming notes (min 10 chars)…" />
      </div>
    </Modal>
  );
};

// ---- ShiftEndModal — checklist + handover note + PIN ----
const ShiftEndModal = ({ onClose }) => {
  const [checks, setChecks] = React.useState({ oee: true, wos: true, downtime: false, waste: true });
  const [handover, setHandover] = React.useState("");
  const [pin, setPin] = React.useState("");
  const allChecked = Object.values(checks).every(Boolean);
  const handoverValid = handover.length >= 10;
  const pinValid = pin.length === 4;
  const valid = allChecked && handoverValid && pinValid;

  return (
    <Modal open onClose={onClose} title="End shift — handover & sign-off" wide
      foot={<>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-secondary btn-sm">Save draft</button>
        <button className="btn btn-primary btn-sm" disabled={!valid}>End shift (PIN)</button>
      </>}>
      <div className="alert-amber alert-box" style={{marginBottom:12}}>
        <span>⏱</span>
        <div>Shift A ends at <b>14:00</b>. All open items must be reviewed or explicitly handed over to Shift B. (V-PROD-SHIFT-002: cannot end shift with open downtime and no reason.)</div>
      </div>

      <Summary rows={[
        { label: "Shift", value: "A — 06:00 → 14:00" },
        { label: "Output", value: "3 842 / 4 211 kg (91%)" },
        { label: "OEE", value: "76.2% · target 80%" },
        { label: "Downtime", value: "1h 52m · 6 events" },
        { label: "Waste", value: "1.1% · under target", emphasis: true },
      ]}/>

      <div className="ff">
        <label>End-of-shift checklist <span className="req">*</span></label>
        {[
          { k: "oee", t: "OEE reviewed with Plant Manager", sub: "76.2% vs 80% target — –3.8 pp" },
          { k: "wos", t: "Outstanding WOs confirmed", sub: "WO-2026-0042 in progress (handed to B) · 0 stuck" },
          { k: "downtime", t: "Open downtime events resolved or logged", sub: "1 open — LINE-02 mixer (ETA 14:30 maintenance)" },
          { k: "waste", t: "All waste logged with reasons", sub: "3.6 kg logged · no zero-waste WOs" },
        ].map(g => (
          <div key={g.k} className={"gate-check " + (checks[g.k] ? "pass" : "fail")} style={{padding:"8px 0"}}>
            <input type="checkbox" checked={checks[g.k]} onChange={e => setChecks({...checks, [g.k]: e.target.checked})} style={{marginTop:3}} />
            <div>
              <div>{g.t}</div>
              <div className="gc-sub">{g.sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="ff">
        <label>Handover notes to next shift <span className="req">*</span></label>
        <ReasonInput value={handover} onChange={setHandover} minLength={10} placeholder="What Shift B needs to know — ongoing issues, WO context, QA holds (min 10 chars)…"/>
      </div>

      <Field label="Shift lead PIN" required help="Digital sign-off — seals shift report for auditors">
        <input type="password" placeholder="• • • •" maxLength={4} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g,""))} />
      </Field>
    </Modal>
  );
};

// ---- OEETargetEditModal — admin-only edit of target A/P/Q per line ----
const OEETargetEditModal = ({ onClose, data }) => {
  const [line, setLine] = React.useState(data?.line || "LINE-01");
  const [a, setA] = React.useState(92);
  const [p, setP] = React.useState(95);
  const [q, setQ] = React.useState(98);
  const [effective, setEffective] = React.useState("2026-05-01");
  const [reason, setReason] = React.useState("");
  const [role, setRole] = React.useState("Plant Manager");
  const isAdmin = role === "Plant Manager";
  const reasonValid = reason.length >= 10;
  const rangesValid = [a,p,q].every(v => v >= 50 && v <= 100);
  const valid = isAdmin && reasonValid && rangesValid;

  const targetOEE = ((a * p * q) / 10000).toFixed(1);

  return (
    <Modal open onClose={onClose} title="Edit OEE targets — admin" wide
      foot={<>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!valid}>Save new targets</button>
      </>}>
      {!isAdmin && (
        <div className="alert-red alert-box" style={{marginBottom:12}}>
          <span>⚠</span>
          <div>Editing OEE targets requires <b>Plant Manager</b> role. Current role: {role}. (V-PROD-OEE-001: role gate.)</div>
        </div>
      )}
      <div className="alert-blue alert-box" style={{marginBottom:12}}>
        <span>ℹ</span>
        <div>Targets drive OEE red/amber/green thresholds on the dashboard and KPI cards. Changes become effective on the chosen date and are audit-logged.</div>
      </div>

      <div className="ff-inline">
        <Field label="Line" required>
          <select value={line} onChange={e => setLine(e.target.value)}>
            {LINES.map(l => <option key={l.id} value={l.id}>{l.id} — {l.name.split("—")[1]?.trim() || l.name}</option>)}
          </select>
        </Field>
        <Field label="Effective date" required>
          <input type="date" value={effective} onChange={e => setEffective(e.target.value)} />
        </Field>
      </div>

      <div className="ff-inline" style={{gridTemplateColumns:"1fr 1fr 1fr"}}>
        <Field label="Target Availability %" required help="50–100">
          <input type="number" min={50} max={100} value={a} onChange={e => setA(Number(e.target.value))}/>
        </Field>
        <Field label="Target Performance %" required help="50–100">
          <input type="number" min={50} max={100} value={p} onChange={e => setP(Number(e.target.value))}/>
        </Field>
        <Field label="Target Quality %" required help="50–100">
          <input type="number" min={50} max={100} value={q} onChange={e => setQ(Number(e.target.value))}/>
        </Field>
      </div>

      <div style={{padding:10, background:"var(--gray-050)", borderRadius:6, fontSize:13, marginBottom:12}}>
        Resulting <b>OEE target:</b> <span className="mono" style={{fontSize:15, fontWeight:700, color:"var(--blue)"}}>{targetOEE}%</span>
        <span className="muted" style={{marginLeft:10}}>A × P × Q = {a}% × {p}% × {q}%</span>
      </div>

      <div className="ff">
        <label>Role (demo — normally from session)</label>
        <select value={role} onChange={e => setRole(e.target.value)}>
          <option>Plant Manager</option>
          <option>Shift Lead</option>
          <option>Operator</option>
        </select>
      </div>

      <div className="ff">
        <label>Reason for change <span className="req">*</span></label>
        <ReasonInput value={reason} onChange={setReason} minLength={10} placeholder="Why are we changing targets? Audit-logged (min 10 chars)…"/>
      </div>
    </Modal>
  );
};

// ============ MODAL GALLERY ============
const PROD_MODAL_CATALOG = [
  { key: "startWo",          name: "Start WO (PIN sign-off)",              pattern: "Simple form + PIN gate",                 comp: StartWoModal },
  { key: "pauseLine",        name: "Pause line / log downtime",            pattern: "Simple form + 4P category",              comp: PauseLineModal },
  { key: "completeWo",       name: "Complete WO — gate checks",            pattern: "Gate-check grid + PIN",                  comp: CompleteWoModal },
  { key: "overConsume",      name: "Over-consumption approval",            pattern: "Dual-path (approve/reject) + PIN",       comp: OverConsumeModal },
  { key: "waste",            name: "Log waste event",                      pattern: "Simple form + photo upload",             comp: WasteModal },
  { key: "catchweight",      name: "Catch-weight output capture",          pattern: "Capture grid + MQTT stream",             comp: CatchWeightModal },
  { key: "scanner",          name: "Scanner deep-link",                    pattern: "Navigation list (handheld hand-off)",    comp: ScannerModal },
  { key: "dlqInspect",       name: "DLQ inspect / retry",                  pattern: "Inspect + retry + mark resolved",        comp: DlqInspectModal },
  { key: "resumeLine",       name: "Resume line after downtime",           pattern: "Simple form + resolution note + PIN",    comp: ResumeLineModal },
  { key: "changeoverGate",   name: "Allergen changeover sign-off",         pattern: "Dual-signature + PIN gate",              comp: ChangeoverGateModal },
  { key: "assignCrew",       name: "Assign crew — shift",                  pattern: "Simple form + certification check",      comp: AssignCrewModal },
  { key: "shiftStart",       name: "Shift start — sign in",                pattern: "Simple form + crew + handover review",   comp: ShiftStartModal },
  { key: "shiftEnd",         name: "Shift end — handover sign-off",        pattern: "Checklist + reason + PIN",               comp: ShiftEndModal },
  { key: "oeeTargetEdit",    name: "OEE target edit — admin",              pattern: "Admin gate + reason + effective date",   comp: OEETargetEditModal },
];

const ModalGallery = ({ onNav }) => {
  const [open, setOpen] = React.useState(null);
  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={() => onNav && onNav("dashboard")} style={{cursor:"pointer"}}>Production</a> · Modal gallery</div>
          <h1 className="page-title">Modal gallery</h1>
          <div className="muted" style={{fontSize:12}}>
            {PROD_MODAL_CATALOG.length} modals covering the Production workflow · patterns documented in <span className="mono">_shared/MODAL-SCHEMA.md</span>
          </div>
        </div>
      </div>

      <div className="alert-blue alert-box" style={{marginBottom:14, fontSize:12}}>
        <span>ⓘ</span>
        <div>
          <b>Click any card to open the modal.</b> New modals (Shift Start/End, OEE Target Edit) use shared primitives <span className="mono">Field</span>, <span className="mono">ReasonInput</span>, <span className="mono">Summary</span> from <span className="mono">_shared/modals.jsx</span>. Existing modals use Production's local <span className="mono">Modal</span> wrapper.
        </div>
      </div>

      <div className="gallery-grid">
        {PROD_MODAL_CATALOG.map(m => (
          <div key={m.key} className="gallery-card" onClick={() => setOpen(m.key)}>
            <div className="gallery-pattern">{m.pattern}</div>
            <div className="gallery-name">{m.name}</div>
            <button className="btn btn-secondary btn-sm" style={{marginTop:10}}>Open modal →</button>
          </div>
        ))}
      </div>

      {PROD_MODAL_CATALOG.map(m => {
        if (open !== m.key) return null;
        const Comp = m.comp;
        return <Comp key={m.key} onClose={() => setOpen(null)} data={m.key === "dlqInspect" ? DLQ[0] : undefined} />;
      })}
    </>
  );
};

Object.assign(window, {
  StartWoModal, PauseLineModal, CompleteWoModal, OverConsumeModal,
  WasteModal, CatchWeightModal, ScannerModal, DlqInspectModal, ResumeLineModal,
  ChangeoverGateModal, AssignCrewModal, TweaksPanel,
  ShiftStartModal, ShiftEndModal, OEETargetEditModal,
  ModalGallery, PROD_MODAL_CATALOG,
});
