// ============================================================
// SETTINGS MODALS — follows ../_shared/MODAL-SCHEMA.md (Pattern A)
//
// Modal inventory:
//   SM-01 RuleDryRunModal            — preview / compare (dry-run rule against sample input)
//   SM-02 FlagEditModal              — simple form + audit reason (L2/L3 flag edit)
//   SM-03 SchemaViewModal            — simple view of a column definition
//   SM-04 EmailTemplateEditModal     — wizard with variable picker
//   SM-05 PromoteToL2Modal           — wizard with diff preview (artefact promotion)
//   SM-06 UserInviteModal            — simple form
//   SM-07 RoleAssignModal            — picker-backed simple form
//   SM-08 D365TestConnectionModal    — confirm + async result
//   SM-09 PasswordResetModal         — destructive confirm
//   SM-10 DeleteReferenceDataModal   — destructive confirm (type-to-confirm)
// ============================================================

// -------- SM-01: RuleDryRunModal --------
const RuleDryRunModal = ({ open, onClose, data }) => {
  const rule = data?.rule || window.SETTINGS_RULES[0];
  const [input, setInput] = React.useState(JSON.stringify({ wo_id: "WO-2026-00412", from: "PLANNED", to: "RELEASED" }, null, 2));
  const [running, setRunning] = React.useState(false);
  const [result,  setResult]  = React.useState(null);

  const valid = (() => { try { JSON.parse(input); return true; } catch { return false; } })();

  const run = async () => {
    setRunning(true); setResult(null);
    await new Promise(r => setTimeout(r, 600));
    setResult({
      result: "pass",
      trace: ["guard: reservation_green → ✓", "guard: crew_assigned → ✓", "transition: PLANNED → RELEASED applied"],
      at: new Date().toISOString().slice(0,16).replace("T", " ")
    });
    setRunning(false);
  };

  return (
    <Modal open={open} onClose={onClose}
      title={"Dry-run — " + (rule?.code || "rule")}
      subtitle="Preview the rule evaluation against sample input without persisting."
      size="wide"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
        <button className="btn btn-primary btn-sm" disabled={!valid || running} onClick={run}>{running ? "Running…" : "Run dry-run"}</button>
      </>}>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:14}}>
        <Field label="Sample input (JSON)" required error={!valid ? "Invalid JSON" : undefined}>
          <textarea value={input} onChange={e=>setInput(e.target.value)} style={{minHeight:220, fontFamily:"var(--font-mono)", fontSize:11}} />
        </Field>
        <Field label="Result">
          {!result && !running && <div className="muted" style={{padding:20, textAlign:"center", background:"var(--gray-050)", borderRadius:6}}>Run the rule to see the result.</div>}
          {running && <div className="muted" style={{padding:20, textAlign:"center"}}>⟳ Evaluating…</div>}
          {result && (
            <div>
              <div style={{marginBottom:8}}>
                {result.result === "pass" && <span className="badge badge-green">PASS</span>}
                {result.result === "fail" && <span className="badge badge-red">FAIL</span>}
                <span className="muted mono" style={{marginLeft:8, fontSize:11}}>{result.at}</span>
              </div>
              <pre className="mono" style={{background:"var(--gray-100)", padding:10, borderRadius:6, fontSize:11, margin:0}}>
{result.trace.map((l,i) => "  " + l).join("\n")}
              </pre>
            </div>
          )}
        </Field>
      </div>
    </Modal>
  );
};

// -------- SM-02: FlagEditModal --------
const FlagEditModal = ({ open, onClose, data }) => {
  const flag = data?.flag || window.SETTINGS_FLAGS[0];
  const [on,   setOn]   = React.useState(flag.on);
  const [pct,  setPct]  = React.useState(flag.rollout);
  const [reason, setReason] = React.useState("");
  const reasonValid = reason.length >= 10;

  return (
    <Modal open={open} onClose={onClose}
      title={"Edit flag — " + flag.code}
      subtitle={flag.desc}
      size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!reasonValid} onClick={onClose}>Save change</button>
      </>}>
      {flag.tenant === "L1-core" && (
        <div className="alert alert-amber" style={{marginBottom:10, fontSize:12}}>
          <b>L1-core flag.</b> Changes are routed through the promotion workflow. Raise an L1 promotion request instead of editing directly.
        </div>
      )}
      <Field label="Status" required>
        <div style={{display:"flex", gap:8, alignItems:"center"}}>
          <Toggle on={on} onChange={setOn}/>
          <span className="muted" style={{fontSize:12}}>{on ? "ON — flag is live for matching users" : "OFF — flag is disabled"}</span>
        </div>
      </Field>
      <Field label="Rollout %" help="Percentage of users that see the ON state.">
        <input type="range" min="0" max="100" value={pct} onChange={e=>setPct(+e.target.value)} style={{width:"100%"}}/>
        <div className="mono" style={{fontSize:11, marginTop:4}}>{pct}%</div>
      </Field>
      <Field label="Audit reason" required>
        <ReasonInput value={reason} onChange={setReason} minLength={10} placeholder="Why is this flag changing? (audit-logged)"/>
      </Field>
    </Modal>
  );
};

