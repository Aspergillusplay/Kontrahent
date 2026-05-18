import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { I18nProvider } from '../lib/i18n/provider';
import LanguageSwitcher from '../components/LanguageSwitcher';
import PWARegistration from '../components/PWARegistration';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Kontrahent.sk - Business Partner Monitoring',
    template: '%s | Kontrahent.sk',
  },
  description:
    'Track business partner reliability in real time. Instant alerts for tax debt, enforcement actions, and bankruptcy.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Kontrahent',
  },
  openGraph: {
    title: 'Kontrahent.sk',
    description: 'B2B counterparty monitoring for the Slovak market',
    locale: 'en_US',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#0d1117',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-slate-950 text-slate-100 antialiased min-h-screen">
        <I18nProvider>
          <PWARegistration />
          {children}
          <LanguageSwitcher />
        </I18nProvider>
      </body>
    </html>
  );
}
