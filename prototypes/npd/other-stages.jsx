// ============================================================================
// NPD module · other-stages.jsx — Legacy R&D stage screens (cost/nutrition/packaging) — Phase 2 deprecation
// ----------------------------------------------------------------------------
// Implementation contract: see ./SCHEMA.md · ./API.md · ./COMPONENT-INTERFACES.md
// Spec: design/01-NPD-UX.md
// ============================================================================

// ============ Other stage screens (R&D Pipeline) ============

// ---------- Nutrition / allergens read-only ----------
const NutritionScreen = () => {
  const rows = [
    { label: "Energy",    val: "142 kcal", target: "≤ 180", status: "ok" },
    { label: "Fat",       val: "6.2 g",    target: "≤ 8",   status: "ok" },
    { label: "Saturates", val: "2.1 g",    target: "≤ 3",   status: "ok" },
    { label: "Carbs",     val: "1.1 g",    target: "≤ 3",   status: "ok" },
    { label: "Sugars",    val: "0.5 g",    target: "≤ 2",   status: "ok" },
    { label: "Protein",   val: "19.6 g",   target: "≥ 18",  status: "ok" },
    { label: "Salt",      val: "2.0 g",    target: "≤ 2",   status: "warn" }
  ];

  return (
    <>
      <div className="card">
        <div className="card-head">
          <div className="card-title">Nutrition declaration (per 100g)</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn btn-ghost btn-sm">Export CSV</button>
            <button className="btn btn-secondary btn-sm">Generate label PDF</button>
          </div>
        </div>
        <table>
          <thead><tr><th>Nutrient</th><th>Per 100g</th><th>Per portion (50g)</th><th>Target</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.label}>
                <td style={{ fontWeight: 500 }}>{r.label}</td>
                <td className="mono">{r.val}</td>
                <td className="mono muted">{r.val.replace(/[\d.]+/, n => (Number(n) / 2).toFixed(1))}</td>
                <td className="mono">{r.target}</td>
                <td>{r.status === "ok"
                  ? <span className="badge badge-green">✓ OK</span>
                  : <span className="badge badge-amber">⚠ At limit</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 8 }}>Allergen declaration</div>
          <div className="alert alert-amber"><strong>1 allergen detected:</strong> Soy (from Soy Protein Isolate, 1.2%). Must be declared in bold on the ingredient list.</div>
          <table>
            <thead><tr><th>Allergen</th><th>Source ingredient</th><th>%</th><th>Cross-contact?</th></tr></thead>
            <tbody>
              <tr><td style={{ fontWeight: 600 }}>Soy</td><td>Soy Protein Isolate (RM-3501)</td><td className="mono num">1.2%</td><td className="muted">No</td></tr>
              <tr><td className="muted">Milk</td><td className="muted">— none —</td><td></td><td className="muted">Possible (shared line)</td></tr>
              <tr><td className="muted">Mustard</td><td className="muted">— none —</td><td></td><td className="muted">No</td></tr>
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-title" style={{ marginBottom: 8 }}>Nutri-Score preview</div>
          <div style={{ display: "flex", alignItems: "center", gap: 20, padding: "10px 0" }}>
            <div style={{ display: "flex", gap: 2 }}>
              {["A", "B", "C", "D", "E"].map(l => (
                <div key={l} style={{
                  width: 38, height: 48, display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 700, fontSize: 18, color: "#fff",
                  background: l === "C" ? "#f59e0b" : l === "A" ? "#16a34a88" : l === "B" ? "#84cc1688" : l === "D" ? "#f9731688" : "#dc262688",
                  borderRadius: 4, transform: l === "C" ? "scale(1.2)" : "none"
                }}>{l}</div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 32, fontWeight: 700, color: "#f59e0b" }}>C</div>
              <div className="muted" style={{ fontSize: 12 }}>Driven by salt content (2.0g).<br />Reducing to 1.6g would yield B.</div>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm">Run what-if →</button>
        </div>
      </div>
    </>
  );
};

