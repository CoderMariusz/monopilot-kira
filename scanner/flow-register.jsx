// ============================================================
// SCN-082 Output, SCN-083 Co-product, SCN-084 Waste
// Register finished goods to stock (to_stock always in P1).
// ============================================================

const OutputScreen = ({ woCode, onNav, onDone }) => {
  const wo = SCN_WOS.find(w => w.code === woCode) || SCN_WOS[0];
  const bom = SCN_BOM[wo.code] || [];
  const missing = bom.filter(b => b.qtyDone < b.qtyReq).map(b => ({ name: b.material, done: b.qtyDone, req: b.qtyReq, uom: b.uom }));
  const [step, setStep] = React.useState(0);
  const [qty, setQty] = React.useState(String(wo.planned - wo.actual));
  const [batch, setBatch] = React.useState(wo.batch || "BATCH-2026-A01");
  const [expiry, setExpiry] = React.useState("2026-09-01");
  const [location, setLocation] = React.useState("");
  const [showKeypad, setShowKeypad] = React.useState(false);
  const [showPartial, setShowPartial] = React.useState(false);
  const [showPrinter, setShowPrinter] = React.useState(false);
  const [partialNote, setPartialNote] = React.useState(null);

  const yieldPct = qty && wo.planned ? Math.round(((Number(qty) + wo.actual) / wo.planned) * 100) : 0;
  const yieldCls = yieldPct >= 95 ? "g" : yieldPct >= 80 ? "a" : "r";

  const submit = () => {
    if (missing.length > 0 && !partialNote) {
      setShowPartial(true);
      return;
    }
    // all good
    const lp = "LP-FA-0" + Math.floor(800 + Math.random() * 199);
    onDone({ lp, qty, batch, expiry, location: location || "LOC-FA-01-01", yieldPct, partialNote });
  };

  const fields = (
    <>
      <StepsBar steps={["Ilość", "Partia / Expiry", "Lokalizacja", "Potwierdź"]} current={step}/>
      {step === 0 && (
        <>
          <div className="sc-fgroup">
            <div className="sc-flabel">Ilość wyprodukowana <span className="req">*</span></div>
            <input className="sc-finput big" value={qty} onChange={e => setQty(e.target.value.replace(/[^0-9.]/g,""))} onClick={() => setShowKeypad(true)} readOnly style={{cursor:"pointer"}}/>
            <div className="sc-fhint">Zaplanowane: {wo.planned} · Dotychczas: {wo.actual} {wo.uom}</div>
          </div>
          <div className="sc-yield">
            Cel: {wo.planned} {wo.uom} · Dotąd: {wo.actual} {wo.uom} · Nowe Yield: <span className={"sc-yield-val " + yieldCls}>{yieldPct}%</span>
          </div>
        </>
      )}
      {step === 1 && (
        <>
          <div className="sc-fgroup">
            <div className="sc-flabel">Partia / Numer serii <span className="req">*</span></div>
            <input className="sc-finput" value={batch} onChange={e => setBatch(e.target.value)} placeholder="BATCH-..."/>
            <div className="sc-fhint">Obowiązkowe (V-SCAN-WO-006)</div>
          </div>
          <div className="sc-fgroup">
            <div className="sc-flabel">Data ważności <span className="req">*</span></div>
            <input className="sc-finput" type="date" value={expiry} onChange={e => setExpiry(e.target.value)}/>
            <div className="sc-fhint">Obowiązkowe (V-SCAN-WO-007)</div>
          </div>
          <div className="sc-fgroup">
            <div className="sc-flabel">Paleta / kontener (opcjonalne)</div>
            <input className="sc-finput" placeholder="PAL-XXXXX lub pomiń"/>
          </div>
        </>
      )}
      {step === 2 && (
        <>
          <ScanInputArea
            label="Lokalizacja magazynowa"
            placeholder="LOC-XXX-XX-XX lub skanuj…"
            hint="Zeskanuj kod lokalizacji lub wybierz poniżej"
            value={location}
            onChange={setLocation}
          />
          <div className="sc-section-title">Szybki wybór</div>
          <div className="sc-quick-grid">
            {SCN_QUICK_LOCS.map(q => (
              <button key={q.code} className="sc-quick" onClick={() => setLocation(q.code)}>
                <div className="qc">{q.code}</div>
                <div className="qz">{q.zone}</div>
              </button>
            ))}
          </div>
        </>
      )}
      {step === 3 && (
        <>
          <div className="sc-pad">
            <div className="sc-section-title" style={{paddingLeft:0}}>Podsumowanie</div>
            <div className="sc-mini-grid" style={{margin:"8px 0"}}>
              <div className="sc-mini-row"><div className="sc-mini-cell"><div className="sc-mini-label">Ilość</div><div className="sc-mini-val">{qty} {wo.uom}</div></div><div className="sc-mini-cell"><div className="sc-mini-label">Partia</div><div className="sc-mini-val mono">{batch}</div></div></div>
              <div className="sc-mini-row"><div className="sc-mini-cell"><div className="sc-mini-label">Data ważności</div><div className="sc-mini-val">{expiry}</div></div><div className="sc-mini-cell"><div className="sc-mini-label">Lokalizacja</div><div className="sc-mini-val mono">{location || "LOC-FA-01-01"}</div></div></div>
              <div className="sc-mini-row"><div className="sc-mini-cell"><div className="sc-mini-label">Yield</div><div className={"sc-mini-val " + (yieldCls === "g" ? "green" : yieldCls === "a" ? "amber" : "red")}>{yieldPct}%</div></div><div className="sc-mini-cell"><div className="sc-mini-label">Trasa</div><div className="sc-mini-val">to_stock</div></div></div>
            </div>
            <Banner kind="info" title="to_stock (P1)">Nowy LP zostanie utworzony i umieszczony w magazynie. Brak opcji "direct continue" w P1.</Banner>
          </div>
        </>
      )}
    </>
  );

  return (
    <>
      <Topbar title="Rejestruj wyrób gotowy" onBack={() => step === 0 ? onNav("wo_execute", wo.code) : setStep(step - 1)}/>
      <Content>{fields}</Content>
      <BottomActions>
        {step < 3 && <Btn variant="p" disabled={step === 1 && (!batch || !expiry)} onClick={() => setStep(step + 1)}>Dalej →</Btn>}
        {step === 3 && <Btn variant="s" onClick={submit}>Zatwierdź rejestrację</Btn>}
        {step > 0 && <Btn variant="sec" onClick={() => setStep(step - 1)}>← Wstecz</Btn>}
      </BottomActions>
      <QtyKeypadSheet open={showKeypad} onClose={() => setShowKeypad(false)} initial={qty} uom={wo.uom} onConfirm={setQty}/>
      <PartialConsumeSheet
        open={showPartial}
        onClose={() => setShowPartial(false)}
        missing={missing}
        onConfirm={({ reason }) => { setPartialNote(reason); const lp = "LP-FA-0" + Math.floor(800 + Math.random() * 199); onDone({ lp, qty, batch, expiry, location: location || "LOC-FA-01-01", yieldPct, partialNote: reason }); }}
      />
      <PrinterPickerSheet open={showPrinter} onClose={() => setShowPrinter(false)}/>
    </>
  );
};

