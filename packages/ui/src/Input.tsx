import React from 'react';

import './field-control.css';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

// Checkbox/radio are not text-like controls — they must not get the bordered
// `.mp-field-control` box.
const TOGGLE_TYPES = new Set(['checkbox', 'radio']);

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => {
  const isToggle = type != null && TOGGLE_TYPES.has(type);
  const mergedClassName = isToggle
    ? className
    : ['mp-field-control', className].filter(Boolean).join(' ');
  return (
    <span data-slot="input" style={{ display: 'contents' }}>
      <input ref={ref} type={type} className={mergedClassName} {...props} />
    </span>
  );
});

Input.displayName = 'Input';
export default Input;
