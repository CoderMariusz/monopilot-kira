// ============================================================
// MULTI-SITE MODALS — follows ../_shared/MODAL-SCHEMA.md
//
// Modal inventory (12 — exceeds 10-modal minimum):
//   M-01 MODAL-SITE-CREATE (4-step wizard)
//   M-02 MODAL-IST-CANCEL (destructive w/ reason)
//   M-03 MODAL-IST-AMEND (simple form)
//   M-04 MODAL-REPLICATION-RETRY (priority + confirm)
//   M-05 MODAL-CONFLICT-RESOLVE (diff panel — signature wide modal)
//   M-06 MODAL-LANE-CREATE (simple form)
//   M-07 MODAL-RATE-CARD-UPLOAD (wizard)
//   M-08 MODAL-SITE-CONFIG-OVERRIDE (dynamic field)
//   M-09 MODAL-PERMISSION-BULK-ASSIGN (form + bulk CSV tab)
//   M-10 MODAL-SITE-DECOMMISSION (type-to-confirm destructive)
//   M-11 MODAL-ACTIVATION-CONFIRM (destructive confirm)
//   M-12 MODAL-ROLLBACK-CONFIRM (type-to-confirm destructive)
//   + MODAL-PROMOTE-ENV (L1→L2→L3 config promotion)
// ============================================================

