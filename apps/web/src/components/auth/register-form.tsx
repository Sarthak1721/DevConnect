'use client';

import {
  countCharacters,
  PASSWORD_MIN_LENGTH,
  type RegisterRequest,
  registerRequestSchema,
} from '@devconnect/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useForm, useWatch } from 'react-hook-form';
import { PasswordField } from '@/components/ui/password-field';
import { TextField } from '@/components/ui/text-field';
import { useRedirectWhenSignedIn } from '@/hooks/use-redirect-when-signed-in';
import { register as registerAccount } from '@/lib/auth';
import { showApiError } from '@/lib/form-errors';

export function RegisterForm() {
  useRedirectWhenSignedIn();

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterRequest>({
    resolver: zodResolver(registerRequestSchema),
    mode: 'onTouched',
    defaultValues: { name: '', username: '', email: '', password: '' },
  });

  // Live previews: the profile address and the password length, as the user types.
  const [username, password] = useWatch({ control, name: ['username', 'password'] });
  const handle = username.trim().toLowerCase() || 'your-username';
  const passwordLength = countCharacters(password.normalize('NFKC'));

  const onSubmit = handleSubmit(async (account) => {
    try {
      await registerAccount(account);
    } catch (error) {
      showApiError(error, setError, ['name', 'username', 'email', 'password']);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <TextField
        label="Name"
        autoComplete="name"
        error={errors.name?.message}
        {...register('name')}
      />
      <TextField
        label="Username"
        // The public handle (/u/<username>), not what you sign in with: "nickname" keeps password
        // managers from saving it as the login name.
        autoComplete="nickname"
        autoCapitalize="none"
        spellCheck={false}
        hint={
          <>
            Your profile: <span className="font-mono text-ink">/u/{handle}</span>
          </>
        }
        error={errors.username?.message}
        {...register('username')}
      />
      <TextField
        label="Email"
        type="email"
        // The sign-in name: password managers save this one together with the new password.
        autoComplete="username"
        error={errors.email?.message}
        {...register('email')}
      />
      <PasswordField
        label="Password"
        autoComplete="new-password"
        hint={
          <>
            At least {PASSWORD_MIN_LENGTH} characters ({passwordLength} so far). A few unrelated
            words, like a short sentence, are long and easy to remember. Symbols are optional.
          </>
        }
        error={errors.password?.message}
        {...register('password')}
      />

      {errors.root?.server && (
        <p role="alert" className="rounded-md border border-danger px-3 py-2 text-sm text-danger">
          {errors.root.server.message}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-md bg-accent px-4 py-2 font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
      >
        {isSubmitting ? 'Creating your account…' : 'Create account'}
      </button>

      <p className="text-center text-sm text-muted">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-ink underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </form>
  );
}