// ---------- Costing waterfall (novel touch) ----------
const CostingScreen = () => {
  const max = 18.40; // max scale
  const steps = [
    { label: "Pork Ham (82%)",        val: 15.17, type: "add", cumul: 15.17 },
    { label: "Soy Protein (1.2%)",    val: 0.11,  type: "add", cumul: 15.28 },
    { label: "Carrageenan (0.35%)",   val: 0.05,  type: "add", cumul: 15.33 },
    { label: "Spice blend (0.9%)",    val: 0.11,  type: "add", cumul: 15.44 },
    { label: "Other additives",       val: 0.14,  type: "add", cumul: 15.58 },
    { label: "Yield loss (22%)",      val: 3.42,  type: "add", cumul: 19.00 },
    { label: "Processing (8%)",       val: 1.52,  type: "add", cumul: 20.52 },
    { label: "Packaging",             val: 0.65,  type: "add", cumul: 21.17 },
    { label: "TOTAL COST / KG",       val: 18.40, type: "total", cumul: 18.40 }
  ];
  const absMax = 22;

  return (
    <>
      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Cost breakdown — Sliced Ham 200g</div>
            <div className="muted" style={{ fontSize: 12 }}>Waterfall from raw materials to final cost per kg</div>
          </div>
          <div className="pills">
            <button className="pill on">Per kg</button>
            <button className="pill">Per pack (200g)</button>
            <button className="pill">Per batch (500kg)</button>
          </div>
        </div>

        <div className="waterfall">
          {steps.map((s, i) => (
            <div key={i} className={`waterfall-bar ${s.type}`}>
              <div className="wf-label" style={{ fontWeight: s.type === "total" ? 700 : 400 }}>{s.label}</div>
              <div className="wf-track">
                <div className="wf-fill" style={{ left: 0, width: `${(s.cumul / absMax) * 100}%`, opacity: s.type === "total" ? 1 : 0.3 }}></div>
                <div className="wf-fill" style={{ left: `${((s.cumul - s.val) / absMax) * 100}%`, width: `${(s.val / absMax) * 100}%` }}></div>
              </div>
              <div className="wf-val" style={{ fontWeight: s.type === "total" ? 700 : 400 }}>€{s.val.toFixed(2)}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 10 }}>Margin vs target price</div>
          <table>
            <thead><tr><th>Scenario</th><th>Target price (200g)</th><th>Revenue €/kg</th><th>Cost €/kg</th><th>Margin</th><th>Margin %</th></tr></thead>
            <tbody>
              <tr><td>Pessimistic (promo)</td><td className="mono">€3.49</td><td className="mono">€17.45</td><td className="mono">€18.40</td><td className="mono" style={{ color: "var(--red)" }}>-€0.95</td><td className="mono" style={{ color: "var(--red)" }}>-5.4%</td></tr>
              <tr style={{ background: "var(--blue-050)" }}><td style={{ fontWeight: 600 }}>Target</td><td className="mono">€3.98</td><td className="mono">€19.90</td><td className="mono">€18.40</td><td className="mono" style={{ color: "var(--green)" }}>+€1.50</td><td className="mono" style={{ color: "var(--green)" }}>+7.5%</td></tr>
              <tr><td>Optimistic</td><td className="mono">€4.29</td><td className="mono">€21.45</td><td className="mono">€18.40</td><td className="mono" style={{ color: "var(--green)" }}>+€3.05</td><td className="mono" style={{ color: "var(--green)" }}>+14.2%</td></tr>
            </tbody>
          </table>
          <div className="alert alert-amber" style={{ marginTop: 10, marginBottom: 0 }}>
            At target price, margin is <strong>7.5%</strong> — below the NPD minimum of 15%. Consider: reduce pork content to 78%, or raise target price to €4.49.
          </div>
        </div>

        <div className="card">
          <div className="card-title" style={{ marginBottom: 8 }}>What-if sliders</div>
          <div className="field">
            <label>Pork content ({"82%"})</label>
            <input type="range" min="70" max="95" defaultValue="82" style={{ width: "100%" }} />
            <div className="muted" style={{ fontSize: 11 }}>↓ to 78% = cost €17.20 (+margin 3.5pp)</div>
          </div>
          <div className="field" style={{ marginTop: 10 }}>
            <label>Yield ({"78%"})</label>
            <input type="range" min="65" max="85" defaultValue="78" style={{ width: "100%" }} />
            <div className="muted" style={{ fontSize: 11 }}>↑ to 82% = cost €17.80 (+margin 2.1pp)</div>
          </div>
          <div className="field" style={{ marginTop: 10 }}>
            <label>Target price (€3.98)</label>
            <input type="range" min="3" max="5" step="0.1" defaultValue="3.98" style={{ width: "100%" }} />
          </div>
        </div>
      </div>
    </>
  );
};

// ---------- Packaging spec ----------
const PackagingScreen = () => (
  <>
    <div style={{ background: "#fef3c7", border: "1px solid #d97706", borderRadius: 6, padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 16 }}>⚠️</span>
      <div>
        <strong style={{ fontSize: 12 }}>LEGACY — Phase 2 deprecation</strong>
        <div style={{ fontSize: 11, color: "#92400e", marginTop: 2 }}>This screen is part of the legacy R&D pipeline and will NOT be implemented in production. Use the FA / Brief screens instead. See BL-NPD-02.</div>
      </div>
    </div>
    <div className="card">
      <div className="card-head">
        <div className="card-title">Primary packaging</div>
        <button className="btn btn-secondary btn-sm">+ Add component</button>
      </div>
      <table>
        <thead><tr><th>Component</th><th>Material</th><th>Supplier</th><th>Spec</th><th>Cost / unit</th><th>Status</th></tr></thead>
        <tbody>
          <tr><td style={{ fontWeight: 500 }}>MAP tray</td><td>PET / PE 300µm</td><td>Coveris</td><td className="mono">160×110×35mm</td><td className="mono num">€0.18</td><td><span className="badge badge-green">✓ Approved</span></td></tr>
          <tr><td style={{ fontWeight: 500 }}>Top film</td><td>PET/PE 70µm peelable</td><td>Amcor</td><td className="mono">Printed 4-color</td><td className="mono num">€0.12</td><td><span className="badge badge-green">✓ Approved</span></td></tr>
          <tr><td style={{ fontWeight: 500 }}>MAP gas mix</td><td>70% N₂ / 30% CO₂</td><td>Linde</td><td className="mono">—</td><td className="mono num">€0.03</td><td><span className="badge badge-green">✓ Approved</span></td></tr>
          <tr><td style={{ fontWeight: 500 }}>Label</td><td>Paper self-adhesive</td><td>UPM Raflatac</td><td className="mono">60×40mm</td><td className="mono num">€0.02</td><td><span className="badge badge-amber">⟳ Pending artwork</span></td></tr>
        </tbody>
      </table>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <div className="card">
        <div className="card-title" style={{ marginBottom: 8 }}>Secondary packaging</div>
        <table>
          <tbody>
            <tr><td className="muted">Inner case</td><td style={{ fontWeight: 500 }}>Cardboard box, 12 packs</td><td className="mono">320×240×80mm</td><td className="mono num">€0.22</td></tr>
            <tr><td className="muted">Outer</td><td style={{ fontWeight: 500 }}>Euro pallet, 540 packs</td><td className="mono">1200×800mm</td><td className="mono num">—</td></tr>
          </tbody>
        </table>
      </div>
      <div className="card">
        <div className="card-title" style={{ marginBottom: 8 }}>Artwork</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ width: 120, height: 90, background: "linear-gradient(135deg, #fde68a, #f59e0b)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, color: "#78350f" }}>
            Sliced Ham<br/>200g
          </div>
          <div>
            <div style={{ fontWeight: 500 }}>artwork-v2.pdf</div>
            <div className="muted" style={{ fontSize: 11 }}>Uploaded 2025-12-08 · 3.2 MB</div>
            <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
              <button className="btn btn-ghost btn-sm">Preview</button>
              <button className="btn btn-secondary btn-sm">New version</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </>
);

// ---------- Trial runs ----------
const TrialScreen = () => (
  <>
    <div style={{ background: "#fef3c7", border: "1px solid #d97706", borderRadius: 6, padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 16 }}>⚠️</span>
      <div>
        <strong style={{ fontSize: 12 }}>LEGACY — Phase 2 deprecation</strong>
        <div style={{ fontSize: 11, color: "#92400e", marginTop: 2 }}>This screen is part of the legacy R&D pipeline and will NOT be implemented in production. Use the FA / Brief screens instead. See BL-NPD-02.</div>
      </div>
    </div>
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">Lab & kitchen trials</div>
          <div className="muted" style={{ fontSize: 12 }}>Small-batch runs to validate recipe before pilot.</div>
        </div>
        <button className="btn btn-primary btn-sm">+ Log new trial</button>
      </div>
      <table>
        <thead><tr><th>Trial #</th><th>Date</th><th>Batch</th><th>Yield</th><th>Technologist</th><th>Result</th><th>Notes</th></tr></thead>
        <tbody>
          {window.NPD_TRIALS.map(t => (
            <tr key={t.id}>
              <td className="mono">{t.id}</td>
              <td className="mono">{t.date}</td>
              <td className="mono">{t.batch}</td>
              <td className="mono">{t.yield ? t.yield + "%" : "—"}</td>
              <td>{t.tech}</td>
              <td>{t.result === "pass" ? <span className="badge badge-green">✓ Pass</span> : t.result === "fail" ? <span className="badge badge-red">✗ Fail</span> : <span className="badge badge-amber">⟳ In progress</span>}</td>
              <td className="muted">{t.notes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </>
);

// ---------- Sensory panel ----------
const SensoryScreen = () => {
  const data = window.NPD_SENSORY;
  const cx = 140, cy = 140, r = 110;
  const n = data.length;
  const maxScore = 10;
  const pts = data.map((d, i) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const rr = (d.score / maxScore) * r;
    return { x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr, angle: a };
  });
  const labelPts = data.map((d, i) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return { x: cx + Math.cos(a) * (r + 18), y: cy + Math.sin(a) * (r + 18), anchor: Math.cos(a) > 0.1 ? "start" : Math.cos(a) < -0.1 ? "end" : "middle" };
  });
  const polygon = pts.map(p => `${p.x},${p.y}`).join(" ");

  return (
    <>
      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Sensory panel — Trial T-014</div>
            <div className="muted" style={{ fontSize: 12 }}>8 panelists · blind tasting · 2025-12-11</div>
          </div>
          <button className="btn btn-secondary btn-sm">Export scores</button>
        </div>

        <div className="radar-wrap">
          <svg width="320" height="300" viewBox="0 0 320 300">
            {[0.2, 0.4, 0.6, 0.8, 1.0].map((f, i) => (
              <polygon key={i} points={Array.from({ length: n }).map((_, j) => {
                const a = -Math.PI / 2 + (j / n) * Math.PI * 2;
                return `${cx + Math.cos(a) * r * f},${cy + Math.sin(a) * r * f}`;
              }).join(" ")} fill="none" stroke="#e2e8f0" strokeWidth="1" />
            ))}
            {data.map((_, i) => {
              const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
              return <line key={i} x1={cx} y1={cy} x2={cx + Math.cos(a) * r} y2={cy + Math.sin(a) * r} stroke="#e2e8f0" strokeWidth="1" />;
            })}
            <polygon points={polygon} fill="rgba(59,130,246,0.18)" stroke="#3b82f6" strokeWidth="2" />
            {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3" fill="#3b82f6" />)}
            {data.map((d, i) => (
              <text key={i} x={labelPts[i].x} y={labelPts[i].y} textAnchor={labelPts[i].anchor} fontSize="11" fill="#475569" dominantBaseline="middle">
                {d.attr}
              </text>
            ))}
          </svg>

          <div style={{ flex: 1 }}>
            <table>
              <thead><tr><th>Attribute</th><th>Score /10</th><th>vs benchmark</th></tr></thead>
              <tbody>
                {data.map(d => (
                  <tr key={d.attr}>
                    <td style={{ fontWeight: 500 }}>{d.attr}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 6, background: "var(--gray-100)", borderRadius: 3, overflow: "hidden", maxWidth: 140 }}>
                          <div style={{ width: `${d.score * 10}%`, height: "100%", background: d.score >= 7.5 ? "var(--green)" : d.score >= 6 ? "var(--amber)" : "var(--red)" }}></div>
                        </div>
                        <span className="mono" style={{ fontSize: 12 }}>{d.score.toFixed(1)}</span>
                      </div>
                    </td>
                    <td className="mono" style={{ color: d.score >= 7.5 ? "var(--green)" : "var(--muted)" }}>
                      {d.score >= 7.5 ? "+" : ""}{(d.score - 7.2).toFixed(1)}
                    </td>
                  </tr>
                ))}
                <tr style={{ background: "var(--gray-050)" }}>
                  <td style={{ fontWeight: 600 }}>Overall</td>
                  <td className="mono" style={{ fontWeight: 600 }}>7.6 / 10</td>
                  <td className="mono" style={{ color: "var(--green)" }}>✓ Above benchmark (7.2)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 8 }}>Panelist comments</div>
        <div className="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
          <strong>P-03:</strong> "Clean ham flavor, slightly salty but well-balanced."<br/>
          <strong>P-05:</strong> "Texture is firmer than the current market benchmark — positive."<br/>
          <strong>P-07:</strong> "Aftertaste lingers pleasantly. Would buy."<br/>
          <strong>P-02:</strong> "Slight metallic note — check nitrite level."
        </div>
      </div>
    </>
  );
};