// -------- M-01 · MODAL-SITE-CREATE · 4-step wizard --------
const SiteCreateModal = ({ open, onClose, data }) => {
  const [step, setStep] = React.useState("identity");
  const [completed, setCompleted] = React.useState(new Set());
  const [form, setForm] = React.useState({
    code: data?.site?.code || "",
    name: data?.site?.name || "",
    type: data?.site?.type || "plant",
    country: data?.site?.country || "United Kingdom",
    tz: data?.site?.tz || "Europe/London",
    language: "en",
    currency: "GBP",
    residency: "eu-west-2",
    modules: new Set(["dashboard","planning","production","warehouse","quality","shipping","technical","finance"]),
    isDefault: false,
  });
  const isEdit = !!data?.edit;

  const steps = [
    { key: "identity", label: "Identity" },
    { key: "modules",  label: "Modules" },
    { key: "tzcur",    label: "TZ & Currency" },
    { key: "users",    label: "Bootstrap Users" },
  ];

  const goNext = () => {
    setCompleted(new Set([...completed, step]));
    setStep(step === "identity" ? "modules" : step === "modules" ? "tzcur" : step === "tzcur" ? "users" : "users");
  };
  const goBack = () => setStep(step === "users" ? "tzcur" : step === "tzcur" ? "modules" : "identity");

  const canNext = step === "identity" ? form.code.length >= 2 && form.name.length >= 2 : true;

  return (
    <Modal open={open} onClose={onClose}
      title={isEdit ? `Edit Site — ${form.name}` : "Add Site"}
      size="wide"
      foot={isEdit ? <>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm">Save Changes</button>
      </> : step === "users" ? <>
        <button className="btn btn-ghost btn-sm" onClick={goBack}>← Back</button>
        <span className="spacer"></span>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={onClose}>Create Site</button>
      </> : <>
        {step !== "identity" && <button className="btn btn-ghost btn-sm" onClick={goBack}>← Back</button>}
        <span className="spacer"></span>
        <button className="btn btn-secondary btn-sm">Save as Draft</button>
        <button className="btn btn-primary btn-sm" disabled={!canNext} onClick={goNext}>Next →</button>
      </>}
    >
      {!isEdit && <Stepper steps={steps} current={step} completed={completed}/>}

      {step === "identity" && (
        <div style={{marginTop:10}}>
          <div className="ff-inline">
            <Field label="Site Code" required help="Max 10 chars, uppercase+hyphen. Cannot change after creation." error={form.code.length > 0 && form.code.length < 2 ? "Min 2 chars" : null}>
              <input value={form.code} maxLength={10} onChange={e=>setForm({...form, code: e.target.value.toUpperCase()})}/>
            </Field>
            <Field label="Site Name" required>
              <input value={form.name} onChange={e=>setForm({...form, name: e.target.value})}/>
            </Field>
            <Field label="Site Type" required>
              <select value={form.type} onChange={e=>setForm({...form, type: e.target.value})}>
                <option value="plant">Plant</option>
                <option value="warehouse">Warehouse</option>
                <option value="office">Office</option>
                <option value="copack">Co-pack</option>
              </select>
            </Field>
            <Field label="Country" required>
              <select value={form.country} onChange={e=>setForm({...form, country: e.target.value})}>
                <option>United Kingdom</option><option>Germany</option><option>Poland</option><option>Romania</option>
              </select>
            </Field>
            <Field label="Legal Entity">
              <input placeholder="e.g. Apex Foods Ltd"/>
            </Field>
            <Field label="Address">
              <textarea placeholder="Street, city, postcode" maxLength={300} style={{minHeight:50}}/>
            </Field>
          </div>
          <Field label="Notes">
            <textarea placeholder="Internal notes about this site..." maxLength={500} style={{minHeight:50}}/>
          </Field>
          <Field label="Set as Default">
            <label style={{fontSize:12}}><input type="checkbox" checked={form.isDefault} onChange={e=>setForm({...form, isDefault: e.target.checked})}/> Make this the default site (existing data migrates here during activation)</label>
          </Field>
        </div>
      )}

      {step === "modules" && (
        <div style={{marginTop:10}}>
          <div className="alert-blue alert-box" style={{fontSize:12, marginBottom:10}}>
            <span>ⓘ</span><div>Check which modules this site should have access to. Disabling a module hides it from users scoped to this site.</div>
          </div>
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:6}}>
            {["Dashboard","Settings","Planning","Production","Warehouse","Quality","Shipping","Technical","NPD","Finance","OEE","Multi-Site","Audit","Scanner","Reports"].map(m => (
              <label key={m} style={{fontSize:12, padding:"6px 10px", background:"var(--gray-050)", borderRadius:4}}>
                <input type="checkbox" defaultChecked={!["OEE","NPD"].includes(m)}/> {m}
              </label>
            ))}
          </div>
        </div>
      )}

      {step === "tzcur" && (
        <div style={{marginTop:10}}>
          <div className="ff-inline">
            <Field label="Timezone" required>
              <select value={form.tz} onChange={e=>setForm({...form, tz: e.target.value})}>
                <option>Europe/London</option><option>Europe/Berlin</option><option>Europe/Warsaw</option><option>Europe/Bucharest</option>
              </select>
            </Field>
            <Field label="UI Language" required>
              <select value={form.language} onChange={e=>setForm({...form, language: e.target.value})}>
                <option value="en">English (en)</option><option value="de">Deutsch (de)</option><option value="pl">Polski (pl)</option><option value="ro">Română (ro)</option>
              </select>
            </Field>
            <Field label="Currency" required>
              <select value={form.currency} onChange={e=>setForm({...form, currency: e.target.value})}>
                <option>GBP</option><option>EUR</option><option>PLN</option><option>RON</option>
              </select>
            </Field>
            <Field label="Data Residency Region" help="P2 — requires data residency sign-off">
              <select value={form.residency} onChange={e=>setForm({...form, residency: e.target.value})}>
                <option>eu-west-2 <span className="badge badge-blue" style={{fontSize:9}}>P1</span></option>
                <option>eu-central-1 (P2)</option>
              </select>
            </Field>
          </div>
        </div>
      )}

      {step === "users" && (
        <div style={{marginTop:10}}>
          <div className="muted" style={{fontSize:11, marginBottom:10}}>Optional — assign users now or later from Site Permissions.</div>
          <table>
            <thead><tr><th>User</th><th>Assign</th><th>Role</th><th>Primary</th></tr></thead>
            <tbody>
              {MS_USERS.slice(0, 5).map(u => (
                <tr key={u.id}>
                  <td><div className="avatar" style={{width:22, height:22, fontSize:10, marginRight:6, display:"inline-flex", verticalAlign:"middle"}}>{u.avatar}</div> {u.name}</td>
                  <td><input type="checkbox"/></td>
                  <td><select><option>planner</option><option>site_manager</option><option>warehouse_operator</option></select></td>
                  <td><input type="radio" name="prim-users"/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
};

// -------- M-02 · MODAL-IST-CANCEL --------
const ISTCancelModal = ({ open, onClose, data }) => {
  const [reason, setReason] = React.useState("");
  const [notes, setNotes] = React.useState("");
  return (
    <Modal open={open} onClose={onClose}
      title={`Cancel Transfer ${data?.id || "IST-?"}`}
      size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Keep Transfer</button>
        <button className="btn btn-danger btn-sm" disabled={!reason}>Confirm Cancellation</button>
      </>}
    >
      <div className="alert-amber alert-box" style={{fontSize:12, marginBottom:10}}>
        <span>⚠</span><div>Cancelling this transfer will release all hard-locked LPs back to <b>available</b> status at the from-site. This action cannot be undone.</div>
      </div>
      <Field label="Cancellation Reason" required>
        <select value={reason} onChange={e=>setReason(e.target.value)}>
          <option value="">Select a reason…</option>
          <option>Supplier issue</option>
          <option>Demand change</option>
          <option>Quantity error</option>
          <option>Logistic failure</option>
          <option>Other</option>
        </select>
      </Field>
      <Field label="Notes">
        <textarea value={notes} onChange={e=>setNotes(e.target.value)} maxLength={500} placeholder="Optional details (max 500 chars)..."/>
      </Field>
    </Modal>
  );
};

// -------- M-03 · MODAL-IST-AMEND --------
const ISTAmendModal = ({ open, onClose, data }) => {
  return (
    <Modal open={open} onClose={onClose}
      title={`Amend Transfer ${data?.id || "IST-?"}`}
      size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm">Save Changes</button>
      </>}
    >
      <div className="muted" style={{fontSize:11, marginBottom:10}}>Item quantities cannot be amended. To change items, cancel and recreate.</div>
      <div className="ff-inline">
        <Field label="Planned Ship Date"><input type="date" defaultValue="2026-04-22"/></Field>
        <Field label="ETA"><input type="date" defaultValue="2026-04-24"/></Field>
        <Field label="Carrier Reference"><input defaultValue="DHL-789012"/></Field>
        <Field label="Freight Cost (£)"><input type="number" defaultValue={340}/></Field>
        <Field label="Cost Allocation">
          <select defaultValue="receiver"><option>sender</option><option>receiver</option><option>split</option><option>none</option></select>
        </Field>
      </div>
      <Field label="Notes">
        <textarea defaultValue="Two pallets. Temperature log attached." maxLength={1000}/>
      </Field>
      <div className="alert-amber alert-box" style={{fontSize:11, marginTop:8}}>
        <span>ⓘ</span><div>Changing the ship date will reset the from-site manager approval.</div>
      </div>
    </Modal>
  );
};

// -------- M-04 · MODAL-REPLICATION-RETRY --------
const ReplicationRetryModal = ({ open, onClose, data }) => {
  const [priority, setPriority] = React.useState("normal");
  const label = data?.scope === "failed" ? "Retry All Failed Jobs" : data?.scope === "all" ? "Run Sync Now (all entities)" : `Retry ${data?.id || "Job"}`;
  return (
    <Modal open={open} onClose={onClose}
      title={label}
      size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm">Start Retry</button>
      </>}
    >
      <div className="alert-blue alert-box" style={{fontSize:12, marginBottom:10}}>
        <span>ⓘ</span>
        <div>{data?.scope === "failed" ? "2 failed jobs (Suppliers, Customers) will be re-queued." : data?.scope === "all" ? "All entity types will be synced to all active sites." : "1 job will be re-queued."}</div>
      </div>
      <Field label="Priority" help="High puts the job at the front of the queue.">
        <select value={priority} onChange={e=>setPriority(e.target.value)}>
          <option value="normal">Normal</option>
          <option value="high">High</option>
        </select>
      </Field>
      <div style={{marginTop:10, padding:10, background:"var(--gray-050)", borderRadius:4, fontSize:11}}>
        <div><b>Entity types:</b> <span className="badge badge-blue" style={{fontSize:9, marginRight:4}}>Suppliers</span><span className="badge badge-blue" style={{fontSize:9}}>Customers</span></div>
        <div style={{marginTop:4}}><b>Target sites:</b> {MS_SITES.filter(s=>s.active).map(s => s.code).join(", ")}</div>
      </div>
    </Modal>
  );
};

// -------- M-05 · MODAL-CONFLICT-RESOLVE (signature wide diff modal) --------
const ConflictResolveModal = ({ open, onClose, data }) => {
  const c = MS_CONFLICT_DETAIL;
  const [choices, setChoices] = React.useState(Object.fromEntries(c.fields.map(f => [f.key, "source"])));
  const [reason, setReason] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [esig, setEsig] = React.useState("");

  const choose = (k, v) => setChoices({...choices, [k]: v});
  const chooseAll = (v) => setChoices(Object.fromEntries(c.fields.map(f => [f.key, v])));

  return (
    <Modal open={open} onClose={onClose}
      title={`Resolve Conflict — ${c.name} (${c.code}) at ${c.site}`}
      size="wide"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!reason}>Apply Resolution</button>
      </>}
    >
      <div style={{display:"flex", gap:10, marginBottom:10, alignItems:"center", fontSize:11, color:"var(--muted)"}}>
        <span className="badge badge-blue" style={{fontSize:10}}>Item</span>
        <span className="mono">{c.code}</span>
        <span>·</span>
        <SiteRef id={c.site} compact/>
        <span>·</span>
        <span className="muted">Detected {c.detectedAt}</span>
      </div>
      <div className="muted" style={{fontSize:12, marginBottom:8}}>Review each conflicting field and choose the value to keep. Your choice will be applied to the site record and logged for audit.</div>

      <div className="row-flex" style={{marginBottom:8}}>
        <button className="btn btn-secondary btn-sm" onClick={()=>chooseAll("source")}>Choose All Source</button>
        <button className="btn btn-secondary btn-sm" onClick={()=>chooseAll("site")}>Choose All Site</button>
      </div>

      <div className="conflict-diff">
        <table>
          <thead><tr>
            <th>Field</th>
            <th className="col-source">Source (Org Level) <span className="badge badge-blue" style={{fontSize:9}}>L1</span></th>
            <th className="col-site">Site Override (FRZ-DE) <span className="badge badge-amber" style={{fontSize:9}}>L2</span></th>
            <th>Choose</th>
          </tr></thead>
          <tbody>
            {c.fields.map(f => (
              <tr key={f.key}>
                <td className="cd-field">{f.key}</td>
                <td><span className="cd-val source mono">{f.source}</span></td>
                <td><span className="cd-val site mono">{f.site}</span></td>
                <td>
                  <div className="cd-radio">
                    <label><input type="radio" name={"c-"+f.key} checked={choices[f.key] === "source"} onChange={()=>choose(f.key, "source")}/> Source</label>
                    <label><input type="radio" name={"c-"+f.key} checked={choices[f.key] === "site"}   onChange={()=>choose(f.key, "site")}/> Site</label>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Field label="Reason for Resolution" required>
        <select value={reason} onChange={e=>setReason(e.target.value)}>
          <option value="">Select a reason…</option>
          <option>HQ data is authoritative</option>
          <option>Site-specific pricing agreed</option>
          <option>Data entry error at site</option>
          <option>Site exception approved by manager</option>
          <option>Other (see notes)</option>
        </select>
      </Field>
      <Field label="Notes">
        <textarea value={notes} onChange={e=>setNotes(e.target.value)} maxLength={500} placeholder="Optional…"/>
      </Field>

      {/* Optional e-sig gate */}
      <div style={{background:"var(--gray-050)", padding:10, borderRadius:4, fontSize:11, marginTop:10}}>
        <b>E-signature gate (optional per org config):</b> if enabled, password re-entry required.
        <input type="password" placeholder="Enter your password to confirm" value={esig} onChange={e=>setEsig(e.target.value)} style={{marginTop:6, width:"100%", padding:"6px 8px", fontSize:12}}/>
      </div>
    </Modal>
  );
};

// -------- M-06 · MODAL-LANE-CREATE --------
const LaneCreateModal = ({ open, onClose, data }) => {
  const isEdit = !!data?.edit;
  const lane = data?.lane;
  return (
    <Modal open={open} onClose={onClose}
      title={isEdit ? `Edit Lane ${lane?.id}` : "Add Transport Lane"}
      size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm">Save</button>
      </>}
    >
      <div className="ff-inline">
        <Field label="Lane Code" help="Auto-generated, editable"><input defaultValue={lane?.id || "LN-006"}/></Field>
        <Field label="Mode of Transport" required><select defaultValue={lane?.mode || "Road"}><option>Road</option><option>Rail</option><option>Air</option><option>Sea</option><option>Multimodal</option></select></Field>
        <Field label="From Site" required><select defaultValue={lane?.from || "SITE-A"}>{MS_SITES.filter(s=>s.active).map(s=><option key={s.id} value={s.id}>{s.code}</option>)}</select></Field>
        <Field label="To Site" required><select defaultValue={lane?.to || "SITE-B"}>{MS_SITES.filter(s=>s.active).map(s=><option key={s.id} value={s.id}>{s.code}</option>)}</select></Field>
        <Field label="Distance (km)"><input type="number" defaultValue={lane?.distanceKm || 0}/></Field>
        <Field label="Scheduled Transit (days)"><input type="number" defaultValue={lane?.leadDays || 0} step="0.1"/></Field>
        <Field label="Max Shipment Weight (kg)"><input type="number" defaultValue={lane?.maxWeight || 5000}/></Field>
        <Field label="Carriers" help="Comma-separated"><input defaultValue={lane?.carriers.join(", ") || ""} placeholder="DHL, DB Schenker"/></Field>
      </div>
      <div style={{display:"flex", gap:14, fontSize:12, padding:"8px 0"}}>
        <label><input type="checkbox" defaultChecked={lane?.hazmat}/> HAZMAT allowed</label>
        <label><input type="checkbox" defaultChecked={lane?.coldChain}/> Cold chain required</label>
        <label><input type="checkbox" defaultChecked={lane?.customs}/> Customs required</label>
        <label><input type="checkbox" defaultChecked={lane?.active ?? true}/> Active</label>
      </div>
      <Field label="Notes"><textarea defaultValue={lane?.notes} maxLength={300}/></Field>
    </Modal>
  );
};

// -------- M-07 · MODAL-RATE-CARD-UPLOAD --------
const RateCardUploadModal = ({ open, onClose, data }) => {
  const [step, setStep] = React.useState("upload");
  const [completed, setCompleted] = React.useState(new Set());
  const steps = [
    { key: "upload",  label: "Upload file" },
    { key: "mapping", label: "Column mapping" },
    { key: "preview", label: "Preview" },
    { key: "confirm", label: "Confirm" },
  ];
  const goNext = () => { setCompleted(new Set([...completed, step])); setStep(step === "upload" ? "mapping" : step === "mapping" ? "preview" : step === "preview" ? "confirm" : "confirm"); };
  const goBack = () => setStep(step === "confirm" ? "preview" : step === "preview" ? "mapping" : "upload");

  return (
    <Modal open={open} onClose={onClose}
      title={`Upload Rate Card — ${data?.id || "LN-?"}`}
      size="default"
      foot={step === "confirm" ? <>
        <button className="btn btn-ghost btn-sm" onClick={goBack}>← Back</button>
        <span className="spacer"></span>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm">Upload</button>
      </> : <>
        {step !== "upload" && <button className="btn btn-ghost btn-sm" onClick={goBack}>← Back</button>}
        <span className="spacer"></span>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={goNext}>Next →</button>
      </>}
    >
      <Stepper steps={steps} current={step} completed={completed}/>

      {step === "upload" && (
        <div style={{marginTop:14}}>
          <div style={{border:"2px dashed var(--border)", borderRadius:6, padding:30, textAlign:"center", cursor:"pointer", background:"var(--gray-050)"}}>
            <div style={{fontSize:30, marginBottom:10}}>📁</div>
            <div style={{fontSize:13, fontWeight:600}}>Drop CSV or XLSX here</div>
            <div className="muted" style={{fontSize:11, marginTop:4}}>Max 5MB · <a style={{color:"var(--blue)"}}>Download template</a></div>
          </div>
        </div>
      )}

      {step === "mapping" && (
        <div style={{marginTop:14}}>
          <div className="muted" style={{fontSize:11, marginBottom:10}}>Map each CSV column to a rate card field.</div>
          <table>
            <thead><tr><th>CSV Column</th><th>Target Field</th></tr></thead>
            <tbody>
              <tr><td className="mono">Column A</td><td><select><option>Carrier</option></select></td></tr>
              <tr><td className="mono">Column B</td><td><select><option>Rate Type</option></select></td></tr>
              <tr><td className="mono">Column C</td><td><select><option>Rate Value</option></select></td></tr>
              <tr><td className="mono">Column D</td><td><select><option>Currency</option></select></td></tr>
              <tr><td className="mono">Column E</td><td><select><option>Effective From</option></select></td></tr>
            </tbody>
          </table>
        </div>
      )}

      {step === "preview" && (
        <div style={{marginTop:14}}>
          <div className="muted" style={{fontSize:11, marginBottom:6}}>First 5 rows:</div>
          <table>
            <thead><tr><th>Carrier</th><th>Type</th><th>Rate</th><th>Currency</th><th>From</th></tr></thead>
            <tbody>
              <tr><td>DHL</td><td>per km</td><td className="num mono">£0.42</td><td>GBP</td><td>2026-01-01</td></tr>
              <tr><td>DHL</td><td>per kg</td><td className="num mono">£1.20</td><td>GBP</td><td>2026-02-15</td></tr>
              <tr><td>DB Schenker</td><td>per km</td><td className="num mono">£0.40</td><td>GBP</td><td>2026-01-01</td></tr>
            </tbody>
          </table>
        </div>
      )}

      {step === "confirm" && (
        <Summary rows={[
          { label: "Lane", value: data?.id || "LN-001" },
          { label: "Rates to import", value: "23" },
          { label: "File", value: "lane-001-rates-2026Q2.csv" },
        ]}/>
      )}
    </Modal>
  );
};

// -------- M-08 · MODAL-SITE-CONFIG-OVERRIDE --------
const SiteConfigOverrideModal = ({ open, onClose, data }) => {
  const [key, setKey] = React.useState(data?.key || "fefo_strategy");
  const existing = MS_SITE_CONFIG.find(c => c.key === key);
  return (
    <Modal open={open} onClose={onClose}
      title={`Set Config Override — ${data?.site?.code || "SITE"}`}
      size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm">Save Override</button>
      </>}
    >
      <Field label="Setting Key" required>
        <select value={key} onChange={e=>setKey(e.target.value)}>
          <option value="fefo_strategy">fefo_strategy</option>
          <option value="default_currency">default_currency</option>
          <option value="language">language</option>
          <option value="quality_check_frequency">quality_check_frequency</option>
          <option value="shift_pattern">shift_pattern</option>
          <option value="expiry_red_threshold">expiry_red_threshold</option>
        </select>
      </Field>
      <div style={{padding:10, background:"var(--gray-050)", borderRadius:4, fontSize:11, marginBottom:10}}>
        <b>Organization default (L1):</b> <span className="mono">{existing?.baseValue || "—"}</span>
      </div>
      <Field label="Override Value" required>
        {key === "fefo_strategy" && <select defaultValue="fefo_strict"><option>fefo_advisory</option><option>fefo_strict</option></select>}
        {key === "default_currency" && <select defaultValue="EUR"><option>GBP</option><option>EUR</option><option>PLN</option><option>RON</option></select>}
        {key === "language" && <select defaultValue="de"><option>en</option><option>de</option><option>pl</option><option>ro</option></select>}
        {(key === "quality_check_frequency" || key === "shift_pattern" || key === "expiry_red_threshold") && <input defaultValue="" placeholder="Enter override value"/>}
      </Field>
      <Field label="Effective From">
        <input type="date" defaultValue="2026-04-21"/>
      </Field>
      <Field label="Notes">
        <textarea maxLength={300} placeholder="Why is this override needed?"/>
      </Field>
    </Modal>
  );
};

