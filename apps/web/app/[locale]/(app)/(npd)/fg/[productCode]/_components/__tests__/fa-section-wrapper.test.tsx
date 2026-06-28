/**
 * @vitest-environment jsdom
 *
 * A3 · SLICE 2 — FaSectionWrapper dept-close-gate REACHABILITY (regression guard).
 *
 * SHIP-BLOCKING regression this test pins: after the slice-2 section regroup the
 * only "Dept Close" launcher (FaRightPanelActions) opens `?modal=deptClose` with
 * NO `?dept=`, so the modal host's resolveDept fell back to inferring the dept
 * from `?tab=` — which now only holds SECTION slugs (core/commercial/production).
 * That silently made Planning / Procurement / Technical / MRP impossible to close.
 *
 * The fix: FaSectionWrapper renders, for EVERY stacked dept part, an explicit
 * "Close <Dept>" affordance whose target is `?modal=deptClose&dept=<DeptValue>`.
 * The DeptValue strings MUST be the exact canonical `Dept` union the modal host's
 * resolveDept / DEPT_VALUES accept (Core/Commercial/Planning/Procurement/
 * Production/Technical/MRP) — otherwise resolveDept rejects the param and falls
 * back to inference again.
 *
 * This test asserts the GATE IS REACHABLE for each dept (the launcher exists and
 * carries the right explicit ?dept=). It does NOT re-test the modal's permission /
 * readiness gating — that lives in the deptClose modal + close action and has its
 * own suites; the wrapper is only the entry point.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

import { FaSectionWrapper, deptCloseHref, type FaSectionPart } from '../fa-section-wrapper';

afterEach(() => cleanup());

/** The exact canonical `Dept` union strings fa-detail-modal-host.resolveDept honors. */
const CANONICAL_DEPT_VALUES = [
  'Core',
  'Commercial',
  'Planning',
  'Procurement',
  'Production',
  'Technical',
  'MRP',
] as const;

function part(key: string, deptValue: string, heading: string): FaSectionPart {
  return {
    key,
    deptValue,
    heading,
    node: <div data-testid={`body-${key}`}>{heading} body</div>,
  };
}

/** The 3 owner-facing sections, mirroring page.tsx's SECTION_MAP grouping. */
const SECTIONS: Record<string, FaSectionPart[]> = {
  core: [part('core', 'Core', 'Core')],
  commercial: [
    part('commercial', 'Commercial', 'Commercial'),
    part('planning', 'Planning', 'Planning'),
    part('procurement', 'Procurement', 'Procurement'),
  ],
  production: [
    part('production', 'Production', 'Production'),
    part('technical', 'Technical', 'Technical'),
    part('mrp', 'MRP', 'MRP'),
  ],
};

describe('FaSectionWrapper — dept-close gate reachability (A3 slice-2 regression)', () => {
  it.each([
    ['Planning', 'commercial', 'planning'],
    ['Procurement', 'commercial', 'procurement'],
    ['Technical', 'production', 'technical'],
    ['MRP', 'production', 'mrp'],
    ['Core', 'core', 'core'],
    ['Commercial', 'commercial', 'commercial'],
    ['Production', 'production', 'production'],
  ])(
    'renders a "Close %s" affordance targeting ?modal=deptClose&dept=%s (no ?tab= inference)',
    (deptValue, sectionKey, partKey) => {
      render(
        <FaSectionWrapper
          sectionKey={sectionKey}
          parts={SECTIONS[sectionKey]}
          closeDeptLabel="Close {dept}"
        />,
      );

      const link = screen.getByTestId(`fa-section-close-${partKey}`);
      // The launcher is a navigable link (inspectable target), not a bare button.
      expect(link.tagName).toBe('A');
      // EXPLICIT ?dept=<canonical DeptValue> — the whole point of the fix.
      const href = link.getAttribute('href');
      expect(href).toContain('modal=deptClose');
      expect(href).toContain(`dept=${deptValue}`);
      // deptCloseHref is the single source of truth for that target.
      expect(href).toBe(deptCloseHref(deptValue));
      // The dept value is one resolveDept actually accepts.
      expect(CANONICAL_DEPT_VALUES).toContain(deptValue);
      // Visible label is localized via the {dept} template.
      expect(link).toHaveTextContent(`Close ${deptValue}`);
    },
  );

  it('exposes EXACTLY one close affordance per stacked dept part in every section', () => {
    const { container } = render(
      <>
        <FaSectionWrapper sectionKey="core" parts={SECTIONS.core} closeDeptLabel="Close {dept}" />
        <FaSectionWrapper
          sectionKey="commercial"
          parts={SECTIONS.commercial}
          closeDeptLabel="Close {dept}"
        />
        <FaSectionWrapper
          sectionKey="production"
          parts={SECTIONS.production}
          closeDeptLabel="Close {dept}"
        />
      </>,
    );

    const closeLinks = container.querySelectorAll('[data-testid^="fa-section-close-"]');
    // 7 depts → 7 reachable close gates, all carrying an explicit canonical dept.
    expect(closeLinks).toHaveLength(7);

    const seen = Array.from(closeLinks).map((el) => el.getAttribute('data-dept-value'));
    expect(new Set(seen)).toEqual(new Set(CANONICAL_DEPT_VALUES));
    seen.forEach((value) => expect(CANONICAL_DEPT_VALUES).toContain(value));
  });

  it('keeps each dept body rendered alongside its close affordance', () => {
    render(
      <FaSectionWrapper
        sectionKey="commercial"
        parts={SECTIONS.commercial}
        closeDeptLabel="Close {dept}"
      />,
    );
    // The close affordance sits in the same part container as the (unchanged) body.
    const planningPart = screen.getByTestId('fa-section-part-planning');
    expect(within(planningPart).getByTestId('fa-section-close-planning')).toBeInTheDocument();
    expect(within(planningPart).getByTestId('body-planning')).toBeInTheDocument();
  });
});
