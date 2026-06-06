import React from 'react';

import './field-control.css';

/**
 * Minimal shadcn-style Textarea wrapper.
 * Renders a <div data-slot="textarea"> container around a <textarea>.
 * The data-slot attribute is the marker that tests (and shadcn-compatible
 * tooling) walk for to confirm the raw <textarea> is wrapped.
 *
 * The raw <textarea> carries `.mp-field-control` (border/padding/focus per the
 * components.html `.form-input` spec), merged with any caller className.
 */
export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    const mergedClassName = ['mp-field-control', className].filter(Boolean).join(' ');
    return (
      <div data-slot="textarea">
        <textarea ref={ref} className={mergedClassName} {...props} />
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

export default Textarea;
