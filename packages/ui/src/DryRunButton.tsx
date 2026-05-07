import React, { useId } from 'react';
import { Button, ButtonProps } from './Button';

export interface DryRunButtonProps extends Omit<ButtonProps, 'variant'> {
  children?: React.ReactNode;
}

export function DryRunButton({ children = 'Dry Run', ...props }: DryRunButtonProps) {
  const tooltipId = useId().replace(/[^a-zA-Z0-9-_]/g, '') + '-dry-run-tooltip';

  return (
    <>
      <Button variant="dry-run" aria-describedby={tooltipId} {...props}>
        {children}
      </Button>
      <span
        id={tooltipId}
        role="tooltip"
        style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }}
      >
        Preview only — no changes saved
      </span>
    </>
  );
}
