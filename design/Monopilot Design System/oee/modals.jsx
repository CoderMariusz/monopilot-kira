// ============================================================
// OEE MODALS — follows ../_shared/MODAL-SCHEMA.md
//
// Modal inventory:
//   M-01  Annotate downtime event (OEE-M-001) — operator note + supervisor override + edit-window
//   M-02  Export OEE data (OEE-M-002) — wizard for CSV / PDF with section multi-select
//   M-03  Per-line override (threshold editor) — simple form
//   M-04  Big Loss mapping editor — full-page table editor
//   M-05  Changeover detail — read-only modal with cross-link to 08-PROD
//   M-06  Cell drill-down — heatmap cell click → four gauges + KPI drill
//   M-07  Request edit (annotation escalation) — destructive confirm + reason
//   M-08  Delete per-line override — destructive confirm
//   M-09  Copy to clipboard preview — info modal
//   M-10  Compare-weeks — picker for two weeks to diff
//   M-11  Acknowledge anomaly (P2) — dual-path confirm
//   M-12  Auto-refresh pause — simple confirm
// ============================================================

// ============ M-01: Annotate downtime event ============
const AnnotateDowntimeModal = ({ open, onClose, data, role = "Shift Supervisor" }) => {
  const [notes, setNotes] = React.useState(data?.notes || "");
  const [catOverride, setCatOverride] = React.useState(data?.code || "MACH_FAULT");
  const [submitting, setSubmitting] = React.useState(false);

  // Edit window — 1h post-event
  const editWindowClosed = false;

  const isSupervisor = role === "Shift Supervisor" || role === "Admin" || role === "Prod Mgr";
  const canSave = notes.trim().length >= 1 || catOverride !== data?.code;

  const submit = async () => {
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 600));
    setSubmitting(false);
    onClose();
  };

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="Annotate Downtime Event" subtitle={`${data?.cat || "Event"} · ${data?.line || ""} · ${data?.duration || 0} min`} size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        {editWindowClosed
          ? <button className="btn btn-secondary btn-sm" onClick={() => window.alert("Escalation requested to supervisor.")}>Request edit →</button>
          : <button className="btn btn-primary btn-sm" disabled={!canSave || submitting} onClick={submit}>{submitting ? "Saving…" : "Save note"}</button>
        }
      </>}
    >
      {/* Event summary */}
      <Summary rows={[
        { label: "Event ID",          value: data?.id || "DT-2026-2188" },
        { label: "Line · Machine",    value: `${data?.line} · ${data?.machine || "—"}` },
        { label: "Duration",          value: `${data?.duration || 0} min · ended ${data?.endedAt || "—"}` },
        { label: "Current category",  value: `${data?.bigLoss || ""} · ${data?.cat || ""}` },
        { label: "WO",                value: data?.wo || "—" },
      ]}/>

      <div className="ff" style={{marginTop:14}}>
        <Field label="Reason notes" required help="Audit-logged · max 500 chars">
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Describe the root cause and corrective action taken…"
            style={{minHeight:80}} maxLength={500}/>
          <div className="ff-help" style={{display:"flex", justifyContent:"space-between"}}>
            <span>Operators have 1 h post-event to annotate. Supervisors can override any time.</span>
            <span className="mono">{notes.length} / 500</span>
          </div>
        </Field>
      </div>

      {isSupervisor && (
        <div className="ff" style={{marginTop:10, padding:10, border:"1px dashed var(--border)", borderRadius:4, background:"var(--gray-050)"}}>
          <Field label={<>Override category <span className="badge badge-blue" style={{fontSize:9, marginLeft:6}}>Supervisor+</span></>} help="Category changes are logged for audit purposes">
            <select value={catOverride} onChange={e => setCatOverride(e.target.value)}>
              {BIG_LOSS_MAPPING.map(m => <option key={m.code} value={m.code}>{m.label} → {m.bigLoss}</option>)}
            </select>
          </Field>
        </div>
      )}

      {editWindowClosed && (
        <div className="alert-amber alert-box" style={{marginTop:10}}>
          <span>⚠</span>
          <div>Edit window closed (1 h post-event). Use <b>Request edit</b> to escalate to supervisor.</div>
        </div>
      )}

      <div className="muted" style={{fontSize:11, marginTop:10}}>
        Writes via <span className="mono">PATCH /api/production/downtime-events/:id</span> (08-PRODUCTION is authoritative · 15-OEE does not write directly).
      </div>
    </Modal>
  );
};