// ---------- Pilot production ----------
const PilotScreen = () => (
  <>
    <div style={{ background: "#fef3c7", border: "1px solid #d97706", borderRadius: 6, padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 16 }}>⚠️</span>
      <div>
        <strong style={{ fontSize: 12 }}>LEGACY — Phase 2 deprecation</strong>
        <div style={{ fontSize: 11, color: "#92400e", marginTop: 2 }}>This screen is part of the legacy R&D pipeline and will NOT be implemented in production. Use the FA / Brief screens instead. See BL-NPD-02.</div>
      </div>
    </div>
    <div className="alert alert-blue"><strong>Scheduled pilot:</strong> Dec 20, 2025 · Line 2 · 500 kg batch · Supervisor: M. Johnson</div>

    <div className="card">
      <div className="card-title" style={{ marginBottom: 10 }}>Pilot run plan</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        <div><div className="muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Line</div><div style={{ fontWeight: 500 }}>Line 2 — Slicing/MAP</div></div>
        <div><div className="muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Batch size</div><div className="mono" style={{ fontWeight: 500 }}>500 kg</div></div>
        <div><div className="muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Expected yield</div><div className="mono" style={{ fontWeight: 500 }}>78% · ≈ 1,950 packs</div></div>
        <div><div className="muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Duration</div><div className="mono" style={{ fontWeight: 500 }}>≈ 6 hours</div></div>
      </div>
    </div>

    <div className="card">
      <div className="card-title" style={{ marginBottom: 10 }}>Material reservation</div>
      <table>
        <thead><tr><th>Ingredient</th><th>Required</th><th>Available</th><th>Reserved</th><th>Status</th></tr></thead>
        <tbody>
          <tr><td>Pork Ham, trimmed</td><td className="mono num">410 kg</td><td className="mono num">850 kg</td><td className="mono num">410 kg</td><td><span className="badge badge-green">✓ Reserved</span></td></tr>
          <tr><td>Soy Protein Isolate</td><td className="mono num">6 kg</td><td className="mono num">24 kg</td><td className="mono num">6 kg</td><td><span className="badge badge-green">✓ Reserved</span></td></tr>
          <tr><td>Carrageenan</td><td className="mono num">1.75 kg</td><td className="mono num">12 kg</td><td className="mono num">1.75 kg</td><td><span className="badge badge-green">✓ Reserved</span></td></tr>
          <tr><td>Spice Mix (Ham blend)</td><td className="mono num">4.5 kg</td><td className="mono num">3.2 kg</td><td className="mono num">3.2 kg</td><td><span className="badge badge-amber">⚠ Short 1.3 kg</span></td></tr>
          <tr><td>Natural Smoke Flavor</td><td className="mono num">0.4 kg</td><td className="mono num">2.1 kg</td><td className="mono num">0.4 kg</td><td><span className="badge badge-green">✓ Reserved</span></td></tr>
        </tbody>
      </table>
      <div className="alert alert-amber" style={{ marginTop: 10, marginBottom: 0 }}>
        <strong>Spice blend short by 1.3 kg.</strong> <a style={{ color: "var(--blue)", cursor: "pointer" }}>Raise PO</a> or reduce batch to 440 kg.
      </div>
    </div>

    <div className="card">
      <div className="card-title" style={{ marginBottom: 10 }}>Pilot checklist</div>
      {[
        ["Recipe approved (v0.3)", true],
        ["Trials completed (T-014 pass)", true],
        ["Sensory panel ≥ 7.0 overall", true],
        ["Materials reserved", false],
        ["QA present on line", false],
        ["Packaging artwork final", false],
        ["Samples set aside for retained", false]
      ].map(([label, checked], i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: i < 6 ? "1px solid var(--border)" : "none" }}>
          <div style={{ width: 18, height: 18, borderRadius: 3, border: "1.5px solid " + (checked ? "var(--green)" : "var(--border)"), background: checked ? "var(--green)" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12 }}>{checked && "✓"}</div>
          <span style={{ color: checked ? "var(--muted)" : "var(--text)", textDecoration: checked ? "line-through" : "none" }}>{label}</span>
        </div>
      ))}
    </div>
  </>
);