// -------- M-09 · MODAL-PERMISSION-BULK-ASSIGN --------
const AssignUserModal = ({ open, onClose, data }) => {
  const [tab, setTab] = React.useState("single");
  return (
    <Modal open={open} onClose={onClose}
      title="Assign User to Site"
      size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm">Assign</button>
      </>}
    >
      <div className="ms-tabs" style={{marginBottom:10, marginLeft:-4, marginRight:-4}}>
        <button className={tab === "single" ? "on" : ""} onClick={()=>setTab("single")}>Single Assignment</button>
        <button className={tab === "bulk" ? "on" : ""} onClick={()=>setTab("bulk")}>Bulk Assign (CSV)</button>
      </div>

      {tab === "single" && (
        <>
          <Field label="User" required>
            <select defaultValue={data?.user?.id || ""}>
              <option value="">Select user…</option>
              {MS_USERS.map(u => <option key={u.id} value={u.id}>{u.name} — {u.email}</option>)}
            </select>
          </Field>
          <Field label="Site" required>
            <select defaultValue={data?.site?.id || ""}>
              <option value="">Select site…</option>
              {MS_SITES.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
            </select>
          </Field>
          <Field label="Role at this site" required>
            <select>
              <option>site_manager</option>
              <option>planner</option>
              <option>warehouse_operator</option>
              <option>quality_manager</option>
              <option>quality_lead</option>
              <option>auditor</option>
              <option>viewer</option>
            </select>
          </Field>
          <Field label="Set as Primary Site">
            <label style={{fontSize:12}}><input type="checkbox"/> Make this the user's primary site</label>
          </Field>
          <Field label="Notes"><input maxLength={200}/></Field>
        </>
      )}

      {tab === "bulk" && (
        <>
          <div style={{border:"2px dashed var(--border)", borderRadius:6, padding:20, textAlign:"center", background:"var(--gray-050)"}}>
            <div style={{fontSize:24, marginBottom:6}}>📁</div>
            <div style={{fontSize:13, fontWeight:600}}>Drop CSV file here</div>
            <div className="muted" style={{fontSize:11, marginTop:4}}>Columns: <span className="mono">User Email, Site Code, Role</span> · <a style={{color:"var(--blue)"}}>Download template</a></div>
          </div>
          <div className="muted" style={{fontSize:11, marginTop:8}}>After upload: column mapping → preview → confirm.</div>
        </>
      )}
    </Modal>
  );
};

