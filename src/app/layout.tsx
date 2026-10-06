import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  // Each page names itself, so several open tabs can be told apart.
  title: { default: 'TRSYP 3.0 — Admin Dashboard', template: '%s · TRSYP Admin' },
  description: 'Admin dashboard for TRSYP 3.0',
};

export const viewport: Viewport = {
  // Lets the phone tab bar reach the screen's bottom edge and pad itself
  // clear of the home indicator (env(safe-area-inset-bottom)).
  viewportFit: 'cover',
  // The browser's own toolbar matches the page instead of flashing white.
  themeColor: '#010008',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Host+Grotesk:wght@300;400;500;600;700;800&family=Orbitron:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
