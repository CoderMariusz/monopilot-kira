// ============ Project detail + Brief form + Create new project wizard ============

const StageRail = ({ project, current, onNav }) => {
  const stages = window.NPD_STAGE_DETAIL;
  // derive done-ness from project.progress — rough mapping
  const currentIdx = stages.findIndex(s => s.key === current);
  return (
    <div className="stage-rail">
      {stages.map((s, i) => (
        <div key={s.key}
             className={`stage-dot ${i < currentIdx ? "done" : ""} ${i === currentIdx ? "active" : ""}`}
             onClick={() => onNav(s.key)}>
          <div className="num">{i < currentIdx ? "✓" : i + 1}</div>
          <div className="label">{s.label}</div>
        </div>
      ))}
    </div>
  );
};

const ProjectHeader = ({ project, onBack }) => (
  <>
    <div className="breadcrumb"><a onClick={onBack}>NPD</a> / <a onClick={onBack}>Pipeline</a> / {project.code}</div>
    <div className="page-head">
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="page-title" style={{ margin: 0 }}>{project.name}</div>
          <span className={`badge badge-${window.stageColor[project.stage]}`}>{window.NPD_STAGES.find(s => s.key === project.stage)?.label}</span>
          {window.prioBadge(project.prio)}
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          {project.code} · {project.type} · Owner: {project.owner} · Target launch: {project.target}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-secondary">⚑ Watch</button>
        <button className="btn btn-secondary">Duplicate</button>
        <button className="btn btn-primary">Advance stage →</button>
      </div>
    </div>
  </>
);

// ============ Brief screen ============
const BriefScreen = ({ project }) => {
  const [form, setForm] = React.useState({
    name: project.name, type: project.type, target: project.target,
    targetPrice: "19.90", format: "200g sliced pack",
    audience: "Premium retail — Carrefour, Auchan PL",
    claims: "High protein · No phosphates · Reduced nitrite",
    constraints: "Shelf life ≥ 28 days · Protein ≥ 18g/100g · Salt ≤ 2g/100g",
    notes: project.notes || "",
    channel: "Retail", volume: "1,200 kg/week"
  });
  const u = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <>
      <div className="card">
        <div className="card-head">
          <div className="card-title">Project brief</div>
          <span className="badge badge-green">✓ Completed</span>
        </div>
        <div className="form-grid">
          <div className="field"><label>Product name</label><input value={form.name} onChange={e => u("name", e.target.value)} /></div>
          <div className="field"><label>Category</label>
            <select value={form.type} onChange={e => u("type", e.target.value)}>
              <option>Meat · Cold cut</option><option>Meat · Smoked</option><option>Meat · Cured</option>
              <option>Meat · Pâté</option><option>Fish · Smoked</option>
            </select>
          </div>
          <div className="field"><label>Target launch date</label><input value={form.target} onChange={e => u("target", e.target.value)} /></div>
          <div className="field"><label>Target retail price (EUR)</label><input value={form.targetPrice} onChange={e => u("targetPrice", e.target.value)} /></div>
          <div className="field"><label>Pack format</label><input value={form.format} onChange={e => u("format", e.target.value)} /></div>
          <div className="field"><label>Sales channel</label>
            <select value={form.channel} onChange={e => u("channel", e.target.value)}>
              <option>Retail</option><option>HoReCa</option><option>Industrial</option><option>Export</option>
            </select>
          </div>
          <div className="field"><label>Expected volume</label><input value={form.volume} onChange={e => u("volume", e.target.value)} /></div>
          <div className="field"><label>Target audience</label><input value={form.audience} onChange={e => u("audience", e.target.value)} /></div>
        </div>
        <div className="field"><label>Marketing claims</label><input value={form.claims} onChange={e => u("claims", e.target.value)} /></div>
        <div className="field"><label>Constraints & requirements</label>
          <textarea rows="2" value={form.constraints} onChange={e => u("constraints", e.target.value)}></textarea>
        </div>
        <div className="field"><label>Notes</label>
          <textarea rows="3" value={form.notes} onChange={e => u("notes", e.target.value)}></textarea>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><div className="card-title">Attachments</div><button className="btn btn-secondary btn-sm">+ Upload</button></div>
        <table>
          <tbody>
            <tr><td style={{ width: 30 }}>📄</td><td style={{ fontWeight: 500 }}>Competitor benchmark — Sokołów premium.xlsx</td><td className="muted">K. Nowak</td><td className="muted mono">2025-11-14</td><td style={{ width: 30, textAlign: "right" }} className="muted">⋮</td></tr>
            <tr><td>📄</td><td style={{ fontWeight: 500 }}>Regulatory brief — nitrite reduction.pdf</td><td className="muted">QA Team</td><td className="muted mono">2025-11-18</td><td className="muted">⋮</td></tr>
            <tr><td>📄</td><td style={{ fontWeight: 500 }}>Retailer spec — Carrefour PL.pdf</td><td className="muted">Commercial</td><td className="muted mono">2025-11-20</td><td className="muted">⋮</td></tr>
          </tbody>
        </table>
      </div>
    </>
  );
};