// -------- M-10 · MODAL-SITE-DECOMMISSION --------
const DecommissionModal = ({ open, onClose, data }) => {
  const [confirmCode, setConfirmCode] = React.useState("");
  const siteCode = data?.code || "";
  const openWOs = data?.activeWOs || 0;
  const openISTs = MS_ISTS.filter(t => (t.from === data?.id || t.to === data?.id) && t.status !== "closed" && t.status !== "cancelled").length;
  const holds = data?.qualityHolds || 0;
  const unassigned = 0;

  const allGreen = openWOs === 0 && openISTs === 0 && holds === 0 && unassigned === 0;
  const canConfirm = allGreen && confirmCode === siteCode;

  return (
    <Modal open={open} onClose={onClose}
      title={`Decommission ${data?.name || "Site"}`}
      size="default"
      dismissible={false}
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-danger btn-sm" disabled={!canConfirm}>Confirm Decommission</button>
      </>}
    >
      <div className="alert-red alert-box" style={{fontSize:12, marginBottom:10}}>
        <span>⚠</span>
        <div>Decommissioning a site is a significant operation. All operational data will be archived and users will lose access. Historical records are retained for audit per the 7-year retention policy.</div>
      </div>

      <h4 style={{fontSize:12, textTransform:"uppercase", color:"var(--muted)", letterSpacing:"0.04em", margin:"10px 0 6px"}}>Impact summary</h4>
      <table>
        <tbody>
          <tr><td>Active users</td><td className="num mono" style={{color: data?.users > 0 ? "var(--red-700)" : "var(--green-700)"}}>{data?.users || 0}</td></tr>
          <tr><td>Open work orders</td><td className="num mono" style={{color: openWOs > 0 ? "var(--red-700)" : "var(--green-700)"}}>{openWOs}</td></tr>
          <tr><td>In-transit ISTs</td><td className="num mono" style={{color: openISTs > 0 ? "var(--red-700)" : "var(--green-700)"}}>{openISTs}</td></tr>
          <tr><td>Quality holds</td><td className="num mono" style={{color: holds > 0 ? "var(--red-700)" : "var(--green-700)"}}>{holds}</td></tr>
        </tbody>
      </table>

      <h4 style={{fontSize:12, textTransform:"uppercase", color:"var(--muted)", letterSpacing:"0.04em", margin:"14px 0 6px"}}>Pre-conditions</h4>
      <div style={{fontSize:12, padding:10, background:"var(--gray-050)", borderRadius:4}}>
        <div style={{color: openWOs === 0 ? "var(--green-700)" : "var(--red-700)"}}>{openWOs === 0 ? "✓" : "✕"} No open work orders {openWOs > 0 && <a style={{color:"var(--blue)", cursor:"pointer"}}> — Close {openWOs} WO(s) →</a>}</div>
        <div style={{color: openISTs === 0 ? "var(--green-700)" : "var(--red-700)"}}>{openISTs === 0 ? "✓" : "✕"} No in-transit ISTs {openISTs > 0 && <a style={{color:"var(--blue)", cursor:"pointer"}}> — Manage {openISTs} IST(s) →</a>}</div>
        <div style={{color: holds === 0 ? "var(--green-700)" : "var(--red-700)"}}>{holds === 0 ? "✓" : "✕"} No open quality holds</div>
        <div style={{color: unassigned === 0 ? "var(--green-700)" : "var(--red-700)"}}>{unassigned === 0 ? "✓" : "✕"} All users reassigned to other sites</div>
      </div>

      {allGreen && (
        <>
          <Field label={`Type the site code to confirm: ${siteCode}`} required>
            <input value={confirmCode} onChange={e=>setConfirmCode(e.target.value)} placeholder={siteCode} style={{fontFamily:"var(--font-mono)"}}/>
          </Field>
        </>
      )}

      {!allGreen && <div className="muted" style={{fontSize:11, marginTop:10}}>Resolve all open items above before decommissioning.</div>}
    </Modal>
  );
};

