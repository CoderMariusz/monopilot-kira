'use client';

/**
 * ProjectStepper — the NPD project workbench 8-step top stepper.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/project.jsx:4-20   (StageRail —
 *     numbered circles; done → ✓ green, active → filled blue + number, future →
 *     light-grey circle + grey label) — the per-step CIRCLE styling.
 *   prototypes/design/Monopilot Design System/npd/project.jsx:130-142 (wizard
 *     step-bar — numbered circles connected by a 2px line; bg = green when done,
 *     blue when active, gray-100 when future; bold label on the active step;
 *     uppercase grey label on future steps) — the CONNECTOR LINE + active/future
 *     label weight.
 *
 * Translation notes:
 *   - The prototype's click-to-switch-stage `onNav(key)` (an in-memory React
 *     state swap) becomes route-per-stage navigation: each step is a real
 *     locale-prefixed `next/link` to /[locale]/pipeline/[id]/<stage>.
 *   - The legacy mock `window.NPD_STAGE_DETAIL` ordered model becomes the fixed
 *     8-step workflow Brief→Recipe→Packaging→Trial→Sensory→Pilot→Approval→Handoff.
 *   - done/active is derived from the PROJECT's real `current_stage` (mig 242), so
 *     the rail shows true progress on every child route (prototype project.jsx:4-20
 *     derives done-ness from `project`, NOT from the viewed screen). The CURRENTLY
 *     VIEWED route segment (usePathname) additionally gets aria-current="page" so
 *     keyboard/SR users know which stage they are reading.
 *   - When the project's current_stage is unknown/blank, it falls back to the
 *     viewed route segment; on the bare /pipeline/[id] index with no stage at all,
 *     every step renders in its "future" tone.
 *
 * Next 16 RSC safety: this is a Client island. The parent layout (a Server
 * Component) passes only serializable props (projectId, locale, labels) — no
 * function props cross the RSC boundary.
 *
 * a11y: rendered as a <nav> with an ordered list; the active step carries
 * aria-current="step". Status is conveyed by text label weight + the ✓ glyph,
 * never colour alone.
 *
 * Design tokens only (mirrors StageRail / DeptStatusStrip): done → var(--green)
 * white ✓, active → var(--blue) white number, future → var(--gray-100) muted
 * number; connector → var(--green) when done else var(--border).
 */

import type { CSSProperties } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// PROJECT_STAGES lives in a non-'use client' sibling so the server layout can
// import the real array (see project-stages.ts header — Next 16 RSC bug guard).
import { PROJECT_STAGES, type ProjectStageKey } from './project-stages';

export { PROJECT_STAGES };
export type { ProjectStageKey };

export type ProjectStepperProps = {
  /** Project id used to build the per-stage hrefs. */
  projectId: string;
  /** Active locale used to build locale-prefixed hrefs. */
  locale: string;
  /** Already-localized labels for the 8 steps, keyed by stage key. */
  labels: Record<ProjectStageKey, string>;
  /** Accessible label for the stepper nav (already localized). */
  ariaLabel: string;
  /**
   * The project's real current stage (npd_projects.current_stage, mig 242). Drives
   * which step is "active" + which earlier steps are "done". When omitted/unknown
   * the stepper falls back to the viewed route segment.
   */
  currentStageKey?: string | null;
  /** Test-only pathname override (mirrors settings-subnav). */
  pathnameOverride?: string;
};

/**
 * Resolve the active stage from a pathname like /en/pipeline/p1/formulation.
 * Returns the index into PROJECT_STAGES, or -1 for the bare project index
 * (/en/pipeline/p1) where no stage is active.
 */
function activeStageIndex(pathname: string, projectId: string): number {
  const marker = `/pipeline/${projectId}/`;
  const at = pathname.indexOf(marker);
  if (at === -1) return -1; // bare index or unrelated route → no active stage
  const rest = pathname.slice(at + marker.length);
  const segment = rest.split('/')[0]?.split('?')[0] ?? '';
  if (!segment) return -1;
  return PROJECT_STAGES.findIndex((s) => s.segment === segment);
}

const circleBase: CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 12,
  fontWeight: 700,
  flex: '0 0 auto',
  zIndex: 1,
};

export function ProjectStepper({
  projectId,
  locale,
  labels,
  ariaLabel,
  currentStageKey,
  pathnameOverride,
}: ProjectStepperProps) {
  const runtimePathname = usePathname();
  const pathname = pathnameOverride ?? runtimePathname ?? '';
  // The step the USER is currently reading (route segment) — gets aria-current="page".
  const viewedIndex = activeStageIndex(pathname, projectId);
  // The project's REAL progress (current_stage) drives done/active styling; fall
  // back to the viewed route when the project's stage is unknown.
  const stageIndex = currentStageKey
    ? PROJECT_STAGES.findIndex((s) => s.key === currentStageKey)
    : -1;
  const currentIndex = stageIndex >= 0 ? stageIndex : viewedIndex;

  return (
    <nav
      aria-label={ariaLabel}
      data-testid="project-stepper"
      data-prototype-anchor="npd/project.jsx:4-20,130-142"
      className="card"
      style={{ padding: '12px 16px', marginBottom: 10 }}
    >
      <ol
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          listStyle: 'none',
          margin: 0,
          padding: 0,
        }}
      >
        {PROJECT_STAGES.map((stage, i) => {
          // currentIndex === -1 (bare index) → nothing active, all "future".
          const done = currentIndex >= 0 && i < currentIndex;
          const active = currentIndex >= 0 && i === currentIndex;
          const status = done ? 'done' : active ? 'active' : 'future';
          // The step whose ROUTE is currently displayed (may differ from the
          // project's current_stage when the user clicks ahead/behind).
          const viewed = viewedIndex >= 0 && i === viewedIndex;
          const bg = done ? 'var(--green)' : active ? 'var(--blue)' : 'var(--gray-100)';
          const color = done || active ? '#fff' : 'var(--muted)';
          const href = `/${locale}/pipeline/${projectId}/${stage.segment}`;
          const isLast = i === PROJECT_STAGES.length - 1;

          return (
            <li
              key={stage.key}
              data-testid={`project-step-${stage.key}`}
              data-status={status}
              data-viewed={viewed ? 'true' : undefined}
              aria-current={viewed ? 'page' : active ? 'step' : undefined}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                flex: isLast ? '0 0 auto' : 1,
                position: 'relative',
              }}
            >
              <Link
                href={href}
                prefetch
                data-testid={`project-step-link-${stage.key}`}
                aria-label={labels[stage.key]}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  textDecoration: 'none',
                }}
              >
                <span aria-hidden="true" style={{ ...circleBase, background: bg, color }}>
                  {done ? '✓' : i + 1}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    textAlign: 'center',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    fontWeight: active || viewed ? 700 : 400,
                    color: done || active || viewed ? 'var(--text)' : 'var(--muted)',
                    textDecoration: viewed ? 'underline' : undefined,
                    textUnderlineOffset: viewed ? 3 : undefined,
                  }}
                >
                  {labels[stage.key]}
                </span>
              </Link>
              {!isLast ? (
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
    </nav>
  );
}

export default ProjectStepper;