// ============ M-02: Export OEE data ============
const ExportModal = ({ open, onClose, data }) => {
  const [format, setFormat] = React.useState("csv");
  const [sections, setSections] = React.useState({ summary: true, losses: true, changeover: true, raw: false });
  const [submitting, setSubmitting] = React.useState(false);

  const filename = `oee-${data?.dashboard || "summary"}-${data?.date || "2026-04-20"}-${data?.line || "all"}.${format}`;

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="Export OEE data" subtitle={`${data?.dashboard || "oee_daily_summary"} · ${data?.date || "2026-04-20"} · ${data?.line || "all lines"}`} size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={submitting} onClick={async () => {setSubmitting(true); await new Promise(r => setTimeout(r, 600)); setSubmitting(false); onClose();}}>
          {submitting ? "Queuing…" : "Export now"}
        </button>
      </>}
    >
      <Summary rows={[
        { label: "Dashboard",     value: data?.dashboard || "oee_daily_summary" },
        { label: "Date / Range",  value: data?.date || "2026-04-20" },
        { label: "Line",          value: data?.line || "All lines" },
      ]}/>

      <Field label="Format" required>
        <div className="radio-group">
          <label className={format === "csv" ? "on" : ""}><input type="radio" checked={format === "csv"} onChange={() => setFormat("csv")}/> CSV</label>
          <label className={format === "pdf" ? "on" : ""}><input type="radio" checked={format === "pdf"} onChange={() => setFormat("pdf")}/> PDF</label>
          <label style={{opacity:0.5, cursor:"not-allowed"}}><input type="radio" disabled/> XLSX <span className="badge badge-gray" style={{fontSize:9, marginLeft:4}}>P2</span></label>
        </div>
      </Field>

      <Field label="Include sections" help="Multi-select">
        <div className="check-group">
          {[
            {k:"summary",    l:"OEE Summary table"},
            {k:"losses",     l:"Six Big Losses breakdown"},
            {k:"changeover", l:"Changeover Analysis"},
            {k:"raw",        l:"Raw snapshot data (large file — up to 5 MB for 24h)"},
          ].map(o => (
            <label key={o.k}>
              <input type="checkbox" checked={sections[o.k]} onChange={e => setSections({...sections, [o.k]: e.target.checked})}/>
              {o.l}
            </label>
          ))}
        </div>
      </Field>

      <Field label="File name preview">
        <div className="mono" style={{padding:8, background:"var(--gray-050)", border:"1px solid var(--border)", borderRadius:4, fontSize:12}}>
          {filename}
        </div>
      </Field>

      {sections.raw && (
        <div className="alert-amber alert-box" style={{marginTop:10, fontSize:12}}>
          <span>⚠</span><div>Raw snapshot export can be up to <b>5 MB</b> for a 24h window. Export may take 15–30 seconds.</div>
        </div>
      )}

      <div className="muted" style={{fontSize:11, marginTop:10}}>
        Uses the <span className="mono">12-REPORTING</span> export engine · <span className="mono">POST /api/reporting/export</span> · export is recorded in <span className="mono">report_exports</span>.
      </div>
    </Modal>
  );
};