// -------- M-11 · MODAL-ACTIVATION-CONFIRM --------
const ActivationConfirmModal = ({ open, onClose, data }) => {
  return (
    <Modal open={open} onClose={onClose}
      title="Confirm Multi-Site Activation"
      size="default"
      dismissible={false}
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-danger btn-sm">Confirm Activation</button>
      </>}
    >
      <div className="alert-amber alert-box" style={{fontSize:12, marginBottom:10}}>
        <span>⚠</span><div>This will apply Row-Level Security policies to <b>20 operational tables</b> and activate site-scoped data isolation. This operation takes approximately 30–60 seconds.</div>
      </div>
      <Summary rows={[
        { label: "Tables affected", value: "20", emphasis: true },
        { label: "Users activated", value: "28" },
        { label: "Sites activated", value: "3" },
        { label: "Estimated duration", value: "30–60 seconds" },
      ]}/>
      <div style={{marginTop:10, padding:10, background:"var(--gray-050)", borderRadius:4, fontSize:11, fontFamily:"var(--font-mono)"}}>
        <div>Applying RLS policies... (5/20 tables)</div>
        <div style={{marginTop:4, color:"var(--muted)"}}>Updating user contexts...</div>
      </div>
    </Modal>
  );
};

// -------- M-12 · MODAL-ROLLBACK-CONFIRM --------
const RollbackModal = ({ open, onClose, data }) => {
  const [typed, setTyped] = React.useState("");
  return (
    <Modal open={open} onClose={onClose}
      title="Roll Back to Single-Site Mode"
      size="default"
      dismissible={false}
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-danger btn-sm" disabled={typed !== "ROLLBACK"}>Confirm Rollback</button>
      </>}
    >
      <div className="alert-red alert-box" style={{fontSize:12, marginBottom:10}}>
        <span>⚠</span><div>Rolling back will remove site-level data isolation (RLS policies revert to org-scoped). Users will regain access to all data regardless of site assignment.</div>
      </div>
      <div className="muted" style={{fontSize:11, marginBottom:10}}>This can only be done from <b>Dual Run</b> state. Rollback from <b>activated</b> requires contacting support.</div>
      <Field label={`Type 'ROLLBACK' to confirm`} required>
        <input value={typed} onChange={e=>setTyped(e.target.value)} placeholder="ROLLBACK" style={{fontFamily:"var(--font-mono)"}}/>
      </Field>
    </Modal>
  );
};

