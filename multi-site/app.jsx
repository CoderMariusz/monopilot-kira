// ============ Multi-Site app — router + central modal state ============
// Pattern A (per MODAL-SCHEMA §3): single switch at root.
// Site context persisted in localStorage key `mp_site_context` per spec §1.5.

const MsApp = () => {
  const [screen, setScreen]   = React.useState(() => localStorage.getItem("ms_screen") || "dashboard");
  const [site, setSite]       = React.useState(() => localStorage.getItem("mp_site_context") || "SITE-A");
  const [role, setRole]       = React.useState("Admin");
  const [modal, setModal]     = React.useState(null);       // { name, data }
  const [openedSiteId, setOpenedSiteId] = React.useState("SITE-B");
  const [openedISTId,  setOpenedISTId]  = React.useState("IST-0042");
  const [openedLaneId, setOpenedLaneId] = React.useState("LN-001");
  const [toast, setToast] = React.useState(null);

  React.useEffect(() => { localStorage.setItem("ms_screen", screen); }, [screen]);

  const changeSite = (newSite) => {
    setSite(newSite);
    localStorage.setItem("mp_site_context", newSite);
    const s = MS_SITES.find(x => x.id === newSite);
    const label = newSite === "ALL" ? "All sites (aggregated)" : `${s?.code} — ${s?.name}`;
    setToast(`Switched to ${label}`);
    setTimeout(() => setToast(null), 2200);
  };

  const openModal = (name, data) => setModal({ name, data });
  const closeModal = () => setModal(null);

  const onOpenSite = (id) => { setOpenedSiteId(id); setScreen("site_detail"); };
  const onOpenIST  = (id) => { setOpenedISTId(id);  setScreen("ist_detail"); };
  const onOpenLane = (id) => { setOpenedLaneId(id); setScreen("lane_detail"); };

  let content;
  switch (screen) {
    case "dashboard":    content = <MsDashboard       role={role} site={site} onNav={setScreen} onOpenSite={onOpenSite} onOpenIST={onOpenIST} openModal={openModal}/>; break;
    case "sites":        content = <MsSitesList       role={role} site={site} onNav={setScreen} onOpenSite={onOpenSite} openModal={openModal}/>; break;
    case "site_detail":  content = <MsSiteDetail      role={role} site={site} onNav={setScreen} onBack={()=>setScreen("sites")} currentSiteId={openedSiteId} openModal={openModal}/>; break;
    case "transfers":    content = <MsISTList         role={role} site={site} onNav={setScreen} onOpenIST={onOpenIST} openModal={openModal}/>; break;
    case "ist_detail":   content = <MsISTDetail       role={role} site={site} onNav={setScreen} onBack={()=>setScreen("transfers")} openModal={openModal}/>; break;
    case "ist_new":      content = <MsISTCreate       site={site} onNav={setScreen} onBack={()=>setScreen("transfers")}/>; break;
    case "lanes":        content = <MsLanesList       role={role} site={site} onNav={setScreen} onOpenLane={onOpenLane} openModal={openModal}/>; break;
    case "lane_detail":  content = <MsLaneDetail      role={role} site={site} laneId={openedLaneId} onBack={()=>setScreen("lanes")} onNav={setScreen} openModal={openModal}/>; break;
    case "master_data":  content = <MsMasterDataSync  role={role} site={site} onNav={setScreen} openModal={openModal}/>; break;
    case "replication":  content = <MsReplicationQueue role={role} site={site} onNav={setScreen} openModal={openModal}/>; break;
    case "permissions":  content = <MsPermissions     role={role} site={site} onNav={setScreen} openModal={openModal}/>; break;
    case "analytics":    content = <MsAnalytics       role={role} site={site} onNav={setScreen} openModal={openModal}/>; break;
    case "settings":     content = <MsSettings        role={role} site={site} onNav={setScreen} openModal={openModal}/>; break;
    case "activation":   content = <MsActivation      role={role} site={site} onNav={setScreen} openModal={openModal}/>; break;
    case "gallery":      content = <ModalGallery      onNav={setScreen}/>; break;
    default:             content = <MsDashboard      role={role} site={site} onNav={setScreen} onOpenSite={onOpenSite} onOpenIST={onOpenIST} openModal={openModal}/>;
  }

  return (
    <>
      <MsSidebar/>
      <MsTopbar role={role} onRole={setRole} site={site} onSite={changeSite}/>
      <MsNav current={screen} onNav={setScreen} site={site}/>
      <div id="prod-main">{content}</div>

      {/* Global modal mount */}
      {modal?.name === "siteCreate"        && <SiteCreateModal          open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "istCancel"         && <ISTCancelModal           open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "istAmend"          && <ISTAmendModal            open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "replicationRetry"  && <ReplicationRetryModal    open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "conflict"          && <ConflictResolveModal     open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "laneCreate"        && <LaneCreateModal          open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "rateCard"          && <RateCardUploadModal      open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "configOverride"    && <SiteConfigOverrideModal  open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "assignUser"        && <AssignUserModal          open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "decommission"      && <DecommissionModal        open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "activationConfirm" && <ActivationConfirmModal   open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "rollback"          && <RollbackModal            open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "promote"           && <PromoteEnvModal          open={true} onClose={closeModal} data={modal.data}/>}
      {/* IST Create is opened as a screen-level modal in the spec, but we also expose it via openModal for gallery compatibility */}
      {modal?.name === "istCreate"         && (setScreen("ist_new"), closeModal(), null)}
      {modal?.name === "postCharge"        && <Modal open={true} onClose={closeModal} title="Post Inter-Company Charge" size="default" foot={<><button className="btn btn-secondary btn-sm" onClick={closeModal}>Cancel</button><button className="btn btn-primary btn-sm">Post Charge</button></>}><div className="alert-blue alert-box" style={{fontSize:12}}><span>ⓘ</span><div>Posting creates a journal entry in both sites' ledgers (10-FINANCE) and marks this transfer financially closed.</div></div><Summary rows={[{label:"Freight",value:"£340.00", emphasis:true},{label:"From account",value:"CC-FRZ-UK-WH"},{label:"To account",value:"CC-FRZ-DE-WH"}]}/></Modal>}

      {toast && <div className="ms-toast">🌐 {toast}</div>}
    </>
  );
};

ReactDOM.createRoot(document.getElementById("root")).render(<MsApp/>);
