// ============================================================================
// NPD module · recipe.jsx — In-FG Recipe stage (ingredients, nutrition, allergens)
// ----------------------------------------------------------------------------
// Implementation contract: see ./SCHEMA.md · ./API.md · ./COMPONENT-INTERFACES.md
// Spec: design/01-NPD-UX.md
// ============================================================================

// ============ Recipe formulation workbench ============

const useLiveCalc = (ingredients, batchKg, targetPrice, yieldPct) => {
  return React.useMemo(() => {
    const totalPct = ingredients.reduce((s, i) => s + Number(i.pct || 0), 0);
    const rawCost = ingredients.reduce((s, i) => s + (Number(i.pct || 0) / 100) * Number(i.costPerKg || 0), 0);
    const yieldedCost = yieldPct > 0 ? rawCost / (yieldPct / 100) : rawCost;
    const processing = yieldedCost * 0.08; // overhead
    const packaging = 0.65;
    const totalCostPerKg = yieldedCost + processing + packaging;
    const revenuePerKg = Number(targetPrice || 0) / 0.2; // per kg (pack is 200g)
    const margin = revenuePerKg - totalCostPerKg;
    const marginPct = revenuePerKg > 0 ? (margin / revenuePerKg) * 100 : 0;

    // allergens
    const allergens = [...new Set(ingredients.map(i => i.allergen).filter(Boolean))];

    return {
      totalPct: Math.round(totalPct * 1000) / 1000,
      rawCost, yieldedCost, processing, packaging, totalCostPerKg,
      revenuePerKg, margin, marginPct, allergens
    };
  }, [ingredients, batchKg, targetPrice, yieldPct]);
};