// ---------- Regulatory / approval ----------
const ApprovalScreen = ({ approvalMode }) => {
  const gates = [
    { name: "Nutrition targets met", status: "pass", detail: "All 7 values within spec (salt at limit)." },
    { name: "Allergens declared", status: "pass", detail: "Soy correctly declared on ingredient list (bold)." },
    { name: "Shelf-life validated", status: "pass", detail: "28 days confirmed via accelerated test (T-013)." },
    { name: "Sensory ≥ 7.0 overall", status: "pass", detail: "7.6 / 10 · 8 panelists." },
    { name: "Cost within target", status: "warn", detail: "Margin 7.5% vs 15% NPD minimum." },
    { name: "Label copy reviewed", status: "pending", detail: "Awaiting regulatory sign-off." },
    { name: "Pilot run completed", status: "pending", detail: "Scheduled Dec 20." }
  ];

  const steps = approvalMode === "multi" ? [
    { who: "R&D Lead", name: "K. Walker", status: "done", when: "2025-12-10" },
    { who: "QA Manager", name: "M. Johnson", status: "current", when: "pending" },
    { who: "Commercial", name: "J. Lewis", status: "pending", when: "—" },
    { who: "NPD Director", name: "A. Davis", status: "pending", when: "—" }
  ] : [
    { who: "NPD Manager", name: "A. Davis", status: "current", when: "pending" }
  ];

  return (
    <>
      <div className="card">
        <div className="card-head">
          <div className="card-title">Approval gates</div>
          <div><span className="badge badge-green">5 pass</span> <span className="badge badge-amber">1 warn</span> <span className="badge badge-gray">2 pending</span></div>
        </div>
        {gates.map((g, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i < gates.length - 1 ? "1px solid var(--border)" : "none" }}>
            {g.status === "pass" && <div style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--green)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>✓</div>}
            {g.status === "warn" && <div style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--amber)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>!</div>}
            {g.status === "pending" && <div style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--gray-100)", color: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>○</div>}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 13 }}>{g.name}</div>
              <div className="muted" style={{ fontSize: 12 }}>{g.detail}</div>
            </div>
            <button className="btn btn-ghost btn-sm">View</button>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">Approval chain {approvalMode === "multi" ? "(multi-step)" : "(single approver)"}</div>
          <button className="btn btn-primary btn-sm">Submit for approval</button>
        </div>
        {steps.map((s, i) => (
          <div key={i} className={`approval-step ${s.status}`}>
            <div className="step-num">{s.status === "done" ? "✓" : i + 1}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{s.who}</div>
              <div className="muted" style={{ fontSize: 12 }}>{s.name} · {s.when}</div>
            </div>
            {s.status === "done" && <span className="badge badge-green">Approved</span>}
            {s.status === "current" && <span className="badge badge-amber">Awaiting</span>}
            {s.status === "pending" && <span className="badge badge-gray">Pending</span>}
          </div>
        ))}
      </div>
    </>
  );
};