// -------- SM-03: SchemaViewModal --------
const SchemaViewModal = ({ open, onClose, data }) => {
  const col = data?.col || window.SETTINGS_SCHEMA[0];
  return (
    <Modal open={open} onClose={onClose}
      title={"Column — " + col.col}
      subtitle={col.label + " (" + col.table + ")"}
      size="wide"
      foot={<><button className="btn btn-secondary btn-sm" onClick={onClose}>Close</button></>}>
      <Summary rows={[
        { label: "Column code", value: col.col },
        { label: "Label",        value: col.label, mono: false },
        { label: "Table",        value: col.table },
        { label: "Dept",         value: col.dept, mono: false },
        { label: "Data type",    value: col.type },
        { label: "Tier",         value: col.tier },
        { label: "Storage",      value: col.storage },
        { label: "Required",     value: col.req ? "Yes" : "No", mono: false },
        { label: "Status",       value: col.status, mono: false },
        { label: "Schema version", value: "v" + col.version, emphasis: true }
      ]}/>
      <div className="alert alert-blue" style={{marginTop:10, fontSize:11}}>
        {col.tier === "L1"
          ? "L1 columns are universal. Use the schema promotion wizard (SM-05) to raise a tier-change request."
          : "L2/L3 columns can be modified via the schema edit wizard."}
      </div>
    </Modal>
  );
};