// ============ Create new project wizard (hero flow) ============
const CreateProjectWizard = ({ onCancel, onComplete }) => {
  const [step, setStep] = React.useState(1);
  const [form, setForm] = React.useState({
    name: "", type: "Meat · Cold cut", target: "", targetPrice: "",
    format: "", audience: "", claims: "", constraints: "", notes: "",
    channel: "Retail", volume: "", startFrom: "blank"
  });
  const u = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const next = () => setStep(s => Math.min(4, s + 1));
  const prev = () => setStep(s => Math.max(1, s - 1));

  const stepLabels = ["Basics", "Brief", "Starting point", "Review"];

  return (
    <div>
      <div className="breadcrumb"><a onClick={onCancel}>NPD</a> / New project</div>
      <div className="page-head">
        <div className="page-title">Create NPD project</div>
        <button className="btn btn-ghost" onClick={onCancel}>✕ Cancel</button>
      </div>

      {/* step bar */}
      <div className="card" style={{ padding: "14px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
          {stepLabels.map((l, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", flex: i < 3 ? 1 : 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: step > i + 1 ? "var(--green)" : step === i + 1 ? "var(--blue)" : "var(--gray-100)", color: step >= i + 1 ? "#fff" : "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600 }}>{step > i + 1 ? "✓" : i + 1}</div>
                <span style={{ fontSize: 12, fontWeight: step === i + 1 ? 600 : 400, color: step >= i + 1 ? "var(--text)" : "var(--muted)" }}>{l}</span>
              </div>
              {i < 3 && <div style={{ flex: 1, height: 2, background: step > i + 1 ? "var(--green)" : "var(--border)", margin: "0 12px" }}></div>}
            </div>
          ))}
        </div>
      </div>

      {step === 1 && (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>Basics</div>
          <div className="form-grid">
            <div className="field"><label>Product working name *</label>
              <input placeholder="e.g. Sliced Ham 200g" value={form.name} onChange={e => u("name", e.target.value)} autoFocus />
            </div>
            <div className="field"><label>Category *</label>
              <select value={form.type} onChange={e => u("type", e.target.value)}>
                <option>Meat · Cold cut</option><option>Meat · Smoked</option><option>Meat · Cured</option>
                <option>Meat · Pâté</option><option>Fish · Smoked</option>
              </select>
            </div>
            <div className="field"><label>Target launch date</label>
              <input type="text" placeholder="YYYY-MM-DD" value={form.target} onChange={e => u("target", e.target.value)} />
            </div>
            <div className="field"><label>Pack format</label>
              <input placeholder="e.g. 200g sliced pack" value={form.format} onChange={e => u("format", e.target.value)} />
            </div>
            <div className="field"><label>Sales channel</label>
              <select value={form.channel} onChange={e => u("channel", e.target.value)}>
                <option>Retail</option><option>HoReCa</option><option>Industrial</option><option>Export</option>
              </select>
            </div>
            <div className="field"><label>Expected weekly volume</label>
              <input placeholder="e.g. 1,200 kg/week" value={form.volume} onChange={e => u("volume", e.target.value)} />
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>Brief</div>
          <div className="form-grid">
            <div className="field"><label>Target retail price (EUR)</label>
              <input placeholder="19.90" value={form.targetPrice} onChange={e => u("targetPrice", e.target.value)} />
            </div>
            <div className="field"><label>Target audience</label>
              <input placeholder="e.g. Premium retail — Carrefour, Auchan PL" value={form.audience} onChange={e => u("audience", e.target.value)} />
            </div>
          </div>
          <div className="field"><label>Marketing claims</label>
            <input placeholder="e.g. High protein · No phosphates · Reduced nitrite" value={form.claims} onChange={e => u("claims", e.target.value)} />
          </div>
          <div className="field"><label>Constraints & requirements</label>
            <textarea rows="3" placeholder="Shelf life ≥ 28 days · Protein ≥ 18g/100g · Salt ≤ 2g/100g" value={form.constraints} onChange={e => u("constraints", e.target.value)}></textarea>
          </div>
          <div className="field"><label>Notes</label>
            <textarea rows="3" placeholder="Background, inspiration, competitive benchmarks…" value={form.notes} onChange={e => u("notes", e.target.value)}></textarea>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 4 }}>Starting point</div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 14 }}>How should we bootstrap the first recipe draft?</div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {[
              { key: "blank", title: "Blank recipe", desc: "Start from scratch — build ingredients from the library.", ic: "◇" },
              { key: "clone", title: "Clone existing recipe", desc: "Fork a production recipe and modify. Suggested: Sliced Ham Standard (BOM-214).", ic: "⎘" },
              { key: "template", title: "Category template", desc: "Pre-filled skeleton for Meat · Cold cut with typical ingredients.", ic: "▦" }
            ].map(opt => (
              <div key={opt.key} onClick={() => u("startFrom", opt.key)}
                   style={{ padding: 14, border: `2px solid ${form.startFrom === opt.key ? "var(--blue)" : "var(--border)"}`,
                            borderRadius: "var(--radius)", cursor: "pointer",
                            background: form.startFrom === opt.key ? "var(--blue-050)" : "#fff" }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>{opt.ic}</div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{opt.title}</div>
                <div className="muted" style={{ fontSize: 11 }}>{opt.desc}</div>
              </div>
            ))}
          </div>

          {form.startFrom === "clone" && (
            <div className="alert alert-blue" style={{ marginTop: 14 }}>
              Will clone <strong>BOM-214 · Sliced Ham Standard</strong> (10 ingredients, last updated 2025-09-12).
              You can edit every value after creation.
            </div>
          )}
        </div>
      )}

      {step === 4 && (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>Review & create</div>
          <div className="alert alert-green">
            Ready to create <strong>{form.name || "(unnamed project)"}</strong>. A new project ID will be assigned,
            a first recipe draft generated, and your brief saved.
          </div>
          <table style={{ marginTop: 8 }}>
            <tbody>
              <tr><td className="muted" style={{ width: 180 }}>Project name</td><td style={{ fontWeight: 500 }}>{form.name || "—"}</td></tr>
              <tr><td className="muted">Category</td><td>{form.type}</td></tr>
              <tr><td className="muted">Target launch</td><td>{form.target || "—"}</td></tr>
              <tr><td className="muted">Target price</td><td>€{form.targetPrice || "—"}</td></tr>
              <tr><td className="muted">Channel / volume</td><td>{form.channel} · {form.volume || "—"}</td></tr>
              <tr><td className="muted">Claims</td><td>{form.claims || "—"}</td></tr>
              <tr><td className="muted">Starting point</td><td>
                {form.startFrom === "blank" && "Blank recipe"}
                {form.startFrom === "clone" && "Clone of BOM-214 Sliced Ham Standard"}
                {form.startFrom === "template" && "Category template: Meat · Cold cut"}
              </td></tr>
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <div style={{ display: "flex", gap: 8 }}>
          {step > 1 && <button className="btn btn-secondary" onClick={prev}>← Back</button>}
          {step < 4 && <button className="btn btn-primary" onClick={next} disabled={step === 1 && !form.name}>Continue →</button>}
          {step === 4 && <button className="btn btn-primary" onClick={() => onComplete(form)}>✓ Create project & open recipe</button>}
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { StageRail, ProjectHeader, BriefScreen, CreateProjectWizard });
