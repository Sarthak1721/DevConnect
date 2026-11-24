'use client';

import { type LoginRequest, loginRequestSchema } from '@devconnect/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { PasswordField } from '@/components/ui/password-field';
import { TextField } from '@/components/ui/text-field';
import { useRedirectWhenSignedIn } from '@/hooks/use-redirect-when-signed-in';
import { login } from '@/lib/auth';
import { showApiError } from '@/lib/form-errors';

/**
 * Validated in the browser with the same Zod schema the API uses (instant feedback), then by the
 * API again (the check that counts: anyone can skip the browser and call the API directly).
 */
export function LoginForm() {
  // Once signed in, this page has nothing to do: go where the user was heading.
  useRedirectWhenSignedIn();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginRequest>({
    resolver: zodResolver(loginRequestSchema),
    mode: 'onTouched', // validate a field when it loses focus, then as it's corrected
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (credentials) => {
    try {
      await login(credentials); // success updates the session; the hook above navigates
    } catch (error) {
      showApiError(error, setError, ['email', 'password']);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <TextField
        label="Email"
        type="email"
        // "username" tells password managers this is the account's sign-in name (ours is the
        // email), so they save and fill the email here rather than the public handle.
        autoComplete="username"
        error={errors.email?.message}
        {...register('email')}
      />
      <PasswordField
        label="Password"
        autoComplete="current-password"
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
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </button>

      <p className="text-center text-sm text-muted">
        New to DevConnect?{' '}
        <Link href="/register" className="font-medium text-ink underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </form>
  );
}
