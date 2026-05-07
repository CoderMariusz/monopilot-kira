import React from 'react';

/**
 * Minimal shadcn-style Textarea wrapper.
 * Renders a <div data-slot="textarea"> container around a <textarea>.
 * The data-slot attribute is the marker that tests (and shadcn-compatible
 * tooling) walk for to confirm the raw <textarea> is wrapped.
 */
export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <div data-slot="textarea">
        <textarea ref={ref} className={className} {...props} />
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

export default Textarea;
