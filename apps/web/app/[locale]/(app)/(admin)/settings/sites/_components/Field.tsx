import React from 'react';

export function Field({
  id,
  label,
  required,
  children,
  requiredLabel,
}: {
  id: string;
  label: string;
  required?: boolean;
  requiredLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="ff">
      <label htmlFor={id}>
        {label}{' '}
        {required ? (
          <span className="req" aria-label={requiredLabel}>
            *
          </span>
        ) : null}
      </label>
      {children}
    </div>
  );
}