// -------- MODAL-PROMOTE-ENV (L1→L2→L3 config promotion) --------
const PromoteEnvModal = ({ open, onClose, data }) => {
  const [reason, setReason] = React.useState("");
  return (
    <Modal open={open} onClose={onClose}
      title={`Promote to ${data?.level || "L2"}`}
      size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={reason.length < 10}>Promote</button>
      </>}
    >
      <div className="alert-blue alert-box" style={{fontSize:12, marginBottom:10}}>
        <span>ⓘ</span>
        <div>Promoting to <b>{data?.level}</b> applies selected overrides to the target scope (site or line). Org-baseline values are preserved.</div>
      </div>

      <div className="env-ladder">
        <div className="env-rung active"><div className="er-level">L1</div><div className="er-name">Org baseline</div><div className="er-stats">71 entities</div></div>
        <div className="env-arrow">→</div>
        <div className="env-rung active"><div className="er-level">{data?.level || "L2"}</div><div className="er-name">Target</div><div className="er-stats">Being promoted</div></div>
      </div>

      <Field label="Target scope" required>
        <select>
          {data?.level === "L2" ? MS_SITES.filter(s=>s.active).map(s => <option key={s.id}>{s.code} — {s.name}</option>) : [<option key="1">LINE-1 (FRZ-UK)</option>, <option key="4">LINE-4 (FRZ-UK)</option>]}
        </select>
      </Field>
      <Field label="Keys to promote" help="Multi-select">
        <select multiple style={{minHeight:90}}>
          <option>fefo_strategy</option>
          <option>quality_check_frequency</option>
          <option>default_currency</option>
          <option>language</option>
          <option>shift_pattern</option>
        </select>
      </Field>
      <Field label="Reason" required>
        <ReasonInput value={reason} onChange={setReason} minLength={10} placeholder="Why is this promotion needed?"/>
      </Field>
    </Modal>
  );
};

