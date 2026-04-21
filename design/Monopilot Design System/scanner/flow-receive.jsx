// ============================================================
// SCN-020 Receive PO, SCN-030 Receive TO
// Multi-LP split per PO line; TO confirm checklist.
// ============================================================

// ----- PO list -----
const PoListScreen = ({ onNav, onOpenPo }) => {
  const [q, setQ] = React.useState("");
  return (
    <>
      <Topbar title="Przyjęcie PO" onBack={() => onNav("home")}/>
      <Content>
        <ScanInputArea
          label="Zeskanuj numer PO"
          placeholder="PO-XXXX-XXXX lub wpisz…"
          hint="Skanuj kod z dokumentu dostawy"
          value={q}
          onChange={setQ}
        />
        {SCN_POS.filter(p => (p.code + " " + p.supplier).toLowerCase().includes(q.toLowerCase())).map(p => (
          <button key={p.code} className="sc-litem" onClick={() => onOpenPo(p.code)}>
            <div className="sc-licon">
              📦
              <span className={"urg-dot urg-" + p.urgency}></span>
            </div>
            <div className="sc-linfo">
              <div className="sc-ltitle" style={{fontFamily:"'Courier New', monospace"}}>{p.code}</div>
              <div className="sc-lsub">{p.supplier} · ETA {p.eta}</div>
              <div style={{marginTop:4}}><StatusChip status={p.status}/></div>
            </div>
            <span className="sc-lchev">›</span>
          </button>
        ))}
      </Content>
    </>
  );
};

// ----- PO lines -----
const PoLinesScreen = ({ poCode, onNav, onOpenLine }) => {
  const po = SCN_POS.find(p => p.code === poCode) || SCN_POS[0];
  return (
    <>
      <Topbar title={po.code} onBack={() => onNav("receive_po")}/>
      <Content>
        <div className="sc-wo-card">
          <div className="sc-wo-top">
            <div>
              <div className="sc-wo-num" style={{fontSize:16}}>{po.code}</div>
              <div className="sc-wo-prod">{po.supplier}</div>
              <div style={{marginTop:6}}><StatusChip status={po.status}/></div>
            </div>
            <div style={{textAlign:"right", fontSize:10, color:"var(--sc-hint)"}}>
              ETA <div style={{fontWeight:700, marginTop:2}}>{po.eta}</div>
            </div>
          </div>
          <div className="sc-wo-meta">
            <div className="sc-wm"><div className="sc-wm-label">Linii</div><div className="sc-wm-val">{po.lines.length}</div></div>
            <div className="sc-wm"><div className="sc-wm-label">Pilność</div><div className={"sc-wm-val " + (po.urgency === "red" ? "amber" : "")}>{po.urgency === "red" ? "WYSOKA" : po.urgency === "amber" ? "ŚREDNIA" : "NORMALNA"}</div></div>
          </div>
        </div>

        <div className="sc-section-title">Pozycje PO</div>
        {po.lines.map(l => {
          const pct = Math.round((l.received / l.ordered) * 100);
          const done = l.received >= l.ordered;
          return (
            <button key={l.id} className="sc-crow" onClick={() => onOpenLine(po.code, l.id)}>
              <div className={"sc-ccheck cck-" + (done ? "ok" : l.received > 0 ? "warn" : "empty")}>
                {done ? "✓" : l.received > 0 ? pct + "%" : "○"}
              </div>
              <div style={{flex:1, minWidth:0}}>
                <div className="sc-cname">{l.product}</div>
                <div className="sc-cdet">{l.sku} · GTIN {l.gtin}</div>
              </div>
              <div>
                <div className="sc-cqty-val" style={{color: done ? "var(--sc-green)" : "var(--sc-amber)"}}>{l.received}</div>
                <div className="sc-cqty-of">/ {l.ordered} {l.uom}</div>
              </div>
            </button>
          );
        })}
      </Content>
    </>
  );
};

