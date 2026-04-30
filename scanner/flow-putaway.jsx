// ============================================================
// SCN-040 Putaway — scan LP → suggest → confirm or override
// ============================================================

const PutawayScanScreen = ({ onNav, onSuggest }) => {
  const [scanVal, setScanVal] = React.useState("");
  const [lp, setLp] = React.useState(null);
  const [scanState, setScanState] = React.useState("idle");
  const [err, setErr] = React.useState(null);

  const submit = (val) => {
    const code = (val || scanVal).trim().toUpperCase();
    if (!code.startsWith("LP")) { setErr("Kod LP musi zaczynać się od LP-"); setScanState("err"); return; }
    const data = SCN_LPS[code];
    if (!data) { setErr(`LP ${code} nie znaleziony`); setScanState("err"); return; }
    if (data.status !== "available" && data.status !== "qc_pending") {
      setErr(`LP status: ${data.status} — putaway niedostępny`); setScanState("err"); return;
    }
    setLp(data);
    setScanState("ok");
    setErr(null);
  };

  const age = lp ? Math.abs(Math.round((new Date(lp.expiry) - new Date("2026-04-21")) / 86400000)) : 0;
  const expCls = age < 14 ? "red" : age < 60 ? "amber" : "green";

  return (
    <>
      <Topbar title="Putaway" onBack={() => onNav("home")}/>
      <Content>
        <ScanInputArea
          label="Zeskanuj LP do odłożenia"
          placeholder="LP-XXXXX…"
          hint="Skanuj etykietę z dokumentu przyjęcia"
          value={scanVal}
          onChange={setScanVal}
          onSubmit={submit}
          state={scanState}
          extra={
            <div style={{display:"flex", gap:8, marginTop:8}}>
              <Btn variant="sec" onClick={() => submit("LP-00567")} style={{flex:1, height:40, fontSize:12}}>Demo: LP-00567</Btn>
              <Btn variant="sec" onClick={() => submit("LP-00401")} style={{flex:1, height:40, fontSize:12}}>Demo: LP-00401</Btn>
            </div>
          }
        />
        {err && <div className="sc-inline-err">{err}</div>}

        {lp && (
          <>
            <MiniGrid rows={[
              [{ label:"Produkt", value: lp.product }, { label:"Ilość", value: `${lp.qty} ${lp.uom}` }],
              [{ label:"Partia", value: lp.batch, cls:"mono" }, { label:"Expiry", value: lp.expiry, cls: expCls }],
              [{ label:"Obecna lok.", value: lp.location || "Bez lokalizacji", cls:"mono" }, { label:"Status", value: lp.status }],
            ]}/>
          </>
        )}
      </Content>
      <BottomActions>
        <Btn variant="p" disabled={!lp} onClick={() => onSuggest(lp)}>Sprawdź sugestię</Btn>
      </BottomActions>
    </>
  );
};