const OutputDoneScreen = ({ detail, onNav, woCode }) => (
  <>
    <Topbar title="Zarejestrowano" onBack={() => onNav("wo_execute", woCode)}/>
    <Content>
      <div className="sc-success-wrap">
        <div className="sc-success-icon">✅</div>
        <div className="sc-success-title">Wyrób gotowy zarejestrowany</div>
        <div className="sc-success-sub">Nowy LP utworzony · to_stock</div>
      </div>
      <div className="sc-lp-card">
        <div className="sc-lp-num">{detail.lp}</div>
        <div className="sc-lp-sub">{detail.qty} kg · Partia {detail.batch} · Expiry {detail.expiry}</div>
        <div className="sc-lp-sub">📍 {detail.location}</div>
      </div>
      {detail.partialNote && <Banner kind="warn" title="Niepełna konsumpcja zalogowana">Powód: {detail.partialNote}</Banner>}
      <div className="sc-pad" style={{fontSize:12, color:"var(--sc-mute)", textAlign:"center"}}>
        Yield: <span style={{fontWeight:700, color: detail.yieldPct >= 95 ? "var(--sc-green)" : detail.yieldPct >= 80 ? "var(--sc-amber)" : "var(--sc-red)"}}>{detail.yieldPct}%</span>
      </div>
      <Banner kind="info" title="Drukowanie etykiety (P2)">
        Drukowanie etykiet ze skanera dostępne w P2. Wydrukuj z pulpitu magazynowego.
      </Banner>
    </Content>
    <BottomActions>
      <Btn variant="p" onClick={() => onNav("output", woCode)}>Rejestruj kolejny</Btn>
      <Btn variant="sec" onClick={() => onNav("wo_execute", woCode)}>Wróć do WO</Btn>
    </BottomActions>
  </>
);

