/**
 * A2 — smoke test for the shared settings design-system primitives.
 * Source of truth: prototypes/design/Monopilot Design System/settings/shell.jsx:61-105
 *
 * Asserts the primitives emit the exact `.sg-*` class names the ported CSS (A1)
 * targets, plus the section a11y wiring (role=region + aria-labelledby).
 */
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Section } from './Section';
import { SRow } from './SRow';

describe('Section', () => {
  it('renders the prototype sg-section structure with a labelled region', () => {
    const { container } = render(
      <Section title="Identity" sub="How the org appears" foot={<button>Save</button>}>
        <div data-testid="body-child">body</div>
      </Section>,
    );

    const section = container.querySelector('.sg-section');
    expect(section).toBeInTheDocument();
    expect(section).toHaveAttribute('role', 'region');

    const head = container.querySelector('.sg-section-head');
    expect(head).toBeInTheDocument();

    const title = container.querySelector('.sg-section-title');
    expect(title).toHaveTextContent('Identity');
    // aria-labelledby points at the rendered title id
    expect(section?.getAttribute('aria-labelledby')).toBe(title?.id);
    expect(section).toHaveAccessibleName('Identity');

    expect(container.querySelector('.sg-section-sub')).toHaveTextContent('How the org appears');
    expect(container.querySelector('.sg-section-body')).toContainElement(
      screen.getByTestId('body-child'),
    );
    expect(container.querySelector('.sg-section-foot')).toHaveTextContent('Save');
  });

  it('omits the head and region role when no title/action is given', () => {
    const { container } = render(
      <Section>
        <div>plain</div>
      </Section>,
    );

    expect(container.querySelector('.sg-section-head')).toBeNull();
    expect(container.querySelector('.sg-section')).not.toHaveAttribute('role');
    expect(container.querySelector('.sg-section-body')).toHaveTextContent('plain');
  });
});

describe('SRow', () => {
  it('renders the prototype sg-row two-column structure', () => {
    const { container } = render(
      <SRow label="Trading name" hint="Shown in reports">
        <input data-testid="field-control" />
      </SRow>,
    );

    expect(container.querySelector('.sg-row')).toBeInTheDocument();
    expect(container.querySelector('.sg-label')).toHaveTextContent('Trading name');
    expect(container.querySelector('.sg-hint')).toHaveTextContent('Shown in reports');
    expect(container.querySelector('.sg-field')).toContainElement(
      screen.getByTestId('field-control'),
    );
  });

  it('associates the label with the field via htmlFor', () => {
    render(
      <SRow label="Email" htmlFor="email-input">
        <input id="email-input" />
      </SRow>,
    );

    // getByLabelText resolves the <label htmlFor> -> control association
    expect(screen.getByLabelText('Email')).toBe(document.getElementById('email-input'));
  });
});
