// ============================================================
// SCN-050 Pick for WO — WO list → component list → 3-step scan → done
// ============================================================

const PickWoListScreen = ({ onNav, onOpenPick }) => {
  const [filter, setFilter] = React.useState("all");
  const [q, setQ] = React.useState("");
  let list = SCN_PICK;
  if (filter === "my_line") list = list.filter(p => p.line === SCN_USER.line);
  if (filter === "incomplete") list = list.filter(p => p.picked < p.total);
  if (q) list = list.filter(p => (p.wo + " " + p.product).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <Topbar title="Pick dla WO" onBack={() => onNav("home")}/>
      <Content>
        <div className="sc-sbar">
          <input className="sc-sinp2" placeholder="Szukaj WO…" value={q} onChange={e => setQ(e.target.value)}/>
        </div>
        <div className="sc-pills">
          <button className={"sc-pill " + (filter === "all" ? "on" : "")} onClick={() => setFilter("all")}>Wszystkie</button>
          <button className={"sc-pill " + (filter === "my_line" ? "on" : "")} onClick={() => setFilter("my_line")}>Moja linia</button>
          <button className={"sc-pill " + (filter === "incomplete" ? "on" : "")} onClick={() => setFilter("incomplete")}>Wymagają kompletacji</button>
        </div>
        {list.length === 0 && (
          <EmptyState dark icon="🧺" title="Brak pozycji do zebrania"
            body="Nie ma WO wymagających kompletacji dla wybranego filtra."/>
        )}
        {list.map(p => (
          <button key={p.wo} className="sc-litem" onClick={() => onOpenPick(p.wo)}>
            <div className="sc-licon">🧺</div>
            <div className="sc-linfo">
              <div className="sc-ltitle" style={{fontFamily:"'Courier New', monospace"}}>{p.wo}</div>
              <div className="sc-lsub">{p.product} · {p.line}</div>
            </div>
            <div>
              <span className={"sc-status " + (p.picked === p.total ? "st-done" : "st-inprog")}>{p.picked} / {p.total} skomp.</span>
            </div>
            <span className="sc-lchev">›</span>
          </button>
        ))}
      </Content>
    </>
  );
};

const PickListScreen = ({ woCode, onNav, onScanLine }) => {
  const wo = SCN_WOS.find(w => w.code === woCode) || SCN_WOS[0];
  const bom = SCN_BOM[wo.code] || SCN_BOM["WO-2026-0108"];
  const picked = bom.filter(b => b.status === "ok").length;

  const nextLine = bom.find(b => b.status !== "ok");
  return (
    <>
      <Topbar title={"Pick: " + wo.code} onBack={() => onNav("pick")}/>
      <Content>
        <div className="sc-progress-strip">
          <span className="ps-lbl">Zebrano materiałów</span>
          <span className="ps-val">{picked} / {bom.length}</span>
        </div>
        <div className="sc-pbar"><div className="sc-pbar-fill" style={{width: (picked / bom.length) * 100 + "%"}}/></div>

        {nextLine && (
          <div className="sc-next-sug">
            <span style={{fontSize:18}}>📍</span>
            <div style={{flex:1}}>
              <div className="nlabel">Następny do zebrania</div>
              <div className="nname">{nextLine.material} w {nextLine.location}</div>
            </div>
          </div>
        )}

        <div className="sc-section-title">Komponenty BOM</div>
        {bom.map((c, i) => (
          <button className="sc-crow" key={i} onClick={() => onScanLine(wo.code, c.line)}>
            <div className={"sc-ccheck cck-" + (c.status === "ok" ? "ok" : c.status === "warn" ? "warn" : "empty")}>
              {c.status === "ok" ? "✓" : c.status === "warn" ? "!" : "○"}
            </div>
            <div style={{flex:1, minWidth:0}}>
              <div style={{display:"flex", alignItems:"center", gap:6, flexWrap:"wrap"}}>
                <span style={{background:"var(--sc-cyan-bg)", color:"var(--sc-cyan)", padding:"2px 6px", borderRadius:6, fontSize:10, fontFamily:"'Courier New', monospace", fontWeight:700}}>{c.location}</span>
                <span className="sc-cname">{c.material}</span>
              </div>
              <div className="sc-cdet">
                Sugestia FEFO: {c.lpSuggested || c.lp || "—"} · Expiry {c.expiry || "—"}
              </div>
            </div>
            <div>
              <div className="sc-cqty-val" style={{color: c.status === "ok" ? "var(--sc-green)" : "var(--sc-elev)"}}>
                {c.status === "ok" ? "✓" : c.qtyReq}
              </div>
              <div className="sc-cqty-of">{c.uom}</div>
            </div>
          </button>
        ))}
      </Content>
    </>
  );
};