const NutritionPanel = ({ ingredients }) => {
  // nutrition is a simplified derivation; for prototype we interpolate based on pct
  const meatPct = ingredients.find(i => i.code === "RM-1001")?.pct || 0;
  const saltPct = ingredients.find(i => i.code === "RM-3022")?.pct || 0;

  const n = {
    energy:  { val: Math.round(meatPct * 1.70 + 5), unit: "kcal", max: 180, label: "Energy",    target: 150 },
    fat:     { val: +(meatPct * 0.075).toFixed(1),   unit: "g",   max: 12,  label: "Fat",       target: 8 },
    satfat:  { val: +(meatPct * 0.025).toFixed(1),   unit: "g",   max: 4,   label: "Saturates", target: 3 },
    carbs:   { val: +((100 - meatPct) * 0.025).toFixed(1), unit: "g", max: 3, label: "Carbs",   target: 2 },
    sugars:  { val: +((100 - meatPct) * 0.012).toFixed(1), unit: "g", max: 2, label: "Sugars",  target: 1 },
    protein: { val: +(meatPct * 0.24).toFixed(1),    unit: "g",   max: 25,  label: "Protein",   target: 18 },
    salt:    { val: +(saltPct * 1.1).toFixed(2),     unit: "g",   max: 2.5, label: "Salt",      target: 2 }
  };

  const barColor = (val, target, max) => {
    if (val > max) return "var(--red)";
    if (val > target) return "var(--amber)";
    return "var(--green)";
  };

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Nutrition per 100g <span className="muted" style={{ fontSize: 11, fontWeight: 400 }}>· live</span></div>
        <button className="btn btn-ghost btn-sm">Export label</button>
      </div>
      {Object.entries(n).map(([k, v]) => (
        <div key={k} className="nut-bar">
          <div className="nut-label">{v.label}</div>
          <div className="nut-track"><div className="nut-fill" style={{ width: `${Math.min(100, (v.val / v.max) * 100)}%`, background: barColor(v.val, v.target, v.max) }}></div></div>
          <div className="nut-val">{v.val} {v.unit}</div>
        </div>
      ))}
      <div className="muted" style={{ fontSize: 11, marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
        Targets: Protein ≥ 18g · Salt ≤ 2g · Fat ≤ 8g per 100g
      </div>
    </div>
  );
};

const CostPanel = ({ calc, targetPrice, setTargetPrice, yieldPct, setYieldPct }) => (
  <div className="card">
    <div className="card-head">
      <div className="card-title">Cost & margin <span className="muted" style={{ fontSize: 11, fontWeight: 400 }}>· live</span></div>
    </div>

    <div className="cost-box">
      <div className="cost-line"><span>Raw material</span><span className="mono">€{calc.rawCost.toFixed(2)} / kg</span></div>
      <div className="cost-line"><span>After yield ({yieldPct}%)</span><span className="mono">€{calc.yieldedCost.toFixed(2)} / kg</span></div>
      <div className="cost-line"><span>Processing (8%)</span><span className="mono">€{calc.processing.toFixed(2)} / kg</span></div>
      <div className="cost-line"><span>Packaging</span><span className="mono">€{calc.packaging.toFixed(2)} / kg</span></div>
      <div className="cost-line total"><span>Total cost / kg</span><span className="mono">€{calc.totalCostPerKg.toFixed(2)}</span></div>
    </div>

    <div className="form-grid" style={{ marginBottom: 10 }}>
      <div className="field"><label>Target price (200g pack)</label>
        <input value={targetPrice} onChange={e => setTargetPrice(e.target.value)} />
      </div>
      <div className="field"><label>Expected yield %</label>
        <input type="number" value={yieldPct} onChange={e => setYieldPct(Number(e.target.value))} />
      </div>
    </div>

    <div className="cost-box" style={{ background: calc.marginPct < 0 ? "var(--red-050a, #fee2e2)" : calc.marginPct < 15 ? "var(--amber-050a)" : "var(--green-050a, #dcfce7)" }}>
      <div className="cost-line"><span>Revenue / kg (at target price)</span><span className="mono">€{calc.revenuePerKg.toFixed(2)}</span></div>
      <div className="cost-line"><span>Margin / kg</span><span className={calc.margin >= 0 ? "good mono" : "bad mono"}>€{calc.margin.toFixed(2)}</span></div>
      <div className="cost-line total">
        <span>Margin %</span>
        <span className="mono" style={{ color: calc.marginPct < 0 ? "var(--red)" : calc.marginPct < 15 ? "var(--amber-700)" : "var(--green)" }}>
          {calc.marginPct.toFixed(1)}%
        </span>
      </div>
    </div>
  </div>
);

const AllergenPanel = ({ calc }) => {
  const detected = calc.allergens;
  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 8 }}>Allergens</div>
      <div>
        {window.NPD_ALLERGENS.map(a => (
          <span key={a} className={`allergen-chip ${detected.includes(a.toLowerCase()) ? "on" : ""}`}>{a}</span>
        ))}
      </div>
      {detected.length > 0 ? (
        <div className="alert alert-amber" style={{ marginTop: 10, marginBottom: 0 }}>
          <strong>{detected.length} allergen{detected.length > 1 ? "s" : ""} detected:</strong> {detected.map(d => d[0].toUpperCase() + d.slice(1)).join(", ")}. Must be declared on label.
        </div>
      ) : (
        <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>No allergens detected from current ingredients.</div>
      )}
    </div>
  );
};

const IngredientRow = ({ ing, idx, onChange, onDelete }) => (
  <div className="ing-row">
    <div className="drag">⋮⋮</div>
    <div>
      <input value={ing.name} onChange={e => onChange(idx, "name", e.target.value)} />
      <div className="mono muted" style={{ fontSize: 10, marginTop: 2 }}>{ing.code}</div>
    </div>
    <input className="num" type="number" step="0.01" value={ing.pct} onChange={e => onChange(idx, "pct", Number(e.target.value))} />
    <input className="num" type="number" step="0.01" value={ing.costPerKg} onChange={e => onChange(idx, "costPerKg", Number(e.target.value))} />
    <div className="mono num">{((ing.pct / 100) * ing.costPerKg).toFixed(3)} €</div>
    <div>
      {ing.allergen ? <span className="badge badge-amber">{ing.allergen}</span> : <span className="muted" style={{ fontSize: 11 }}>—</span>}
    </div>
    <div className="del" onClick={() => onDelete(idx)}>✕</div>
  </div>
);