const CoproductScreen = ({ woCode, onNav, onDone }) => {
  const list = SCN_COPRODUCTS[woCode] || SCN_COPRODUCTS["WO-2026-0108"];
  const [cp, setCp] = React.useState(list[0].id);
  const [qty, setQty] = React.useState("12");
  const [batch, setBatch] = React.useState("CP-2026-A01");
  const [expiry, setExpiry] = React.useState("2026-08-01");
  const [location, setLocation] = React.useState("LOC-CP-01");
  const [showKeypad, setShowKeypad] = React.useState(false);

  const current = list.find(c => c.id === cp);

  const submit = () => {
    const lp = "LP-CP-" + Math.floor(100 + Math.random() * 899);
    onDone({ lp, product: current.product, qty, batch, expiry, location, woCode });
  };

  return (
    <>
      <Topbar title="Co-product" onBack={() => onNav("wo_execute", woCode)}/>
      <Content>
        <Banner kind="info" title="Produkt uboczny">Rejestracja tworzy nowy LP typu <strong>co_product</strong> (fiolet). LP dziedziczy WO źródłowe.</Banner>
        <div className="sc-fgroup">
          <div className="sc-flabel">Wybierz produkt uboczny</div>
          <select className="sc-finput" value={cp} onChange={e => setCp(e.target.value)}>
            {list.map(c => <option key={c.id} value={c.id}>{c.product} · {c.allocPct}%</option>)}
          </select>
        </div>
        <div className="sc-fgroup">
          <div className="sc-flabel">Ilość <span className="req">*</span></div>
          <input className="sc-finput big" value={qty} onChange={e => setQty(e.target.value)} onClick={() => setShowKeypad(true)} readOnly style={{cursor:"pointer"}}/>
        </div>
        <div className="sc-fgroup">
          <div className="sc-flabel">Partia <span className="req">*</span></div>
          <input className="sc-finput" value={batch} onChange={e => setBatch(e.target.value)}/>
        </div>
        <div className="sc-fgroup">
          <div className="sc-flabel">Data ważności <span className="req">*</span></div>
          <input className="sc-finput" type="date" value={expiry} onChange={e => setExpiry(e.target.value)}/>
        </div>
        <div className="sc-fgroup">
          <div className="sc-flabel">Lokalizacja <span className="req">*</span></div>
          <input className="sc-finput" value={location} onChange={e => setLocation(e.target.value)}/>
        </div>
      </Content>
      <BottomActions>
        <Btn variant="v" disabled={!batch || !expiry || !location || !qty} onClick={submit}>Zarejestruj co-product</Btn>
      </BottomActions>
      <QtyKeypadSheet open={showKeypad} onClose={() => setShowKeypad(false)} initial={qty} uom="kg" onConfirm={setQty}/>
    </>
  );
};

const CoproductDoneScreen = ({ detail, onNav, woCode }) => (
  <>
    <Topbar title="Co-product zarejestrowany" onBack={() => onNav("wo_execute", woCode)}/>
    <Content>
      <div className="sc-success-wrap">
        <div className="sc-success-icon">⚡</div>
        <div className="sc-success-title">Produkt uboczny zapisany</div>
        <div className="sc-success-sub">Nowy LP (fiolet) · to_stock</div>
      </div>
      <div className="sc-lp-card purple">
        <div className="sc-lp-num">{detail.lp}</div>
        <div className="sc-lp-sub">{detail.product} · {detail.qty} kg · {detail.batch}</div>
        <div className="sc-lp-sub" style={{marginTop:6, fontSize:10, letterSpacing:"0.1em", textTransform:"uppercase"}}>Powiązane z WO: {detail.woCode}</div>
      </div>
    </Content>
    <BottomActions>
      <Btn variant="v" onClick={() => onNav("coproduct", woCode)}>Kolejny co-product</Btn>
      <Btn variant="sec" onClick={() => onNav("wo_execute", woCode)}>Wróć do WO</Btn>
    </BottomActions>
  </>
);