// ============ MODAL CATALOG (for gallery) ============
const MODAL_CATALOG = [
  { key: "siteCreate",       name: "MODAL-SITE-CREATE / EDIT",     pattern: "4-step wizard", comp: SiteCreateModal },
  { key: "istCancel",        name: "MODAL-IST-CANCEL",             pattern: "Destructive with reason", comp: ISTCancelModal },
  { key: "istAmend",         name: "MODAL-IST-AMEND",              pattern: "Simple form", comp: ISTAmendModal },
  { key: "replicationRetry", name: "MODAL-REPLICATION-RETRY",      pattern: "Priority confirm", comp: ReplicationRetryModal },
  { key: "conflict",         name: "MODAL-CONFLICT-RESOLVE",       pattern: "Side-by-side diff (wide)", comp: ConflictResolveModal },
  { key: "laneCreate",       name: "MODAL-LANE-CREATE / EDIT",     pattern: "Simple form", comp: LaneCreateModal },
  { key: "rateCard",         name: "MODAL-RATE-CARD-UPLOAD",       pattern: "4-step CSV wizard", comp: RateCardUploadModal },
  { key: "configOverride",   name: "MODAL-SITE-CONFIG-OVERRIDE",   pattern: "Dynamic field form", comp: SiteConfigOverrideModal },
  { key: "assignUser",       name: "MODAL-PERMISSION-BULK-ASSIGN", pattern: "Form + bulk CSV tab", comp: AssignUserModal },
  { key: "decommission",     name: "MODAL-SITE-DECOMMISSION",      pattern: "Destructive type-to-confirm", comp: DecommissionModal },
  { key: "activationConfirm",name: "MODAL-ACTIVATION-CONFIRM",     pattern: "Destructive confirm", comp: ActivationConfirmModal },
  { key: "rollback",         name: "MODAL-ROLLBACK-CONFIRM",       pattern: "Destructive type-to-confirm", comp: RollbackModal },
  { key: "promote",          name: "MODAL-PROMOTE-ENV (L1→L2→L3)", pattern: "Confirm w/ reason", comp: PromoteEnvModal },
];

