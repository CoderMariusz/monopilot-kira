// ============================================================
// REPORTING MODALS — follows ../_shared/MODAL-SCHEMA.md
//
// Inventory (12 modals):
//   M-RPT-01 Export Report              (simple form + async state)
//   M-RPT-02 Save Filter Preset         (simple form)
//   M-RPT-03 Schedule Report            (2-step wizard, P2)
//   M-RPT-04 Share Report Link          (simple form)
//   M-RPT-05 Delete Confirm             (destructive w/ reason)
//   M-RPT-06 Error Log Detail           (error dialog)
//   M-RPT-07 Regulatory Sign-off        (P2, PIN verification)
//   M-RPT-08 Force Refresh Confirm      (confirm non-destructive)
//   M-RPT-09 Manage Recipient Group     (P2, picker-style)
//   M-RPT-10 Run Now Confirm            (simple confirm)
//   M-RPT-11 P2 Dashboard Toast         (info dialog)
//   M-RPT-12 Access Denied              (error dialog)
// ============================================================

// -------- M-RPT-01: Export Report (the canonical flow) --------
const ExportReportModal = ({ open, onClose, data }) => {
  const d = data || { dashboard: "Factory Overview", fmt: "pdf" };
  const [fmt, setFmt] = React.useState(d.fmt || "pdf");
  const [delivery, setDelivery] = React.useState("download");
  const [email, setEmail] = React.useState("m.krawczyk@forzafoods.com");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState(null);
  const rowEstimate = fmt === "csv" ? 4820 : 180;
  const warn = fmt === "pdf" && rowEstimate > 500;
  const blocked = rowEstimate > 10000;

  const doExport = () => {
    setSubmitting(true); setError(null);
    setTimeout(() => {
      setSubmitting(false);
      // 20% chance of error to surface error path — keep deterministic; always success for demo
      onClose();
    }, 1200);
  };

  return (
    <Modal open={open} onClose={onClose} size="default" title={`Export — ${d.dashboard}`}
      foot={error ? (
        <>
          <button className="btn btn-secondary btn-sm" onClick={() => setError(null)}>Close</button>
          <button className="btn btn-primary btn-sm" onClick={() => { setFmt("csv"); setError(null); }}>Try CSV</button>
        </>
      ) : (
        <>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" disabled={submitting || blocked} onClick={doExport}>
            {submitting ? "Generating…" : "Run report"}
          </button>
        </>
      )}>
      {error && (
        <div className="alert-red alert-box" style={{fontSize:12, marginBottom:12}}>
          <span>⚠</span>
          <div><b>{error}</b></div>
        </div>
      )}
      <Field label="Format" required>
        <div style={{display:"flex", gap:14, fontSize:12}}>
          {["pdf","csv","copy"].map(f => (
            <label key={f} style={{display:"flex", gap:4, alignItems:"center"}}>
              <input type="radio" checked={fmt === f} onChange={() => setFmt(f)}/>
              {f === "pdf" ? "PDF" : f === "csv" ? "CSV" : "Copy to Clipboard"}
            </label>
          ))}
          <label style={{display:"flex", gap:4, alignItems:"center", color:"var(--muted)"}}>
            <input type="radio" disabled/> XLSX <span className="badge badge-gray" style={{fontSize:9}}>Phase 2</span>
          </label>
        </div>
      </Field>
      <Field label="Date Range" help="Change via the dashboard filter before exporting">
        <input value="W/E 19/04/2026" readOnly style={{background:"var(--gray-100)", fontFamily:"var(--font-mono)"}}/>
      </Field>
      <Field label="Filters Applied">
        <div style={{fontSize:11, color:"var(--muted)", padding:"6px 0"}}>Line: All · Shift: All · Week: W/E 19/04/2026</div>
      </Field>
      <Field label="Delivery Method">
        <div style={{display:"flex", gap:14, fontSize:12}}>
          <label style={{display:"flex", gap:4, alignItems:"center"}}><input type="radio" checked={delivery === "download"} onChange={() => setDelivery("download")}/> Download now</label>
          <label style={{display:"flex", gap:4, alignItems:"center"}}><input type="radio" checked={delivery === "email"} onChange={() => setDelivery("email")}/> Email</label>
        </div>
      </Field>
      {delivery === "email" && (
        <Field label="Email address" required><input type="email" value={email} onChange={e => setEmail(e.target.value)}/></Field>
      )}
      <div style={{fontSize:11, color:"var(--muted)", padding:"6px 0"}}>
        Estimated rows: <b className="mono">{rowEstimate.toLocaleString()}</b> · SHA-256 fingerprint will be embedded in PDF footer.
      </div>
      {warn && (
        <div className="alert-amber alert-box" style={{fontSize:12}}>
          <span>⚠</span>
          <div>PDF generation may take up to 30 seconds for large exports. Consider CSV for faster download.</div>
        </div>
      )}
      {blocked && (
        <div className="alert-red alert-box" style={{fontSize:12}}>
          <span>⚠</span>
          <div>This export exceeds the maximum of 10,000 rows (V-RPT-EXPORT-5). Refine your filters or use CSV.</div>
        </div>
      )}
      {submitting && (
        <div className="alert-blue alert-box" style={{fontSize:12, marginTop:6}}>
          <span>⟳</span>
          <div>{fmt === "pdf" ? "Generating PDF, please wait…" : "Streaming CSV…"}</div>
        </div>
      )}
    </Modal>
  );
};