// ============ M-03: Per-line threshold override ============
const LineOverrideModal = ({ open, onClose, data }) => {
  const [line, setLine] = React.useState(data?.line || "LINE-03");
  const [target, setTarget] = React.useState(data?.oeeTarget || 70);
  const [aMin, setAMin] = React.useState(data?.aMin || 70);
  const [pMin, setPMin] = React.useState(data?.pMin || 80);
  const [qMin, setQMin] = React.useState(data?.qMin || 95);

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title={data ? "Edit per-line override" : "Add per-line threshold override"} size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={onClose}>Save override</button>
      </>}
    >
      <Field label="Line" required>
        <select value={line} onChange={e => setLine(e.target.value)} disabled={!!data}>
          {OEE_LINES_META.map(l => <option key={l.id} value={l.id}>{l.id} — {l.name}</option>)}
        </select>
      </Field>
      <div className="grid-2">
        <Field label="OEE target %" required help="Target reference line on charts">
          <input type="number" step="0.1" value={target} onChange={e => setTarget(parseFloat(e.target.value))}/>
        </Field>
        <Field label="Availability min %" required>
          <input type="number" step="0.1" value={aMin} onChange={e => setAMin(parseFloat(e.target.value))}/>
        </Field>
        <Field label="Performance min %" required>
          <input type="number" step="0.1" value={pMin} onChange={e => setPMin(parseFloat(e.target.value))}/>
        </Field>
        <Field label="Quality min %" required>
          <input type="number" step="0.1" value={qMin} onChange={e => setQMin(parseFloat(e.target.value))}/>
        </Field>
      </div>
      <div className="alert-blue alert-box" style={{marginTop:10, fontSize:12}}>
        <span>ⓘ</span><div>This override replaces the tenant default (70% / 70 / 80 / 95) for {line} only. Note: heatmap colour scale stays fixed 65/85 in P1.</div>
      </div>
    </Modal>
  );
};

// ============ M-04: Big Loss mapping editor ============
const BigLossMappingModal = ({ open, onClose }) => {
  const [mapping, setMapping] = React.useState(BIG_LOSS_MAPPING);
  const [dirty, setDirty] = React.useState(false);

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="Six Big Losses — category mapping editor" subtitle="Admin only · applies tenant-wide" size="fullpage"
      foot={<>
        <button className="btn btn-ghost btn-sm" onClick={() => {setMapping(BIG_LOSS_MAPPING); setDirty(false);}}>Reset to defaults</button>
        <span className="spacer"></span>
        {dirty && <span className="badge badge-amber" style={{fontSize:9, marginRight:8}}>Unpublished changes</span>}
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!dirty} onClick={onClose}>Publish mapping</button>
      </>}
    >
      <div className="alert-blue alert-box" style={{marginBottom:10, fontSize:12}}>
        <span>ⓘ</span>
        <div>
          Controls how raw <span className="mono">downtime_categories</span> map to Six Big Losses on OEE-003. Changes apply immediately to new dashboard views. Historical data re-classifies dynamically.
        </div>
      </div>

      <table>
        <thead><tr><th>Code</th><th>Label</th><th>Big Loss category</th></tr></thead>
        <tbody>
          {mapping.map((m, i) => (
            <tr key={m.code}>
              <td className="mono" style={{fontSize:11}}>{m.code}</td>
              <td>{m.label}</td>
              <td>
                <select value={m.bigLoss} onChange={e => {
                  const next = [...mapping];
                  next[i] = {...m, bigLoss: e.target.value};
                  setMapping(next);
                  setDirty(true);
                }}>
                  {BIG_LOSS_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="muted" style={{fontSize:11, marginTop:10}}>
        Defaults seeded from Nakajima TPM industry standard. Unmapped codes render under "Other — Uncategorized" on OEE-003.
        <br/>
        API: <span className="mono">PUT /api/settings/oee/big-loss-mapping</span>
      </div>
    </Modal>
  );
};

// ============ M-05: Changeover detail ============
const ChangeoverDetailModal = ({ open, onClose, data }) => {
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title={`Changeover ${data?.id}`} subtitle={`${data?.line} · ${data?.start}`} size="wide"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
        <button className="btn btn-primary btn-sm" onClick={() => window.alert("Cross-link → /production/changeover/" + data?.id)}>Open in 08-PRODUCTION →</button>
      </>}
    >
      <div className="grid-2" style={{gap:14}}>
        <Summary rows={[
          { label: "Event ID",    value: data?.id },
          { label: "Line",        value: data?.line },
          { label: "WO from",     value: data?.woFrom || "—" },
          { label: "WO to",       value: data?.woTo },
          { label: "Started",     value: data?.start },
          { label: "Duration",    value: `${data?.duration} min`, emphasis: true },
          { label: "Target",      value: `${data?.target} min` },
          { label: "Variance",    value: `${data?.variance > 0 ? "+" : ""}${data?.variance} min`, emphasis: true },
        ]}/>
        <Summary rows={[
          { label: "Allergen risk",    value: data?.allergen },
          { label: "Status",           value: data?.status },
          { label: "Notes",            value: data?.notes },
          { label: "Source table",     value: "changeover_events" },
          { label: "BRCGS audit",      value: "Captured in 08-PROD record" },
        ]}/>
      </div>
      <div className="alert-blue alert-box" style={{marginTop:14, fontSize:12}}>
        <span>ⓘ</span>
        <div>
          Target sourced from 02-SETTINGS <span className="mono">changeover_target_duration_min</span> per line. Allergen matrix owned by 02-SETTINGS + 13-MAINTENANCE cleaning procedures. Records editable only in 08-PRODUCTION.
        </div>
      </div>
    </Modal>
  );
};

