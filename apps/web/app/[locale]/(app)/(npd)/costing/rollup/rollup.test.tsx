import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RollupTable } from './_components/rollup-table';

describe('RollupTable', () => {
  it('renders an empty state for no rows', () => {
    render(<RollupTable rows={[]} />);

    expect(screen.getByText('No costing roll-up data yet')).toBeInTheDocument();
    expect(screen.getByLabelText('Costing roll-up empty state')).toBeInTheDocument();
  });

  it('renders rows with costing data', () => {
    render(
      <RollupTable
        rows={[
          {
            projectCode: 'NPD-001',
            name: 'Smoked Sausage',
            totalCost: 4.25,
            targetPrice: 6.5,
            margin: 34.6154,
          },
        ]}
      />,
    );

    expect(screen.getByText('Project Code')).toBeInTheDocument();
    expect(screen.getByText('NPD-001')).toBeInTheDocument();
    expect(screen.getByText('Smoked Sausage')).toBeInTheDocument();
    expect(screen.getByText('4.25')).toBeInTheDocument();
    expect(screen.getByText('6.50')).toBeInTheDocument();
    expect(screen.getByText('34.6%')).toBeInTheDocument();
  });
});