// -------- SM-04: EmailTemplateEditModal (wizard w/ variable picker) --------
const EmailTemplateEditModal = ({ open, onClose, data }) => {
  const tpl = data?.tpl || { code: "", name: "", subject: "", body: "", active: true, activeTo: [] };
  const [step,  setStep]  = React.useState("meta");
  const [done,  setDone]  = React.useState(new Set());
  const [code,  setCode]  = React.useState(tpl.code);
  const [name,  setName]  = React.useState(tpl.name);
  const [subject, setSubject] = React.useState(tpl.subject);
  const [body,  setBody]  = React.useState(tpl.body);
  const [to,    setTo]    = React.useState((tpl.activeTo || []).join("; "));
  const [submitting, setSubmitting] = React.useState(false);

  const steps = [
    { key: "meta", label: "Metadata" },
    { key: "body", label: "Subject + body" },
    { key: "review", label: "Review" }
  ];

  const vMeta = /^[a-z0-9_]{3,}$/.test(code) && name.length >= 3;
  const vBody = subject.length >= 3 && body.length >= 10;

  const next = () => {
    setDone(new Set([...done, step]));
    setStep(step === "meta" ? "body" : step === "body" ? "review" : "review");
  };
  const back = () => setStep(step === "review" ? "body" : "meta");

  const insertVar = (v) => setBody(body + v);

  const submit = async () => {
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 500));
    setSubmitting(false);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose}
      title={tpl.code ? "Edit template — " + tpl.code : "New email template"}
      size="wide"
      foot={step === "meta" ? <>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!vMeta} onClick={next}>Next →</button>
      </> : step === "body" ? <>
        <button className="btn btn-ghost btn-sm" onClick={back}>← Back</button>
        <span className="spacer" style={{flex:1}}></span>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!vBody} onClick={next}>Next: review →</button>
      </> : <>
        <button className="btn btn-ghost btn-sm" onClick={back}>← Back</button>
        <span className="spacer" style={{flex:1}}></span>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={submit} disabled={submitting}>{submitting ? "Saving…" : "Save template"}</button>
      </>}>
      <Stepper steps={steps} current={step} completed={done}/>

      {step === "meta" && (
        <div style={{marginTop:14}}>
          <Field label="Trigger code" required help="Machine-readable. snake_case, min 3 chars." error={code && !/^[a-z0-9_]{3,}$/.test(code) ? "Must be snake_case, min 3 chars" : undefined}>
            <input value={code} onChange={e=>setCode(e.target.value)} className="mono" placeholder="po_to_supplier"/>
          </Field>
          <Field label="Display name" required>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="Purchase order → supplier"/>
          </Field>
          <Field label="Active recipients (To)" help="Semicolon-separated. Supports merge fields like {{supplier.email}}.">
            <input value={to} onChange={e=>setTo(e.target.value)} placeholder="{{supplier.email}}; procurement@…" />
          </Field>
        </div>
      )}

      {step === "body" && (
        <div style={{marginTop:14, display:"grid", gridTemplateColumns:"1fr 260px", gap:14}}>
          <div>
            <Field label="Subject" required help="Mustache variables allowed: {{var.name}}">
              <input value={subject} onChange={e=>setSubject(e.target.value)}/>
            </Field>
            <Field label="Body" required help="Mustache template.">
              <textarea value={body} onChange={e=>setBody(e.target.value)} style={{minHeight:220, fontFamily:"var(--font-mono)", fontSize:12}}/>
            </Field>
          </div>
          <div>
            <div style={{fontSize:11, textTransform:"uppercase", letterSpacing:0.05, color:"var(--muted)", marginBottom:6}}>Variable picker</div>
            <div style={{border:"1px solid var(--border)", borderRadius:6, maxHeight:320, overflow:"auto"}}>
              {window.SETTINGS_EMAIL_VARIABLES.map(g => (
                <div key={g.group}>
                  <div style={{padding:"6px 10px", background:"var(--gray-100)", fontSize:10, textTransform:"uppercase", letterSpacing:0.05, fontWeight:600}}>{g.group}</div>
                  {g.vars.map(v => (
                    <div key={v.name} onClick={()=>insertVar(v.name)} style={{padding:"6px 10px", borderTop:"1px solid var(--border)", cursor:"pointer", fontSize:11}}>
                      <code style={{color:"var(--blue)"}}>{v.name}</code>
                      <div className="muted" style={{fontSize:10, marginTop:1}}>{v.desc}</div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === "review" && (
        <div style={{marginTop:14}}>
          <Summary rows={[
            { label: "Trigger code",  value: code },
            { label: "Display name",   value: name, mono: false },
            { label: "To (active)",    value: to || "—", mono: false },
            { label: "Subject",        value: subject, mono: false },
            { label: "Body length",    value: body.length + " chars", emphasis: true }
          ]}/>
          <div style={{marginTop:10, background:"var(--gray-050)", border:"1px solid var(--border)", borderRadius:6, padding:14}}>
            <div style={{fontSize:11, color:"var(--muted)", textTransform:"uppercase", letterSpacing:0.05, marginBottom:6}}>Rendered preview (sample data)</div>
            <div style={{fontWeight:600, fontSize:13, marginBottom:4}}>{subject.replace(/\{\{[^}]+\}\}/g, "…")}</div>
            <pre className="mono" style={{background:"#fff", padding:10, borderRadius:4, fontSize:11, margin:0, maxHeight:140, overflow:"auto"}}>
{body.replace(/\{\{[^}]+\}\}/g, "…")}
            </pre>
          </div>
        </div>
      )}
    </Modal>
  );
};

// -------- SM-05: PromoteToL2Modal (wizard w/ diff preview) --------
const PromoteToL2Modal = ({ open, onClose, data }) => {
  const p = data?.promotion || null;
  const [step, setStep] = React.useState("select");
  const [done, setDone] = React.useState(new Set());
  const [artefact, setArtefact] = React.useState(p?.artefact || "");
  const [target,   setTarget]   = React.useState(p?.to || "L2-local");
  const [reason,   setReason]   = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const steps = [
    { key: "select", label: "Select artefact" },
    { key: "diff",   label: "Preview diff" },
    { key: "review", label: "Confirm + reason" }
  ];

  const vSelect = artefact.length >= 3;
  const vReason = reason.length >= 10;

  const next = () => {
    setDone(new Set([...done, step]));
    setStep(step === "select" ? "diff" : step === "diff" ? "review" : "review");
  };
  const back = () => setStep(step === "review" ? "diff" : "select");

  const submit = async () => {
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 700));
    setSubmitting(false);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose}
      title={p ? "Promotion " + p.id : "Start L1→L2→L3 promotion"}
      subtitle={p?.diff || "Promote a rule, flag, schema column or email template to a wider environment."}
      size="wide"
      foot={step === "select" ? <>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!vSelect} onClick={next}>Next: preview →</button>
      </> : step === "diff" ? <>
        <button className="btn btn-ghost btn-sm" onClick={back}>← Back</button>
        <span className="spacer" style={{flex:1}}></span>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={next}>Next: confirm →</button>
      </> : <>
        <button className="btn btn-ghost btn-sm" onClick={back}>← Back</button>
        <span className="spacer" style={{flex:1}}></span>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!vReason || submitting} onClick={submit}>{submitting ? "Submitting…" : "Submit promotion"}</button>
      </>}>
      <Stepper steps={steps} current={step} completed={done}/>

      {step === "select" && (
        <div style={{marginTop:14}}>
          <Field label="Artefact to promote" required help="Rule / flag / schema / email template. Format: category.code.">
            <input value={artefact} onChange={e=>setArtefact(e.target.value)} className="mono" placeholder="rules.cycle_count_variance_v1"/>
          </Field>
          <Field label="Target stage" required>
            <select value={target} onChange={e=>setTarget(e.target.value)}>
              <option value="L2-local">L2 · Shared local</option>
              <option value="L1-core">L1 · Core / universal</option>
            </select>
          </Field>
          <div className="alert alert-blue" style={{marginTop:10, fontSize:12}}>
            L1 promotions are reviewed by Monopilot SRE. Turnaround: 3–5 business days.
          </div>
        </div>
      )}

      {step === "diff" && (
        <div style={{marginTop:14}}>
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:14}}>
            <div>
              <div style={{fontSize:11, color:"var(--muted)", marginBottom:4, textTransform:"uppercase"}}>Current (before)</div>
              <pre className="mono" style={{background:"var(--gray-100)", padding:10, borderRadius:6, fontSize:11, margin:0, minHeight:180}}>
{`{
  "tier": "L2-local",
  "variance_threshold": 0.05,
  "audit_required_above": 0.10
}`}
              </pre>
            </div>
            <div>
              <div style={{fontSize:11, color:"var(--muted)", marginBottom:4, textTransform:"uppercase"}}>Target ({target})</div>
              <pre className="mono" style={{background:"#ecfccb", padding:10, borderRadius:6, fontSize:11, margin:0, minHeight:180}}>
{`{
  "tier": "${target}",
  "variance_threshold": 0.10,
  "audit_required_above": 0.10
}`}
              </pre>
            </div>
          </div>
          <div className="alert alert-amber" style={{marginTop:10, fontSize:12}}>
            <b>Impact:</b> This migration affects <b>12 tenants</b>. Existing L3 overrides will be preserved.
          </div>
        </div>
      )}

      {step === "review" && (
        <div style={{marginTop:14}}>
          <Summary rows={[
            { label: "Artefact",    value: artefact },
            { label: "From → To",    value: (p?.from || "L3-tenant") + " → " + target, mono: false, emphasis: true },
            { label: "Affects",      value: p?.affects || "12 tenants", mono: false }
          ]}/>
          <Field label="Justification (audit-logged)" required>
            <ReasonInput value={reason} onChange={setReason} minLength={10} placeholder="Why should this be promoted now?"/>
          </Field>
        </div>
      )}
    </Modal>
  );
};