// -------- M-RPT-02: Save Filter Preset --------
const SavePresetModal = ({ open, onClose, data }) => {
  const d = data || { dashboard: "Factory Overview" };
  const [name, setName] = React.useState(d.edit ? d.name : "");
  const [visibility, setVisibility] = React.useState("me");
  const [error, setError] = React.useState(null);
  const tooLong = name.length > 60;
  const dup = name === "Line 1 — Weekly Review" && !d.edit;
  return (
    <Modal open={open} onClose={onClose} size="default" title={d.edit ? `Edit Preset — ${d.name}` : "Save Filter Preset"}
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        {dup && <button className="btn btn-secondary btn-sm">Overwrite</button>}
        <button className="btn btn-primary btn-sm" disabled={!name || tooLong || dup} onClick={onClose}>Save Preset</button>
      </>}>
      <Field label="Preset Name" required help="Max 60 characters" error={dup ? "A preset with this name already exists. Choose a different name or overwrite." : null}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Line 1 — Weekly Review" maxLength={80}/>
      </Field>
      <Field label="Dashboard"><input value={d.dashboard} readOnly style={{background:"var(--gray-100)"}}/></Field>
      <Field label="Filters (snapshot)">
        <div style={{display:"flex", flexWrap:"wrap", gap:6}}>
          <span className="rpt-chip"><span>Week: <b>W/E 19/04/2026</b></span></span>
          <span className="rpt-chip"><span>Line: <b>Line 1</b></span></span>
          <span className="rpt-chip"><span>Shift: <b>All</b></span></span>
        </div>
      </Field>
      <Field label="Visible to">
        <div style={{display:"flex", gap:14, fontSize:12}}>
          <label><input type="radio" checked={visibility === "me"} onChange={() => setVisibility("me")}/> Just me</label>
          <label><input type="radio" checked={visibility === "team"} onChange={() => setVisibility("team")}/> My team</label>
        </div>
      </Field>
    </Modal>
  );
};

