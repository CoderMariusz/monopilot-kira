// ============================================================
// Other flows:
//   SCN-031 Move LP
//   SCN-060 Split LP
//   SCN-070/071/072/073 QA Inspection
//   SCN-inquiry LP info (P2 preview)
// ============================================================

// ---------- MOVE LP ----------
// FR-SC-BE-030/031 + D9 "block" severity: LP-modifying ops (move/split/consume)
// must acquire `lock-lp` lease before mutation. This screen now gates the
// Confirm action on `lockResult`: when lockResult.status === "locked_by_other"
// the Confirm button is disabled and an error + LpLockedSheet surfaces.
// Demo trigger: LP-00287 is mock-locked-by-another (Marta W.); any other LP
// acquires a 5-min lease for this operator and passes the gate.
const acquireLpLock = (lpData, operator = "Jan K.") => {
  if (!lpData) return null;
  // Mock: LP-00567 is held by another operator for demo of the blocking gate.
  // Real impl calls FR-SC-BE-030 `lock-lp` API and reads { status, lockedBy, expiresIn }.
  if (lpData.lp === "LP-00567") {
    return { status: "locked_by_other", lockedBy: "Marta W.", expiresIn: 140 };
  }
  return { status: "acquired", owner: operator, expiresIn: 300 };
};