// -------- SM-06: UserInviteModal --------
const UserInviteModal = ({ open, onClose }) => {
  const [email, setEmail] = React.useState("");
  const [name,  setName]  = React.useState("");
  const [role,  setRole]  = React.useState("Operator");
  const [msg,   setMsg]   = React.useState("");
  const vEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

  return (
    <Modal open={open} onClose={onClose} title="Invite team member"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!vEmail} onClick={onClose}>Send invitation</button>
      </>}>
      <Field label="Email address" required error={email && !vEmail ? "Invalid email format" : undefined}>
        <input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoFocus/>
      </Field>
      <Field label="Full name (optional)">
        <input value={name} onChange={e=>setName(e.target.value)}/>
      </Field>
      <Field label="Role" required>
        <select value={role} onChange={e=>setRole(e.target.value)}>
          {window.SETTINGS_ROLES.map(r => <option key={r}>{r}</option>)}
        </select>
      </Field>
      <Field label="Custom message (optional)" help="Included in the invitation email.">
        <textarea value={msg} onChange={e=>setMsg(e.target.value)} maxLength={500} style={{minHeight:70}}/>
      </Field>
    </Modal>
  );
};

// -------- SM-07: RoleAssignModal --------
const RoleAssignModal = ({ open, onClose }) => {
  const [user, setUser] = React.useState(null);
  const [role, setRole] = React.useState("");
  const [q,    setQ]    = React.useState("");
  const users = window.SETTINGS_USERS.filter(u => !q || u.name.toLowerCase().includes(q.toLowerCase()) || u.email.includes(q.toLowerCase()));
  const valid = user && role && role !== user.role;

  return (
    <Modal open={open} onClose={onClose} title="Assign role" subtitle="Pick a user, then the new role." size="wide"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!valid} onClick={onClose}>Assign role</button>
      </>}>
      <Field label="Search user">
        <input placeholder="Name or email…" value={q} onChange={e=>setQ(e.target.value)} autoFocus/>
      </Field>
      <div style={{border:"1px solid var(--border)", borderRadius:6, maxHeight:220, overflow:"auto", marginBottom:12}}>
        {users.slice(0, 8).map(u => (
          <div key={u.id} onClick={()=>setUser(u)}
               style={{padding:"8px 12px", borderTop:"1px solid var(--border)", display:"flex", alignItems:"center", gap:10, cursor:"pointer", background: user?.id === u.id ? "var(--blue-050)" : "transparent"}}>
            <div className={"avatar " + u.color} style={{width:28, height:28, fontSize:11}}>{u.init}</div>
            <div>
              <div style={{fontSize:13, fontWeight:500}}>{u.name}</div>
              <div className="muted" style={{fontSize:11}}>{u.email} · current: {u.role}</div>
            </div>
          </div>
        ))}
      </div>
      <Field label="New role" required>
        <select value={role} onChange={e=>setRole(e.target.value)}>
          <option value="">— pick role —</option>
          {window.SETTINGS_ROLES.map(r => <option key={r}>{r}</option>)}
        </select>
      </Field>
      {valid && user && <div className="alert alert-blue" style={{fontSize:12}}>Assigning <b>{role}</b> to <b>{user.name}</b>. Previous role <b>{user.role}</b> will be replaced.</div>}
    </Modal>
  );
};

