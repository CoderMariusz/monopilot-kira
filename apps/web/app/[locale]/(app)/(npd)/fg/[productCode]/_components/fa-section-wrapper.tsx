'use client';

/**
 * A3 · SLICE 2 — FaSectionWrapper.
 *
 * Thin PRESENTATIONAL stacker (NO data fetching, NO write path): renders 2-3
 * already-assembled dept-tab ReactNodes vertically, each under a small dept
 * heading + divider. The dept-tab bodies (FaCoreTab / FaCommercialTab /
 * FaPlanningTab / FaProcurementTab / FaProductionTab / FaTechnicalTab + the MRP
 * field renderer) are built upstream in page.tsx and passed in via `parts` — this
 * component gets ZERO knowledge of columns / values / dropdowns / updateFaCell.
 *
 * WHY: A3 SLICE 2 regroups the 9 dept tabs into 3 owner-facing SECTIONS
 * (Core / Commercial & Planning / Production & Technical) WITHOUT rewriting any
 * field cell. The grouping (which dept folds into which section) is owned by
 * SECTION_MAP in load-fa-dynamic-sections.types.ts; this wrapper only lays the
 * already-rendered dept bodies out within a section.
 *
 * The per-dept gates (required-field-for-done, MRP-needs-prod, Procurement-price-
 * needs-production) are UNCHANGED — they still live inside each dept tab body and
 * in the flat DeptStatusStrip above the tabs. This wrapper adds no section-level
 * locks.
 *
 * i18n: every visible string is a prop (`labels`). No inline literals.
 */

import type { ReactNode } from 'react';

/** One stacked dept body inside a section: a localized heading + its node. */
export type FaSectionPart = {
  /** Stable key (the dept code, lower-case) — also the data-dept attribute. */
  key: string;
  /**
   * Canonical `Dept` union value (PascalCase, e.g. "Planning", "MRP") expected by
   * the FA detail modal host's `?dept=` param + close/readiness Server Actions.
   * This is the ONLY thing the per-dept "Close <Dept>" affordance keys off — the
   * dept-close gate must NOT depend on `?tab=` inference (post-A3-slice-2 the tab
   * slugs are section slugs, so inference silently picks the wrong dept).
   */
  deptValue: string;
  /** Localized dept heading shown above the body (e.g. "Planning"). */
  heading: string;
  /** The already-assembled dept-tab ReactNode (built in page.tsx). */
  node: ReactNode;
  /**
   * BUG 4a — whether this dept section is CURRENTLY closed (closed_<dept> === 'Yes').
   * When true the wrapper shows a "Reopen {dept}" affordance INSTEAD of "Close
   * {dept}", so a closed dept can be undone. Defaults to false (open → Close shown).
   * Like the Close affordance, this carries NO client RBAC gate — the reopen modal
   * + reopenDeptSection enforce `npd.closed_flag.unset` server-side.
   */
  closed?: boolean;
};

export type FaSectionWrapperProps = {
  /**
   * Section slug (core / commercial / production) — drives the test id and the
   * outer landmark. Purely presentational; no behavior keys off it.
   */
  sectionKey: string;
  /** The ordered dept bodies to stack (2-3 for the grouped sections, 1 for Core). */
  parts: FaSectionPart[];
  /**
   * Localized "Close {dept}" button label template (npd.faDetail.closeDept). The
   * `{dept}` token is replaced with the part heading. Optional so the existing
   * shell tests can render without supplying it (English fallback applied).
   */
  closeDeptLabel?: string;
  /**
   * BUG 4a — Localized "Reopen {dept}" label template (npd.faDetail.reopenDept).
   * Shown in place of the Close affordance for a CLOSED dept. `{dept}` → heading.
   */
  reopenDeptLabel?: string;
};

const DEFAULT_CLOSE_DEPT_LABEL = 'Close {dept}';
const DEFAULT_REOPEN_DEPT_LABEL = 'Reopen {dept}';