// -------- M-RPT-03: Schedule Report (2-step wizard, P2) --------
const ScheduleReportModal = ({ open, onClose, data }) => {
  const d = data || { dashboard: "Factory Overview" };
  const [step, setStep] = React.useState("cadence");
  const [completed, setCompleted] = React.useState(new Set());
  const [cadence, setCadence] = React.useState("weekly");
  const [recipients, setRecipients] = React.useState(["ops@forzafoods.com"]);
  const steps = [
    { key: "cadence",   label: "Cadence & Filters" },
    { key: "delivery",  label: "Recipients & Format" },
  ];

  const next = () => { setCompleted(new Set([...completed, step])); setStep("delivery"); };
  const back = () => setStep("cadence");

  return (
    <Modal open={open} onClose={onClose} size="wide" title="Schedule Report" subtitle={d.dashboard}
      foot={step === "cadence" ? (
        <>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={next}>Next →</button>
        </>
      ) : (
        <>
          <button className="btn btn-ghost btn-sm" onClick={back}>← Back</button>
          <span className="spacer"></span>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" disabled={recipients.length === 0} onClick={onClose}>Activate Schedule</button>
        </>
      )}>
      <Stepper steps={steps} current={step} completed={completed}/>

      {step === "cadence" && (
        <div style={{marginTop:14}}>
          <Field label="Report Name" required><input defaultValue={`${d.dashboard} — ${new Date().toISOString().slice(0,10)}`}/></Field>
          <Field label="Dashboard"><input value={d.dashboard} readOnly style={{background:"var(--gray-100)"}}/></Field>
          <Field label="Cadence" required>
            <select value={cadence} onChange={e => setCadence(e.target.value)}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="period">Period-End (4-4-5)</option>
            </select>
          </Field>
          {cadence === "weekly" && (
            <>
              <div className="label">Day of week</div>
              <div style={{display:"flex", gap:6, marginBottom:10}}>
                {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => (
                  <label key={d} style={{fontSize:11, display:"flex", gap:4, alignItems:"center"}}><input type="checkbox" defaultChecked={d === "Mon"}/>{d}</label>
                ))}
              </div>
            </>
          )}
          <div className="ff-inline">
            <Field label="Time"><select defaultValue="07:00"><option>07:00</option><option>12:00</option><option>17:00</option></select></Field>
            <Field label="Timezone"><select defaultValue="Europe/London"><option>Europe/London</option><option>UTC</option></select></Field>
          </div>
          <Field label="Skip if no data" help="Do not send email if report returns zero rows">
            <label style={{fontSize:12}}><input type="checkbox" defaultChecked/> Enabled</label>
          </Field>
          <div className="label" style={{marginTop:8}}>Filter snapshot</div>
          <div style={{display:"flex", gap:14, fontSize:12}}>
            <label><input type="checkbox" defaultChecked/> Line</label>
            <label><input type="checkbox" defaultChecked/> Shift</label>
            <label><input type="checkbox"/> Product Category</label>
          </div>
        </div>
      )}

      {step === "delivery" && (
        <div style={{marginTop:14}}>
          <Field label="Recipients" required>
            <div style={{display:"flex", flexWrap:"wrap", gap:6, padding:6, border:"1px solid var(--border)", borderRadius:4}}>
              {recipients.map((r, i) => (
                <span key={i} className="rpt-chip">
                  <span>{r}</span>
                  <span className="x" onClick={() => setRecipients(recipients.filter((_, ii) => ii !== i))}>×</span>
                </span>
              ))}
              <input placeholder="Type email or select team member…" style={{flex:1, border:0, outline:"none", minWidth:200, fontSize:12}}
                     onKeyDown={e => {
                       if (e.key === "Enter" && e.target.value) {
                         setRecipients([...recipients, e.target.value]);
                         e.target.value = "";
                       }
                     }}/>
            </div>
          </Field>
          <a style={{fontSize:11, color:"var(--blue)", cursor:"pointer"}}>＋ Add recipient group</a>
          <div style={{marginTop:10}}>
            <div className="label">Format</div>
            <div style={{display:"flex", gap:14, fontSize:12}}>
              <label><input type="radio" name="sfmt" defaultChecked/> PDF</label>
              <label><input type="radio" name="sfmt"/> CSV</label>
            </div>
          </div>
          <Field label="Subject Template" help="Preview rendered below">
            <input defaultValue="{{report_name}} — {{period}}"/>
          </Field>
          <div style={{fontSize:11, color:"var(--muted)"}}>Preview: <b className="mono">{d.dashboard} — W/E 19/04/2026</b></div>
        </div>
      )}
    </Modal>
  );
};

// -------- M-RPT-04: Share Report Link --------
const ShareReportModal = ({ open, onClose, data }) => {
  const d = data || { dashboard: "Factory Overview" };
  const url = "https://mes.forzafoods.com/reporting/factory-overview?week=2026-W16";
  const [copied, setCopied] = React.useState(false);
  const copy = () => { navigator.clipboard && navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <Modal open={open} onClose={onClose} size="default" title={`Share — ${d.dashboard}`}
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
        <button className="btn btn-primary btn-sm" onClick={copy}>{copied ? "✓ Copied" : "Copy Link"}</button>
      </>}>
      <Field label="Shareable Link">
        <input readOnly value={url} style={{fontFamily:"var(--font-mono)", fontSize:11, background:"var(--gray-100)"}}/>
      </Field>
      <Field label="Link Expiry"><select defaultValue="30"><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option>Never</option></select></Field>
      <Field label="Require Login" help="If OFF, anyone with the link can view. Not recommended for regulatory data.">
        <label style={{fontSize:12}}><input type="checkbox" defaultChecked/> Enabled</label>
      </Field>
      <div className="alert-blue alert-box" style={{fontSize:11}}>
        <span>ⓘ</span>
        <div>External sharing without login is disabled for regulatory dashboards (QC Holds, Inventory Aging).</div>
      </div>
    </Modal>
  );
};