// -------- SM-08: D365TestConnectionModal --------
const D365TestConnectionModal = ({ open, onClose }) => {
  const [phase, setPhase] = React.useState("idle"); // idle | running | ok | fail
  React.useEffect(() => {
    if (!open) { setPhase("idle"); return; }
    setPhase("running");
    const t = setTimeout(() => setPhase(Math.random() > 0.2 ? "ok" : "fail"), 1200);
    return () => clearTimeout(t);
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} size="sm" title="Test D365 connection"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>{phase === "running" ? "Cancel" : "Close"}</button>
        {phase === "fail" && <button className="btn btn-primary btn-sm" onClick={()=>setPhase("running")}>Retry</button>}
      </>}>
      {phase === "running" && (
        <div style={{textAlign:"center", padding:20}}>
          <div style={{fontSize:32, marginBottom:10}}>⟳</div>
          <div style={{fontSize:13}}>Connecting to D365 environment…</div>
          <div className="muted mono" style={{fontSize:11, marginTop:4}}>https://apex.operations.dynamics.com</div>
        </div>
      )}
      {phase === "ok" && (
        <div style={{textAlign:"center", padding:20}}>
          <div style={{fontSize:32, color:"var(--green-700)", marginBottom:10}}>✓</div>
          <div style={{fontSize:13, fontWeight:500}}>Connection successful</div>
          <div className="muted" style={{fontSize:12, marginTop:6}}>Latency: <span className="mono">238ms</span> · Environment: <span className="mono">Production</span></div>
        </div>
      )}
      {phase === "fail" && (
        <div style={{textAlign:"center", padding:20}}>
          <div style={{fontSize:32, color:"var(--red-700)", marginBottom:10}}>✗</div>
          <div style={{fontSize:13, fontWeight:500}}>Connection failed</div>
          <div className="muted mono" style={{fontSize:11, marginTop:6, background:"var(--gray-100)", padding:"6px 10px", borderRadius:4, display:"inline-block"}}>ERR_AAD_TOKEN_INVALID</div>
          <div className="muted" style={{fontSize:11, marginTop:8}}>Check tenant ID and client secret, then retry.</div>
        </div>
      )}
    </Modal>
  );
};