// ============ M-06: Cell drill-down ============
const CellDrillModal = ({ open, onClose, data, onPickLine }) => {
  if (!open) return null;
  const apq = HEATMAP_APQ[data?.line]?.[data?.day]?.[data?.shift] || {a: 62, p: 93, q: 99, output: 210, downtime: 88};
  return (
    <Modal open={open} onClose={onClose} title={`${data?.line} · ${data?.dayLabel} · ${data?.shift}`} subtitle={`OEE ${data?.val}%`} size="wide"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
        <button className="btn btn-primary btn-sm" onClick={() => {onPickLine && onPickLine(data?.line); onClose();}}>Drill to Line Trend →</button>
      </>}
    >
      <div className="cell-gauges" style={{padding:14, justifyContent:"center"}}>
        <ArcGauge pct={apq.a} color="#3b82f6" label="A" size={110} target={70}/>
        <ArcGauge pct={apq.p} color="#22c55e" label="P" size={110} target={80}/>
        <ArcGauge pct={apq.q} color="#f59e0b" label="Q" size={110} target={95}/>
        <ArcGauge pct={data?.val} color={oeeStatus(data?.val).color} label="OEE" size={110} target={70}/>
      </div>
      <Summary rows={[
        { label: "Total output",       value: `${apq.output} kg` },
        { label: "Total downtime",     value: `${apq.downtime} min` },
        { label: "Snapshot count",     value: "432 / 480 · 1 gap" },
        { label: "vs 7-day avg",       value: "−14.8 pp", emphasis: true },
        { label: "Top cause",          value: "Machine Fault — Mixer M-002 · 48 min" },
      ]}/>
    </Modal>
  );
};

// ============ M-07: Request edit (annotation escalation) ============
const RequestEditModal = ({ open, onClose, data }) => {
  const [reason, setReason] = React.useState("");
  const valid = reason.length >= 10;
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title="Request edit — escalation" subtitle={`${data?.cat} · ${data?.line}`} size="sm" dismissible={false}
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!valid} onClick={onClose}>Send to supervisor</button>
      </>}
    >
      <div className="alert-amber alert-box" style={{marginBottom:12}}>
        <span>⚠</span><div>Edit window has closed (&gt;1 h post-event). Supervisor approval is required to reopen.</div>
      </div>
      <Field label="Reason for edit request" required help="Sent to nearest oee_supervisor via in-app toast. Audit-logged.">
        <ReasonInput value={reason} onChange={setReason} minLength={10} placeholder="Explain why this annotation needs updating…"/>
      </Field>
    </Modal>
  );
};

