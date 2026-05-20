import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { cookies } from 'next/headers';
import Script from 'next/script';
import './globals.css';
import { I18nProvider } from '../lib/i18n/provider';
import LanguageSwitcher from '../components/LanguageSwitcher';
import PWARegistration from '../components/PWARegistration';
import { ThemeProvider } from '../lib/theme/provider';
import { AppTheme, DEFAULT_THEME, THEME_STORAGE_KEY } from '../lib/theme/config';

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
  icons: {
    icon: [
      { url: '/favicon.png', type: 'image/png', sizes: '48x48' },
      { url: '/icons/icon-192x192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icons/icon-512x512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: [{ url: '/icons/icon-180x180.png', type: 'image/png', sizes: '180x180' }],
  },
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
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0d1117' },
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
  ],
  width: 'device-width',
  initialScale: 1,
};

const themeInitScript = `
(() => {
  try {
    const key = '${THEME_STORAGE_KEY}';
    const saved = window.localStorage.getItem(key);
    const cookieMatch = document.cookie.match(new RegExp('(?:^|; )' + key + '=(dark|light)'));
    const cookieTheme = cookieMatch ? cookieMatch[1] : null;
    const theme = saved === 'dark' || saved === 'light'
      ? saved
      : (cookieTheme === 'dark' || cookieTheme === 'light')
        ? cookieTheme
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', theme === 'dark' ? '#0d1117' : '#f8fafc');
    }
  } catch {}
  document.documentElement.classList.remove('theme-pending');
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = cookies();
  const cookieTheme = cookieStore.get(THEME_STORAGE_KEY)?.value;
  const initialTheme: AppTheme =
    cookieTheme === 'dark' || cookieTheme === 'light' ? cookieTheme : DEFAULT_THEME;

  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} theme-pending`}
      data-theme={initialTheme}
      suppressHydrationWarning
    >
      <body className="bg-slate-950 text-slate-100 antialiased min-h-screen">
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        <ThemeProvider>
          <I18nProvider>
            <PWARegistration />
            {children}
            <LanguageSwitcher />
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
