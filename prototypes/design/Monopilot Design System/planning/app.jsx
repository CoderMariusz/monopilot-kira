// ============ Planning app — router ============

const PlanApp = () => {
  const [screen, setScreen] = React.useState(() => localStorage.getItem("plan_screen") || "dashboard");
  const [role, setRole] = React.useState("Planner");
  const [supplierId, setSupplierId] = React.useState(null);

  React.useEffect(() => { localStorage.setItem("plan_screen", screen); }, [screen]);

  const onOpenWo = () => setScreen("wo_detail");
  const onOpenPo = () => setScreen("po_detail");
  const onOpenTo = () => setScreen("to_detail");
  const onOpenSupplier = (id) => { setSupplierId(id); setScreen("supplier_detail"); };

  let content;
  switch (screen) {
    case "dashboard":    content = <PlanDashboard onNav={setScreen} onOpenWo={onOpenWo}/>; break;
    case "wos":          content = <PlanWOList onOpenWo={onOpenWo} onNav={setScreen}/>; break;
    case "wo_detail":    content = <PlanWODetail onBack={()=>setScreen("wos")} onNav={setScreen}/>; break;
    case "pos":          content = <PlanPOList onOpenPo={onOpenPo} onNav={setScreen}/>; break;
    case "po_detail":    content = <PlanPODetail onBack={()=>setScreen("pos")} onNav={setScreen}/>; break;
    case "tos":          content = <PlanTOList onOpenTo={onOpenTo} onNav={setScreen}/>; break;
    case "to_detail":    content = <PlanTODetail onBack={()=>setScreen("tos")} onNav={setScreen}/>; break;
    case "suppliers":       content = <PlanSupplierList onOpenSupplier={onOpenSupplier} onNav={setScreen}/>; break;
    case "supplier_detail": content = <PlanSupplierDetail supplierId={supplierId} onBack={()=>setScreen("suppliers")} onNav={setScreen} onOpenPo={onOpenPo}/>; break;
    case "gantt":        content = <PlanGantt onNav={setScreen} onOpenWo={onOpenWo}/>; break;
    case "cascade":      content = <PlanCascadeDAG onNav={setScreen} onOpenWo={onOpenWo}/>; break;
    case "reservations": content = <PlanReservations onNav={setScreen} onOpenWo={onOpenWo}/>; break;
    case "sequencing":   content = <PlanSequencing onNav={setScreen} onOpenWo={onOpenWo}/>; break;
    case "settings":     content = <PlanSettings onNav={setScreen}/>; break;
    case "d365_queue":   content = <PlanD365Queue onNav={setScreen} onOpenWo={onOpenWo}/>; break;
    case "gallery":      content = <ModalGallery onNav={setScreen}/>; break;
    default:             content = <PlanDashboard onNav={setScreen} onOpenWo={onOpenWo}/>;
  }

  return (
    <>
      <PSidebar/>
      <PTopbar role={role} onRole={setRole}/>
      <PlanNav current={screen} onNav={setScreen}/>
      <div id="prod-main">{content}</div>
    </>
  );
};

ReactDOM.createRoot(document.getElementById("root")).render(<PlanApp/>);
