// ============================================================================
// SCR-09 Allergen Cascade Preview — RM → Process → FA final derivation chain
// ============================================================================

const AllergenCascade = ({ onOpenFA, openModal, initialFa }) => {
  const faCodes = Object.keys(window.NPD_ALLERGEN_CASCADE);
  const [fa, setFa] = React.useState(initialFa || faCodes[0]);
  const cascade = window.NPD_ALLERGEN_CASCADE[fa];
  const faObj = window.NPD_FAS.find(f => f.fa_code === fa) || window.NPD_FAS[0];

  // BL-NPD-05 — SVG refresh animation
  const [refreshKey, setRefreshKey] = React.useState(0);

  // BL-NPD-04 — Simulated WebSocket polling indicator
  const [lastUpdated, setLastUpdated] = React.useState(new Date());
  const [pollCount, setPollCount] = React.useState(0);
  const [secondsAgo, setSecondsAgo] = React.useState(0);

  React.useEffect(() => {
    const pollTimer = setInterval(() => {
      setLastUpdated(new Date());
      setPollCount(c => c + 1);
      setRefreshKey(k => k + 1);
    }, 30000);
    return () => clearInterval(pollTimer);
  }, []);

  React.useEffect(() => {
    const tickTimer = setInterval(() => {
      setSecondsAgo(Math.round((Date.now() - lastUpdated.getTime()) / 1000));
    }, 5000);
    return () => clearInterval(tickTimer);
  }, [lastUpdated]);

  if (!cascade) return <div className="card">No cascade data for {fa}.</div>;

  return (
    <>
      <div className="breadcrumb"><a>NPD</a> / Allergen cascade</div>
      <div className="page-head">
        <div>
          <div className="page-title">Allergen cascade preview</div>
          <div className="muted" style={{ fontSize: 12 }}>
            Visual trace RM → Process → FA · Regulation: EU FIC 1169/2011 · 14 mandatory allergens
            &nbsp;&nbsp;<span className="live-dot"></span><span className="muted" style={{ fontSize: 11 }}>Live · updated {secondsAgo}s ago</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select value={fa} onChange={e => { setFa(e.target.value); setRefreshKey(k => k + 1); }} style={{ width: "auto" }}>
            {faCodes.map(c => <option key={c}>{c}</option>)}
          </select>
          <button className="btn btn-secondary" onClick={() => { openModal("allergenRefresh", { fa: faObj }); setRefreshKey(k => k + 1); }}>↻ Refresh</button>
          <button className="btn btn-primary" onClick={() => onOpenFA(fa)}>Open FA →</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        {/* Column 1 — From Raw Materials */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 10 }}>① From raw materials</div>
          {cascade.rm.map(r => (
            <div key={r.rm} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="mono" style={{ color: "var(--blue)", fontWeight: 600 }}>{r.rm}</span>
                <span className="muted" style={{ fontSize: 12 }}>{r.name}</span>
              </div>
              <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                {r.allergens.length > 0
                  ? r.allergens.map(a => <span key={a} className="badge" style={{ background: "#fee2e2", color: "#991b1b", fontSize: 10 }}>{a}</span>)
                  : <span className="muted" style={{ fontSize: 11 }}>no allergens</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Column 2 — From Processes */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 10 }}>② From processes</div>
          {cascade.process.map(p => (
            <div key={p.name} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{ fontWeight: 500 }}>{p.name}</div>
              <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                {p.added?.length
                  ? p.added.map(a => <span key={a} className="badge" style={{ background: "#fee2e2", color: "#991b1b", fontSize: 10 }}>{a}</span>)
                  : <span className="muted" style={{ fontSize: 11 }}>no new allergens</span>}
                {p.may?.map(a => <span key={a} className="badge badge-amber" style={{ fontSize: 10 }}>may: {a}</span>)}
              </div>
            </div>
          ))}
        </div>

        {/* Column 3 — FA Final */}
        <div className="card" style={{ borderColor: "var(--blue)", borderWidth: 2 }}>
          <div className="card-title" style={{ marginBottom: 10 }}>③ FA Final — {faObj.fa_code}</div>
          <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Contains</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {cascade.final.contains.map(a => (
              <span key={a.allergen} className="badge" style={{ background: "#fee2e2", color: "#991b1b", border: a.manual ? "2px solid var(--amber)" : "none", fontWeight: 600 }}>
                {a.allergen}{a.manual && " · Manual"}
              </span>
            ))}
          </div>
          <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>May contain</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {cascade.final.may_contain.map(a => (
              <span key={a.allergen} className="badge badge-amber" style={{ fontWeight: 600 }}>{a.allergen}</span>
            ))}
          </div>
          <div className="alert alert-blue" style={{ marginTop: 12, fontSize: 12 }}>
            <strong>Derivation:</strong> Contains = union(RM allergens) ∪ union(Process added). May-contain = line 24h changeover history.
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 10 }}>Cascade diagram</div>
        <div key={refreshKey} className="cascade-flash">
        <svg viewBox="0 0 900 220" style={{ width: "100%", height: 220, background: "var(--gray-050)", borderRadius: 6 }}>
          {/* boxes */}
          <g fontFamily="var(--font-mono)" fontSize="11">
            {cascade.rm.map((r, i) => (
              <g key={r.rm}>
                <rect x={20} y={20 + i * 34} width={160} height={26} rx={4} fill={r.allergens.length ? "#fee2e2" : "#fff"} stroke="#cbd5e1" />
                <text x={30} y={37 + i * 34} fill="#1e293b">{r.rm}</text>
                <text x={100} y={37 + i * 34} fill="#64748b" fontSize="10">{r.allergens.join(",") || "—"}</text>
                <line x1={180} y1={33 + i * 34} x2={360} y2={110} stroke="#94a3b8" strokeWidth="1" />
              </g>
            ))}
            {cascade.process.map((p, i) => (
              <g key={p.name}>
                <rect x={360} y={70 + i * 34} width={160} height={26} rx={4} fill="#fff" stroke="#cbd5e1" />
                <text x={370} y={87 + i * 34} fill="#1e293b">{p.name}</text>
                <line x1={520} y1={83 + i * 34} x2={700} y2={110} stroke="#94a3b8" strokeWidth="1" />
              </g>
            ))}
            <rect x={700} y={80} width={180} height={60} rx={4} fill="#dbeafe" stroke="var(--blue)" strokeWidth="2" />
            <text x={715} y={105} fill="var(--blue)" fontWeight="600">{faObj.fa_code}</text>
            <text x={715} y={125} fill="#1e293b">Contains: {cascade.final.contains.map(a => a.allergen).join(",") || "—"}</text>
          </g>
        </svg>
        </div>
      </div>
    </>
  );
};

Object.assign(window, { AllergenCascade });
