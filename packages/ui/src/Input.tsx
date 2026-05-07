import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>((props, ref) => (
  <span data-slot="input" style={{ display: 'contents' }}>
    <input ref={ref} {...props} />
  </span>
));

Input.displayName = 'Input';
export default Input;
