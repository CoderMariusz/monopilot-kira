/**
 * StageRail — horizontal Stage-Gate progress dots (presentational, server-safe).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/project.jsx:4-20 (StageRail)
 *   - one dot per stage; a dot before the current index shows ✓ (done), the
 *     current/future dots show their 1-based number; the current dot is "active".
 *
 * Translation notes (project.jsx:4-20):
 *   - window.NPD_STAGE_DETAIL mock        → the REAL ordered Stage-Gate model
 *     (G0..G4 + Launched) is resolved server-side and passed in as `stages`.
 *   - clickable stage-dot onNav(s.key)    → REMOVED. The legacy rail navigated to
 *     a per-stage mock view; in production the dots are a read-only progress
 *     indicator (the gate workspace is reached via the quick links / the gate
 *     child route). Keeping it presentational also satisfies the Next 16 RSC rule
 *     (NO function props from a Server Component into a Client Component).
 *
 * PURE / SERVER-SAFE: receives a plain, already-derived `stages` array + the
 * 0-based `currentIndex`; no functions, no DB calls. Not a 'use client' module,
 * so it can render directly inside the project-detail Server Component.
 *
 * Design tokens only (mirrors DeptStatusStrip): done → var(--green) white ✓,
 * active → var(--blue) white number, future → var(--gray-100) muted number.
 */

export type StageRailItem = {
  /** Machine stage/gate key, e.g. 'G0'. */
  key: string;
  /** Human-readable, already-localized label rendered under the dot. */
  label: string;
};

export type StageRailProps = {
  stages: StageRailItem[];
  /** 0-based index of the current stage (dots before it are "done"). */
  currentIndex: number;
  /** Accessible label for the rail container (already localized). */
  ariaLabel?: string;
};

export function StageRail({ stages, currentIndex, ariaLabel }: StageRailProps) {
  return (
    <div
      className="card"
      data-testid="project-stage-rail"
      data-prototype-anchor="npd/project.jsx:4-20"
      style={{ padding: '12px 16px', marginBottom: 10 }}
    >
      <ol
        aria-label={ariaLabel}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          listStyle: 'none',
          margin: 0,
          padding: 0,
        }}
      >
        {stages.map((stage, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          const bg = done ? 'var(--green)' : active ? 'var(--blue)' : 'var(--gray-100)';
          const color = done || active ? '#fff' : 'var(--muted)';
          const status = done ? 'done' : active ? 'active' : 'future';
          return (
            <li
              key={stage.key}
              data-testid={`project-stage-${stage.key}`}
              data-status={status}
              aria-current={active ? 'step' : undefined}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                flex: i < stages.length - 1 ? 1 : '0 0 auto',
                position: 'relative',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  background: bg,
                  color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                  flex: '0 0 auto',
                  zIndex: 1,
                }}
              >
                {done ? '✓' : i + 1}
              </span>
              <span
                style={{
                  fontSize: 11,
                  textAlign: 'center',
                  fontWeight: active ? 600 : 400,
                  color: done || active ? 'var(--text)' : 'var(--muted)',
                }}
              >
                {stage.label}
              </span>
              {i < stages.length - 1 ? (
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: 13,
                    left: 'calc(50% + 13px)',
                    right: 'calc(-50% + 13px)',
                    height: 2,
                    background: done ? 'var(--green)' : 'var(--border)',
                  }}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default StageRail;
