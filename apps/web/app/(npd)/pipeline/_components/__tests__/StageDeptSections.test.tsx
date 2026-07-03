/**
 * @vitest-environment jsdom
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StageDeptSections, type StageDeptSectionLabels } from '../StageDeptSections';
import type { StageDeptSectionsResult } from '../../_actions/load-stage-dept-sections.types';

const saveStageDeptField = vi.fn().mockResolvedValue(undefined);

vi.mock('../../_actions/save-stage-dept-field', () => ({
  saveStageDeptField: (...args: unknown[]) => saveStageDeptField(...args),
}));

vi.mock('../StageDeptCloseButton', () => ({
  StageDeptCloseButton: () => null,
}));

const LABELS: StageDeptSectionLabels = {
  noFgLinked: 'lbl.noFgLinked',
  readOnly: 'lbl.readOnly',
  save: 'lbl.save',
  saved: 'lbl.saved',
  saveFailed: 'lbl.saveFailed',
  selectPlaceholder: 'lbl.selectPlaceholder',
  booleanYes: 'lbl.booleanYes',
  booleanNo: 'lbl.booleanNo',
};

const baseData: StageDeptSectionsResult = {
  ok: true,
  projectId: '11111111-1111-4111-8111-111111111111',
  stage: 'brief',
  productCode: null,
  no_fg_linked: true,
  sections: [
    {
      key: 'core',
      label: 'Core',
      deptCode: 'Core',
      closeDeptValue: 'Core',
      readOnly: false,
      no_fg_linked: true,
      fields: [
        {
          code: 'product_name',
          label: 'Product name',
          dataType: 'text',
          required: true,
          deptCode: 'Core',
          displayOrder: 10,
          value: '',
          readOnly: false,
        },
        {
          code: 'is_vegan',
          label: 'Vegan',
          dataType: 'boolean',
          required: false,
          deptCode: 'Core',
          displayOrder: 20,
          value: null,
          readOnly: false,
        },
      ],
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('StageDeptSections', () => {
  it('shows a neutral informational banner from labels when no_fg_linked', () => {
    render(
      <StageDeptSections
        projectId={baseData.projectId}
        stage="brief"
        data={baseData}
        labels={LABELS}
      />,
    );

    const banner = screen.getByTestId('stage-dept-no-fg-linked-banner');
    expect(banner).toHaveAttribute('role', 'note');
    expect(banner).toHaveTextContent('lbl.noFgLinked');
    expect(banner.className).toMatch(/slate/);
    expect(banner.className).not.toMatch(/amber/);
  });

  it('keeps fields editable when no_fg_linked and section.readOnly is false', () => {
    render(
      <StageDeptSections
        projectId={baseData.projectId}
        stage="brief"
        data={baseData}
        labels={LABELS}
      />,
    );

    const section = screen.getByTestId('stage-dept-section-core');
    expect(within(section).queryByText('lbl.readOnly')).not.toBeInTheDocument();
    const productRow = section.querySelector('[data-field="product_name"]')?.parentElement as HTMLElement;
    const input = within(productRow).getByRole('textbox');
    expect(input).not.toHaveAttribute('readonly');
    expect(within(productRow).getByRole('button', { name: 'lbl.save' })).toBeInTheDocument();
  });

  it('threads labels through save feedback and boolean options', async () => {
    const user = userEvent.setup();
    render(
      <StageDeptSections
        projectId={baseData.projectId}
        stage="brief"
        data={baseData}
        labels={LABELS}
      />,
    );

    const section = screen.getByTestId('stage-dept-section-core');
    const productRow = section.querySelector('[data-field="product_name"]')?.parentElement as HTMLElement;
    const input = within(productRow).getByRole('textbox');
    await user.type(input, 'Pie');
    await user.click(within(productRow).getByRole('button', { name: 'lbl.save' }));

    expect(saveStageDeptField).toHaveBeenCalledWith({
      projectId: baseData.projectId,
      productCode: null,
      fieldCode: 'product_name',
      value: 'Pie',
    });
    expect(await screen.findByText('lbl.saved')).toBeInTheDocument();
  });

  it('shows read-only chip and hides save when section.readOnly is true', () => {
    const readOnlyData: StageDeptSectionsResult = {
      ...baseData,
      no_fg_linked: undefined,
      sections: [
        {
          ...baseData.sections[0]!,
          readOnly: true,
          fields: baseData.sections[0]!.fields.map((field) => ({ ...field, readOnly: true })),
        },
      ],
    };

    render(
      <StageDeptSections
        projectId={readOnlyData.projectId}
        stage="brief"
        data={readOnlyData}
        labels={LABELS}
      />,
    );

    expect(screen.getByText('lbl.readOnly')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'lbl.save' })).not.toBeInTheDocument();
  });
});
