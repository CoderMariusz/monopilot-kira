// ============ Production app — router + tweaks ============

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "density": "comfortable",
  "cardLayout": "default",
  "kpiAccent": "bottom",
  "showOverBanner": true,
  "pulseDot": true
}/*EDITMODE-END*/;

const App = () => {
  const [screen, setScreen] = React.useState(() => localStorage.getItem("prod_screen") || "dashboard");
  const [role, setRole] = React.useState("Shift Lead");
  const [modal, setModal] = React.useState(null); // {name, data}
  const [editMode, setEditMode] = React.useState(false);
  const [tweaks, setTweaksState] = React.useState(TWEAK_DEFAULTS);

  React.useEffect(() => { localStorage.setItem("prod_screen", screen); }, [screen]);

  // Edit-mode protocol
  React.useEffect(() => {
    const handler = (ev) => {
      if (ev.data?.type === "__activate_edit_mode") setEditMode(true);
      if (ev.data?.type === "__deactivate_edit_mode") setEditMode(false);
    };
    window.addEventListener("message", handler);
    window.parent.postMessage({type:"__edit_mode_available"}, "*");
    return () => window.removeEventListener("message", handler);
  }, []);

  const setTweaks = (patch) => {
    const next = { ...tweaks, ...patch };
    setTweaksState(next);
    window.parent.postMessage({type:"__edit_mode_set_keys", edits: patch}, "*");
  };

  const [activeLine, setActiveLine] = React.useState("LINE-01");
  const openModal = (name, data) => setModal({ name, data });
  const closeModal = () => setModal(null);

  const openWo = (woId) => { setScreen("wo_detail"); };
  const openLine = (lineId) => { setActiveLine(lineId || "LINE-01"); setScreen("line_detail"); };

  // apply tweaks as body classes / vars
  React.useEffect(() => {
    document.body.classList.toggle("density-compact", tweaks.density === "compact");
    document.body.classList.toggle("card-wide", tweaks.cardLayout === "wide");
    document.body.classList.toggle("kpi-left", tweaks.kpiAccent === "left");
    document.body.classList.toggle("kpi-flat", tweaks.kpiAccent === "flat");
    document.body.classList.toggle("no-pulse", !tweaks.pulseDot);
    document.body.classList.toggle("hide-over-banner", !tweaks.showOverBanner);
  }, [tweaks]);

  let content;
  switch (screen) {
    case "dashboard": content = <Dashboard onOpenWo={openWo} onOpenLine={openLine} onNav={setScreen} openModal={openModal}/>; break;
    case "wos": content = <WOList onOpenWo={openWo} openModal={openModal}/>; break;
    case "wo_detail": content = <WODetail onBack={()=>setScreen("wos")} openModal={openModal}/>; break;
    case "lines": content = <Dashboard onOpenWo={openWo} onOpenLine={openLine} onNav={setScreen} openModal={openModal}/>; break;
    case "line_detail": content = <LineDetail lineId={activeLine} onBack={()=>setScreen("lines")} onOpenWo={openWo} openModal={openModal}/>; break;
    case "oee": content = <OEEScreen/>; break;
    case "downtime": content = <DowntimeScreen openModal={openModal}/>; break;
    case "shifts": content = <ShiftsScreen openModal={openModal}/>; break;
    case "changeover": content = <ChangeoverScreen openModal={openModal}/>; break;
    case "waste": content = <WasteAnalyticsScreen openModal={openModal}/>; break;
    case "analytics": content = <AnalyticsScreen/>; break;
    case "dlq": content = <DLQScreen openModal={openModal}/>; break;
    case "settings": content = <SettingsScreen openModal={openModal}/>; break;
    case "gallery": content = <ModalGallery onNav={setScreen}/>; break;
    default: content = <Dashboard onOpenWo={openWo} onOpenLine={openLine} onNav={setScreen} openModal={openModal}/>;
  }

  const M = modal?.name;
  return (
    <>
      <PSidebar/>
      <PTopbar role={role} onRole={setRole}/>
      <ProdNav current={screen} onNav={setScreen}/>
      <div id="prod-main">{content}</div>

      {/* M === "release" removed — see modals.jsx; belongs in 04-PLANNING */}
      {M === "startWo" && <StartWoModal onClose={closeModal} data={modal.data}/>}
      {M === "pauseLine" && <PauseLineModal onClose={closeModal} data={modal.data}/>}
      {M === "completeWo" && <CompleteWoModal onClose={closeModal} data={modal.data}/>}
      {M === "overConsume" && <OverConsumeModal onClose={closeModal}/>}
      {M === "waste" && <WasteModal onClose={closeModal}/>}
      {M === "catchweight" && <CatchWeightModal onClose={closeModal}/>}
      {M === "scanner" && <ScannerModal onClose={closeModal}/>}
      {M === "dlqInspect" && <DlqInspectModal onClose={closeModal} data={modal.data}/>}
      {M === "resumeLine" && <ResumeLineModal onClose={closeModal} data={modal.data}/>}
      {M === "changeoverGate" && <ChangeoverGateModal onClose={closeModal}/>}
      {M === "assignCrew" && <AssignCrewModal onClose={closeModal}/>}
      {M === "shiftStart" && <ShiftStartModal onClose={closeModal}/>}
      {M === "shiftEnd" && <ShiftEndModal onClose={closeModal}/>}
      {M === "oeeTargetEdit" && <OEETargetEditModal onClose={closeModal} data={modal.data}/>}

      {editMode && <TweaksPanel tweaks={tweaks} setTweaks={setTweaks} onClose={()=>setEditMode(false)}/>}
    </>
  );
};

const PlaceholderScreen = ({ title, sub }) => (
  <>
    <div className="page-head">
      <div>
        <div className="breadcrumb"><a>Production</a></div>
        <h1 className="page-title">{title}</h1>
        <div className="muted" style={{fontSize:12}}>{sub}</div>
      </div>
    </div>
    <div className="card" style={{padding:40, textAlign:"center", color:"var(--muted)"}}>
      <div style={{fontSize:40, opacity:0.2}}>◐</div>
      <div style={{fontSize:14, marginTop:8}}>Screen pattern scaffolded — reuses the same KPI + table + Pareto primitives shown across the module.</div>
    </div>
  </>
);

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);

// Apply tweak body classes at load
const _tweakCss = document.createElement("style");
_tweakCss.textContent = `
body.density-compact { font-size: 12px; }
body.density-compact .page-title { font-size: 18px; }
body.density-compact .kpi-value { font-size: 20px; }
body.density-compact td, body.density-compact th { padding: 5px 8px; }
body.kpi-left .kpi { border-bottom: 1px solid var(--border) !important; border-left: 4px solid var(--blue); }
body.kpi-left .kpi.green { border-left-color: var(--green); }
body.kpi-left .kpi.amber { border-left-color: var(--amber); }
body.kpi-left .kpi.red { border-left-color: var(--red); }
body.kpi-flat .kpi { border-bottom: 1px solid var(--border) !important; }
body.no-pulse .refresh-dot, body.no-pulse .alert-dot { animation: none !important; }
body.hide-over-banner .alert-amber.alert-box { display: none; }
body.card-wide .line-grid { grid-template-columns: 1fr 1fr; }
`;
document.head.appendChild(_tweakCss);