const RecipeScreen = ({ project, density }) => {
  const [ingredients, setIngredients] = React.useState(window.NPD_INGREDIENTS_DEFAULT);
  const [targetPrice, setTargetPrice] = React.useState("3.98"); // per 200g pack
  const [yieldPct, setYieldPct] = React.useState(78);
  const [batchKg, setBatchKg] = React.useState(500);

  const calc = useLiveCalc(ingredients, batchKg, targetPrice, yieldPct);

  const updateIng = (idx, field, val) => {
    setIngredients(ings => ings.map((ing, i) => i === idx ? { ...ing, [field]: val } : ing));
  };
  const deleteIng = (idx) => setIngredients(ings => ings.filter((_, i) => i !== idx));
  const addIng = () => setIngredients(ings => [...ings, { id: Date.now(), code: "RM-NEW", name: "New ingredient", pct: 0, costPerKg: 0, allergen: null }]);

  return (
    <>
      {/* toolbar */}
      <div className="card" style={{ padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div>
            <div className="muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Recipe</div>
            <div style={{ fontWeight: 600 }}>White Sliced Loaf 800g · v0.3 draft</div>
          </div>
          <div style={{ width: 1, height: 28, background: "var(--border)" }}></div>
          <div><div className="muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Batch size</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="number" value={batchKg} onChange={e => setBatchKg(Number(e.target.value))} style={{ width: 70, padding: "3px 8px" }} />
              <span className="mono muted" style={{ fontSize: 12 }}>kg</span>
            </div>
          </div>
          <div><div className="muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Version</div>
            <select defaultValue="0.3" style={{ padding: "3px 8px", width: "auto" }}>
              <option>v0.1</option><option>v0.2</option><option>v0.3</option>
            </select>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost">Compare versions</button>
          <button className="btn btn-secondary">Save draft</button>
          <button className="btn btn-primary">Submit for trial →</button>
        </div>
      </div>

      <div className="workbench">
        {/* ingredients table */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="card-head" style={{ padding: "12px 14px 8px", margin: 0 }}>
            <div>
              <div className="card-title">Ingredients</div>
              <div className="muted" style={{ fontSize: 11 }}>Edit any % or cost — nutrition, allergens, and margin recalculate live.</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn btn-ghost btn-sm">Import CSV</button>
              <button className="btn btn-secondary btn-sm" onClick={addIng}>+ Add ingredient</button>
            </div>
          </div>

          <div className="ing-row head">
            <div></div>
            <div>Ingredient</div>
            <div style={{ textAlign: "right" }}>% w/w</div>
            <div style={{ textAlign: "right" }}>€ / kg</div>
            <div style={{ textAlign: "right" }}>Contrib.</div>
            <div>Allergen</div>
            <div></div>
          </div>

          {ingredients.map((ing, idx) => (
            <IngredientRow key={ing.id} ing={ing} idx={idx} onChange={updateIng} onDelete={deleteIng} />
          ))}

          <div className="ing-row total">
            <div></div>
            <div>Total</div>
            <div className="num mono" style={{ color: Math.abs(calc.totalPct - 100) < 0.01 ? "var(--green)" : "var(--red)" }}>
              {calc.totalPct.toFixed(3)}%
            </div>
            <div className="num muted mono">—</div>
            <div className="num mono">{calc.rawCost.toFixed(3)} €</div>
            <div></div>
            <div></div>
          </div>

          {Math.abs(calc.totalPct - 100) > 0.01 && (
            <div className="alert alert-amber" style={{ margin: 10, marginTop: 0 }}>
              Ingredient total is {calc.totalPct.toFixed(3)}%. Adjust to exactly 100% before submitting for trial.
            </div>
          )}

          {/* Composition bar */}
          <div style={{ padding: "14px 14px 18px" }}>
            <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Composition</div>
            <div style={{ display: "flex", height: 24, borderRadius: 4, overflow: "hidden", border: "1px solid var(--border)" }}>
              {ingredients.map((ing, i) => {
                const colors = ["#D97757", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16"];
                return <div key={ing.id} title={`${ing.name}: ${ing.pct}%`} style={{ width: `${(ing.pct / calc.totalPct) * 100}%`, background: colors[i % colors.length] }}></div>;
              })}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8, fontSize: 11 }}>
              {ingredients.filter(i => i.pct > 0.5).map((ing, i) => {
                const colors = ["#D97757", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16"];
                return (
                  <span key={ing.id} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <span style={{ width: 8, height: 8, background: colors[i % colors.length], borderRadius: 2 }}></span>
                    <span>{ing.name} {ing.pct}%</span>
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* side panels */}
        <div>
          <NutritionPanel ingredients={ingredients} />
          <CostPanel calc={calc} targetPrice={targetPrice} setTargetPrice={setTargetPrice} yieldPct={yieldPct} setYieldPct={setYieldPct} />
          <AllergenPanel calc={calc} />
        </div>
      </div>
    </>
  );
};

Object.assign(window, { RecipeScreen });