// ============ M-08: Delete override confirm ============
const DeleteOverrideModal = ({ open, onClose, data }) => {
  const [confirm, setConfirm] = React.useState("");
  const matches = confirm === data?.line;
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title="Delete line override?" size="sm" dismissible={false}
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-danger btn-sm" disabled={!matches} onClick={onClose}>Delete override</button>
      </>}
    >
      <div className="alert-red alert-box" style={{marginBottom:10}}>
        <span>⚠</span><div>This reverts <b>{data?.line}</b> to the tenant default thresholds (70 / 70 / 80 / 95).</div>
      </div>
      <Field label={<>Type <span className="mono">{data?.line}</span> to confirm</>} required>
        <input value={confirm} onChange={e => setConfirm(e.target.value)} placeholder={data?.line}/>
      </Field>
    </Modal>
  );
};

// ============ M-09: Copy-to-clipboard preview ============
const CopyClipboardModal = ({ open, onClose, data }) => {
  if (!open) return null;
  const sample = `OEE Daily Summary — ${data?.date || "2026-04-20"}
Factory OEE: 68.8% (target 70%, world-class 85%)
Best line: LINE-01 · 86.5% · Best shift AM 91.2%
Worst line: LINE-02 · 53.9% · MIX-04 Mixer M-002 jam at 10:22 (78 min)
Total output: 4,190 kg · Total downtime: 6h 55m

By line:
  LINE-01  86.5%  A 94.2%  P 92.5%  Q 99.3%  Output 1,248 kg
  LINE-02  53.9%  A 62.1%  P 88.0%  Q 98.8%  Output   912 kg
  LINE-03  77.5%  A 86.0%  P 90.2%  Q 99.9%  Output 1,042 kg
  LINE-04   0.0%  A 78.2%  P  0.0%  Q 100%   Output   380 kg (changeover)
  LINE-05  70.3%  A 82.1%  P 86.5%  Q 99.0%  Output   608 kg

Top losses:
  Equipment Failure (Plant)  172 min  34.3%
  Setup & Adjustment (Plant) 128 min  25.5%
  Idling/Minor Stops (Proc)   82 min  16.4%

Source: oee_daily_summary MV · last refresh 14:32:05`;

  return (
    <Modal open={open} onClose={onClose} title="Copy OEE summary to clipboard" size="wide"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={() => {navigator.clipboard?.writeText(sample); onClose();}}>Copy to clipboard</button>
      </>}
    >
      <div className="alert-blue alert-box" style={{marginBottom:10, fontSize:12}}>
        <span>ⓘ</span><div>Plain-text summary for pasting into Teams / email / Confluence. PDF/CSV exports available via Export modal.</div>
      </div>
      <pre style={{background:"var(--gray-050)", padding:12, borderRadius:4, fontSize:11, fontFamily:"var(--font-mono)", maxHeight:360, overflow:"auto"}}>{sample}</pre>
    </Modal>
  );
};

// ============ M-10: Compare weeks (picker) ============
const CompareWeeksModal = ({ open, onClose }) => {
  const [weekA, setWeekA] = React.useState("2026-W15");
  const [weekB, setWeekB] = React.useState("2026-W16");
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title="Compare two weeks" subtitle="Pick A and B to see delta across lines × shifts" size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={onClose}>Compare →</button>
      </>}
    >
      <div className="grid-2">
        <Field label="Week A" required>
          <select value={weekA} onChange={e => setWeekA(e.target.value)}>
            {["2026-W13","2026-W14","2026-W15","2026-W16"].map(w => <option key={w}>{w}</option>)}
          </select>
        </Field>
        <Field label="Week B" required>
          <select value={weekB} onChange={e => setWeekB(e.target.value)}>
            {["2026-W13","2026-W14","2026-W15","2026-W16"].map(w => <option key={w}>{w}</option>)}
          </select>
        </Field>
      </div>
      <Summary rows={[
        { label: "Week A OEE avg",     value: "74.8%" },
        { label: "Week B OEE avg",     value: "77.1%" },
        { label: "Delta",              value: "+2.3pp", emphasis: true },
        { label: "Biggest mover",      value: "LINE-01 · +4.1pp" },
        { label: "Biggest regressor",  value: "LINE-02 · −6.2pp" },
      ]}/>
      <div className="muted" style={{fontSize:11, marginTop:10}}>
        Preview only · clicking Compare opens the heatmap diff view (P1.5 backlog).
      </div>
    </Modal>
  );
};

