// ============ App + Tweaks ============

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "detailLayout": "tabs",
  "costLayout": "side",
  "bomView": "table",
  "defaultScreen": "products"
}/*EDITMODE-END*/;

function App() {
  const [screen, setScreen] = React.useState(TWEAK_DEFAULTS.defaultScreen || "products");
  const [tweaks, setTweaks] = React.useState(TWEAK_DEFAULTS);
  const [tweakOpen, setTweakOpen] = React.useState(false);
  const [modal, setModal] = React.useState(null); // {name, data}
  const openModal = (name, data) => setModal({ name, data });
  const closeModal = () => setModal(null);

  React.useEffect(() => {
    const handler = (e) => {
      if (!e.data) return;
      if (e.data.type === "__activate_edit_mode") setTweakOpen(true);
      if (e.data.type === "__deactivate_edit_mode") setTweakOpen(false);
    };
    window.addEventListener("message", handler);
    window.parent.postMessage({ type: "__edit_mode_available" }, "*");
    return () => window.removeEventListener("message", handler);
  }, []);

  const setTweak = (k, v) => {
    setTweaks(prev => {
      const next = { ...prev, [k]: v };
      window.parent.postMessage({ type: "__edit_mode_set_keys", edits: { [k]: v } }, "*");
      return next;
    });
  };

  const currentNav =
    screen === "boms-list" || screen === "boms-detail" ? "boms" :
    screen === "materials-list" || screen === "materials-detail" ? "materials" :
    screen === "products" || screen === "product-detail" ? "products" :
    screen;

  const onNav = (k) => {
    if (k === "boms") setScreen("boms-list");
    else if (k === "materials") setScreen("materials-list");
    else if (k === "products") setScreen("products");
    else setScreen(k);
  };

  return (
    <>
      <TSidebar />
      <TTopbar />
      <TechNav current={currentNav} onNav={onNav} />
      <div id="tech-main">
        {screen === "dashboard" && <TechDashboardScreen openModal={openModal} />}
        {screen === "products" && <ProductsListScreen onOpen={() => setScreen("product-detail")} openModal={openModal} />}
        {screen === "product-detail" && <ProductDetailScreen onBack={() => setScreen("products")} openModal={openModal} />}
        {screen === "boms-list" && <BOMList onOpen={(id) => setScreen("boms-detail")} />}
        {screen === "boms-detail" && <BOMDetail onBack={() => setScreen("boms-list")} tweaks={tweaks} />}
        {screen === "materials-list" && <MaterialsListScreen onOpen={() => setScreen("materials-detail")} />}
        {screen === "materials-detail" && <MaterialDetailScreen onBack={() => setScreen("materials-list")} />}
        {screen === "nutrition" && <NutritionScreen />}
        {screen === "costing" && <CostingScreen openModal={openModal} />}
        {screen === "shelflife" && <ShelfLifeScreen openModal={openModal} />}
        {screen === "costhist" && <CostHistoryScreen />}
        {screen === "trace" && <TraceabilityScreen />}
        {screen === "routings" && <RoutingsScreen />}
        {screen === "specs" && <SpecsScreen />}
        {screen === "allergens" && <AllergenScreen />}
        {screen === "allergen-cascade" && <AllergenCascadeScreen />}
        {screen === "allergen-process" && <ProcessAllergenScreen />}
        {screen === "contamination-risk" && <ContaminationRiskScreen />}
        {screen === "eco" && <EcoScreen />}
        {screen === "history" && <HistoryScreen />}
        {screen === "d365status" && <D365StatusScreen openModal={openModal} />}
        {screen === "d365sync" && <D365ManualSyncScreen openModal={openModal} />}
        {screen === "d365log" && <D365LogScreen />}
        {screen === "d365drift" && <D365DriftScreen openModal={openModal} />}
        {screen === "d365fields" && <D365MappingScreen />}
        {screen === "gallery" && <TechModalGallery onNav={setScreen} />}
      </div>

      {/* Modals — routed by name from any screen */}
      {modal?.name === "productCreate" && <ProductCreateModal open={true} onClose={closeModal} />}
      {modal?.name === "archiveProduct" && <ArchiveProductModal open={true} onClose={closeModal} data={modal.data} />}
      {modal?.name === "bomVersionSave" && <BomVersionSaveModal open={true} onClose={closeModal} />}
      {modal?.name === "bomComponentAdd" && <BomComponentAddModal open={true} onClose={closeModal} />}
      {modal?.name === "deleteBomVersion" && <DeleteBomVersionModal open={true} onClose={closeModal} data={modal.data} />}
      {modal?.name === "routingStepAdd" && <RoutingStepAddModal open={true} onClose={closeModal} />}
      {modal?.name === "allergenDecl" && <AllergenDeclarationModal open={true} onClose={closeModal} />}
      {modal?.name === "ecoChangeReq" && <EcoChangeRequestModal open={true} onClose={closeModal} />}
      {modal?.name === "ecoApproval" && <EcoApprovalModal open={true} onClose={closeModal} data={modal.data} />}
      {modal?.name === "specReview" && <SpecReviewModal open={true} onClose={closeModal} data={modal.data} />}
      {modal?.name === "shelfLifeOverride" && <ShelfLifeOverrideModal open={true} onClose={closeModal} data={modal.data} />}
      {modal?.name === "costRollupRecompute" && <CostRollupRecomputeModal open={true} onClose={closeModal} />}
      {modal?.name === "d365ItemSync" && <D365ItemSyncConfirmModal open={true} onClose={closeModal} data={modal.data} />}
      {modal?.name === "d365DriftResolve" && <D365DriftResolveModal open={true} onClose={closeModal} data={modal.data} />}

      {tweakOpen && <TweaksPanel tweaks={tweaks} setTweak={setTweak} screen={screen} setScreen={setScreen} />}
    </>
  );
}

