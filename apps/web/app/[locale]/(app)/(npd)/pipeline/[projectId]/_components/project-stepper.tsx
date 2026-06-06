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
 *   - Active step is derived from `usePathname()` (the trailing /<stage> segment),
 *     NOT from props, so it stays correct on hard navigation + back/forward.
 *   - Completed vs future is derived presentationally by position relative to the
 *     active step (steps before the active one are "done"). When the route is the
 *     bare /pipeline/[id] index there is no active stage: no step is highlighted
 *     and every step renders in its "future" (un-visited) tone.
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

/** The fixed 8 workflow stages, in order, with their route segment + i18n key. */
export const PROJECT_STAGES = [
  { key: 'brief', segment: 'brief', i18nKey: 'brief' },
  { key: 'recipe', segment: 'formulation', i18nKey: 'recipe' },
  { key: 'packaging', segment: 'packaging', i18nKey: 'packaging' },
  { key: 'trial', segment: 'trial', i18nKey: 'trial' },
  { key: 'sensory', segment: 'sensory', i18nKey: 'sensory' },
  { key: 'pilot', segment: 'pilot', i18nKey: 'pilot' },
  { key: 'approval', segment: 'approval', i18nKey: 'approval' },
  { key: 'handoff', segment: 'handoff', i18nKey: 'handoff' },
] as const;

export type ProjectStageKey = (typeof PROJECT_STAGES)[number]['key'];

export type ProjectStepperProps = {
  /** Project id used to build the per-stage hrefs. */
  projectId: string;
  /** Active locale used to build locale-prefixed hrefs. */
  locale: string;
  /** Already-localized labels for the 8 steps, keyed by stage key. */
  labels: Record<ProjectStageKey, string>;
  /** Accessible label for the stepper nav (already localized). */
  ariaLabel: string;
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
  pathnameOverride,
}: ProjectStepperProps) {
  const runtimePathname = usePathname();
  const pathname = pathnameOverride ?? runtimePathname ?? '';
  const currentIndex = activeStageIndex(pathname, projectId);

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
          const bg = done ? 'var(--green)' : active ? 'var(--blue)' : 'var(--gray-100)';
          const color = done || active ? '#fff' : 'var(--muted)';
          const href = `/${locale}/pipeline/${projectId}/${stage.segment}`;
          const isLast = i === PROJECT_STAGES.length - 1;

          return (
            <li
              key={stage.key}
              data-testid={`project-step-${stage.key}`}
              data-status={status}
              aria-current={active ? 'step' : undefined}
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
                    fontWeight: active ? 700 : 400,
                    color: done || active ? 'var(--text)' : 'var(--muted)',
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
