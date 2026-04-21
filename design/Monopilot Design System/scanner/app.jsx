// ============================================================
// Scanner app — screen-state router (no URL).
// All screens are rendered inside a single ScannerFrame (390×844
// centered on the page). State keeps screen name + optional params.
// ============================================================

const ScannerApp = () => {
  const [state, setState] = React.useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("scanner_state") || "null");
      if (saved && saved.screen) return saved;
    } catch (e) {}
    return { screen: "login", params: {} };
  });

  React.useEffect(() => {
    localStorage.setItem("scanner_state", JSON.stringify(state));
  }, [state]);

  // Router helper — nav(name, ...params)
  const nav = (screen, ...params) => {
    setState({ screen, params });
    const el = document.querySelector(".sc-content");
    if (el) el.scrollTop = 0;
  };

  // Flow entry point: open a home tile's flow
  const openFlow = (key) => {
    switch (key) {
      case "consume":    nav("wos"); break;
      case "pick":       nav("pick"); break;
      case "receive_po": nav("receive_po"); break;
      case "receive_to": nav("receive_to"); break;
      case "putaway":    nav("putaway"); break;
      case "move":       nav("move"); break;
      case "split":      nav("split"); break;
      case "qa":         nav("qa"); break;
      case "inquiry":    nav("inquiry"); break;
      default:           nav("home");
    }
  };

  const p = state.params || {};
  let content;

  switch (state.screen) {
    // --- auth ---
    case "login":
      content = <LoginScreen onNav={nav}/>; break;
    case "login_pin":
      content = <PinScreen onNav={nav}/>; break;
    case "site_select":
      content = <SiteSelectScreen onNav={nav}/>; break;

    // --- home / settings ---
    case "home":
      content = <HomeScreen onNav={nav} onOpenFlow={openFlow} onLogout={() => nav("login")}/>; break;
    case "settings":
      content = <SettingsScreen onNav={nav} onLogout={() => nav("login")}/>; break;

    // --- WO consume flow ---
    case "wos":
      content = <WoListScreen onNav={nav} onOpenWo={(code) => nav("wo_detail", code)}/>; break;
    case "wo_detail":
      content = <WoDetailScreen woCode={p[0]} onNav={nav} onExecute={(c) => nav("wo_execute", c)}/>; break;
    case "wo_execute":
      content = <WoExecuteScreen
        woCode={p[0]}
        onNav={nav}
        onScanComponent={(code, line) => nav("consume_scan", code, line)}
        onOutput={(code) => nav("output", code)}
        onCoproduct={(code) => nav("coproduct", code)}
        onWaste={(code) => nav("waste", code)}
      />; break;
    case "consume_scan":
      content = <ConsumeScanScreen
        woCode={p[0]}
        bomLine={p[1] || 1}
        onNav={nav}
        onDone={(detail) => nav("consume_done", detail, p[0])}
      />; break;
    case "consume_done":
      content = <ConsumeDoneScreen detail={p[0] || {}} woCode={p[1]} onNav={nav}/>; break;

    // --- output / coproduct / waste ---
    case "output":
      content = <OutputScreen woCode={p[0]} onNav={nav} onDone={(d) => nav("output_done", d, p[0])}/>; break;
    case "output_done":
      content = <OutputDoneScreen detail={p[0] || {}} woCode={p[1]} onNav={nav}/>; break;
    case "coproduct":
      content = <CoproductScreen woCode={p[0]} onNav={nav} onDone={(d) => nav("coproduct_done", d, p[0])}/>; break;
    case "coproduct_done":
      content = <CoproductDoneScreen detail={p[0] || {}} woCode={p[1]} onNav={nav}/>; break;
    case "waste":
      content = <WasteScreen woCode={p[0]} onNav={nav} onDone={(d) => nav("waste_done", d, p[0])}/>; break;
    case "waste_done":
      content = <WasteDoneScreen detail={p[0] || {}} woCode={p[1]} onNav={nav}/>; break;

    // --- pick ---
    case "pick":
      content = <PickWoListScreen onNav={nav} onOpenPick={(code) => nav("pick_list", code)}/>; break;
    case "pick_list":
      content = <PickListScreen woCode={p[0]} onNav={nav} onScanLine={(code, line) => nav("pick_scan", code, line)}/>; break;
    case "pick_scan":
      content = <PickScanScreen woCode={p[0]} bomLine={p[1]} onNav={nav} onDone={(d) => nav("pick_done", d)}/>; break;
    case "pick_done":
      content = <PickDoneScreen detail={p[0] || {}} onNav={nav}/>; break;

    // --- receive PO ---
    case "receive_po":
      content = <PoListScreen onNav={nav} onOpenPo={(code) => nav("po_lines", code)}/>; break;
    case "po_lines":
      content = <PoLinesScreen poCode={p[0]} onNav={nav} onOpenLine={(code, id) => nav("po_item", code, id)}/>; break;
    case "po_item":
      content = <PoItemScreen poCode={p[0]} lineId={p[1]} onNav={nav} onDone={(d) => nav("po_done", d)}/>; break;
    case "po_done":
      content = <PoDoneScreen detail={p[0] || {}} onNav={nav}/>; break;

    // --- receive TO ---
    case "receive_to":
      content = <ToListScreen onNav={nav} onOpenTo={(code) => nav("to_scan", code)}/>; break;
    case "to_scan":
      content = <ToScanScreen toCode={p[0]} onNav={nav} onDone={(d) => nav("to_done", d)}/>; break;
    case "to_done":
      content = <ToDoneScreen detail={p[0] || {}} onNav={nav}/>; break;

    // --- putaway ---
    case "putaway":
      content = <PutawayScanScreen onNav={nav} onSuggest={(lp) => nav("putaway_suggest", lp)}/>; break;
    case "putaway_suggest":
      content = <PutawaySuggestScreen lp={p[0]} onNav={nav} onDone={(d) => nav("putaway_done", d)}/>; break;
    case "putaway_done":
      content = <PutawayDoneScreen detail={p[0] || {}} onNav={nav}/>; break;

    // --- move ---
    case "move":
      content = <MoveScreen onNav={nav} onDone={(d) => nav("move_done", d)}/>; break;
    case "move_done":
      content = <MoveDoneScreen detail={p[0] || {}} onNav={nav}/>; break;

    // --- split ---
    case "split":
      content = <SplitScanScreen onNav={nav} onNext={(lp) => nav("split_qty", lp)}/>; break;
    case "split_qty":
      content = <SplitQtyScreen lp={p[0]} onNav={nav} onDone={(d) => nav("split_done", d)}/>; break;
    case "split_done":
      content = <SplitDoneScreen detail={p[0] || {}} onNav={nav}/>; break;

    // --- QA ---
    case "qa":
      content = <QaListScreen onNav={nav} onInspect={(code) => nav("qa_inspect", code)}/>; break;
    case "qa_inspect":
      content = <QaInspectScreen
        lpCode={p[0]}
        onNav={nav}
        onResult={({ lpCode, result, notes }) => {
          if (result === "fail_pre") nav("qa_fail", lpCode, notes);
          else nav("qa_done", { lpCode, result, notes });
        }}
      />; break;
    case "qa_fail":
      content = <QaFailReasonScreen lpCode={p[0]} notes={p[1]} onNav={nav} onDone={(d) => nav("qa_done", d)}/>; break;
    case "qa_done":
      content = <QaDoneScreen detail={p[0] || {}} onNav={nav}/>; break;

    // --- inquiry ---
    case "inquiry":
      content = <InquiryScreen onNav={nav}/>; break;

    default:
      content = <HomeScreen onNav={nav} onOpenFlow={openFlow} onLogout={() => nav("login")}/>;
  }

  return <ScannerFrame>{content}</ScannerFrame>;
};

ReactDOM.createRoot(document.getElementById("root")).render(<ScannerApp/>);
