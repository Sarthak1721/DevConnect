import type { Metadata } from 'next';
import { SessionRestorer } from '@/components/auth/session-restorer';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'DevConnect', template: '%s · DevConnect' },
  description:
    'A home for developers: your profile, your GitHub projects and a feed of what you are building.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        {/* Turns the refresh cookie back into a session on every page load (lib/session.ts). */}
        <SessionRestorer />
        {children}
      </body>
    </html>
  );
}