// -------- SM-09: PasswordResetModal (destructive confirm) --------
const PasswordResetModal = ({ open, onClose, data }) => {
  const user = data?.user || window.SETTINGS_USERS[0];
  const [ack, setAck] = React.useState(false);
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Reset password?" dismissible={false}
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-danger btn-sm" disabled={!ack} onClick={onClose}>Send reset link</button>
      </>}>
      <div className="alert alert-red" style={{fontSize:12, marginBottom:10}}>
        This will immediately invalidate <b>{user.name}</b>'s current password and email a reset link to <span className="mono">{user.email}</span>. Any active sessions for this user will be revoked.
      </div>
      <label style={{display:"flex", gap:8, alignItems:"center", fontSize:13}}>
        <input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>
        I understand this will revoke active sessions.
      </label>
    </Modal>
  );
};

// -------- SM-10: DeleteReferenceDataModal (type-to-confirm) --------
const DeleteReferenceDataModal = ({ open, onClose, data }) => {
  const row = data?.row || { code: "A99", name_en: "Example" };
  const table = data?.table || "allergens_reference";
  const [typed, setTyped] = React.useState("");
  const ok = typed === "DELETE";
  return (
    <Modal open={open} onClose={onClose} size="sm" title={`Delete ${row.code}?`} dismissible={false}
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-danger btn-sm" disabled={!ok} onClick={onClose}>Delete permanently</button>
      </>}>
      <div className="alert alert-red" style={{fontSize:12, marginBottom:10}}>
        This action cannot be undone. <b>{row.code}</b> — {row.name_en || row.name} will be permanently removed from <span className="mono">{table}</span>. Any rows referencing this code will be orphaned.
      </div>
      <Field label="Type DELETE to confirm" required>
        <input value={typed} onChange={e=>setTyped(e.target.value)} placeholder="DELETE" autoFocus/>
      </Field>
    </Modal>
  );
};

// -------- SM-11: RefRowEditModal (simple schema-driven edit) --------
const RefRowEditModal = ({ open, onClose, data }) => {
  const row = data?.row || null;
  const table = data?.table || "allergens_reference";
  const isAllergen = table === "allergens_reference";
  const [code, setCode] = React.useState(row?.code || "");
  const [en,   setEn]   = React.useState(row?.name_en || "");
  const [pl,   setPl]   = React.useState(row?.name_pl || "");
  const [act,  setAct]  = React.useState(row?.active ?? true);
  const vCode = /^[A-Z0-9_-]{2,}$/.test(code);
  const vEn   = en.length >= 2;
  const valid = vCode && vEn;
  return (
    <Modal open={open} onClose={onClose}
      title={row ? "Edit row — " + row.code : "Add row"}
      subtitle={"Reference table · " + table}
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!valid} onClick={onClose}>Save</button>
      </>}>
      <Field label="Row key" required help="Uppercase, min 2 chars. Unique in table." error={code && !vCode ? "Must be uppercase alnum / underscore / dash, ≥ 2 chars" : undefined}>
        <input value={code} onChange={e=>setCode(e.target.value)} className="mono" readOnly={!!row} style={row ? {background:"var(--gray-100)"} : {}}/>
      </Field>
      {isAllergen && (
        <>
          <Field label="Name (EN)" required error={en && !vEn ? "Min 2 chars" : undefined}>
            <input value={en} onChange={e=>setEn(e.target.value)} />
          </Field>
          <Field label="Name (PL)">
            <input value={pl} onChange={e=>setPl(e.target.value)} />
          </Field>
        </>
      )}
      <Field label="Active">
        <Toggle on={act} onChange={setAct}/>
      </Field>
    </Modal>
  );
};

