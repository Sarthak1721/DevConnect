'use client';

import { type ComponentProps, type ReactNode, useState } from 'react';
import { TextField } from './text-field';

type PasswordFieldProps = Omit<ComponentProps<'input'>, 'type'> & {
  label: string;
  hint?: ReactNode;
  error?: string;
};

/**
 * A password input with a "Show" toggle. Long passwords (15+ characters) are easy to mistype
 * when hidden, and NIST SP 800-63B recommends offering this. Pasting is allowed (it's what
 * password managers do).
 */
export function PasswordField(props: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <TextField
      {...props}
      type={visible ? 'text' : 'password'}
      // Keeps keyboards from "correcting" a visible password.
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((shown) => !shown)}
          aria-pressed={visible}
          className="shrink-0 px-3 py-2 text-sm text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      }
    />
  );
}
