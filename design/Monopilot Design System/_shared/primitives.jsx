// ==============================================================
// SHARED TUNING PRIMITIVES — Monopilot polish pattern primitives
// See TUNING-PATTERN.md §3 (component rules) and §6 (shadcn port).
//
// Primitives defined here:
//   RunStrip         — inline 8-outcome sparkline strip           (§3.1)
//   EmptyState       — icon + title + body + optional CTA         (§3.8)
//   TabsCounted      — tabs with pill count + tone                (§3.2)
//   CompactActivity  — invocation-grouped event feed              (§3.5)
//   DryRunButton     — secondary preview CTA adjacent to commit   (§3.6)
//   deriveRunHistory — pure helper: entity → outcomes[] (pad to 8)
//                      (data.jsx is frozen — agents derive from
//                       existing entity fields instead)
//
// Each component's prop shape is chosen to be a drop-in
// replacement target for shadcn/ui per TUNING-PATTERN.md §6.
//
// Load order (all prototype HTMLs):
//   1. colors_and_type.css, _shared/shared.css, module CSS
//   2. <script src=".../react.js"> + babel standalone
//   3. <script type="text/babel" src="../_shared/modals.jsx">
//   4. <script type="text/babel" src="../_shared/primitives.jsx">   <-- this file
//   5. <script type="text/babel" src="../_shared/placeholders.jsx">
//   6. module screen scripts
//
// Like modals.jsx / placeholders.jsx this script exposes globals
// (prototype-only — real code uses ES modules).
// ==============================================================

// --------------------------------------------------------------
// deriveRunHistory(entity) → Array<"ok"|"warn"|"bad">
//   Pure helper. data.jsx is frozen (TUNING-PLAN.md §4.5), so
//   agents cannot add a runHistory field. Instead, call this
//   helper in the render path to synthesise an 8-outcome sequence
//   from fields that already exist on the entity.
//
//   Rules (first match wins per slot; pads to 8):
//     - entity.runHistory (if present, already derived) → pass-through
//     - entity.status === "failed" | entity.overdue        → "bad"
//     - entity.warning | entity.status === "partial"       → "warn"
//     - fallback                                           → "ok"
//
//   Deterministic per-entity (uses entity id / code as a tiny
//   scatter so repeated cards don't all look identical).
// --------------------------------------------------------------
const deriveRunHistory = (entity) => {
  if (!entity) return ["ok", "ok", "ok", "ok", "ok", "ok", "ok", "ok"];
  if (Array.isArray(entity.runHistory) && entity.runHistory.length) {
    const out = entity.runHistory.slice(-8);
    while (out.length < 8) out.unshift("ok");
    return out;
  }
  const hasBad =
    entity.status === "failed" ||
    entity.status === "overdue" ||
    entity.status === "held" ||
    entity.status === "blocked" ||
    entity.overdue === true;
  const hasWarn =
    entity.warning === true ||
    entity.status === "partial" ||
    entity.status === "warning" ||
    entity.risk === "warn";

  // Tiny deterministic scatter per entity so cards differ visually.
  const key = String(entity.id || entity.code || entity.name || "x");
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;

  const out = [];
  for (let i = 0; i < 8; i++) {
    const bit = (h >> i) & 7;
    if (i === 7 && hasBad) { out.push("bad"); continue; }
    if (i === 6 && hasWarn) { out.push("warn"); continue; }
    if (hasBad && bit === 0) { out.push("bad"); continue; }
    if (hasWarn && bit < 2) { out.push("warn"); continue; }
    out.push("ok");
  }
  return out;
};

// --------------------------------------------------------------
// <RunStrip outcomes={["ok","warn",...]} max={8} label?="" />
//   Inline 8-cell sparkline. Cells coloured per outcome token.
//   `outcomes` accepts either string tokens ("ok"|"warn"|"bad"|"info"|"empty")
//   OR objects {tone, title} for per-cell hover text (Tune-6b reporting KPI,
//   Tune-2 planning run history). Backward-compatible — existing callers
//   passing ["ok","warn",...] continue to work.
//   shadcn port: keep outer <span/> + per-cell span, wrap in
//   <TooltipProvider/> for per-cell tooltips in real code.
// --------------------------------------------------------------
const RunStrip = ({ outcomes = [], max = 8, label, title }) => {
  const cells = outcomes.slice(-max).map((o) =>
    typeof o === "string" ? { tone: o, title: undefined } : { tone: o.tone || "empty", title: o.title }
  );
  while (cells.length < max) cells.unshift({ tone: "empty", title: undefined });
  return (
    <span className="run-strip" role="img" aria-label={title || "Run history"}>
      {cells.map((c, i) => (
        <span key={i} className={"run-strip-cell " + (c.tone || "empty")} title={c.title || title || undefined}></span>
      ))}
      {label && <span className="run-strip-label">{label}</span>}
    </span>
  );
};