// ============ M-11: Acknowledge anomaly (P2) ============
const AcknowledgeAnomalyModal = ({ open, onClose, data }) => {
  const [action, setAction] = React.useState("investigate");
  const [notes, setNotes] = React.useState("");
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title="Acknowledge anomaly" subtitle={`${data?.line} · ${data?.detected}`} size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        {action === "falsepositive"
          ? <button className="btn btn-danger btn-sm" onClick={onClose}>Mark false positive</button>
          : <button className="btn btn-primary btn-sm" onClick={onClose}>Acknowledge & investigate</button>
        }
      </>}
    >
      <Summary rows={[
        { label: "Line",             value: data?.line },
        { label: "OEE actual",       value: `${data?.actual}%` },
        { label: "OEE expected",     value: `${data?.expected}%` },
        { label: "Deviation",        value: `${data?.sigma}σ` },
        { label: "Severity",         value: data?.severity?.toUpperCase() },
      ]}/>
      <Field label="Action" required>
        <div className="radio-group">
          <label className={action === "investigate" ? "on" : ""}><input type="radio" checked={action === "investigate"} onChange={() => setAction("investigate")}/> Acknowledge & investigate</label>
          <label className={action === "falsepositive" ? "on" : ""}><input type="radio" checked={action === "falsepositive"} onChange={() => setAction("falsepositive")}/> Mark as false positive</label>
        </div>
      </Field>
      <Field label="Notes" help="Logged for anomaly workflow audit">
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Root cause hypothesis or reason for dismissal…" style={{minHeight:60}}/>
      </Field>
      <div className="muted" style={{fontSize:11, marginTop:10}}>
        P2 only · EWMA rule <span className="mono">oee_anomaly_detector_v1</span>.
      </div>
    </Modal>
  );
};

// ============ M-12: Auto-refresh pause ============
const AutoRefreshModal = ({ open, onClose }) => {
  const [duration, setDuration] = React.useState(15);
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title="Pause auto-refresh?" size="sm"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={onClose}>Pause {duration}m</button>
      </>}
    >
      <div className="alert-blue alert-box" style={{marginBottom:10}}>
        <span>ⓘ</span><div>Auto-refresh keeps chart data current (60s). Pause if you need a stable view for screenshots or review.</div>
      </div>
      <Field label="Pause for" required>
        <div className="pills">
          {[5, 15, 30, 60].map(d => (
            <button key={d} className={"pill " + (duration === d ? "on" : "")} onClick={() => setDuration(d)}>{d} min</button>
          ))}
        </div>
      </Field>
    </Modal>
  );
};