// ============================================================
// MODAL GALLERY
// ============================================================
const SETTINGS_MODAL_CATALOG = [
  { key: "ruleDryRun",       name: "SM-01 · Rule dry-run",           pattern: "Preview / compare",            spec: "§ SET-051",    comp: RuleDryRunModal,       data: { rule: window.SETTINGS_RULES[0] } },
  { key: "flagEdit",         name: "SM-02 · Flag edit",              pattern: "Simple form + audit reason",   spec: "§ SET-060",    comp: FlagEditModal,         data: { flag: window.SETTINGS_FLAGS[2] } },
  { key: "schemaView",       name: "SM-03 · Schema view",             pattern: "Simple view",                  spec: "§ SET-070",    comp: SchemaViewModal,       data: { col: window.SETTINGS_SCHEMA[0] } },
  { key: "emailTemplateEdit",name: "SM-04 · Email template edit",     pattern: "Wizard w/ variable picker",    spec: "§ SET-090",    comp: EmailTemplateEditModal, data: { tpl: window.SETTINGS_EMAIL_TEMPLATES[0] } },
  { key: "promoteL2",        name: "SM-05 · L1→L2→L3 promotion",      pattern: "Wizard w/ diff preview",       spec: "§ SET-100",    comp: PromoteToL2Modal,      data: { promotion: window.SETTINGS_PROMOTIONS[0] } },
  { key: "userInvite",       name: "SM-06 · User invite",             pattern: "Simple form",                  spec: "§ MODAL-INVITE-USER", comp: UserInviteModal, data: null },
  { key: "roleAssign",       name: "SM-07 · Role assign",              pattern: "Picker-backed form",           spec: "§ MODAL-ROLE-ASSIGNMENT", comp: RoleAssignModal, data: null },
  { key: "d365Test",         name: "SM-08 · D365 test connection",    pattern: "Confirm + async result",       spec: "§ MODAL-D365-CONNECTION-TEST", comp: D365TestConnectionModal, data: null },
  { key: "passwordReset",    name: "SM-09 · Password reset",          pattern: "Destructive confirm",          spec: "§ SET-031-pass", comp: PasswordResetModal, data: { user: window.SETTINGS_USERS[0] } },
  { key: "deleteRef",        name: "SM-10 · Delete reference data",    pattern: "Destructive + type-to-confirm", spec: "§ MODAL-CONFIRM-DELETE", comp: DeleteReferenceDataModal, data: { table: "allergens_reference", row: window.SETTINGS_ALLERGENS[0] } },
  { key: "refRowEdit",       name: "SM-11 · Reference row edit",      pattern: "Simple form (schema-driven)",  spec: "§ MODAL-REF-ROW-EDIT",  comp: RefRowEditModal,       data: { table: "allergens_reference", row: window.SETTINGS_ALLERGENS[0] } }
];

const ModalGallery = ({ onNav }) => {
  const [openKey, setOpenKey] = React.useState(null);
  const active = SETTINGS_MODAL_CATALOG.find(m => m.key === openKey);
  return (
    <>
      <PageHead title="Modal gallery" sub={`${SETTINGS_MODAL_CATALOG.length} components covering SM-01 through SM-10 — follows ../_shared/MODAL-SCHEMA.md.`} />

      <div className="alert alert-blue" style={{marginBottom:14, fontSize:12}}>
        <b>Click any card to open the modal.</b> Every modal uses the shared primitives (<span className="mono">Modal, Stepper, Field, ReasonInput, Summary</span>) from <span className="mono">_shared/modals.jsx</span>.
      </div>

      <div className="gallery-grid">
        {SETTINGS_MODAL_CATALOG.map(m => (
          <div key={m.key} className="gallery-card" onClick={()=>setOpenKey(m.key)}>
            <div className="gallery-pattern">{m.pattern}</div>
            <div className="gallery-name">{m.name}</div>
            <div className="muted mono" style={{fontSize:10, marginTop:6}}>{m.spec}</div>
            <button className="btn btn-secondary btn-sm" style={{marginTop:10}}>Open modal →</button>
          </div>
        ))}
      </div>

      {active && <active.comp open={true} onClose={()=>setOpenKey(null)} data={active.data}/>}
    </>
  );
};

Object.assign(window, {
  RuleDryRunModal, FlagEditModal, SchemaViewModal, EmailTemplateEditModal,
  PromoteToL2Modal, UserInviteModal, RoleAssignModal, D365TestConnectionModal,
  PasswordResetModal, DeleteReferenceDataModal, RefRowEditModal,
  ModalGallery, SETTINGS_MODAL_CATALOG
});
