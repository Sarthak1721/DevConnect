import { type ComponentProps, type ReactNode, useId } from 'react';

type TextFieldProps = ComponentProps<'input'> & {
  label: string;
  /** Help shown under the field, always. */
  hint?: ReactNode;
  /** Validation message; also marks the input invalid for screen readers. */
  error?: string;
  /** Rendered inside the field's frame, after the input (e.g. a "Show password" button). */
  trailing?: ReactNode;
};

/**
 * A labelled input. Accessibility comes from the wiring: the <label> is tied to the input
 * (clicking it focuses the field), and aria-describedby makes screen readers read the hint and
 * the error together with the label.
 */
export function TextField({
  label,
  hint,
  error,
  trailing,
  id,
  className,
  ...input
}: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-medium">
        {label}
      </label>
      <div
        className={`flex items-center rounded-md border bg-surface focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent ${
          error ? 'border-danger' : 'border-line'
        }`}
      >
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={`w-full min-w-0 bg-transparent px-3 py-2 outline-none ${className ?? ''}`}
          {...input}
        />
        {trailing}
      </div>
      {hint && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