// ---------- Handoff to production BOM ----------
const HandoffScreen = () => (
  <>
    <div style={{ background: "#fef3c7", border: "1px solid #d97706", borderRadius: 6, padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 16 }}>⚠️</span>
      <div>
        <strong style={{ fontSize: 12 }}>LEGACY — Phase 2 deprecation</strong>
        <div style={{ fontSize: 11, color: "#92400e", marginTop: 2 }}>This screen is part of the legacy R&D pipeline and will NOT be implemented in production. Use the FA / Brief screens instead. See BL-NPD-02.</div>
      </div>
    </div>
    <div className="alert alert-green"><strong>Ready to promote.</strong> All gates pass. Clicking "Promote" will create BOM-<span className="mono">238</span> in Production and deactivate the NPD recipe.</div>

    <div className="card">
      <div className="card-title" style={{ marginBottom: 10 }}>Handoff checklist</div>
      {[
        "Recipe locked — v0.3 final",
        "Nutrition label approved by regulatory",
        "Packaging artwork finalized",
        "Pilot production successful (Dec 20 · 97% yield)",
        "Training material prepared for Line 2 operators",
        "First production order scheduled (WO-0152, Jan 8)"
      ].map((txt, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
          <span style={{ color: "var(--green)", fontWeight: 700 }}>✓</span>
          <span style={{ fontSize: 13 }}>{txt}</span>
        </div>
      ))}
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <div className="card">
        <div className="card-title" style={{ marginBottom: 8 }}>Destination BOM</div>
        <table>
          <tbody>
            <tr><td className="muted">BOM code</td><td className="mono">BOM-238 (new)</td></tr>
            <tr><td className="muted">Product SKU</td><td className="mono">SKU-2451 · Sliced Ham 200g</td></tr>
            <tr><td className="muted">Effective from</td><td className="mono">2026-01-08</td></tr>
            <tr><td className="muted">Production line</td><td>Line 2 — Slicing/MAP</td></tr>
            <tr><td className="muted">Linked to WO</td><td className="mono">WO-0152</td></tr>
          </tbody>
        </table>
      </div>
      <div className="card">
        <div className="card-title" style={{ marginBottom: 8 }}>What happens on promote</div>
        <ol className="muted" style={{ fontSize: 12, lineHeight: 1.7, paddingLeft: 18 }}>
          <li>Recipe v0.3 is frozen — no more edits via NPD.</li>
          <li>New BOM-238 created in Production module.</li>
          <li>SKU-2451 activated in Planning.</li>
          <li>First WO auto-scheduled Jan 8, 2026.</li>
          <li>Retailer specs sent to Commercial.</li>
          <li>NPD project archived; KPIs roll into launch report.</li>
        </ol>
      </div>
    </div>

    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
      <button className="btn btn-secondary">Export handoff packet</button>
      <button className="btn btn-primary">✓ Promote to production BOM</button>
    </div>
  </>
);

Object.assign(window, { PackagingScreen, TrialScreen, SensoryScreen, PilotScreen, ApprovalScreen, HandoffScreen });