const WasteScreen = ({ woCode, onNav, onDone }) => {
  const [cat, setCat] = React.useState(null);
  const [qty, setQty] = React.useState("");
  const [phase, setPhase] = React.useState("cooking");
  const [notes, setNotes] = React.useState("");
  const [showKeypad, setShowKeypad] = React.useState(false);

  const canSubmit = cat && qty && Number(qty) > 0;

  const submit = () => {
    const catObj = SCN_WASTE_CATS.find(c => c.id === cat);
    onDone({ cat: catObj.label, qty, phase, notes, woCode });
  };

  return (
    <>
      <Topbar title="Rejestruj odpad" onBack={() => onNav("wo_execute", woCode)}/>
      <Content>
        <Banner kind="info" title="Brak LP">Odpad nie trafia do magazynu. To jest tylko zapis ilości.</Banner>

        <div className="sc-section-title">Kategoria odpadu <span style={{color:"var(--sc-red)"}}>*</span></div>
        <div className="sc-cat-list">
          {SCN_WASTE_CATS.map(c => (
            <button key={c.id} className={"sc-cat-btn " + c.cls + " " + (cat === c.id ? "on" : "")} onClick={() => setCat(c.id)}>
              <span style={{fontSize:20}}>{c.icon}</span>
              <span style={{flex:1}}>{c.label}</span>
              <span>{cat === c.id ? "✓" : ""}</span>
            </button>
          ))}
        </div>

        <div className="sc-fgroup">
          <div className="sc-flabel">Ilość odpadu <span className="req">*</span></div>
          <input className="sc-finput big" value={qty} onChange={e => setQty(e.target.value)} onClick={() => setShowKeypad(true)} readOnly placeholder="0" style={{cursor:"pointer"}}/>
          <div className="sc-fhint">W jednostce produktu</div>
        </div>

        <div className="sc-fgroup">
          <div className="sc-flabel">Faza produkcji</div>
          <select className="sc-finput" value={phase} onChange={e => setPhase(e.target.value)}>
            <option value="pre">Przed gotowaniem</option>
            <option value="cooking">W trakcie gotowania</option>
            <option value="post">Po gotowaniu</option>
            <option value="pack">Pakowanie</option>
            <option value="other">Inne</option>
          </select>
        </div>

        <div className="sc-fgroup">
          <div className="sc-flabel">Notatki (opcjonalne)</div>
          <textarea className="sc-finput" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opcjonalne notatki…"/>
        </div>
      </Content>
      <BottomActions>
        <Btn variant="w" disabled={!canSubmit} onClick={submit}>Rejestruj odpad</Btn>
      </BottomActions>
      <QtyKeypadSheet open={showKeypad} onClose={() => setShowKeypad(false)} initial={qty} uom="kg" onConfirm={setQty}/>
    </>
  );
};

const WasteDoneScreen = ({ detail, onNav, woCode }) => (
  <>
    <Topbar title="Odpad zarejestrowany" onBack={() => onNav("wo_execute", woCode)}/>
    <Content>
      <div className="sc-success-wrap">
        <div className="sc-success-icon">✅</div>
        <div className="sc-success-title">Odpad zarejestrowany</div>
        <div className="sc-success-sub">Brak LP — nie trafia do magazynu</div>
      </div>
      <div className="sc-mini-grid">
        <div className="sc-mini-row">
          <div className="sc-mini-cell"><div className="sc-mini-label">Kategoria</div><div className="sc-mini-val">{detail.cat}</div></div>
          <div className="sc-mini-cell"><div className="sc-mini-label">Ilość</div><div className="sc-mini-val amber">{detail.qty} kg</div></div>
        </div>
        <div className="sc-mini-row">
          <div className="sc-mini-cell"><div className="sc-mini-label">Faza</div><div className="sc-mini-val">{detail.phase}</div></div>
          <div className="sc-mini-cell"><div className="sc-mini-label">Godzina</div><div className="sc-mini-val">{new Date().toTimeString().slice(0,5)}</div></div>
        </div>
      </div>
      {detail.notes && <Banner kind="info" title="Notatki">{detail.notes}</Banner>}
    </Content>
    <BottomActions>
      <Btn variant="w" onClick={() => onNav("waste", woCode)}>Rejestruj kolejny</Btn>
      <Btn variant="sec" onClick={() => onNav("wo_execute", woCode)}>Wróć do WO</Btn>
    </BottomActions>
  </>
);

Object.assign(window, { OutputScreen, OutputDoneScreen, CoproductScreen, CoproductDoneScreen, WasteScreen, WasteDoneScreen });
