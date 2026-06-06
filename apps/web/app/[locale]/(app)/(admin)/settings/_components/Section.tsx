import React from 'react';

export type SectionProps = {
  /** Section heading rendered in `.sg-section-title` and used to derive `aria-labelledby`. */
  title?: string;
  /** Optional sub-line rendered in `.sg-section-sub`. */
  sub?: string;
  /** Optional action node(s) rendered on the right of the section head. */
  action?: React.ReactNode;
  /** Optional footer content rendered in the grey `.sg-section-foot` (e.g. Save/Cancel). */
  foot?: React.ReactNode;
  /** Section body (rows). */
  children: React.ReactNode;
};

/**
 * Reusable settings section shell. Mirrors the prototype `Section`
 * (prototypes/design/Monopilot Design System/settings/shell.jsx:71-86).
 *
 * Presentational + server-safe. Emits the prototype `.sg-section*` classes;
 * styling (card chrome, grey footer, separators) comes from the ported
 * settings design-system CSS (A1).
 *
 * Accessibility: when a `title` is present the section is exposed as a labelled
 * region (`role="region"` + `aria-labelledby` pointing at the title), matching
 * the a11y pattern already shipping in the Company profile screen.
 */
export function Section({ title, sub, action, foot, children }: SectionProps) {
  const reactId = React.useId();
  const hasHead = Boolean(title || action);
  const titleId = title ? `sg-section-title-${reactId}` : undefined;

  return (
    <div
      className="sg-section"
      role={titleId ? 'region' : undefined}
      aria-labelledby={titleId}
    >
      {hasHead ? (
        <div className="sg-section-head">
          <div>
            {title ? (
              <div className="sg-section-title" id={titleId}>
                {title}
              </div>
            ) : null}
            {sub ? <div className="sg-section-sub">{sub}</div> : null}
          </div>
          {action}
        </div>
      ) : null}
      <div className="sg-section-body">{children}</div>
      {foot ? <div className="sg-section-foot">{foot}</div> : null}
    </div>
  );
}

export default Section;