// -------- M-RPT-05: Delete Confirm --------
const DeleteConfirmModal = ({ open, onClose, data }) => {
  const d = data || { kind: "preset", name: "—" };
  const warning = d.kind === "schedule" ? "All pending deliveries will be cancelled." : "This action cannot be undone.";
  return (
    <Modal open={open} onClose={onClose} size="sm" title={`Delete ${d.kind} — ${d.name}?`}
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-danger btn-sm" onClick={onClose}>Delete</button>
      </>}>
      <div className="alert-red alert-box" style={{fontSize:12}}>
        <span>⚠</span>
        <div>{warning}</div>
      </div>
      <div style={{fontSize:12, marginTop:10, color:"var(--muted)"}}>
        Deleting <b>{d.name}</b>. Audit-logged with user and timestamp.
      </div>
    </Modal>
  );
};

// -------- M-RPT-06: Error Log Detail --------
const ErrorLogModal = ({ open, onClose, data }) => {
  const d = data || { id: "e2f4c835", dashboard: "Inventory Aging", fmt: "pdf", at: "21/04/2026 07:02", errorCode: "PDF_TIMEOUT", errorMsg: "Puppeteer edge function timeout after 30s (V-RPT-EXPORT-7)" };
  return (
    <Modal open={open} onClose={onClose} size="default" title="Export Error Log"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
        <button className="btn btn-primary btn-sm" onClick={onClose}>Retry Export</button>
      </>}>
      <Summary rows={[
        { label: "Export ID",    value: d.id || "—" },
        { label: "Dashboard",     value: d.dashboard || "—", mono: false },
        { label: "Format",        value: (d.fmt || "—").toUpperCase() },
        { label: "Attempted at",  value: d.at || "—" },
        { label: "Error code",    value: d.errorCode || "—" },
      ]}/>
      <div className="label" style={{marginTop:10}}>Error message</div>
      <pre className="mono" style={{background:"var(--gray-050)", padding:10, borderRadius:4, fontSize:11, maxHeight:200, overflow:"auto", whiteSpace:"pre-wrap"}}>
{d.errorMsg}
      </pre>
      <div className="label" style={{marginTop:10}}>Suggested action</div>
      <div style={{fontSize:12}}>Reduce the date range and retry, or use CSV format for large exports.</div>
    </Modal>
  );
};

// -------- M-RPT-07: Regulatory Sign-off (P2) --------
const RegulatorySignoffModal = ({ open, onClose, data }) => {
  const d = data || { name: "BRCGS Audit Bundle", regulation: "BRCGS Issue 10 §3.4", sha: "a8b4f1e28f7d9c31" };
  const [pin, setPin] = React.useState("");
  const [attempts, setAttempts] = React.useState(0);
  const [locked, setLocked] = React.useState(false);
  const [err, setErr] = React.useState(null);

  const sign = () => {
    if (pin.length !== 4 || pin === "0000") {
      const newAtt = attempts + 1;
      setAttempts(newAtt);
      if (newAtt >= 3) {
        setLocked(true);
        setErr("Sign-off locked. Contact system administrator.");
      } else {
        setErr(`Incorrect PIN. You have ${3 - newAtt} attempt(s) remaining.`);
      }
      return;
    }
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} size="default" title={`Sign & Export — ${d.name}`}
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!pin || locked} onClick={sign}>Sign & Download PDF</button>
      </>}>
      <Summary rows={[
        { label: "Dashboard",   value: d.name, mono: false },
        { label: "Date Range",   value: "01/04/2025 — 31/03/2026" },
        { label: "Record Count", value: "14,820" },
        { label: "SHA-256",       value: d.sha + "…" },
        { label: "Regulation",    value: d.regulation, mono: false },
      ]}/>
      <div className="label" style={{marginTop:10}}>Signatory</div>
      <div style={{fontSize:12, padding:"4px 0"}}>M. Krawczyk · QA Manager · <span className="mono">m.krawczyk@forzafoods.com</span></div>
      <Field label="Enter your PIN to sign" required help="Uses same PIN as 09-QUALITY sign-offs" error={err}>
        <input type="password" maxLength={6} value={pin} onChange={e => { setPin(e.target.value); setErr(null); }} style={{letterSpacing:"0.2em", fontFamily:"var(--font-mono)"}} disabled={locked}/>
      </Field>
      <div className="alert-blue alert-box" style={{fontSize:11}}>
        <span>ⓘ</span>
        <div>By entering your PIN, you confirm this report accurately reflects data in Monopilot MES at the time of export. This record is immutable and subject to 7-year retention per BRCGS Issue 10.</div>
      </div>
    </Modal>
  );
};