const PutawaySuggestScreen = ({ lp, onNav, onDone }) => {
  // Mock: suggest a location based on product
  const suggested = {
    code: "LOC-B-02-03",
    strategy: "FEFO",
    hint: "Inne LP tego produktu już w tej strefie",
  };
  const [scanVal, setScanVal] = React.useState("");
  const [scanState, setScanState] = React.useState("idle");
  const [showReason, setShowReason] = React.useState(false);
  const [overrideLoc, setOverrideLoc] = React.useState(null);
  const [err, setErr] = React.useState(null);

  const submit = (val) => {
    const code = (val || scanVal).trim().toUpperCase();
    if (!code.startsWith("LOC")) { setErr("Kod lokalizacji musi zaczynać się od LOC-"); setScanState("err"); return; }
    if (code === suggested.code) {
      setScanState("ok");
      setErr(null);
      setTimeout(() => onDone({ lp, from: lp.location, to: code, strategy: suggested.strategy, override: false }), 350);
      return;
    }
    // Override — needs reason
    setOverrideLoc(code);
    setShowReason(true);
    setScanState("ok");
  };

  return (
    <>
      <Topbar title="Sugestia lokalizacji" onBack={() => onNav("putaway")}/>
      <Content>
        <div className="sc-pad" style={{textAlign:"center"}}>
          <div style={{background:"var(--sc-surf)", border:"2px solid var(--sc-green-bd)", borderRadius:16, padding:20, margin:"8px 0 12px"}}>
            <div style={{fontSize:10, color:"var(--sc-mute)", textTransform:"uppercase", letterSpacing:"0.1em", fontWeight:700, marginBottom:8}}>Sugerowana lokalizacja</div>
            <div style={{fontSize:28, fontWeight:700, fontFamily:"'Courier New', monospace", letterSpacing:2, color:"var(--sc-txt)"}}>{suggested.code}</div>
            <div style={{marginTop:8, display:"flex", gap:6, justifyContent:"center"}}>
              <span className="sc-status st-released">{suggested.strategy}</span>
            </div>
            <div style={{fontSize:11, color:"var(--sc-mute)", marginTop:8}}>{suggested.hint}</div>
          </div>
        </div>

        <ScanInputArea
          label="Zeskanuj lokalizację docelową"
          placeholder="LOC-XXX-XX-XX…"
          hint="Zeskanuj sugerowaną lub wybierz inną"
          value={scanVal}
          onChange={setScanVal}
          onSubmit={submit}
          state={scanState}
          extra={
            <div style={{display:"flex", gap:8, marginTop:8}}>
              <Btn variant="sec" onClick={() => submit(suggested.code)} style={{flex:1, height:40, fontSize:12}}>Demo: potwierdź FEFO</Btn>
              <Btn variant="sec" onClick={() => submit("LOC-C-05-01")} style={{flex:1, height:40, fontSize:12}}>Demo: override</Btn>
            </div>
          }
        />
        {err && <div className="sc-inline-err">{err}</div>}

        <div className="sc-section-title">Inne opcje</div>
        <div className="sc-quick-grid">
          {SCN_QUICK_LOCS.slice(0, 4).map(q => (
            <button key={q.code} className="sc-quick" onClick={() => submit(q.code)}>
              <div className="qc">{q.code}</div>
              <div className="qz">{q.zone}</div>
            </button>
          ))}
        </div>
      </Content>
      <ReasonPickerSheet
        open={showReason}
        onClose={() => setShowReason(false)}
        title="Inna lokalizacja niż sugestia"
        reasons={SCN_REASONS_PUTAWAY}
        onConfirm={({ id, other }) => onDone({ lp, from: lp.location, to: overrideLoc, strategy: suggested.strategy, override: true, reason: id === "other" ? other : id })}
      />
    </>
  );
};

const PutawayDoneScreen = ({ detail, onNav }) => (
  <>
    <Topbar title="Putaway gotowe" onBack={() => onNav("home")}/>
    <Content>
      <div className="sc-success-wrap">
        <div className="sc-success-icon">✅</div>
        <div className="sc-success-title">LP odłożony</div>
        <div className="sc-success-sub">{detail.lp.lp} · {detail.lp.product}</div>
      </div>
      <div className="sc-fromto">
        <div className="sc-ft-pill from">
          <div className="sc-ft-label">Z:</div>
          <div className="sc-ft-code">{detail.from || "Bez lok."}</div>
        </div>
        <div className="sc-ft-arrow">→</div>
        <div className="sc-ft-pill to">
          <div className="sc-ft-label">Do:</div>
          <div className="sc-ft-code">{detail.to}</div>
        </div>
      </div>
      <div className="sc-pad" style={{textAlign:"center", fontSize:12, color:"var(--sc-mute)"}}>
        Strategia: <span style={{color:"var(--sc-green)", fontWeight:700}}>{detail.strategy}</span>
        {" · "}
        Override: <span style={{color: detail.override ? "var(--sc-amber)" : "var(--sc-green)", fontWeight:700}}>{detail.override ? "Tak" : "Nie"}</span>
      </div>
      {detail.override && <Banner kind="warn" title="Override zalogowany">Powód: {detail.reason}</Banner>}
    </Content>
    <BottomActions>
      <Btn variant="p" onClick={() => onNav("putaway")}>Odłóż kolejny LP</Btn>
      <Btn variant="sec" onClick={() => onNav("home")}>Wróć do menu</Btn>
    </BottomActions>
  </>
);

Object.assign(window, { PutawayScanScreen, PutawaySuggestScreen, PutawayDoneScreen });
