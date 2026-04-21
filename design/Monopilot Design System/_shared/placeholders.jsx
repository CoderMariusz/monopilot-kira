// ==============================================================
// SHARED PLACEHOLDER SCREEN — used across all module prototypes
// for sub-nav entries whose screens are designed but not yet built.
//
// Use when a spec'd screen exists but is scoped out of current
// phase. Never use as a shortcut for missing content that's
// in-phase — that should be built properly.
// ==============================================================

const ScaffoldedScreen = ({ breadcrumb, title, spec, phase, notes }) => (
  <>
    <div className="page-head">
      <div>
        <div className="breadcrumb">{breadcrumb}</div>
        <h1 className="page-title">{title}</h1>
      </div>
    </div>
    <div className="card" style={{padding:40, textAlign:"center", color:"var(--muted)"}}>
      <div style={{fontSize:48, opacity:0.22}}>◐</div>
      <div style={{fontSize:14, marginTop:12, color:"var(--text)", fontWeight:500}}>Designed — not yet built</div>
      {spec && <div style={{fontSize:12, marginTop:6, fontFamily:"var(--font-mono)"}}>{spec}</div>}
      {phase && <div style={{fontSize:11, marginTop:8}}><span className="badge badge-blue" style={{fontSize:10}}>{phase}</span></div>}
      {notes && <div style={{fontSize:12, marginTop:10, maxWidth:520, marginLeft:"auto", marginRight:"auto", lineHeight:1.5}}>{notes}</div>}
    </div>
  </>
);

Object.assign(window, { ScaffoldedScreen });
