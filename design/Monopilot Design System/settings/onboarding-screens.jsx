// ============================================================
// SET-001..006 — Onboarding Wizard (6-step, <15min target P50)
// spec: 02-SETTINGS PRD §14.3 + E01.2 (P1 Must)
// State tracked w organizations.onboarding_state JSONB
// ============================================================

const ONBOARDING_STEPS = [
  { code: "SET-001", key: "org_profile",      num: 1, label: "Organization profile",
    sub: "Name, timezone, locale, currency, logo",
    help: "We'll use these defaults across every module. You can change them any time from Settings › Company profile." },
  { code: "SET-002", key: "first_warehouse",  num: 2, label: "First warehouse",
    sub: "Where you store finished goods",
    help: "Each warehouse holds one or more locations (bins/zones). You can create more later in Settings › Warehouses." },
  { code: "SET-003", key: "first_location",   num: 3, label: "First location",
    sub: "Zone / bin inside the warehouse",
    help: "Locations are ltree paths (e.g. `FG › Zone A › Rack 1 › Bin 3`). Scanner picks are routed by location." },
  { code: "SET-004", key: "first_product",    num: 4, label: "First product",
    sub: "SKU + BOM (skippable · redirects to 03-TECHNICAL)",
    help: "Soft redirect into the Technical module — you can also import from D365 later.", skippable: true },
  { code: "SET-005", key: "first_wo",         num: 5, label: "First work order",
    sub: "Schedule your first production run (skippable · redirects to 04-PLANNING-BASIC)",
    help: "Soft redirect into Planning Basic — you can come back here after you've created an SO too.", skippable: true },
  { code: "SET-006", key: "completion",       num: 6, label: "Completion",
    sub: "You're live · next-step cards",
    help: "Confetti moment + card grid linking to Module Toggles, Schema Browser, and Rules Registry." }
];

const OnboardingStepper = ({ current, completed, onJump }) => (
  <div className="onb-stepper" style={{display:"flex", gap:4, alignItems:"stretch", marginBottom:20, background:"var(--gray-050)", padding:10, borderRadius:6, border:"1px solid var(--border)"}}>
    {ONBOARDING_STEPS.map(s => {
      const isDone    = completed.includes(s.key);
      const isCurrent = current === s.key;
      return (
        <div key={s.key}
             onClick={() => onJump && onJump(s.key)}
             style={{
               flex: 1, padding:"10px 12px", borderRadius:4, cursor:"pointer",
               background: isCurrent ? "var(--blue)" : isDone ? "#e6f4e6" : "#fff",
               color: isCurrent ? "#fff" : "inherit",
               border: "1px solid " + (isCurrent ? "var(--blue)" : isDone ? "#a6d5a6" : "var(--border)")
             }}>
          <div style={{display:"flex", alignItems:"center", gap:8}}>
            <span className="mono" style={{fontSize:10, fontWeight:700, opacity:0.8}}>{s.num}</span>
            <span style={{fontSize:11, fontWeight:600}}>{isDone ? "✓ " : ""}{s.label}</span>
          </div>
          <div style={{fontSize:10, marginTop:2, opacity:0.8}}>{s.code}</div>
        </div>
      );
    })}
  </div>
);