// ============ MODAL CATALOG ============
const MODAL_CATALOG = [
  { key: "annotateDowntime",  name: "M-01 · Annotate downtime event",    pattern: "Simple form + supervisor override + edit-window", comp: AnnotateDowntimeModal,    sample: OEE_DOWNTIME_EVENTS[0] },
  { key: "export",            name: "M-02 · Export OEE data",            pattern: "Simple form + section multi-select",              comp: ExportModal,              sample: { dashboard: "oee_daily_summary", date: "2026-04-20", line: "All Lines" } },
  { key: "lineOverride",      name: "M-03 · Per-line threshold override",pattern: "Simple form + per-field validation",              comp: LineOverrideModal,        sample: null },
  { key: "bigLossMapping",    name: "M-04 · Big Loss mapping editor",    pattern: "Full-page table editor + reset defaults",         comp: BigLossMappingModal,      sample: null },
  { key: "changeoverDetail",  name: "M-05 · Changeover detail",          pattern: "Read-only + cross-link 08-PROD",                  comp: ChangeoverDetailModal,    sample: CHANGEOVER_EVENTS[0] },
  { key: "cellDrill",         name: "M-06 · Heatmap cell drill-down",    pattern: "Read-only gauges + drill link",                    comp: CellDrillModal,           sample: { line: "LINE-02", day: "sat", dayLabel: "Sat 19", shift: "Night", val: 55.2 } },
  { key: "requestEdit",       name: "M-07 · Request edit escalation",    pattern: "Destructive confirm w/ reason (min 10 chars)",    comp: RequestEditModal,         sample: OEE_DOWNTIME_EVENTS[5] },
  { key: "deleteOverride",    name: "M-08 · Delete line override",       pattern: "Destructive confirm (type-to-confirm)",            comp: DeleteOverrideModal,      sample: OEE_THRESHOLDS.perLine[0] },
  { key: "copyClipboard",     name: "M-09 · Copy-to-clipboard preview",  pattern: "Read-only preview + clipboard action",             comp: CopyClipboardModal,       sample: { date: "2026-04-20" } },
  { key: "compareWeeks",      name: "M-10 · Compare two weeks",          pattern: "Picker + diff preview",                            comp: CompareWeeksModal,        sample: null },
  { key: "ackAnomaly",        name: "M-11 · Acknowledge anomaly (P2)",   pattern: "Dual-path confirm",                                comp: AcknowledgeAnomalyModal,  sample: ANOMALIES[0] },
  { key: "autoRefresh",       name: "M-12 · Pause auto-refresh",         pattern: "Simple confirm",                                    comp: AutoRefreshModal,         sample: null },
];

const ModalGallery = ({ onNav }) => {
  const [open, setOpen] = React.useState(null);
  const current = MODAL_CATALOG.find(m => m.key === open);
  return (
    <>
      <PageHead
        breadcrumb={<><a onClick={() => onNav("summary")}>OEE</a> · Modal gallery</>}
        title="Modal gallery"
        subtitle={`${MODAL_CATALOG.length} components · follows _shared/MODAL-SCHEMA.md · test each for focus/backdrop/ESC`}
      />

      <div className="alert-blue alert-box" style={{marginBottom:14, fontSize:12}}>
        <span>ⓘ</span>
        <div>
          <b>Click any card to open the modal.</b> All modals use shared primitives (<span className="mono">Modal</span>, <span className="mono">Stepper</span>, <span className="mono">Field</span>, <span className="mono">ReasonInput</span>, <span className="mono">Summary</span>).
          <br/>Schema doc: <span className="mono">_shared/MODAL-SCHEMA.md</span>.
        </div>
      </div>

      <div className="gallery-grid">
        {MODAL_CATALOG.map(m => (
          <div key={m.key} className="gallery-card" onClick={() => setOpen(m.key)}>
            <div className="gallery-pattern">{m.pattern}</div>
            <div className="gallery-name">{m.name}</div>
            <button className="btn btn-secondary btn-sm" style={{marginTop:10}}>Open modal →</button>
          </div>
        ))}
      </div>

      {current && <current.comp open={open === current.key} onClose={() => setOpen(null)} data={current.sample}/>}
    </>
  );
};

Object.assign(window, {
  AnnotateDowntimeModal, ExportModal, LineOverrideModal, BigLossMappingModal,
  ChangeoverDetailModal, CellDrillModal, RequestEditModal, DeleteOverrideModal,
  CopyClipboardModal, CompareWeeksModal, AcknowledgeAnomalyModal, AutoRefreshModal,
  ModalGallery, MODAL_CATALOG,
});