// -------- M-RPT-08: Force Refresh Confirm --------
const RefreshConfirmModal = ({ open, onClose, data }) => {
  const d = data || { view: "mv_yield_by_line_week" };
  const [loading, setLoading] = React.useState(false);
  const refresh = () => {
    setLoading(true);
    setTimeout(() => { setLoading(false); onClose(); }, 1400);
  };
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Force refresh materialized view"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={loading}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={refresh} disabled={loading}>{loading ? "Refreshing…" : "Refresh Now"}</button>
      </>}>
      <div style={{fontSize:12, lineHeight:1.5}}>
        Refreshing <b className="mono">{d.view}</b> will trigger an immediate <span className="mono">REFRESH MATERIALIZED VIEW CONCURRENTLY</span>. Table reads continue uninterrupted (zero downtime). May take up to 30 seconds.
      </div>
      <div className="mono" style={{fontSize:11, color:"var(--muted)", marginTop:8}}>Domain ref: <b>DS-0012</b></div>
    </Modal>
  );
};

// -------- M-RPT-09: Manage Recipient Group --------
const RecipientGroupModal = ({ open, onClose }) => {
  const [members, setMembers] = React.useState([
    { name: "M. Krawczyk",    email: "m.krawczyk@forzafoods.com",    role: "Manager" },
    { name: "P. Director",     email: "p.director@forzafoods.com",    role: "Admin" },
    { name: "QA.Wiśniewski",   email: "qa.wisniewski@forzafoods.com", role: "QA Lead" },
  ]);
  return (
    <Modal open={open} onClose={onClose} size="default" title="Manage Recipient Group"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={onClose}>Save Group</button>
      </>}>
      <Field label="Group Name" required><input placeholder="e.g. Plant Leadership"/></Field>
      <Field label="Add member">
        <input placeholder="Type email or search team member…"/>
      </Field>
      <div className="label" style={{marginTop:8}}>Members ({members.length})</div>
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr></thead>
        <tbody>
          {members.map((m, i) => (
            <tr key={i}>
              <td>{m.name}</td>
              <td className="mono" style={{fontSize:11}}>{m.email}</td>
              <td style={{fontSize:11}}>{m.role}</td>
              <td><button className="btn btn-sm btn-ghost" onClick={() => setMembers(members.filter((_, ii) => ii !== i))}>Remove</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
};

// -------- M-RPT-10: Run Now Confirm --------
const RunNowConfirmModal = ({ open, onClose, data }) => {
  const d = data || { name: "Weekly Factory Overview", recipients: 3 };
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Run scheduled report now?"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={onClose}>Run & deliver</button>
      </>}>
      <div style={{fontSize:13, marginBottom:10}}>Schedule: <b>{d.name}</b></div>
      <div style={{fontSize:12, color:"var(--muted)"}}>This will generate the report and deliver to <b>{d.recipients} recipient(s)</b> immediately — regardless of the next scheduled time.</div>
    </Modal>
  );
};

// -------- M-RPT-11: P2 Dashboard Toast --------
const P2ToastModal = ({ open, onClose, data }) => {
  const d = data || { name: "—" };
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Coming in Phase 2"
      foot={<button className="btn btn-primary btn-sm" onClick={onClose}>Got it</button>}>
      <div className="alert-blue alert-box" style={{fontSize:12}}>
        <span>ⓘ</span>
        <div><b>{d.name}</b> is coming in Phase 2 (E3 Advanced Analytics). It will be enabled automatically when the <span className="mono">reporting.v2_dashboards</span> feature flag is activated for your organisation.</div>
      </div>
    </Modal>
  );
};