// ----- PO item (4-step receive form) -----
const PoItemScreen = ({ poCode, lineId, onNav, onDone }) => {
  const po = SCN_POS.find(p => p.code === poCode) || SCN_POS[0];
  const line = po.lines.find(l => l.id === lineId) || po.lines[0];
  const remaining = line.ordered - line.received;

  const [step, setStep] = React.useState(0);
  const [gs1, setGs1] = React.useState("");
  const [batch, setBatch] = React.useState("");
  const [expiry, setExpiry] = React.useState("");
  const [qty, setQty] = React.useState(String(remaining));
  const [loc, setLoc] = React.useState("");
  const [showBb, setShowBb] = React.useState(null);
  const [bbNote, setBbNote] = React.useState(null);
  const [overWarn, setOverWarn] = React.useState(false);
  const [showKeypad, setShowKeypad] = React.useState(false);

  const autoExtract = (val) => {
    setGs1(val);
    // Simulate GS1-128 parse
    setBatch("B20260410");
    setExpiry("2026-07-01");
    setTimeout(() => setStep(1), 300);
  };

  const confirmStep = () => {
    if (step === 2) {
      if (Number(qty) > remaining && !overWarn) { setOverWarn(true); return; }
    }
    if (step === 1) {
      const today = new Date("2026-04-21");
      const exp = new Date(expiry);
      const daysLeft = Math.round((exp - today) / 86400000);
      if (daysLeft <= 14) {
        setShowBb({ daysLeft });
        return;
      }
    }
    if (step === 3) {
      const lp = "LP-0" + Math.floor(500 + Math.random() * 499);
      onDone({ lp, batch, expiry, qty, loc: loc || "LOC-A-04-01", poCode, line: line.product, bbNote });
      return;
    }
    setStep(step + 1);
  };

  return (
    <>
      <Topbar title={"Przyjęcie: " + line.product} onBack={() => step === 0 ? onNav("po_lines", poCode) : setStep(step - 1)}/>
      <Content>
        <StepsBar steps={["Produkt", "Partia/Expiry", "Ilość", "Lokalizacja"]} current={step}/>

        {step === 0 && (
          <>
            <ScanInputArea
              label="Zeskanuj kod GS1-128 z dostawcy"
              placeholder="GTIN / GS1-128…"
              hint="Kod ekstraktuje GTIN, partię i datę ważności"
              value={gs1}
              onChange={setGs1}
              extra={<div style={{marginTop:8}}><Btn variant="sec" onClick={() => autoExtract("]C1" + line.gtin + "1710010724")} style={{height:40, fontSize:12}}>Demo: skanuj GS1</Btn></div>}
            />
            {gs1 && (
              <MiniGrid rows={[
                [{ label: "Produkt", value: line.product }, { label: "SKU", value: line.sku, cls:"mono" }],
                [{ label: "GTIN", value: line.gtin, cls:"mono" }, { label: "UoM", value: line.uom }],
                [{ label: "Pozostało", value: `${remaining} ${line.uom}` }, { label: "Catch weight", value: line.isCW ? "Tak" : "Nie" }],
              ]}/>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <div className="sc-fgroup">
              <div className="sc-flabel">Partia / Numer serii <span className="req">*</span></div>
              <input className="sc-finput" value={batch} onChange={e => setBatch(e.target.value)} placeholder="B-..."/>
              <div className="sc-fhint">Auto-wypełnione z GS1 AI 10</div>
            </div>
            <div className="sc-fgroup">
              <div className="sc-flabel">Data ważności <span className="req">*</span></div>
              <input className="sc-finput" type="date" value={expiry} onChange={e => setExpiry(e.target.value)}/>
              <div className="sc-fhint">Auto z GS1 AI 17</div>
            </div>
            {bbNote && <Banner kind="warn" title="Best-before zaakceptowane">Powód: {bbNote}</Banner>}
          </>
        )}

        {step === 2 && (
          <>
            <div className="sc-fgroup">
              <div className="sc-flabel">Ilość przyjmowana <span className="req">*</span></div>
              <input className="sc-finput big" value={qty} onClick={() => setShowKeypad(true)} readOnly style={{cursor:"pointer"}}/>
              <div className="sc-fhint">Pozostało na PO: {remaining} {line.uom}</div>
            </div>
            {overWarn && (
              <Banner kind="warn" title="Przekroczenie zamówienia">
                Ilość przekracza zamówioną ({remaining} {line.uom}). Nadwyżka: {Number(qty) - remaining} {line.uom}. Kliknij Dalej aby potwierdzić.
              </Banner>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <ScanInputArea
              label="Zeskanuj lokalizację"
              placeholder="LOC-A-04-01…"
              value={loc}
              onChange={setLoc}
              hint="Skanuj lokalizację docelową"
            />
            <div className="sc-section-title">Szybki wybór</div>
            <div className="sc-quick-grid">
              {SCN_QUICK_LOCS.map(q => (
                <button key={q.code} className="sc-quick" onClick={() => setLoc(q.code)}>
                  <div className="qc">{q.code}</div>
                  <div className="qz">{q.zone}</div>
                </button>
              ))}
            </div>
            <div className="sc-fgroup">
              <div className="sc-flabel">Paleta / kontener (opcjonalne)</div>
              <div style={{display:"flex", gap:8}}>
                <input className="sc-finput" style={{flex:1}} placeholder="PAL-XXXXX lub pomiń"/>
                <Btn variant="sec" style={{flex:"0 0 auto", padding:"0 14px", height:44}}>Generuj</Btn>
              </div>
            </div>
          </>
        )}
      </Content>
      <BottomActions>
        {step < 3 && <Btn variant="p" disabled={(step === 0 && !gs1) || (step === 1 && (!batch || !expiry))} onClick={confirmStep}>Dalej →</Btn>}
        {step === 3 && <Btn variant="s" disabled={!loc && !SCN_QUICK_LOCS[0]} onClick={confirmStep}>Zatwierdź przyjęcie</Btn>}
      </BottomActions>
      <BestBeforeSheet
        open={!!showBb}
        onClose={() => setShowBb(null)}
        lp={{ lp:"(nowy LP)", product: line.product, expiry }}
        daysLeft={showBb ? showBb.daysLeft : 0}
        onConfirm={({ reason }) => { setBbNote(reason); setStep(step + 1); }}
      />
      <QtyKeypadSheet open={showKeypad} onClose={() => setShowKeypad(false)} initial={qty} max={remaining * 2} uom={line.uom} onConfirm={setQty}/>
    </>
  );
};

// ----- PO done -----
const PoDoneScreen = ({ detail, onNav }) => {
  const [showPrinter, setShowPrinter] = React.useState(false);
  return (
    <>
      <Topbar title="Przyjęto" onBack={() => onNav("po_lines", detail.poCode)}/>
      <Content>
        <div className="sc-success-wrap">
          <div className="sc-success-icon">✅</div>
          <div className="sc-success-title">Przyjęto!</div>
          <div className="sc-success-sub">{detail.poCode} · {detail.line}</div>
        </div>
        <div className="sc-lp-card">
          <div className="sc-lp-num">{detail.lp}</div>
          <div className="sc-lp-sub">Nowy LP · {detail.qty} kg · Partia {detail.batch} · Expiry {detail.expiry}</div>
          <div className="sc-lp-sub">📍 {detail.loc}</div>
        </div>
        {detail.bbNote && <Banner kind="warn" title="Best-before zaakceptowane">Powód: {detail.bbNote}</Banner>}
        <div className="sc-pad">
          <Btn variant="sec" onClick={() => setShowPrinter(true)}>🖨 Wydrukuj etykietę (P2)</Btn>
        </div>
      </Content>
      <BottomActions>
        <Btn variant="p" onClick={() => onNav("po_lines", detail.poCode)}>Następna pozycja PO</Btn>
        <Btn variant="sec" onClick={() => onNav("receive_po")}>Wróć do listy PO</Btn>
      </BottomActions>
      <PrinterPickerSheet open={showPrinter} onClose={() => setShowPrinter(false)} onSkip={() => {}}/>
    </>
  );
};

// ----- TO list -----
const ToListScreen = ({ onNav, onOpenTo }) => {
  const [q, setQ] = React.useState("");
  return (
    <>
      <Topbar title="Przyjęcie TO" onBack={() => onNav("home")}/>
      <Content>
        <ScanInputArea
          label="Zeskanuj numer TO"
          placeholder="TO-XXXX-XXX…"
          hint="Transfer Order do odbioru"
          value={q}
          onChange={setQ}
        />
        {SCN_TOS.map(t => (
          <button key={t.code} className="sc-litem" onClick={() => onOpenTo(t.code)}>
            <div className="sc-licon">🔄</div>
            <div className="sc-linfo">
              <div className="sc-ltitle" style={{fontFamily:"'Courier New', monospace"}}>{t.code}</div>
              <div className="sc-lsub">{t.fromName} · {t.lines} LP · ETA {t.eta}</div>
              <div style={{marginTop:4}}><StatusChip status={t.status}/></div>
            </div>
            <span className="sc-lchev">›</span>
          </button>
        ))}
      </Content>
    </>
  );
};

// ----- TO scan (checklist) -----
const ToScanScreen = ({ toCode, onNav, onDone }) => {
  const to0 = SCN_TOS.find(t => t.code === toCode) || SCN_TOS[0];
  const [state, setState] = React.useState(to0.lps.map(x => ({ ...x })));
  const [scanVal, setScanVal] = React.useState("");
  const [scanState, setScanState] = React.useState("idle");
  const [err, setErr] = React.useState(null);

  const confirmed = state.filter(l => l.confirmed).length;
  const submit = () => {
    if (confirmed === 0) { setErr("Potwierdź co najmniej jeden LP"); setScanState("err"); return; }
    onDone({ toCode, confirmed, total: state.length, state });
  };
  const tryScan = (val) => {
    const code = (val || scanVal).trim().toUpperCase();
    const idx = state.findIndex(l => l.lp === code);
    if (idx === -1) {
      setErr(`LP ${code} nie należy do tego TO lub nie jest w tranzycie`);
      setScanState("err");
      return;
    }
    setState(st => st.map((l, i) => i === idx ? { ...l, confirmed: true } : l));
    setScanVal("");
    setScanState("ok");
    setErr(null);
  };

  return (
    <>
      <Topbar title={to0.code + " · Odbierz"} onBack={() => onNav("receive_to")}/>
      <Content>
        <div className="sc-mini-grid">
          <div className="sc-mini-row">
            <div className="sc-mini-cell"><div className="sc-mini-label">TO</div><div className="sc-mini-val mono">{to0.code}</div></div>
            <div className="sc-mini-cell"><div className="sc-mini-label">Źródło</div><div className="sc-mini-val">{to0.fromName}</div></div>
          </div>
          <div className="sc-mini-row">
            <div className="sc-mini-cell"><div className="sc-mini-label">Linii</div><div className="sc-mini-val">{to0.lines}</div></div>
            <div className="sc-mini-cell"><div className="sc-mini-label">ETA</div><div className="sc-mini-val">{to0.eta}</div></div>
          </div>
        </div>
        <ScanInputArea
          label="Zeskanuj LP z dostawy"
          placeholder="LP-XXXXX…"
          hint="Każdy skan potwierdza jeden LP z listy"
          value={scanVal}
          onChange={setScanVal}
          onSubmit={tryScan}
          state={scanState}
          extra={
            <div style={{display:"flex", gap:8, marginTop:8, flexWrap:"wrap"}}>
              {state.filter(l => !l.confirmed).slice(0, 2).map(l => (
                <Btn key={l.lp} variant="sec" onClick={() => tryScan(l.lp)} style={{flex:1, height:40, fontSize:11}}>Demo: {l.lp}</Btn>
              ))}
            </div>
          }
        />
        {err && <div className="sc-inline-err">{err}</div>}

        <div className="sc-section-title">Oczekiwane LP ({confirmed} / {state.length})</div>
        {state.map((l, i) => (
          <div className="sc-crow" key={i}>
            <div className={"sc-ccheck " + (l.confirmed ? "cck-ok" : "cck-empty")}>
              {l.confirmed ? "✓" : "○"}
            </div>
            <div style={{flex:1, minWidth:0}}>
              <div className="sc-cname" style={{fontFamily:"'Courier New', monospace"}}>{l.lp}</div>
              <div className="sc-cdet">{l.product}</div>
            </div>
            <div>
              <div className="sc-cqty-val" style={{color: l.confirmed ? "var(--sc-green)" : "var(--sc-mute)"}}>{l.qty}</div>
              <div className="sc-cqty-of">{l.uom}</div>
            </div>
          </div>
        ))}

        {confirmed < state.length && (
          <Banner kind="info" title="Częściowe przyjęcie">
            Nie wszystkie LP? Zatwierdź częściowe — brakujące pozostają w tranzycie.
          </Banner>
        )}
      </Content>
      <BottomActions>
        <Btn variant="s" disabled={confirmed === 0} onClick={submit}>
          Przyjmij potwierdzonych ({confirmed} / {state.length})
        </Btn>
      </BottomActions>
    </>
  );
};

const ToDoneScreen = ({ detail, onNav }) => (
  <>
    <Topbar title="Transfer odebrany" onBack={() => onNav("receive_to")}/>
    <Content>
      <div className="sc-success-wrap">
        <div className="sc-success-icon">✅</div>
        <div className="sc-success-title">Transfer odebrany</div>
        <div className="sc-success-sub">{detail.toCode} · {detail.confirmed} z {detail.total} LP potwierdzono</div>
      </div>
      {detail.confirmed < detail.total && (
        <Banner kind="warn" title="Częściowe przyjęcie">
          UWAGA: {detail.total - detail.confirmed} LP nie zeskanowano. Zostają w tranzycie.
        </Banner>
      )}
      <div className="sc-section-title">Potwierdzone LP</div>
      {detail.state.filter(l => l.confirmed).map((l, i) => (
        <div className="sc-srow" key={i}>
          <div className="sc-srow-icon">✓</div>
          <div style={{flex:1, minWidth:0}}>
            <div className="sc-ltitle" style={{fontFamily:"'Courier New', monospace"}}>{l.lp}</div>
            <div className="sc-lsub">{l.product}</div>
          </div>
          <div className="sc-sqty">{l.qty} {l.uom}</div>
        </div>
      ))}
    </Content>
    <BottomActions>
      <Btn variant="p" onClick={() => onNav("receive_to")}>Wróć do listy TO</Btn>
    </BottomActions>
  </>
);

Object.assign(window, {
  PoListScreen, PoLinesScreen, PoItemScreen, PoDoneScreen,
  ToListScreen, ToScanScreen, ToDoneScreen,
});
