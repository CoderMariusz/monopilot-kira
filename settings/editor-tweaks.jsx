// ============ Label template editor (hero flow) + Tweaks ============

const LabelTemplatesScreen = ({ openEditor }) => {
  const templates = [
    { id: "LBL-001", name: "Product retail label · 60×40mm", size: "60×40mm", updated: "2025-11-20", uses: 142, status: "active" },
    { id: "LBL-002", name: "Pallet label · 100×150mm (SSCC)", size: "100×150mm", updated: "2025-10-14", uses: 38, status: "active" },
    { id: "LBL-003", name: "Inner case label · 105×74mm", size: "105×74mm", updated: "2025-09-02", uses: 96, status: "active" },
    { id: "LBL-004", name: "Quarantine label · 100×60mm", size: "100×60mm", updated: "2025-08-18", uses: 12, status: "active" },
    { id: "LBL-005", name: "Sample / retained · 60×40mm", size: "60×40mm", updated: "2025-07-30", uses: 24, status: "draft" }
  ];

  return (
    <>
      <PageHead title="Label templates" sub="Printed labels for products, pallets, inner cases, and quarantine."
        actions={<><button className="btn btn-secondary">Import ZPL</button><button className="btn btn-primary" onClick={() => openEditor("new")}>+ New template</button></>} />

      <Section title="Templates">
        <table>
          <thead><tr><th>ID</th><th>Name</th><th>Size</th><th>Used on</th><th>Updated</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {templates.map(t => (
              <tr key={t.id} style={{ cursor: "pointer" }} onClick={() => openEditor(t.id)}>
                <td className="mono">{t.id}</td>
                <td style={{ fontWeight: 500 }}>{t.name}</td>
                <td className="mono">{t.size}</td>
                <td className="mono num">{t.uses} SKUs</td>
                <td className="mono muted">{t.updated}</td>
                <td>{t.status === "active" ? <span className="badge badge-green">✓ Active</span> : <span className="badge badge-gray">Draft</span>}</td>
                <td className="muted">⋮</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </>
  );
};

// ============ INTERACTIVE LABEL EDITOR ============
const LabelEditor = ({ onBack }) => {
  const [width, setWidth] = React.useState(60);
  const [height, setHeight] = React.useState(40);
  const [elements, setElements] = React.useState([
    { id: 1, type: "text", x: 3, y: 3, w: 54, h: 6, field: "product_name", value: "Sliced Ham 200g", fontSize: 14, bold: true },
    { id: 2, type: "text", x: 3, y: 11, w: 30, h: 4, field: "sku", value: "SKU-2451", fontSize: 9, bold: false },
    { id: 3, type: "barcode", x: 3, y: 18, w: 36, h: 12, field: "ean", value: "5901234567890" },
    { id: 4, type: "text", x: 3, y: 32, w: 54, h: 3, field: "best_before", value: "Best before: 2026-01-14", fontSize: 7, bold: false },
    { id: 5, type: "text", x: 40, y: 11, w: 17, h: 4, field: "lot", value: "L241220", fontSize: 8, bold: false, mono: true },
    { id: 6, type: "text", x: 40, y: 18, w: 17, h: 4, field: "weight", value: "200g e", fontSize: 10, bold: true }
  ]);
  const [selId, setSelId] = React.useState(1);
  const [printer, setPrinter] = React.useState("zebra-zd420");

  const sel = elements.find(e => e.id === selId);
  const update = (id, patch) => setElements(es => es.map(e => e.id === id ? { ...e, ...patch } : e));
  const del = (id) => { setElements(es => es.filter(e => e.id !== id)); setSelId(null); };
  const addEl = (type) => {
    const id = Date.now();
    const tpl = type === "text"
      ? { type: "text", x: 5, y: 5, w: 20, h: 5, field: "custom", value: "New text", fontSize: 10, bold: false }
      : type === "barcode"
      ? { type: "barcode", x: 5, y: 15, w: 30, h: 10, field: "ean", value: "5900000000000" }
      : type === "qr"
      ? { type: "qr", x: 5, y: 15, w: 12, h: 12, field: "url", value: "https://monopilot.app" }
      : { type: "box", x: 5, y: 5, w: 20, h: 10 };
    setElements(es => [...es, { id, ...tpl }]);
    setSelId(id);
  };

  const SCALE = 10; // px per mm

  return (
    <>
      <div className="breadcrumb" style={{ marginBottom: 4 }}>
        <a onClick={onBack}>Settings</a> / <a onClick={onBack}>Label templates</a> / Edit
      </div>
      <div className="page-head">
        <div>
          <div className="page-title">Product retail label · 60×40mm</div>
          <div className="muted" style={{ fontSize: 12 }}>LBL-001 · Last saved 2025-11-20 · Used by 142 SKUs</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary" onClick={onBack}>← Back</button>
          <button className="btn btn-secondary">Preview</button>
          <button className="btn btn-secondary">Test print</button>
          <button className="btn btn-primary">Save</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr 280px", gap: 12, alignItems: "flex-start" }}>

        {/* LEFT: element palette */}
        <div className="sg-section" style={{ position: "sticky", top: 100 }}>
          <div className="sg-section-head"><div className="sg-section-title">Add element</div></div>
          <div className="sg-section-body">
            <button className="btn btn-secondary" style={{ width: "100%", marginBottom: 6, justifyContent: "flex-start" }} onClick={() => addEl("text")}>T  Text / field</button>
            <button className="btn btn-secondary" style={{ width: "100%", marginBottom: 6, justifyContent: "flex-start" }} onClick={() => addEl("barcode")}>▥  Barcode</button>
            <button className="btn btn-secondary" style={{ width: "100%", marginBottom: 6, justifyContent: "flex-start" }} onClick={() => addEl("qr")}>▦  QR code</button>
            <button className="btn btn-secondary" style={{ width: "100%", marginBottom: 6, justifyContent: "flex-start" }} onClick={() => addEl("box")}>□  Box / line</button>
            <button className="btn btn-secondary" style={{ width: "100%", marginBottom: 6, justifyContent: "flex-start" }}>🖼  Logo</button>

            <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
              <div className="muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Data fields</div>
              {["product_name", "sku", "ean", "lot", "weight", "best_before", "batch", "site", "line", "producer"].map(f => (
                <div key={f} className="mono" style={{ padding: "3px 6px", fontSize: 11, color: "var(--muted)", cursor: "grab" }}>{`{${f}}`}</div>
              ))}
            </div>
          </div>
        </div>

        {/* CENTER: canvas */}
        <div className="sg-section">
          <div className="sg-section-head">
            <div>
              <div className="sg-section-title">Canvas</div>
              <div className="sg-section-sub">{width}×{height}mm · Drag on the canvas to select, edit properties on the right.</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn btn-ghost btn-sm">↶</button>
              <button className="btn btn-ghost btn-sm">↷</button>
              <button className="btn btn-ghost btn-sm">100%</button>
            </div>
          </div>
          <div className="sg-section-body" style={{ background: "#f1f5f9", padding: 40, display: "flex", justifyContent: "center", alignItems: "center", minHeight: 420 }}>
            <div style={{
              width: width * SCALE, height: height * SCALE,
              background: "#fff", border: "1px solid var(--border)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
              position: "relative"
            }} onClick={() => setSelId(null)}>
              {/* grid */}
              <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(to right, #f1f5f9 1px, transparent 1px), linear-gradient(to bottom, #f1f5f9 1px, transparent 1px)", backgroundSize: `${SCALE * 5}px ${SCALE * 5}px`, pointerEvents: "none" }}></div>

              {elements.map(el => (
                <div key={el.id}
                  onClick={(e) => { e.stopPropagation(); setSelId(el.id); }}
                  style={{
                    position: "absolute",
                    left: el.x * SCALE, top: el.y * SCALE,
                    width: el.w * SCALE, height: el.h * SCALE,
                    border: selId === el.id ? "2px solid var(--blue)" : "1px dashed rgba(15,23,42,0.2)",
                    cursor: "move", padding: 2, boxSizing: "border-box",
                    display: "flex", alignItems: "center",
                    background: selId === el.id ? "rgba(59,130,246,0.06)" : "transparent"
                  }}>
                  {el.type === "text" && (
                    <span style={{ fontSize: el.fontSize || 10, fontWeight: el.bold ? 700 : 400, fontFamily: el.mono ? "var(--font-mono)" : "inherit", lineHeight: 1.1, overflow: "hidden" }}>
                      {el.value}
                    </span>
                  )}
                  {el.type === "barcode" && (
                    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                      <div style={{ flex: 1, display: "flex", alignItems: "stretch", gap: 0 }}>
                        {Array.from({ length: 45 }).map((_, i) => (
                          <div key={i} style={{ flex: (i * 7) % 3 === 0 ? 2 : 1, background: (i * 3) % 2 === 0 ? "#0f172a" : "transparent" }}></div>
                        ))}
                      </div>
                      <div className="mono" style={{ fontSize: 7, textAlign: "center", letterSpacing: 1 }}>{el.value}</div>
                    </div>
                  )}
                  {el.type === "qr" && (
                    <svg viewBox="0 0 20 20" style={{ width: "100%", height: "100%" }}>
                      {Array.from({ length: 400 }).map((_, i) => {
                        const x = i % 20, y = Math.floor(i / 20);
                        const isCorner = (x < 4 && y < 4) || (x > 15 && y < 4) || (x < 4 && y > 15);
                        return <rect key={i} x={x} y={y} width="1" height="1" fill={isCorner ? "#0f172a" : (Math.random() > 0.55 ? "#0f172a" : "#fff")} />;
                      })}
                    </svg>
                  )}
                  {el.type === "box" && <div style={{ width: "100%", height: "100%", border: "1px solid #0f172a" }}></div>}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT: inspector */}
        <div style={{ position: "sticky", top: 100 }}>
          {sel ? (
            <div className="sg-section">
              <div className="sg-section-head"><div className="sg-section-title">{sel.type === "text" ? "Text" : sel.type === "barcode" ? "Barcode" : sel.type === "qr" ? "QR code" : "Box"}</div><button className="btn btn-ghost btn-sm" onClick={() => del(sel.id)} style={{ color: "var(--red)" }}>Delete</button></div>
              <div className="sg-section-body">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                  <div><label>X (mm)</label><input type="number" value={sel.x} onChange={e => update(sel.id, { x: Number(e.target.value) })} /></div>
                  <div><label>Y (mm)</label><input type="number" value={sel.y} onChange={e => update(sel.id, { y: Number(e.target.value) })} /></div>
                  <div><label>W (mm)</label><input type="number" value={sel.w} onChange={e => update(sel.id, { w: Number(e.target.value) })} /></div>
                  <div><label>H (mm)</label><input type="number" value={sel.h} onChange={e => update(sel.id, { h: Number(e.target.value) })} /></div>
                </div>

                {sel.type === "text" && (
                  <>
                    <div style={{ marginBottom: 10 }}><label>Data field</label>
                      <select value={sel.field} onChange={e => update(sel.id, { field: e.target.value })}>
                        <option>product_name</option><option>sku</option><option>ean</option><option>lot</option>
                        <option>weight</option><option>best_before</option><option>batch</option><option>custom</option>
                      </select>
                    </div>
                    <div style={{ marginBottom: 10 }}><label>Preview value</label>
                      <input type="text" value={sel.value} onChange={e => update(sel.id, { value: e.target.value })} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                      <div><label>Font size (pt)</label><input type="number" value={sel.fontSize} onChange={e => update(sel.id, { fontSize: Number(e.target.value) })} /></div>
                      <div><label>Weight</label>
                        <select value={sel.bold ? "bold" : "regular"} onChange={e => update(sel.id, { bold: e.target.value === "bold" })}>
                          <option value="regular">Regular</option><option value="bold">Bold</option>
                        </select>
                      </div>
                    </div>
                    <div><label>Monospace</label><Toggle on={!!sel.mono} onChange={v => update(sel.id, { mono: v })} /></div>
                  </>
                )}

                {sel.type === "barcode" && (
                  <>
                    <div style={{ marginBottom: 10 }}><label>Symbology</label>
                      <select defaultValue="ean13"><option value="ean13">EAN-13</option><option>Code 128</option><option>GS1-128</option></select>
                    </div>
                    <div style={{ marginBottom: 10 }}><label>Data field</label>
                      <select value={sel.field} onChange={e => update(sel.id, { field: e.target.value })}>
                        <option>ean</option><option>sku</option><option>lot</option><option>sscc</option>
                      </select>
                    </div>
                    <div><label>Preview value</label><input type="text" value={sel.value} onChange={e => update(sel.id, { value: e.target.value })} /></div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="sg-section">
              <div className="sg-section-head"><div className="sg-section-title">Template settings</div></div>
              <div className="sg-section-body">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                  <div><label>Width (mm)</label><input type="number" value={width} onChange={e => setWidth(Number(e.target.value))} /></div>
                  <div><label>Height (mm)</label><input type="number" value={height} onChange={e => setHeight(Number(e.target.value))} /></div>
                </div>
                <div style={{ marginBottom: 10 }}><label>Target printer</label>
                  <select value={printer} onChange={e => setPrinter(e.target.value)}>
                    <option value="zebra-zd420">Zebra ZD420 — 203dpi</option>
                    <option value="zebra-zt230">Zebra ZT230 — 300dpi</option>
                    <option value="honeywell-pm43">Honeywell PM43 — 203dpi</option>
                  </select>
                </div>
                <div style={{ marginBottom: 10 }}><label>Used on SKUs</label>
                  <div className="mono" style={{ fontSize: 12 }}>142 SKUs · <a style={{ color: "var(--blue)", cursor: "pointer" }}>view list</a></div>
                </div>
                <div className="muted" style={{ fontSize: 11, paddingTop: 8, borderTop: "1px solid var(--border)", marginTop: 10 }}>
                  💡 Click an element on the canvas to edit its properties. Use the palette on the left to add new elements.
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
    </>
  );
};

// ============ TWEAKS ============
const SettingsTweaks = ({ open, onClose, tweaks, setTweaks }) => {
  const update = (k, v) => {
    setTweaks(t => ({ ...t, [k]: v }));
    window.parent.postMessage({ type: "__edit_mode_set_keys", edits: { [k]: v } }, "*");
  };
  const group = (label, key, opts) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</label>
      <div style={{ display: "flex", gap: 4, background: "var(--gray-100)", padding: 3, borderRadius: 5 }}>
        {opts.map(o => (
          <button key={o.v}
            style={{ flex: 1, padding: "5px 8px", fontSize: 11, border: 0, background: tweaks[key] === o.v ? "#fff" : "transparent", borderRadius: 4, cursor: "pointer", fontFamily: "inherit", color: tweaks[key] === o.v ? "var(--text)" : "var(--muted)", fontWeight: tweaks[key] === o.v ? 500 : 400, boxShadow: tweaks[key] === o.v ? "0 1px 2px rgba(0,0,0,0.08)" : "none" }}
            onClick={() => update(key, o.v)}>{o.l}</button>
        ))}
      </div>
    </div>
  );

  if (!open) return null;
  return (
    <div style={{ position: "fixed", right: 16, bottom: 16, width: 280, background: "#fff", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "0 10px 32px rgba(0,0,0,0.14)", zIndex: 200 }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", fontWeight: 600, fontSize: 13, display: "flex", justifyContent: "space-between" }}>
        Tweaks
        <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ padding: 0 }}>✕</button>
      </div>
      <div style={{ padding: "14px" }}>
        {group("Users list view", "usersView", [{ v: "table", l: "Table" }, { v: "card", l: "Card grid" }])}
        {group("Integrations layout", "intLayout", [{ v: "categories", l: "Categories" }, { v: "grid", l: "Logo grid" }])}
        {group("Settings density", "density", [{ v: "comfortable", l: "Comfortable" }, { v: "compact", l: "Compact" }])}
      </div>
    </div>
  );
};

Object.assign(window, { LabelTemplatesScreen, LabelEditor, SettingsTweaks });
