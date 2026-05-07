import React, { useId } from 'react';
import { useFormContext, Controller } from 'react-hook-form';
import Input from './Input';

export interface FieldProps {
  name: string;
  label: string;
  hint?: string;
  required?: boolean;
  type?: string;
  schema?: unknown; // z.ZodTypeAny — kept loose to avoid hard zod dep in props
}

function Field({ name, label, hint, required = false, type = 'text' }: FieldProps) {
  const { control, formState } = useFormContext();
  const uid = useId();
  // Sanitise the React useId() value for use as a CSS-selector-safe id
  const inputId = 'field-' + uid.replace(/[^a-zA-Z0-9-_]/g, '');
  const errorId = inputId + '-error';
  const hintId = inputId + '-hint';

  const error = formState.errors[name];
  const errorMessage = error?.message as string | undefined;

  const hasError = Boolean(errorMessage);

  return (
    <div>
      {/* Label row */}
      <label htmlFor={inputId}>
        {label}
        {required && (
          <span aria-label="required" tabIndex={-1}>
            *
          </span>
        )}
      </label>

      {/* Input wrapper */}
      <Controller
        name={name}
        control={control}
        render={({ field }) => (
          <Input
            {...field}
            id={inputId}
            type={type}
            aria-invalid={hasError ? 'true' : undefined}
            aria-describedby={hasError ? errorId : hint ? hintId : undefined}
          />
        )}
      />

      {/* Error (replaces hint) or hint */}
      {hasError ? (
        <span id={errorId} role="alert">
          {errorMessage}
        </span>
      ) : hint ? (
        <span id={hintId}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export default Field;
