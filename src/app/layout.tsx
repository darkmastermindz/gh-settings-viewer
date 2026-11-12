import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { JumpBox } from '../components/JumpBox.tsx';
import { OfflineBanner } from '../components/OfflineBanner.tsx';
import { RefreshCapabilities } from '../components/RefreshCapabilities.tsx';
import { jumpEntries } from '../server/nav.ts';
import { loadContext } from '../server/page-context.ts';
import './globals.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { default: 'GitHub settings viewer', template: '%s · GitHub settings viewer' },
  description: 'Read-only view of GitHub enterprise, organization and repository settings.',
  applicationName: 'GH Settings',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icons/icon.svg', apple: '/icons/icon-192.png' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0d1117' },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const ctx = await loadContext();
  const entries = ctx.ok ? jumpEntries(ctx.caps) : [];
  return (
    <html lang="en">
      <body className="min-h-dvh font-sans antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-canvas focus:px-3 focus:py-2">
          Skip to content
        </a>
        <OfflineBanner />
        <header className="border-b border-border bg-subtle">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
            <Link href="/" className="mr-2 flex items-center gap-2 font-semibold text-fg no-underline">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/icon.svg" alt="" width={24} height={24} />
              GH Settings
            </Link>
            {ctx.ok ? <JumpBox entries={entries} /> : null}
            <nav aria-label="Tools" className="ml-auto flex flex-wrap items-center gap-3 text-sm">
              {ctx.ok ? (
                <>
                  <Link href="/compare">Compare</Link>
                  <Link href="/diagnostics">App &amp; permissions</Link>
                  <RefreshCapabilities />
                </>
              ) : null}
            </nav>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-7xl px-4 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