const PickScanScreen = ({ woCode, bomLine, onNav, onDone }) => {
  const wo = SCN_WOS.find(w => w.code === woCode) || SCN_WOS[0];
  const bom = SCN_BOM[wo.code] || SCN_BOM["WO-2026-0108"];
  const line = bom.find(b => b.line === bomLine) || bom[0];

  const [step, setStep] = React.useState(0);
  const [loc, setLoc] = React.useState("");
  const [scanVal, setScanVal] = React.useState("");
  const [lp, setLp] = React.useState(null);
  const [qty, setQty] = React.useState(String(line.qtyReq - line.qtyDone));
  const [scanState, setScanState] = React.useState("idle");
  const [showFefo, setShowFefo] = React.useState(false);
  const [fefoNote, setFefoNote] = React.useState(null);
  const [inlineErr, setInlineErr] = React.useState(null);
  const [showKeypad, setShowKeypad] = React.useState(false);

  const submitLocation = (val) => {
    const v = (val || loc).trim().toUpperCase();
    if (!v.startsWith("LOC")) { setInlineErr("Kod lokalizacji musi zaczynać się od LOC-"); setScanState("err"); return; }
    if (v !== line.location) {
      setInlineErr(`Nie ta lokalizacja. Oczekiwano: ${line.location}`);
      setScanState("err");
      return;
    }
    setScanState("ok");
    setLoc(v);
    setInlineErr(null);
    setTimeout(() => setStep(1), 250);
  };

  const submitLp = (val) => {
    const code = (val || scanVal).trim().toUpperCase();
    if (!code.startsWith("LP")) { setInlineErr("Kod LP musi zaczynać się od LP-"); setScanState("err"); return; }
    const lpData = SCN_LPS[code];
    if (!lpData) { setInlineErr(`LP ${code} nie znaleziony w systemie`); setScanState("err"); return; }
    const suggested = line.lpSuggested ? SCN_LPS[line.lpSuggested] : null;
    if (suggested && suggested.lp !== lpData.lp && new Date(suggested.expiry) < new Date(lpData.expiry)) {
      setLp(lpData);
      setScanState("ok");
      setShowFefo({ suggested, chosen: lpData });
      return;
    }
    setLp(lpData);
    setScanState("ok");
    setInlineErr(null);
    setTimeout(() => setStep(2), 250);
  };

  return (
    <>
      <Topbar title={"Pick: " + line.material} onBack={() => step === 0 ? onNav("pick_list", wo.code) : setStep(step - 1)}/>
      <Content>
        <StepsBar steps={["Lokalizacja", "LP", "Ilość"]} current={step}/>

        {step === 0 && (
          <>
            <div className="sc-next-sug">
              <span style={{fontSize:18}}>📍</span>
              <div style={{flex:1}}>
                <div className="nlabel">Oczekiwana lokalizacja</div>
                <div className="nname" style={{fontFamily:"'Courier New', monospace"}}>{line.location}</div>
              </div>
            </div>
            <ScanInputArea
              label={"Skanuj lokalizację " + line.location}
              placeholder="LOC-XXX-XX-XX…"
              hint="Skanuj kod lokalizacji na regale"
              value={loc}
              onChange={setLoc}
              onSubmit={submitLocation}
              state={scanState}
              extra={<div style={{marginTop:8}}><Btn variant="sec" onClick={() => submitLocation(line.location)} style={{height:40, fontSize:12}}>Demo: użyj oczekiwanej</Btn></div>}
            />
            {inlineErr && <div className="sc-inline-err">{inlineErr}</div>}
          </>
        )}

        {step === 1 && (
          <>
            <div className="sc-next-sug">
              <span style={{fontSize:18}}>💡</span>
              <div style={{flex:1}}>
                <div className="nlabel">Sugestia FEFO</div>
                <div className="nname">
                  <span style={{fontFamily:"'Courier New', monospace"}}>{line.lpSuggested || line.lp}</span>
                  {" · "}
                  {line.material} · Expiry {line.expiry}
                </div>
              </div>
            </div>
            <ScanInputArea
              label="Skanuj LP składnika"
              placeholder="LP-XXXXX…"
              hint="Skanuj etykietę LP z regału"
              value={scanVal}
              onChange={setScanVal}
              onSubmit={submitLp}
              state={scanState}
              extra={
                <div style={{display:"flex", gap:8, marginTop:8}}>
                  <Btn variant="sec" onClick={() => submitLp(line.lpSuggested || line.lp)} style={{flex:1, height:40, fontSize:12}}>Demo: FEFO LP</Btn>
                  <Btn variant="sec" onClick={() => submitLp("LP-00287")} style={{flex:1, height:40, fontSize:12}}>Demo: LP-00287 (dev)</Btn>
                </div>
              }
            />
            {inlineErr && <div className="sc-inline-err">{inlineErr}</div>}
          </>
        )}

        {step === 2 && lp && (
          <>
            <MiniGrid rows={[
              [{ label:"LP", value: lp.lp, cls:"mono" }, { label:"Partia", value: lp.batch, cls:"mono" }],
              [{ label:"Produkt", value: lp.product }, { label:"Dostępne", value: `${lp.qty} ${lp.uom}` }],
              [{ label:"Expiry", value: lp.expiry }, { label:"Lokalizacja", value: lp.location || "—", cls:"mono" }],
            ]}/>
            {fefoNote && <Banner kind="warn" title="Odchylenie FEFO">Powód: {fefoNote} — zalogowane w audit log.</Banner>}
            <div className="sc-fgroup">
              <div className="sc-flabel">Ilość do pobrania <span className="req">*</span></div>
              <input className="sc-finput big" value={qty} onClick={() => setShowKeypad(true)} readOnly style={{cursor:"pointer"}}/>
              <div className="sc-fhint">Potrzeba: {line.qtyReq - line.qtyDone} {line.uom} · Dostępne: {lp.qty} {lp.uom}</div>
            </div>
          </>
        )}
      </Content>
      {step === 2 && (
        <BottomActions>
          <Btn variant="s" disabled={!qty || Number(qty) <= 0} onClick={() => onDone({ lp, qty, fefoNote, woCode: wo.code })}>Zatwierdź pobranie</Btn>
        </BottomActions>
      )}

      <FefoDeviationSheet
        open={!!showFefo}
        onClose={() => setShowFefo(false)}
        suggested={showFefo ? showFefo.suggested : { lp:"", expiry:"" }}
        chosen={showFefo ? showFefo.chosen : { lp:"", expiry:"" }}
        onConfirm={({ reason, other }) => { setFefoNote(reason === "other" ? other : reason); setStep(2); }}
        onUseFefo={() => { const s = SCN_LPS[line.lpSuggested]; setLp(s); setStep(2); setQty(String(line.qtyReq - line.qtyDone)); }}
      />
      <QtyKeypadSheet open={showKeypad} onClose={() => setShowKeypad(false)} initial={qty} max={lp ? lp.qty : 0} uom={lp ? lp.uom : "kg"} onConfirm={setQty}/>
    </>
  );
};