const MoveScreen = ({ onNav, onDone }) => {
  const [scanVal, setScanVal] = React.useState("");
  const [lp, setLp] = React.useState(null);
  const [destScan, setDestScan] = React.useState("");
  const [dest, setDest] = React.useState(null);
  const [err, setErr] = React.useState(null);
  const [showLocked, setShowLocked] = React.useState(false);
  const [lockResult, setLockResult] = React.useState(null); // { status, lockedBy?, expiresIn }

  const onLpScan = (val) => {
    const code = (val || scanVal).trim().toUpperCase();
    const data = SCN_LPS[code];
    if (!data) { setErr(`LP ${code} nie znaleziony`); return; }
    if (data.qaStatus === "hold") { setErr("LP na QA Hold — nie można przenieść"); return; }
    if (data.status === "consumed") { setErr("LP już skonsumowany"); return; }
    // Acquire blocking lock — LP-modifying op requires lease.
    const result = acquireLpLock(data);
    setLockResult(result);
    if (result && result.status === "locked_by_other") {
      setLp(data);
      setErr(`LP zablokowany przez ${result.lockedBy} — operacja niemożliwa`);
      setShowLocked(true);
      return;
    }
    setLp(data);
    setErr(null);
  };
  const isBlocked = lockResult && lockResult.status === "locked_by_other";
  const onDestScan = (val) => {
    const code = (val || destScan).trim().toUpperCase();
    if (!code.startsWith("LOC")) { setErr("Kod lokalizacji musi zaczynać się od LOC-"); return; }
    if (lp && code === lp.location) { setErr("LP już w tej lokalizacji"); return; }
    setDest(code);
    setErr(null);
  };

  return (
    <>
      <Topbar title="Przesuń LP" onBack={() => onNav("home")}/>
      <Content>
        <ScanInputArea
          label="Zeskanuj LP do przeniesienia"
          placeholder="LP-XXXXX…"
          value={scanVal}
          onChange={setScanVal}
          onSubmit={onLpScan}
          hint="Skanuj etykietę LP"
          extra={<div style={{marginTop:8}}><Btn variant="sec" onClick={() => onLpScan("LP-00245")} style={{height:40, fontSize:12}}>Demo: LP-00245</Btn></div>}
        />
        {lp && (
          <>
            <MiniGrid rows={[
              [{ label:"Produkt", value: lp.product }, { label:"Ilość", value: `${lp.qty} ${lp.uom}` }],
              [{ label:"Partia", value: lp.batch, cls:"mono" }, { label:"Expiry", value: lp.expiry }],
              [{ label:"Obecna lok.", value: lp.location, cls:"mono" }, { label:"Status", value: lp.status }],
            ]}/>
            {isBlocked ? (
              <Banner kind="err" title={`🔒 LP zablokowany przez ${lockResult.lockedBy}`}>
                Inny operator trzyma lease. Operacja jest zablokowana — odczekaj {lockResult.expiresIn}s lub skontaktuj się z supervisorem.
              </Banner>
            ) : (
              <Banner kind="info" title="🔒 Lock acquired (5 min)">LP zablokowany dla Ciebie. Drugi operator nie może konkurować do końca operacji.</Banner>
            )}

            <div className="sc-sinput-area" style={{marginTop:6}}>
              <div className="sc-sinput-label">Lokalizacja docelowa</div>
              <input
                className="sc-sinput"
                placeholder="LOC-XXX-XX-XX…"
                value={destScan}
                onChange={e => setDestScan(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") onDestScan(); }}
              />
              <div className="sc-shint">Skanuj lub wybierz poniżej</div>
            </div>
            <div className="sc-quick-grid">
              {SCN_QUICK_LOCS.slice(0, 4).map(q => (
                <button key={q.code} className={"sc-quick " + (dest === q.code ? "on" : "")} onClick={() => { setDestScan(q.code); setDest(q.code); }}>
                  <div className="qc">{q.code}</div>
                  <div className="qz">{q.zone}</div>
                </button>
              ))}
            </div>
          </>
        )}
        {err && <div className="sc-inline-err">{err}</div>}
      </Content>
      <BottomActions>
        <Btn variant="p" disabled={!lp || !dest || isBlocked} onClick={() => onDone({ lp, from: lp.location, to: dest || destScan })}>
          {isBlocked ? "🔒 Zablokowane" : "Przenieś"}
        </Btn>
      </BottomActions>
      <LpLockedSheet open={showLocked} onClose={() => setShowLocked(false)} lp={lp ? lp.lp : ""} lockedBy={lockResult ? lockResult.lockedBy : "Marta W."} seconds={lockResult ? lockResult.expiresIn : 140}/>
    </>
  );
};

const MoveDoneScreen = ({ detail, onNav }) => (
  <>
    <Topbar title="Przeniesiono" onBack={() => onNav("home")}/>
    <Content>
      <div className="sc-success-wrap">
        <div className="sc-success-icon">✅</div>
        <div className="sc-success-title">LP przeniesiony</div>
        <div className="sc-success-sub">{detail.lp.lp} · {detail.lp.product}</div>
      </div>
      <div className="sc-fromto">
        <div className="sc-ft-pill from"><div className="sc-ft-label">Poprzednia</div><div className="sc-ft-code">{detail.from}</div></div>
        <div className="sc-ft-arrow">→</div>
        <div className="sc-ft-pill to"><div className="sc-ft-label">Nowa</div><div className="sc-ft-code">{detail.to}</div></div>
      </div>
    </Content>
    <BottomActions>
      <Btn variant="p" onClick={() => onNav("move")}>Przesuń kolejny</Btn>
      <Btn variant="sec" onClick={() => onNav("home")}>Wróć</Btn>
    </BottomActions>
  </>
);

// ---------- SPLIT LP ----------
// Split is an LP-modifying op → lease required (same as Move/Consume).
// lockResult gates the "Dalej" CTA when locked by another operator.
const SplitScanScreen = ({ onNav, onNext }) => {
  const [scanVal, setScanVal] = React.useState("");
  const [lp, setLp] = React.useState(null);
  const [err, setErr] = React.useState(null);
  const [showLocked, setShowLocked] = React.useState(false);
  const [lockResult, setLockResult] = React.useState(null);
  const onScan = (val) => {
    const code = (val || scanVal).trim().toUpperCase();
    const data = SCN_LPS[code];
    if (!data) { setErr(`LP ${code} nie znaleziony`); return; }
    if (data.status !== "available") { setErr(`LP status: ${data.status} — split niedostępny`); return; }
    if (data.qty <= 0) { setErr("LP ma zerową ilość"); return; }
    const result = acquireLpLock(data);
    setLockResult(result);
    if (result && result.status === "locked_by_other") {
      setLp(data);
      setErr(`LP zablokowany przez ${result.lockedBy} — split niemożliwy`);
      setShowLocked(true);
      return;
    }
    setLp(data); setErr(null);
  };
  const isBlocked = lockResult && lockResult.status === "locked_by_other";
  return (
    <>
      <Topbar title="Split LP" onBack={() => onNav("home")}/>
      <Content>
        <ScanInputArea
          label="Zeskanuj LP do podziału"
          placeholder="LP-XXXXX…"
          value={scanVal}
          onChange={setScanVal}
          onSubmit={onScan}
          extra={<div style={{marginTop:8}}><Btn variant="sec" onClick={() => onScan("LP-00245")} style={{height:40, fontSize:12}}>Demo: LP-00245</Btn></div>}
        />
        {lp && (
          <MiniGrid rows={[
            [{ label:"Produkt", value: lp.product }, { label:"Ilość", value: `${lp.qty} ${lp.uom}` }],
            [{ label:"Partia", value: lp.batch, cls:"mono" }, { label:"Expiry", value: lp.expiry }],
            [{ label:"Lok.", value: lp.location, cls:"mono" }, { label:"Status", value: lp.status }],
          ]}/>
        )}
        {err && <div className="sc-inline-err">{err}</div>}
        {lp && isBlocked ? (
          <Banner kind="err" title={`🔒 LP zablokowany przez ${lockResult.lockedBy}`}>
            Split wymaga wyłącznego lease. Odczekaj {lockResult.expiresIn}s lub użyj innego LP.
          </Banner>
        ) : (
          <Banner kind="info" title="Split zachowuje partię">Oryginalny LP zachowuje partię i datę. Nowy LP dziedziczy oba pola.</Banner>
        )}
      </Content>
      <BottomActions>
        <Btn variant="p" disabled={!lp || isBlocked} onClick={() => onNext(lp)}>
          {isBlocked ? "🔒 Zablokowane" : "Dalej: ilość"}
        </Btn>
      </BottomActions>
      <LpLockedSheet open={showLocked} onClose={() => setShowLocked(false)} lp={lp ? lp.lp : ""} lockedBy={lockResult ? lockResult.lockedBy : "Marta W."} seconds={lockResult ? lockResult.expiresIn : 140}/>
    </>
  );
};

const SplitQtyScreen = ({ lp, onNav, onDone }) => {
  const [qty, setQty] = React.useState("");
  const [showKeypad, setShowKeypad] = React.useState(false);
  const valid = Number(qty) > 0 && Number(qty) < lp.qty;
  const err = qty && !valid ? `Qty musi być > 0 i < ${lp.qty} ${lp.uom}` : null;
  const origRem = (lp.qty - Number(qty || 0)).toFixed(2);
  return (
    <>
      <Topbar title={"Split: " + lp.lp} onBack={() => onNav("split")}/>
      <Content>
        <MiniGrid rows={[
          [{ label:"LP", value: lp.lp, cls:"mono" }, { label:"Partia", value: lp.batch, cls:"mono" }],
          [{ label:"Dostępne", value: `${lp.qty} ${lp.uom}` }, { label:"Expiry", value: lp.expiry }],
        ]}/>
        <div className="sc-fgroup">
          <div className="sc-flabel">Ile przenieść na nowy LP? <span className="req">*</span></div>
          <input className="sc-finput big" value={qty} onClick={() => setShowKeypad(true)} readOnly placeholder="0" style={{cursor:"pointer"}}/>
          <div className="sc-fhint">Maks: {lp.qty} {lp.uom}</div>
        </div>
        {err && <div className="sc-inline-err">{err}</div>}

        <div className="sc-section-title">Podgląd po podziale</div>
        <div className="sc-split-grid">
          <div className="sc-split-orig">
            <div className="sc-split-label">Oryginał</div>
            <div className="sc-split-lp">{lp.lp}</div>
            <div className="sc-split-qty">{origRem} {lp.uom}</div>
          </div>
          <div className="sc-split-new">
            <div className="sc-split-label">Nowy LP</div>
            <div className="sc-split-lp">LP-XXXX (auto)</div>
            <div className="sc-split-qty">{qty || "0"} {lp.uom}</div>
          </div>
        </div>
      </Content>
      <BottomActions>
        <Btn variant="p" disabled={!valid} onClick={() => onDone({ lp, qty, origRem })}>Podziel LP</Btn>
      </BottomActions>
      <QtyKeypadSheet open={showKeypad} onClose={() => setShowKeypad(false)} initial={qty} max={lp.qty - 0.01} uom={lp.uom} onConfirm={setQty}/>
    </>
  );
};

const SplitDoneScreen = ({ detail, onNav }) => (
  <>
    <Topbar title="Podzielono" onBack={() => onNav("home")}/>
    <Content>
      <div className="sc-success-wrap">
        <div className="sc-success-icon">✂️</div>
        <div className="sc-success-title">LP podzielony</div>
        <div className="sc-success-sub">{detail.lp.product}</div>
      </div>
      <div className="sc-split-grid">
        <div className="sc-split-orig">
          <div className="sc-split-label">Oryginał</div>
          <div className="sc-split-lp">{detail.lp.lp}</div>
          <div className="sc-split-qty">{detail.origRem} {detail.lp.uom}</div>
          <div style={{fontSize:10, color:"var(--sc-mute)", marginTop:6}}>Partia {detail.lp.batch} (zachowana)</div>
        </div>
        <div className="sc-split-new">
          <div className="sc-split-label">Nowy LP</div>
          <div className="sc-split-lp">LP-00567</div>
          <div className="sc-split-qty">{detail.qty} {detail.lp.uom}</div>
          <div style={{fontSize:10, color:"#86efac", marginTop:6}}>Partia {detail.lp.batch} (odziedziczona)</div>
        </div>
      </div>
    </Content>
    <BottomActions>
      <Btn variant="p" onClick={() => onNav("split")}>Podziel kolejny</Btn>
      <Btn variant="sec" onClick={() => onNav("home")}>Wróć</Btn>
    </BottomActions>
  </>
);

// ---------- QA INSPECTION ----------
const QaListScreen = ({ onNav, onInspect }) => {
  const [scanVal, setScanVal] = React.useState("");
  return (
    <>
      <Topbar title="Inspekcja QC" onBack={() => onNav("home")}/>
      <Content>
        <ScanInputArea
          label="Zeskanuj LP do inspekcji"
          placeholder="LP-XXXXX…"
          value={scanVal}
          onChange={setScanVal}
          hint="Lub wybierz z listy poniżej"
        />
        <div className="sc-section-title">Oczekują inspekcji ({SCN_QA.length})</div>
        {SCN_QA.map(q => (
          <button key={q.lp} className="sc-litem" onClick={() => onInspect(q.lp)}>
            <div className="sc-licon">
              🔍
              <span className={"urg-dot urg-" + q.urgency}></span>
            </div>
            <div className="sc-linfo">
              <div className="sc-ltitle" style={{fontFamily:"'Courier New', monospace"}}>{q.lp}</div>
              <div className="sc-lsub">{q.product} · {q.batch}</div>
              <div style={{marginTop:4, fontSize:10, color: q.urgency === "red" ? "var(--sc-red)" : q.urgency === "amber" ? "var(--sc-amber)" : "var(--sc-mute)"}}>
                Oczekuje: {q.age} · {q.inspection} {q.woRef && `· ${q.woRef}`}
              </div>
            </div>
            <span className="sc-lchev">›</span>
          </button>
        ))}
      </Content>
    </>
  );
};

const QaInspectScreen = ({ lpCode, onNav, onResult }) => {
  const qaItem = SCN_QA.find(q => q.lp === lpCode) || SCN_QA[0];
  const lp = SCN_LPS[qaItem.lp] || { lp: qaItem.lp, product: qaItem.product, qty: 200, uom: "kg", batch: qaItem.batch, expiry: "2026-06-30", location: qaItem.location };
  const [notes, setNotes] = React.useState("");

  return (
    <>
      <Topbar title={"Inspekcja: " + qaItem.lp} onBack={() => onNav("qa")}/>
      <Content>
        <div className="sc-pad" style={{paddingTop:8, paddingBottom:0}}>
          <div style={{fontSize:10, color:"var(--sc-mute)", textTransform:"uppercase", letterSpacing:"0.1em"}}>Inspekcja: {qaItem.lp}</div>
        </div>
        <MiniGrid rows={[
          [{ label:"Produkt", value: lp.product }, { label:"Ilość", value: `${lp.qty} ${lp.uom}` }],
          [{ label:"Partia", value: lp.batch, cls:"mono" }, { label:"Expiry", value: lp.expiry }],
          [{ label:"Lokalizacja", value: lp.location || qaItem.location, cls:"mono" }, { label:"WO", value: qaItem.woRef || "—" }],
          [{ label:"Wiek", value: qaItem.age }, { label:"Typ", value: qaItem.inspection }],
        ]}/>

        <div className="sc-big3">
          <Btn variant="s" onClick={() => onResult({ lpCode, result: "pass", notes })}>✓ ZATWIERDŹ</Btn>
          <Btn variant="d" onClick={() => onResult({ lpCode, result: "fail_pre", notes })}>✗ ODRZUĆ</Btn>
          <Btn variant="w" onClick={() => onResult({ lpCode, result: "hold", notes })}>⏸ WSTRZYMAJ</Btn>
        </div>

        <div className="sc-fgroup">
          <div className="sc-flabel">Uwagi (opcjonalne)</div>
          <textarea className="sc-finput" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opcjonalne uwagi do inspekcji…"/>
        </div>
      </Content>
    </>
  );
};

const QaFailReasonScreen = ({ lpCode, notes, onNav, onDone }) => {
  const [sel, setSel] = React.useState(null);
  const [other, setOther] = React.useState("");
  const [extra, setExtra] = React.useState(notes || "");
  const needsOther = sel === "other";
  const canSubmit = sel && (!needsOther || other.length >= 5);
  return (
    <>
      <Topbar title="Przyczyna odrzucenia" onBack={() => onNav("qa_inspect", lpCode)}/>
      <Content>
        <div className="sc-pad">
          <div style={{fontSize:10, color:"var(--sc-mute)", textTransform:"uppercase", letterSpacing:"0.1em"}}>LP</div>
          <div style={{fontFamily:"'Courier New', monospace", fontWeight:700, fontSize:16}}>{lpCode}</div>
        </div>
        <div className="sc-section-title">Wybierz powód</div>
        <div className="sc-reason-list">
          {SCN_QA_REASONS.map(r => (
            <button key={r.id} className={"sc-reason-btn " + (sel === r.id ? "on" : "")} onClick={() => setSel(r.id)}>
              <span className="ri" style={{fontSize:20}}>{r.icon}</span>
              <span style={{flex:1}}>{r.label}</span>
              <span style={{color: sel === r.id ? "var(--sc-red)" : "var(--sc-elev)"}}>{sel === r.id ? "●" : "○"}</span>
            </button>
          ))}
        </div>
        {needsOther && (
          <div className="sc-fgroup">
            <div className="sc-flabel">Opisz powód <span className="req">*</span></div>
            <textarea className="sc-finput" value={other} onChange={e => setOther(e.target.value)} placeholder="Min. 5 znaków"/>
          </div>
        )}
        <div className="sc-fgroup">
          <div className="sc-flabel">Dodatkowe uwagi (opcjonalne)</div>
          <textarea className="sc-finput" value={extra} onChange={e => setExtra(e.target.value)} placeholder="Dodatkowy opis…"/>
        </div>
      </Content>
      <BottomActions>
        <Btn variant="d" disabled={!canSubmit} onClick={() => onDone({ lpCode, result: "fail", reason: sel === "other" ? other : SCN_QA_REASONS.find(r => r.id === sel).label, notes: extra })}>Utwórz NCR i zapisz</Btn>
      </BottomActions>
    </>
  );
};

const QaDoneScreen = ({ detail, onNav }) => {
  const pass = detail.result === "pass";
  const fail = detail.result === "fail";
  const hold = detail.result === "hold";
  return (
    <>
      <Topbar title="Inspekcja zakończona" onBack={() => onNav("qa")}/>
      <Content style={pass ? null : fail ? {background:"#1a0a0a"} : {background:"#1f1400"}}>
        <div className="sc-success-wrap">
          <div className="sc-success-icon" style={{color: pass ? "var(--sc-green)" : fail ? "var(--sc-red)" : "var(--sc-amber)"}}>
            {pass ? "✅" : fail ? "✗" : "⏸"}
          </div>
          <div className="sc-success-title" style={{color: pass ? "var(--sc-green)" : fail ? "var(--sc-red)" : "var(--sc-amber)"}}>
            {pass ? "Partia zatwierdzona" : fail ? "Partia odrzucona" : "Partia wstrzymana"}
          </div>
          <div className="sc-success-sub">{detail.lpCode}</div>
        </div>
        {pass && (
          <div className="sc-pad" style={{textAlign:"center"}}>
            <span className="sc-status st-released">DOSTĘPNE</span>
          </div>
        )}
        {fail && (
          <>
            <div className="sc-ncr-card">
              <div className="sc-ncr-num">NCR-2026-0{Math.floor(40 + Math.random() * 9)}</div>
              <div className="sc-ncr-reason">Przyczyna: {detail.reason}</div>
              {detail.notes && <div className="sc-ncr-reason">Uwagi: {detail.notes}</div>}
            </div>
            <div className="sc-pad" style={{textAlign:"center"}}>
              <span className="sc-status st-blocked">ZABLOKOWANE</span>
            </div>
          </>
        )}
        {hold && (
          <div className="sc-pad" style={{textAlign:"center"}}>
            <span className="sc-status st-onhold">WSTRZYMANE</span>
            <div style={{fontSize:11, color:"var(--sc-mute)", marginTop:8}}>
              LP jest niedostępne do czasu rozstrzygnięcia.
            </div>
          </div>
        )}
        <div className="sc-qa-counter">Wykonano dziś: {Math.floor(1 + Math.random() * 4)} inspekcji</div>
      </Content>
      <BottomActions>
        <Btn variant="p" onClick={() => onNav("qa")}>Następna inspekcja</Btn>
        <Btn variant="sec" onClick={() => onNav("home")}>Wróć do menu</Btn>
      </BottomActions>
    </>
  );
};

// ---------- LP INQUIRY (P2 preview) ----------
const InquiryScreen = ({ onNav }) => {
  const [scanVal, setScanVal] = React.useState("");
  const [lp, setLp] = React.useState(null);
  const [err, setErr] = React.useState(null);
  const onScan = (val) => {
    const code = (val || scanVal).trim().toUpperCase();
    const data = SCN_LPS[code];
    if (!data) { setErr(`LP ${code} nie znaleziony`); return; }
    setLp(data); setErr(null);
  };
  return (
    <>
      <Topbar title="LP info" onBack={() => onNav("home")}/>
      <Content>
        <Banner kind="info" title="P2 preview">Pełna funkcja inspekcji LP z genealogią dostępna w P2.</Banner>
        <ScanInputArea
          label="Zeskanuj dowolny LP"
          placeholder="LP-XXXXX…"
          value={scanVal}
          onChange={setScanVal}
          onSubmit={onScan}
          extra={<div style={{marginTop:8}}><Btn variant="sec" onClick={() => onScan("LP-00234")} style={{height:40, fontSize:12}}>Demo: LP-00234</Btn></div>}
        />
        {err && <div className="sc-inline-err">{err}</div>}
        {lp && (
          <>
            <MiniGrid rows={[
              [{ label:"LP", value: lp.lp, cls:"mono" }, { label:"Produkt", value: lp.product }],
              [{ label:"Ilość", value: `${lp.qty} ${lp.uom}` }, { label:"Partia", value: lp.batch, cls:"mono" }],
              [{ label:"Expiry", value: lp.expiry }, { label:"Lokalizacja", value: lp.location || "—", cls:"mono" }],
              [{ label:"Status", value: lp.status }, { label:"QA", value: lp.qaStatus }],
            ]}/>
            <div className="sc-section-title">Historia LP (P2)</div>
            <div className="sc-pad" style={{opacity:0.6, fontSize:12}}>
              <div>→ Przyjęcie PO · 2026-04-10 · Agro-Fresh Ltd.</div>
              <div>→ Putaway · 2026-04-10 · LOC-A-01-02</div>
              <div>→ Move · 2026-04-12 · LOC-A-02-01</div>
              <div style={{marginTop:6, color:"var(--sc-hint)", fontSize:10}}>Pełna traceability w P2</div>
            </div>
          </>
        )}
      </Content>
      <BottomActions>
        <Btn variant="sec" onClick={() => onNav("home")}>Wróć do menu</Btn>
      </BottomActions>
    </>
  );
};

Object.assign(window, {
  MoveScreen, MoveDoneScreen,
  SplitScanScreen, SplitQtyScreen, SplitDoneScreen,
  QaListScreen, QaInspectScreen, QaFailReasonScreen, QaDoneScreen,
  InquiryScreen,
  acquireLpLock,
});
