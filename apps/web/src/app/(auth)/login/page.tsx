import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
      <LoginForm />
    </>
  );
}