// -------- M-RPT-12: Access Denied --------
const AccessDeniedModal = ({ open, onClose, data }) => {
  const d = data || { resource: "Integration Health" };
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Access denied"
      foot={<button className="btn btn-primary btn-sm" onClick={onClose}>OK</button>}>
      <div className="alert-red alert-box" style={{fontSize:12}}>
        <span>⚠</span>
        <div>You do not have permission to view <b>{d.resource}</b>. Contact your administrator.</div>
      </div>
      <div className="mono" style={{fontSize:10, color:"var(--muted)", marginTop:8}}>
        DSL rule evaluated: <b>report_access_gate_v1</b> · result: <b style={{color:"var(--red)"}}>deny</b>
      </div>
    </Modal>
  );
};

// ============ MODAL GALLERY ============
const MODAL_CATALOG = [
  { key: "export",         name: "M-RPT-01 · Export Report",            pattern: "Simple form + async states",         comp: ExportReportModal },
  { key: "savePreset",     name: "M-RPT-02 · Save Filter Preset",       pattern: "Simple form + duplicate validator",  comp: SavePresetModal },
  { key: "schedule",       name: "M-RPT-03 · Schedule Report (P2)",     pattern: "2-step wizard",                      comp: ScheduleReportModal },
  { key: "share",          name: "M-RPT-04 · Share Report Link",        pattern: "Simple form + copy action",          comp: ShareReportModal },
  { key: "deleteConfirm",  name: "M-RPT-05 · Delete Confirm",           pattern: "Destructive confirm",                comp: DeleteConfirmModal },
  { key: "errorLog",       name: "M-RPT-06 · Export Error Log",         pattern: "Error dialog with retry",            comp: ErrorLogModal },
  { key: "regulatory",     name: "M-RPT-07 · Regulatory Sign-off (P2)", pattern: "PIN verification + declaration",     comp: RegulatorySignoffModal },
  { key: "refreshConfirm", name: "M-RPT-08 · Force Refresh Confirm",    pattern: "Confirm non-destructive",            comp: RefreshConfirmModal },
  { key: "recipientGroup", name: "M-RPT-09 · Recipient Group (P2)",     pattern: "Picker-style member list",           comp: RecipientGroupModal },
  { key: "runNow",         name: "M-RPT-10 · Run Now Confirm",          pattern: "Confirm non-destructive",            comp: RunNowConfirmModal },
  { key: "p2Toast",        name: "M-RPT-11 · P2 Dashboard Toast",       pattern: "Info dialog",                        comp: P2ToastModal },
  { key: "accessDenied",   name: "M-RPT-12 · Access Denied",            pattern: "Error dialog",                       comp: AccessDeniedModal },
];

const ModalGallery = ({ onNav }) => {
  const [open, setOpen] = React.useState(null);
  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={() => onNav("home")}>Reporting</a> · Modal gallery</div>
          <h1 className="page-title">Modal gallery</h1>
          <div className="muted" style={{fontSize:12}}>{MODAL_CATALOG.length} components covering M-RPT-01 through M-RPT-12 · follows <span className="mono">_shared/MODAL-SCHEMA.md</span></div>
        </div>
      </div>

      <div className="alert-blue alert-box" style={{marginBottom:14, fontSize:12}}>
        <span>ⓘ</span>
        <div>
          <b>Click any card to open the modal.</b> Each modal uses shared primitives (<span className="mono">Modal</span>, <span className="mono">Stepper</span>, <span className="mono">Field</span>, <span className="mono">ReasonInput</span>, <span className="mono">Summary</span>).
          <br/>Schema doc: <span className="mono">_shared/MODAL-SCHEMA.md</span> — read before adding new modals.
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

      {MODAL_CATALOG.map(m => (
        <m.comp key={m.key} open={open === m.key} onClose={() => setOpen(null)}/>
      ))}
    </>
  );
};

Object.assign(window, {
  ExportReportModal, SavePresetModal, ScheduleReportModal, ShareReportModal,
  DeleteConfirmModal, ErrorLogModal, RegulatorySignoffModal, RefreshConfirmModal,
  RecipientGroupModal, RunNowConfirmModal, P2ToastModal, AccessDeniedModal,
  ModalGallery, MODAL_CATALOG,
});