/**
 * Build the URL the per-dept "Close <Dept>" affordance navigates to. This is the
 * SOLE entry point for the dept-close modal post-A3-slice-2: it carries an
 * EXPLICIT `?dept=<DeptValue>` so `fa-detail-modal-host.resolveDept` never has to
 * infer the dept from `?tab=` (which now only holds section slugs). The modal
 * itself owns ALL permission + readiness gating — this is just the launcher.
 */
export function deptCloseHref(deptValue: string): string {
  const params = new URLSearchParams();
  params.set('modal', 'deptClose');
  params.set('dept', deptValue);
  return `?${params.toString()}`;
}

/**
 * BUG 4a — launcher href for the Reopen-department modal. Mirrors deptCloseHref
 * but targets `?modal=deptReopen` so the FaDetailModalHost mounts the reopen
 * confirm. Carries the EXPLICIT `?dept=<DeptValue>` for the same reason as Close
 * (no `?tab=` inference). All gating + the write live in the modal/action.
 */
export function deptReopenHref(deptValue: string): string {
  const params = new URLSearchParams();
  params.set('modal', 'deptReopen');
  params.set('dept', deptValue);
  return `?${params.toString()}`;
}

export function FaSectionWrapper({ sectionKey, parts, closeDeptLabel, reopenDeptLabel }: FaSectionWrapperProps) {
  const labelTemplate = closeDeptLabel ?? DEFAULT_CLOSE_DEPT_LABEL;
  const reopenLabelTemplate = reopenDeptLabel ?? DEFAULT_REOPEN_DEPT_LABEL;
  return (
    <section
      data-testid={`fa-section-${sectionKey}`}
      data-slot="fa-section"
      data-value={sectionKey}
      className="space-y-6"
    >
      {parts.map((part, index) => {
        const closeLabel = labelTemplate.replace('{dept}', part.heading);
        const reopenLabel = reopenLabelTemplate.replace('{dept}', part.heading);
        return (
          <div
            key={part.key}
            data-dept={part.key}
            data-testid={`fa-section-part-${part.key}`}
            // A divider above every dept body except the first one in the section,
            // so the stacked departments read as distinct groups under one section.
            className={index === 0 ? 'space-y-2' : 'space-y-2 border-t border-[var(--border)] pt-6'}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3
                data-testid={`fa-section-heading-${part.key}`}
                className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]"
              >
                {part.heading}
              </h3>
              {/*
                Per-dept close/reopen affordance — the ONLY dept-close entry point
                that survives the section regroup. A plain link (not a button) so
                the target `?modal=deptClose|deptReopen&dept=<DeptValue>` is
                inspectable and the modal host can resolve the dept explicitly. NO
                gating here: the modal + Server Action do the permission + readiness
                checks server-side. BUG 4a — a CLOSED dept swaps Close → Reopen so
                a dept-section close can be undone (reopenDeptSection,
                `npd.closed_flag.unset`).
              */}
              {part.closed ? (
                <a
                  href={deptReopenHref(part.deptValue)}
                  data-testid={`fa-section-reopen-${part.key}`}
                  data-dept-value={part.deptValue}
                  className="btn-secondary btn-xs inline-flex items-center rounded-md border border-[var(--border)] bg-white px-2 py-1 text-xs font-medium text-[var(--muted)] hover:bg-[var(--gray-050)]"
                >
                  {reopenLabel}
                </a>
              ) : (
                <a
                  href={deptCloseHref(part.deptValue)}
                  data-testid={`fa-section-close-${part.key}`}
                  data-dept-value={part.deptValue}
                  className="btn-secondary btn-xs inline-flex items-center rounded-md border border-[var(--border)] bg-white px-2 py-1 text-xs font-medium text-[var(--muted)] hover:bg-[var(--gray-050)]"
                >
                  {closeLabel}
                </a>
              )}
            </div>
            {part.node}
          </div>
        );
      })}
    </section>
  );
}

export default FaSectionWrapper;