const OnboardingWizardScreen = ({ onNav }) => {
  const [current, setCurrent] = React.useState("org_profile");
  const [completed, setCompleted] = React.useState([]);
  const [skipped, setSkipped] = React.useState([]);
  const [form, setForm] = React.useState({
    org_name: "Forza Foods Sp. z o.o.",
    timezone: "Europe/Warsaw",
    locale:   "pl-PL",
    currency: "PLN",
    gs1_prefix: "5012345",
    wh_name:  "ForzDG · Finished Goods",
    wh_code:  "FG-01",
    wh_type:  "finished",
    loc_path: "FG › Zone A › Rack 1 › Bin 1",
    loc_zone: "Zone A",
    loc_bin:  "BIN-A1-01"
  });

  const stepMeta = ONBOARDING_STEPS.find(s => s.key === current);
  const stepIdx  = ONBOARDING_STEPS.findIndex(s => s.key === current);
  const next = () => {
    setCompleted(c => c.includes(current) ? c : [...c, current]);
    if (stepIdx < ONBOARDING_STEPS.length - 1) setCurrent(ONBOARDING_STEPS[stepIdx + 1].key);
  };
  const skip = () => {
    setSkipped(s => s.includes(current) ? s : [...s, current]);
    if (stepIdx < ONBOARDING_STEPS.length - 1) setCurrent(ONBOARDING_STEPS[stepIdx + 1].key);
  };
  const back = () => {
    if (stepIdx > 0) setCurrent(ONBOARDING_STEPS[stepIdx - 1].key);
  };
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const percent = Math.round((completed.length / ONBOARDING_STEPS.length) * 100);

  return (
    <>
      <PageHead
        title="Onboarding wizard"
        sub={"6-step setup · target <15 minutes · state saved automatically (organizations.onboarding_state). " + percent + "% complete."}
        actions={<><button className="btn btn-secondary" onClick={() => { setCurrent("org_profile"); setCompleted([]); setSkipped([]); }}>Restart</button>{stepMeta.skippable && <button className="btn btn-secondary" onClick={skip}>Skip this step →</button>}</>} />

      <div className="alert alert-blue" style={{marginBottom:14, fontSize:12}}>
        <b>SET-001 Wizard Launcher.</b> New-org setup path — auto-shown on first admin login when <code className="mono">onboarding_completed_at IS NULL</code>. Resume capability: returning user continues from <code className="mono">onboarding_state.current_step</code>.
      </div>

      <OnboardingStepper current={current} completed={completed} onJump={setCurrent} />

      <Section title={stepMeta.code + " · " + stepMeta.label} sub={stepMeta.sub}>
        <div className="muted" style={{marginBottom:12, fontSize:11, padding:"8px 10px", background:"var(--gray-050)", borderRadius:4, border:"1px dashed var(--border)"}}>{stepMeta.help}</div>

        {current === "org_profile" && (
          <div className="set-form-grid">
            <Field label="Organization name" required>
              <input value={form.org_name} onChange={e => set("org_name", e.target.value)} style={{width:320}}/>
            </Field>
            <Field label="Timezone">
              <select value={form.timezone} onChange={e => set("timezone", e.target.value)}>
                <option>Europe/Warsaw</option><option>Europe/Berlin</option><option>Europe/London</option><option>UTC</option>
              </select>
            </Field>
            <Field label="Locale">
              <select value={form.locale} onChange={e => set("locale", e.target.value)}>
                <option value="pl-PL">pl-PL · Polski</option>
                <option value="en-GB">en-GB · English (UK)</option>
                <option value="en-US">en-US · English (US)</option>
                <option value="uk-UA">uk-UA · Українська</option>
                <option value="ro-RO">ro-RO · Română</option>
              </select>
            </Field>
            <Field label="Currency">
              <select value={form.currency} onChange={e => set("currency", e.target.value)}>
                <option>PLN</option><option>EUR</option><option>GBP</option><option>USD</option>
              </select>
            </Field>
            <Field label="GS1 Company Prefix" help="Required before SSCC generation in 11-SHIPPING (V-SHIP-PACK-03).">
              <input value={form.gs1_prefix} onChange={e => set("gs1_prefix", e.target.value)} className="mono" style={{width:140}}/>
            </Field>
            <Field label="Logo (optional)">
              <button className="btn btn-secondary btn-sm">Upload image…</button>
            </Field>
          </div>
        )}

        {current === "first_warehouse" && (
          <div className="set-form-grid">
            <Field label="Warehouse name" required>
              <input value={form.wh_name} onChange={e => set("wh_name", e.target.value)} style={{width:320}}/>
            </Field>
            <Field label="Warehouse code" required>
              <input value={form.wh_code} onChange={e => set("wh_code", e.target.value)} className="mono" style={{width:160}}/>
            </Field>
            <Field label="Warehouse type">
              <select value={form.wh_type} onChange={e => set("wh_type", e.target.value)}>
                <option value="finished">Finished goods</option>
                <option value="raw">Raw materials</option>
                <option value="wip">Work in progress</option>
                <option value="quarantine">Quarantine / QA hold</option>
              </select>
            </Field>
            <Field label="Address">
              <input placeholder="Street, city, country" style={{width:320}}/>
            </Field>
          </div>
        )}

        {current === "first_location" && (
          <div className="set-form-grid">
            <Field label="Location path (ltree)" required help="Consumed by Scanner pick routing + Warehouse map.">
              <input value={form.loc_path} onChange={e => set("loc_path", e.target.value)} className="mono" style={{width:360}}/>
            </Field>
            <Field label="Zone">
              <input value={form.loc_zone} onChange={e => set("loc_zone", e.target.value)} style={{width:200}}/>
            </Field>
            <Field label="Bin code">
              <input value={form.loc_bin} onChange={e => set("loc_bin", e.target.value)} className="mono" style={{width:160}}/>
            </Field>
            <Field label="Parent warehouse">
              <input value={form.wh_code} readOnly className="mono" style={{width:160, background:"var(--gray-100)"}}/>
            </Field>
          </div>
        )}

        {current === "first_product" && (
          <div style={{padding:20, textAlign:"center", border:"1px dashed var(--border)", borderRadius:6, background:"var(--gray-050)"}}>
            <div style={{fontSize:32, marginBottom:8}}>📦</div>
            <div style={{fontSize:14, fontWeight:600, marginBottom:6}}>Create your first product</div>
            <div className="muted" style={{fontSize:12, maxWidth:420, margin:"0 auto 14px"}}>
              Products live in <b>03-TECHNICAL</b>. You'll go there to create an SKU + BOM, then come back to complete onboarding. You can also import items from D365 later (Admin › D365 mapping).
            </div>
            <button className="btn btn-primary" onClick={() => onNav && onNav("products")}>Open products →</button>
            <div className="muted" style={{fontSize:11, marginTop:8}}>Optional — you can skip this step.</div>
          </div>
        )}

        {current === "first_wo" && (
          <div style={{padding:20, textAlign:"center", border:"1px dashed var(--border)", borderRadius:6, background:"var(--gray-050)"}}>
            <div style={{fontSize:32, marginBottom:8}}>▶</div>
            <div style={{fontSize:14, fontWeight:600, marginBottom:6}}>Schedule your first work order</div>
            <div className="muted" style={{fontSize:12, maxWidth:420, margin:"0 auto 14px"}}>
              Work orders live in <b>04-PLANNING-BASIC</b>. You'll schedule a production run (line, quantity, BOM). First-WO-created timestamp is captured for onboarding KPI: &lt;15min P50.
            </div>
            <button className="btn btn-primary">Open planning →</button>
            <div className="muted" style={{fontSize:11, marginTop:8}}>Optional — you can skip this step.</div>
          </div>
        )}

        {current === "completion" && (
          <div style={{padding:30, textAlign:"center", background:"linear-gradient(180deg, #f5faff 0%, #fff 100%)", border:"1px solid var(--border)", borderRadius:6}}>
            <div style={{fontSize:48, marginBottom:8}}>🎉</div>
            <div style={{fontSize:18, fontWeight:700, marginBottom:4}}>You're live on Monopilot</div>
            <div className="muted" style={{fontSize:12, maxWidth:440, margin:"0 auto 22px"}}>
              Setup complete. <code className="mono">organizations.onboarding_completed_at</code> timestamp recorded · first-WO KPI captured. Here's what to do next:
            </div>
            <div style={{display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:10, maxWidth:620, margin:"0 auto"}}>
              <div className="sg-card" onClick={() => onNav && onNav("features")} style={{cursor:"pointer"}}>
                <div className="sg-card-title">Module toggles</div>
                <div className="sg-card-desc" style={{marginTop:4}}>Switch on NPD, OEE, Finance and more.</div>
              </div>
              <div className="sg-card" onClick={() => onNav && onNav("schema")} style={{cursor:"pointer"}}>
                <div className="sg-card-title">Schema browser</div>
                <div className="sg-card-desc" style={{marginTop:4}}>Explore L1/L2/L3 columns · add custom fields.</div>
              </div>
              <div className="sg-card" onClick={() => onNav && onNav("rules")} style={{cursor:"pointer"}}>
                <div className="sg-card-title">Rules registry</div>
                <div className="sg-card-desc" style={{marginTop:4}}>Review active cascading + gate rules.</div>
              </div>
            </div>
          </div>
        )}
      </Section>

      <div style={{display:"flex", gap:8, justifyContent:"space-between", marginTop:16}}>
        <button className="btn btn-secondary" onClick={back} disabled={stepIdx === 0}>← Back</button>
        <div className="muted" style={{fontSize:11, alignSelf:"center"}}>
          Step {stepMeta.num} of 6 · {completed.length} completed{skipped.length ? (" · " + skipped.length + " skipped") : ""}
        </div>
        {current === "completion"
          ? <button className="btn btn-primary" onClick={() => onNav && onNav("profile")}>Finish onboarding</button>
          : <button className="btn btn-primary" onClick={next}>Continue →</button>}
      </div>
    </>
  );
};

Object.assign(window, { OnboardingWizardScreen, ONBOARDING_STEPS });