// ============ Modal Gallery screen ============
const ModalGallery = ({ onNav }) => {
  const [open, setOpen] = React.useState(null);
  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Multi-Site</a> · Modal gallery</div>
          <h1 className="page-title">Modal Gallery</h1>
          <div className="muted" style={{fontSize:12}}>{MODAL_CATALOG.length} components · follows <span className="mono">_shared/MODAL-SCHEMA.md</span></div>
        </div>
      </div>

      <div className="alert-blue alert-box" style={{marginBottom:14, fontSize:12}}>
        <span>ⓘ</span>
        <div>
          <b>Click any card to open the modal.</b> Each modal uses shared primitives (<span className="mono">Modal</span>, <span className="mono">Stepper</span>, <span className="mono">Field</span>, <span className="mono">ReasonInput</span>, <span className="mono">Summary</span>).
          <br/>Signature modal: <span className="mono">MODAL-CONFLICT-RESOLVE</span> — wide diff with source/site radio selection, bulk actions, reason-coded resolution.
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
        <m.comp key={m.key} open={open === m.key} onClose={()=>setOpen(null)} data={m.key === "decommission" ? MS_SITES[3] : (m.key === "istCancel" || m.key === "istAmend") ? MS_ISTS[0] : (m.key === "rateCard" ? MS_LANES[0] : (m.key === "conflict" ? MS_MDS_ROWS[0] : (m.key === "siteCreate" ? {} : (m.key === "promote" ? {level: "L2"} : null))))}/>
      ))}
    </>
  );
};

Object.assign(window, {
  SiteCreateModal, ISTCancelModal, ISTAmendModal, ReplicationRetryModal,
  ConflictResolveModal, LaneCreateModal, RateCardUploadModal, SiteConfigOverrideModal,
  AssignUserModal, DecommissionModal, ActivationConfirmModal, RollbackModal, PromoteEnvModal,
  ModalGallery, MODAL_CATALOG,
});