// --------------------------------------------------------------
// <EmptyState icon="📦" title="..." body="..." action={{label,onClick}} dark?={false}/>
//   Renders inside a .card container typically. `dark` variant is
//   for scanner screens only (dark palette).
//   shadcn port: wrap in <Card/> variant; swap emoji for <lucide/>.
// --------------------------------------------------------------
const EmptyState = ({ icon = "📋", title, body, action, dark = false, children }) => (
  <div className={"empty-state" + (dark ? " dark" : "")}>
    <div className="empty-state-icon" aria-hidden="true">{icon}</div>
    {title && <div className="empty-state-title">{title}</div>}
    {body && <div className="empty-state-body">{body}</div>}
    {action && (
      <div className="empty-state-action">
        <button
          type="button"
          className={"btn " + (action.variant === "danger" ? "btn-danger" : "btn-primary") + " btn-sm"}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      </div>
    )}
    {children}
  </div>
);

// --------------------------------------------------------------
// <TabsCounted current="..." tabs={[{key,label,count,tone?}]} onChange={fn} />
//   tone ∈ {"ok","warn","bad","info","neutral"} — drives pill color.
//   Missing tone falls back to neutral.
//   shadcn port: <Tabs/> + <TabsTrigger/> + <Badge/> slot.
// --------------------------------------------------------------
const TabsCounted = ({ current, tabs = [], onChange, ariaLabel }) => (
  <div className="tabs-counted" role="tablist" aria-label={ariaLabel || "Filter tabs"}>
    {tabs.map((t) => {
      const active = t.key === current;
      const tone = t.tone || "neutral";
      const zero = !t.count;
      return (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={active}
          className={"tabs-counted-tab" + (active ? " active" : "")}
          onClick={() => onChange && onChange(t.key)}
        >
          <span>{t.label}</span>
          {typeof t.count === "number" && (
            <span className={"tabs-counted-pill tone-" + tone + (zero ? " zero" : "")}>{t.count}</span>
          )}
        </button>
      );
    })}
  </div>
);

// --------------------------------------------------------------
// <CompactActivity groups={[{id,label,count,events:[{ts,msg,internal?}]}]} />
//   Events grouped per correlation id. Groups start collapsed
//   unless `defaultOpen` is true on the group. Internal events
//   hidden behind a "Show N internal" toggle.
//   shadcn port: <Accordion/> + <Collapsible/>.
// --------------------------------------------------------------
const CompactActivity = ({ groups = [] }) => {
  const initialOpen = {};
  groups.forEach((g) => { if (g.defaultOpen) initialOpen[g.id] = true; });
  const [openMap, setOpenMap] = React.useState(initialOpen);
  const [internalMap, setInternalMap] = React.useState({});

  const toggle = (id) => setOpenMap((m) => ({ ...m, [id]: !m[id] }));
  const toggleInternal = (id) => setInternalMap((m) => ({ ...m, [id]: !m[id] }));

  return (
    <div className="compact-activity">
      {groups.map((g) => {
        const isOpen = !!openMap[g.id];
        const showInternal = !!internalMap[g.id];
        const events = g.events || [];
        const visible = showInternal ? events : events.filter((e) => !e.internal);
        const internalCount = events.filter((e) => e.internal).length;
        return (
          <div key={g.id} className={"compact-activity-group" + (isOpen ? " open" : "")}>
            <div
              className="compact-activity-head"
              onClick={() => toggle(g.id)}
              role="button"
              aria-expanded={isOpen}
            >
              <span className="compact-activity-caret">▶</span>
              <span className="compact-activity-corr">{g.label || g.id}</span>
              <span className="compact-activity-count">{g.count ?? events.length} events</span>
            </div>
            {isOpen && (
              <div className="compact-activity-events">
                {visible.map((e, i) => (
                  <div key={i} className={"compact-activity-event" + (e.internal ? " internal" : "")}>
                    <span className="ts">{e.ts}</span>
                    <span className="msg">{e.msg}</span>
                  </div>
                ))}
                {internalCount > 0 && (
                  <button
                    type="button"
                    className="compact-activity-toggle-internal"
                    onClick={() => toggleInternal(g.id)}
                  >
                    {showInternal ? `Hide ${internalCount} internal` : `Show ${internalCount} internal`}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// --------------------------------------------------------------
// <DryRunButton onClick={fn} label?="Dry run" disabled?={false} />
//   Secondary preview CTA, sits adjacent to a primary commit
//   action. Caller wires onClick to open a preview modal.
//   shadcn port: <Button variant="outline"/> with dashed style.
// --------------------------------------------------------------
const DryRunButton = ({ onClick, label = "Dry run", disabled = false, title }) => (
  <button
    type="button"
    className="btn-dryrun"
    onClick={onClick}
    disabled={disabled}
    title={title || "Preview the result before committing"}
  >
    <span className="dryrun-icon" aria-hidden="true">◐</span>
    <span>{label}</span>
  </button>
);

// --------------------------------------------------------------
// Expose to window (prototype-only — real product uses ES modules).
// --------------------------------------------------------------
Object.assign(window, {
  RunStrip,
  EmptyState,
  TabsCounted,
  CompactActivity,
  DryRunButton,
  deriveRunHistory,
});