const PickDoneScreen = ({ detail, onNav }) => {
  const wo = SCN_WOS.find(w => w.code === detail.woCode) || SCN_WOS[0];
  const bom = SCN_BOM[wo.code] || SCN_BOM["WO-2026-0108"];
  const nextLine = bom.find(b => b.status !== "ok");
  return (
    <>
      <Topbar title="Pozycja zebrana" onBack={() => onNav("pick_list", detail.woCode)}/>
      <Content>
        <div className="sc-success-wrap">
          <div className="sc-success-icon">✅</div>
          <div className="sc-success-title">Pozycja zebrana</div>
          <div className="sc-success-sub">{detail.lp.product} · {detail.qty} kg</div>
        </div>
        <div className="sc-lp-card">
          <div className="sc-lp-num">{detail.lp.lp}</div>
          <div className="sc-lp-sub">Partia {detail.lp.batch} · {detail.qty} {detail.lp.uom}</div>
        </div>
        {detail.fefoNote && <Banner kind="warn" title="Odchylenie FEFO">Powód: {detail.fefoNote}</Banner>}
        {nextLine && (
          <div className="sc-next-sug">
            <span style={{fontSize:18}}>➡️</span>
            <div style={{flex:1}}>
              <div className="nlabel">Następna pozycja</div>
              <div className="nname">{nextLine.material} w {nextLine.location}</div>
            </div>
          </div>
        )}
      </Content>
      <BottomActions>
        {nextLine && <Btn variant="p" onClick={() => onNav("pick_scan", detail.woCode, nextLine.line)}>Następna pozycja →</Btn>}
        <Btn variant="sec" onClick={() => onNav("pick_list", detail.woCode)}>Wróć do listy</Btn>
      </BottomActions>
    </>
  );
};

Object.assign(window, { PickWoListScreen, PickListScreen, PickScanScreen, PickDoneScreen });