const TweaksPanel = ({ tweaks, setTweak, screen, setScreen }) => (
  <div id="tweaks" className="open" style={{ position: "fixed", right: 16, bottom: 16, width: 280, background: "#fff", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "0 10px 32px rgba(0,0,0,0.14)", zIndex: 200, fontSize: 12 }}>
    <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", fontWeight: 600, fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      Tweaks
      <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 400 }}>Technical module</span>
    </div>
    <div style={{ padding: "12px 14px" }}>
      <div style={{ marginBottom: 12 }}>
        <label style={{ textTransform: "uppercase", fontSize: 10, letterSpacing: "0.06em", color: "var(--muted)", display: "block", marginBottom: 6 }}>Jump to screen</label>
        <select value={screen} onChange={e => setScreen(e.target.value)} style={{ width: "100%" }}>
          <optgroup label="Overview">
            <option value="dashboard">Dashboard (TEC-017)</option>
          </optgroup>
          <optgroup label="Products">
            <option value="products">Products list (TEC-001)</option>
            <option value="product-detail">Product detail (TEC-002, 11 tabs)</option>
            <option value="boms-list">BOM list</option>
            <option value="boms-detail">BOM detail (hero)</option>
            <option value="materials-list">Materials (TEC-003)</option>
            <option value="materials-detail">Material detail (TEC-004)</option>
            <option value="specs">Product specs</option>
            <option value="nutrition">Nutrition panel (TEC-009)</option>
            <option value="allergens">Allergen matrix</option>
            <option value="shelflife">Shelf life (TEC-014)</option>
          </optgroup>
          <optgroup label="Compliance">
            <option value="allergen-cascade">Allergen cascade (TEC-041)</option>
            <option value="allergen-process">Process additions (TEC-042)</option>
            <option value="contamination-risk">Contamination risk (TEC-043)</option>
          </optgroup>
          <optgroup label="Cost & trace">
            <option value="costing">Recipe costing (TEC-013)</option>
            <option value="costhist">Cost history (TEC-015)</option>
            <option value="trace">Traceability (TEC-016)</option>
          </optgroup>
          <optgroup label="Process">
            <option value="routings">Routings</option>
          </optgroup>
          <optgroup label="Change & revision">
            <option value="eco">Change control (ECO)</option>
            <option value="history">Revision history</option>
          </optgroup>
          <optgroup label="D365 integration">
            <option value="d365status">D365 sync dashboard (TEC-070)</option>
            <option value="d365sync">Manual sync trigger (TEC-071)</option>
            <option value="d365log">Sync audit log (TEC-072)</option>
            <option value="d365drift">DLQ manager (TEC-073)</option>
            <option value="d365fields">Field mapping (TEC-074)</option>
          </optgroup>
          <optgroup label="Admin">
            <option value="gallery">Modal gallery</option>
          </optgroup>
        </select>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ textTransform: "uppercase", fontSize: 10, letterSpacing: "0.06em", color: "var(--muted)", display: "block", marginBottom: 6 }}>Cost panel layout (Ingredients tab)</label>
        <div style={{ display: "flex", gap: 4, background: "var(--gray-100)", padding: 3, borderRadius: 5 }}>
          {["side", "inline"].map(v => (
            <button key={v} onClick={() => setTweak("costLayout", v)}
              style={{ flex: 1, padding: "5px 8px", fontSize: 11, border: 0, background: tweaks.costLayout === v ? "#fff" : "transparent",
                borderRadius: 4, cursor: "pointer", color: tweaks.costLayout === v ? "var(--text)" : "var(--muted)",
                fontWeight: tweaks.costLayout === v ? 500 : 400, boxShadow: tweaks.costLayout === v ? "0 1px 2px rgba(0,0,0,0.08)" : "none" }}>
              {v === "side" ? "Side drawer" : "Inline % bar"}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
          Side drawer shows a dedicated cost + nutrition + allergen column. Inline replaces the supplier column with a component-share bar.
        </div>
      </div>

      <div style={{ fontSize: 11, color: "var(--muted)", padding: "8px 0 0", borderTop: "1px solid var(--border)" }}>
        Gallery route: <b>gallery</b> · 14 modals from <span className="mono">modals.jsx</span>.
      </div>
    </div>
  </div>
);

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
